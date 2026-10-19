-- Vista Plena — vetos: un titular sacado de una historia (a mano en la gestión, por la IA o por la depuración)
-- nunca vuelve a ella, venga el cambio de donde venga.
--
-- Antes el veto solo se miraba al agrupar un titular nuevo. Al juntar dos historias repetidas (recoger, paso 3b,
-- y verificar, fase 2) se movían todos los titulares sin mirarlo, y uno de cada cinco titulares vetados había vuelto
-- (117 de 578 el 19 de octubre de 2026). Este disparador lo impide en la propia base de datos: si alguien intenta
-- poner un titular en una historia de la que está vetado, se queda suelto y puede agruparse en otra.

create or replace function public.respetar_vetos() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.historia_id is not null and exists (
    select 1 from historia_vetos v where v.articulo_id = new.id and v.historia_id = new.historia_id
  ) then
    new.historia_id := null;
  end if;
  return new;
end $$;

drop trigger if exists respetar_vetos on public.articulos;
create trigger respetar_vetos
  before insert or update of historia_id on public.articulos
  for each row when (new.historia_id is not null)
  execute function public.respetar_vetos();

-- Limpieza única (19-10-2026): los titulares que ya habían vuelto a una historia de la que estaban vetados
-- update articulos a set historia_id = null from historia_vetos v where v.articulo_id = a.id and v.historia_id = a.historia_id;
