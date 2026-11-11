-- Vista Plena — cuentas de lectores (11/11/2026)
--
-- Tener cuenta es opcional: para leer no hace falta. Sirve para gestionar el boletín, seguir temas y, solo si el lector
-- lo activa, ver su «dieta de medios» (de qué lados son los medios que abre desde Vista Plena).
-- Se entra con un enlace al correo o con Google. No hay contraseñas. Solo se guardan huellas SHA-256 de enlaces y sesiones.
-- Todo es privado: solo lo lee la función «cuenta» con la clave de servicio (RLS activado y sin políticas).

create table if not exists public.usuarios (
  id bigint generated always as identity primary key,
  email text not null unique,
  creado timestamptz not null default now(),
  ultimo_acceso timestamptz,
  via text,                 -- última forma de entrar: 'enlace' o 'google'
  dieta_desde timestamptz   -- consentimiento para guardar qué medios abre (null = desactivado)
);

-- Enlaces de entrada (30 minutos, un solo uso; llevan el correo hasta que se usan o caducan) y sesiones (180 días)
create table if not exists public.usuarios_accesos (
  id bigint generated always as identity primary key,
  huella text not null unique,
  tipo text not null check (tipo in ('enlace', 'sesion')),
  usuario_id bigint references public.usuarios(id) on delete cascade,
  email text,
  caduca timestamptz not null,
  usado timestamptz,
  creado timestamptz not null default now()
);
create index if not exists usuarios_accesos_email on public.usuarios_accesos (email, creado) where email is not null;
create index if not exists usuarios_accesos_tipo on public.usuarios_accesos (tipo, creado);

-- Temas que sigue: 'a12' es un tema grande (asunto) y '34' uno pequeño. visto = última vez que lo abrió
create table if not exists public.usuarios_temas (
  usuario_id bigint not null references public.usuarios(id) on delete cascade,
  tema text not null check (tema ~ '^a?[0-9]+$'),
  creado timestamptz not null default now(),
  visto timestamptz not null default now(),
  primary key (usuario_id, tema)
);

-- Dieta de medios: cuántas veces abre cada medio por semana. Nada más: ni qué noticia ni a qué hora.
create table if not exists public.usuarios_lecturas (
  usuario_id bigint not null references public.usuarios(id) on delete cascade,
  medio_id integer not null references public.medios(id) on delete cascade,
  semana date not null,
  n integer not null default 1,
  primary key (usuario_id, medio_id, semana)
);

alter table public.usuarios enable row level security;
alter table public.usuarios_accesos enable row level security;
alter table public.usuarios_temas enable row level security;
alter table public.usuarios_lecturas enable row level security;

create or replace function public.sumar_lectura(p_usuario bigint, p_medio integer) returns void
language sql set search_path = public as $$
  insert into public.usuarios_lecturas (usuario_id, medio_id, semana, n)
  values (p_usuario, p_medio, date_trunc('week', now() at time zone 'Europe/Madrid')::date, 1)
  on conflict (usuario_id, medio_id, semana) do update set n = public.usuarios_lecturas.n + 1;
$$;
revoke execute on function public.sumar_lectura(bigint, integer) from public, anon, authenticated;
