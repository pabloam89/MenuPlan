# Plan — HoMenu en el chat (Telegram → WhatsApp)

Borrador del 29 sep 2026. Recoge las decisiones cerradas en las rondas de preguntas con Pablo y lo que el código actual obliga a resolver antes. Lo que se decidió y construyó después, hasta el 8 oct, está en la sección 15.

## 1. La idea en una frase

HoMenu pasa a vivir en el chat: la familia le escribe o le manda audios al bot para montar la casa, consultar y cambiar el menú, la compra y las recetas, y pedir recordatorios. La app sigue existiendo para lo que en un chat se hace mal (ver la semana entera, la pizarra, ajustes finos) y como plan B.

Principio que no se toca: **el modelo traduce y el solver decide los platos.** El modelo nunca elige recetas ni escribe datos sin pasar por una validación.

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Canales | Telegram para probar (Pablo y socios) → WhatsApp después |
| Alcance | Todo, en conversación libre: onboarding guiado, consultar/cambiar menú, recetas, ingredientes, lista de la compra, menú del cole, recordatorios, pendientes |
| Quién habla | Chat privado con cualquiera; se puede meter en cualquier grupo. En grupo solo contesta si le mencionan o responden a un mensaje suyo; en privado, a todo |
| Permisos en grupo | Los dos padres pueden hacerlo todo; el bot confirma cada cambio en el grupo diciendo quién lo pidió. Sin botón de deshacer (ver 15.5): si no gusta, se pide otra cosa |
| Alta | Por el chat o por la app, y luego se enlazan |
| Proactividad | Nunca escribe primero sin permiso. Sí puede *ofrecer* un recordatorio dentro de una conversación («¿te aviso el miércoles para descongelar?») |
| Voz | Entiende notas de voz; contesta en texto |
| Formato | Diseñado para el mínimo de WhatsApp (3 botones o lista de 10, negritas/viñetas/emojis, imágenes, un enlace). El menú se ve como texto rico + enlace a la app |
| Lista de la compra | Viva, con botones para tachar, compartida por la casa |
| Avatares | El bot los asigna solo por rol y edad; se cambian después en la app |
| Idioma | Contesta en el del usuario; recetas y datos, en castellano |
| Memoria | Guarda en la casa lo que cambia algo («no nos gusta la coliflor»); el texto de la charla se borra a los pocos días |
| Cerebro | Un agente con herramientas en Claude Sonnet 5 (sustituye los dos agentes del 18 sep) |
| Negocio | Gratis con límite (referencia: ~100 mensajes/mes gratis) |
| Legal | Nada en la prueba interna; revisión legal antes de abrir (alergias y menores son datos sensibles) |
| Dónde | En este repo: funciones en `api/`, misma Supabase, mismo solver |

## 3. Lo que el código actual obliga a resolver primero

Esto sale de leer `specs/`, `HOUSEHOLDS.md` y el código. Es lo que más condiciona el plan.

1. **La app es local-first.** El estado vive en `localStorage` (`menuplan.state.v1`) y, con sesión, se copia a la nube (`user_state`, `household_state`, `user_menus*`, `user_pantry`). En modo anónimo no hay nada en el servidor. **El bot solo puede trabajar con casas que estén en la nube**, y la nube tiene que pasar a ser la fuente de verdad para esas casas.
2. **Riesgo de pisadas app ↔ bot.** Si el bot cambia el martes y la app abierta en el móvil sube su copia local más tarde, el cambio del bot se pierde. Hay que definir una regla de fusión, como mínimo con versión o `updated_at` por documento y la app rehidratando al volver a primer plano. Hay además una doble persistencia conocida en la compra (`user_state` y `user_menu_weeks.shopping`, hallazgo #16 de `AUDIT-REPORT.md`) que el bot no puede heredar.
3. **Solo hay login con Google.** Un alta que empieza en el chat necesita crear la cuenta sin Google: usuario creado desde el servidor con la identidad de Telegram, y enlace posterior a Google cuando abra la app (enlace mágico con token de un solo uso).
4. **Los hogares tienen dueño y lectores.** Según `HOUSEHOLDS.md`, el invitado es solo lectura y «co-owners» quedó fuera de la V1. «Los dos pueden hacerlo todo» exige un rol de **co-editor** (RLS y RPC nuevos).
5. **Seguridad de hogares.** El hallazgo crítico #2 de `AUDIT-REPORT.md` (cualquiera autenticado podía meterse como viewer de un hogar ajeno) figuraba sin corregir. Hay que verificarlo contra la base viva antes de exponer hogares a un bot.
6. **El solver y la compra corren en el navegador.** `resolverMenu` (`src/lib/solver.js`) y `buildShoppingList` (`src/lib/shoppingBuilder.js`) son funciones puras y el solver ya se protege si no hay `localStorage`, así que deberían correr en una función de Vercel. Hay precedente de funciones que empaquetan el catálogo (`api/share-recipe.js` con `includeFiles`). Hay que extraerlos a un módulo compartido cliente/servidor y comprobar que dan el mismo menú en los dos lados. El bot usa **siempre el solver** (instantáneo), no la ruta por IA.
7. **Tiempos de las funciones.** Telegram reintenta si el webhook no contesta rápido, y un turno del agente con varias herramientas puede tardar varios segundos. El webhook tiene que confirmar al momento y procesar en segundo plano. Hay que comprobar el plan de Vercel y sus límites (la spec de auth menciona Hobby con 10 s).

## 4. Arquitectura

```
Telegram / WhatsApp
      │  webhook
      ▼
api/bot/telegram.js · api/bot/whatsapp.js      ← adaptadores de canal: verifican firma, confirman al momento
      │  mensaje canónico {canal, chat, autor, texto | audio | foto, respuesta_a}
      ▼
cola (Vercel Queues o waitUntil)               ← procesa fuera del tiempo del webhook
      ▼
normalizar: audio → transcripción · foto → se pasa tal cual al modelo
      ▼
agente (Sonnet 5 + herramientas)               ← contexto: resumen de la casa + últimos mensajes
      │  cada herramienta valida antes de escribir
      ▼
dominio compartido (src/lib, servidor)         ← solver, compra, recetas, aplicarParseo
      ▼
Supabase (fuente de verdad de la casa)
      ▼
formateador por canal                          ← mismo mensaje lógico → botones de Telegram o de WhatsApp
```

### Tablas nuevas (propuesta)

| Tabla | Para qué |
|---|---|
| `bot_identities` | canal + id externo (Telegram/WhatsApp) → `user_id` |
| `bot_chats` | chat (privado o grupo) → `household_id`, tipo, idioma |
| `bot_messages` | historial corto para contexto; se borra a los N días |
| `bot_reminders` | recordatorio aceptado: chat, texto, cuándo, estado |
| `bot_usage` | mensajes y tokens por casa y mes, para el límite gratis y para medir el coste real |
| `bot_link_tokens` | tokens de un solo uso para enlazar chat ↔ app |

Los recordatorios salen de un cron (Vercel Cron cada pocos minutos) o de mensajes con retraso en la cola.

## 5. Herramientas del agente

Cada herramienta es una función del servidor con esquema estricto. El modelo puede *decir* lo que quiera, pero solo *hace* lo que pasa por aquí (mismo principio que `aplicarParseo` en el stash).

| Herramienta | Lee / escribe | Notas |
|---|---|---|
| `ver_casa` | lee | miembros, alergias, horarios, preferencias; el resumen que va en contexto |
| `guardar_perfil` | escribe | miembros, comidas, horario, nivel… vía `aplicarParseo` |
| `guardar_alergia` | escribe | **siempre con confirmación explícita**; nunca se infiere |
| `guardar_preferencia` | escribe | gustos y rechazos («nada de coliflor»), con procedencia |
| `ver_menu` | lee | un día, una comida o la semana |
| `generar_menu` | escribe | lanza el solver; bloqueado hasta cubrir los cimientos (miembros, alergias, comidas en casa) |
| `cambiar_hueco` | escribe | «cambia la cena del martes», «algo más rápido»: el solver propone y el usuario elige |
| `marcar_fuera` | escribe | «el jueves comemos fuera» |
| `ver_receta` | lee | pasos, ingredientes, foto |
| `ver_compra` / `editar_compra` | lee / escribe | lista viva; añadir, quitar, tachar |
| `ver_despensa` / `editar_despensa` | lee / escribe | incluida foto de ticket o de nevera (reutiliza `receipt-ocr`) |
| `menu_cole` | escribe | foto o PDF del menú escolar → comidas de los niños (reutiliza la importación existente) |
| `crear_recordatorio` / `ver_pendientes` | escribe / lee | solo tras un «sí» del usuario |
| `deshacer` | escribe | revierte el último cambio de ese chat |
| `enlace_app` | lee | enlace profundo a la pantalla que toque |

## 6. Onboarding por chat

- Guion: `chatNodos.json` del stash (quiénes, alergias, comidas, horario, niños…), con sus cimientos.
- Lo que la casa ya sabe se confirma de pasada y no se vuelve a preguntar (`hechosIniciales`).
- Al cubrir los cimientos, ofrece generar el primer menú. El resto de nodos se puede contestar después o nunca.
- Avatares asignados solos por rol y edad.

## 7. Canales

| | Telegram | WhatsApp |
|---|---|---|
| Botones | los que quieras, editables | 3 botones o lista de 10, no editables |
| Grupo | cualquier grupo; solo contesta si le mencionan | solo grupos creados por el bot, por enlace de invitación, máx. 8, y exige cuenta oficial verificada |
| Escribir primero | libre y gratis | pasadas 24 h, solo con plantillas aprobadas y de pago |
| Coste del canal | gratis | gratis si escribe el usuario; plantillas de pago |

Todo se diseña para la columna de WhatsApp y Telegram añade extras encima. El agente produce un mensaje lógico (texto + opciones + enlace) y cada adaptador lo pinta.

## 8. Voz y fotos

- **Voz:** hace falta un proveedor de transcripción; Anthropic no transcribe audio. Candidatos: OpenAI (gpt-4o-transcribe), Deepgram, ElevenLabs Scribe. Son céntimos por familia y mes. Hay que elegirlo, y es un proveedor nuevo.
- **Fotos** (ticket, nevera, menú del cole): van al modelo como imagen y reutilizan lo que ya hace la app.

## 9. Fases

| Fase | Qué | Hecho cuando |
|---|---|---|
| **0. Cimientos** | Nube como fuente de verdad para casas con bot; regla de fusión app ↔ servidor; solver y compra en módulo compartido que corra en servidor; rol co-editor; verificar el hallazgo #2; cuentas sin Google + enlace | El mismo `data` genera el mismo menú en cliente y servidor, y un cambio hecho desde el servidor aparece en la app sin pisarse |
| **1. Telegram 1 a 1** | Webhook, cola, agente con herramientas, onboarding, consultar y cambiar menú, recetas, compra, voz. Socios dentro | Los socios hacen una semana entera solo por chat |
| **2. Telegram completo** | Grupos (mención), recordatorios ofrecidos, menú del cole, límite gratis, borrado de charla a N días, medición de coste real | Coste medido por familia y mes; una casa con dos padres en grupo funciona sin pisarse |
| **3. WhatsApp 1 a 1** | Número de empresa y Meta Cloud API, adaptador, plantillas para recordatorios | Mismo recorrido que en la fase 1, en WhatsApp |
| **4. WhatsApp grupos** | Verificación de cuenta oficial y Groups API | Grupo familiar en WhatsApp |

Antes de abrir fuera de socios: revisión legal (salud y menores), texto de privacidad (que hoy además promete un login por email que no existe) y moderación.

## 10. Costes (estimación, por medir en la fase 2)

Sonnet 5: 2 $ entrada / 10 $ salida por millón de tokens, ~0,20 $ entrada cacheada. Cada mensaje del usuario son unas 2–3 llamadas por las herramientas, con instrucciones y herramientas cacheadas.

| | Por mensaje | Familia activa (3–5 mensajes/día) |
|---|---|---|
| Sonnet 5 | ~0,03 $ | ~3–4,5 $/mes |
| Haiku 4.5 (si hiciera falta abaratar el tramo gratis) | ~0,015 $ | ~1,5–2,5 $/mes |

Onboarding por chat: ~1 $ una sola vez. Voz: céntimos al mes. WhatsApp: gratis mientras escriba el usuario.

## 11. Riesgos

- **Pisadas app ↔ bot** (sección 3.2): es el riesgo técnico número uno.
- **Errores al escribir datos:** confirmación visible de cada cambio, `deshacer` y alergias siempre con confirmación explícita.
- **Grupos:** otras personas del grupo pueden intentar colar instrucciones al bot. El agente solo actúa sobre la casa enlazada a ese chat y nunca revela datos de otra.
- **Coste desbocado:** límite por casa desde el día uno y medición en `bot_usage`.
- **WhatsApp:** la verificación puede tardar o no llegar; los grupos dependen de ella.
- **Doble persistencia heredada** en la compra y en el estado (`user_state` frente a tablas por dominio).

## 12. Decisiones abiertas

1. ~~Nombre y personalidad del bot.~~ Cerrada el 30 sep: **Lola** (15.1).
2. ~~Proveedor de transcripción de voz.~~ Cerrada el 30 sep: Whisper turbo en Groq (`api/_bot/voz.js`).
3. Qué pasa al llegar al límite gratis. Propuesta: aviso al 80 %; al tope, las consultas siguen y lo que usa IA invita a premium.
4. ~~Días que se guarda la charla.~~ Cerrada: 15 días, purga diaria `bot-retencion` (0065).
5. ~~Si Telegram lleva Mini App.~~ Cerrada el 30 sep: se probó y se retiró; los botones llevan a la app con `?ir=`.
6. Regla exacta de fusión app ↔ servidor (fase 0).

## 13. Qué se reutiliza del stash (`wizard/generativo`, `stash@{0}`)

| Pieza | Se reutiliza |
|---|---|
| `src/data/chatNodos.json` | sí, como guion del onboarding |
| `aplicarParseo` y su validación (`src/lib/chatWizard.js`) | sí, como núcleo de `guardar_perfil` |
| `hechosIniciales`, `cimientosCubiertos` | sí |
| `src/lib/libretaEnData.js` | sí |
| tests de `chatWizard.test.js` | sí, adaptados |
| `ChatWizardScreen.jsx` | no (la interfaz es Telegram) |
| `conversar` / `parsear` y prompts `chat-conversa` / `chat-parsea` | no (un agente con herramientas los sustituye); se aprovecha el tono del prompt |

## 14. Estado de los cimientos (29 sep 2026)

Hecho en la rama `bot/cimientos`: migración `0057` aplicada en producción, la app guarda condicionada a `bot_rev` y recarga si el bot ha escrito, motor empaquetado para el servidor (`scripts/build-bot-core.mjs` → `api/_bot/core.mjs`), tablas del bot, «Conectar Telegram» en Ajustes y webhook que enlaza chats y lee la casa.

Pendiente antes de que el bot ESCRIBA (fase 1), salido de la revisión adversarial:

1. **El bot puede pisar a la app.** `bot_save_casa` solo compara `bot_rev`, que no sube con las escrituras de la app: lo que la app guarde entre que el bot lee y escribe se pierde. Hace falta una migración nueva que compare también el `updated_at` leído (casa y semana).
2. **`bot_save_casa` no comprueba que la semana exista**: sube el contador y devuelve `ok` aunque no haya actualizado ninguna fila.
3. **El código de enlace se marca usado antes de enlazar**: si falla la inserción, se pierde y hay que pedir otro.

## 15. Lo que se decidió después (30 sep – 8 oct 2026)

Cómo se escribe y se prueba el código de Lola (evals, modelos, plan B,
supervisor, enrutador) está en `.claude/rules/lola.md`; cómo se opera
Telegram, en la skill `telegram`. Aquí, solo las decisiones de producto y el
porqué.

### 15.1 Lola

El bot se llama **Lola** (30 sep): mujer, española, cocinera de casa con
delantal verde; habla de sí en femenino. Nombre visible «Lola · HoMenu».

**Chatbot first** (30 sep): el chat es el mando y la app es para VER (menú,
compra). La app ya no lanza wizards; se mantiene la pizarra para quien quiera
rellenar a mano, y en Ajustes queda lo fino (avatares, peso y altura). Lola
tiene que poder tocar todos los ejes del menú, más de los que permitía el
wizard largo.

### 15.2 Velocidad

Por qué hay enrutador y vías rápidas: lo lento eran las vueltas del modelo y
la red, no el solver. Medido el 30 sep: ráfaga de 2 s, ida y vuelta a Supabase
(de ahí `fra1`) y Haiku ~1,1 s. Quitarle al enrutador el contexto de la casa
para ganar 0,3 s empeoró las decisiones (84/92 frente a 135/138), y se dejó.
En producción el enrutador sigue apagado hasta probarlo en modo sombra.

### 15.3 Buscar recetas

Desde el 1 oct, `buscar_recetas` va por `api/_bot/buscador.js`: rasgos por
reglas (`src/lib/rasgosBusqueda.js`), vector de la frase sin lo negado
(`api/_bot/vectores.js`, voyage-4, índice en `api/_bot/recetasVectores.json`,
se rehace con `scripts/build-vectores.mjs`) y Haiku (`api/_bot/significado.js`)
solo de reserva. Por qué: los vectores solos acertaban el 76 % y fallaban en
rasgos y en el «no»; el híbrido, 89 % con mediana 0,45 s, frente a 91 % y
1,1 s de Haiku solo. Ojo: ese examen ciego (`scripts/vectores-aparte.mjs`) lo
escribió quien hizo las reglas y solo tiene 3 negaciones; falta uno con
frases de Pablo. No se ajustan reglas mirando el ciego.

### 15.4 Tareas abiertas

Principio (3 oct): **toda garantía que importe va en la base o en código
determinista; el modelo es opcional.** Cada vez que una garantía dependió del
modelo, las evals fallaron 1 de cada 3.

- Dos capas: `api/_bot/pendientes.js` (la pregunta del turno, dura 2 turnos) y
  la tabla `bot_tareas` (lo que sobrevive a la charla). Las preguntas con
  clave de estado (`alergias:<id>`, `etapa:<id>`, en `api/_bot/estadoCasa.js`)
  las sube el código a la tabla y se cierran solas al resolverse.
- Una abierta por casa y clave; tope de 8 seguimientos que **rechaza** la
  novena (nunca borra en silencio: Lola pregunta cuál quitar); purga a 7 días.
- `rechazada` es «no quiere decirlo»: no se purga ni se repregunta, y nunca
  equivale a «ninguna».
- Seguimientos, solo con el sí. Lola no promete enterarse de lo que no ve:
  ofrece un aviso con fecha.

**Alergias sin revisar** (8 oct, PR #107): mientras las alergias de una
persona estén sin revisar, el menú esquiva los 14 alérgenos y Lola pregunta.
Antes el motor las trataba como «ninguna».

### 15.5 Decisiones de comportamiento

Viven en `api/_bot/conocimiento.md`, que es lo que Lola lee, y se vigilan con
`scripts/bot-evals.json`. Aquí, la fecha y el porqué.

| Decisión | Fecha | Por qué | Dónde se vigila |
|---|---|---|---|
| **Solo comida**: compra, tareas y recordatorios no aceptan velas, pilas, pañales, limpieza, citas ni recados | 3 oct | El alcance es lo que come la casa; lo demás diluye el producto | `conocimiento.md`, «Solo comida»; evals de pilas, velas y cita médica |
| **Sin botón «Deshacer»** (PR #25). «Deshaz» dicho con palabras sigue funcionando | 2 oct | Era un lío, y el botón deshacía lo último de la casa, no de ese chat | Sin eval. El código que pintaría el botón sigue en `api/bot/telegram.js`; no se reactiva |
| **Bebé**: si no se sabe si come el menú de la familia o el suyo, Lola pregunta antes de tocar nada suyo | 1 oct | No se supone en ningún sentido | `conocimiento.md`, «El bebé». Falta la herramienta que pase al bebé al menú de la familia |
| **No preguntar datos invasivos** (el colegio de un niño, y lo parecido): solo se guardan si se infieren de lo que mandan | 1 oct | Junto al nombre y la edad, localiza a un menor y espanta a las familias | **Falta en `conocimiento.md`** (F3 del plan maestro). El campo colegio aún no existe |
