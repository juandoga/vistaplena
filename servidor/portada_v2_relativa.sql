-- portada_v2 con reparto relativo (17/10/2026).
-- Los medios de derecha que leemos publican más del doble de titulares que los de izquierda. Si contáramos medios
-- tal cual, casi todas las noticias saldrían «más de derechas» y casi todas las de cobertura desigual serían
-- «poca cobertura en la izquierda». Por eso cada lado se compara con lo que suele publicar: cuántas voces de ese lado
-- tiene de media una noticia (últimos 7 días, noticias de 5 voces o más). Una noticia normal sale repartida.
-- izq, cen, der y total siguen siendo las cifras reales (lo que se ve en «La publican 7 de los 13 medios…»).
create or replace view public.portada_v2 as
 WITH por_medio AS (
         SELECT DISTINCT a.historia_id, m.id AS medio_id, m.orientacion, COALESCE(m.grupo, m.nombre) AS grupo,
                CASE WHEN m.orientacion < 0 THEN 'izq'::text WHEN m.orientacion > 0 THEN 'der'::text ELSE 'cen'::text END AS lado
           FROM articulos a JOIN medios m ON m.id = a.medio_id
          WHERE a.historia_id IS NOT NULL
        ), voces AS (
         -- 21/10: cada medio cuenta por separado (antes, dos del mismo grupo y lado eran una «voz»). La columna sigue llamándose voces
         SELECT DISTINCT historia_id, medio_id::text AS grupo, lado FROM por_medio
        ), cuentas AS (
         SELECT v.historia_id, count(*) AS voces,
            count(*) FILTER (WHERE v.lado = 'izq') AS izq,
            count(*) FILTER (WHERE v.lado = 'cen') AS cen,
            count(*) FILTER (WHERE v.lado = 'der') AS der,
            (SELECT count(*) FROM por_medio p WHERE p.historia_id = v.historia_id) AS total
           FROM voces v GROUP BY v.historia_id
        ), base AS (
         -- Voces de cada lado que tiene de media una noticia normal
         SELECT greatest(avg(c.izq), 0.5) AS b_izq, greatest(avg(c.cen), 0.5) AS b_cen, greatest(avg(c.der), 0.5) AS b_der
           FROM cuentas c JOIN historias h ON h.id = c.historia_id
          WHERE h.creada > now() - interval '7 days' AND c.voces >= 5
        ), rel AS (
         SELECT c.*, c.izq / b.b_izq AS a_izq, c.cen / b.b_cen AS a_cen, c.der / b.b_der AS a_der, b.b_izq, b.b_cen, b.b_der
           FROM cuentas c CROSS JOIN base b
        ), pct AS (
         SELECT r.*, (round(100.0 * r.a_izq / nullif(r.a_izq + r.a_cen + r.a_der, 0)))::integer AS p_izq,
                     (round(100.0 * r.a_der / nullif(r.a_izq + r.a_cen + r.a_der, 0)))::integer AS p_der
           FROM rel r
        ), tipo AS (
         SELECT a.historia_id,
            (avg(CASE WHEN a.url ~* '/(deportes?|futbol|baloncesto|tenis|motor|formula-?1|motogp|ciclismo|laotraliga|gente|famosos|corazon|casa-?real|casas-reales|realeza|cool|chic|lifestyle|estilo|moda|belleza|vanitatis|television|tv|series|el-?tiempo|tiempo|meteorologia|loterias?|horoscopo|viajes|gastronomia|recetas|videojuegos|toros|tecnologia|gadgets|moviles)(/|$)'
                       OR a.titulo ~* '(loter[ií]a|sorteo|bonoloto|euromillones|la primitiva|super ?once|cup[oó]n de la once|aemet|alerta (naranja|amarilla|roja)|avisos? (naranja|amarillo|rojo)|lluvias|tormentas|\ydana\y|temperaturas|ola de calor|el tiempo (hoy|de|para|en)|horóscopo|reina sof[ií]a|infanta (elena|cristina))'
                  THEN 1 ELSE 0 END) >= 0.5) AS ligera
           FROM articulos a WHERE a.historia_id IS NOT NULL GROUP BY a.historia_id
        ), portada AS (
         SELECT a.historia_id, count(DISTINCT p.medio_id) AS en_portadas
           FROM portadas p JOIN articulos a ON url_norm(a.url) = p.url_norm
          WHERE a.historia_id IS NOT NULL GROUP BY a.historia_id
        ), m12 AS (
         SELECT a.historia_id, count(DISTINCT a.medio_id) AS n,
            count(DISTINCT a.medio_id) FILTER (WHERE m.orientacion < 0) AS i,
            count(DISTINCT a.medio_id) FILTER (WHERE m.orientacion = 0) AS c,
            count(DISTINCT a.medio_id) FILTER (WHERE m.orientacion > 0) AS d
           FROM articulos a JOIN medios m ON m.id = a.medio_id
          WHERE a.historia_id IS NOT NULL AND a.publicado > now() - interval '12 hours'
          GROUP BY a.historia_id
        )
 SELECT h.id, h.titulo, h.creada, h.actualizada, c.total, c.voces, c.izq, c.cen, c.der,
    -- 24/10: la barra es qué parte de cada lado publica («7 de 13» = 54 %), normalizada a 100. c.p_* (comparación con lo
    -- que suele publicar cada lado) queda solo para la cobertura desigual
    coalesce(round(100.0 * (c.izq / ml.ti) / nullif(c.izq / ml.ti + c.cen / ml.tc + c.der / ml.td, 0))::int, 0) AS pct_izq,
    coalesce(round(100.0 * (c.der / ml.td) / nullif(c.izq / ml.ti + c.cen / ml.tc + c.der / ml.td, 0))::int, 0) AS pct_der,
    100 - coalesce(round(100.0 * (c.izq / ml.ti) / nullif(c.izq / ml.ti + c.cen / ml.tc + c.der / ml.td, 0))::int, 0)
        - coalesce(round(100.0 * (c.der / ml.td) / nullif(c.izq / ml.ti + c.cen / ml.tc + c.der / ml.td, 0))::int, 0) AS pct_cen,
        CASE
            WHEN COALESCE(t.ligera, false) THEN NULL::text
            WHEN c.voces >= 6 AND h.ia_politica IS TRUE AND h.creada < now() - interval '6 hours' AND coalesce(c.p_izq, 0) < 10 AND coalesce(c.p_der, 0) >= 50
              AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(h.tambien) x(value) WHERE (x.value ->> 'orientacion')::integer < 0) THEN 'izquierda'::text
            WHEN c.voces >= 6 AND h.ia_politica IS TRUE AND h.creada < now() - interval '6 hours' AND coalesce(c.p_der, 0) < 10 AND coalesce(c.p_izq, 0) >= 50
              AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(h.tambien) x(value) WHERE (x.value ->> 'orientacion')::integer > 0) THEN 'derecha'::text
            ELSE NULL::text
        END AS punto_ciego,
    (SELECT jsonb_agg(jsonb_build_object('medio', m.nombre, 'orientacion', m.orientacion, 'grupo', COALESCE(m.grupo, m.nombre), 'titulo', a.titulo, 'url', a.url, 'publicado', a.publicado) ORDER BY m.orientacion, a.publicado)
           FROM articulos a JOIN medios m ON m.id = a.medio_id WHERE a.historia_id = h.id) AS articulos,
    f.imagen, f.imagen_medio, COALESCE(t.ligera, false) AS ligera, e.entradilla, e.entradilla_medio,
    COALESCE(m12.n, 0) AS medios_12h,
    h.anterior, h.tema_id, h.tambien, COALESCE(pt.en_portadas, 0::bigint) AS en_portadas,
    -- Orden de la portada: medios de las últimas 12 h, pesando cada lado por lo que suele publicar, + 2 por portada web
    (round(COALESCE(m12.i, 0) * (c.b_izq + c.b_cen + c.b_der) / 3 / c.b_izq
         + COALESCE(m12.c, 0) * (c.b_izq + c.b_cen + c.b_der) / 3 / c.b_cen
         + COALESCE(m12.d, 0) * (c.b_izq + c.b_cen + c.b_der) / 3 / c.b_der))::bigint + 2 * COALESCE(pt.en_portadas, 0::bigint) AS peso
   FROM historias h
     JOIN pct c ON c.historia_id = h.id
     CROSS JOIN (SELECT greatest(count(*) FILTER (WHERE orientacion < 0), 1)::numeric AS ti,
                        greatest(count(*) FILTER (WHERE orientacion = 0), 1)::numeric AS tc,
                        greatest(count(*) FILTER (WHERE orientacion > 0), 1)::numeric AS td
                 FROM medios WHERE activo) ml
     LEFT JOIN tipo t ON t.historia_id = h.id
     LEFT JOIN portada pt ON pt.historia_id = h.id
     LEFT JOIN m12 ON m12.historia_id = h.id
     LEFT JOIN LATERAL (SELECT a.imagen, m.nombre AS imagen_medio FROM articulos a JOIN medios m ON m.id = a.medio_id
          WHERE a.historia_id = h.id AND a.imagen IS NOT NULL AND a.imagen !~* '\.(mp4|m3u8|mp3|webm|mov)(\?|$)'
          ORDER BY (SELECT count(*) FROM unnest(h.palabras[1:12]) p(w) WHERE p.w = ANY (a.palabras)) DESC, abs(m.orientacion), a.publicado DESC LIMIT 1) f ON true
     LEFT JOIN LATERAL (SELECT a.resumen AS entradilla, m.nombre AS entradilla_medio FROM articulos a JOIN medios m ON m.id = a.medio_id
          WHERE a.historia_id = h.id AND char_length(a.resumen) >= 80
          -- Entradilla (20/10): primero las que no abren con una frase corta de gancho («Crecen los problemas en Ferraz.»);
          -- luego las que nombran el hecho en su arranque (palabras clave de la historia en los primeros 300 caracteres de la
          -- propia entradilla, no del titular; con 5 basta) y, a igualdad, la del medio más cercano al centro
          ORDER BY (a.resumen ~ '^[^.!?]{0,50}[.!?]\s'),
                   LEAST((SELECT count(*) FROM unnest(h.palabras[1:12]) p(w) WHERE unaccent(lower(left(a.resumen, 300))) ~ ('\m' || p.w)), 5) DESC,
                   abs(m.orientacion), a.publicado DESC LIMIT 1) e ON true
  WHERE c.total >= 3 AND COALESCE(h.ia_tipo, 'publica') <> 'ligera';
