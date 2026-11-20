-- Medios 20/11/2026: nueva regla de etiquetas (CIS 2025; si no llega, dos fuentes que coinciden) y medios «en espera».
alter table medios add column if not exists espera boolean not null default false;
alter table medios add column if not exists medicion_propia numeric;
comment on column medios.espera is 'Se leen sus titulares (a articulos_espera) pero no se publican ni cuentan: falta una segunda fuente para su etiqueta';
comment on column medios.medicion_propia is 'Lado estimado por las noticias que elige (co-cobertura con los medios medidos por el CIS), escala 1-10';
create table if not exists articulos_espera (
  id bigserial primary key,
  medio_id int not null references medios(id) on delete cascade,
  titulo text not null, url text not null unique, resumen text,
  publicado timestamptz, palabras text[], recogido timestamptz not null default now());
alter table articulos_espera enable row level security;
create index if not exists articulos_espera_medio on articulos_espera (medio_id, publicado);

create temp table _nuevo(id int, o smallint, cis numeric, conf text, nota text, propia numeric);
insert into _nuevo values
(2,-2,3.86,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 3,86.',null),
(3,-2,3.84,'alta','CIS 2023 y 2025: sus lectores lo sitúan en 3,84 (66 lectores).',null),
(19,-2,3.11,'media','CIS 2025: ideología media de sus 90 lectores, pasada a la escala de los medios: 3,11.',null),
(9,-2,3.96,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 3,96. Es el dato de La 1; Canal 24 horas, 4,13; RNE, 4,29. Al límite entre izquierda y centroizquierda.',null),
(1,-1,4.6,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 4,60.',null),
(5,-1,4.02,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 4,02. Al límite entre izquierda y centroizquierda.',null),
(4,-1,4.22,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 4,22.',null),
(25,-1,4.29,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 4,29.',null),
(21,-1,4.0,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 4,00. Al límite entre izquierda y centroizquierda.',null),
(7,0,5.04,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 5,04. Al límite entre centroizquierda y centro.',null),
(6,0,5.38,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 5,38.',null),
(31,0,5.76,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 5,76.',null),
(29,0,5.53,'alta','CIS 2025: sus lectores lo sitúan en 5,53 (204 lectores).',null),
(32,0,5.77,'alta','CIS 2025: sus lectores lo sitúan en 5,77 (101 lectores).',null),
(33,0,5.41,'alta','CIS 2023 y 2025: sus lectores lo sitúan en 5,41 (124 lectores).',null),
(10,0,5.89,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 5,89.',null),
(22,1,6.37,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 6,37.',null),
(39,1,6.04,'media','CIS 2023 y 2025: ideología media de sus 121 lectores, pasada a la escala de los medios: 6,04. Al límite entre centro y centroderecha.',null),
(12,1,6.49,'alta','CIS 2025: sus lectores lo sitúan en 6,49 (55 lectores).',null),
(11,1,6.84,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 6,84.',null),
(40,1,6.28,'alta','CIS 2025: sus lectores lo sitúan en 6,28 (58 lectores).',null),
(35,1,6.0,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 6,00. Al límite entre centro y centroderecha.',null),
(13,2,7.43,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 7,43.',null),
(14,2,7.28,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 7,28.',null),
(18,2,7.67,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 7,67.',null),
(17,2,7.82,'media','CIS 2025: ideología media de sus 60 lectores, pasada a la escala de los medios: 7,82.',null),
(16,2,7.26,'alta','CIS 2025: sus lectores lo sitúan en 7,26 (70 lectores).',null),
(15,2,7.31,'alta','CIS 2025: el conjunto de los encuestados lo sitúa en 7,31.',null),
(26,-1,null,'media','Estimado: dos fuentes coinciden. Estudio de Twitter (Guerrero-Solé, 2022): 4,11, centroizquierda. Noticias que elige (datos de Vista Plena): 4,42, centroizquierda.',4.42),
(27,-2,null,'media','Estimado: dos fuentes coinciden. Noticias que elige (datos de Vista Plena): 3,91, izquierda. Se define progresista y Wikipedia lo describe alineado con el PSOE.',3.91),
(8,0,null,'media','Estimado: tres fuentes coinciden. Estudio de Twitter (Guerrero-Solé, 2022): 6,50, centro en su escala. Media Bias/Fact Check: «Least Biased». Noticias que elige (datos de Vista Plena): 5,27, centro.',5.27),
(34,1,null,'media','Estimado: tres fuentes coinciden. Estudio de Twitter (Guerrero-Solé, 2022): 7,75, centroderecha en su escala. Ground News: «Lean Right». Noticias que elige (datos de Vista Plena): 6,26, centroderecha.',6.26),
(30,1,null,'media','Estimado: dos fuentes coinciden. eurotopics: «Right-wing». Noticias que elige (datos de Vista Plena): 6,25, centroderecha.',6.25);
insert into medios_cambios(fecha, medio, antes, despues, motivo)
select date '2026-11-20', m.nombre, m.orientacion, n.o,
  'Nueva regla: manda el CIS 2025 y, si no llega, dos fuentes que coinciden. ' || n.nota
from _nuevo n join medios m on m.id=n.id where m.orientacion <> n.o;
update medios m set orientacion=n.o, medicion_cis=n.cis, confianza=n.conf, nota_etiqueta=n.nota, medicion_propia=n.propia, revisado=date '2026-11-20'
from _nuevo n where m.id=n.id;
-- En espera: sin segunda fuente o sin datos suficientes
insert into medios_cambios(fecha, medio, antes, despues, motivo)
select date '2026-11-20', nombre, orientacion, null, 'Pasa a «en espera»: no hay dos fuentes que coincidan en su lado. Seguimos leyendo sus titulares y entrará en cuanto las haya.'
from medios where id in (24,28,23,20,38) and activo;
update medios set activo=false, espera=true, confianza=null, revisado=date '2026-11-20', nota_etiqueta = case id
  when 24 then 'En espera. Noticias que elige (datos de Vista Plena): 5,73, centro al límite de centroderecha. No hay ninguna clasificación externa.'
  when 28 then 'En espera. Noticias que elige (datos de Vista Plena): 5,91, centro. No hay ninguna clasificación externa de la edición española.'
  when 23 then 'En espera. Media Bias/Fact Check: «Least Biased». Pocas noticias en común con otros medios para medir qué noticias elige.'
  when 20 then 'En espera. eurotopics: izquierda. Pocas noticias en común con otros medios para medir qué noticias elige.'
  when 38 then 'En espera. Sin clasificación externa y con pocas noticias en común con otros medios.' end,
  medicion_propia = case id when 24 then 5.73 when 28 then 5.91 end
where id in (24,28,23,20,38);
insert into articulos_espera (medio_id, titulo, url, resumen, publicado, palabras, recogido)
select medio_id, titulo, url, resumen, publicado, palabras, recogido from articulos where medio_id in (24,28,23,20,38)
on conflict (url) do nothing;
delete from articulos where medio_id in (24,28,23,20,38);
-- Nuevos con dato del CIS
insert into medios (nombre, web, rss, orientacion, activo, espera, grupo, medicion_cis, confianza, nota_etiqueta, revisado) values
('Gara', 'https://www.naiz.eus/es', 'https://www.naiz.eus/es/rss/news.rss solo:castellano', -2, true, false, 'Baigorri', 2.44, 'alta', 'CIS 2023 y 2025: sus lectores lo sitúan en 2,44 (59 lectores). Leemos su web, naiz.eus, en castellano.', date '2026-11-20'),
('Noticias de Navarra', 'https://www.noticiasdenavarra.com', 'https://www.noticiasdenavarra.com/rss/', -1, true, false, 'Grupo Noticias', 4.22, 'alta', 'CIS 2023 y 2025: sus lectores lo sitúan en 4,22 (75 lectores).', date '2026-11-20'),
('El Nacional', 'https://www.elnacional.cat/es/', 'html:https://www.elnacional.cat/es/ solo:/es/', -1, true, false, 'El Nacional', 4.24, 'alta', 'CIS 2023 y 2025: sus lectores lo sitúan en 4,24 (52 lectores). Leemos su edición en castellano.', date '2026-11-20'),
('Canal Sur', 'https://www.canalsur.es', 'https://www.canalsur.es/canalsur_sitemap_google_news.xml solo:/noticias/', 0, true, false, 'RTVA', 5.79, 'alta', 'CIS 2025: el conjunto de los encuestados lo sitúa en 5,79.', date '2026-11-20'),
('Levante-EMV', 'https://www.levante-emv.com', 'https://www.levante-emv.com/rss/', -1, false, true, 'Prensa Ibérica', 4.86, null, 'A prueba una semana: CIS 2025, sus lectores lo sitúan en 4,86 (102 lectores). Es del mismo grupo que El Periódico; medimos cuántos titulares repiten antes de publicarlo.', date '2026-11-20'),
('Artículo 14', 'https://www.articulo14.es', 'https://news.google.com/rss/search?q=site:articulo14.es+when:2d&hl=es&gl=ES&ceid=ES:es', 0, false, true, 'Articulocatorce Ediciones', null, null, 'En espera: el CIS no lo mide y no hay clasificación externa. Recogemos sus titulares para medir qué noticias elige.', date '2026-11-20'),
('El Constitucional', 'https://www.elconstitucional.es', 'https://news.google.com/rss/search?q=site:elconstitucional.es+when:2d&hl=es&gl=ES&ceid=ES:es', 0, false, true, 'El Constitucional', null, null, 'En espera: el CIS no lo mide y no hay clasificación externa. Recogemos sus titulares para medir qué noticias elige.', date '2026-11-20');
insert into medios_cambios(fecha, medio, antes, despues, motivo)
select date '2026-11-20', nombre, null, orientacion, 'Entra: ' || nota_etiqueta from medios where nombre in ('Gara','Noticias de Navarra','El Nacional','Canal Sur');
