-- Vista Plena — estado de los programas electorales del 29N (11/11/2026)
--
-- La guía de elecciones (elecciones.html) combina esta tabla con programas.json: así, cuando un partido publica su
-- programa, el enlace y la fecha salen en la web en cuanto se apunta aquí, sin esperar a cambiar el archivo.
-- Una tarea programada la revisa dos veces al día en las webs oficiales de los partidos (y en la prensa, para saber
-- cuándo anuncian que lo presentarán) y actualiza «comprobado» aunque no haya novedades.
--   estado        publicado (programa completo) · resumen (solo un resumen o unos ejes) · pendiente
--   url, fecha    el documento oficial y cuándo se publicó
--   presentacion  fecha anunciada para presentarlo, si aún no lo ha publicado
--   fuente        de dónde sale esa fecha o la última comprobación
create table if not exists public.programas (
  partido text primary key,
  estado text not null check (estado in ('publicado', 'resumen', 'pendiente')),
  url text,
  fecha date,
  presentacion date,
  nota text,
  fuente text,
  comprobado timestamptz not null default now()
);
alter table public.programas enable row level security;
drop policy if exists "programas: lectura pública" on public.programas;
create policy "programas: lectura pública" on public.programas for select to anon, authenticated using (true);
grant select on public.programas to anon, authenticated;

-- Estado comprobado a mano el 11/11/2026 en las webs oficiales; PSOE y Adelante Andalucía, actualizados el 15/11/2026
insert into public.programas (partido, estado, url, fecha, presentacion, nota, comprobado) values
  ('psoe', 'publicado', 'https://www.psoe.es/actualidad/noticias-actualidad/pedro-sanchez-el-29n-haremos-un-referendum-en-favor-de-la-buena-politica-frente-a-la-mala-educacion-de-la-derecha-y-la-ultraderecha/', '2026-11-15', null, 'Su programa, «La fuerza de seguir avanzando», tiene 113 páginas. Lo presentó el 15 de noviembre en Alcorcón; el PDF está adjunto a esta noticia de su web.', now()),
  ('pp', 'publicado', 'https://www.pp.es/wp-content/uploads/2026/11/LA-RECONSTRUCCION-NACIONAL.pdf', '2026-11-10', null, 'Su programa, «Reconstrucción nacional», tiene 249 medidas en 82 páginas. Ocho de ellas (por ejemplo, la 109, sobre pensiones) no se cuentan aún: el PP dice que las dará a conocer durante la campaña.', now()),
  ('vox', 'publicado', 'https://www.voxespana.es/wp-content/uploads/2026/10/RECUPERAR-ESPANA-A4.pdf', '2026-10-20', null, 'Su programa es «Recuperar España», un documento de seis páginas con tres ejes: prioridad nacional, desregulación y remigración.', now()),
  ('fa', 'pendiente', null, null, null, 'Aún no ha publicado un programa completo ni ha dado fecha; su web (frenteamplio.info) solo tiene notas de prensa con medidas sueltas. Recogemos las medidas que ha anunciado.', now()),
  ('podemos', 'pendiente', null, null, null, 'El 19 de octubre presentó los cinco ejes de su programa, pero no ha publicado el documento completo; su web no tiene ninguno para el 29N.', now()),
  ('erc', 'publicado', 'https://www.esquerrarepublicana.cat/documents/e2026-programa.pdf', '2026-11-05', null, null, now()),
  ('junts', 'pendiente', null, null, null, 'No hemos encontrado programa para el 29N. Su web (junts.cat) no deja consultarla desde nuestro sistema, así que lo comprobamos también en la prensa.', now()),
  ('bildu', 'pendiente', null, null, null, 'Aún no ha publicado su programa. Ha ido anunciando medidas, como la prórroga automática de los alquileres (9 de noviembre).', now()),
  ('pnv', 'publicado', 'https://www.eaj-pnv.eus/es/adjuntos-documentos/21765/pdf/programa-electoral-29n', '2026-11-09', null, null, now()),
  ('bng', 'publicado', 'https://www.bng.gal/media/bnggaliza/files/2026/11/03/26_bng_xerais_documentos_programa_electoral.pdf', '2026-11-03', null, 'El 7 de noviembre presentó además un decálogo de compromisos.', now()),
  ('cc', 'publicado', 'https://coalicioncanaria.org/wp-content/uploads/2026/11/CCA-26-Programa_Electoral-29NOV.pdf', '2026-11-08', null, 'Su programa, «Defiende Canarias», es común con Municipalistas Primero Canarias. Lo presentó el 9 de noviembre.', now()),
  ('upn', 'pendiente', null, null, null, 'Se presenta en coalición con el PP en Navarra. No ha publicado un programa propio.', now()),
  ('compromis', 'resumen', 'https://frontvalencia.org/#programa', null, null, 'Coalición de Compromís, Podemos, Esquerra Unida y ERPV que solo se presenta en la Comunidad Valenciana. En su web (frontvalencia.org) hay un resumen en seis ejes (vivienda, trabajo, trato justo, territorio, movilidad e igualdad); el programa completo aún no está.', now()),
  ('adelante', 'publicado', 'https://programa.adelanteandalucia.org/programa-29n-adelante-andalucia.pdf', '2026-11-10', null, 'Se presenta solo en Andalucía. Su programa, «Un programa para frenar a las derechas», tiene 719 propuestas; las 29 principales están resumidas en «Las 29 del 29N». Lo presentó el 10 de noviembre.', now())
on conflict (partido) do update set estado = excluded.estado, url = excluded.url, fecha = excluded.fecha,
  presentacion = excluded.presentacion, nota = excluded.nota, comprobado = excluded.comprobado;
