-- Vista Plena — registro de fusiones y cómo deshacerlas.
--
-- Cuando dos historias se juntan (recoger, paso 3b; verificar, fase 2; o a mano), sus titulares pasan de una a otra.
-- Antes no quedaba rastro de dónde venía cada titular y una fusión equivocada no se podía separar.
-- Ahora cada cambio de historia de un titular (de una historia a otra, no desde «suelto») queda apuntado en
-- historias_movimientos, y deshacer_fusion(de, a) devuelve los titulares a su historia original.

create table if not exists public.historias_movimientos (
  id bigserial primary key,
  creado timestamptz not null default now(),
  articulo_id bigint not null,
  de bigint not null,          -- historia de la que salió
  a bigint not null,           -- historia a la que pasó
  titulo_de text,              -- título de la historia de la que salió (por si después se borra)
  creada_de timestamptz        -- y su fecha de creación
);
create index if not exists historias_movimientos_de_a on public.historias_movimientos (de, a);
create index if not exists historias_movimientos_creado on public.historias_movimientos (creado);
alter table public.historias_movimientos enable row level security; -- privada: solo la ven las funciones del servidor

create or replace function public.apuntar_movimiento() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into historias_movimientos (articulo_id, de, a, titulo_de, creada_de)
  select new.id, old.historia_id, new.historia_id, h.titulo, h.creada from (select 1) x
  left join historias h on h.id = old.historia_id;
  return null;
end $$;

drop trigger if exists apuntar_movimiento on public.articulos;
create trigger apuntar_movimiento
  after update of historia_id on public.articulos
  for each row when (old.historia_id is not null and new.historia_id is not null and old.historia_id <> new.historia_id)
  execute function public.apuntar_movimiento();

-- Deshace la fusión de la historia «p_de» en «p_a»: los titulares que pasaron de una a otra y siguen en «p_a» vuelven
-- a «p_de» (si «p_de» se borró al fusionar, se vuelve a crear con su número, título y fecha). Después:
--  - se apunta en historias_pares que son distintas, para que verificar no las vuelva a juntar;
--  - la más reciente queda enlazada a la otra (historias.anterior), para que recoger tampoco las junte.
-- Devuelve cuántos titulares han vuelto. Uso: select deshacer_fusion(4803, 4774);
create or replace function public.deshacer_fusion(p_de bigint, p_a bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; t text; c timestamptz;
begin
  select titulo_de, creada_de into t, c from historias_movimientos where de = p_de and a = p_a order by id desc limit 1;
  if t is null then raise exception 'No hay ninguna fusión apuntada de la historia % en la %', p_de, p_a; end if;
  if not exists (select 1 from historias where id = p_de) then
    insert into historias (id, titulo, creada, actualizada) values (p_de, t, coalesce(c, now()), now());
  end if;
  update articulos ar set historia_id = p_de
  from (select distinct articulo_id from historias_movimientos where de = p_de and a = p_a) m
  where ar.id = m.articulo_id and ar.historia_id = p_a;
  get diagnostics n = row_count;
  update historias set actualizada = now() where id in (p_de, p_a);
  insert into historias_pares (a, b, resultado) values (least(p_de, p_a), greatest(p_de, p_a), 'distinta')
    on conflict (a, b) do update set resultado = 'distinta';
  update historias set anterior = case when id = p_de then p_a else p_de end
  where id = (select id from historias where id in (p_de, p_a) order by creada desc, id desc limit 1) and anterior is null;
  perform refrescar_portada();
  return n;
end $$;
revoke all on function public.deshacer_fusion(bigint, bigint) from public, anon, authenticated;
