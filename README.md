# Vista Plena

**Cada noticia, contada por todos los lados.**
[vistaplena.es](https://vistaplena.es)

Vista Plena reúne los titulares de 38 medios españoles (13 de izquierda, 11 de centro y 14 de derecha), junta los que hablan del mismo hecho y muestra cuántos medios de izquierda, de centro y de derecha cuentan cada noticia. Así se ve qué historias cuenta todo el mundo, cuáles cuenta sobre todo un lado y cuáles apenas llegan a los lectores de un lado (los **puntos ciegos**).

No escribe noticias ni opina sobre ellas. No hay personalización: la portada es la misma para todo el mundo y se ordena por el número de medios que han contado cada historia en las últimas 12 horas. La única excepción, opcional, es el boletín de cada mañana: el lector elige de 1 a 5 medios que lee y recibe las noticias políticas que esos medios no han publicado (lo contrario de un algoritmo de recomendación).

## Cómo funciona

1. **Leer.** Cada hora se leen los canales públicos de cada medio: RSS, mapas de noticias o, si no hay otro modo, la portada.
2. **Agrupar.** Los titulares que hablan del mismo hecho se juntan en una historia, primero por palabras clave y después con una revisión por IA (Gemini) que saca lo que no encaja, junta repetidas y separa la opinión. Cada semana se revisa a mano una muestra y el porcentaje de aciertos se publica en la metodología.
3. **Contar.** Para cada historia se cuenta qué parte de los medios de cada lado la publica («5 de 13», «4 de 11», «9 de 14»). Cada medio cuenta por separado, sea cual sea su grupo.
4. **Mostrar.** La barra de colores enseña ese reparto y la página de cada historia enseña cómo la titula cada lado.

Todo se explica con detalle en la [metodología](https://vistaplena.es/metodologia.html).

## Las etiquetas de los medios

Cada **medio** (no cada noticia) tiene una etiqueta en cinco niveles: izquierda, centroizquierda, centro, centroderecha y derecha. Se basa en la ideología media de sus lectores según encuestas públicas y en su línea editorial. Es una clasificación revisable, no un juicio sobre su calidad.

## Qué es un punto ciego

Una historia es un punto ciego de la izquierda cuando es política, la publican 6 medios o más, lleva al menos 6 horas publicada, la parte de los medios de izquierda que la publica es como mucho la cuarta parte de la de los de derecha, la publican al menos 3 medios de derecha (o 2, si no la publica ninguno de izquierda) y ningún medio de izquierda la ha contado con otro enfoque. El de la derecha es lo mismo al revés. El centro no cuenta.

Solo se enseñan los puntos ciegos vigentes: con titulares nuevos en las últimas 48 horas y empezados hace menos de 4 días. Los de política de otro país van aparte, en «Fuera de España». La IA decide si una noticia es política y si es de España o de fuera.

## Datos abiertos

Los datos se pueden consultar libremente en formato JSON:

- Historias con su cobertura: `https://yzreenyaerjitbfxsiah.supabase.co/rest/v1/portada_v2?select=*&apikey=sb_publishable_1As_Elit5MJVUOZFOLeDjA_YMVv6jjF`
- Medios, etiquetas y estado de lectura: `https://yzreenyaerjitbfxsiah.supabase.co/rest/v1/estado_medios?select=*&apikey=sb_publishable_1As_Elit5MJVUOZFOLeDjA_YMVv6jjF`
- Archivo histórico (una ficha por historia desde el 8 de octubre de 2026): `https://yzreenyaerjitbfxsiah.supabase.co/rest/v1/archivo?select=*&fusionada=eq.false&apikey=sb_publishable_1As_Elit5MJVUOZFOLeDjA_YMVv6jjF`
- Guía electoral 29N: [`programas.json`](programas.json)

La clave que aparece en estas direcciones es pública y solo permite leer.

## Qué hay en este repositorio

| Archivo o carpeta | Qué es |
|---|---|
| `index.html` | Portada |
| `historia.html` | Página de cada historia |
| `tema.html` | Página de cada tema: las historias de un mismo asunto, en orden |
| `metodologia.html` | Cómo lo hacemos, con la tabla de medios en directo |
| `elecciones.html` · `programas.json` | Guía de las elecciones del 29N |
| `quienes-somos.html` · `aviso-legal.html` · `privacidad.html` | Información del proyecto y legal |
| `comun.js` | Menú y funciones compartidas por todas las páginas |
| `temas.js` | Secciones por tema (vivienda, economía…) y las palabras que las definen |
| `servidor/recoger/` | Programa que lee los medios y agrupa los titulares (se ejecuta cada hora) |
| `seo/generar.py` · `.github/workflows/publicar.yml` | Cada hora genera una página por noticia y por tema (`/noticia/…`, `/tema/…`), sus imágenes para redes y el mapa del sitio, y publica la web |
| `servidor/temas/` | Programa que agrupa las historias de la semana en temas (se ejecuta cada hora) |
| `servidor/mantenimiento/` | Copia de seguridad semanal (domingos, por correo) y avisos si algún medio o la recogida fallan (3 veces al día) |
| `servidor/portadas/` | Lee cada hora (minuto 8) los 15 primeros titulares de la portada web de cada medio: ordenan la portada y recogen noticias que no salen en los canales RSS |
| `servidor/congreso/` | Descarga las votaciones del Pleno del Congreso (datos abiertos) con el voto de cada partido; la función SQL `etiquetar_votaciones()` las clasifica por temas para la guía 29N |
| `servidor/boletin/` | Programa de los boletines por correo: el semanal (viernes a las 8:00) y el personal de cada mañana (7:30), con lo que no han publicado los medios que el lector dice leer. Los medios solo se guardan con su consentimiento expreso y se borran al darse de baja o pasar al semanal |
| `boletin-medios.html` | Página para cambiar los medios y la frecuencia del boletín con el enlace de cada correo (sin contraseña: el enlace lleva la llave) |
| `servidor/cuenta/` y `cuenta.html` | Cuentas de lector, opcionales: se entra con un enlace al correo o con Google, sin contraseña. Sirven para seguir temas, gestionar el boletín y, solo si el lector lo activa, ver su «dieta de medios» (cuántas veces abre cada medio por semana; nada más). Tablas en `servidor/cuentas.sql` |
| `servidor/portada.sql` · `servidor/puntos_ciegos.sql` | Cálculo de la cobertura y de los puntos ciegos |
| `servidor/verificar/` | Revisión con IA de cada historia: titulares que no encajan, repetidas, opinión, si es política y si es de España o de fuera |
| `servidor/asuntos/` | Temas grandes: la IA agrupa las historias de varios días en un mismo tema |

La web es estática y se publica con GitHub Pages. Los datos y los programas del servidor funcionan en Supabase.

## Límites conocidos

- La agrupación es automática y a veces junta dos noticias distintas o separa la misma en dos.
- Algunos medios publican muchos más titulares que otros. Para compensarlo se limita el número de titulares por medio y se excluyen las ediciones locales y la opinión.
- Algunos medios no ofrecen canales que se puedan leer, como Telecinco, y no están incluidos.

## Derechos de uso

© 2026 Vista Plena. Todos los derechos reservados.

- **Datos:** se pueden consultar, citar y usar con fines periodísticos, de investigación, educativos o personales, citando la fuente: *Vista Plena (vistaplena.es)*.
- **Código, diseño, marca y textos:** se pueden consultar, pero no reutilizar sin permiso por escrito.
- Cualquier uso comercial, la copia sistemática de los datos o su uso para crear un servicio parecido necesitan permiso por escrito.

Las condiciones completas están en el [aviso legal](https://vistaplena.es/aviso-legal.html#uso).

## Errores y propuestas

Si ves una noticia mal agrupada, un medio mal etiquetado o un dato equivocado, [abre una propuesta](https://github.com/juandoga/vistaplena/issues/new). Los cambios aceptados se anotan con su fecha en la web.
