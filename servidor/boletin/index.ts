// Vista Plena — boletines por correo con Resend.
// - Semanal (los viernes a las 8:00): las historias que más medios contaron en la semana.
// - Personal (9/11, cada mañana a las 7:30): el lector elige de 1 a 5 medios que suele leer y recibe las noticias políticas
//   de España de las últimas 24 horas que publicaron 6 medios o más y ninguno de los suyos. Solo los días que hay alguna.
//   Qué medios lee alguien puede revelar su opinión política (dato especial en el RGPD): se guarda solo con su consentimiento
//   expreso (suscriptores.consentimiento_medios), solo sirve para su correo y lo cambia o borra con el enlace de cada envío.
// Rutas (?accion=): alta (formulario de la web), confirmar y baja (enlaces del correo), datos y cambiar (página
// boletin-medios.html, con el token del enlace), enviar (viernes) y diario (cada mañana), estas dos solo internas.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Solo las tareas programadas pueden ejecutar esta función: traen la cabecera x-interna con la clave interna,
// cuya huella SHA-256 está en la tabla privada «ajustes» (clave_interna_sha256). La clave pública de la web no basta.
async function esInterna(req: Request): Promise<boolean> {
  const v = req.headers.get("x-interna") ?? "";
  if (!v) return false;
  const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data } = await db.from("ajustes").select("valor").eq("nombre", "clave_interna_sha256").maybeSingle();
  return !!data?.valor && data.valor === h;
}
const noInterna = () => new Response(JSON.stringify({ error: "Solo para tareas internas" }), { status: 401, headers: { "Content-Type": "application/json" } });
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const DE = Deno.env.get("NEWSLETTER_FROM") ?? "Vista Plena <onboarding@resend.dev>";
const WEB = "https://vistaplena.es/";
const FUNC = `${Deno.env.get("SUPABASE_URL")}/functions/v1/boletin`;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const volver = (estado: string) => new Response(null, { status: 302, headers: { Location: `${WEB}?boletin=${estado}#boletin` } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function enviarCorreos(lista: { to: string; subject: string; html: string; baja?: string }[]) {
  if (!RESEND) throw new Error("Falta la clave RESEND_API_KEY en los secretos de Supabase");
  let ok = 0;
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100).map((c) => ({
      from: DE, to: [c.to], subject: c.subject, html: c.html,
      headers: c.baja ? { "List-Unsubscribe": `<${c.baja}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
    }));
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    ok += lote.length;
  }
  return ok;
}

// ---------- Plantillas de correo ----------
const COL = { izq: "#c0392b", cen: "#8f9298", der: "#2c5aa0" };
function barra(h: any) {
  const celda = (p: number, c: string) => p > 0 ? `<td width="${p}%" style="background:${c};height:8px;font-size:0;line-height:0">&nbsp;</td>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:4px;overflow:hidden"><tr>${celda(h.pct_izq, COL.izq)}${celda(h.pct_cen, COL.cen)}${celda(h.pct_der, COL.der)}</tr></table>`;
}
function porLado(h: any) {
  const lado = (o: number) => o < 0 ? "izq" : o > 0 ? "der" : "cen";
  const uno: Record<string, any> = {};
  for (const a of h.articulos ?? []) { const k = lado(a.orientacion); if (!uno[k]) uno[k] = a; }
  const fila = (k: string, n: string) => uno[k]
    ? `<tr><td style="padding:3px 0;font:13px/1.4 Arial,sans-serif;color:#555"><span style="color:${(COL as any)[k]};font-weight:bold">●</span> <b style="color:#333">${n}</b> · ${esc(uno[k].medio)}: <a href="${esc(uno[k].url)}" style="color:#111">${esc(uno[k].titulo)}</a></td></tr>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${fila("izq", "Izquierda")}${fila("cen", "Centro")}${fila("der", "Derecha")}</table>`;
}
function pieza(h: any, n: number) {
  const ciego = h.punto_ciego ? `<span style="font:bold 11px Arial,sans-serif;color:#8f5400;text-transform:uppercase;letter-spacing:.06em">Poca cobertura en la ${h.punto_ciego}</span><br>` : "";
  const foto = h.imagen ? `<img src="${esc(h.imagen)}" width="560" alt="" style="width:100%;max-width:560px;height:auto;border-radius:8px;display:block;margin:0 0 12px">` : "";
  return `<tr><td style="padding:22px 0;border-top:1px solid #e6e6e3">
    ${n === 1 ? foto : ""}
    <div style="font:12px Arial,sans-serif;color:#888;margin-bottom:6px">${n} · ${h.total} medios</div>
    ${ciego}
    <div style="font:bold 20px/1.25 Georgia,serif;color:#111;margin:4px 0 12px">${esc(h.titulo)}</div>
    ${barra(h)}
    <div style="height:10px"></div>
    ${porLado(h)}
  </td></tr>`;
}
function correoSemanal(top: any[], ciegos: any[], fecha: string, baja: string, gestionar = `${WEB}#boletin`) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px"><tr><td style="padding:28px 28px 8px">
    <img src="${WEB}logo-correo.png" width="190" height="36" alt="Vista Plena" style="display:block;border:0;height:36px;width:190px">
    <div style="font:13px Arial,sans-serif;color:#888;margin-top:4px">La semana en Vista Plena · ${esc(fecha)}</div>
    <p style="font:15px/1.5 Arial,sans-serif;color:#3d4047;margin:16px 0 0">Las ${top.length} historias que más medios contaron esta semana, con quién las contó y cómo las tituló cada lado. Al final, las que casi solo contó un lado.</p>
  </td></tr>
  <tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${top.map((h, i) => pieza(h, i + 1)).join("")}</table></td></tr>
  ${ciegos.length ? `<tr><td style="padding:8px 28px 0"><div style="font:900 18px Arial,sans-serif;color:#111;border-top:3px solid #111;padding-top:16px">Puntos ciegos</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${ciegos.map((h) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e6e6e3"><span style="font:bold 11px Arial,sans-serif;color:#8f5400;text-transform:uppercase">Poca cobertura en la ${h.punto_ciego}</span><div style="font:bold 16px/1.3 Georgia,serif;color:#111;margin:4px 0 8px">${esc(h.titulo)}</div>${barra(h)}</td></tr>`).join("")}</table></td></tr>` : ""}
  <tr><td style="padding:24px 28px 28px" align="center"><a href="${WEB}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font:bold 14px Arial,sans-serif;padding:12px 22px;border-radius:999px">Ver la portada completa</a></td></tr>
  </table>
  <p style="font:12px/1.5 Arial,sans-serif;color:#888;max-width:560px;margin:16px auto 0">Recibes este correo porque te suscribiste en Vista Plena. <a href="${gestionar}" style="color:#888">Recibir cada mañana lo que no publican tus medios</a> · <a href="${baja}" style="color:#888">Darme de baja</a> · <a href="${WEB}metodologia.html" style="color:#888">Cómo lo hacemos</a></p>
  </td></tr></table></body></html>`;
}
const correoConfirmar = (enlace: string, diario = false) => `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f2;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px"><tr><td style="padding:28px">
    <img src="${WEB}logo-correo.png" width="170" height="32" alt="Vista Plena" style="display:block;border:0;height:32px;width:170px">
    <p style="font:16px/1.5 Arial,sans-serif;color:#3d4047">${diario
      ? "Confirma que quieres recibir cada mañana, a las 7:30, las noticias políticas que han contado varios medios y ninguno de los que lees. Solo te escribimos los días que hay alguna."
      : "Confirma que quieres recibir cada viernes el resumen de la semana: las historias que más medios contaron, quién las contó y cuáles contó casi solo un lado."}</p>
    <p style="margin:24px 0"><a href="${enlace}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font:bold 15px Arial,sans-serif;padding:13px 24px;border-radius:999px">Confirmar suscripción</a></p>
    <p style="font:13px/1.5 Arial,sans-serif;color:#888">Si no has sido tú, ignora este correo y no volveremos a escribirte.</p>
  </td></tr></table></td></tr></table></body></html>`;

// ---------- Boletín personal (9/11) ----------
const correoCambiar = (enlace: string) => `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff"><tr><td style="padding:32px">
    <img src="${WEB}logo-correo.png" width="190" height="36" alt="Vista Plena" style="display:block;border:0;height:36px;width:190px">
    <p style="font:16px/1.5 Arial,sans-serif;color:#3d4047;margin:20px 0">Ya estás suscrito al boletín. Para elegir tus medios o cambiar cuándo lo recibes, entra en este enlace. Si no lo has pedido tú, ignora este correo: no cambiaremos nada.</p>
    <a href="${enlace}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font:bold 15px Arial,sans-serif;padding:14px 24px">Cambiar mi boletín</a>
  </td></tr></table></td></tr></table></body></html>`;
async function mediosValidos(lista: unknown): Promise<string[] | null> {
  if (lista == null) return [];
  if (!Array.isArray(lista)) return null;
  const pedidos = [...new Set(lista.map((x) => String(x).trim()).filter(Boolean))];
  if (pedidos.length > 5) return null;
  if (!pedidos.length) return [];
  const { data } = await db.from("medios").select("nombre").eq("activo", true).in("nombre", pedidos);
  const ok = new Set((data ?? []).map((m: any) => m.nombre));
  return pedidos.every((p) => ok.has(p)) ? pedidos : null;
}
const ocultar = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, "$1***$2");
const urlHistoria = (id: number) => `${WEB}historia.html?id=${id}`;
function cuenta(h: any) {
  const n: Record<string, Set<string>> = { izq: new Set(), cen: new Set(), der: new Set() };
  for (const a of h.articulos ?? []) n[a.orientacion < 0 ? "izq" : a.orientacion > 0 ? "der" : "cen"].add(a.medio);
  return { izq: n.izq.size, cen: n.cen.size, der: n.der.size };
}
function correoDiario(o: { nombres: string[]; tuyos: any[]; reves: any[]; mas: any[]; fecha: string; T: Record<string, number>; gestionar: string; baja: string; mios: Set<string> }) {
  const cifras = (h: any) => { const n = cuenta(h); return `${h.total} medios · ${n.izq} de ${o.T.izq} de izquierda · ${n.cen} de ${o.T.cen} de centro · ${n.der} de ${o.T.der} de derecha`; };
  const item = (h: any) => `<tr><td style="padding:18px 0;border-top:1px solid #e6e6e3">
    ${h.punto_ciego ? `<span style="font:bold 11px Arial,sans-serif;color:#8f5400;text-transform:uppercase;letter-spacing:.06em">Poca cobertura en la ${h.punto_ciego}</span><br>` : ""}
    <a href="${urlHistoria(h.id)}" style="display:block;font:bold 18px/1.3 Arial,sans-serif;color:#111;text-decoration:none;margin:4px 0 10px">${esc(h.titulo)}</a>
    ${barra(h)}
    <div style="font:12px/1.5 Arial,sans-serif;color:#5f636b;margin:6px 0 8px">${cifras(h)}</div>
    ${porLado(h)}
  </td></tr>`;
  const reves = (h: any) => {
    const tuyo = (h.articulos ?? []).find((a: any) => o.mios.has(a.medio));
    const n = cuenta(h), falta = h.punto_ciego === "izquierda" ? `${n.izq} de ${o.T.izq} medios de izquierda` : `${n.der} de ${o.T.der} medios de derecha`;
    return `<tr><td style="padding:12px 0;border-top:1px solid #e6e6e3"><a href="${urlHistoria(h.id)}" style="font:bold 16px/1.3 Arial,sans-serif;color:#111;text-decoration:none">${esc(h.titulo)}</a>
      <div style="font:12px/1.5 Arial,sans-serif;color:#5f636b;margin-top:4px">Lo publicó ${esc(tuyo?.medio ?? "uno de tus medios")} · ${falta}</div></td></tr>`;
  };
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff"><tr><td style="padding:28px 28px 8px">
    <img src="${WEB}logo-correo.png" width="190" height="36" alt="Vista Plena" style="display:block;border:0;height:36px;width:190px">
    <div style="font:13px Arial,sans-serif;color:#5f636b;margin-top:4px">${esc(o.fecha)}</div>
    <div style="font:bold 24px/1.15 Georgia,serif;color:#111;margin:18px 0 0">${o.tuyos.length === 1 ? "Una noticia que tus medios no han publicado" : `${o.tuyos.length} noticias que tus medios no han publicado`}</div>
    <p style="font:15px/1.5 Arial,sans-serif;color:#3d4047;margin:12px 0 0">Lees ${esc(o.nombres.join(", ").replace(/, ([^,]*)$/, " y $1"))}. En las últimas 24 horas, estas noticias políticas las han contado varios medios y ninguno de los tuyos. <a href="${o.gestionar}" style="color:#111">Cambiar mis medios</a></p>
  </td></tr>
  <tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${o.tuyos.map(item).join("")}</table></td></tr>
  ${o.reves.length ? `<tr><td style="padding:18px 28px 0"><div style="font:bold 18px/1.2 Georgia,serif;color:#111;border-top:3px solid #111;padding-top:16px">Y al revés: lo que contaron los tuyos y un lado apenas</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${o.reves.map(reves).join("")}</table></td></tr>` : ""}
  ${o.mas.length ? `<tr><td style="padding:18px 28px 0"><div style="font:bold 18px/1.2 Georgia,serif;color:#111;border-top:3px solid #111;padding-top:16px">Lo más contado</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${o.mas.map((h) => `<tr><td style="padding:10px 0;border-top:1px solid #e6e6e3"><a href="${urlHistoria(h.id)}" style="font:bold 15px/1.3 Arial,sans-serif;color:#111;text-decoration:none">${esc(h.titulo)}</a> <span style="font:12px Arial,sans-serif;color:#5f636b">· ${h.total} medios</span></td></tr>`).join("")}</table></td></tr>` : ""}
  <tr><td style="padding:24px 28px 28px" align="center"><a href="${WEB}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font:bold 14px Arial,sans-serif;padding:12px 22px">Ver la portada</a></td></tr>
  </table>
  <p style="font:12px/1.5 Arial,sans-serif;color:#5f636b;max-width:560px;margin:16px auto 0">Recibes este correo porque lo pediste en Vista Plena. <a href="${o.gestionar}" style="color:#5f636b">Cambiar mis medios o pasar al resumen de los viernes</a> · <a href="${o.baja}" style="color:#5f636b">Darme de baja</a> · <a href="${WEB}metodologia.html" style="color:#5f636b">Cómo lo hacemos</a></p>
  </td></tr></table></body></html>`;
}

// ---------- Programa ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const accion = u.searchParams.get("accion");
  try {
    if (accion === "alta") {
      const cuerpo: any = await req.json().catch(() => ({}));
      const correo = String(cuerpo.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 200) return json({ ok: false, error: "Escribe un correo válido." }, 400);
      const frecuencia = cuerpo.frecuencia === "diario" ? "diario" : "semanal";
      const medios = await mediosValidos(cuerpo.medios);
      if (medios === null) return json({ ok: false, error: "Elige entre 1 y 5 medios de la lista." }, 400);
      if (frecuencia === "diario" && !medios.length) return json({ ok: false, error: "Para el correo de cada mañana, elige al menos un medio que leas." }, 400);
      if (medios.length && cuerpo.consiento !== true) return json({ ok: false, error: "Marca la casilla para que podamos guardar qué medios lees." }, 400);
      const { data: previo } = await db.from("suscriptores").select("*").eq("email", correo).maybeSingle();
      if (previo?.confirmado && !previo.baja_en) {
        // Ya suscrito y pide otra cosa (por ejemplo, pasar del semanal al diario): no se cambia desde aquí, porque cualquiera
        // podría escribir su correo; se le manda el enlace para cambiarlo él mismo (como mucho uno cada 10 minutos)
        const igual = frecuencia === previo.frecuencia && medios.join("|") === (previo.medios ?? []).join("|");
        if (igual) return json({ ok: true, estado: "ya" });
        if (previo.ultimo_aviso && Date.now() - +new Date(previo.ultimo_aviso) < 10 * 60e3) return json({ ok: true, estado: "cambiar" });
        await db.from("suscriptores").update({ ultimo_aviso: new Date().toISOString() }).eq("email", correo);
        await enviarCorreos([{ to: correo, subject: "Cambia tu boletín de Vista Plena", html: correoCambiar(`${WEB}boletin-medios.html?t=${previo.token}`) }]);
        return json({ ok: true, estado: "cambiar" });
      }
      // Para evitar abusos, como mucho un correo de confirmación cada 10 minutos por dirección
      if (previo?.ultimo_aviso && Date.now() - +new Date(previo.ultimo_aviso) < 10 * 60e3) return json({ ok: true, estado: "pendiente" });
      const { data: s } = await db.from("suscriptores")
        .upsert({ email: correo, ultimo_aviso: new Date().toISOString(), baja_en: null, frecuencia,
          medios: medios.length ? medios : null, consentimiento_medios: medios.length ? new Date().toISOString() : null }, { onConflict: "email" }).select("token").single();
      await enviarCorreos([{ to: correo, subject: "Confirma tu suscripción a Vista Plena", html: correoConfirmar(`${FUNC}?accion=confirmar&token=${s!.token}`, frecuencia === "diario") }]);
      return json({ ok: true, estado: "pendiente" });
    }

    if (accion === "confirmar" || accion === "baja") {
      const token = u.searchParams.get("token") ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(token)) return volver("error");
      const cambios = accion === "confirmar"
        ? { confirmado: true, confirmado_en: new Date().toISOString(), baja_en: null }
        : { confirmado: false, baja_en: new Date().toISOString(), medios: null, consentimiento_medios: null }; // al darse de baja se borra qué medios lee
      const { data } = await db.from("suscriptores").update(cambios).eq("token", token).select("id");
      if (req.method === "POST") return new Response("ok", { headers: CORS }); // baja con un clic desde el gestor de correo
      return volver(data?.length ? (accion === "confirmar" ? "confirmado" : "baja") : "error");
    }

    // Página boletin-medios.html: ver y cambiar los medios y la frecuencia con el token del enlace del correo
    if (accion === "datos" || accion === "cambiar") {
      const cuerpo: any = accion === "cambiar" ? await req.json().catch(() => ({})) : {};
      const token = String(accion === "cambiar" ? cuerpo.token ?? "" : u.searchParams.get("token") ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ ok: false, error: "El enlace no es válido." }, 400);
      const { data: s } = await db.from("suscriptores").select("email,medios,frecuencia,confirmado,baja_en").eq("token", token).maybeSingle();
      if (!s) return json({ ok: false, error: "El enlace no es válido o ha caducado." }, 404);
      if (accion === "datos") return json({ ok: true, email: ocultar(s.email), medios: s.medios ?? [], frecuencia: s.frecuencia, activo: !!s.confirmado && !s.baja_en });
      const frecuencia = cuerpo.frecuencia === "diario" ? "diario" : "semanal";
      const medios = await mediosValidos(cuerpo.medios);
      if (medios === null) return json({ ok: false, error: "Elige entre 1 y 5 medios de la lista." }, 400);
      if (frecuencia === "diario" && !medios.length) return json({ ok: false, error: "Para el correo de cada mañana, elige al menos un medio que leas." }, 400);
      if (medios.length && cuerpo.consiento !== true) return json({ ok: false, error: "Marca la casilla para que podamos guardar qué medios lees." }, 400);
      await db.from("suscriptores").update({ frecuencia, medios: medios.length ? medios : null, consentimiento_medios: medios.length ? new Date().toISOString() : null,
        confirmado: true, baja_en: null }).eq("token", token);
      return json({ ok: true });
    }

    // Cada mañana: a cada suscriptor del correo diario, lo que sus medios no han publicado (solo si hay algo)
    if (accion === "diario") {
      if (!(await esInterna(req))) return noInterna();
      const prueba = u.searchParams.get("prueba");
      const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
      // El programa se llama a las 5:30 y a las 6:30 UTC para que sea las 7:30 en Madrid en invierno y en verano;
      // antes de las 7:00 de Madrid no se envía, y el segundo intento del día no repite (envios)
      const horaMadrid = +new Date().toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false });
      if (!prueba && horaMadrid < 7) return json({ ok: true, estado: "aún es pronto" });
      const { data: P } = await db.from("portada_m").select("id,titulo,total,pct_izq,pct_cen,pct_der,punto_ciego,articulos,actualizada,creada")
        .gte("actualizada", new Date(Date.now() - 24 * 3600e3).toISOString()).gte("creada", new Date(Date.now() - 48 * 3600e3).toISOString())
        .gte("total", 6).order("total", { ascending: false }).limit(150);
      const ids = (P ?? []).map((h: any) => h.id);
      const { data: info } = ids.length ? await db.from("historias").select("id,ia_politica,ia_ambito,ia_tipo").in("id", ids) : { data: [] as any[] };
      const I = new Map((info ?? []).map((x: any) => [x.id, x]));
      const politicas = (P ?? []).filter((h: any) => { const x: any = I.get(h.id); return x?.ia_politica && x.ia_ambito !== "fuera" && x.ia_tipo !== "ligera"; });
      const masTodas = (P ?? []).filter((h: any) => (I.get(h.id) as any)?.ia_tipo !== "ligera").slice(0, 10);
      const { data: M } = await db.from("medios").select("orientacion").eq("activo", true);
      const T = { izq: 0, cen: 0, der: 0 } as Record<string, number>;
      for (const m of M ?? []) T[m.orientacion < 0 ? "izq" : m.orientacion > 0 ? "der" : "cen"]++;
      let q = db.from("suscriptores").select("email,token,medios").eq("confirmado", true).is("baja_en", null).eq("frecuencia", "diario");
      if (prueba) q = db.from("suscriptores").select("email,token,medios").eq("email", prueba.toLowerCase());
      else {
        const { data: hecho } = await db.from("envios").insert({ fecha: hoy, tipo: "diario" }).select("fecha");
        if (!hecho?.length) return json({ ok: true, estado: "ya enviado hoy" });
      }
      const { data: subs } = await q;
      const fecha = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" });
      const lista: { to: string; subject: string; html: string; baja?: string }[] = [];
      for (const s of subs ?? []) {
        const mios = new Set<string>(s.medios ?? []);
        if (!mios.size) continue;
        const publica = (h: any) => (h.articulos ?? []).some((a: any) => mios.has(a.medio));
        const tuyos = politicas.filter((h: any) => !publica(h)).slice(0, 5);
        if (!tuyos.length) continue;
        const reves = politicas.filter((h: any) => h.punto_ciego && publica(h)).slice(0, 3);
        const vistas = new Set([...tuyos, ...reves].map((h: any) => h.id));
        const mas = masTodas.filter((h: any) => !vistas.has(h.id)).slice(0, 3);
        const baja = `${FUNC}?accion=baja&token=${s.token}`, gestionar = `${WEB}boletin-medios.html?t=${s.token}`;
        lista.push({ to: s.email, subject: `Lo que tus medios no te han contado · ${fecha}`, baja,
          html: correoDiario({ nombres: [...mios], tuyos, reves, mas, fecha: fecha.charAt(0).toUpperCase() + fecha.slice(1), T, gestionar, baja, mios }) });
      }
      const n = lista.length ? await enviarCorreos(lista) : 0;
      if (!prueba) await db.from("envios").update({ enviados: n }).eq("fecha", hoy).eq("tipo", "diario");
      return json({ ok: true, enviados: n, suscriptores: subs?.length ?? 0, politicas: politicas.length, prueba: !!prueba });
    }

    if (accion === "enviar") {
      if (!(await esInterna(req))) return noInterna();
      const prueba = u.searchParams.get("prueba"); // envía solo a un suscriptor confirmado, sin contar como envío del día
      const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
      const { data: H } = await db.from("portada_v2").select("titulo,total,voces,pct_izq,pct_cen,pct_der,punto_ciego,imagen,articulos,actualizada")
        .gte("actualizada", new Date(Date.now() - 7 * 864e5).toISOString()).order("voces", { ascending: false }).limit(80);
      const top = (H ?? []).slice(0, 7);
      const ciegos = (H ?? []).filter((h) => h.punto_ciego && (h.total ?? 0) >= 6 && !top.includes(h)).slice(0, 4);
      if (top.length < 3) return json({ ok: false, error: "No hay suficientes historias para el resumen" });
      const fecha = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "Europe/Madrid" });
      const asunto = `La semana en Vista Plena · ${top[0].titulo.slice(0, 70)}`;

      let q = db.from("suscriptores").select("email,token").eq("confirmado", true).is("baja_en", null).neq("frecuencia", "diario");
      if (prueba) q = q.eq("email", prueba.toLowerCase());
      else {
        // Una sola vez por fecha, aunque alguien vuelva a llamar a la función
        const { data: hecho } = await db.from("envios").insert({ fecha: hoy }).select("fecha");
        if (!hecho?.length) return json({ ok: true, estado: "ya enviado hoy" });
      }
      const { data: subs } = await q;
      const lista = (subs ?? []).map((s) => {
        const baja = `${FUNC}?accion=baja&token=${s.token}`;
        return { to: s.email, subject: asunto, html: correoSemanal(top, ciegos, fecha, baja, `${WEB}boletin-medios.html?t=${s.token}`), baja };
      });
      const n = lista.length ? await enviarCorreos(lista) : 0;
      if (!prueba) await db.from("envios").update({ enviados: n }).eq("fecha", hoy).eq("tipo", "semanal");
      return json({ ok: true, enviados: n, prueba: !!prueba });
    }

    return json({ ok: false, error: "Acción desconocida" }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
