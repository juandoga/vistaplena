// Vista Plena — cuentas de lectores (11/11/2026). Tener cuenta es opcional: para leer no hace falta.
//
// Para qué sirve: gestionar el boletín sin buscar el enlace del correo, seguir temas (y ver cuántas noticias nuevas tienen
// desde la última visita) y, solo si el lector lo activa, su «dieta de medios»: de qué lado son los medios que abre desde
// Vista Plena. De eso se guarda solo cuántas veces abre cada medio por semana (ni qué noticia ni a qué hora), porque qué
// medios lee alguien puede revelar su opinión política (dato especial en el RGPD). Al desactivarlo se borra.
//
// Se entra sin contraseña, de dos formas; las dos acaban en una sesión de 180 días que el navegador guarda:
//  1. Enlace al correo: 30 minutos y un solo uso. Como mucho 1 por minuto y 5 al día por correo, y 60 por hora en total.
//  2. Google: el botón da un token firmado; se comprueba con las claves públicas de Google. Necesita el identificador de
//     cliente de Google en ajustes («google_client_id»). Sin él, la página solo ofrece el enlace.
// Solo se guardan huellas SHA-256 de enlaces y sesiones. Tablas en servidor/cuentas.sql.
//
// GET  ?q=config                                  formas de entrar activas (sin sesión)
// POST {accion:"pedir_enlace", email, volver, seguir}  manda el enlace (responde lo mismo exista la cuenta o no). volver:
//                                                 adónde ir después; seguir: tema que quería seguir antes de entrar
// POST {accion:"entrar", enlace}                  cambia el enlace por una sesión (crea la cuenta la primera vez)
// POST {accion:"entrar_google", credencial}       lo mismo con Google
// Con la cabecera x-sesion (o «sesion» en el cuerpo, para navigator.sendBeacon):
// GET  ?q=yo                                      correo, boletín y temas que sigue
// GET  ?q=dieta                                   dieta de medios de las últimas 4 semanas
// GET  ?q=estado                                  si tiene la dieta activada (la web lo comprueba cada 12 horas)
// POST {accion:"dieta", activar}                  activar (consentimiento) o desactivar y borrar
// POST {accion:"lectura", medio}                  suma una lectura de ese medio (solo con la dieta activada)
// POST {accion:"seguir", tema, seguir}            seguir o dejar un tema («a12» = tema grande, «34» = pequeño)
// POST {accion:"tema_visita", tema}               al abrir un tema: si lo sigue, lo marca como visto
// POST {accion:"boletin", quiero}                 «semanal», «diario» (devuelve el enlace para elegir medios) o «baja»
// POST {accion:"salir"}
// POST {accion:"borrar", boletin}                 borra la cuenta y todo lo suyo; con boletin=true, también lo da de baja
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const DE = Deno.env.get("NEWSLETTER_FROM") ?? "Vista Plena <boletin@vistaplena.es>";
const WEB = "https://vistaplena.es";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-sesion", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const huella = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const aleatorio = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ahora = () => new Date().toISOString();
const hace = (min: number) => new Date(Date.now() - min * 60e3).toISOString();
const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) && c.length <= 200;
const ajuste = async (nombre: string) => (await db.from("ajustes").select("valor").eq("nombre", nombre).maybeSingle()).data?.valor ?? null;
// Adónde volver después de entrar: solo direcciones de la propia web («/tema/...»)
const rutaSegura = (v: unknown) => typeof v === "string" && v.length < 300 && /^\/(?![\/\\])[\w\-./?=&%#]*$/.test(v) ? v : "";
const temaValido = (t: unknown) => typeof t === "string" && /^a?[0-9]{1,9}$/.test(t);

// ---------- Entrar ----------
async function pedirEnlace(email: unknown, volver: unknown, seguir: unknown) {
  const respuesta = json({ ok: true }); // siempre la misma respuesta, se mande o no
  const correo = String(email ?? "").trim().toLowerCase();
  if (!correoValido(correo)) return json({ ok: false, error: "Escribe un correo válido, por ejemplo nombre@ejemplo.com." }, 400);
  const cuenta = async (q: any) => (await q).count ?? 0;
  const base = () => db.from("usuarios_accesos").select("id", { count: "exact", head: true }).eq("tipo", "enlace");
  if (await cuenta(base().eq("email", correo).gt("creado", hace(1))) >= 1) return respuesta;
  if (await cuenta(base().eq("email", correo).gt("creado", hace(24 * 60))) >= 5) return respuesta;
  if (await cuenta(base().gt("creado", hace(60))) >= 60) return json({ ok: false, error: "Ahora mismo hay muchas peticiones. Prueba dentro de un rato." }, 429);
  if (!RESEND) return json({ ok: false, error: "El correo no está configurado." }, 500);
  const enlace = aleatorio();
  await db.from("usuarios_accesos").insert({ huella: await huella(enlace), tipo: "enlace", email: correo, caduca: new Date(Date.now() + 30 * 60e3).toISOString() });
  await db.from("usuarios_accesos").delete().lt("caduca", hace(24 * 60)); // limpieza: enlaces y sesiones caducados
  const ruta = rutaSegura(volver);
  const url = `${WEB}/cuenta.html?enlace=${enlace}${ruta ? `&volver=${encodeURIComponent(ruta)}` : ""}${temaValido(seguir) ? `&seguir=${seguir}` : ""}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <p style="font-size:18px;font-weight:bold;margin:0 0 12px">Entra en Vista Plena</p>
    <p style="margin:0 0 20px;line-height:1.5">Toca el botón para entrar. El enlace sirve una sola vez y durante 30 minutos. Después, este móvil u ordenador te recordará durante seis meses.</p>
    <p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Entrar en Vista Plena</a></p>
    <p style="margin:0;font-size:13px;color:#666;line-height:1.5">Si no lo has pedido tú, ignora este correo: sin este enlace nadie puede entrar con tu dirección.</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: DE, to: [correo], subject: "Tu enlace para entrar en Vista Plena", html }),
  });
  if (!r.ok) return json({ ok: false, error: "No hemos podido mandar el correo. Inténtalo de nuevo en unos minutos." }, 502);
  return respuesta;
}

async function abrirSesion(email: string, via: string) {
  await db.from("usuarios").upsert({ email, via }, { onConflict: "email", ignoreDuplicates: true });
  const { data: u } = await db.from("usuarios").select("id, ultimo_acceso").eq("email", email).single();
  await db.from("usuarios").update({ ultimo_acceso: ahora(), via }).eq("id", u!.id);
  const sesion = aleatorio();
  await db.from("usuarios_accesos").insert({ huella: await huella(sesion), tipo: "sesion", usuario_id: u!.id, caduca: new Date(Date.now() + 180 * 864e5).toISOString() });
  return json({ ok: true, sesion, nuevo: !u!.ultimo_acceso });
}

async function entrar(enlace: unknown) {
  const { data: fila } = await db.from("usuarios_accesos").select("id, email, caduca, usado").eq("huella", await huella(String(enlace ?? ""))).eq("tipo", "enlace").maybeSingle();
  if (!fila || fila.usado || !fila.email || new Date(fila.caduca) < new Date()) return json({ error: "Este enlace ya no vale: se usó o han pasado más de 30 minutos. Pide otro." }, 401);
  await db.from("usuarios_accesos").update({ usado: ahora(), email: null }).eq("id", fila.id);
  return await abrirSesion(fila.email, "enlace");
}

const GOOGLE_CLAVES = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
async function entrarGoogle(credencial: unknown) {
  const cliente = await ajuste("google_client_id");
  if (!cliente) return json({ error: "La entrada con Google todavía no está activada. Entra con el enlace al correo." }, 400);
  try {
    const { payload } = await jwtVerify(String(credencial ?? ""), GOOGLE_CLAVES, { audience: cliente, issuer: ["https://accounts.google.com", "accounts.google.com"] });
    const correo = String(payload.email ?? "").toLowerCase();
    if (!payload.email_verified || !correoValido(correo)) return json({ error: "Google no ha confirmado tu correo. Entra con el enlace al correo." }, 403);
    return await abrirSesion(correo, "google");
  } catch {
    return json({ error: "Google no ha confirmado tu identidad. Vuelve a intentarlo." }, 401);
  }
}

// ---------- Con sesión ----------
type Usuario = { id: number; email: string; creado: string; dieta_desde: string | null };
async function usuarioDe(sesion: string): Promise<Usuario | null> {
  if (!sesion || sesion.length > 100) return null;
  const { data: s } = await db.from("usuarios_accesos").select("usuario_id, caduca").eq("huella", await huella(sesion)).eq("tipo", "sesion").maybeSingle();
  if (!s?.usuario_id || new Date(s.caduca) < new Date()) return null;
  const { data: u } = await db.from("usuarios").select("id, email, creado, dieta_desde").eq("id", s.usuario_id).maybeSingle();
  return u as Usuario | null;
}

async function temasSeguidos(uid: number) {
  const { data: ts } = await db.from("usuarios_temas").select("tema, visto, creado").eq("usuario_id", uid).order("creado", { ascending: false }).limit(100);
  const L = ts ?? [];
  const aIds = L.filter((t) => t.tema.startsWith("a")).map((t) => Number(t.tema.slice(1)));
  const tIds = L.filter((t) => !t.tema.startsWith("a")).map((t) => Number(t.tema));
  const { data: as } = aIds.length ? await db.from("asuntos_v").select("id, nombre, activo, actualizado, ids").in("id", aIds) : { data: [] as any[] };
  const { data: tm } = tIds.length ? await db.from("temas").select("id, nombre, nombre_manual, activo, oculto, actualizado").in("id", tIds) : { data: [] as any[] };
  const A = new Map((as ?? []).map((a: any) => [a.id, a])), T = new Map((tm ?? []).map((t: any) => [t.id, t]));
  // Noticias nuevas desde la última visita a cada tema
  const ms = (iso: string) => +new Date(iso);
  const minVisto = new Date(Math.min(Date.now(), ...L.map((t) => ms(t.visto)))).toISOString();
  const { data: hA } = aIds.length ? await db.from("historias").select("id, creada, asunto_id").in("asunto_id", aIds).gt("creada", minVisto).limit(2000) : { data: [] as any[] };
  const { data: hT } = tIds.length ? await db.from("historias").select("id, creada, tema_id").in("tema_id", tIds).gt("creada", minVisto).limit(2000) : { data: [] as any[] };
  return L.map((t) => {
    if (t.tema.startsWith("a")) {
      const a = A.get(Number(t.tema.slice(1)));
      // Solo cuentan las noticias que se ven en el tema (asuntos_v.ids)
      const visibles = new Set<number>(a?.ids ?? []);
      const nuevas = (hA ?? []).filter((h: any) => h.asunto_id === a?.id && visibles.has(h.id) && ms(h.creada) > ms(t.visto)).length;
      return { tema: t.tema, grande: true, id: Number(t.tema.slice(1)), nombre: a?.nombre ?? null, activo: !!a?.activo, actualizado: a?.actualizado ?? null, nuevas };
    }
    const m = T.get(Number(t.tema));
    const nuevas = (hT ?? []).filter((h: any) => h.tema_id === Number(t.tema) && ms(h.creada) > ms(t.visto)).length;
    return { tema: t.tema, grande: false, id: Number(t.tema), nombre: m ? (m.nombre_manual || m.nombre) : null, activo: !!m && m.activo && !m.oculto, actualizado: m?.actualizado ?? null, nuevas };
  });
}

async function dieta(u: Usuario) {
  if (!u.dieta_desde) return { activa: false };
  await db.from("usuarios_lecturas").delete().eq("usuario_id", u.id).lt("semana", new Date(Date.now() - 91 * 864e5).toISOString().slice(0, 10)); // se guardan 13 semanas
  const desde = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
  const { data: ls } = await db.from("usuarios_lecturas").select("medio_id, n, medios(nombre, orientacion)").eq("usuario_id", u.id).gte("semana", desde);
  const por = new Map<number, { nombre: string; orientacion: number; n: number }>();
  for (const l of ls ?? []) {
    const m = (l as any).medios; if (!m) continue;
    const x = por.get(l.medio_id) ?? { nombre: m.nombre, orientacion: m.orientacion, n: 0 };
    x.n += l.n; por.set(l.medio_id, x);
  }
  const medios = [...por.values()].sort((a, b) => b.n - a.n);
  const lados = { izq: 0, cen: 0, der: 0 };
  for (const m of medios) lados[m.orientacion < 0 ? "izq" : m.orientacion > 0 ? "der" : "cen"] += m.n;
  return { activa: true, desde: u.dieta_desde, total: lados.izq + lados.cen + lados.der, lados, medios };
}

let MEDIOS: Map<string, number> | null = null;
async function medioId(nombre: string) {
  if (!MEDIOS) {
    const { data } = await db.from("medios").select("id, nombre");
    MEDIOS = new Map((data ?? []).map((m) => [m.nombre.toLowerCase(), m.id]));
  }
  return MEDIOS.get(nombre.trim().toLowerCase()) ?? null;
}

async function boletin(u: Usuario, quiero: unknown) {
  if (quiero === "baja") {
    await db.from("suscriptores").update({ confirmado: false, baja_en: ahora(), medios: null, consentimiento_medios: null }).eq("email", u.email);
    return json({ ok: true });
  }
  if (quiero === "semanal") {
    // El correo ya está comprobado (ha entrado con él): no hace falta confirmar. Pasar al semanal borra los medios
    await db.from("suscriptores").upsert({ email: u.email, frecuencia: "semanal", confirmado: true, confirmado_en: ahora(), baja_en: null,
      medios: null, consentimiento_medios: null }, { onConflict: "email" });
    return json({ ok: true });
  }
  if (quiero === "diario") {
    // Para el de cada mañana hay que elegir los medios: se crea la fila sin activar (si no existe) y se manda a elegirlos
    await db.from("suscriptores").upsert({ email: u.email, frecuencia: "semanal", confirmado: false }, { onConflict: "email", ignoreDuplicates: true });
    const { data: s } = await db.from("suscriptores").select("token").eq("email", u.email).single();
    return json({ ok: true, enlace: `/boletin-medios.html?t=${s!.token}&quiero=diario` });
  }
  return json({ error: "No entiendo qué quieres hacer con el boletín." }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const q = new URL(req.url).searchParams.get("q");
  try {
    // El cuerpo se lee como texto: navigator.sendBeacon lo manda como text/plain para no necesitar permiso previo (CORS)
    const b: any = req.method === "POST" ? await req.text().then((t) => JSON.parse(t || "{}")).catch(() => ({})) : {};
    if (req.method === "GET" && q === "config") return json({ google: await ajuste("google_client_id") });
    if (b.accion === "pedir_enlace") return await pedirEnlace(b.email, b.volver, b.seguir);
    if (b.accion === "entrar") return await entrar(b.enlace);
    if (b.accion === "entrar_google") return await entrarGoogle(b.credencial);

    // A partir de aquí hace falta una sesión válida
    const sesion = req.headers.get("x-sesion") ?? (typeof b.sesion === "string" ? b.sesion : "");
    const u = await usuarioDe(sesion);
    if (!u) return json({ error: "sesion" }, 401);

    if (req.method === "GET" && q === "yo") {
      const { data: s } = await db.from("suscriptores").select("token, frecuencia, medios, confirmado, baja_en").eq("email", u.email).maybeSingle();
      const activo = !!s?.confirmado && !s.baja_en;
      return json({ email: u.email, desde: u.creado, dieta: !!u.dieta_desde, temas: await temasSeguidos(u.id),
        boletin: activo ? { frecuencia: s!.frecuencia, medios: s!.medios ?? [], enlace: `/boletin-medios.html?t=${s!.token}` } : null });
    }
    if (req.method === "GET" && q === "dieta") return json(await dieta(u));
    if (req.method === "GET" && q === "estado") return json({ ok: true, dieta: !!u.dieta_desde });

    if (b.accion === "dieta") {
      if (b.activar === true) { if (!u.dieta_desde) await db.from("usuarios").update({ dieta_desde: ahora() }).eq("id", u.id); }
      else {
        await db.from("usuarios").update({ dieta_desde: null }).eq("id", u.id);
        await db.from("usuarios_lecturas").delete().eq("usuario_id", u.id);
      }
      return json({ ok: true });
    }
    if (b.accion === "lectura") {
      if (!u.dieta_desde) return json({ ok: false });
      const id = await medioId(String(b.medio ?? "").slice(0, 80));
      if (!id) return json({ ok: false });
      await db.rpc("sumar_lectura", { p_usuario: u.id, p_medio: id });
      return json({ ok: true });
    }
    if (b.accion === "seguir") {
      if (!temaValido(b.tema)) return json({ error: "Tema no válido" }, 400);
      if (b.seguir === false) { await db.from("usuarios_temas").delete().eq("usuario_id", u.id).eq("tema", b.tema); return json({ ok: true, sigo: false }); }
      const grande = b.tema.startsWith("a"), id = Number(b.tema.replace(/^a/, ""));
      const { data: existe } = await db.from(grande ? "asuntos" : "temas").select("id").eq("id", id).maybeSingle();
      if (!existe) return json({ error: "Este tema ya no existe" }, 404);
      const { count } = await db.from("usuarios_temas").select("tema", { count: "exact", head: true }).eq("usuario_id", u.id);
      if ((count ?? 0) >= 100) return json({ error: "Sigues 100 temas: deja alguno para seguir otro." }, 400);
      await db.from("usuarios_temas").upsert({ usuario_id: u.id, tema: b.tema, visto: ahora() }, { onConflict: "usuario_id,tema" });
      return json({ ok: true, sigo: true });
    }
    if (b.accion === "tema_visita") {
      if (!temaValido(b.tema)) return json({ error: "Tema no válido" }, 400);
      const { data } = await db.from("usuarios_temas").update({ visto: ahora() }).eq("usuario_id", u.id).eq("tema", b.tema).select("tema");
      return json({ ok: true, sigo: !!data?.length });
    }
    if (b.accion === "boletin") return await boletin(u, b.quiero);
    if (b.accion === "salir") {
      await db.from("usuarios_accesos").delete().eq("huella", await huella(sesion)).eq("tipo", "sesion");
      return json({ ok: true });
    }
    if (b.accion === "borrar") {
      if (b.boletin === true) await db.from("suscriptores").update({ confirmado: false, baja_en: ahora(), medios: null, consentimiento_medios: null }).eq("email", u.email);
      await db.from("usuarios").delete().eq("id", u.id); // borra en cascada sesiones, temas y lecturas
      return json({ ok: true });
    }
    return json({ error: "Petición no válida" }, 400);
  } catch (e) {
    return json({ error: String(e).slice(0, 200) }, 500);
  }
});
