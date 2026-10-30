# Repaso de huecos: lo que el plan de fichas con estado no cubre para tener el dato trazado de punta a punta

Fecha: 30 oct 2026. Base leída: `origin/staging` en `5754e531` (#1047). Complementa a `specs/plan-fichas-con-estado.md`: no lo sustituye ni lo reordena; propone trozos nuevos y dónde encajan, y deja las decisiones a Pablo.

Origen: conversación con Pablo del 30 oct 2026 («¿qué más le faltaría para que fuera una app hiper smooth y con toda la data trazada limpia end to end?», «¿falta implicar al solver?», «la ficha de tareas de Lola debe tener mucha profundidad», «¿es escalable para miles de usuarios?»).

## Lo desagradable primero

- **El plan limpia cómo se guarda el dato, pero no cómo lo usa el motor.** El motor lee el documento de la casa directamente: 31 claves distintas de `data.*` entre `src/lib/aiPlanner.js`, `src/lib/solver.js`, `src/lib/reglas.js` y `src/lib/validateMenu.js` (`data.members` 23 veces, `data.schedule` 13, `data.fixedDishes` 8, `data.sesgos` 7…). El trozo 14 del plan recalcula al leer `freqs`/`reparto`/`sesgos` desde `gusto` para que el motor no note el cambio: funciona, pero el motor nunca ve el estado de cada dato (dicho o supuesto, peso, ámbito día/comida, caducidad), que es lo que el plan añade.
- **Un menú guardado no dice con qué se hizo.** `user_menu_weeks` (0005) guarda `plan`, `shopping` y `schedule` con `created_at`/`updated_at`; ni versión del catálogo (`BUNDLED_CATALOG_VERSION`, `src/data/catalogVersion.js`), ni del motor, ni qué datos de la casa leyó. Si un plato sale mal, hoy no se puede saber qué dato lo causó.
- **Las tareas de Lola son la parte más corta del modelo.** `bot_tareas` (0076-0083) y `src/lib/registroTareas.js` existen, pero las preguntas solo cubren dos campos (`SOBRE_A_CAMPO`: `alergias`, `etapa_bebe`), los tipos `espera`/`decision` y el estado `aplazada` solo se escriben tras `BOT_TAREAS_V2`, y los objetivos son tres fijos. El plan les dedica una fila («generarlas desde el catálogo»). Además hay un segundo sitio para algo parecido: `bot_reminders` (0057), con su propio estado (`pending`/`sent`/`cancelled`) y su lector (`api/_bot/recordatorios.js`, `api/_bot/vispera.js`).
- **Lo hecho en local y sin subir no está en este repaso.** Esta sesión lee GitHub: `staging` y las ramas subidas. Lo que esté solo en el PC de Pablo (commits sin push, cambios sin commitear) no lo ve. Ver Not verified.

## Lo que ya existe y se reutiliza

| Qué | Dónde | Para qué hueco |
|---|---|---|
| Sobre por dato y `escribirDato({…, ref})` | plan, trozos 7-8 | H4: `ref` ya está en la firma; falta decir qué es |
| Mensajes de Lola | `bot_messages` (tabla existente) | H4: el `ref` de un dato dicho por chat |
| Sobre por hueco de la semana | plan, trozo 18 | H2: el «por qué» de cada plato va en ese sobre |
| Registro de tareas y sus CHECK | `src/lib/registroTareas.js`, 0076-0083 | H3 |
| Siguiente pregunta única | plan, trozo 17 (`siguientePregunta.js`) | H3: preguntar es una tarea |
| Mínimos para generar | plan, trozo 2 (hecho, #1046) | H3: tareas que bloquean |
| Validador único de reglas | `src/lib/validateMenu.js` (lo usa el solver en cada nodo) | H1: no se toca; cambia lo que recibe |
| Borrado de cuenta por cascada | `api/delete-account.js`, `specs/auth.md` | H5 |
| Mapa de capacidades | `src/lib/capacidades.js`, plan trozo 23 | H3 y H6 |

## Los huecos

### H1. La entrada del motor: una sola función que lee las fichas y da al motor un paquete cerrado

Qué falta: hoy el motor recibe `data` (el documento entero) y busca lo que necesita. Con las fichas, debería recibir un objeto con forma fija, `entradaDelMotor(casa, semana)`, que sea lo único que leen `generateMenuWithAI`, `solver.js`, `validateMenu.js`, `pickCatalogReplacement` y `api/_bot/generar.js`.

Propuesta:
- Forma declarada una vez (constante + test), con cada dato llevando valor y `origen`, para que el motor pueda tratar distinto lo `dicho` (regla dura) de lo `supuesto` o `visto` (preferencia que cede).
- Los gustos con ámbito (días, comidas) entran como tales; se deja de proyectar a `sesgos`/`freqs`.
- Un test de paridad: la misma casa por el camino viejo y por `entradaDelMotor` da el mismo menú con la misma semilla, mientras dure el cambio.
- Cifra: claves de `data.*` leídas en el motor (hoy 31 → 0).

Dónde encaja: trozo nuevo justo después del tramo 2 (trozos 7-9), antes del tramo 3, para que cada ficha que se mueva después llegue ya al motor por aquí.

### H2. La traza del menú: cada plato dice por qué salió, y cada semana con qué se hizo

Qué falta: el «por qué» de un plato y la versión de lo que se usó.

Propuesta:
- En el sobre por hueco del trozo 18: además de quién y cuándo, `motivo` con las reglas y los gustos que pesaron (ids del registro, no texto libre), y si fue el solver, un cambio a mano o Lola.
- En la semana: versión del catálogo, versión del motor y la marca de la entrada (H1) usada.
- Cada artículo de la compra derivada (trozo 18) sabe de qué platos sale; ya se calcula, falta exponerlo.
- Lector: una herramienta de Lola «por qué este plato» y la ficha del plato en la app. Sin lector no se guarda (principio del repo).

Dónde encaja: ampliar el trozo 18; la versión de la semana, con H1.

### H3. Las tareas de Lola, a fondo

Qué falta: que una tarea sea una entidad completa, con el mismo rigor que una ficha. Propuesta de forma (a decidir campo a campo, cada lista cerrada con CHECK + constante + test, como ya hace `registroTareas.js`):

| Campo | Valores | Para qué |
|---|---|---|
| tipo | `falta_saber`, `espera`, `decision`, `seguimiento`, `recordatorio`, `objetivo` | qué clase de cosa es; `recordatorio` absorbería `bot_reminders` (ver decisión D1) |
| origen | `catalogo` (dato mínimo vacío o caducado), `motor` (hueco sin llenar), `senal` (umbral de una señal), `familia` (lo pidió alguien), `caducidad`, `sistema` | quién la creó, siempre enlazada a lo que la provocó (`campo`, `hueco`, `senal`, `mensaje`) |
| para quién | casa, persona, cuenta; y canal | a quién se pregunta y por dónde |
| prioridad | del `peso_menu` del catálogo (trozo 5) | el orden: lo que más cambia el menú, antes |
| cuándo | `vence_at`, `vuelve_at`, ventana del día, horas de no molestar (de la ficha Trato, trozo 16), intentos y tope de intentos | no insistir ni olvidar |
| bloquea | `generar`, `compra`, nada | los mínimos para generar (trozo 2) como tareas |
| cierre | `hecha`, `descartada`, `rechazada`, `caducada`, `aplazada`; y el sobre que escribió | cada respuesta queda enlazada al dato que guarda (H4) |
| fechas | `created_at`, `cerrada_at`, `vence_at`, `vuelve_at` | tiempo hasta cerrar, olvidos |
| objetivo | para `objetivo`: meta, medida y progreso («menos carne este mes»: raciones de carne por semana) | objetivos de la familia que el motor lee por H1 |

Cifras con línea base: tareas abiertas por casa, % rechazadas, % caducadas sin respuesta, tiempo medio hasta cerrar, preguntas hasta el primer menú.

Dónde encaja: un tramo propio fundido con el tramo 6 (trato y siguiente pregunta, trozos 16-17), porque «qué preguntar y cuándo» es crear y ordenar tareas. Necesita su migración (columnas nuevas en `bot_tareas` y, si D1 dice que sí, retirar `bot_reminders` sin convivencia).

### H4. La traza de la conversación: de qué mensaje sale cada dato

Qué falta: `escribirDato` lleva `ref`, pero el plan no dice qué es. Sin eso, la traza se corta en Lola: se sabe que un dato es `dicho` por `telegram`, no en qué mensaje ni quién lo dijo.

Propuesta: `ref` como par cerrado `ref_tipo` (`mensaje`, `pantalla`, `tarea`, `senal`, `motor`) + `ref_id` (id de `bot_messages`, nombre de pantalla del registro de capacidades, id de tarea…). Lector: «¿por qué crees que Lucía no come cerdo?» → Lola cita el mensaje y la fecha. Retención: el sobre guarda el `ref` aunque el mensaje se pode; se dice qué pasa al podarlo.

Dónde encaja: trozo 7 (la migración 0105 crea el sobre), antes de que nadie escriba.

### H5. Privacidad con el dato repartido en muchas tablas

Qué falta: hoy el borrado depende de las cascadas de las FK, y ya falló una vez en producción (15 ago 2026, `specs/auth.md`). El plan crea `sobre`, `gusto`, `senal` e historiales; cada una es un sitio más donde puede quedar dato de una persona, también de menores.

Propuesta:
- Un test que recorra las migraciones y exija que toda tabla con `household_id`, `user_id` o `persona_id` tenga su cascada o su anonimizado declarado.
- Borrar una persona (no solo la cuenta): qué se borra y qué se anonimiza, por tabla.
- Exportar todo lo de una casa o una persona en un fichero, leyendo las fichas.

Dónde encaja: condición de cierre de cada trozo que crea tabla (7, 10, 14), más un trozo pequeño de exportación al final.

### H6. Las cifras a la vista

Qué falta: el plan define cifras que bajan (claves en el documento, copias, sin tabular, huecos vacíos, contradicciones de Lola) y este repaso añade las de H1-H3, pero no hay un sitio donde se vean juntas cada día.

Propuesta: un script de solo lectura (`npm run cifras:modelo`) que las saque en tabla; el panel (`homenu-panel`, otro repo) las lee de ahí. Sin pantalla nueva en la app.

### H7. Una prueba de punta a punta que lo vigile

Qué falta: ninguna pantalla grande (`Onboarding.jsx`, `Menu.jsx`, `App.jsx`, `Shopping.jsx`, `PizarraControles.jsx`) tiene una prueba que la abra y la use. Lo limpio se vuelve a ensuciar sin red.

Propuesta: una casa de prueba que haga alta → menú → cambiar plato → compra en la app (Playwright) y el mismo recorrido en Lola (evals), comprobando al final que lo guardado en las fichas es lo esperado y que cada dato tiene su sobre con origen, canal y fecha. En el CI de cada PR que toque esas zonas.

## ¿Escala a miles de casas?

Sí, por diseño, con tres vigilancias.

- **Volumen:** unos 140 datos por casa más los de cada persona son, para 10.000 casas, unos pocos millones de filas pequeñas, siempre leídas por casa (índice por `household_id`). Postgres lo lleva sin esfuerzo. El plan ya evita lo que no escala: las señales son una fila por casa × eje × valor, no una por evento, y los historiales tienen poda (trozo 14).
- **Rellenar:** las familias no rellenarán 140 datos ni deben. El modelo ya lo resuelve con el estado de cada dato: casi todo nace `por_defecto` o `supuesto` y pasa a `visto` por señales; solo se pregunta lo mínimo para generar (quién come, alergias, días) y lo demás por orden de `peso_menu`, de uno en uno. La cifra que lo vigila es «preguntas hasta el primer menú» (H3).
- **Lo que sí cuesta con el número de casas:** las conexiones de tiempo real abiertas a la vez (Supabase pone un tope según el plan contratado; es dinero), el gasto de Lola por mensaje (el tope de 50 al mes por casa, PR #929, abierto) y el trabajo nocturno de las señales (una pasada en SQL; vigilar su duración).

## Decisions for Pablo

### D1. ¿Los recordatorios (`bot_reminders`) pasan a ser un tipo de tarea?
1. **Sí (recomendada):** un solo sitio para «algo que Lola tiene pendiente con la familia», con las mismas fechas, estados y cifras. Se retira `bot_reminders` en el mismo trozo, sin convivencia.
2. No: se quedan aparte; dos tablas con estados distintos para cosas parecidas.
3. Más adelante: se decide al llegar al tramo de tareas.

### D2. ¿Dónde entran la entrada del motor (H1) y la traza del menú (H2)?
1. **Justo después del tramo 2 (recomendada):** el motor lee lo nuevo desde la primera ficha que se mueve.
2. Al final del plan: más rápido ahora, pero el motor sigue con la forma vieja mientras dura.
3. Solo H2 ahora y H1 al final.

### D3. ¿Las tareas a fondo (H3) van como tramo propio fundido con el tramo 6?
1. **Sí (recomendada):** «qué preguntar y cuándo» y las tareas son lo mismo visto desde dos lados.
2. Tramo propio después del 8.
3. Solo encender `BOT_TAREAS_V2` y ampliar `SOBRE_A_CAMPO`, sin rediseño.

## Not verified

- Trabajo local sin subir: esta sesión lee `staging` y las ramas subidas (vistas: `datos/un-dato`, `bot/lo-hecho`, `fix/rellenar-reglas-duras` (#1034), `bot/908-latencia-escrituras` (#927), `bot/tope-lola-50` (#929)). Lo que solo esté en el PC de Pablo puede haber cerrado o cambiado algún hueco.
- No se ha leído producción: sin cifras de filas en `bot_tareas` ni `bot_reminders`, ni el valor de `BOT_TAREAS_V2` en Vercel.
- El recuento de `data.*` en el motor es textual (`grep -oE "data\.[a-zA-Z]+"` sobre los cuatro ficheros): no cuenta lecturas por desestructuración (`const { members } = data`), así que la cifra real es igual o mayor.
- Las cifras de escala son orden de magnitud, no medidas.
