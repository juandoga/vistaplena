# Vista Plena — qué se votó, explicado sin tecnicismos.
# Cada votación destacada de la guía 29N lleva un título sencillo, quién la propuso y qué suponía votar Sí.
# Escrito a mano a partir del título oficial; si algo no está claro en el título oficial, no se añade.
# Genera llano.sql (python3 llano.py > llano.sql) para cargarlo en la tabla votaciones.

TOMA = "Sí: empezar a tramitar la propuesta. Todavía no es ley: después hay que debatirla y votarla de nuevo."
DECRETO = "Sí: el decreto del Gobierno sigue en vigor. No: queda anulado."
LEY = "Sí: aprobar la ley."
def dev(quien): return f"Sí: devolver la ley al Gobierno y frenarla (lo pedía{'n' if ' y ' in quien else ''} {quien}). No: que siga adelante."
def alt(quien): return f"Sí: cambiar el texto por otro redactado por {quien}. No: seguir con el texto original."

# id: (titulo_llano, propone, si_significa | None = el de su tipo, aprobada | None = sí > no, nota | None)
V = {
 "2026-09-30-010": ("Ley contra la violencia vicaria (el daño a los hijos para hacer sufrir a la madre)", "Gobierno", dev("Vox"), None, None),
 "2026-09-29-001": ("Cambiar el curso de formación que tienen que superar los futuros jueces", "PP", None, None, None),
 "2026-09-23-010": ("Rebajas de impuestos para reconstruir La Palma tras el volcán, y permiso a las comunidades con superávit para invertir ese dinero", "Gobierno", None, None, None),
 "2026-09-22-002": ("Poder jubilarse sin que se recorte la pensión («jubilación sin penalización»)", "Grupo Mixto", None, None, None),
 "2026-09-22-001": ("Cambiar los juicios de familia en los que hay menores (separaciones, custodias)", "PNV", None, None, None),
 "2026-09-16-016": ("Normas y registro para los lobbies (grupos de presión) que tratan con el Gobierno", "Gobierno", None, None, None),
 "2026-09-15-002": ("Reformar la Ley de Vivienda de 2023", "Sumar", None, None, None),
 "2026-09-10-016": ("Reconocer a biólogos y trabajadores sociales como profesiones sanitarias", "PSOE", None, None, None),
 "2026-09-10-015": ("Cambiar cómo se elige a los miembros del CGPJ, el órgano que gobierna a los jueces", "PP", None, None, None),
 "2026-09-09-001": ("Protección laboral y ayudas sociales para los afectados por los incendios forestales", "Gobierno", None, None, None),
 "2026-07-23-019": ("Perdonar parte de la deuda que las comunidades autónomas tienen con el Estado", "Gobierno", dev("PP y Vox"), None, None),
 "2026-07-23-008": ("Jubilación parcial anticipada para el personal laboral de las administraciones y plus de insularidad en Baleares", "Gobierno", None, None, None),
 "2026-07-23-006": ("Medidas para amortiguar los efectos económicos de la crisis de Oriente Medio", "Gobierno", None, None, None),
 "2026-07-14-054": ("Más derechos para las personas con discapacidad: inclusión, autonomía y accesibilidad", "Gobierno", LEY, None, None),
 "2026-07-14-052": ("Reforzar el sistema de dependencia (ayudas a quienes no pueden valerse por sí mismos)", "Gobierno", None, None, None),
 "2026-06-18-021": ("Reforma educativa que mejora las condiciones de trabajo de los profesores, entre otros cambios", "Gobierno", dev("Junts y PNV"), None, None),
 "2026-06-16-001": ("Fijar cómo se elige a los candidatos españoles a jueces de los tribunales europeos", "PP", None, None, None),
 "2026-06-11-040": ("Que los profesionales de las mutualidades (abogados, arquitectos…) puedan pasarse a la Seguridad Social", "PSOE", LEY, None, None),
 "2026-05-28-012": ("Cambiar lo que pagan los pacientes por los medicamentos (copago farmacéutico)", "Gobierno", None, None, None),
 "2026-05-26-001": ("Promover que se coman y beban productos más saludables", "Sumar", None, None, None),
 "2026-05-20-012": ("Rebajas de impuestos y ayudas para los afectados por la DANA y otras emergencias", "Gobierno", None, None, None),
 "2026-05-19-001": ("Ley contra la okupación ilegal de viviendas y para la convivencia en las comunidades de vecinos", "PP", None, None, None),
 "2026-04-28-003": ("Medidas sobre el alquiler para paliar los efectos económicos de la guerra de Irán", "Gobierno", None, None, None),
 "2026-04-28-002": ("Proteger a los menores que están bajo la tutela de la Administración por desamparo", "Vox", None, None, None),
 "2026-04-21-001": ("Dar seguridad jurídica a los planes urbanísticos para que se construya más vivienda", "PP", None, None, None),
 "2026-03-18-005": ("Ayudas por los daños de los temporales en Andalucía y Extremadura", "Gobierno", None, None, None),
 "2026-02-26-023": ("Subir las pensiones este año y otras medidas de Seguridad Social", "Gobierno", None, None, None),
 "2026-02-26-022": ("Ayudas para personas vulnerables (escudo social) y medidas de impuestos y de financiación de las comunidades", "Gobierno", None, None, None),
 "2026-02-24-001": ("Proteger a los trabajadores cuando su empresa se traslada a otro país o se vende", "Sumar", None, None, None),
 "2026-01-27-001": ("Prórroga de las ayudas a personas vulnerables (escudo social) y medidas de impuestos y de Seguridad Social", "Gobierno", None, None, None),
 "2025-12-11-025": ("Más derechos para las personas con discapacidad: inclusión, autonomía y accesibilidad", "Gobierno", dev("Junts"), None, None),
 "2025-12-11-014": ("Más margen de inversión para ayuntamientos y comunidades, y cambios en las exigencias a los programas de facturación de empresas y autónomos", "Gobierno", None, None, None),
 "2025-11-27-002": ("Reformar la Ley de Vivienda de 2023", "Sumar", None, None, None),
 "2025-11-27-001": ("Regular la prueba del talón a los recién nacidos en toda la sanidad pública", "PSOE", None, None, None),
 "2025-11-19-006": ("Reforzar la dependencia y cumplir la ley ELA (ayudas a personas con ELA y otras enfermedades graves)", "Gobierno", None, None, None),
 "2025-11-11-002": ("Impuestos para frenar la especulación con la vivienda", "ERC", None, None, None),
 "2025-10-28-001": ("Reformar la ley que regula a los fiscales (Estatuto del Ministerio Fiscal)", "PP", None, None, None),
 "2025-10-16-019": ("Regular los lobbies en el Congreso y sancionar a los diputados que incumplan las normas", None, alt("Vox"), None, None),
 "2025-10-16-018": ("Cambios en varias leyes de impuestos: plazos para reclamar, cobro, IRPF, Patrimonio y Sucesiones", "Gobierno", dev("Vox"), None, None),
 "2025-10-14-001": ("Bajar la jornada laboral máxima a 35 horas semanales", "Grupo Mixto", None, None, None),
 "2025-09-23-001": ("Ceder a Cataluña competencias del Estado sobre inmigración", "PSOE y Junts", None, None, None),
 "2025-09-16-002": ("Crear una oficina para prevenir la corrupción", "Sumar", None, None, None),
 "2025-09-16-001": ("Limitar que los inmigrantes en situación irregular puedan regularizarse por arraigo (por llevar tiempo viviendo aquí)", "Vox", None, None, None),
 "2025-09-10-010": ("Bajar la jornada laboral máxima a 37,5 horas, con registro de horas y derecho a desconectar", "Gobierno", dev("PP, Vox y Junts"), None, None),
 "2025-09-09-003": ("Ampliar el permiso por nacimiento y cuidado de un hijo", "Gobierno", None, None, None),
 "2025-09-09-002": ("Más empleo para personas con discapacidad: los puestos que las empresas deben reservarles", "PSOE", None, None, None),
 "2025-09-09-001": ("Cómo se escolariza a los alumnos con necesidades educativas especiales", "PP", None, None, None),
 "2025-07-22-017": ("Reforzar el sistema eléctrico tras el apagón (el llamado decreto antiapagones)", "Gobierno", None, None, None),
 "2025-06-19-009": ("Que los profesionales de las mutualidades (abogados, arquitectos…) puedan pasarse a la Seguridad Social", "PSOE", alt("Vox"), None, None),
 "2025-06-17-002": ("Castigar como delito el transporte y almacenaje de combustible para lanchas del narcotráfico", "Vox", None, None, None),
 "2025-06-17-001": ("Mantener la energía nuclear para reducir las emisiones", "PP", None, None, None),
 "2025-06-12-018": ("Ampliar las plantillas de jueces y fiscales y cambiar cómo se accede a la carrera", "Gobierno", dev("PP y Vox"), None, None),
 "2025-05-13-002": ("Reforzar la independencia del CIS, el instituto público de encuestas", "PP", None, None, None),
 "2025-05-06-001": ("Que los profesionales de las mutualidades (abogados, arquitectos…) puedan pasarse a la Seguridad Social", "PSOE", None, None, None),
 "2025-04-10-015": ("Repartir entre comunidades a los menores migrantes que llegan solos cuando una región está desbordada", "Gobierno", None, None, None),
 "2025-04-10-013": ("Ayudas para comprar coches eléctricos e instalar cargadores (Plan MOVES III) en 2025", "Gobierno", None, None, None),
 "2025-04-08-001": ("Gafas, lentillas y otros productos para la vista gratis en la sanidad pública", "Parlamento de Andalucía", None, None, None),
 "2025-03-25-002": ("Juzgados de violencia sobre la mujer: cómo funcionan y que sus jueces estén especializados", "PP", None, None, None),
 "2025-03-25-001": ("Normas y registro para los lobbies (grupos de presión) que tratan con el Gobierno", "Gobierno", dev("Vox"), None, None),
 "2025-03-20-019": ("Crear la Agencia Estatal de Salud Pública", "Gobierno", LEY, None, None),
 "2025-03-18-001": ("Medidas urgentes contra la okupación ilegal de viviendas", "Junts", None, None, None),
 "2025-03-11-002": ("Recuperar la rebaja de cotizaciones para las empresas de Ceuta y Melilla", "PP", None, None, None),
 "2025-02-18-002": ("Cambiar las reglas del padrón municipal en casos de okupación y de inmigración irregular", "Vox", None, None, None),
 "2025-02-18-001": ("Canarias: reglas para las ventajas fiscales de las inversiones en viviendas de alquiler", "PSOE y Grupo Mixto", None, None, None),
 "2025-02-12-012": ("Subida de las pensiones, ayudas al transporte y a personas vulnerables (tras tumbarse el decreto anterior)", "Gobierno", None, None, None),
 "2025-02-11-002": ("Medidas contra las agresiones a sanitarios", "PP", None, None, None),
 "2025-01-22-003": ("Poder cobrar la pensión de jubilación y seguir trabajando", "Gobierno", None, None, None),
 "2025-01-22-002": ("Mantener en 2025 el impuesto especial a las empresas energéticas", "Gobierno", None, None, None),
 "2025-01-22-001": ("Subida de las pensiones, ayudas al transporte, escudo social y medidas de impuestos, todo en un mismo decreto", "Gobierno", None, None, None),
 "2024-12-17-001": ("Regular los alquileres de temporada y de habitaciones", "Sumar, ERC, EH Bildu y Grupo Mixto", None, None, None),
 "2024-12-10-001": ("Fijar un número máximo de pacientes por enfermera", "Iniciativa legislativa popular (firmas de ciudadanos)", None, None, None),
 "2024-11-26-003": ("Que la tarjeta sanitaria y la historia clínica funcionen igual en toda España", "Vox", None, None, None),
 "2024-11-21-063": ("Crear una autoridad pública que resuelva las reclamaciones de los clientes contra bancos y aseguradoras", "Gobierno", dev("PP"), None, None),
 "2024-11-21-062": ("Nuevos impuestos: mínimo del 15 % a las grandes empresas, impuesto a la banca y a los líquidos de cigarrillos electrónicos", "Gobierno", LEY, None, None),
 "2024-11-19-001": ("Que las facturas de luz y gas expliquen cómo reclamar sin ir a juicio", "PSOE", None, None, None),
 "2024-11-14-040": ("Ley para agilizar la justicia: intentar un acuerdo antes de ir a juicio y nuevos tribunales de instancia", "Gobierno", LEY, None, None),
 "2024-10-22-003": ("Que una incapacidad permanente no suponga el despido automático del trabajador", "Gobierno", dev("Vox"), None, None),
 "2024-10-22-002": ("Poner reglas a un tipo de cláusula de préstamos e hipotecas («Redito Ad Libitum»)", "Sumar", None, None, None),
 "2024-10-22-001": ("Fijar por ley cómo se decide enviar ayuda militar a otros países", "PP", None, None, None),
 "2024-10-08-001": ("Que las personas dependientes paguen menos por los servicios que reciben", None, None, None, None),
 "2024-09-24-001": ("Reformar la ley del CNI (los servicios secretos) y su control por los jueces", "PNV", None, None, None),
 "2024-09-18-002": ("Compartir los antecedentes penales con el resto de países de la UE", "Gobierno", LEY, None, None),
 "2024-09-17-001": ("Regular los alquileres de temporada y de habitaciones", "Sumar", None, None, None),
 "2024-09-10-002": ("Que los menores extranjeros que salen de un centro de internamiento por delitos no cobren el subsidio para excarcelados", "Vox", None, None, None),
 "2024-07-23-075": ("Prórroga de las medidas por las guerras de Ucrania y Oriente Próximo: impuestos, energía y ayudas sociales", "Gobierno", None, None, None),
 "2024-07-23-065": ("Reforma pactada por PSOE y PP para renovar el CGPJ, el órgano que gobierna a los jueces", "PSOE y PP", LEY, None, None),
 "2024-07-23-063": ("Repartir entre comunidades a los menores migrantes que llegan solos", "PSOE, Sumar y Grupo Mixto", None, None, None),
 "2024-07-11-013": ("Reforma pactada por PSOE y PP para renovar el CGPJ, el órgano que gobierna a los jueces", "PSOE y PP", alt("Vox"), None, None),
 "2024-07-11-012": ("Reforma pactada por PSOE y PP para renovar el CGPJ, el órgano que gobierna a los jueces", "PSOE y PP", alt("Podemos"), None, None),
 "2024-07-11-011": ("Ley para agilizar la justicia: intentar un acuerdo antes de ir a juicio y nuevos tribunales de instancia", "Gobierno", dev("PP"), None, None),
 "2024-07-04-001": ("Reforma pactada por PSOE y PP para renovar el CGPJ, el órgano que gobierna a los jueces", "PSOE y PP", None, None, None),
 "2024-06-25-001": ("Que la Audiencia Nacional juzgue el narcotráfico, el blanqueo y la trata cuando los cometen organizaciones criminales", "PP", None, None, None),
 "2024-06-20-019": ("Reforma del subsidio por desempleo (el paro para quien ya no cobra la prestación)", "Gobierno", None, None, None),
 "2024-06-13-024": ("Prorrogar la suspensión de desahucios de familias vulnerables", "Gobierno", None, None, None),
 "2024-06-13-021": ("Regularización extraordinaria de inmigrantes en situación irregular", "Iniciativa legislativa popular (firmas de ciudadanos)", alt("Vox"), None, None),
 "2024-04-09-001": ("Regularización extraordinaria de inmigrantes en situación irregular", "Iniciativa legislativa popular (firmas de ciudadanos)", None, None, None),
 "2024-03-12-001": ("Cambiar la organización y el número de juzgados", "Asamblea de Madrid", None, None, None),
 "2024-02-27-002": ("Cambiar cómo se elige a los miembros del CGPJ, el órgano que gobierna a los jueces", "Vox", None, None, None),
 "2024-02-20-002": ("Recuperar la justicia universal: juzgar en España crímenes contra los derechos humanos cometidos fuera", "Sumar", None, None, None),
 "2024-01-30-009": ("Amnistía para los implicados en el procés independentista de Cataluña", "PSOE", "Sí: aprobar el texto de la ley.", None,
                    "Ese día se aprobó el texto, pero la ley no salió adelante en la votación final (Junts votó en contra) y volvió a la comisión. Se aprobó definitivamente el 14 de marzo de 2024."),
 "2024-01-10-007": ("Amnistía para los implicados en el procés independentista de Cataluña", "PSOE", alt("Vox"), None, None),
 "2024-01-10-004": ("Medidas por las guerras de Ucrania y Oriente Próximo y contra la sequía", "Gobierno", None, True,
                    "La primera votación terminó en empate; al repetirla, el decreto salió adelante."),
 "2024-01-10-003": ("Reforma del subsidio por desempleo (el paro para quien ya no cobra la prestación)", "Gobierno", None, None, None),
 "2024-01-10-001": ("Medidas para gastar los fondos europeos de recuperación en justicia, administración y ayuntamientos", "Gobierno", None, None, None),
}

# Votaciones de trámite o repetidas (la misma ley votada por partes o la petición de votarla en el Pleno)
OCULTAS = ["2024-02-29-019", "2024-11-21-064", "2024-11-14-038", "2024-11-14-039", "2024-09-18-001", "2024-07-23-064"]
# Temas corregidos a mano: {} = no encaja en ningún tema de la guía
TEMAS = {
 "2026-09-30-010": "{justicia}", "2025-06-17-002": "{justicia}", "2025-05-13-002": "{}",
 "2024-10-22-001": "{}", "2026-04-28-002": "{}",
}

def q(s): return "null" if s is None else "'" + s.replace("'", "''") + "'"
TIPOS_DEF = {"toma": TOMA, "decreto": DECRETO, "ley": LEY}
print("-- Generado por llano.py")
print("update votaciones set titulo_llano=null, propone=null, si_significa=null, aprobada=null, nota=null, oculta=false;")
filas = ",\n".join(f"('{i}',{q(t)},{q(p)},{q(si)},{'null' if ap is None else str(ap).lower()},{q(nota)})" for i, (t, p, si, ap, nota) in V.items())
print(f"update votaciones v set titulo_llano=x.t, propone=x.p, si_significa=x.s, aprobada=x.a, nota=x.n from (values\n{filas}\n) as x(id,t,p,s,a,n) where v.id=x.id;")
print(f"update votaciones set si_significa = case tipo when 'toma' then {q(TOMA)} when 'decreto' then {q(DECRETO)} else {q(LEY)} end where titulo_llano is not null and si_significa is null;")
print("update votaciones set oculta=true where id in (" + ",".join(f"'{i}'" for i in OCULTAS) + ");")
for i, t in TEMAS.items():
    print(f"update votaciones set temas_manual='{t}', temas='{t}' where id='{i}';")
