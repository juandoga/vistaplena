-- Vista Plena — pares_parecidos(): parejas de noticias que quizá cuentan el mismo hecho, para que verificar (fase 2)
-- le pregunte a la IA si son la misma.
--
-- Cambios del 19-10-2026 (revisión semanal: dos repetidas sin detectar):
--  - Antes solo miraba las noticias de la portada (3 o más medios). Ahora mira todas las de 2 o más medios de las
--    últimas 48 horas: el discurso de Vivas ante los Reyes tenía una noticia de 2 medios y otra de 3, y no se comparó.
--  - Basta con 3 palabras clave en común (de las 10 principales) en vez de 4. Primero, las parejas que más comparten.
--  - Las noticias ligeras (deportes, famosos…) no se comparan.
create or replace function public.pares_parecidos()
returns table(a integer, b integer, ta text, tb text, na integer, nb integer)
language sql security definer set search_path to 'public' as $$
  with n as (
    select historia_id id, count(distinct medio_id) total from articulos
    where historia_id is not null and publicado > now() - interval '72 hours'
    group by historia_id having count(distinct medio_id) >= 2
  ), h as (
    select hi.id, hi.titulo, n.total, hi.palabras[1:10] w from historias hi join n on n.id = hi.id
    where hi.actualizada > now() - interval '48 hours' and coalesce(hi.ia_tipo, '') <> 'ligera'
  ), p as (
    select x.id xa, y.id yb, x.titulo xt, y.titulo yt, x.total xn, y.total yn,
           (select count(*) from unnest(x.w) q where q = any(y.w)) comun
    from h x join h y on x.id < y.id
  )
  select xa::int, yb::int, xt, yt, xn::int, yn::int from p
  where comun >= 3 and not exists (select 1 from historias_pares hp where hp.a = p.xa and hp.b = p.yb)
  order by comun desc
  limit 60
$$;
