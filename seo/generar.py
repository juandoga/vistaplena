#!/usr/bin/env python3
"""Vista Plena — genera, cada hora, las páginas que leen los buscadores y las redes sociales.

La web normal es dinámica: historia.html?id=123 pide los datos al abrirse. Google la puede leer, pero WhatsApp, X o
Telegram no ejecutan código, así que al compartir una noticia solo verían el título genérico. Este programa crea:

- /noticia/<titulo>-<id>/   una página por noticia de los últimos 14 días, con el contenido ya escrito, su título,
                            su descripción, su imagen para redes y sus datos estructurados (schema.org)
- /tema/<nombre>-<id>/      lo mismo para cada tema
- /og/<id>.png              la imagen para redes de cada noticia reciente: titular, un titular de cada lado y el reparto
- /archivo/                 las historias de 10 o más medios se quedan para siempre (las demás caducan a los 14 días)
- /medio/<nombre>/          una ficha por medio: etiqueta, de dónde sale, grado de confianza, cambios y qué ha publicado
Las noticias de menos de 6 medios tienen página, pero con «noindex»: son demasiado pequeñas para que Google las muestre.
- /sitemap.xml y /robots.txt
- /estilos/*.css            los estilos, en un archivo aparte para que cada página pese poco

Uso: python seo/generar.py _site   (copia la web a _site y añade lo generado). Si Supabase no responde,
la web se publica igual, sin las páginas generadas.
"""
import datetime as dt
from zoneinfo import ZoneInfo
import hashlib
import html
import json
import os
import re
import shutil
import sys
import unicodedata
import urllib.request

SUPA = "https://yzreenyaerjitbfxsiah.supabase.co"
KEY = "sb_publishable_1As_Elit5MJVUOZFOLeDjA_YMVv6jjF"  # clave pública de solo lectura
BASE = "https://vistaplena.es"
DIAS = 14          # noticias con página propia
OG_HORAS = 72      # noticias con imagen propia para redes (las demás usan la genérica)
MIN_INDEXAR = 6    # por debajo de estos medios, la página lleva noindex y no va al mapa del sitio
MIN_ARCHIVO = 10   # desde estos medios, la historia se guarda para siempre en /archivo/
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "_site")
NO_COPIAR = {".git", ".github", "seo", "servidor", "README.md", "_site"}
CAMPOS = ("id,creada,titulo,total,voces,izq,cen,der,imagen,imagen_medio,pct_izq,pct_cen,pct_der,punto_ciego,"
          "actualizada,articulos,entradilla,entradilla_medio,tema_id,peso")
MESES = "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split()
fecha = lambda iso: (lambda d: f"{d.day} de {MESES[d.month - 1]}")(dt.datetime.fromisoformat(iso.replace("Z", "+00:00")))
ETIQUETA = {-2: "Izquierda", -1: "Centroizquierda", 0: "Centro", 1: "Centroderecha", 2: "Derecha"}
esc = lambda s: html.escape(str(s or ""), quote=True)


def slug(t):
    """La misma regla que slug() en comun.js: si cambia una, debe cambiar la otra."""
    s = unicodedata.normalize("NFD", str(t or "").lower())
    s = "".join(c for c in s if not ("̀" <= c <= "ͯ"))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > 70:
        s = s[:70]
        if "-" in s:
            s = s[:s.rfind("-")]
    return s.rstrip("-") or "noticia"


url_noticia = lambda id_, t: f"/noticia/{slug(t)}-{id_}/"
url_tema = lambda id_, n: f"/tema/{slug(n)}-{id_}/"


def pedir(ruta):
    req = urllib.request.Request(f"{SUPA}/rest/v1/{ruta}", headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def todo(ruta):
    filas, n = [], 0
    while True:
        lote = pedir(f"{ruta}&limit=500&offset={n}")
        filas += lote
        if len(lote) < 500:
            return filas
        n += 500


def copiar_web():
    if os.path.exists(SALIDA):
        shutil.rmtree(SALIDA)
    os.makedirs(SALIDA)
    for nombre in os.listdir(RAIZ):
        if nombre in NO_COPIAR or nombre.startswith("."):
            continue
        origen = os.path.join(RAIZ, nombre)
        (shutil.copytree if os.path.isdir(origen) else shutil.copy2)(origen, os.path.join(SALIDA, nombre))


def plantilla(nombre):
    """Lee historia.html o tema.html, saca sus estilos a un archivo y añade <base href="/"> para que las rutas
    relativas (fuentes, scripts) funcionen desde /noticia/…/"""
    t = open(os.path.join(SALIDA, nombre), encoding="utf-8").read()
    css = re.search(r"<style>(.*?)</style>", t, re.S).group(1).replace("url(fuentes/", "url(/fuentes/")
    archivo = f"estilos/{nombre.split('.')[0]}-{hashlib.md5(css.encode()).hexdigest()[:8]}.css"
    os.makedirs(os.path.join(SALIDA, "estilos"), exist_ok=True)
    open(os.path.join(SALIDA, archivo), "w", encoding="utf-8").write(css)
    t = re.sub(r"<style>.*?</style>", f'<link rel="stylesheet" href="/{archivo}">', t, count=1, flags=re.S)
    return t.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">', 1)


def montar(t, *, titulo, desc, url, imagen, tipo, jsonld, id_, cuerpo, indexar=True):
    meta = lambda prop, valor: f'<meta property="{prop}" content="{esc(valor)}">'
    # (las sustituciones van con lambda para que una barra invertida en un titular no se interprete)
    t = re.sub(r"<title>.*?</title>", lambda _: f"<title>{esc(titulo)}</title>", t, count=1)
    t = re.sub(r'<meta name="description" content="[^"]*">', lambda _: f'<meta name="description" content="{esc(desc)}">', t, count=1)
    for prop, valor in (("og:type", tipo), ("og:title", titulo), ("og:description", desc), ("og:url", BASE + url), ("og:image", imagen)):
        t = re.sub(rf'<meta property="{prop}" content="[^"]*">', lambda _: meta(prop, valor), t, count=1)
    t = t.replace('<meta name="robots" content="noindex,follow">',
                  ('' if indexar else '<meta name="robots" content="noindex,follow">\n') +
                  f'<link rel="canonical" href="{BASE}{url}">\n'
                  f'<meta name="twitter:title" content="{esc(titulo)}">\n<meta name="twitter:description" content="{esc(desc)}">\n'
                  f'<meta name="twitter:image" content="{esc(imagen)}">\n'
                  f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>', 1)
    t = t.replace("<body>", f'<body data-id="{id_}">', 1)
    return re.sub(r'<article id="art"[^>]*>.*?</article>', lambda _: f'<article id="art" aria-live="polite">{cuerpo}</article>', t, count=1, flags=re.S)


def escribir(url, contenido):
    ruta = os.path.join(SALIDA, url.strip("/"), "index.html")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    open(ruta, "w", encoding="utf-8").write(contenido)


lado = lambda o: "izq" if o < 0 else "der" if o > 0 else "cen"


def lectura(h):
    if h["punto_ciego"] == "izquierda":
        return "Poca cobertura en la izquierda: casi ningún medio de izquierdas la ha publicado."
    if h["punto_ciego"] == "derecha":
        return "Poca cobertura en la derecha: casi ningún medio de derechas la ha publicado."
    d = h["pct_izq"] - h["pct_der"]
    if d >= 20:
        return "La cuentan más los medios de izquierdas."
    if d <= -20:
        return "La cuentan más los medios de derechas."
    return "Cobertura repartida entre izquierda, centro y derecha."


def por_medio(h):
    """El titular más reciente de cada medio, primero lo último"""
    vistos, out = set(), []
    for a in sorted(h["articulos"] or [], key=lambda a: a.get("publicado") or "", reverse=True):
        if a["medio"] not in vistos:
            vistos.add(a["medio"])
            out.append(a)
    return out


# ---------- El titular más distinto de cada lado (lo mismo que hace historia.html) ----------
VACIAS = set("para pero como sobre entre desde hasta tras ante contra segun esta este estos estas tiene tienen hace porque cuando donde sera seran sido".split())


def palabras(t):
    import unicodedata
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "")) if unicodedata.category(c) != "Mn").lower()
    return {w for w in re.split(r"[^a-z0-9ñ]+", t) if len(w) >= 4 and w not in VACIAS}


def comillas(t):
    """Un titular entre comillas españolas; las suyas pasan a ser inglesas"""
    return "«" + str(t).replace("«", "“").replace("»", "”").strip() + "»"


def titular_por_lado(h):
    """Para cada lado, el titular que cuenta el hecho con más palabras propias sin dejar de hablar de él.
    Si todos repiten el título, el primero. Ningún medio: None."""
    base = palabras(h["titulo"])
    minimo = max(3, -(-len(base) * 4 // 10))
    out = {}
    for k in ("izq", "cen", "der"):
        lista = [a for a in (h["articulos"] or []) if lado(a["orientacion"]) == k]
        if not lista:
            out[k] = None
            continue
        def nota(a):
            p = palabras(a["titulo"])
            comun = len(p & base)
            # Si ninguno habla claramente del hecho (historia mal agrupada), el que más se le parece
            return 1000 + len(p) - comun if comun >= minimo else comun
        out[k] = max(lista, key=nota)
    return out


TOTALES = {}


def totales_medios():
    """Cuántos medios activos hay de cada lado («5 de 13»)"""
    if not TOTALES:
        v = {"izq": 0, "cen": 0, "der": 0}
        try:
            for m in todo("medios?select=orientacion&activo=eq.true"):
                v[lado(m["orientacion"])] += 1
        except Exception as e:
            print("Sin totales de medios:", e)
        TOTALES.update(v)
    return TOTALES


def cuentas_lado(h):
    n = {k: 0 for k in ("izq", "cen", "der")}
    for a in por_medio(h):
        n[lado(a["orientacion"])] += 1
    return n


def descripcion(h):
    """Lo que se ve debajo del enlace al compartirlo: cómo la titula cada lado, no solo cuántos la publican"""
    t = titular_por_lado(h)
    partes = [f"{nom}: {comillas(t[k]['titulo'])}" for k, nom in (("izq", "Izquierda"), ("cen", "Centro"), ("der", "Derecha")) if t[k]]
    calla = [nom.lower() for k, nom in (("izq", "Izquierda"), ("der", "Derecha")) if not t[k]]
    base = " · ".join(partes) + (f" · Ningún medio de {calla[0]} la ha publicado." if calla else "")
    base = f"Así la titula cada lado. {base}" if partes else f"La cuentan {h['total']} medios. Así la titula cada lado."
    return base if len(base) <= 300 else base[:297].rstrip() + "…"


def cuerpo_noticia(h, tema, archivada=False):
    m = por_medio(h)
    n = {k: sum(1 for a in m if lado(a["orientacion"]) == k) for k in ("izq", "cen", "der")}
    nombres = {"izq": "Izquierda", "cen": "Centro", "der": "Derecha"}
    bloques = ""
    for k in ("izq", "cen", "der"):
        lista = [a for a in m if lado(a["orientacion"]) == k]
        items = "".join(
            f'<li><span class="medio">{esc(a["medio"])} <span class="ficha">{ETIQUETA[a["orientacion"]]}</span></span>'
            f'<a href="{esc(a["url"])}" target="_blank" rel="noopener">{esc(a["titulo"])}</a></li>' for a in lista)
        bloques += (f'<div class="bloque"><div class="lado eti">{nombres[k]} · {len(lista)}</div>'
                    + (f"<ul>{items}</ul>" if lista else '<p class="vacio">Ningún medio de este lado la ha publicado.</p>') + "</div>")
    ent = (f'<section class="hist-que"><h2>Qué ha pasado</h2><blockquote>{esc(h["entradilla"])}</blockquote>'
           f'<p class="aparte">Entradilla de {esc(h["entradilla_medio"])}.</p></section>') if h.get("entradilla") else ""
    tema_html = (f'<p class="hilo"><span><b>Tema:</b> <a href="{url_tema(tema["id"], tema["nombre"])}">{esc(tema["nombre"])}</a></span></p>') if tema else ""
    aviso = (f'<p class="hilo"><span><b>Archivo:</b> historia del {fecha(h["creada"])}. Se guarda porque la contaron {h["total"]} medios. '
             f'<a href="/archivo/">Ver todo el archivo</a></span></p>') if archivada else ""
    return (f'<header class="hist-cab"><h1>{esc(h["titulo"])}</h1>'
            f'<div class="meta"><span>{h["total"]} medios</span></div>{tema_html}{aviso}</header>'
            f'<div class="hist-cuerpo"><div class="hist-izq">{ent}'
            f'<section class="hist-cob"><h2>Quién la cuenta</h2><p class="resumen">{esc(lectura(h))}</p>'
            f'<p class="cuenta">La publican <b>{h["total"]} medios</b>: {n["izq"]} de izquierda o centroizquierda, {n["cen"]} de centro '
            f'y {n["der"]} de derecha o centroderecha. Reparto: izquierda {h["pct_izq"]} %, centro {h["pct_cen"]} %, derecha {h["pct_der"]} %.</p>'
            f'</section></div><section class="hist-asi"><h2>Así la titula cada lado</h2>{bloques}</section></div>')


def jsonld_noticia(h, url, imagen, tema):
    migas = [{"@type": "ListItem", "position": 1, "name": "Portada", "item": BASE + "/"}]
    if tema:
        migas.append({"@type": "ListItem", "position": 2, "name": tema["nombre"], "item": BASE + url_tema(tema["id"], tema["nombre"])})
    migas.append({"@type": "ListItem", "position": len(migas) + 1, "name": h["titulo"], "item": BASE + url})
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "@id": BASE + url, "url": BASE + url, "name": h["titulo"], "description": descripcion(h),
         "inLanguage": "es-ES", "datePublished": h["creada"], "dateModified": h["actualizada"],
         "isPartOf": {"@id": BASE + "/#web"}, "publisher": {"@id": BASE + "/#organizacion"},
         "primaryImageOfPage": {"@type": "ImageObject", "url": imagen},
         # Las noticias originales que se comparan en esta página
         "citation": [{"@type": "NewsArticle", "headline": a["titulo"], "url": a["url"], "datePublished": a.get("publicado"),
                       "publisher": {"@type": "Organization", "name": a["medio"]}} for a in por_medio(h)[:40]]},
        {"@type": "BreadcrumbList", "itemListElement": migas}]}


# ---------- Imagen para redes: titular y reparto de la cobertura ----------
FUENTES = {}


def fuentes():
    """Convierte las fuentes de la web (woff2) a ttf para poder dibujar con ellas"""
    if FUENTES:
        return FUENTES
    from fontTools.ttLib import TTFont
    os.makedirs("/tmp/vp-fuentes", exist_ok=True)
    for clave, archivo in {"titular": "newsreader-latin-opsz-normal", "negra": "roboto-latin-900-normal",
                           "media": "roboto-latin-500-normal", "num": "roboto-mono-latin-500-normal"}.items():
        destino = f"/tmp/vp-fuentes/{archivo}.ttf"
        if not os.path.exists(destino):
            f = TTFont(os.path.join(RAIZ, "fuentes", archivo + ".woff2"))
            f.flavor = None
            f.save(destino)
        FUENTES[clave] = destino
    return FUENTES


def imagen_og(h, ruta):
    """Imagen para redes (26/10): el título y, debajo, cómo lo titula cada lado. Es el gancho:
    no solo quién la cuenta, también con qué palabras. Al pie, cuántos medios de cada lado la publican."""
    from PIL import Image, ImageDraw, ImageFont
    F = fuentes()
    W, H = 1200, 630
    TINTA, FONDO, GRIS, LINEA = (17, 18, 19), (255, 255, 255), (122, 126, 134), (220, 220, 214)
    IZQ, CEN, DER = (192, 57, 43), (110, 114, 122), (44, 90, 160)
    im = Image.new("RGB", (W, H), FONDO)
    d = ImageDraw.Draw(im)
    M = 64
    # Logo: esquinas roja y azul y punto
    x0, y0, s = M, 40, 34
    g = max(4, s // 9)
    d.line([(x0, y0 + s * 0.62), (x0, y0 + s), (x0 + s * 0.38, y0 + s)], fill=(192, 57, 43), width=g, joint="curve")
    d.line([(x0 + s * 0.62, y0), (x0 + s, y0), (x0 + s, y0 + s * 0.38)], fill=DER, width=g, joint="curve")
    r = s * 0.16
    d.ellipse([x0 + s / 2 - r, y0 + s / 2 - r, x0 + s / 2 + r, y0 + s / 2 + r], fill=TINTA)
    d.text((x0 + s + 14, y0 + s / 2), "Vista Plena", font=ImageFont.truetype(F["negra"], 30), fill=TINTA, anchor="lm")
    aviso = f"La {h['punto_ciego']} apenas la cuenta" if h.get("punto_ciego") else "Misma noticia, distintos titulares"
    d.text((W - M, y0 + s / 2), aviso, font=ImageFont.truetype(F["media"], 22),
           fill=(GRIS if not h.get("punto_ciego") else (IZQ if h["punto_ciego"] == "izquierda" else DER)), anchor="rm")

    def partir(texto, fuente, ancho, maximo):
        lineas, actual = [], ""
        for palabra in texto.split():
            prueba = (actual + " " + palabra).strip()
            if d.textlength(prueba, font=fuente) <= ancho:
                actual = prueba
            else:
                if actual:
                    lineas.append(actual)
                actual = palabra
        lineas.append(actual)
        if len(lineas) > maximo:
            lineas = lineas[:maximo]
            ultima = lineas[-1]
            while ultima and d.textlength(ultima + "…", font=fuente) > ancho:
                ultima = ultima.rsplit(" ", 1)[0] if " " in ultima else ultima[:-1]
            lineas[-1] = ultima.rstrip(".,;:«") + "…"
        return lineas

    # Título de la noticia, como mucho 2 líneas
    for tam in (40, 36, 33, 30):
        ft = ImageFont.truetype(F["negra"], tam)
        lineas = partir(h["titulo"], ft, W - 2 * M, 99)
        if len(lineas) <= 2:
            break
    lineas = partir(h["titulo"], ft, W - 2 * M, 2)
    y = 100
    for l in lineas:
        d.text((M, y), l, font=ft, fill=TINTA)
        y += int(tam * 1.15)
    y += 14
    d.line([(M, y), (W - M, y)], fill=TINTA, width=2)
    y += 20

    # Cómo la titula cada lado: etiqueta y titular entre comillas, en serif
    eti = ImageFont.truetype(F["num"], 19)
    ftit = ImageFont.truetype(F["titular"], 27)
    try:
        ftit.set_variation_by_axes([500, 36])
    except Exception:
        pass
    t = titular_por_lado(h)
    hueco = (H - 86) - y  # lo que queda hasta el pie
    lineas_max = 2 if hueco >= 3 * (28 + 2 * 33 + 10) else 1
    for k, col, nom in (("izq", IZQ, "IZQUIERDA"), ("cen", CEN, "CENTRO"), ("der", DER, "DERECHA")):
        a = t[k]
        d.rectangle([M, y + 2, M + 6, y + 22], fill=col)
        d.text((M + 18, y), f"{nom} · {a['medio'].upper()}" if a else nom, font=eti, fill=col)
        y += 28
        if a:
            for l in partir(comillas(a['titulo']), ftit, W - 2 * M - 18, lineas_max):
                d.text((M + 18, y), l, font=ftit, fill=TINTA)
                y += 33
        else:
            d.text((M + 18, y), "Ningún medio de este lado la ha publicado", font=ftit, fill=GRIS)
            y += 33
        y += 10

    # Pie: cuántos medios de cada lado la publican
    yp = H - 46
    d.line([(M, yp - 34), (W - M, yp - 34)], fill=LINEA, width=1)
    n, T = cuentas_lado(h), totales_medios()
    pie = ImageFont.truetype(F["media"], 22)
    x = M
    for k, col, nom in (("izq", IZQ, "de izquierda"), ("cen", CEN, "de centro"), ("der", DER, "de derecha")):
        txt = f"{n[k]} de {max(T.get(k) or 0, n[k])} {nom}" if T.get(k) else f"{n[k]} {nom}"
        d.text((x, yp), txt, font=pie, fill=col, anchor="ls")
        x += d.textlength(txt, font=pie) + 34
    d.text((W - M, yp), "vistaplena.es", font=ImageFont.truetype(F["negra"], 22), fill=TINTA, anchor="rs")
    im.save(ruta, optimize=True)


# ---------- Archivo permanente ----------
def lista_html(hs):
    return "".join(f'<li><time datetime="{h["creada"]}">{fecha(h["creada"])}</time><div><a href="{url_noticia(h["id"], h["titulo"])}">'
                   f'{esc(h["titulo"])}</a><span class="m">{h["total"]} medios · izquierda {h["pct_izq"]} %, centro {h["pct_cen"]} %, '
                   f'derecha {h["pct_der"]} %</span></div></li>' for h in hs)


def pagina_lista(tpl, *, url, titulo, h1, sub, cuerpo_extra, desc, items):
    cuerpo = (f'<header class="hist-cab"><h1>{esc(h1)}</h1><p class="tema-sub">{sub}</p></header>{cuerpo_extra}'
              + (f'<section class="tema-crono"><div class="tc-dia"><ol>{items}</ol></div></section>' if items else ""))
    jsonld = {"@context": "https://schema.org", "@type": "CollectionPage", "@id": BASE + url, "url": BASE + url, "name": h1,
              "description": desc, "inLanguage": "es-ES", "isPartOf": {"@id": BASE + "/#web"}}
    # id 0: la página no pide datos al abrirse y se queda con este contenido
    escribir(url, montar(tpl, titulo=titulo, desc=desc, url=url, imagen=BASE + "/og.png", tipo="website", jsonld=jsonld, id_=0, cuerpo=cuerpo))


def archivo(historias, tpl_h, tpl_t, temas):
    """Historias de 10 o más medios: página para siempre. Las recientes ya tienen la suya; aquí se rehacen las antiguas."""
    if os.environ.get("VP_DATOS"):
        filas = json.load(open(os.environ["VP_DATOS"])).get("archivo", [])
    else:
        filas = todo(f"archivo?select=historia_id,titulo,creada,actualizada,total,voces,pct_izq,pct_cen,pct_der,punto_ciego,titulares"
                     f"&total=gte.{MIN_ARCHIVO}&fusionada=is.false&ligera=not.is.true&titulares=not.is.null&order=creada.desc")
    recientes = {h["id"] for h in historias}
    mapa, todas = [], []
    for f in filas:
        h = {"id": f["historia_id"], "titulo": f["titulo"], "creada": f["creada"], "actualizada": f["actualizada"], "total": f["total"],
             "voces": f["voces"] or f["total"], "pct_izq": f["pct_izq"], "pct_cen": f["pct_cen"], "pct_der": f["pct_der"],
             "punto_ciego": f["punto_ciego"], "articulos": f["titulares"] or [], "entradilla": None}
        todas.append(h)
        if h["id"] in recientes:
            continue
        url = url_noticia(h["id"], h["titulo"])
        escribir(url, montar(tpl_h, titulo=f"{h['titulo']} · Archivo · Vista Plena", desc=descripcion(h), url=url, imagen=BASE + "/og.png",
                             tipo="article", jsonld=jsonld_noticia(h, url, BASE + "/og.png", None), id_=h["id"],
                             cuerpo=cuerpo_noticia(h, None, archivada=True)))
        mapa.append((url, h["actualizada"]))
    pagina_lista(tpl_t, url="/archivo/", titulo="Archivo: las historias que más medios contaron · Vista Plena", h1="Archivo",
                 sub=f"{len(todas)} historias que contaron {MIN_ARCHIVO} medios o más. Se guardan para siempre, con el titular de cada medio.",
                 cuerpo_extra="", desc="Las historias que más medios contaron en España, con quién las contó y cómo las tituló cada lado.",
                 items=lista_html(todas))
    return mapa


# ---------- Fichas de medios ----------
CONFIANZA = {"alta": "Alta: dos mediciones independientes coinciden.",
             "media": "Media: hay una medición, o las dos no coinciden del todo y decide una tercera fuente.",
             "baja": "Baja: no hay mediciones de su audiencia; la etiqueta se basa en su línea editorial y en clasificaciones externas."}


def fichas_medios(historias, tpl_t):
    if os.environ.get("VP_DATOS"):
        d = json.load(open(os.environ["VP_DATOS"]))
        medios, cambios = d.get("medios", []), d.get("cambios", [])
    else:
        medios = pedir("medios?select=nombre,web,orientacion,grupo,revisado,nota_etiqueta,medicion_cis,medicion_twitter,confianza,activo&activo=eq.true&order=orientacion,nombre")
        cambios = pedir("medios_cambios?select=fecha,medio,antes,despues,motivo&order=fecha.desc")
    grandes = sorted(historias, key=lambda h: -(h.get("total") or 0))[:30]
    mapa, filas_indice = [], []
    num = lambda v: str(v).replace(".", ",")
    for m in medios:
        url = f"/medio/{slug(m['nombre'])}/"
        suyas = [h for h in historias if any(a["medio"] == m["nombre"] for a in (h.get("articulos") or []))]
        suyas.sort(key=lambda h: h["creada"], reverse=True)
        en_grandes = sum(1 for h in grandes if h in suyas)
        faltan = [h for h in grandes if h not in suyas][:5]
        mediciones = []
        if m.get("medicion_cis") is not None:
            mediciones.append(f"Barómetro del CIS (ideología media de su audiencia, de 1 izquierda a 10 derecha): <b>{num(m['medicion_cis'])}</b>")
        if m.get("medicion_twitter") is not None:
            mediciones.append(f"Estudio de sus seguidores en Twitter (misma escala): <b>{num(m['medicion_twitter'])}</b>")
        hist = [c for c in cambios if c["medio"] == m["nombre"]]
        bloque = (f'<section class="hist-cob"><h2>Su etiqueta</h2><p class="resumen"><b>{ETIQUETA[m["orientacion"]]}</b>'
                  f'{" · grupo " + esc(m["grupo"]) if m.get("grupo") and m["grupo"] != m["nombre"] else ""}</p>'
                  + (f'<ul>{"".join(f"<li>{x}</li>" for x in mediciones)}</ul>' if mediciones else "<p>No hay mediciones de su audiencia.</p>")
                  + (f'<p>{esc(m["nota_etiqueta"])}</p>' if m.get("nota_etiqueta") else "")
                  + (f'<p><b>Confianza en la etiqueta:</b> {CONFIANZA.get(m.get("confianza") or "baja")}</p>')
                  + f'<p class="aparte">Revisada el {fecha(m["revisado"]) if m.get("revisado") else "—"}. '
                    f'<a href="/metodologia.html">Cómo etiquetamos</a> · <a href="{esc(m["web"])}" rel="noopener" target="_blank">Web del medio</a></p></section>'
                  + (f'<section class="hist-cob"><h2>Cambios de etiqueta</h2><ul>{"".join(f"<li>{fecha(c['fecha'])}: de {ETIQUETA[c['antes']].lower()} a {ETIQUETA[c['despues']].lower()}. {esc(c['motivo'])}</li>" for c in hist)}</ul></section>' if hist else "")
                  + f'<section class="hist-cob"><h2>Qué publica</h2><p>En los últimos {DIAS} días aparece en <b>{len(suyas)}</b> historias. '
                    f'De las 30 historias que más medios contaron, ha publicado <b>{en_grandes}</b>.</p>'
                  + (f'<p>Grandes historias que no ha publicado: {"; ".join(f"<a href='{url_noticia(h["id"], h["titulo"])}'>{esc(h["titulo"])}</a>" for h in faltan)}.</p>' if faltan else "")
                  + "</section>")
        # Título en forma de pregunta: es como lo busca la gente en Google («¿X es de izquierdas o de derechas?»)
        pagina_lista(tpl_t, url=url, titulo=f"¿{m['nombre']} es de izquierdas o de derechas? Lo que dicen los datos · Vista Plena",
                     h1=f"¿{m['nombre']} es de izquierdas o de derechas?",
                     sub=f"{ETIQUETA[m['orientacion']]}, según la ideología de su audiencia · {len(suyas)} historias en los últimos {DIAS} días",
                     cuerpo_extra=bloque + "<h2 style='margin-top:32px'>Sus historias más recientes</h2>",
                     desc=f"{m['nombre']}: {ETIQUETA[m['orientacion']].lower()}, según encuestas del CIS y estudios de su audiencia. De dónde sale la etiqueta, qué publica y qué grandes noticias no ha contado.",
                     items=lista_html(suyas[:20]))
        mapa.append((url, None))
        filas_indice.append(f'<li><div><a href="{url}">{esc(m["nombre"])}</a><span class="m">{ETIQUETA[m["orientacion"]]} · confianza {m.get("confianza") or "baja"}</span></div></li>')
    pagina_lista(tpl_t, url="/medio/", titulo="¿Qué periódicos son de izquierdas y cuáles de derechas? · Vista Plena", h1="Qué medios son de izquierdas, de centro y de derechas",
                 sub=f"{len(medios)} medios, de izquierda a derecha. Cada ficha explica su etiqueta y qué publica.", cuerpo_extra="",
                 desc="Los principales medios españoles ordenados de izquierda a derecha según la ideología de su audiencia (CIS y estudios), con la confianza de cada etiqueta.", items="".join(filas_indice))
    return mapa


def barra_html(h):
    seg = lambda cls, v: f'<div class="{cls}" style="flex-grow:{v}"></div>' if v else ""
    return (f'<div class="barra" role="img" aria-label="Izquierda {h["pct_izq"]} %, centro {h["pct_cen"]} %, derecha {h["pct_der"]} %">'
            f'{seg("b-izq", h["pct_izq"])}{seg("b-cen", h["pct_cen"])}{seg("b-der", h["pct_der"])}</div>')


def portada_estatica(historias, ahora):
    """La portada se monta en el navegador. Para Google y para las vistas previas de WhatsApp o X (que no ejecutan
    JavaScript), y por si falla la conexión con la base de datos, se escribe cada hora una copia ya hecha con las noticias
    más contadas y las de cobertura desigual. En cuanto llegan los datos, el navegador la sustituye por la de siempre."""
    ruta = os.path.join(SALIDA, "index.html")
    t = open(ruta, encoding="utf-8").read()
    if '<main id="contenido"></main>' not in t:
        print("Portada estática sin generar: no se encuentra el contenedor")
        return
    mad = ZoneInfo("Europe/Madrid")
    hace = lambda h: dt.datetime.fromisoformat(h["actualizada"].replace("Z", "+00:00"))
    recientes = [h for h in historias if (ahora - hace(h)).total_seconds() < 36 * 3600]
    top = sorted(recientes, key=lambda h: (h.get("peso") or 0, h.get("total") or 0), reverse=True)[:20]
    ciegos = sorted([h for h in recientes if h.get("punto_ciego")], key=lambda h: h.get("total") or 0, reverse=True)[:6]
    if not top:
        return
    def li(h):
        ciego = f' · <b>la {h["punto_ciego"]} apenas la cuenta</b>' if h.get("punto_ciego") else ""
        return (f'<li><time datetime="{h["actualizada"]}">{hace(h).astimezone(mad).strftime("%H:%M")}</time>'
                f'<a href="{url_noticia(h["id"], h["titulo"])}"><span class="t">{esc(h["titulo"])}</span>'
                f'<span class="m">{h["total"]} medios{ciego}</span>{barra_html(h)}</a></li>')
    cuerpo = ('<section class="ultimo"><div class="cab-seccion"><h2>Lo más contado ahora</h2>'
              '<p>Las noticias que más medios están contando. Toca una para ver cómo la titula cada lado.</p></div>'
              f'<ol class="ultimo-lista">{"".join(li(h) for h in top)}</ol></section>')
    if ciegos:
        cuerpo += ('<section class="ultimo"><div class="cab-seccion"><h2>Cobertura desigual</h2>'
                   '<p>Noticias políticas que un lado apenas cuenta.</p></div>'
                   f'<ol class="ultimo-lista">{"".join(li(h) for h in ciegos)}</ol></section>')
    t = t.replace('<main id="contenido"></main>', f'<main id="contenido" data-estatica="1">{cuerpo}</main>', 1)
    t = t.replace('<span class="vivo" id="estado">Cargando…</span>',
                  f'<span class="vivo" id="estado">Actualizado {ahora.astimezone(mad).strftime("%H:%M")}</span>', 1)
    open(ruta, "w", encoding="utf-8").write(t)
    print(f"Portada estática: {len(top)} noticias y {len(ciegos)} de cobertura desigual")


def boletin_ejemplo(historias, tpl_t, ahora):
    """/boletin/: cómo es el boletín, con la edición que saldría hoy (mismas reglas que servidor/boletin: las 7 noticias
    con más medios de los últimos 7 días y hasta 4 de cobertura desigual). Así se ve lo que llega antes de dar el correo."""
    hace = lambda h: dt.datetime.fromisoformat(h["actualizada"].replace("Z", "+00:00"))
    semana = sorted([h for h in historias if (ahora - hace(h)).total_seconds() < 7 * 86400], key=lambda h: -(h.get("total") or 0))
    top = semana[:7]
    if len(top) < 3:
        return []
    ciegos = [h for h in semana[:80] if h.get("punto_ciego") and (h.get("total") or 0) >= 6 and h not in top][:4]
    nombres = {"izq": "Izquierda", "cen": "Centro", "der": "Derecha"}
    def por_lado(h):
        uno = {}
        for a in h.get("articulos") or []:
            uno.setdefault(lado(a["orientacion"]), a)
        return "".join(f'<li><b>{nombres[k]}</b> · {esc(uno[k]["medio"])}: <a href="{esc(uno[k]["url"])}" target="_blank" rel="noopener">{esc(uno[k]["titulo"])}</a></li>'
                       for k in ("izq", "cen", "der") if k in uno)
    piezas = "".join(
        f'<li class="bol-pieza"><span class="m">{i + 1} · {h["total"]} medios</span>'
        f'<a class="t" href="{url_noticia(h["id"], h["titulo"])}">{esc(h["titulo"])}</a>{barra_html(h)}<ul class="bol-lados">{por_lado(h)}</ul></li>'
        for i, h in enumerate(top))
    desig = "".join(
        f'<li class="bol-pieza"><span class="chip">Poca cobertura en la {h["punto_ciego"]}</span>'
        f'<a class="t" href="{url_noticia(h["id"], h["titulo"])}">{esc(h["titulo"])}</a>{barra_html(h)}</li>' for h in ciegos)
    dia = ahora.astimezone(ZoneInfo("Europe/Madrid"))
    cuerpo = (
        '<header class="hist-cab"><div class="hist-etis"><span class="tema-eti">Boletín</span></div><h1>Así es el boletín</h1>'
        '<p class="tema-sub">Cada viernes a las 8:00, gratis. Las siete noticias que más medios contaron en la semana, con un titular de cada lado, '
        'y hasta cuatro que casi solo contó un lado. Se lee en cinco minutos.</p></header>'
        '<div class="bol-corto"></div>'
        f'<section class="bol-ejemplo"><h2>La edición de esta semana, tal como saldría hoy ({dia.day} de {MESES[dia.month - 1]})</h2>'
        f'<ol class="bol-lista">{piezas}</ol>'
        + (f'<h2>Cobertura desigual</h2><ol class="bol-lista">{desig}</ol>' if desig else "")
        + '</section><style>.bol-ejemplo{margin-top:40px}.bol-ejemplo h2{margin:32px 0 6px;padding-top:12px;border-top:4px solid var(--tinta);font-weight:900;font-size:var(--t-l);color:var(--tinta)}'
        '.bol-lista{list-style:none;margin:0;padding:0}.bol-pieza{display:grid;gap:8px;padding:18px 0;border-bottom:1px solid var(--linea)}'
        '.bol-pieza .m{font-size:var(--t-xs);color:var(--gris)}.bol-pieza .t{font-family:var(--titular);font-weight:600;font-size:1.2rem;line-height:1.25;color:var(--tinta);text-decoration:none}'
        '.bol-pieza .t:hover{text-decoration:underline}.bol-pieza .chip{justify-self:start}.bol-lados{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:4px;font-size:var(--t-s);color:var(--gris)}'
        '.bol-lados b{color:var(--tinta)}.bol-lados a{color:var(--tinta)}</style>')
    url = "/boletin/"
    desc = "Cada viernes, las siete noticias que más medios contaron en la semana, con un titular de cada lado, y las que casi solo contó un lado."
    jsonld = {"@context": "https://schema.org", "@type": "WebPage", "@id": BASE + url, "url": BASE + url, "name": "El boletín de Vista Plena",
              "description": desc, "inLanguage": "es-ES", "isPartOf": {"@id": BASE + "/#web"}}
    escribir(url, montar(tpl_t, titulo="El boletín de los viernes · Vista Plena", desc=desc, url=url, imagen=BASE + "/og.png",
                         tipo="website", jsonld=jsonld, id_=0, cuerpo=cuerpo))
    return [(url, ahora.isoformat())]


# ---------- Programa principal ----------
def main():
    copiar_web()
    open(os.path.join(SALIDA, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
    ahora = dt.datetime.now(dt.timezone.utc)
    desde = (ahora - dt.timedelta(days=DIAS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        if os.environ.get("VP_DATOS"):  # pruebas sin conexión: un JSON con {"historias": [...], "temas": [...]}
            datos = json.load(open(os.environ["VP_DATOS"]))
            historias, temas, asuntos = datos["historias"], datos["temas"], datos.get("asuntos", [])
        else:
          historias = todo(f"portada_m?select={CAMPOS}&creada=gt.{desde}&order=id")
          temas = todo(f"temas_v?select=id,nombre,inicio,actualizado,historias,activo&actualizado=gt.{desde}&historias=gte.2&order=id")
          # Temas grandes (asuntos, los agrupa la IA): /tema/<nombre>-a<id>/. Mandan sobre el tema pequeño de cada noticia
          try:
              asuntos = todo(f"asuntos_v?select=id,nombre,descripcion,actualizado,historias,ids&actualizado=gt.{desde}&historias=gte.2&order=id")
          except Exception as e:
              print("Sin asuntos:", e)
              asuntos = []
    except Exception as e:
        print("Supabase no responde; se publica la web sin páginas generadas:", e)
        return
    temas = {t["id"]: t for t in temas}
    asunto_de = {}
    for a in asuntos:
        for hid in a.get("ids") or []:
            asunto_de[hid] = {"id": f"a{a['id']}", "nombre": a["nombre"], "actualizado": a["actualizado"], "descripcion": a.get("descripcion")}
    tpl_h, tpl_t = plantilla("historia.html"), plantilla("tema.html")
    try:
        portada_estatica(historias, ahora)
    except Exception as e:
        print("Portada estática sin generar:", e)
    os.makedirs(os.path.join(SALIDA, "og"), exist_ok=True)
    mapa = []
    con_og = 0
    for h in historias:
        url = url_noticia(h["id"], h["titulo"])
        tema = asunto_de.get(h["id"]) or temas.get(h.get("tema_id"))
        imagen = BASE + "/og.png"
        creada = dt.datetime.fromisoformat(h["creada"].replace("Z", "+00:00"))
        if (ahora - creada).total_seconds() < OG_HORAS * 3600:
            try:
                imagen_og(h, os.path.join(SALIDA, "og", f"{h['id']}.png"))
                imagen = f"{BASE}/og/{h['id']}.png"
                con_og += 1
            except Exception as e:
                print("Sin imagen para", h["id"], e)
        indexar = (h.get("total") or 0) >= MIN_INDEXAR
        escribir(url, montar(tpl_h, titulo=f"{h['titulo']} · Vista Plena", desc=descripcion(h), url=url, imagen=imagen,
                             tipo="article", jsonld=jsonld_noticia(h, url, imagen, tema), id_=h["id"], cuerpo=cuerpo_noticia(h, tema),
                             indexar=indexar))
        if indexar:
            mapa.append((url, h["actualizada"]))
    # Temas
    por_tema = {}
    for h in historias:
        if h.get("tema_id") in temas:
            por_tema.setdefault(h["tema_id"], []).append(h)
        if h["id"] in asunto_de:
            a = asunto_de[h["id"]]
            temas.setdefault(a["id"], a)
            por_tema.setdefault(a["id"], []).append(h)
    for tid, hs in por_tema.items():
        t = temas[tid]
        if len(hs) < 2 and str(tid).startswith("a"):
            continue
        hs.sort(key=lambda x: x["creada"], reverse=True)
        url = url_tema(tid, t["nombre"])
        desc = f"{len(hs)} noticias sobre {t['nombre']}, en orden, y quién cuenta cada una: izquierda, centro y derecha."
        lista = "".join(f'<li><time datetime="{h["creada"]}">{fecha(h["creada"])}</time><div><a href="{url_noticia(h["id"], h["titulo"])}">'
                        f'{esc(h["titulo"])}</a><span class="m">{h["total"]} medios · izquierda {h["pct_izq"]} %, centro {h["pct_cen"]} %, '
                        f'derecha {h["pct_der"]} %</span></div></li>' for h in hs)
        cuerpo = (f'<header class="hist-cab"><div class="hist-etis"><span class="tema-eti">Tema</span></div><h1>{esc(t["nombre"])}</h1>'
                  f'<p class="tema-sub">{len(hs)} noticia{"s" if len(hs) != 1 else ""} desde el {fecha(hs[-1]["creada"])}</p></header><section class="tema-crono"><h2>Todas las noticias del tema, día a día</h2>'
                  f'<div class="tc-dia"><ol>{lista}</ol></div></section>')
        jsonld = {"@context": "https://schema.org", "@graph": [
            {"@type": "CollectionPage", "@id": BASE + url, "url": BASE + url, "name": t["nombre"], "description": desc, "inLanguage": "es-ES",
             "dateModified": t["actualizado"], "isPartOf": {"@id": BASE + "/#web"}, "publisher": {"@id": BASE + "/#organizacion"},
             "mainEntity": {"@type": "ItemList", "itemListElement": [
                 {"@type": "ListItem", "position": i + 1, "url": BASE + url_noticia(h["id"], h["titulo"]), "name": h["titulo"]} for i, h in enumerate(hs)]}},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Portada", "item": BASE + "/"},
                {"@type": "ListItem", "position": 2, "name": t["nombre"], "item": BASE + url}]}]}
        escribir(url, montar(tpl_t, titulo=f"{t['nombre']}: todas las noticias, en orden · Vista Plena", desc=desc, url=url,
                             imagen=BASE + "/og.png", tipo="website", jsonld=jsonld, id_=tid, cuerpo=cuerpo))
        mapa.append((url, t["actualizado"]))
    # Archivo permanente y fichas de medios (si fallan, el resto de la web se publica igual)
    try:
        mapa += archivo(historias, tpl_h, tpl_t, temas)
    except Exception as e:
        print("Archivo sin generar:", e)
    try:
        mapa += fichas_medios(historias, tpl_t)
    except Exception as e:
        print("Fichas de medios sin generar:", e)
    try:
        mapa += boletin_ejemplo(historias, tpl_t, ahora)
    except Exception as e:
        print("Ejemplo del boletín sin generar:", e)
    # Mapa del sitio y robots.txt
    fijas = [("/", ahora.isoformat()), ("/metodologia.html", None), ("/elecciones.html", None), ("/quienes-somos.html", None),
             ("/?vista=ciegos", ahora.isoformat()), ("/medio/", None), ("/archivo/", None)]
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url, mod in fijas + mapa:
        xml.append(f"<url><loc>{esc(BASE + url)}</loc>" + (f"<lastmod>{mod[:19]}+00:00</lastmod>" if mod else "") + "</url>")
    xml.append("</urlset>")
    open(os.path.join(SALIDA, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(xml))
    print(f"{len(historias)} noticias, {len(por_tema)} temas, {con_og} imágenes para redes")


if __name__ == "__main__":
    main()
