// Vista Plena — piezas comunes a todas las páginas: menú y funciones para pintar una historia.
const SUPA = { url: "https://yzreenyaerjitbfxsiah.supabase.co", key: "sb_publishable_1As_Elit5MJVUOZFOLeDjA_YMVv6jjF" };
const CAMPOS = "id,creada,titulo,total,voces,imagen,imagen_medio,pct_izq,pct_cen,pct_der,punto_ciego,actualizada,articulos,entradilla,entradilla_medio,anterior,tema_id,tambien,en_portadas,medios_12h";
const ETIQUETA = { "-2": "Izquierda", "-1": "Centroizquierda", "0": "Centro", "1": "Centroderecha", "2": "Derecha" };
const lado = o => o < 0 ? "izq" : o > 0 ? "der" : "cen";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// Direcciones limpias de cada noticia y cada tema (vistaplena.es/noticia/anne-carson-gana-el-nobel-1778/).
// Las páginas se generan cada hora; si una aún no existe, la página 404 lleva a la versión dinámica.
// La misma función está en seo/generar.py: si cambia una, debe cambiar la otra.
const slug = t => {
  let s = String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 70) { s = s.slice(0, 70); if (s.includes("-")) s = s.slice(0, s.lastIndexOf("-")); }
  return s.replace(/-+$/, "") || "noticia";
};
const urlNoticia = (id, titulo) => `/noticia/${slug(titulo)}-${id}/`;
const urlTema = (id, nombre) => `/tema/${slug(nombre)}-${id}/`;
// Asuntos: temas grandes que agrupa la IA («Protestas en Francia»). Para el lector son temas; su dirección lleva una «a»
const urlAsunto = (id, nombre) => `/tema/${slug(nombre)}-a${id}/`;
const enlace = h => urlNoticia(h.id, h.t);

// Convierte una fila de la base de datos en el formato corto que usan las páginas
const mapear = x => ({ id: x.id, t: x.titulo, tot: x.total, voces: x.voces, pi: x.pct_izq, pc: x.pct_cen, pd: x.pct_der, ciego: x.punto_ciego, act: x.actualizada, f: x.imagen, fm: x.imagen_medio,
  ent: x.entradilla, entm: x.entradilla_medio, cr: x.creada, ant: x.anterior, tema: x.tema_id, port: x.en_portadas || 0, m12: x.medios_12h || 0,
  tb: (x.tambien || []).map(a => ({ m: a.medio, o: a.orientacion, t: a.titulo, u: a.url, p: a.publicado })),
  a: (x.articulos || []).map(a => ({ m: a.medio, o: a.orientacion, t: a.titulo, u: a.url, g: a.grupo, p: a.publicado })) });

async function pedir(ruta){
  const r = await fetch(`${SUPA.url}/rest/v1/${ruta}`, { headers: { apikey: SUPA.key, Authorization: "Bearer " + SUPA.key } });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

function haceCuanto(iso){
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `hace ${Math.max(m,1)} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h/24)} d`;
}
function lectura(h){
  if (h.ciego === "izquierda") return `<strong>Poca cobertura en la izquierda.</strong> Casi ningún medio de izquierdas la ha publicado.`;
  if (h.ciego === "derecha") return `<strong>Poca cobertura en la derecha.</strong> Casi ningún medio de derechas la ha publicado.`;
  const d = h.pi - h.pd;
  if (d >= 20) return `La cuentan <strong>más los medios de izquierdas</strong>.`;
  if (d <= -20) return `La cuentan <strong>más los medios de derechas</strong>.`;
  return `<strong>Cobertura repartida</strong> entre izquierda, centro y derecha.`;
}
// Punto ciego con contexto: el lado que no cuenta esta noticia sí ha contado otras del mismo tema grande.
// Entonces lo que falta es este hecho concreto, no el tema entero (ver la vista ciegos_contexto)
function contextoCiego(c, h){
  if (!c || !h.ciego || c.medios_lado < 3) return "";
  return `Los medios de ${h.ciego === "izquierda" ? "izquierdas" : "derechas"} sí han contado otras noticias del tema <a href="${urlAsunto(c.asunto_id, c.asunto)}">${esc(c.asunto)}</a> (${c.medios_lado} medios). Lo que apenas cuentan es este hecho concreto.`;
}
function barra(h, grande){
  const seg = (cls, v, et) => v ? `<div class="${cls}" style="flex-grow:${v}" title="${et}: ${v} %"></div>` : "";
  return `<div class="barra${grande ? " grande" : ""}" role="img" aria-label="Izquierda ${h.pi} %, centro ${h.pc} %, derecha ${h.pd} %">${seg("b-izq",h.pi,"Izquierda")}${seg("b-cen",h.pc,"Centro")}${seg("b-der",h.pd,"Derecha")}</div>`;
}
const pct = h => `<div class="pct"><span class="i">Izquierda <b>${h.pi} %</b></span><span>Centro <b>${h.pc} %</b></span><span class="d">Derecha <b>${h.pd} %</b></span></div>`;
const meta = h => `<div class="meta"><span>${h.tot} medios</span><span>${haceCuanto(h.act)}</span>${h.ciego ? `<span class="chip">La ${h.ciego} apenas la cuenta</span>` : ""}</div>`;
// Un titular por medio. Dentro de cada lado, primero los que mejor cuentan el hecho de la noticia (los que comparten
// más palabras con su título) y, a igualdad, los más recientes. Así arriba sale el hecho y no la última reacción.
const _norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const _VACIAS = new Set("para pero como sobre entre desde hasta tras ante contra segun esta este estos estas tiene tienen hace porque cuando donde sera seran sido".split(" "));
function recientes(h){
  const clave = new Set(_norm(h.t).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 4 && !_VACIAS.has(w)));
  const nota = a => _norm(a.t).split(/[^a-z0-9ñ]+/).filter(w => clave.has(w)).length;
  const porMedio = new Map();
  for (const a of h.a) { const v = porMedio.get(a.m); if (!v || nota(a) > nota(v) || (nota(a) === nota(v) && new Date(a.p || 0) > new Date(v.p || 0))) porMedio.set(a.m, a); }
  return [...porMedio.values()].sort((x, y) => (nota(y) - nota(x)) || (new Date(y.p || 0) - new Date(x.p || 0)));
}
function bloques(h, max = 99){
  const g = { izq: [], cen: [], der: [] };
  for (const a of recientes(h)) g[lado(a.o)].push(a);
  const b = (k, n, c) => `<div class="bloque"><div class="lado eti"><i style="background:${c}"></i>${n}</div>${g[k].length ? `<ul>${g[k].map((a, i) => `<li${i >= max ? " hidden" : ""}><span class="medio">${esc(a.m)}</span><a href="${esc(a.u)}" data-m="${esc(a.m)}" target="_blank" rel="noopener">${esc(a.t)}</a></li>`).join("")}</ul>${g[k].length > max ? `<button class="mas">Ver ${g[k].length - max} más</button>` : ""}` : `<p class="vacio">Ningún medio de este lado la ha publicado.</p>`}</div>`;
  return b("izq","Izquierda","var(--izq)") + b("cen","Centro","var(--cen)") + b("der","Derecha","var(--der)");
}
// Foto del propio medio, enlazada desde su web y con crédito. Si no carga, desaparece.
function foto(h, extra = ""){
  if (!h.f) return "";
  return `<figure class="foto ${extra}"><img src="${esc(h.f)}" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async"
    onload="this.classList.add('ok')" onerror="this.closest('figure').remove()"><figcaption>Foto: ${esc(h.fm)}</figcaption></figure>`;
}

// «Ver más» titulares de un lado
document.addEventListener("click", e => {
  const b = e.target.closest(".mas"); if (!b) return;
  b.previousElementSibling.querySelectorAll("li[hidden]").forEach(li => li.hidden = false);
  b.remove();
});

// Menú desplegable
(() => {
  const btn = document.getElementById("abrirMenu"), menu = document.getElementById("menu");
  if (!btn || !menu) return;
  const poner = abierto => {
    menu.hidden = !abierto;
    btn.setAttribute("aria-expanded", abierto);
    btn.querySelector(".hamb-txt").textContent = abierto ? "Cerrar" : "Menú";
    document.body.classList.toggle("menu-abierto", abierto);
  };
  btn.addEventListener("click", () => poner(menu.hidden));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { poner(false); btn.focus(); } });
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) poner(false); });
  menu.addEventListener("click", e => { if (e.target.closest("a")) poner(false); });
  // En pantallas anchas los cajones van abiertos
  if (matchMedia("(min-width:900px)").matches) menu.querySelectorAll(".m-cajon").forEach(d => d.open = true);
})();

// Información bajo demanda: un botón «i» que abre una explicación al tocarlo (funciona igual en móvil y con teclado).
// Para explicaciones de cómo se hace algo; lo imprescindible para entender un dato se queda siempre a la vista.
let INFO_N = 0;
function info(html, etiqueta = "Más información"){
  const id = "info" + (++INFO_N);
  return `<span class="info"><button type="button" class="info-b" aria-expanded="false" aria-controls="${id}" aria-label="${etiqueta}">i</button><span class="info-p" id="${id}" role="note" hidden>${html}</span></span>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest(".info-b");
  document.querySelectorAll(".info-b[aria-expanded='true']").forEach(x => {
    if (x !== b && !x.parentElement.contains(e.target)) { x.setAttribute("aria-expanded", "false"); document.getElementById(x.getAttribute("aria-controls")).hidden = true; }
  });
  if (!b) return;
  const p = document.getElementById(b.getAttribute("aria-controls")), abrir = p.hidden;
  p.hidden = !abrir; b.setAttribute("aria-expanded", String(abrir));
  // En pantallas estrechas el recuadro ocupa el ancho de la pantalla, justo debajo del botón
  if (abrir && innerWidth < 640) { const r = b.getBoundingClientRect(); Object.assign(p.style, { position: "fixed", left: "16px", right: "16px", width: "auto", top: (r.bottom + 8) + "px" }); }
  else p.removeAttribute("style");
});
addEventListener("scroll", () => document.querySelectorAll(".info-b[aria-expanded='true']").forEach(x => { if (innerWidth < 640) { x.setAttribute("aria-expanded", "false"); document.getElementById(x.getAttribute("aria-controls")).hidden = true; } }), { passive: true });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".info-b[aria-expanded='true']").forEach(x => { x.setAttribute("aria-expanded", "false"); document.getElementById(x.getAttribute("aria-controls")).hidden = true; x.focus(); });
});

// Cuántos medios leemos de cada lado (para decir «9 de los 13 medios de izquierda»). Se guarda un día en el navegador.
async function totalesMedios(){
  try { const c = JSON.parse(localStorage.getItem("vp-totales") || "null"); if (c && Date.now() - c.t < 864e5) return c.v; } catch (e) {}
  const m = await pedir("medios?select=orientacion&activo=eq.true");
  const v = { izq: 0, cen: 0, der: 0 };
  for (const x of m) v[lado(x.orientacion)]++;
  try { localStorage.setItem("vp-totales", JSON.stringify({ t: Date.now(), v })); } catch (e) {}
  return v;
}
// «La publican 9 de los 13 medios de izquierda, 3 de los 11 de centro y 12 de los 14 de derecha que leemos»
function frasePorBloque(h, T){
  const n = { izq: new Set(), cen: new Set(), der: new Set() };
  for (const a of h.a) n[lado(a.o)].add(a.m);
  const t = k => `<b>${n[k].size}</b> de los ${T[k]}`;
  return `La publican ${t("izq")} medios de izquierda, ${t("cen")} de centro y ${t("der")} de derecha que leemos.`;
}

// 8/11: el botón ⓘ mide 20 px; la zona que se puede tocar se amplía a 44 px sin cambiar cómo se ve
document.head.insertAdjacentHTML("beforeend", "<style>.info-b{position:relative}.info-b::after{content:'';position:absolute;inset:-12px}</style>");

// Cinco eventos anónimos en GoatCounter (sin cookies): sirven para saber si la gente compara, abre fuentes, comparte, se suscribe y busca.
function evento(nombre){
  try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "ev/" + nombre, title: nombre, event: true }); } catch (e) {}
}
document.addEventListener("click", e => {
  const t = e.target.closest("a,button"); if (!t) return;
  if (t.matches(".ver,.mas,.ver-todos,.mas-lado,[data-ev='compara']")) evento("compara");
  else if (t.matches(".c-btn")) evento("compartir");
  else if (t.matches("a[target='_blank']") && t.closest(".bloque,.fuentes,.hist-fuentes,li") && !/wa\.me|x\.com|t\.me/.test(t.href)) evento("fuente");
}, true);

// Boletín: formulario corto que se puede poner al final de cualquier página (<div class="bol-corto"></div>)
const BOLETIN_URL = `${SUPA.url}/functions/v1/boletin`;
async function apuntarBoletin(correo, extra = {}){
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return "Escribe un correo válido, por ejemplo nombre@ejemplo.com.";
  try {
    const r = await fetch(`${BOLETIN_URL}?accion=alta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: correo, ...extra }) });
    const d = await r.json();
    if (!d.ok) return d.error || "No hemos podido apuntarte ahora mismo. Inténtalo de nuevo en unos minutos.";
    evento(extra.frecuencia === "diario" ? "boletin-diario" : "boletin");
    if (d.estado === "ya") return "Ya estabas suscrito. ¡Gracias!";
    if (d.estado === "cambiar") return "Ya estabas suscrito. Te hemos enviado un enlace a tu correo para cambiar tus medios o cuándo lo recibes.";
    return "Revisa tu correo y pulsa «Confirmar suscripción». Si no lo ves, mira en spam.";
  } catch (err) { return "No hemos podido apuntarte ahora mismo. Inténtalo de nuevo en unos minutos."; }
}
document.querySelectorAll(".bol-corto").forEach((caja, i) => {
  caja.innerHTML = `<form novalidate><label for="bolc${i}"><b>La semana en Vista Plena.</b> Cada viernes, las historias que más medios contaron y las que solo contó un lado.${location.pathname.startsWith("/boletin") ? "" : ' <a href="/boletin/">Ver un ejemplo</a>'}</label>
    <div class="fila"><input id="bolc${i}" type="email" autocomplete="email" placeholder="nombre@ejemplo.com" required><button type="submit">Suscribirme</button></div>
    <p class="msg" role="status" aria-live="polite"></p><p class="legal">Gratis. Te pediremos confirmarlo por correo y puedes darte de baja con un clic. <a href="/privacidad.html">Privacidad</a>.</p>
    <p class="legal"><b>¿Prefieres cada mañana lo que no han publicado los medios que lees?</b> <a href="/#boletin">Elige tus medios</a></p></form>`;
  const f = caja.querySelector("form"), msg = caja.querySelector(".msg"), btn = caja.querySelector("button");
  f.addEventListener("submit", async e => {
    e.preventDefault(); btn.disabled = true; msg.textContent = "Enviando…";
    msg.textContent = await apuntarBoletin(caja.querySelector("input").value.trim());
    btn.disabled = false;
  });
});
// Fila de porcentajes con cuántos medios de cada lado la publican, en pequeño debajo («7 de 13 medios»)
function pctCuentas(h, T){
  const n = { izq: new Set(), cen: new Set(), der: new Set() };
  for (const a of h.a) n[lado(a.o)].add(a.m);
  const c = (k, cls, nom, v) => `<span${cls ? ` class="${cls}"` : ""}><span>${nom} <b>${v} %</b></span><small>${n[k].size} de ${T[k]} medios</small></span>`;
  return `<div class="pct cuentas">${c("izq", "i", "Izquierda", h.pi)}${c("cen", "", "Centro", h.pc)}${c("der", "d", "Derecha", h.pd)}</div>`;
}
// La fila de los 38 (20/10): un cuadro por cada medio que leemos, relleno si ha publicado la noticia. Es el dato exacto,
// sin compensar. Desde el 24/10 la barra también reparte medios reales (qué parte de cada lado); solo los puntos ciegos comparan cada lado
// con lo que suele publicar (los medios de derecha publican más noticias en general).
// Reparto de la barra (24/10): qué parte de cada lado publica, normalizado a 100 («7 de 13», «4 de 11», «7 de 14» → 39/26/36)
function repartoLados(i, c, d){
  const T = totalesGuardados() || { izq: 13, cen: 11, der: 14 };
  const a = i / (T.izq || 1), b = c / (T.cen || 1), e = d / (T.der || 1), s = a + b + e || 1;
  const pi = Math.round(100 * a / s), pd = Math.round(100 * e / s);
  return { pi, pd, pc: 100 - pi - pd };
}
function totalesGuardados(){
  try { const c = JSON.parse(localStorage.getItem("vp-totales") || "null"); if (c && c.v) return c.v; } catch (e) {}
  return null;
}
function fila38(h, T){
  if (!T || !h.a || !h.a.length) return "";
  const n = { izq: new Set(), cen: new Set(), der: new Set() };
  for (const a of h.a) n[lado(a.o)].add(a.m);
  const tot = k => Math.max(T[k] || 0, n[k].size);
  const g = (k, cls) => `<span class="f-${cls}" style="flex-grow:${tot(k)}">${Array.from({ length: tot(k) }, (_, i) => `<i${i < n[k].size ? ' class="si"' : ""}></i>`).join("")}</span>`;
  return `<div class="fila38" role="img" aria-label="La publican ${n.izq.size} de los ${tot("izq")} medios de izquierda, ${n.cen.size} de los ${tot("cen")} de centro y ${n.der.size} de los ${tot("der")} de derecha">${g("izq", "i")}${g("cen", "c")}${g("der", "d")}</div>`;
}

// Aspecto: automático (el del móvil), claro u oscuro. Se guarda en este navegador.
(() => {
  const marcar = () => {
    let t = "auto"; try { t = localStorage.getItem("vp-tema") || "auto"; } catch (e) {}
    document.querySelectorAll("[data-tema]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tema === t)));
  };
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-tema]"); if (!b) return;
    const t = b.dataset.tema;
    try { t === "auto" ? localStorage.removeItem("vp-tema") : localStorage.setItem("vp-tema", t); } catch (e) {}
    if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
    marcar();
  });
  marcar();
})();

// Desplegar «Cómo la titula cada lado» (portada)
document.addEventListener("click", e => {
  const b = e.target.closest(".desplegar"); if (!b) return;
  const abrir = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(abrir));
  if (b.classList.contains("asi-bot")) b.parentElement.classList.toggle("abierta", abrir);
  else { const d = b.nextElementSibling; if (d) d.hidden = !abrir; }
  if (abrir) evento("compara");
});

// ---------- Cuentas (11/11): opcionales. La sesión se guarda en este navegador ----------
const CUENTA_URL = `${SUPA.url}/functions/v1/cuenta`;
function sesionVP(){ try { return localStorage.getItem("vp-sesion") || ""; } catch (e) { return ""; } }
function olvidarSesionVP(){ try { ["vp-sesion", "vp-dieta", "vp-dieta-t"].forEach(k => localStorage.removeItem(k)); } catch (e) {} }
// Llamada a la función «cuenta». Con q, lectura (GET); sin q, una acción (POST)
async function cuentaVP(accion, datos = {}, q = null){
  const s = sesionVP(), cab = s ? { "x-sesion": s } : {};
  const r = await fetch(q ? `${CUENTA_URL}?q=${q}` : CUENTA_URL, q ? { headers: cab }
    : { method: "POST", headers: { "Content-Type": "text/plain", ...cab }, body: JSON.stringify({ accion, ...datos }) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && d.error === "sesion") olvidarSesionVP();
  if (!r.ok) { const e = new Error(d.error || String(r.status)); e.detalle = d.error === "sesion" ? "Tu sesión ha caducado. Vuelve a entrar." : d.error; e.estado = r.status; throw e; }
  return d;
}
// Icono de la cuenta en la cabecera, junto a «Buscar»
(() => {
  const bol = document.querySelector(".top .btn-bol");
  if (!bol || document.querySelector(".btn-cuenta")) return;
  const dentro = !!sesionVP(), txt = dentro ? "Mi cuenta" : "Entrar";
  const ic = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4 21c1.4-4 4.4-6 8-6s6.6 2 8 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  bol.insertAdjacentHTML("beforebegin", `<a class="btn-buscar btn-cuenta" style="margin-left:0" href="/cuenta.html" aria-label="${txt}" title="${txt}"${location.pathname === "/cuenta.html" ? ' aria-current="page"' : ""}>${ic}</a>`);
  // En móviles estrechos no cabe en la cabecera: va en el menú, debajo de los atajos
  document.head.insertAdjacentHTML("beforeend", "<style>@media (max-width:440px){.btn-cuenta{display:none!important}}</style>");
  const at = document.querySelector("#menu .m-atajos");
  if (at) at.insertAdjacentHTML("afterend", `<a class="m-cajon m-enlace m-cuenta" href="/cuenta.html">${ic.replace('width="20" height="20" ', 'class="m-ic" ')}${dentro ? "Mi cuenta" : "Entrar en tu cuenta"}<svg class="m-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a>`);
})();
// Dieta de medios: si el lector la activó, al abrir un titular se apunta de qué medio es (solo el medio)
(() => {
  if (!sesionVP()) return;
  let t = 0; try { t = Number(localStorage.getItem("vp-dieta-t") || 0); } catch (e) {}
  // Una vez cada 12 horas se comprueba si la tiene activada (puede haberla cambiado en otro dispositivo)
  if (Date.now() - t > 12 * 3600e3) cuentaVP(null, {}, "estado").then(d => { try { localStorage.setItem("vp-dieta", d.dieta ? "1" : "0"); localStorage.setItem("vp-dieta-t", String(Date.now())); } catch (e) {} }).catch(() => {});
})();
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-m]"); if (!a || !navigator.sendBeacon) return;
  let activa = false; try { activa = localStorage.getItem("vp-dieta") === "1"; } catch (er) {}
  const s = sesionVP(); if (!s || !activa) return;
  navigator.sendBeacon(CUENTA_URL, new Blob([JSON.stringify({ accion: "lectura", medio: a.dataset.m, sesion: s })], { type: "text/plain" }));
}, true);
// Botón «Seguir este tema». clave: «a12» (tema grande) o «34» (tema pequeño)
async function botonSeguir(b, clave){
  if (!b || !/^a?\d+$/.test(clave)) return;
  const volver = location.pathname + location.search;
  if (!sesionVP()) {
    b.outerHTML = `<a class="c-btn seguir" href="/cuenta.html?volver=${encodeURIComponent(volver)}&seguir=${clave}">Seguir este tema</a>`;
    return;
  }
  const poner = sigo => { b.hidden = false; b.setAttribute("aria-pressed", String(sigo)); b.textContent = sigo ? "Sigues este tema" : "Seguir este tema"; b.title = sigo ? "Pulsa para dejar de seguirlo" : "Lo verás en tu cuenta, con las noticias nuevas"; };
  try { poner((await cuentaVP("tema_visita", { tema: clave })).sigo); } catch (e) { if (!sesionVP()) return botonSeguir(b, clave); poner(false); }
  b.addEventListener("click", async () => {
    const quiero = b.getAttribute("aria-pressed") !== "true";
    b.disabled = true;
    try { poner((await cuentaVP("seguir", { tema: clave, seguir: quiero })).sigo); evento(quiero ? "seguir-tema" : "dejar-tema"); }
    catch (e) { b.textContent = e.detalle || "No se ha podido guardar"; }
    b.disabled = false;
  });
}
