// Vista Plena — verificar: una IA barata decide si los titulares dudosos cuentan el mismo hecho que su noticia.
//
// La revisión por palabras (recoger?fase=depurar&marcar=1, cada hora) deja en «historias_dudosas» los titulares que
// quizá no encajan. Esta función le pregunta a un modelo de lenguaje, noticia a noticia: «¿estos titulares cuentan el
// mismo hecho que estos otros?». La IA solo contesta «mismo» u «otro»: nunca escribe nada que se publique.
//
//   ajustes.ia_modelo              modelo de Google Gemini (por defecto gemini-2.5-flash-lite)
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
- "mismo": informa del MISMO hecho concreto (el mismo suceso, anuncio, decisión o dato), aunque lo cuente con otro enfoque, con otra fase del mismo hecho o con una reacción directa a él.
- "otro": informa de un hecho distinto, aunque comparta tema, lugar, personas o palabras (por ejemplo, otra huelga, otro partido, otra sentencia u otro día).
Responde solo con JSON, una clave por letra: {"A":"mismo","B":"otro"}.`;

async function preguntar(modelo: string, referencia: string[], candidatos: string[]) {
  const letras = candidatos.map((_, i) => String.fromCharCode(65 + i));
  const texto = `Titulares de la noticia:\n${referencia.map((t) => `- ${t}`).join("\n")}\n\nCandidatos:\n${candidatos.map((t, i) => `${letras[i]}) ${t}`).join("\n")}`;
  const config: Record<string, unknown> = { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 300 };
  if (modelo.startsWith("gemini-2.5")) config.thinkingConfig = { thinkingBudget: 0 }; // sin «pensar»: no hace falta y se cobraría
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": CLAVE, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: INSTRUCCIONES }] }, contents: [{ role: "user", parts: [{ text: texto }] }], generationConfig: config }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  const u = d.usageMetadata ?? {};
  await db.rpc("sumar_ia_uso", { e: u.promptTokenCount ?? 0, s: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) });
  const salida = JSON.parse(d.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") || "{}");
  return letras.map((l) => (salida[l] === "otro" ? "otro" : salida[l] === "mismo" ? "mismo" : "error"));
}

Deno.serve(async (req) => {
  if (!(await esInterna(req))) return json({ error: "Solo para tareas internas" }, 401);
  if (!CLAVE) return json({ ok: true, hecho: 0, motivo: "Falta el secreto GEMINI_API_KEY" });
  const modelo = (await ajuste("ia_modelo")) || "gemini-2.5-flash-lite";
  const auto = (await ajuste("ia_auto")) === "true";
  const tope = Number(await ajuste("ia_tope_llamadas_dia")) || 300;
  const { data: uso } = await db.from("ia_uso").select("llamadas").eq("dia", new Date().toISOString().slice(0, 10)).maybeSingle();
  let quedan = tope - (uso?.llamadas ?? 0);
  if (quedan <= 0) return json({ ok: true, hecho: 0, motivo: `Tope diario alcanzado (${tope} consultas)` });

  // Dudosos sin respuesta de la IA ni decisión humana, de los últimos 3 días
  const { data: ds } = await db.from("historias_dudosas").select("articulo_id, historia_id")
    .is("ia", null).is("decision", null).gt("creado", new Date(Date.now() - 3 * 864e5).toISOString()).order("creado", { ascending: false }).limit(1000);
  const porH = new Map<number, number[]>();
  for (const d of ds ?? []) porH.set(d.historia_id, [...(porH.get(d.historia_id) ?? []), d.articulo_id]);
  const informe: any[] = [];
  let sacados = 0;
  for (const [hid, dudosos] of porH) {
    if (quedan-- <= 0) break;
    const { data: h } = await db.from("historias").select("titulo").eq("id", hid).maybeSingle();
    const { data: arts } = await db.from("articulos").select("id, titulo, medio_id").eq("historia_id", hid).order("publicado", { ascending: false }).limit(200);
    if (!h || !arts?.length) continue;
    const dud = new Set(dudosos);
    const cand = arts.filter((a) => dud.has(a.id)).slice(0, 12); // como mucho 12 por consulta
    if (!cand.length) continue;
    // Referencia: el título de la noticia y hasta 5 titulares que no están en duda, de medios distintos
    const ref = [h.titulo], vistos = new Set<number>();
    for (const a of arts) if (!dud.has(a.id) && !vistos.has(a.medio_id) && a.titulo !== h.titulo && ref.length < 6) { ref.push(a.titulo); vistos.add(a.medio_id); }
    if (ref.length < 3) continue; // sin referencia suficiente, mejor no preguntar
    let res: string[];
    try { res = await preguntar(modelo, ref, cand.map((a) => a.titulo)); }
    catch (e) { informe.push({ historia: hid, error: String(e).slice(0, 200) }); break; }
    for (let i = 0; i < cand.length; i++) {
      await db.from("historias_dudosas").update({ ia: res[i], ia_modelo: modelo, ia_fecha: new Date().toISOString() }).eq("articulo_id", cand[i].id);
      if (auto && res[i] === "otro") {
        await db.from("articulos").update({ historia_id: null }).eq("id", cand[i].id).eq("historia_id", hid);
        await db.from("historia_vetos").upsert({ articulo_id: cand[i].id, historia_id: hid }, { onConflict: "articulo_id,historia_id", ignoreDuplicates: true });
        await db.from("historias_dudosas").update({ decision: "sacar" }).eq("articulo_id", cand[i].id);
        sacados++;
      }
    }
    informe.push({ historia: hid, titulo: h.titulo, respuestas: cand.map((a, i) => `${res[i]} · ${a.titulo}`) });
  }
  return json({ ok: true, modelo, automatico: auto, historias: informe.length, sacados, detalle: informe.slice(0, 30) });
});
