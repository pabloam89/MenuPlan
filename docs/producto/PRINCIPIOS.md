# Principios de producto

<!-- Generado desde ops/principios-producto/ con «npm run principios -- --escribir». No se edita a mano: ops/principios-producto.test.js lo compara. -->

Lo que hacen bien los mejores productos y chatbots, escrito como reglas con su fuente, para decidir, recomendar y diseñar HoMenu y Lola con una base y no con una impresión. Cada principio se cita por su id en la recomendación que manda; si dos chocan, se dice.

Cada uno es una regla con la plantilla de `scripts/lib/regla.mjs`, más su porqué, un ejemplo bueno y uno malo aplicados al producto, y sus fuentes: **[F]** la fuente lo dice, **[S]** es inferencia nuestra o la fuente es secundaria. El control es el fichero que lo vigila de verdad, o el juicio de una persona. Para añadir uno nuevo, un fichero en `ops/principios-producto/principios/` y la skill `principios-de-producto`.

## Cifras

| Área | Principios | Con control de verdad |
|---|---|---|
| confianza y seguridad (`trust-safety`) | 11 | 3 |
| privacidad (`privacy`) | 6 | 0 |
| IA conversacional (`conversational-ai`) | 11 | 0 |
| primeros pasos (`onboarding`) | 2 | 0 |
| coste y fiabilidad (`cost-reliability`) | 5 | 1 |
| claridad de uso (`ux-clarity`) | 2 | 0 |
| accesibilidad (`accessibility`) | 1 | 0 |
| alcance (`scope`) | 2 | 0 |
| **Total** | **40** | **4** |

## Confianza y seguridad (`trust-safety`)

Que el producto no se pueda usar contra la familia ni contra el negocio.

- `abuse-of-business-flows-limited` — **Flujos de negocio limitados.** Cuando una función puede dañar al negocio si se usa en masa (crear cuentas, comentar, pedir menús), el producto DEBE limitarla por persona o por origen. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: El spam y el abuso automatizado son el riesgo típico de un flujo abierto, y cuestan dinero o reputación.
  - Bueno: «Los reportes y los comentarios tienen un máximo por hora y por persona o por IP».
  - Malo: «Un script puede crear cientos de reportes por minuto sin que nada lo frene».
  - Nota: Los públicos de ops/api-sin-credencial.json declaran su protección, por ejemplo un límite por IP; no hay un test que exija un límite en cada endpoint de escritura.
  - Fuentes: [F] https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows.
- `authenticate-machine-callers` — **Autenticar a las máquinas.** Cuando quien llama a un endpoint es una máquina (webhook, disparador de la base, cron), el producto DEBE autenticarla con una firma o un secreto compartido comparado en tiempo constante, y responder 401 sin detalle si falta. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Que no haya una persona detrás no quita la necesidad de credencial: sin ella, cualquiera puede hacerse pasar por el disparador.
  - Bueno: «El webhook de Telegram y el cron de recordatorios exigen su secreto y contestan 401 si falta».
  - Malo: «Hoy api/report-alert.js acepta la llamada del disparador de la base sin ninguna credencial (#596)».
  - Nota: Hoy lo cumplen TELEGRAM_WEBHOOK_SECRET en api/bot/telegram.js y BOT_CRON_SECRET en api/bot/recordatorios.js. OWASP respalda autenticar el acceso entre servicios y Stripe, firmar los webhooks; la comparación en tiempo constante es inferencia nuestra.
  - Fuentes: [F] https://api-security.owasp.org/editions/2023/en/0xa2-broken-authentication/; [F] https://docs.stripe.com/webhooks.
- `fail-closed-for-safety-filters` — **Filtro que falla cerrado.** Cuando un filtro de seguridad o de moderación no puede ejecutarse, el producto DEBE retener el contenido para revisión en vez de aprobarlo por defecto. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Si el filtro falla abierto, en la práctica no hay filtro: basta con agotarlo.
  - Bueno: «Objetivo para el filtro de comentarios: si no contesta, el comentario queda pendiente de revisión y no se publica».
  - Malo: «Hoy api/moderate.js falla abierto en varios caminos y ante la duda acepta (#597)».
  - Nota: Inferencia nuestra a partir de seguro de serie y de la degradación ante consumo sin límite; no es una cita literal de ninguna fuente.
  - Fuentes: [S] https://www.cisa.gov/securebydesign; [S] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/.
- `human-approval-high-impact` — **Confirmación humana en lo grave.** Cuando una acción es irreversible o sale fuera de la casa (borrar, escribir a terceros, comprar), el bot DEBE pedir confirmación explícita a la persona antes de ejecutarla y decirle las consecuencias. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: El modelo puede equivocarse o ser manipulado, y una acción que no se puede deshacer no admite el error.
  - Bueno: «Lola pregunta antes de borrar un menú ya cerrado o de enviar la lista a otra persona».
  - Malo: «Lola envía la lista de la compra a un contacto en cuanto lo menciona la conversación».
  - Nota: Hoy lo vigilan casos sueltos: deshacer no quita protección sin confirmarlo (api/_bot/deshacerSeguro.test.js) y borrar pide dos llaves (api/_bot/borrar.test.js). No hay un test de la clase entera. La fuente F es OWASP; Microsoft (G16) solo respalda decir las consecuencias.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm062025-excessive-agency/; [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/.
- `idempotent-writes` — **Escrituras repetibles.** Cuando una llamada del bot o de un webhook puede llegar dos veces, el bot DEBE poder repetirse sin escribir ni avisar dos veces. Se comprueba con: `api/_bot/idempotencia.test.js`.
  - Porqué: Las redes fallan y los avisos llegan dos veces; sin esto, un reintento duplica efectos.
  - Bueno: «Si Telegram reenvía el mismo mensaje, Lola lo atiende una sola vez».
  - Malo: «Un reintento del disparador manda dos correos por el mismo reporte».
  - Nota: idempotencia.test.js cubre las herramientas de escritura del bot, y solo existe con BOT_TAREAS_V2 encendido; api/_bot/entradas.test.js cubre el mismo update_id de Telegram. Los endpoints con disparador de la base, como el aviso de reportes, no tienen test propio.
  - Fuentes: [F] https://docs.stripe.com/api/idempotent_requests.
- `least-privilege-for-the-model` — **Mínimo privilegio para el modelo.** Cuando el modelo puede ejecutar herramientas, el bot DEBE darle solo las herramientas y los permisos mínimos, y dejar que la base, no el prompt, decida qué está autorizado. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Una alucinación o una inyección convierten cualquier permiso de más en daño real.
  - Bueno: «Lola lee y escribe solo con la identidad de la familia que habla y es la base quien niega lo ajeno».
  - Malo: «Lola usa una clave de administrador y confía en que el prompt le diga que no toque otras casas».
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm062025-excessive-agency/; [F] https://www.anthropic.com/engineering/building-effective-agents.
- `model-output-validated` — **Salida del modelo validada.** Cuando la salida de un modelo alimenta código o la base de datos, el producto DEBE validarla con código contra un esquema cerrado antes de usarla. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Una salida sin validar es una entrada sin validar: llega a la base con la forma que el modelo quiera.
  - Bueno: «Una receta propuesta por el modelo no entra al catálogo sin pasar el esquema de recetas».
  - Malo: «El resultado del modelo se guarda tal cual en la ficha de la casa».
  - Nota: api/_bot/esquemas.test.js comprueba que los esquemas del enrutador casan con los vocabularios, no que toda salida de un modelo pase por uno.
  - Fuentes: [F] https://genai.owasp.org/llm-top-10/; [F] https://www.anthropic.com/engineering/writing-tools-for-agents.
- `no-secrets-in-prompts-or-client` — **Secretos fuera del prompt.** Cuando el producto tiene claves o reglas internas, el producto NO DEBE ponerlas en el prompt de un modelo ni en el código que llega al navegador. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Un prompt puede filtrarse y el código del cliente lo ve cualquiera.
  - Bueno: «El conocimiento de Lola no lleva claves; viven en variables de entorno del servidor».
  - Malo: «Una clave de servicio escrita en el texto que se manda al modelo para que la use».
  - Nota: El escáner de secretos de GitHub vigila las claves en el repo, pero no lee el prompt de Lola ni el paquete que llega al navegador.
  - Fuentes: [F] https://genai.owasp.org/llm-top-10/.
- `public-endpoint-justified` — **Endpoint público justificado.** Cuando un endpoint responde sin sesión, el producto DEBE tener escrito por qué es público y qué lo protege en lugar de la credencial, en un registro de endpoints con motivo. Se comprueba con: `api/sinCredencial.test.js`.
  - Porqué: Un endpoint sin identidad es un flujo de negocio abierto a cualquiera, y lo que no está inventariado no se protege ni se retira.
  - Bueno: «api/share-menu.js es público a propósito: uuid más token en la dirección, límite por IP, solo GET y HEAD, y consta con su motivo en el registro».
  - Malo: «Un endpoint que gasta IA contesta a cualquiera y su motivo para ser público es que lo llama alguien, sin comprobar quién».
  - Nota: El registro es ops/api-sin-credencial.json. El test exige que el resto rechace sin credencial y deja pasar como mucho 2 casos pendientes (pending_cases) mientras se deciden. No sabe si el motivo es cierto: eso es juicio. OWASP respalda el inventario (API9); exigir motivo y protección es inferencia nuestra.
  - Fuentes: [F] https://api-security.owasp.org/editions/2023/en/0xa9-improper-inventory-management/; [S] https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows.
- `secure-by-default` — **Seguro de serie.** Cuando se crea una tabla nueva, la base de datos DEBE negar su acceso a anon desde el primer momento, sin que nadie tenga que configurarlo. Se comprueba con: `supabase/anonPorDefecto.test.js`.
  - Porqué: Lo seguro de serie no depende de que alguien se acuerde de activarlo; lo inseguro debe costar un paso consciente.
  - Bueno: «Una tabla nueva de menús nace sin permisos para anon».
  - Malo: «Una tabla nueva queda legible para cualquiera hasta que alguien se acuerda de cerrarla».
  - Nota: El test cubre tablas y secuencias de public (las funciones no, lo dice la cabecera de la 0096). No comprueba la seguridad por filas ni lo creado por supabase_admin. Para el resto de funciones nuevas el principio de CISA se aplica por juicio.
  - Fuentes: [F] https://www.cisa.gov/securebydesign.
- `untrusted-text-is-data` — **El texto ajeno es dato.** Cuando un texto de una persona o de un tercero llega a un modelo, el producto DEBE tratarlo como dato delimitado y aparte de las instrucciones, y no como una orden. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Quien escribe el texto controla lo que el modelo lee, y el modelo no distingue por sí solo entre dato e instrucción.
  - Bueno: «Objetivo para el filtro de comentarios: meter el comentario entre delimitadores y aceptar solo ok o rechazar como respuesta».
  - Malo: «Hoy api/moderate.js pega el comentario en la instrucción sin delimitarlo (#597)».
  - Nota: La inyección de prompt no tiene prevención infalible; por eso va junto con la validación de la salida (model-output-validated).
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm01-prompt-injection/.

## Privacidad (`privacy`)

Qué datos se piden, para qué, cuánto se guardan y a quién se enseñan.

- `data-minimisation` — **Minimización de datos.** Cuando se pide o se guarda un dato personal, el producto DEBE limitarlo a lo necesario para un fin concreto. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Lo que no se guarda no se filtra ni se puede usar mal.
  - Bueno: «De una alergia se guarda el alérgeno, no el diagnóstico ni un texto libre».
  - Malo: «El formulario de la casa pide fecha de nacimiento completa solo para saber si es menor de edad».
  - Nota: La regla de CLAUDE.md «ningún campo sin lector» cubre la mitad, el dato que nadie usa; que un dato sea necesario para su fin es juicio.
  - Fuentes: [F] https://gdpr-info.eu/art-5-gdpr/; [F] https://gdpr-info.eu/art-25-gdpr/.
- `explain-data-use` — **Explicar el uso de datos.** Cuando personaliza una respuesta con datos de la familia, el bot DEBE decir qué datos usa, para que la persona pueda corregirlos o borrarlos. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Saber qué sabe el sistema de uno calibra la confianza y permite corregirlo.
  - Bueno: «Lola dice que ha evitado el cacahuete por la alergia que le contó la familia».
  - Malo: «Lola cambia el menú por motivos que la familia no sabe de dónde salen».
  - Fuentes: [F] https://pair.withgoogle.com/chapter/explainability-trust/.
- `no-sensitive-data-in-chat-by-default` — **Sin datos sensibles de más.** Cuando la conversación pasa por un canal de terceros (Telegram, WhatsApp), el bot NO DEBE pedir datos sensibles que no necesita para su tarea. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: En los estudios de NN/g los usuarios dudaban de dar datos sensibles a un bot, y el canal no es nuestro.
  - Bueno: «Lola pregunta si hay algún alimento que no toleren, no pide historial médico».
  - Malo: «Lola pide el informe del alergólogo por el chat».
  - Fuentes: [F] https://www.nngroup.com/articles/chatbots/; [F] https://gdpr-info.eu/art-25-gdpr/.
- `privacy-by-default` — **Privado por defecto.** Cuando una opción puede exponer datos de una familia, el producto DEBE venir con la opción más privada por defecto. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Los datos no deben quedar accesibles a otros sin que la persona intervenga.
  - Bueno: «Un menú o una receta de una familia nace privado y se comparte con un gesto explícito».
  - Malo: «Un menú nace con enlace público y la familia tiene que acordarse de cerrarlo».
  - Fuentes: [F] https://gdpr-info.eu/art-25-gdpr/.
- `purpose-limitation` — **Limitación de la finalidad.** Cuando un dato se recogió para un fin, el producto NO DEBE usarlo para otro fin incompatible. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Es la base de la confianza: la familia dio el dato para algo y espera que sea solo para eso.
  - Bueno: «Las alergias se usan para filtrar menús y nada más».
  - Malo: «Las alergias de una familia entran en un análisis de mercado o en el prompt de moderación».
  - Fuentes: [F] https://gdpr-info.eu/art-5-gdpr/.
- `storage-limitation` — **Limitación del plazo.** Cuando un dato personal deja de servir a su fin, el producto DEBE borrarlo o anonimizarlo. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Lo que se conserva de más es riesgo sin beneficio.
  - Bueno: «Los registros de conversación y los reportes resueltos caducan a los pocos meses».
  - Malo: «Se guardan indefinidamente los mensajes de una familia que borró su cuenta».
  - Nota: Hoy hay una purga programada de lo viejo del bot (migración 0065, bot-retencion); no hay un test que exija un plazo declarado en cada tabla con datos personales.
  - Fuentes: [F] https://gdpr-info.eu/art-5-gdpr/.

## IA conversacional (`conversational-ai`)

Cómo habla, decide y se equivoca un bot como Lola.

- `buttons-and-free-text` — **Botones y texto libre.** Cuando las opciones son pocas y conocidas, el bot DEBE ofrecer botones además del texto libre. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Los usuarios piden opciones ya preparadas y escriben menos.
  - Bueno: «Para elegir el día de la semana, Lola ofrece siete botones y deja escribirlo».
  - Malo: «Lola pide que se escriba el día exacto y no entiende abreviaturas».
  - Fuentes: [F] https://www.nngroup.com/articles/chatbots/.
- `calibrate-not-maximise-trust` — **Calibrar la confianza.** Cuando muestra una respuesta cuya fiabilidad no es pareja, el bot DEBE dejar claro qué es estimado y qué está confirmado, sin inducir confianza ciega. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Señalar el posible error baja la confianza en ese dato, pero evita la sobreconfianza después.
  - Bueno: «Lola marca como estimadas las calorías y no marca así un alérgeno confirmado».
  - Malo: «Lola da las calorías y los alérgenos con el mismo aplomo aunque unas sean aproximadas».
  - Fuentes: [F] https://pair.withgoogle.com/chapter/explainability-trust/.
- `easy-correction-and-undo` — **Corregir y deshacer fácil.** Cuando se equivoca o la persona cambia de idea, el bot DEBE dejar corregir o deshacer lo hecho con un solo gesto. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: El control y la libertad del usuario son una de las heurísticas básicas de usabilidad.
  - Bueno: «Tras cambiar un menú, un botón de deshacer lo devuelve a como estaba».
  - Malo: «Para corregir un cambio hay que pedirlo todo de nuevo».
  - Nota: Existe la herramienta deshacer con sus tests (api/_bot/deshacerFreno.test.js), pero ningún test exige que cada escritura del bot se pueda deshacer.
  - Fuentes: [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/; [F] https://www.nngroup.com/articles/ten-usability-heuristics/.
- `escalate-by-explicit-triggers` — **Escalado por disparadores escritos.** Cuando la conversación toca un riesgo alto (alergia grave, pagos, datos personales), el bot DEBE seguir un disparador escrito de escalado y pasar el contexto completo. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Un traspaso vago obliga a la persona a empezar de cero justo cuando más lo necesita.
  - Bueno: «Si el mensaje habla de anafilaxia, Lola no improvisa un menú y avisa de buscar atención médica».
  - Malo: «Lola contesta a una reacción alérgica grave proponiendo una receta sin alérgenos».
  - Fuentes: [F] https://www.intercom.com/learning-center/ai-human-collaboration-procedures-handoffs.
- `escape-hatch-when-lost` — **Salida cuando se pierde.** Cuando no entiende o falla varias veces seguidas, el bot DEBE admitirlo y ofrecer otra vía: botones, la app o una persona. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Los usuarios valoran que el bot admita que no entiende y penalizan la respuesta repetida, segura pero errónea.
  - Bueno: «Tras dos malentendidos, Lola ofrece los botones del menú y el enlace a la app».
  - Malo: «Lola repite la misma respuesta con otras palabras una y otra vez».
  - Fuentes: [F] https://www.nngroup.com/articles/chatbots/; [F] https://www.intercom.com/learning-center/ai-human-collaboration-procedures-handoffs; [F] https://pair.withgoogle.com/chapter/errors-failing/.
- `explain-why` — **Explicar el porqué.** Cuando toma una decisión que la persona no esperaba, el bot DEBE poder decir por qué en una frase. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Sin motivo, el error es opaco y la persona no puede corregirlo.
  - Bueno: «Lola dice que pone lentejas el martes porque el lunes ya hay pescado y la semana pide legumbre».
  - Malo: «Lola cambia el plato del martes sin decir nada».
  - Fuentes: [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/; [F] https://pair.withgoogle.com/chapter/explainability-trust/.
- `keep-context-no-reask` — **No repetir preguntas.** Cuando la persona ya dio un dato en la conversación o en su ficha, el bot NO DEBE volver a pedírselo. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: En los estudios de NN/g, los bots que repetían preguntas cansaban a la gente.
  - Bueno: «Lola usa los comensales que ya constan en la ficha de la casa».
  - Malo: «Lola vuelve a preguntar cuántos comen cada vez que se pide un menú».
  - Fuentes: [F] https://www.nngroup.com/articles/chatbots/; [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/.
- `no-pretend-human` — **No hacerse pasar por humano.** Cuando conversa con una persona, el bot NO DEBE hacerse pasar por humano ni exagerar lo que puede hacer. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Los personajes con aire humano hacen sobrestimar al sistema.
  - Bueno: «Lola tiene nombre y tono cálido, pero contesta con claridad a si es una persona».
  - Malo: «Lola dice que está cocinando mientras responde».
  - Nota: Hay un caso de evals que lo prueba con el modelo (limite-eres-una-persona en scripts/bot-evals.json); cuesta tokens, así que no corre en el CI.
  - Fuentes: [F] https://pair.withgoogle.com/chapter/mental-models/.
- `scope-when-in-doubt` — **Acotar ante la duda.** Cuando no está seguro de lo que se le pide, el bot DEBE preguntar o proponer lo más acotado antes de actuar a lo grande. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Un malentendido pequeño cuesta poco; uno grande, un menú entero estropeado.
  - Bueno: «Ante cambia el jueves sin más, Lola pregunta qué comida del jueves».
  - Malo: «Ante cambia el jueves, Lola rehace el menú de la semana entera».
  - Nota: api/_bot/politica.test.js fija que el enrutador solo usa la vía rápida a partir de un umbral de confianza por modo; eso cubre el enrutado, no que Lola pregunte.
  - Fuentes: [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/.
- `simple-first-agents` — **Lo simple primero.** Cuando se diseña la lógica del bot, el bot DEBE empezar por lo más simple y añadir un paso, una herramienta o un agente solo si mejora lo medido. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: La complejidad cuesta tokens, errores y mantenimiento, y rara vez se nota en la conversación.
  - Bueno: «Antes de crear un agente nuevo, se mejora la descripción de la herramienta y se miden las evals».
  - Malo: «Se añade un segundo agente porque parece más elegante, sin una cifra que lo justifique».
  - Fuentes: [F] https://www.anthropic.com/engineering/building-effective-agents; [F] https://www.anthropic.com/engineering/writing-tools-for-agents.
- `state-capabilities-and-limits` — **Capacidades y límites visibles.** Cuando una persona empieza a usarlo, el bot DEBE decirle qué sabe hacer, qué no sabe y con qué fiabilidad. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Con expectativas realistas la persona no se frustra ni se fía de lo que el bot no puede hacer.
  - Bueno: «El primer mensaje de Lola dice que arma el menú y la lista, y que no sustituye a un dietista».
  - Malo: «Lola se presenta como capaz de todo y la familia le pide consejo médico».
  - Nota: api/bot/bienvenida.test.js comprueba el saludo de alta en /start, no que cite los límites.
  - Fuentes: [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/; [F] https://pair.withgoogle.com/chapter/mental-models/.

## Primeros pasos (`onboarding`)

Cómo entra alguien nuevo y cuándo ve el valor.

- `onboard-in-stages` — **Presentarse por etapas.** Cuando se presentan las funciones a una persona nueva, el producto DEBE hacerlo por etapas cortas, cuando cada función es relevante y con acciones reversibles de poco riesgo. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Una lista larga al principio no se retiene.
  - Bueno: «El primer día, el menú; unos días después, la lista de la compra; luego la despensa».
  - Malo: «El primer mensaje enumera todas las funciones de Lola de golpe».
  - Fuentes: [F] https://pair.withgoogle.com/chapter/mental-models/.
- `value-before-signup` — **Valor antes del registro.** Cuando alguien llega por primera vez, el producto DEBE dejarle probar el valor antes de pedirle cuenta o datos. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Retrasar el registro subió la actividad en un caso conocido, según esa fuente.
  - Bueno: «Lola propone un menú de ejemplo antes de pedir alergias y tamaño de la familia».
  - Malo: «Lo primero que ve alguien nuevo es un formulario largo de la casa».
  - Nota: La fuente es secundaria: un blog que recoge lo dicho por un directivo de Duolingo, y su dirección da una cadena de redirecciones que no se pudo abrir. Va como inferencia; conviene medir la conversión propia.
  - Fuentes: [S] https://taplytics.com/blog/duolingo-ab-test-onboarding.

## Coste y fiabilidad (`cost-reliability`)

Cuánto cuesta cada uso, qué pasa cuando algo falla y cómo se sabe.

- `bounded-loops-and-timeouts` — **Bucles y tiempos acotados.** Cuando encadena pasos o herramientas en un turno, el bot DEBE limitar las vueltas, el tiempo y el tamaño de la entrada. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Los errores se acumulan en cada vuelta y el coste no tiene techo.
  - Bueno: «Lola corta a las pocas llamadas a herramientas y contesta con lo que ya tiene».
  - Malo: «Un turno puede encadenar llamadas sin fin si el modelo no se decide».
  - Nota: El turno tiene un máximo de vueltas (MAX_VUELTAS en api/_bot/turnos.js) y un tiempo máximo en Vercel; ningún test los nombra.
  - Fuentes: [F] https://www.anthropic.com/engineering/building-effective-agents; [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/.
- `caller-pays-quota` — **El cupo, a quien llama.** Cuando un endpoint gasta IA, el producto DEBE atribuir el gasto a quien llama y, si no se sabe quién es, darle un cupo pequeño y propio. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Sin identidad no se puede limitar por persona, y un cupo compartido deja que un anónimo agote el de todos.
  - Bueno: «Objetivo para un filtro sin sesión: un cupo global bajo y propio, que se corte antes que el de Lola».
  - Malo: «Hoy api/moderate.js contesta sin sesión y gasta el límite diario global compartido con el resto de la IA (#597)».
  - Nota: Limitar por fuente es de OWASP; separar el cupo de los anónimos del de Lola es inferencia nuestra.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/; [S] https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption.
- `graceful-degradation` — **Degradación elegante.** Cuando el modelo falla, tarda o se agota el cupo, el producto DEBE seguir ofreciendo lo esencial sin IA y decirlo en llano. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: El fallo debería ser seguro y aburrido, no un callejón sin salida.
  - Bueno: «Sin modelo, Lola enseña el menú ya guardado y los botones, y dice que hoy no puede pensar».
  - Malo: «Sin modelo, Lola se queda callada o responde con un error técnico».
  - Nota: api/_bot/planB.test.js cubre el paso al modelo de reserva cuando cae la conexión, no que exista un camino sin modelo.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/; [F] https://pair.withgoogle.com/chapter/errors-failing/; [F] https://pair.withgoogle.com/chapter/mental-models/.
- `hard-spend-cap` — **Límite de gasto en IA.** Cuando un endpoint de api/ llama a un modelo de pago, el producto DEBE pasar por un límite diario global que corte antes de gastar y falle cerrado si no puede contar. Se comprueba con: `api/_guard.test.js`.
  - Porqué: El abuso puede disparar la factura (denial of wallet) sin que nadie haya entrado en el sistema.
  - Bueno: «Generar un menú sin sesión corta en un límite diario global y falla cerrado si Redis cae».
  - Malo: «Un endpoint llama al modelo sin contar y una noche de peticiones vacía el crédito».
  - Nota: El test recorre api/ y exige que cada fichero con IA pase por el límite diario, por uno propio o figure en las excepciones. El gasto del bot por familia no lo cubre este test.
  - Fuentes: [F] https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption; [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/.
- `log-what-happens` — **Dejar rastro contable.** Cuando ocurre un fallo, un bloqueo o un gasto relevante, el producto DEBE dejar una línea estructurada que un script pueda contar, sin datos de la familia. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Lo que no se mide no mejora, y el registro sirve también para detectar un uso anómalo.
  - Bueno: «Cada vez que Lola degrada por falta de cupo deja una línea con motivo cupo_agotado».
  - Malo: «El fallo se traga con un catch vacío y nadie sabe cuántas veces ocurre».
  - Nota: Es la regla «Pensar en datos» de CLAUDE.md aplicada al producto.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/.

## Claridad de uso (`ux-clarity`)

Que se entienda qué pasa y cómo seguir.

- `recoverable-errors` — **Errores recuperables.** Cuando algo falla, el producto DEBE decir en llano qué pasó y cómo seguir, sin códigos crudos. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Un error claro convierte un fallo en continuidad.
  - Bueno: «No he podido guardar el menú; reinténtalo o míralo en la app».
  - Malo: «Error 500 al escribir en household_state».
  - Fuentes: [F] https://www.nngroup.com/articles/ten-usability-heuristics/; [F] https://pair.withgoogle.com/chapter/errors-failing/.
- `visibility-of-status` — **Estado visible.** Cuando una acción tarda o sigue en curso, el producto DEBE indicar su estado. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Sin estado, la persona repite la acción o abandona.
  - Bueno: «Lola avisa de que el menú tarda un poco antes de ponerse a generarlo».
  - Malo: «La pantalla se queda quieta mientras se genera el menú».
  - Nota: api/_bot/avisoLento.test.js cubre el aviso antes de generar un menú, no el resto de acciones lentas.
  - Fuentes: [F] https://www.nngroup.com/articles/ten-usability-heuristics/.

## Accesibilidad (`accessibility`)

Que lo pueda usar cualquier persona, con cualquier ayuda.

- `wcag-pour` — **Accesible para todos.** Cuando se diseña una pantalla, el producto DEBE poner texto alternativo a las imágenes, poder usar todo con teclado y cuidar el contraste del texto. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: WCAG es el estándar de accesibilidad y llega a más gente, incluida la que usa lector de pantalla.
  - Bueno: «Toda imagen de plato tiene su texto alternativo y los botones se alcanzan con el teclado».
  - Malo: «Un menú solo se puede abrir con el ratón y la foto del plato no tiene descripción».
  - Nota: WCAG organiza esto en perceptible, operable, comprensible y robusto. El criterio fino de la interfaz está en DESIGN_SYSTEM.md.
  - Fuentes: [F] https://www.w3.org/WAI/standards-guidelines/wcag/glance/.

## Alcance (`scope`)

Qué merece hacerse, cuánto y por qué canal.

- `fixed-appetite-variable-scope` — **Apetito fijo, alcance variable.** Cuando se decide hacer una mejora, toda decisión de producto DEBE fijar antes cuánto tiempo merece y recortar el alcance si no cabe, en vez de estirar el plazo. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Obliga a separar lo central de lo periférico antes de empezar.
  - Bueno: «El filtro de comentarios tiene una semana; si no cabe la IA, se empieza con una lista de palabras».
  - Malo: «El filtro de comentarios crece mes a mes sin que nadie haya dicho cuánto merece».
  - Fuentes: [F] https://basecamp.com/shapeup/1.2-chapter-03.
- `use-existing-channel-first` — **Aportar más que la app.** Cuando se propone un canal o un bot nuevo, toda decisión de producto DEBE comprobar que aporta algo que la app ya no da. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Porqué: Los bots que solo duplican la web o la app tienen una propuesta de valor débil.
  - Bueno: «Lola avisa por la mañana y habla con la familia, algo que la app no hace».
  - Malo: «Lola reproduce pantallas de la app dentro del chat sin añadir nada».
  - Nota: NN/g observa que muchos bots duplican la web; comprobar antes que el canal nuevo aporta algo es inferencia nuestra.
  - Fuentes: [S] https://www.nngroup.com/articles/chatbots/.
