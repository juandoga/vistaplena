// Vista Plena — asuntos: el nivel de arriba de los temas (19/10/2026).
//
// Los temas (servidor/temas) se forman por palabras y se parten cuando la noticia cambia de palabras: las protestas en
// Francia empezaron como «huelga», siguieron como «Macron» y luego como «prima de riesgo», y salían tres temas distintos.
// Un ASUNTO reúne todo eso bajo un mismo paraguas. Lo decide una IA barata (Gemini), en tres pasos, cada hora (minuto 18):
//
// 1. Propagar (sin IA): si la mayoría de las noticias de un tema ya están en un asunto, las demás del tema entran también;
//    si una noticia continúa a otra (historias.anterior), va al asunto de aquella. Así el asunto sigue a la noticia
//    aunque cambie de palabras.
// 2. Preguntar antes de crear: las noticias nuevas (3 o más medios, 72 h) se le enseñan a la IA junto a los asuntos
//    abiertos: «¿pertenece a alguno?». Si tres o más noticias comparten un asunto de fondo que aún no existe, lo crea.
// 3. Unir (una vez al día, ?modo=diario): la IA mira los asuntos abiertos y junta los que son el mismo.
//
// Para no crear «megatemas»: nada de categorías («Política», «Elecciones 29N»), mismo lugar y mismo origen, ante la duda
// nada. Todo queda en asuntos_registro y se puede deshacer desde la gestión (deshacer_asunto, sacar_de_asunto), y lo
// deshecho no vuelve (asuntos_vetos).
//
//   ?probar=1         no guarda nada: devuelve lo que haría
//   ?horas=168&lotes=8 primera pasada sobre toda la semana
//   ?modo=diario      además, une asuntos repetidos
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CLAVE = Deno.env.get("GEMINI_API_KEY") ?? "";
const H = 3600e3, LOTE = 30;

async function esInterna(req: Request): Promise<boolean> {
  const v = req.headers.get("x-interna") ?? "";
  if (!v) return false;
  const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data } = await db.from("ajustes").select("valor").eq("nombre", "clave_interna_sha256").maybeSingle();
  return !!data?.valor && data.valor === h;
}
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d, null, 1), { status, headers: { "Content-Type": "application/json" } });
const ajuste = async (n: string) => (await db.from("ajustes").select("valor").eq("nombre", n).maybeSingle()).data?.valor ?? null;
const cuando = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Gemini (versión gratuita: unas 15 consultas por minuto; se dejan 4,2 s entre una y otra)
let ultimaLlamada = 0;
async function gemini(modelo: string, sistema: string, texto: string): Promise<any> {
  const espera = ultimaLlamada + 4200 - Date.now();
  if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
  ultimaLlamada = Date.now();
  const config: Record<string, unknown> = { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 2500 };
  if (modelo.startsWith("gemini-2.5")) config.thinkingConfig = { thinkingBudget: 0 };
  else if (modelo.startsWith("gemini-3")) config.thinkingConfig = { thinkingLevel: "minimal" };
  const llamada = (cfg: Record<string, unknown>) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": CLAVE, "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: "user", parts: [{ text: texto }] }], generationConfig: cfg }),
  });
  let r = await llamada(config);
  if (r.status === 503) { await new Promise((ok) => setTimeout(ok, 3000)); r = await llamada(config); }
  if (r.status === 400 && config.thinkingConfig) { const { thinkingConfig: _, ...sin } = config; r = await llamada(sin); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  const u = d.usageMetadata ?? {};
  await db.rpc("sumar_ia_uso", { e: u.promptTokenCount ?? 0, s: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) });
  try { return JSON.parse(d.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") || "{}"); } catch { return {}; }
}

const AGRUPAR = `Eres el editor de una web española que reúne noticias de muchos medios. Un ASUNTO es una historia de fondo que dura varios días y reúne hechos distintos que nacen del mismo origen. Ejemplo: «Protestas en Francia» reúne las huelgas, los disturbios, las detenciones, el discurso de Macron, la petición de dimisión del ministro del Interior, la subida de la prima de riesgo francesa y las reacciones de otros países a esas protestas.
Te doy los asuntos abiertos (con su código, como A12, y sus últimas noticias) y una lista de noticias numeradas, con su fecha.
1. Para cada noticia, decide si pertenece a uno de los asuntos abiertos.
2. Si 3 o más noticias de la lista comparten un asunto de fondo que todavía no está abierto, crea un asunto nuevo con ellas.
Reglas:
- Un asunto tiene un origen concreto que se explica en una frase (unas protestas, una crisis, un caso judicial, una catástrofe, una negociación, un juicio). Nunca es una categoría ni un área: «Política española», «Economía», «Sucesos», «Tribunales», «Elecciones 29N», «Campaña electoral», «Gobierno de Sánchez» o «Inmigración» no son asuntos.
- Mismo lugar y mismo origen: unas protestas en Italia no son las de Francia aunque se parezcan; una huelga en España no es la de Francia; un crimen no es otro crimen.
- Una noticia va a un asunto solo si quien siga ese asunto esperaría encontrarla allí. Ante la duda, déjala fuera: es mejor una noticia suelta que una noticia donde no va.
- Nombre del asunto nuevo: de 2 a 5 palabras, neutro y descriptivo, sin adjetivos ni juicios («Protestas en Francia», no «Caos en Francia»). Descripción: una frase neutra que diga qué une a esas noticias.
Responde solo con JSON:
{"asignar":{"<número de noticia>":"<código de asunto>"},"nuevos":[{"nombre":"...","descripcion":"...","noticias":[<números>]}]}
Las noticias que no van a ningún asunto no se ponen. Si no hay nada que asignar ni crear: {"asignar":{},"nuevos":[]}.`;

const UNIR = `Eres el editor de una web española que reúne noticias. Te doy los asuntos abiertos: cada uno con su código, su nombre, su descripción y sus últimas noticias.
¿Hay asuntos que en realidad son el MISMO asunto de fondo (el mismo origen y el mismo lugar), partidos en dos? Por ejemplo, «Protestas en Francia» y «Crisis del Gobierno francés por los disturbios» son el mismo; «Protestas en Francia» y «Protestas en Italia» no.
Ante la duda, no los unas.
Si al unir el nombre del primero ya no describe todo, propón un nombre nuevo (2 a 5 palabras, neutro).
Responde solo con JSON: {"unir":[{"asuntos":["A12","A15"],"nombre":"..."}]}. Si no hay que unir nada: {"unir":[]}.`;

// Nombres que son categorías, no asuntos: se rechazan aunque la IA los proponga
const CATEGORIA = /^(la |el )?(pol[ií]tica|econom[ií]a|sucesos|internacional|sociedad|actualidad|tribunales|justicia|cultura|deportes?|inmigraci[oó]n|vivienda|sanidad|educaci[oó]n|gobierno|elecciones|campa[ñn]a)\b|29[ -]?n\b|elecciones generales|campa[ñn]a electoral/i;
const SORTEO = /(loter[ií]a|sorteo|bonoloto|euromillones|la primitiva|el gordo|super ?once|cup[oó]n|cuponazo|eurojackpot|quiniela)/i;

Deno.serve(async (req) => {
  if (!(await esInterna(req))) return json({ error: "Solo para tareas internas" }, 401);
  if (!CLAVE) return json({ ok: true, motivo: "Falta el secreto GEMINI_API_KEY" });
  const url = new URL(req.url);
  const probar = url.searchParams.get("probar") === "1";
  const diario = url.searchParams.get("modo") === "diario";
  const horas = Math.min(168, Number(url.searchParams.get("horas") || 72));
  const lotes = Math.min(10, Number(url.searchParams.get("lotes") || 2));
  const modelo = (await ajuste("ia_modelo")) || "gemini-3.1-flash-lite";
  const ahora = Date.now();

  // Datos: noticias de 3 o más medios de la semana, asuntos abiertos y vetos
  const { data: hs, error } = await db.rpc("historias_para_asuntos", { horas: 168 });
  if (error) return json({ error: error.message }, 500);
  const H_: any[] = (hs ?? []).sort((a: any, b: any) => +new Date(a.creada) - +new Date(b.creada));
  const porId = new Map(H_.map((h) => [h.id, h]));
  const { data: vs } = await db.from("asuntos_vetos").select("historia_id, asunto_id").limit(20000);
  const veto = new Set((vs ?? []).map((v: any) => `${v.historia_id}:${v.asunto_id}`));
  const sinAsunto = new Set((vs ?? []).filter((v: any) => v.asunto_id === 0).map((v: any) => v.historia_id));
  const vetado = (h: number, a: number) => sinAsunto.has(h) || veto.has(`${h}:${a}`);
  const { data: as } = await db.from("asuntos").select("id, nombre, nombre_manual, descripcion").eq("activo", true).eq("oculto", false);
  const asuntos = new Map<number, { id: number; nombre: string; descripcion: string; nuevo?: boolean }>(
    (as ?? []).map((a: any) => [a.id, { id: a.id, nombre: a.nombre_manual || a.nombre, descripcion: a.descripcion ?? "" }]));

  // Lo que cambia en esta pasada: historia → { asunto, por qué }
  const cambios = new Map<number, { a: number; accion: string }>();
  const asuntoDe = (h: any): number | null => cambios.get(h.id)?.a ?? h.asunto_id ?? null;
  const poner = (h: any, a: number, accion: string) => { if (asuntos.has(a) && !vetado(h.id, a) && asuntoDe(h) !== a) cambios.set(h.id, { a, accion }); };
  const informe: any = { modelo, propagadas: 0, preguntadas: 0, asignadas: 0, creados: [], unidos: [], descartados: [], errores: [] };
  let idProvisional = -1;
  const nuevoAsunto = async (nombre: string, descripcion: string) => {
    if (probar) { const id = idProvisional--; asuntos.set(id, { id, nombre, descripcion, nuevo: true }); return id; }
    const { data, error } = await db.from("asuntos").insert({ nombre, descripcion }).select("id").single();
    if (error) throw new Error(error.message);
    asuntos.set(data.id, { id: data.id, nombre, descripcion, nuevo: true });
    return data.id as number;
  };

  // 1. Propagar sin IA
  const propagar = () => {
    let n = 0;
    for (const h of H_) {
      if (asuntoDe(h) || !h.anterior) continue;
      const p = porId.get(h.anterior);
      const a = p && asuntoDe(p);
      if (a && asuntos.has(a) && !vetado(h.id, a)) { poner(h, a, "propagar"); n++; }
    }
    const porTema = new Map<number, any[]>();
    for (const h of H_) if (h.tema_id) { const l = porTema.get(h.tema_id) ?? []; l.push(h); porTema.set(h.tema_id, l); }
    for (const l of porTema.values()) {
      if (l.length < 2) continue;
      const votos = new Map<number, number>();
      for (const h of l) { const a = asuntoDe(h); if (a) votos.set(a, (votos.get(a) ?? 0) + 1); }
      const [a, v] = [...votos].sort((x, y) => y[1] - x[1])[0] ?? [0, 0];
      // La mayoría del tema (y al menos 2 noticias) ya está en ese asunto: entran las demás del tema
      if (!a || v < 2 || v < l.length / 2 || !asuntos.has(a)) continue;
      for (const h of l) if (!asuntoDe(h) && !vetado(h.id, a)) { poner(h, a, "propagar"); n++; }
    }
    return n;
  };
  informe.propagadas += propagar();

  // 2. Preguntar a la IA por las noticias nuevas
  const ultimas = (a: number, n: number) => H_.filter((h) => asuntoDe(h) === a).slice(-n);
  const revisadas: number[] = [];
  const valeComoCandidata = (h: any) => !asuntoDe(h) && !sinAsunto.has(h.id) && h.ia_tipo !== "ligera" && !SORTEO.test(h.titulo);
  const nuevas = H_.filter((h) => valeComoCandidata(h) && !h.asunto_revisado && ahora - +new Date(h.creada) < horas * H)
    .sort((a, b) => b.medios - a.medios);
  for (let l = 0; l < lotes && l * LOTE < nuevas.length; l++) {
    const lote = nuevas.slice(l * LOTE, (l + 1) * LOTE).filter((h) => !asuntoDe(h));
    if (!lote.length) continue;
    // Contexto: noticias recientes sin asunto ya vistas (4 o más medios), para poder crear un asunto con ellas y las nuevas
    const enLote = new Set(lote.map((h) => h.id));
    const contexto = H_.filter((h) => valeComoCandidata(h) && !enLote.has(h.id) && (h.asunto_revisado || revisadas.includes(h.id)) && h.medios >= 4 &&
      ahora - +new Date(h.actualizada) < 72 * H).sort((a, b) => b.medios - a.medios).slice(0, 30);
    const lista = [...lote, ...contexto];
    const textoAsuntos = [...asuntos.values()].map((a) => {
      const u = ultimas(a.id, 4);
      return `A${a.id < 0 ? "N" + -a.id : a.id} · ${a.nombre}${a.descripcion ? ` — ${a.descripcion}` : ""}${u.length ? "\n" + u.map((h) => `   - [${cuando(h.creada)}] ${h.titulo}`).join("\n") : ""}`;
    }).join("\n");
    const texto = `ASUNTOS ABIERTOS:\n${textoAsuntos || "(ninguno)"}\n\nNOTICIAS:\n` +
      lista.map((h, i) => `${i + 1}) [${cuando(h.creada)} · ${h.medios} medios] ${h.titulo}`).join("\n");
    let res: any;
    try { res = await gemini(modelo, AGRUPAR, texto); } catch (e) { informe.errores.push(String(e).slice(0, 200)); break; }
    informe.preguntadas += lote.length;
    lote.forEach((h) => revisadas.push(h.id));
    const codigo = (c: string) => { const m = String(c).match(/^A(N?)(\d+)$/i); return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : NaN; };
    for (const [num, c] of Object.entries(res?.asignar ?? {})) {
      const h = lista[Number(num) - 1], a = codigo(c as string);
      if (h && asuntos.has(a) && !asuntoDe(h) && !vetado(h.id, a)) { poner(h, a, "asignar"); informe.asignadas++; }
    }
    for (const n of Array.isArray(res?.nuevos) ? res.nuevos : []) {
      const nombre = String(n?.nombre ?? "").trim().replace(/[.«»"]/g, ""), descripcion = String(n?.descripcion ?? "").trim().slice(0, 240);
      const miembros = [...new Set((Array.isArray(n?.noticias) ? n.noticias : []).map((x: any) => lista[Number(x) - 1]).filter((h: any) => h && !asuntoDe(h)))] as any[];
      if (miembros.length < 3 || !nombre || nombre.length > 60 || nombre.split(/\s+/).length > 7 || CATEGORIA.test(nombre)) {
        informe.descartados.push({ nombre, noticias: miembros.length, motivo: miembros.length < 3 ? "menos de 3 noticias" : "nombre de categoría o demasiado largo" });
        continue;
      }
      // ¿Ya hay un asunto abierto con ese mismo nombre? Entonces van a él
      const igual = [...asuntos.values()].find((a) => a.nombre.toLowerCase() === nombre.toLowerCase());
      const a = igual ? igual.id : await nuevoAsunto(nombre, descripcion);
      for (const h of miembros) poner(h, a, igual ? "asignar" : "crear");
      if (!igual) informe.creados.push({ id: a, nombre, descripcion, noticias: miembros.map((h) => h.titulo) });
    }
    informe.propagadas += propagar();
  }

  // 3. Unir asuntos repetidos (una vez al día)
  if (diario && asuntos.size >= 2) {
    const lista = [...asuntos.values()];
    const texto = lista.map((a) => `A${a.id} · ${a.nombre}${a.descripcion ? ` — ${a.descripcion}` : ""}\n` +
      ultimas(a.id, 5).map((h) => `   - [${cuando(h.creada)}] ${h.titulo}`).join("\n")).join("\n");
    let res: any = {};
    try { res = await gemini(modelo, UNIR, texto); } catch (e) { informe.errores.push(String(e).slice(0, 200)); }
    for (const u of Array.isArray(res?.unir) ? res.unir : []) {
      const ids = (Array.isArray(u?.asuntos) ? u.asuntos : []).map((c: string) => Number(String(c).replace(/^A/i, ""))).filter((id: number) => asuntos.has(id));
      if (ids.length < 2) continue;
      // Se queda el que tiene más noticias (mismo criterio que al fusionar historias)
      ids.sort((x: number, y: number) => ultimas(y, 999).length - ultimas(x, 999).length);
      const [destino, ...otros] = ids;
      const nombre = String(u?.nombre ?? "").trim();
      for (const o of otros) {
        for (const h of H_.filter((h) => asuntoDe(h) === o)) if (!vetado(h.id, destino)) cambios.set(h.id, { a: destino, accion: "unir" });
        if (!probar) {
          await db.from("asuntos").update({ activo: false, oculto: true }).eq("id", o);
          await db.from("asuntos_registro").insert({ asunto_id: destino, accion: "unir", detalle: `se une el asunto ${o} (${asuntos.get(o)!.nombre})` });
        }
        asuntos.delete(o);
      }
      if (nombre && !CATEGORIA.test(nombre) && nombre.split(/\s+/).length <= 7 && !probar) await db.from("asuntos").update({ nombre }).eq("id", destino);
      informe.unidos.push({ destino, otros, nombre });
    }
  }

  // 4. Guardar
  const porAsunto = new Map<string, number[]>();
  for (const [h, { a, accion }] of cambios) { const k = `${a}|${accion}`; const l = porAsunto.get(k) ?? []; l.push(h); porAsunto.set(k, l); }
  if (probar) {
    return json({ ...informe, probar: true, cambios: [...porAsunto].map(([k, ids]) => {
      const [a, accion] = k.split("|");
      return { asunto: asuntos.get(Number(a))?.nombre ?? a, accion, noticias: ids.map((id) => `${id} · ${porId.get(id)?.medios} · ${porId.get(id)?.titulo}`) };
    }) });
  }
  for (const [k, ids] of porAsunto) {
    const [a, accion] = k.split("|");
    await db.from("historias").update({ asunto_id: Number(a) }).in("id", ids);
    await db.from("asuntos_registro").insert({ asunto_id: Number(a), accion, historias: ids });
  }
  for (let i = 0; i < revisadas.length; i += 200) await db.from("historias").update({ asunto_revisado: new Date().toISOString() }).in("id", revisadas.slice(i, i + 200));
  await db.rpc("recontar_asuntos");
  return json({ ...informe, guardadas: cambios.size, revisadas: revisadas.length });
});
