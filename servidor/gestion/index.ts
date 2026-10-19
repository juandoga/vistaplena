// Vista Plena — gestión privada: leer los avisos de error de los lectores y corregir temas a mano.
//
// Tres formas de entrar, todas acaban en una sesión de 180 días que el navegador guarda (solo se guardan huellas SHA-256):
//  1. Con Google: el botón de Google da un token firmado; se comprueba con las claves públicas de Google y que el correo
//     sea el de ajustes («gestion_google»). Necesita el identificador de cliente de Google en ajustes («google_client_id»).
//  2. Con contraseña: se guarda solo su huella PBKDF2 (ajustes «gestion_clave_pbkdf2»). Como mucho 5 fallos cada 15 minutos.
//  3. Con un enlace al correo de ajustes («gestion_correo»): sirve también para recuperar el acceso.
//
// GET  ?q=config                          qué formas de entrar están activas (sin sesión)
// POST {accion:"entrar_google", credencial}
// POST {accion:"entrar_clave", clave}
// POST {accion:"poner_clave", clave}      (con sesión) crea o cambia la contraseña
// POST {accion:"pedir_enlace"}            manda el enlace (como mucho 1 cada 2 minutos y 10 al día)
// POST {accion:"entrar", enlace}          cambia el enlace (30 minutos, un solo uso) por una sesión
// Con la cabecera x-sesion:
// GET  ?q=avisos           avisos de los lectores, primero los pendientes, con el titular de la historia
// GET  ?q=temas            temas activos, con su nombre automático y el manual
// POST {accion:"revisar", id, revisado}
// POST {accion:"tema", id, nombre_manual, oculto}
// GET  ?q=dudosas          titulares que la revisión automática cree que no encajan en su historia
// POST {accion:"dudosa", articulo_id, decision:"sacar"|"bien"}
// POST {accion:"salir"}
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const DE = Deno.env.get("NEWSLETTER_FROM") ?? "Vista Plena <boletin@vistaplena.es>";
const WEB = "https://vistaplena.es/gestion.html";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-sesion", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const huella = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const aleatorio = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ahora = () => new Date().toISOString();

async function pedirEnlace() {
  const respuesta = json({ ok: true }); // siempre la misma respuesta, se mande o no
  const hace = (min: number) => new Date(Date.now() - min * 60e3).toISOString();
  const { count: recientes } = await db.from("gestion_accesos").select("id", { count: "exact", head: true }).eq("tipo", "enlace").gt("creado", hace(2));
  const { count: hoy } = await db.from("gestion_accesos").select("id", { count: "exact", head: true }).eq("tipo", "enlace").gt("creado", hace(24 * 60));
  if ((recientes ?? 0) >= 1 || (hoy ?? 0) >= 10) return respuesta;
  const { data: aj } = await db.from("ajustes").select("valor").eq("nombre", "gestion_correo").single();
  if (!aj?.valor || !RESEND) return json({ ok: false, error: "No está configurado el correo de la gestión" }, 500);
  const enlace = aleatorio();
  await db.from("gestion_accesos").insert({ huella: await huella(enlace), tipo: "enlace", caduca: new Date(Date.now() + 30 * 60e3).toISOString() });
  const url = `${WEB}?enlace=${enlace}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <p style="font-size:18px;font-weight:bold;margin:0 0 12px">Entrar en la gestión de Vista Plena</p>
    <p style="margin:0 0 20px;line-height:1.5">Toca el botón para entrar. El enlace sirve una sola vez y durante 30 minutos. Después, este móvil u ordenador te recordará durante seis meses.</p>
    <p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Entrar en la gestión</a></p>
    <p style="margin:0;font-size:13px;color:#666;line-height:1.5">Si no lo has pedido tú, ignora este correo: nadie puede entrar sin este enlace.<br>La página de gestión está siempre en ${WEB} (enlace «Gestión» al pie de la web).</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: DE, to: [aj.valor], subject: "Entrar en la gestión de Vista Plena", html }),
  });
  if (!r.ok) return json({ ok: false, error: `Resend respondió ${r.status}` }, 502);
  return respuesta;
}

const ajuste = async (nombre: string) => (await db.from("ajustes").select("valor").eq("nombre", nombre).maybeSingle()).data?.valor ?? null;
async function nuevaSesion(via: string) {
  const sesion = aleatorio();
  await db.from("gestion_accesos").insert({ huella: await huella(sesion), tipo: "sesion", via, caduca: new Date(Date.now() + 180 * 864e5).toISOString() });
  await db.from("gestion_accesos").delete().lt("caduca", new Date(Date.now() - 864e5).toISOString());
  return json({ ok: true, sesion });
}

// Contraseña: PBKDF2-SHA256 con sal aleatoria («pbkdf2$iteraciones$sal$huella», en base64)
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(clave: string, sal: Uint8Array, iter: number) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iter }, k, 256));
}
const iguales = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.reduce((d, x, i) => d | (x ^ b[i]), 0) === 0;

async function entrarClave(clave: string) {
  const { count } = await db.from("gestion_accesos").select("id", { count: "exact", head: true }).eq("tipo", "fallo").gt("creado", new Date(Date.now() - 15 * 60e3).toISOString());
  if ((count ?? 0) >= 5) return json({ error: "Demasiados intentos fallidos. Espera 15 minutos o entra con Google o con el enlace al correo." }, 429);
  const guardada = await ajuste("gestion_clave_pbkdf2");
  if (!guardada) return json({ error: "Todavía no hay contraseña. Entra con el enlace al correo y créala dentro." }, 401);
  const [, iter, sal, h] = guardada.split("$");
  if (!iguales(await pbkdf2(String(clave ?? ""), deB64(sal), Number(iter)), deB64(h))) {
    await db.from("gestion_accesos").insert({ huella: "fallo-" + aleatorio(), tipo: "fallo", caduca: new Date(Date.now() + 864e5).toISOString() });
    return json({ error: "Contraseña incorrecta." }, 401);
  }
  return await nuevaSesion("clave");
}

const GOOGLE_CLAVES = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
async function entrarGoogle(credencial: string) {
  const cliente = await ajuste("google_client_id");
  if (!cliente) return json({ error: "La entrada con Google todavía no está configurada." }, 400);
  try {
    const { payload } = await jwtVerify(String(credencial ?? ""), GOOGLE_CLAVES, { audience: cliente, issuer: ["https://accounts.google.com", "accounts.google.com"] });
    const permitidos = String(await ajuste("gestion_google") ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean);
    const correo = String(payload.email ?? "").toLowerCase();
    if (!payload.email_verified || !permitidos.includes(correo)) return json({ error: `La cuenta ${correo || "de Google"} no tiene acceso a la gestión.` }, 403);
    return await nuevaSesion("google");
  } catch (_) {
    return json({ error: "Google no ha confirmado la identidad. Vuelve a intentarlo." }, 401);
  }
}

async function entrar(enlace: string) {
  const { data: fila } = await db.from("gestion_accesos").select("id, caduca, usado").eq("huella", await huella(String(enlace ?? ""))).eq("tipo", "enlace").maybeSingle();
  if (!fila || fila.usado || new Date(fila.caduca) < new Date()) return json({ error: "El enlace no vale: ya se usó o han pasado más de 30 minutos. Pide otro." }, 401);
  await db.from("gestion_accesos").update({ usado: ahora() }).eq("id", fila.id);
  return await nuevaSesion("enlace");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const q = new URL(req.url).searchParams.get("q");
  try {
    const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (b.accion === "pedir_enlace") return await pedirEnlace();
    if (b.accion === "entrar") return await entrar(b.enlace);
    if (b.accion === "entrar_clave") return await entrarClave(b.clave);
    if (b.accion === "entrar_google") return await entrarGoogle(b.credencial);
    if (req.method === "GET" && q === "config") return json({ google: await ajuste("google_client_id"), clave: !!(await ajuste("gestion_clave_pbkdf2")) });

    // A partir de aquí hace falta una sesión válida
    const h = await huella(req.headers.get("x-sesion") ?? "");
    const { data: ses } = await db.from("gestion_accesos").select("id, caduca").eq("huella", h).eq("tipo", "sesion").maybeSingle();
    if (!ses || new Date(ses.caduca) < new Date()) return json({ error: "Sesión no válida" }, 401);

    if (req.method === "GET" && q === "avisos") {
      const { data: avisos } = await db.from("reportes").select("*").order("revisado").order("creado", { ascending: false }).limit(300);
      const ids = [...new Set((avisos ?? []).map((a) => a.historia_id))];
      const titulos = new Map<number, string>();
      if (ids.length) {
        const { data: hs } = await db.from("historias").select("id, titulo").in("id", ids);
        for (const x of hs ?? []) titulos.set(x.id, x.titulo);
        const faltan = ids.filter((i) => !titulos.has(i));
        if (faltan.length) { const { data: a } = await db.from("archivo").select("historia_id, titulo").in("historia_id", faltan); for (const x of a ?? []) titulos.set(x.historia_id, x.titulo); }
      }
      return json((avisos ?? []).map((a) => ({ ...a, titulo: titulos.get(a.historia_id) ?? null })));
    }
    if (req.method === "GET" && q === "dudosas") {
      const { data: ds } = await db.from("historias_dudosas").select("articulo_id, historia_id, puntuacion, motivo, creado, ia")
        .is("decision", null).gt("creado", new Date(Date.now() - 3 * 864e5).toISOString()).order("historia_id").limit(300);
      const aIds = (ds ?? []).map((d) => d.articulo_id), hIds = [...new Set((ds ?? []).map((d) => d.historia_id))];
      const { data: arts } = aIds.length ? await db.from("articulos").select("id, titulo, url, historia_id, medios(nombre)").in("id", aIds) : { data: [] as any[] };
      const { data: hs } = hIds.length ? await db.from("historias").select("id, titulo").in("id", hIds) : { data: [] as any[] };
      const A = new Map((arts ?? []).map((a: any) => [a.id, a])), Hm = new Map((hs ?? []).map((h: any) => [h.id, h.titulo]));
      // Solo los que siguen en esa historia (si ya salieron por otra vía, no se proponen)
      return json((ds ?? []).filter((d) => A.get(d.articulo_id)?.historia_id === d.historia_id && Hm.has(d.historia_id))
        .map((d) => ({ ...d, titulo: A.get(d.articulo_id).titulo, url: A.get(d.articulo_id).url, medio: A.get(d.articulo_id).medios?.nombre, historia: Hm.get(d.historia_id) })));
    }
    if (req.method === "GET" && q === "fusiones") {
      // Noticias juntadas en los últimos 2 días (por recoger, verificar o a mano), para poder separarlas
      const { data: mov } = await db.from("historias_movimientos").select("de, a, titulo_de, creado").gt("creado", new Date(Date.now() - 2 * 864e5).toISOString()).order("creado", { ascending: false }).limit(1000);
      const grupos = new Map<string, any>();
      for (const m of mov ?? []) { const k = `${m.de}-${m.a}`; const g = grupos.get(k) ?? { de: m.de, a: m.a, titulo_de: m.titulo_de, creado: m.creado, n: 0 }; g.n++; grupos.set(k, g); }
      const L = [...grupos.values()];
      const ids = [...new Set(L.map((g) => g.a))];
      const { data: hs } = ids.length ? await db.from("historias").select("id, titulo").in("id", ids) : { data: [] as any[] };
      const T = new Map((hs ?? []).map((h: any) => [h.id, h.titulo]));
      const { data: sep } = await db.from("historias_pares").select("a, b").eq("resultado", "distinta");
      const S = new Set((sep ?? []).map((p: any) => `${p.a}-${p.b}`));
      // Las ya separadas (marcadas como distintas) no se muestran
      return json(L.filter((g) => !S.has(`${Math.min(g.de, g.a)}-${Math.max(g.de, g.a)}`)).map((g) => ({ ...g, titulo_a: T.get(g.a) ?? null })));
    }
    if (req.method === "GET" && q === "correcciones") {
      const { data } = await db.from("correcciones").select("*").eq("publica", true).order("fecha", { ascending: false }).limit(50);
      return json(data ?? []);
    }
    if (req.method === "GET" && q === "temas") {
      const { data } = await db.from("temas").select("id, nombre, nombre_manual, oculto, historias, actualizado").eq("activo", true).order("actualizado", { ascending: false });
      return json(data ?? []);
    }
    if (req.method === "POST") {
      if (b.accion === "revisar") {
        await db.from("reportes").update({ revisado: !!b.revisado }).eq("id", b.id);
        return json({ ok: true });
      }
      if (b.accion === "tema") {
        const nombre = String(b.nombre_manual ?? "").trim().slice(0, 80) || null;
        await db.from("temas").update({ nombre_manual: nombre, oculto: !!b.oculto }).eq("id", b.id);
        return json({ ok: true });
      }
      if (b.accion === "dudosa") {
        const { data: d } = await db.from("historias_dudosas").select("historia_id").eq("articulo_id", b.articulo_id).maybeSingle();
        if (!d) return json({ error: "No está en la lista" }, 404);
        if (b.decision === "sacar") {
          await db.from("articulos").update({ historia_id: null }).eq("id", b.articulo_id).eq("historia_id", d.historia_id);
          await db.from("historia_vetos").upsert({ articulo_id: b.articulo_id, historia_id: d.historia_id }, { onConflict: "articulo_id,historia_id", ignoreDuplicates: true });
          // Queda anotado en el registro público de correcciones (Quiénes somos)
          const { data: art } = await db.from("articulos").select("titulo, medios(nombre)").eq("id", b.articulo_id).maybeSingle();
          const { data: his } = await db.from("historias").select("titulo").eq("id", d.historia_id).maybeSingle();
          await db.from("correcciones").insert({ tipo: "Titular mal agrupado", historia_id: d.historia_id, titulo: his?.titulo ?? null,
            que: `Sacamos el titular de ${(art as any)?.medios?.nombre ?? "un medio"} «${String(art?.titulo ?? "").slice(0, 160)}» porque contaba otro hecho.` });
        }
        await db.from("historias_dudosas").update({ decision: b.decision === "sacar" ? "sacar" : "bien" }).eq("articulo_id", b.articulo_id);
        return json({ ok: true });
      }
      if (b.accion === "correccion") {
        const que = String(b.que ?? "").trim().slice(0, 600), tipo = String(b.tipo ?? "").trim().slice(0, 60) || "Corrección";
        if (que.length < 10) return json({ error: "Explica la corrección en una frase." }, 400);
        const hid = Number(b.historia_id) || null;
        let titulo: string | null = null;
        if (hid) {
          const { data: x } = await db.from("historias").select("titulo").eq("id", hid).maybeSingle();
          titulo = x?.titulo ?? (await db.from("archivo").select("titulo").eq("historia_id", hid).maybeSingle()).data?.titulo ?? null;
        }
        await db.from("correcciones").insert({ tipo, historia_id: hid, titulo, que });
        return json({ ok: true });
      }
      if (b.accion === "separar") {
        const de = Number(b.de), a = Number(b.a);
        const { data: n, error } = await db.rpc("deshacer_fusion", { p_de: de, p_a: a });
        if (error) return json({ error: error.message }, 400);
        const { data: h } = await db.from("historias").select("titulo").eq("id", de).maybeSingle();
        await db.from("correcciones").insert({ tipo: "Noticias separadas", historia_id: de, titulo: h?.titulo ?? null, que: `Se habían juntado dos noticias distintas; las hemos vuelto a separar (${n} titulares).` });
        return json({ ok: true, n });
      }
      if (b.accion === "borrar_correccion") {
        await db.from("correcciones").update({ publica: false }).eq("id", b.id);
        return json({ ok: true });
      }
      if (b.accion === "poner_clave") {
        const clave = String(b.clave ?? "");
        if (clave.length < 10) return json({ error: "La contraseña debe tener al menos 10 caracteres." }, 400);
        const sal = crypto.getRandomValues(new Uint8Array(16)), iter = 210000;
        const valor = `pbkdf2$${iter}$${b64(sal)}$${b64(await pbkdf2(clave, sal, iter))}`;
        await db.from("ajustes").upsert({ nombre: "gestion_clave_pbkdf2", valor }, { onConflict: "nombre" });
        return json({ ok: true });
      }
      if (b.accion === "salir") {
        await db.from("gestion_accesos").delete().eq("id", ses.id);
        return json({ ok: true });
      }
    }
    return json({ error: "Petición desconocida" }, 400);
  } catch (e) {
    return json({ error: String(e).slice(0, 200) }, 500);
  }
});
