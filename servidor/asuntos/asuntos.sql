-- Vista Plena — ASUNTOS: el nivel de arriba de los temas (19/10/2026).
-- Un asunto es una historia de fondo de varios días («Protestas en Francia») que reúne hechos distintos con el mismo origen:
-- las huelgas, los disturbios, el discurso de Macron, la prima de riesgo… Los temas (servidor/temas) se forman por palabras
-- y se parten cuando la noticia cambia de palabras; el asunto lo decide una IA (servidor/asuntos) y no se parte.
-- Para el lector, un asunto es un «tema» más grande: se ve en la portada y en /tema/<nombre>-a<id>/.

create table if not exists asuntos (
  id bigint generated always as identity primary key,
  nombre text not null,
  nombre_manual text,            -- si Juan lo renombra desde la gestión
  descripcion text,              -- una frase neutra: qué une a sus noticias
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),   -- última noticia nueva
  historias int not null default 0,                  -- noticias en los últimos 14 días
  medios_48h int not null default 0,                 -- medios distintos que lo han contado en 48 h (para ordenar la portada)
  activo boolean not null default true,              -- se apaga a los 4 días sin noticias nuevas
  oculto boolean not null default false              -- deshecho desde la gestión
);
alter table asuntos enable row level security;
drop policy if exists "lectura publica de asuntos" on asuntos;
create policy "lectura publica de asuntos" on asuntos for select to anon, authenticated using (not oculto);

alter table historias add column if not exists asunto_id bigint references asuntos(id) on delete set null;
alter table historias add column if not exists asunto_revisado timestamptz;   -- cuándo la vio la IA por primera vez
create index if not exists historias_asunto_idx on historias(asunto_id);

-- Vetos: una noticia sacada de un asunto desde la gestión no vuelve a él. asunto_id = 0: no entra en ningún asunto.
create table if not exists asuntos_vetos (
  historia_id bigint not null,
  asunto_id bigint not null,
  creado timestamptz not null default now(),
  primary key (historia_id, asunto_id)
);
alter table asuntos_vetos enable row level security;

-- Registro de todo lo que decide la función (crear, asignar, propagar, unir): para revisar y deshacer
create table if not exists asuntos_registro (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  asunto_id bigint,
  accion text not null,          -- crear | asignar | propagar | unir | sacar | deshacer | renombrar
  historias bigint[],
  detalle text
);
alter table asuntos_registro enable row level security;

-- Lo que lee la web: cada asunto con sus noticias (ids) y los temas que contiene
create or replace view asuntos_v with (security_invoker = on) as
select a.id, coalesce(a.nombre_manual, a.nombre) as nombre, a.descripcion, a.creado, a.actualizado, a.activo, a.medios_48h,
  count(h.id)::int as historias,
  count(h.id) filter (where h.creada > now() - interval '48 hours')::int as nuevas_48h,
  coalesce(array_agg(h.id order by h.creada) filter (where h.id is not null), '{}') as ids,
  coalesce(array_agg(distinct h.tema_id) filter (where h.tema_id is not null), '{}') as temas
from asuntos a
left join historias h on h.asunto_id = a.id and h.actualizada > now() - interval '14 days'
where not a.oculto
group by a.id;
grant select on asuntos_v to anon, authenticated;

-- Noticias candidatas (3 o más medios) con su tema: la función de asuntos las lee de aquí
create or replace function historias_para_asuntos(horas int default 168)
returns table(id bigint, titulo text, creada timestamptz, actualizada timestamptz, medios int, tema_id bigint, tema text,
  asunto_id bigint, asunto_revisado timestamptz, anterior bigint, ia_tipo text)
language sql stable security definer set search_path = public as $$
  select h.id, h.titulo, h.creada, h.actualizada, count(distinct a.medio_id)::int, h.tema_id, coalesce(t.nombre_manual, t.nombre),
    h.asunto_id, h.asunto_revisado, h.anterior, h.ia_tipo
  from historias h
  join articulos a on a.historia_id = h.id
  left join temas t on t.id = h.tema_id
  where h.actualizada > now() - make_interval(hours => horas)
  group by h.id, t.id
  having count(distinct a.medio_id) >= 3
$$;
revoke all on function historias_para_asuntos(int) from public, anon, authenticated;

-- Recuento de cada asunto: noticias, medios en 48 h, última novedad; se apaga a los 4 días sin noticias nuevas
create or replace function recontar_asuntos() returns void
language sql security definer set search_path = public as $$
  update asuntos s set
    historias = coalesce(x.n, 0),
    medios_48h = coalesce(x.m, 0),
    actualizado = greatest(s.creado, coalesce(x.ult, s.actualizado)),
    activo = not s.oculto and coalesce(x.ult, s.actualizado) > now() - interval '4 days'
  from (
    select a.id,
      (select count(*) from historias h where h.asunto_id = a.id and h.actualizada > now() - interval '14 days') n,
      (select count(distinct r.medio_id) from historias h join articulos r on r.historia_id = h.id
        where h.asunto_id = a.id and r.publicado > now() - interval '48 hours') m,
      (select max(h.actualizada) from historias h where h.asunto_id = a.id) ult
    from asuntos a where a.activo or a.actualizado > now() - interval '8 days'
  ) x
  where x.id = s.id;
$$;
revoke all on function recontar_asuntos() from public, anon, authenticated;

-- Deshacer un asunto entero (gestión): sus noticias quedan sueltas y no vuelven a él
create or replace function deshacer_asunto(a bigint) returns int
language plpgsql security definer set search_path = public as $$
declare ids bigint[];
begin
  select array_agg(id) into ids from historias where asunto_id = a;
  insert into asuntos_vetos (historia_id, asunto_id) select unnest(coalesce(ids, '{}')), a on conflict do nothing;
  update historias set asunto_id = null where asunto_id = a;
  update asuntos set oculto = true, activo = false where id = a;
  insert into asuntos_registro (asunto_id, accion, historias, detalle) values (a, 'deshacer', ids, 'desde la gestión');
  return coalesce(array_length(ids, 1), 0);
end $$;
revoke all on function deshacer_asunto(bigint) from public, anon, authenticated;

-- Sacar una noticia de su asunto (gestión): no vuelve a él
create or replace function sacar_de_asunto(h bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a bigint;
begin
  select asunto_id into a from historias where id = h;
  if a is null then return; end if;
  insert into asuntos_vetos (historia_id, asunto_id) values (h, a) on conflict do nothing;
  update historias set asunto_id = null where id = h;
  insert into asuntos_registro (asunto_id, accion, historias, detalle) values (a, 'sacar', array[h], 'desde la gestión');
end $$;
revoke all on function sacar_de_asunto(bigint) from public, anon, authenticated;

-- Tareas programadas (creadas el 19/10/2026)
-- select cron.schedule('asuntos', '18 * * * *', $$select llamar_interna('asuntos')$$);                     -- cada hora, después de temas (min 16)
-- select cron.schedule('asuntos-diario', '48 5 * * *', $$select llamar_interna('asuntos?modo=diario')$$);   -- 7:48 en Madrid: une asuntos repetidos

-- 19/10 (2): un tema pequeño cuenta como «dentro» de un asunto solo si al menos la mitad de sus noticias están en él
-- (si no, un tema mal hecho con una sola noticia del asunto se escondía en la portada o se enlazaba al asunto)
create or replace view asuntos_v with (security_invoker = on) as
select a.id, coalesce(a.nombre_manual, a.nombre) as nombre, a.descripcion, a.creado, a.actualizado, a.activo, a.medios_48h,
  count(h.id)::int as historias,
  count(h.id) filter (where h.creada > now() - interval '48 hours')::int as nuevas_48h,
  coalesce(array_agg(h.id order by h.creada) filter (where h.id is not null), '{}') as ids,
  coalesce((select array_agg(x.tema_id) from (
      select h2.tema_id, count(*) c from historias h2 where h2.asunto_id = a.id and h2.tema_id is not null group by 1) x
    join temas t on t.id = x.tema_id where x.c * 2 >= greatest(t.historias, 1)), '{}') as temas
from asuntos a
left join historias h on h.asunto_id = a.id and h.actualizada > now() - interval '14 days'
where not a.oculto
group by a.id;
grant select on asuntos_v to anon, authenticated;
