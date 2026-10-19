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
- "opinion": es una columna, un editorial o un análisis general (por ejemplo «29-N: ahora o nunca» o «Sánchez y Feijóo encaran su duelo electoral»), no la información de ese hecho concreto.
Cada titular lleva entre corchetes cuándo se publicó: un candidato publicado días antes que la noticia no puede contar ese hecho (cuenta otro).
Responde solo con JSON, una clave por letra: {"A":"mismo","B":"otro","C":"opinion"}.`;
// Fecha corta en hora de Madrid, para que la IA vea si un titular es de otro día («14 oct 21:05»)
const cuando = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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

// referencia y candidatos: «[14 oct 21:05] titular». Respuestas: «mismo», «otro», «opinion» o «error» (sin respuesta válida)
async function preguntar(modelo: string, referencia: string[], candidatos: string[]) {
  const letras = candidatos.map((_, i) => String.fromCharCode(65 + i));
  const texto = `Titulares de la noticia:\n${referencia.map((t) => `- ${t}`).join("\n")}\n\nCandidatos:\n${candidatos.map((t, i) => `${letras[i]}) ${t}`).join("\n")}`;
  const salida = await gemini(modelo, INSTRUCCIONES, texto);
  return letras.map((l) => (["mismo", "otro", "opinion"].includes(salida[l]) ? salida[l] : "error"));
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
    // Noticias de 1 o 2 titulares: no se pregunta
    if (arts.length < 3) { await marcarVistos(arts.filter((a) => pend.has(a.id) && !dudosoSet.has(a.id)).map((a) => a.id)); continue; }
    const enDuda = (a: any) => pend.has(a.id);
    const conFecha = (a: any) => `[${cuando(a.publicado)}] ${a.titulo}`;
    // El título de la noticia lleva la fecha del titular del que sale (o la del primero)
    const delTitulo = arts.find((a) => a.titulo === h.titulo) ?? arts[0];
    const ref = [conFecha({ ...delTitulo, titulo: h.titulo })], refIds: number[] = [];
    if (arts.length === 3) {
      // Noticia de 3 titulares: la referencia es solo el título, y se pregunta por los otros dos
      if (delTitulo.titulo === h.titulo) refIds.push(delTitulo.id);
    } else {
      // Referencia: el título de la noticia y hasta 5 titulares ya revisados (o, en una noticia nueva, los primeros), de medios distintos
      let base = arts.filter((a) => !enDuda(a) && a.ia_revisado);
      if (base.length < 2) base = arts.filter((a) => !dudosoSet.has(a.id)).slice(0, 3); // noticia nueva: los primeros titulares definen el hecho
      const vistos = new Set<number>();
      for (const a of base) if (!vistos.has(a.medio_id) && a.titulo !== h.titulo && ref.length < 6) { ref.push(conFecha(a)); refIds.push(a.id); vistos.add(a.medio_id); }
      if (ref.length < 3) continue;
    }
    await marcarVistos(refIds.filter((id) => pend.has(id) && !dudosoSet.has(id)));
    const cola = arts.filter((a) => enDuda(a) && !refIds.includes(a.id));
    if (!cola.length) continue;
    // Primero se pregunta por todos; después se decide (hace falta ver todas las respuestas para saber si falla el título)
    const resultados: { a: any; r: string }[] = [];
    for (let i = 0; i < cola.length && quedan > 0; i += 12) {
      const cand = cola.slice(i, i + 12);
      quedan--;
      let res: string[];
      try { res = await preguntar(modelo, ref, cand.map(conFecha)); }
      catch (e) { informe.push({ historia: hid, error: String(e).slice(0, 200) }); quedan = 0; break; }
      cand.forEach((a, j) => resultados.push({ a, r: res[j] }));
    }
    // ¿Es el título el que no encaja? Si la IA dice que la mitad o más de los demás titulares de la noticia (y al menos 2)
    // cuentan otra cosa, lo más probable es que el raro sea el titular que da el título («Burnham recibe a Zelenski» en una
    // noticia sobre la cumbre de la UE). Entonces no se saca nada: queda en la gestión para decidirlo a mano.
    const nFuera = resultados.filter((x) => x.r === "otro" || x.r === "opinion").length;
    const tituloRaro = nFuera >= 2 && nFuera * 2 >= arts.length - 1;
    for (const { a, r } of resultados) {
      const otro = r === "otro" || r === "opinion";
      const ia = r === "opinion" ? "otro" : r;
      const motivo = tituloRaro ? "quizá el que no encaja es el título de la noticia" : r === "opinion" ? "la IA cree que es opinión, no información del hecho" : "la IA cree que cuenta otro hecho";
      revisados++;
      if (dudosoSet.has(a.id)) await db.from("historias_dudosas").update({ ia, ia_modelo: modelo, ia_fecha: new Date().toISOString(), ...(otro ? { motivo } : {}) }).eq("articulo_id", a.id);
      else if (otro) await db.from("historias_dudosas").upsert({ articulo_id: a.id, historia_id: hid, motivo, ia: "otro", ia_modelo: modelo, ia_fecha: new Date().toISOString() }, { onConflict: "articulo_id" });
      if (auto && otro && !tituloRaro) {
        await db.from("articulos").update({ historia_id: null, ia_revisado: true }).eq("id", a.id).eq("historia_id", hid);
        await db.from("historia_vetos").upsert({ articulo_id: a.id, historia_id: hid }, { onConflict: "articulo_id,historia_id", ignoreDuplicates: true });
        await db.from("historias_dudosas").update({ decision: "sacar" }).eq("articulo_id", a.id);
        sacados++;
      } else if (r !== "error") await marcarVistos([a.id]);
    }
    if (nFuera) informe.push({ historia: hid, titulo: h.titulo, ...(tituloRaro ? { aviso: "quizá falla el título: no se ha sacado nada" } : {}), respuestas: resultados.filter((x) => x.r === "otro" || x.r === "opinion").map((x) => `${x.r} · ${x.a.titulo}`) });
  }
  // Fase 2: noticias repetidas (dos noticias del mismo hecho que no se juntaron). Se juntan en la que tiene más medios.
  // No se juntan noticias creadas con más de 24 horas de diferencia: serían otra fase u otro día (y así no se cuela
  // un titular de hace dos días en una noticia nueva).
  let juntadas = 0;
  const destino = new Map<number, number>(); // noticia que ya se juntó en otra → la otra
  const final = (id: number): number => destino.has(id) ? final(destino.get(id)!) : id;
  const { data: todos } = await db.rpc("pares_parecidos");
  const idsPares = [...new Set((todos ?? []).flatMap((p: any) => [p.a, p.b]))];
  const { data: fechas } = idsPares.length ? await db.from("historias").select("id, creada").in("id", idsPares) : { data: [] as any[] };
  const creada = new Map((fechas ?? []).map((x: any) => [x.id, +new Date(x.creada)]));
  const lejanas = (p: any) => Math.abs((creada.get(p.a) ?? 0) - (creada.get(p.b) ?? 0)) > 864e5;
  for (const p of (todos ?? []).filter(lejanas)) await db.from("historias_pares").upsert({ a: p.a, b: p.b, resultado: "distinta" }, { onConflict: "a,b" });
  const pares = (todos ?? []).filter((p: any) => !lejanas(p));
  for (let i = 0; i < pares.length && quedan > 0 && Date.now() - inicio < 85e3; i += 15) {
    const lote = pares.slice(i, i + 15);
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
        // Los titulares vetados en «queda» no pasan (el disparador respetar_vetos los deja sueltos)
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
