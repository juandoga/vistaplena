-- Vista Plena — nueva regla de cobertura desigual (puntos ciegos), 5/11/2026
-- Pegar en Supabase → SQL Editor → Run. Solo cambia la columna punto_ciego de la vista portada_v2_calculo; el resto queda igual.
--
-- Antes: el lado ausente debía tener menos del 10 % y el otro el 50 % o más, comparando cada lado con lo que suele
-- publicar. En la práctica exigía que el lado ausente no tuviera NINGÚN medio y que el centro casi no la contara:
-- solo 4 puntos ciegos en 7 días, y noticias como «Vox pide suspender el voto a los hijos de los nacionalizados»
-- (1 de 13 medios de izquierda, 6 de 14 de derecha) no salían.
--
-- Ahora se usa la misma cuenta que la barra (qué parte de los medios de cada lado la publica):
--   · noticia política, 6 medios o más, 6 horas publicada (igual que antes);
--   · la parte del lado ausente es como mucho la cuarta parte de la del otro lado («1 de 13» frente a «5 de 14»);
--   · el otro lado la publica con al menos 3 medios (o 2, si el lado ausente no tiene ninguno);
--   · y ningún medio del lado ausente la ha contado con otro enfoque (igual que antes).
-- El centro ya no cuenta: una noticia que cuentan 5 de centro y 2 de izquierda, y ninguno de derecha, también es un punto ciego.
do $$
declare d text; i int; j int; nuevo text;
begin
  d := pg_get_viewdef('portada_v2_calculo'::regclass);
  i := position('WHEN ((c.voces >= 6)' in d);
  j := i + position('ELSE NULL::text' in substr(d, i)) - 1;
  if i = 0 or j <= i then raise exception 'No se encuentra la regla de punto_ciego en la vista'; end if;
  nuevo := $q$WHEN ((c.voces >= 6) AND (h.ia_politica IS TRUE) AND (h.creada < (now() - '06:00:00'::interval)) AND ((c.der >= 3) OR ((c.der >= 2) AND (c.izq = 0))) AND ((((c.izq)::numeric / ml.ti) * (4)::numeric) <= ((c.der)::numeric / ml.td)) AND (NOT (EXISTS ( SELECT 1 FROM jsonb_array_elements(h.tambien) x(value) WHERE (((x.value ->> 'orientacion'::text))::integer < 0))))) THEN 'izquierda'::text
            WHEN ((c.voces >= 6) AND (h.ia_politica IS TRUE) AND (h.creada < (now() - '06:00:00'::interval)) AND ((c.izq >= 3) OR ((c.izq >= 2) AND (c.der = 0))) AND ((((c.der)::numeric / ml.td) * (4)::numeric) <= ((c.izq)::numeric / ml.ti)) AND (NOT (EXISTS ( SELECT 1 FROM jsonb_array_elements(h.tambien) x(value) WHERE (((x.value ->> 'orientacion'::text))::integer > 0))))) THEN 'derecha'::text
            $q$;
  d := substr(d, 1, i - 1) || nuevo || substr(d, j);
  execute 'create or replace view portada_v2_calculo as ' || d;
end $$;
select refrescar_portada();
