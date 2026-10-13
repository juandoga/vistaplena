// Vista Plena — verificar: una IA barata decide si cada titular nuevo (y cada dudoso) cuenta el mismo hecho que su noticia.
//
// La revisión por palabras (recoger?fase=depurar&marcar=1, cada hora) deja en «historias_dudosas» los titulares que
// quizá no encajan. Esta función le pregunta a un modelo de lenguaje, noticia a noticia: «¿estos titulares cuentan el
// mismo hecho que estos otros?». La IA solo contesta «mismo» u «otro»: nunca escribe nada que se publique.
//
//   ajustes.ia_modelo              modelo de Google Gemini (por defecto gemini-3.1-flash-lite)
//   ajustes.ia_auto                'true' = si dice «otro», el titular sale de la noticia (y no vuelve);
//                                  'false' = solo apunta su respuesta y la gestión la muestra (periodo de prueba)
//   ajustes.ia_tope_llamadas_dia   tope de consultas al día (para que un fallo no dispare el gasto)
//   Secreto GEMINI_API_KEY         clave de Google AI Studio. Sin ella la función no hace nada.
//   Tabla ia_uso                   consultas y tokens de cada día (para saber lo que cuesta)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CLAVE = Deno.env.get("GEMINI_API_KEY") ?? "";

// Solo las tareas programadas pueden ejecutar esta función (cabecera x-interna con la clave interna)
async function esInterna(req: Request): Promise<boolean> {
  const v = req.headers.get("x-interna") ?? "";
  if (!v) return false;
  const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data } = await db.from("ajustes").select("valor").eq("nombre", "clave_interna_sha256").maybeSingle();
  return !!data?.valor && data.valor === h;
}
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d, null, 1), { status, headers: { "Content-Type": "application/json" } });
const ajuste = async (n: string) => (await db.from("ajustes").select("valor").eq("nombre", n).maybeSingle()).data?.valor ?? null;

const INSTRUCCIONES = `Eres el verificador de un agregador de noticias. Te doy los titulares que definen una noticia (un hecho concreto) y unos titulares candidatos, marcados con letras.
Para cada candidato decide:
- "mismo": informa del MISMO hecho concreto (el mismo suceso, anuncio, decisión o dato), aunque lo cuente con otro enfoque, con otra fase del mismo hecho, con una reacción directa a él o con cifras actualizadas (más muertos, otro recuento): una cifra distinta no hace que sea otro hecho.
- "otro": informa de un hecho distinto, aunque comparta tema, lugar, personas o palabras (por ejemplo, otra huelga, otro partido, otra sentencia u otro día).
Responde solo con JSON, una clave por letra: {"A":"mismo","B":"otro"}.`;

// Llamada genérica a Gemini: devuelve el JSON que conteste
// La versión gratuita de Gemini admite unas 15 consultas por minuto: se deja al menos 4,2 s entre una y otra
let ultimaLlamada = 0;
async function gemini(modelo: string, sistema: string, texto: string): Promise<Record<string, string>> {
  const espera = ultimaLlamada + 4200 - Date.now();
  if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
  ultimaLlamada = Date.now();
  const config: Record<string, unknown> = { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 600 };
  // Que no «piense» antes de contestar: no hace falta para estas preguntas y se cobraría
  if (modelo.startsWith("gemini-2.5")) config.thinkingConfig = { thinkingBudget: 0 };
  else if (modelo.startsWith("gemini-3")) config.thinkingConfig = { thinkingLevel: "minimal" };
  const llamada = (cfg: Record<string, unknown>) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": CLAVE, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: "user", parts: [{ text: texto }] }], generationConfig: cfg }),
  });
  let r = await llamada(config);
  // Gemini a veces responde 503 («mucha demanda»): se reintenta una vez
  if (r.status === 503) { await new Promise((ok) => setTimeout(ok, 3000)); r = await llamada(config); }
  // Si el modelo no admite ese ajuste de «pensar», se repite sin él
  if (r.status === 400 && config.thinkingConfig) { const { thinkingConfig: _, ...sin } = config; r = await llamada(sin); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  const u = d.usageMetadata ?? {};
  await db.rpc("sumar_ia_uso", { e: u.promptTokenCount ?? 0, s: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) });
  try { return JSON.parse(d.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") || "{}"); } catch { return {}; }
}

async function preguntar(modelo: string, referencia: string[], candidatos: string[]) {
  const letras = candidatos.map((_, i) => String.fromCharCode(65 + i));
  const texto = `Titulares de la noticia:\n${referencia.map((t) => `- ${t}`).join("\n")}\n\nCandidatos:\n${candidatos.map((t, i) => `${letras[i]}) ${t}`).join("\n")}`;
  const salida = await gemini(modelo, INSTRUCCIONES, texto);
  return letras.map((l) => (salida[l] === "otro" ? "otro" : salida[l] === "mismo" ? "mismo" : "error"));
}

const REPETIDAS = `Eres el editor de un agregador de noticias. Te doy pares de noticias (cada una con su título). Para cada par decide:
- "misma": las dos cuentan exactamente el mismo hecho concreto (el mismo anuncio, suceso, decisión o dato), aunque con distintas palabras o cifras actualizadas.
- "distinta": cuentan hechos distintos, aunque estén relacionados (un hecho y su reacción posterior, una fase siguiente, otro día, otra declaración, otro lugar).
Responde solo con JSON, una clave por número de par: {"1":"misma","2":"distinta"}.`;

const TIPO = `Eres el editor de una web que compara cómo cuentan los medios los asuntos públicos (política, economía, trabajo, vivienda, sanidad, educación, justicia, sociedad, internacional, ciencia, medio ambiente, catástrofes y sucesos graves con relevancia pública).
Para cada noticia (por su título) decide:
- "publica": es un asunto público de ese tipo.
- "ligera": es deporte, famosos o prensa del corazón, cine, series, música o espectáculos, ocio y planes, horarios o festivos o compras, sorteos, previsión del tiempo corriente, curiosidades, o un suceso sin dimensión pública (un accidente aislado, una detención de un famoso). Si una de estas noticias tiene dimensión política o pública clara (una ley, una decisión de gobierno, un juicio, dinero público), es "publica".
Responde solo con JSON, una clave por número: {"1":"publica","2":"ligera"}.`;

Deno.serve(async (req) => {
  if (!(await esInterna(req))) return json({ error: "Solo para tareas internas" }, 401);
  if (!CLAVE) return json({ ok: true, hecho: 0, motivo: "Falta el secreto GEMINI_API_KEY" });
  const modelo = (await ajuste("ia_modelo")) || "gemini-3.1-flash-lite";
  const auto = (await ajuste("ia_auto")) === "true";
  const tope = Number(await ajuste("ia_tope_llamadas_dia")) || 300;
  const { data: uso } = await db.from("ia_uso").select("llamadas").eq("dia", new Date().toISOString().slice(0, 10)).maybeSingle();
  let quedan = tope - (uso?.llamadas ?? 0);
  if (quedan <= 0) return json({ ok: true, hecho: 0, motivo: `Tope diario alcanzado (${tope} consultas)` });

  // Qué revisar, noticia a noticia:
  //  - los titulares dudosos (marcados por la revisión por palabras) sin respuesta de la IA ni decisión humana;
  //  - los titulares que han entrado en una noticia de 4 o más y la IA aún no ha mirado (articulos.ia_revisado).
  const desde = new Date(Date.now() - 3 * 864e5).toISOString();
  const { data: ds } = await db.from("historias_dudosas").select("articulo_id, historia_id").is("ia", null).is("decision", null).gt("creado", desde).limit(1000);
  const { data: nuevos } = await db.from("articulos").select("id, historia_id").is("ia_revisado", null).not("historia_id", "is", null).gt("publicado", new Date(Date.now() - 864e5).toISOString()).limit(3000);
  const porH = new Map<number, Set<number>>();
  for (const d of [...(ds ?? []).map((x) => ({ id: x.articulo_id, h: x.historia_id })), ...(nuevos ?? []).map((x) => ({ id: x.id, h: x.historia_id }))]) {
    if (!porH.has(d.h)) porH.set(d.h, new Set());
    porH.get(d.h)!.add(d.id);
  }
  const dudosoSet = new Set((ds ?? []).map((x) => x.articulo_id));
  const informe: any[] = [];
  let sacados = 0, revisados = 0;
  const inicio = Date.now();
  for (const [hid, pend] of porH) {
    if (quedan <= 0 || Date.now() - inicio > 60e3) break; // lo que no dé tiempo, en la siguiente hora
    const { data: h } = await db.from("historias").select("titulo").eq("id", hid).maybeSingle();
    const { data: arts } = await db.from("articulos").select("id, titulo, medio_id, ia_revisado, publicado").eq("historia_id", hid).order("publicado").limit(300);
    if (!h || !arts?.length) continue;
    const marcarVistos = async (ids: number[]) => { if (ids.length) await db.from("articulos").update({ ia_revisado: true }).in("id", ids); };
    // Noticias pequeñas: no se pregunta (con 2 o 3 titulares el agrupador ya exige que se parezcan mucho)
    if (arts.length < 4) { await marcarVistos(arts.filter((a) => pend.has(a.id) && !dudosoSet.has(a.id)).map((a) => a.id)); continue; }
    // Referencia: el título de la noticia y hasta 5 titulares ya revisados (o, en una noticia nueva, los primeros), de medios distintos
    const enDuda = (a: any) => pend.has(a.id);
    let base = arts.filter((a) => !enDuda(a) && a.ia_revisado);
    if (base.length < 2) base = arts.filter((a) => !dudosoSet.has(a.id)).slice(0, 3); // noticia nueva: los primeros titulares definen el hecho
    const ref = [h.titulo], refIds: number[] = [], vistos = new Set<number>();
    for (const a of base) if (!vistos.has(a.medio_id) && a.titulo !== h.titulo && ref.length < 6) { ref.push(a.titulo); refIds.push(a.id); vistos.add(a.medio_id); }
    if (ref.length < 3) continue;
    await marcarVistos(refIds.filter((id) => pend.has(id)));
    const cola = arts.filter((a) => enDuda(a) && !refIds.includes(a.id));
    for (let i = 0; i < cola.length && quedan > 0; i += 12) {
      const cand = cola.slice(i, i + 12);
      quedan--;
      let res: string[];
      try { res = await preguntar(modelo, ref, cand.map((a) => a.titulo)); }
      catch (e) { informe.push({ historia: hid, error: String(e).slice(0, 200) }); quedan = 0; break; }
      for (let j = 0; j < cand.length; j++) {
        const a = cand[j], otro = res[j] === "otro";
        revisados++;
        if (dudosoSet.has(a.id)) await db.from("historias_dudosas").update({ ia: res[j], ia_modelo: modelo, ia_fecha: new Date().toISOString() }).eq("articulo_id", a.id);
        else if (otro) await db.from("historias_dudosas").upsert({ articulo_id: a.id, historia_id: hid, motivo: "la IA cree que cuenta otro hecho", ia: "otro", ia_modelo: modelo, ia_fecha: new Date().toISOString() }, { onConflict: "articulo_id" });
        if (auto && otro) {
          await db.from("articulos").update({ historia_id: null, ia_revisado: true }).eq("id", a.id).eq("historia_id", hid);
          await db.from("historia_vetos").upsert({ articulo_id: a.id, historia_id: hid }, { onConflict: "articulo_id,historia_id", ignoreDuplicates: true });
          await db.from("historias_dudosas").update({ decision: "sacar" }).eq("articulo_id", a.id);
          sacados++;
        } else if (res[j] !== "error") await marcarVistos([a.id]);
      }
      informe.push({ historia: hid, titulo: h.titulo, respuestas: cand.map((a, j) => `${res[j]} · ${a.titulo}`).filter((x) => x.startsWith("otro")) });
    }
  }
  // Fase 2: noticias repetidas (dos noticias del mismo hecho que no se juntaron). Se juntan en la que tiene más medios.
  let juntadas = 0;
  const destino = new Map<number, number>(); // noticia que ya se juntó en otra → la otra
  const final = (id: number): number => destino.has(id) ? final(destino.get(id)!) : id;
  const { data: pares } = await db.rpc("pares_parecidos");
  for (let i = 0; i < (pares ?? []).length && quedan > 0 && Date.now() - inicio < 85e3; i += 15) {
    const lote = pares!.slice(i, i + 15);
    quedan--;
    let res: Record<string, string>;
    try { res = await gemini(modelo, REPETIDAS, lote.map((p: any, j: number) => `${j + 1}) A: ${p.ta}\n   B: ${p.tb}`).join("\n")); } catch (e) { informe.push({ error: String(e).slice(0, 200) }); break; }
    for (let j = 0; j < lote.length; j++) {
      const p = lote[j], misma = res[String(j + 1)] === "misma";
      await db.from("historias_pares").upsert({ a: p.a, b: p.b, resultado: misma ? "misma" : "distinta" }, { onConflict: "a,b" });
      if (misma && auto) {
        const [q0, s0] = p.na >= p.nb ? [p.a, p.b] : [p.b, p.a];
        const queda = final(q0), sale = final(s0);
        if (queda === sale) continue;
        destino.set(sale, queda);
        await db.from("articulos").update({ historia_id: queda }).eq("historia_id", sale);
        await db.from("historias").update({ actualizada: new Date().toISOString() }).eq("id", queda);
        juntadas++;
        informe.push({ juntadas: `${p.ta}  ⟵  ${p.tb}` });
      }
    }
  }
  // Fase 3: asuntos públicos o noticias ligeras (deportes, famosos, ocio…). Las ligeras no salen en la web.
  let ligeras = 0;
  const { data: vis } = await db.from("portada_m").select("id").gt("actualizada", new Date(Date.now() - 2 * 864e5).toISOString()).limit(1000);
  const { data: sinTipo } = (vis ?? []).length ? await db.from("historias").select("id, titulo").is("ia_tipo", null).in("id", vis!.map((x) => x.id)) : { data: [] as any[] };
  for (let i = 0; i < (sinTipo ?? []).length && quedan > 0 && Date.now() - inicio < 118e3; i += 25) {
    const lote = sinTipo!.slice(i, i + 25);
    quedan--;
    let res: Record<string, string>;
    try { res = await gemini(modelo, TIPO, lote.map((h: any, j: number) => `${j + 1}) ${h.titulo}`).join("\n")); } catch (e) { informe.push({ error: String(e).slice(0, 200) }); break; }
    for (let j = 0; j < lote.length; j++) {
      const t = res[String(j + 1)];
      if (t !== "publica" && t !== "ligera") continue;
      await db.from("historias").update({ ia_tipo: t }).eq("id", lote[j].id);
      if (t === "ligera") { ligeras++; informe.push({ ligera: lote[j].titulo }); }
    }
  }
  if (juntadas || ligeras || sacados) await db.rpc("refrescar_portada");
  return json({ ok: true, modelo, automatico: auto, consultas: informe.length, revisados, sacados, juntadas, ligeras, detalle: informe.filter((x) => !x.respuestas || x.respuestas.length).slice(0, 60) });
});
