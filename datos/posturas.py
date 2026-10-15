# Vista Plena — qué propone cada partido, tema a tema, mientras no haya programas para el 29N.
# Cada propuesta lleva fuente y fecha. «como»: si = explica cómo se haría y cómo se pagaría;
# parcial = explica cómo se haría pero no el coste o de dónde sale el dinero; no = solo dice el objetivo.
# Genera ../posturas.json  (python3 posturas.py)
import json, datetime
F = {
 "EDB23": ("Programa de 2023 (comparador de El Debate)", "https://www.eldebate.com/espana/20230714/23j-elecciones-generales-comparador-programas-electorales_128018.html", "2023-07-14"),
 "CAT23": ("Programa de 2023 (3Cat)", "https://www.3cat.cat/3catinfo/que-diuen-els-partits-sobre-economia-habitatge-impostos-i-pensions-en-joc-el-23j/noticia-amp/3241066/", "2023-07-10"),
 "TO23": ("Programa de 2023 (The Objective)", "https://theobjective.com/espana/politica/2023-07-07/programas-pp-psoe-sumar-vox/", "2023-07-07"),
 "FORBES": ("Forbes España", "https://forbes.es/actualidad/1036705/elecciones-2026-batallas-economicas-29-n/", "2026-10-05"),
 "INFOBAE": ("Infobae", "https://www.infobae.com/espana/2026/10/11/las-cuatro-claves-que-marcaran-las-elecciones-generales-del-29-n-la-crisis-de-vivienda-que-tumbo-a-sanchez-el-pulso-por-la-migracion-la-corrupcion-y-los-salarios/", "2026-10-11"),
 "EURONEWS": ("Euronews: acto de Sánchez en Dos Hermanas", "https://es.euronews.com/2026/10/10/sanchez-abre-la-campana-electoral-del-29n-en-su-ciudad-talisman-con-la-vivienda-como-eje-p", "2026-10-10"),
 "PENS_PSOE": ("Moncloa.com: Sánchez desde Bruselas", "https://www.moncloa.com/2026/10/15/sanchez-pensiones-vox-revalorizacion-3448919", "2026-10-15"),
 "QUE": ("Que.es: acto de Vox en Estepona", "https://www.que.es/2026/10/12/precampana-vox-29n-abascal/", "2026-10-12"),
 "PP_INMIG": ("Plan de inmigración del PP (The Objective)", "https://theobjective.com/espana/politica/2025-09-29/plan-migratorio-feijoo/", "2025-09-29"),
 "PP_SANIDAD": ("Diari de Tarragona", "https://www.diaridetarragona.com/espana/253429/feijoo-promete-medicos-plan-financiar-actualizar-sanidad.html", "2026-02-28"),
 "PP_INFRA": ("Europa Press en Menorca.info", "https://www.menorca.info/actualidad/nacional/2026/07/22/2675179/feijoo-promete-rebajar-impuestos-jovenes-compren-vivienda-movilizar-300000-millones-infraestructuras.html", "2026-07-22"),
 "PP_PENS": ("El Independiente", "https://www.elindependiente.com/espana/2025/11/07/el-pp-propone-una-ley-para-garantizar-la-revalorizacion-de-las-pensiones-aunque-no-haya-presupuestos-y-el-gobierno-responde-que-ya-existe/amp/", "2025-11-07"),
 "PP_LIMPIEZA": ("Moncloa.com: Plan de Limpieza Institucional del PP", "https://www.moncloa.com/2026/07/18/plan-limpieza-institucional-pp-feijoo-3401671/", "2026-07-18"),
 "POD_VIV": ("Idealista: moción de Podemos en el Congreso", "https://www.idealista.com/news/finanzas/economia/2026/09/14/913884-podemos-lleva-esta-semana-al-congreso-su-para-crear-bajar-los-alquileres-y-expropiar", "2026-09-14"),
 "VOT": ("Votaciones del Congreso (más abajo en esta guía)", None, None),
}
def P(texto, fuente, como, nota=""): return {"t": texto, "f": fuente, "como": como, "nota": nota}
SIN = []
D = {
 "psoe": {
  "vivienda": [P("Préstamos públicos sin intereses de hasta 50.000 € para pagar la entrada de la primera vivienda (10.000 millones en total), deducción del alquiler en la declaración de la renta, prórroga de hasta 2 años para inquilinos al corriente de pago con límite a las subidas, y que los pisos turísticos tributen como un negocio.", "EURONEWS", "parcial", "Explica cómo funcionan los préstamos, pero no de dónde sale el dinero ni cuánto cuestan las rebajas fiscales."),
               P("Plan Estatal de Vivienda 2026-2030 con 7.000 millones y una empresa estatal de vivienda; que el parque público pase del 6 % de las viviendas.", "FORBES", "si", "Dice la cifra y quién paga: 60 % el Estado y 40 % las comunidades.")],
  "economia": [P("Reindustrialización y transición energética, y que los autónomos coticen según lo que ganan de verdad.", "FORBES", "no", "Sin medidas concretas sobre precios ni cifras."),
               P("Mantener los impuestos temporales a la banca y a las energéticas.", "EDB23", "no")],
  "inmigracion": [P("Regularizar a los extranjeros que ya viven y trabajan en España.", "INFOBAE", "no", "No dice a cuántas personas ni con qué requisitos."),
                  P("Más plazas en el sistema de acogida y plan contra el racismo.", "EDB23", "no")],
  "empleo": [P("Bajar la jornada máxima a 36 horas semanales antes de 2030, salario mínimo en el 60 % del salario medio y un Estatuto del Becario.", "FORBES", "parcial", "Dice el objetivo y el plazo, pero no cómo se aplicaría en cada sector ni qué pasaría con las pequeñas empresas.")],
  "sanidad": [P("Tiempos máximos de espera fijados por ley, Agencia Estatal de Salud Pública e historia clínica digital común.", "EDB23", "no", "No dice cuánto dinero ni de dónde. La Agencia de Salud Pública se votó en marzo de 2025 y el Congreso la rechazó.")],
  "pensiones": [P("Subir las pensiones con la inflación (IPC) por decreto antes de que acabe 2026.", "PENS_PSOE", "parcial", "Explica cómo (un decreto), pero no el coste. Recuerda que el fondo de reserva tendrá 20.000 millones."),
                P("Que la subida con el IPC esté garantizada siempre y sin tope.", "CAT23", "no")],
  "impuestos": [P("Que pague más quien más tiene y más lucha contra el fraude.", "FORBES", "no", "Sin medidas concretas ni cifras."),
                P("Más deducciones en la renta por hijos y por personas dependientes a cargo.", "CAT23", "no")],
  "educacion": [P("Escolarización universal de 0 a 18 años, libros de texto gratis y matrícula gratis en la universidad y la FP para quien apruebe a la primera.", "EDB23", "no", "No dice el coste.")],
  "territorial": [P("Perdonar parte de la deuda que las comunidades autónomas tienen con el Estado y aprobar un nuevo sistema de financiación autonómica.", "VOT", "parcial", "La condonación está escrita en un proyecto de ley que llegó al Congreso en 2026. El nuevo sistema de financiación no está concretado.")],
  "energia": [P("Más renovables y electrificación; ley de zonas aptas para renovables y proteger el 30 % de la tierra y el mar en 2030.", "EDB23", "no")],
  "justicia": [P("Registrar y regular a los lobbies (grupos de presión). Lo aprobó por decreto en agosto de 2026 y el Congreso lo anuló en septiembre.", "VOT", "parcial"),
               P("Plan de Justicia 2030 y ley del derecho de defensa (aprobada en 2024).", "EDB23", "no")],
 },
 "pp": {
  "vivienda": [P("Un millón de viviendas en cuatro años liberando suelo público; avales públicos del 95-100 % de la hipoteca para jóvenes; bajar hasta un 60 % los impuestos de la compra para jóvenes; derogar la ley de vivienda y una ley contra la okupación.", "INFOBAE", "parcial", "Dice los instrumentos, pero no cuánto cuestan, cuántos avales habría ni cómo se compensaría lo que se deja de recaudar.")],
  "economia": [P("IVA del 0 % en algunos alimentos básicos y del 10 % en la luz; movilizar hasta 300.000 millones en infraestructuras (carreteras, trenes, agua, energía).", "FORBES", "no", "No explica de dónde saldría el dinero de las infraestructuras («junto con los sectores implicados») ni el coste de bajar el IVA.")],
  "inmigracion": [P("Visado por puntos (como en Canadá o Australia), que un delito grave suponga perder el permiso de residencia, que los reincidentes no puedan quedarse, ligar el ingreso mínimo vital a buscar empleo y exigir integración para dar la nacionalidad.", "PP_INMIG", "parcial", "Dice las medidas, pero no cómo se puntuaría el visado ni los plazos.")],
  "empleo": [P("Premiar a las empresas con menos bajas laborales, que las mutuas puedan dar el alta en algunas enfermedades, cambiar el límite de horas extra, cuota cero para nuevos autónomos y un año sin cotizar por el primer trabajador contratado.", "INFOBAE", "no", "No da cifras ni coste. Para el salario mínimo no fija cifra.")],
  "sanidad": [P("Más plazas MIR para formar médicos, mejorar las guardias y quitar burocracia a los médicos.", "PP_SANIDAD", "no", "No dice cuántas plazas ni cuánto dinero.")],
  "pensiones": [P("Una ley para que las pensiones suban con el IPC aunque no haya presupuestos.", "PP_PENS", "parcial", "Dice el mecanismo, no el coste."),
                P("«Mochila austriaca»: un fondo que pagan empresa y trabajador y que este recupera al ser despedido o al jubilarse.", "CAT23", "no")],
  "impuestos": [P("Actualizar la renta con la inflación; duplicar lo que no tributa por hijos (de 2.400 a 4.800 € el primero y de 2.700 a 5.400 € el segundo); IVA 0 % en alimentos básicos; IVA de la luz al 10 %; sin IVA para autónomos que facturen menos de 85.000 € al año.", "FORBES", "parcial", "Las medidas están concretadas, pero no cuánto se dejaría de recaudar ni cómo se compensaría.")],
  "educacion": [P("Cambiar la ley educativa actual (LOMLOE), un examen de acceso a la universidad igual en toda España, más becas y libertad para elegir colegio.", "EDB23", "no")],
  "territorial": [P("Pidió devolver al Gobierno la ley que perdona parte de la deuda de las comunidades (julio de 2026). Volver a castigar la sedición y endurecer la malversación.", "VOT", "no", "No hemos encontrado una propuesta propia para el sistema de financiación autonómica.")],
  "energia": [P("Alargar la vida de las centrales nucleares, quitar el impuesto a la producción de electricidad y agilizar la conexión a la red.", "FORBES", "parcial", "Dice qué haría, no cuánto costaría.")],
  "justicia": [P("Plan de Limpieza Institucional: que los ministros no puedan ampararse en el Congreso para no declarar ante un juez, regular a los lobbies, prohibir indultar a condenados por corrupción y nombramientos públicos independientes.", "PP_LIMPIEZA", "no", "No detalla cómo se aplicaría cada medida.")],
 },
 "vox": {
  "vivienda": [P("Sin IVA en la compra de la primera vivienda, «prioridad nacional» (los españoles primero) en las ayudas, más suelo urbanizable y recuperar la desgravación por vivienda habitual.", "INFOBAE", "no", "No dice cuánto costaría ni cómo se aplicaría la prioridad nacional.")],
  "economia": [P("Bajar impuestos y el coste de la energía; quitar subvenciones a partidos, sindicatos y patronal y reducir la Administración.", "FORBES", "no")],
  "inmigracion": [P("«Remigración»: expulsar a quien entre de forma irregular, a los extranjeros que cometan delitos y a quienes vivan de ayudas; «prioridad nacional» para los españoles.", "QUE", "no", "No dice cómo se haría, a cuántas personas afectaría ni el coste.")],
  "empleo": [P("En contra de bajar la jornada por ley; bajar cotizaciones para que suban los sueldos netos; sin cuota de autónomo para quien gane menos que el salario mínimo.", "FORBES", "no")],
  "sanidad": [P("Que el Estado recupere las competencias de sanidad de las comunidades y más inversión en atención primaria.", "EDB23", "no")],
  "pensiones": [P("Rechaza privatizarlas y promete pagarlas «al precio que sea y como sea».", "QUE", "no", "No explica cómo se pagarían."),
                P("Un sistema mixto: parte como ahora y parte ahorrada en una cuenta individual de cada trabajador.", "INFOBAE", "no", "Las dos ideas se han publicado la misma semana; no detalla cómo encajan.")],
  "impuestos": [P("Impuesto de sociedades al 15 %, bajar la renta y el IVA; en 2023 proponía un 15 % de renta para sueldos de menos de 70.000 € y quitar los impuestos de sucesiones, donaciones y patrimonio.", "FORBES", "no", "No dice cuánto se dejaría de recaudar ni qué gasto se recortaría.")],
  "educacion": [P("Que el Estado recupere las competencias de educación, una ley educativa nacional nueva y un único examen de acceso a la universidad.", "EDB23", "no")],
  "territorial": [P("Recentralizar competencias (educación, sanidad) y volver a castigar como delito el referéndum ilegal y la sedición.", "EDB23", "no")],
  "energia": [P("Alargar las nucleares y construir otras nuevas; bajar impuestos a la energía; derogar la ley de cambio climático.", "FORBES", "no")],
  "justicia": [P("Cambiar cómo se elige a los miembros del CGPJ (el órgano que gobierna a los jueces), crear un único Alto Tribunal, derogar la ley de violencia de género y suprimir las fiscalías especiales.", "EDB23", "no")],
 },
 "fa": {
  "vivienda": [P("Más protección para inquilinos, prórrogas de contratos más largas y limitar la compra de vivienda para especular.", "FORBES", "no", "Presentará su programa el 17 de octubre."),
               P("Invertir el 1 % del PIB al año en vivienda pública de alquiler (2 millones de viviendas en 10 años), alquiler social obligatorio para grandes propietarios e impuesto al suelo sin usar.", "EDB23", "parcial", "Dice cuánto invertir, no de dónde sale el dinero.")],
  "economia": [P("Financiación pública para pymes, medidas contra los impagos y sin IVA para autónomos que facturen menos de 85.000 €.", "FORBES", "no")],
  "inmigracion": [P("Ley contra el racismo, reformar la ley de extranjería, cerrar los centros de internamiento (CIE) y sanidad para todos.", "EDB23", "no")],
  "empleo": [P("Trabajar menos horas y subir el salario mínimo.", "FORBES", "no", "Sin cifras ni calendario por ahora. En 2023 proponía la semana de 37,5 horas.")],
  "sanidad": [P("Más inversión en la sanidad pública, mejores condiciones para el personal y un plan de choque de salud mental.", "EDB23", "no")],
  "pensiones": [P("Que la subida con el IPC esté garantizada siempre y sin tope.", "CAT23", "no")],
  "impuestos": [P("Que paguen más las grandes herencias y los grandes patrimonios; en 2023, impuesto a las grandes fortunas y subir la renta a quien gane más de 120.000 € al año.", "FORBES", "parcial", "Dice a quién subiría impuestos, no cuánto recaudaría.")],
  "educacion": [P("Escuela infantil pública y gratis de 0 a 3 años y una nueva ley de FP.", "EDB23", "no")],
  "territorial": [P("España como «país de países»: más competencias y más financiación para las comunidades y diálogo con la Generalitat.", "EDB23", "no")],
  "energia": [P("Renovables y almacenamiento de energía, en contra de alargar algunas nucleares; en 2023, impuesto a los beneficios extraordinarios de las energéticas y tarifa social.", "FORBES", "no")],
  "justicia": [P("Crear una oficina para prevenir la corrupción (el Congreso la rechazó en septiembre de 2025) y renovar el CGPJ.", "VOT", "parcial")],
 },
 "podemos": {
  "vivienda": [P("Bajar un 40 % los alquileres por decreto y quitar a los grandes propietarios el uso de 650.000 viviendas para hacerlas públicas, igual que los pisos turísticos ilegales.", "POD_VIV", "parcial", "Dice el mecanismo (decreto y expropiación), pero no cuánto costaría ni cómo se compensaría a los dueños.")],
  "economia": [P("Una cadena pública de supermercados con alimentos básicos baratos y un tope al margen de beneficio de las grandes distribuidoras.", "POD_VIV", "no", "No dice cuánto costaría ni el límite del margen.")],
  "inmigracion": SIN, "sanidad": SIN, "pensiones": SIN, "territorial": SIN, "justicia": SIN,
  "empleo": [P("Semana de 35 horas y salario mínimo de 1.800 € al mes.", "FORBES", "no", "No dice en cuánto tiempo ni cómo afectaría a las pequeñas empresas.")],
  "impuestos": [P("Que paguen más las grandes empresas y los grandes patrimonios, y gravar los beneficios extraordinarios.", "FORBES", "no")],
  "educacion": [P("Libros y material escolar gratis para todo el alumnado.", "POD_VIV", "no")],
  "energia": [P("Una empresa pública de energía y acelerar las renovables.", "FORBES", "no")],
 },
}
PARTIDOS = [
 {"id": "psoe", "nombre": "PSOE"}, {"id": "pp", "nombre": "PP", "nota": "Se presenta en coalición con UPN en Navarra."},
 {"id": "vox", "nombre": "Vox"},
 {"id": "fa", "nombre": "Frente Amplio", "nota": "Coalición de Sumar, IU, Comuns y Más Madrid. Sus propuestas de 2023 son del programa de Sumar."},
 {"id": "podemos", "nombre": "Podemos", "nota": "En 2023 fue dentro de Sumar. En Cataluña irá con ERC."},
]
out = {"actualizado": datetime.date.today().isoformat(),
 "criterio": "Mientras los partidos no publiquen sus programas para el 29N, recogemos lo que cada uno ha propuesto en público: documentos del partido, declaraciones recogidas por la prensa y su programa de 2023. Siempre con fuente y fecha. No valoramos las propuestas: solo indicamos si el partido explica cómo lo haría y cómo lo pagaría.",
 "fuentes": {k: {"nombre": v[0], "url": v[1], "fecha": v[2]} for k, v in F.items()},
 "partidos": PARTIDOS, "temas": {}}
TEMAS = ["vivienda","economia","inmigracion","empleo","sanidad","pensiones","impuestos","educacion","territorial","energia","justicia"]
for t in TEMAS: out["temas"][t] = {p["id"]: D[p["id"]].get(t, []) for p in PARTIDOS}
for p in D: 
  for t, l in D[p].items():
    for x in l: assert x["f"] in F, x["f"]
json.dump(out, open("../posturas.json", "w"), ensure_ascii=False, indent=1)
print("ok", sum(len(l) for p in D.values() for l in p.values()))
