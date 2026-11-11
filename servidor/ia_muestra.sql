-- Vista Plena — la IA decide sola y se mide con una muestra diaria (11/11/2026)
--
-- historias.titulo_fijo        cuándo eligió el título la IA (o una persona). recoger ya no lo recalcula y verificar
--                              no vuelve a sospechar de él.
-- historias_dudosas.decidio    quién cerró la duda: 'ia' (verificar) o 'gestion' (a mano). Sirve para sacar la muestra
--                              solo de lo que decidió la IA.
-- ia_muestra                   respuestas a la muestra diaria de la gestión: 5 titulares que la IA sacó y 5 que dejó,
--                              al azar. acierto = la IA acertó. De aquí sale el porcentaje de acierto.
alter table public.historias add column if not exists titulo_fijo timestamptz;
alter table public.historias_dudosas add column if not exists decidio text check (decidio in ('ia', 'gestion'));

create table if not exists public.ia_muestra (
  articulo_id bigint primary key,
  historia_id bigint not null,
  decision_ia text not null check (decision_ia in ('sacar', 'bien')),
  acierto boolean not null,
  dia date not null,
  creado timestamptz not null default now()
);
alter table public.ia_muestra enable row level security; -- solo la función de gestión (clave de servicio)
create index if not exists ia_muestra_dia on public.ia_muestra (dia);
create index if not exists historias_dudosas_decidio on public.historias_dudosas (decidio, ia_fecha) where decidio is not null;

-- Puesta en marcha (una vez):
--  1. Las dudas en las que la IA ya dijo «mismo hecho» se cierran como bien, decididas por la IA.
--  2. Lo que la IA sacó sola en los últimos 3 días queda como decidido por la IA (para la primera muestra).
--  3. Las dudas pendientes por «título raro» se vuelven a preguntar con la lógica nueva (la IA elige el título).
-- update public.historias_dudosas set decision = 'bien', decidio = 'ia' where decision is null and ia = 'mismo';
-- update public.historias_dudosas set decidio = 'ia' where decision = 'sacar' and ia = 'otro' and decidio is null and ia_fecha > now() - interval '3 days';
-- update public.historias_dudosas set ia = null where decision is null and motivo like 'quizá el que no encaja%' and creado > now() - interval '3 days';
