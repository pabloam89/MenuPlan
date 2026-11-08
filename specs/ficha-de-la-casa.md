# Ficha de la casa y analista nocturno

Diseño del 1 oct 2026. Sale de dos agentes (uno propuso y otro lo atacó con el código delante) y de la conversación con Pablo.

## Estado (1 oct 2026, staging)

La **ficha** está montada (`api/_bot/ficha.js`, `montarFicha`), con una diferencia con el diseño: no se guarda ya montada. Se monta en cada mensaje desde la casa que `casa.js` recuerda unos segundos, sin el motor, en milisegundos. Los dos bloques van en el `system` con su caché. Lleva, además de lo de abajo:
- la fecha ISO en la cabecera del día («jue 1 oct (2026-10-01)»);
- en COCINA, «Reglas:» (las de siempre), «No volver a suponer:» (lo rechazado) y «Tanda:»;
- «Dicho:» y «Supuesto:» por `matizDe` (lo visto va con lo supuesto) y filtrados por vigencia.

La leyenda está en `conocimiento.md`, «Las marcas de la ficha».

Del apartado 5, hechos: 1 (salvo que `buscar_recetas` marque intolerancias y estados), 2, 3 (`ajustar_salud`; la dieta blanda sigue sin caducidad en el servidor), 4, 5 y 6. Pendientes: el **hilo** (7), la **semana definitiva** (8) y el **analista** (9); la línea PENDIENTE de la ficha solo lleva, de momento, la pregunta de alergias.

Lo que sigue es el diseño tal como se acordó.

## Por qué

Hoy Lola no ve la casa: para saber quién come o quién es alérgico llama a `ver_casa` o `ver_ajustes`, y cada llamada es una vuelta más del modelo (2-4 s). Además, lo que se aprende del uso no se guarda en ningún sitio. Este diseño tiene tres piezas:

| Pieza | Qué es | Para quién | Cuánto dura |
|---|---|---|---|
| **Ficha** | Lo que es verdad de la casa ahora, en texto corto | Lola, en cada mensaje | Se recalcula cada vez |
| **Hilo** | Lo que está pasando en esta charla: pregunta abierta, opciones propuestas, receta a medias | Lola, en los mensajes siguientes | Minutos u horas |
| **Analista** | Lo que se deduce del uso, en una tabla con vocabularios cerrados | El equipo (para crear ejes) y, filtrado, la ficha | Se recalcula cada noche |

Lo que crece es el **esquema** (lo que se guarda y lo que calcula el analista). La **ficha** se queda corta: ~300 tokens en una casa normal y nunca más de 450. Lo que no cabe se resume y el detalle se pide con herramienta.

## 1. Capas del dato

| Capa | Ejemplos | Quién la escribe | Cómo se marca en la ficha |
|---|---|---|---|
| Permanente | Personas, alergias, intolerancias, trastos, grupos | La casa (app o Lola, con confirmación en lo de seguridad) | Sin marca |
| Temporal | Embarazo, lactancia, dieta blanda, enfermo, invitados, vacaciones | La casa; el analista solo PREGUNTA | «hasta dd/mm» |
| Hábito | Tanda y su día, estructura, ritmo, estilo, gustos | La casa | «Dicho:» frente a «Supuesto:» |
| Aprendido | Repeticiones, recetas propias que más salen, gasto real | Solo el analista | Solo si lleva una acción (ver PENDIENTE) |
| Vivo | Menú de hoy y mañana, nevera, avisos | El sistema | — |

Regla de oro: **el analista nunca escribe en lo que dijo la casa ni en nada de salud o alergias**. Propone; la casa confirma; solo entonces pasa a la libreta.

## 2. La ficha

Dos bloques en el `system`, cada uno con su `cache_control`, después de `SISTEMA` y antes de la línea de la hora (`api/_bot/agente.js`). El estable casi no cambia y aprovecha la caché; el del día cambia cada día. Leyenda en `conocimiento.md` (en caché), no en la ficha. Se guarda ya montada y se rehace tras cada escritura del bot, cada noche y cuando cambie `household_state.updated_at`; nunca se monta en el camino caliente con el motor de 10 MB.

### Bloque ESTABLE (≤ 300 tokens)

| Sección | Campos | Tope |
|---|---|---|
| SEGURIDAD (siempre, nunca se recorta: se compacta agrupando por alérgeno) | Alergias por persona; intolerancias con su etiqueta; embarazo, lactancia y perfiles de salud con «hasta» si hay fecha; etapa del bebé; personas «SIN PREGUNTAR»; «aplica a todo el grupo X» cuando toque | ~80 |
| CASA | Persona y edad; 3 «no le gusta» como mucho (8 en total); nombres EXACTOS de los grupos y quién está en cada uno; horario en 3 patrones como mucho; en grupos de chat, quién es quién | ~90 |
| COCINA | Estructura por servicio; ritmo entre semana y finde; tanda solo si hay bases pedidas, con su día; trastos; estilo si no es «de todo»; «Dicho:» y «Supuesto:» separados (3 y 2 como mucho); nunca; fijos; despensa, presupuesto y variedad si no son los de por defecto; «No volver a preguntar:» | ~100 |
| RECETARIO | Cuántas (vuestras, copiadas de Gente, recibidas por enlace, variantes del catálogo) y las 3 que más salen, por nombre exacto | ~30 |

### Bloque DEL DÍA (≤ 150 tokens)

| Sección | Campos | Tope |
|---|---|---|
| Cabecera | «jue 1 oct» | 5 |
| AHORA (solo si hay algo) | Invitados con fecha, reglas con «hasta», dieta blanda con «hasta» calculado en el servidor, temporales vigentes | ~50 |
| MENÚ | Rango(s) y si hay semana siguiente; hoy y mañana (grupos solo si comen distinto); raciones cocinadas en nevera o congelador | ~60 |
| AVISOS | Recordatorios activos (para no volver a ofrecer el ritual) | ~20 |
| PENDIENTE | 2 como mucho: primero una de seguridad; luego una propuesta del analista con acción («tortilla el domingo 4 de 4 semanas → ¿fijarla?», «4 recetas vuestras nunca han salido → ¿las meto?») o una contradicción | ~30 |

Casa recién creada: sustituye a todo «SEGURIDAD: SIN REVISAR · PARA EMPEZAR FALTA: quién come · alergias · comidas» (≤60 tokens).

### Recorte

Tope duro 450. Orden de recorte, del primero al último: «no le gusta», propuesta del analista, MENÚ, COCINA, CASA, RECETARIO, AHORA. SEGURIDAD nunca. Lo que no cabe, «+N (ver_ajustes)».

### Ejemplo (~320 tokens)

```
SEGURIDAD
- Lucas: alergia a frutos de cáscara. Pablo, Marta: ninguna. Vega: SIN PREGUNTAR.
- Marta: lactancia, sin fecha (aplica a todo «Mayores»).
- Vega (12 m): ya come sólidos.
CASA
- Pablo 39 · Marta 37 · Lucas 7 (no le gusta: champiñón) · Vega 1.
- Grupos: «Mayores» (Pablo, Marta, Lucas) y «Vega».
- Lucas: cole L–V a mediodía. Pablo: tupper L–J.
COCINA
- Comida: primero y segundo. Cena: plato único.
- Entre semana ~20 min; finde ~90. Tanda el domingo: sofrito y 2 cremas.
- Thermomix, horno, microondas.
- Dicho: más pescado (3/sem), nada de cilantro. Supuesto: algo de mexicano.
- Fijo: pizza casera viernes cena.
RECETARIO
- 12 recetas: 8 vuestras, 3 copiadas, 1 recibida. Más usadas: Tortilla de la abuela, Lentejas de Marta, Pollo al limón.
---
jue 1 oct
AHORA
- Sáb 3 comida: +2 invitados (abuelos).
MENÚ 28 sep–4 oct (no hay semana siguiente)
- Hoy: crema de calabacín + merluza en salsa verde; cena revuelto de espinacas. Vega: pollo desmenuzado con boniato.
- Mañana: lentejas + pollo al ajillo; cena pizza casera.
- Nevera: 3 raciones de crema de calabaza.
AVISOS
- Domingo 18:00, preparar el menú.
PENDIENTE
- ¿Vega tiene alguna alergia?
- Se ve: tortilla de patatas el domingo en la cena 4 de 4 semanas → ¿fijarla?
```

### Reglas de Lola que cambian a la vez

- `agente.js` (regla «llama PRIMERO a la herramienta…»): para ENSEÑAR el menú, una receta o la compra, herramienta (trae fotos y botón); para DECIDIR, la ficha; si la ficha no lo dice, herramienta.
- `agente.js` (configurar la casa): `ver_ajustes` solo para lo que la ficha marca con «+N».
- `conocimiento.md`, modo «Generar»: quitar «Primero mira ver_ajustes y ver_casa».
- Lo que devuelve una herramienta en el turno manda sobre la ficha; la ficha manda sobre lo dicho en charlas de días anteriores.
- `ver_casa` pasa a devolver la ficha completa, sin topes.

## 3. Menús «definitivos» sin pedir «me gusta»

Que alguien marque «cocinado» en la app es raro, así que lo que se comió se **estima** con señales que ya existen o son de un toque, y cada semana queda con su nivel de certeza:

| Certeza | Cuándo |
|---|---|
| **Confirmado** | Marcado como cocinado en la app, o respuesta a un botón de Lola |
| **Probable** | El día pasó, el plato no se cambió ni se vació, y sus ingredientes se compraron (tachados en la lista o leídos en un ticket) |
| **Dudoso** | El día pasó sin cambios, pero sin señal de compra |
| **Descartado** | Se cambió, se vació, o dijeron «hoy pedimos pizza» |

La pregunta, **una vez por semana como mucho y solo a quien aceptó el ritual**: en el aviso del domingo, «¿Qué tal la semana? ¿Repetimos algo?» con 3 botones de los platos probables y «Nada especial». Un toque en Telegram, no un «me gusta» en la app. El analista usa «confirmado» y «probable»; «dudoso» no cuenta para nada.

## 4. El analista

Tabla nueva `household_perfil_aprendido`: una fila por observación. No vive en `household_state.state.data` (la app pisa el blob entero, subiría `bot_rev` y ensuciaría deshacer). El motor nunca la lee: lo que la casa acepta pasa a la libreta con `origen: "perfil"` (ya existe en `notepad.js`).

### Columnas

| Columna | Valores |
|---|---|
| `corte`, `vocab_v` | fecha de la ejecución, versión del vocabulario |
| `household_id` | uuid (seudonimizado en exportaciones) |
| `eje` | cerrado, lista abajo, u `otro` |
| `valor` | cerrado según el eje; con `otro`, `etiqueta_libre` de 5 palabras como mucho |
| `ambito` | todos / adultos / ninos / bebe / persona:id |
| `servicio`, `dia` | comida / cena / ambos; L…D / entre_semana / finde / cualquiera |
| `declarado` | lo que dice la casa, o `sin_dato` |
| `relacion` | coincide / contradice / nuevo / sin_eje |
| `n_obs`, `semanas_con_obs`, `ventana_dias` | enteros |
| `confianza` | baja (<3 obs) / media (≥3 en ≥2 semanas) / alta (≥5 en ≥3 semanas y nada en contra) |
| `fuentes` | app_evento, bot_evento, bot_texto, ticket, voto, compra, receta |
| `accion` | fijar_libreta / proponer_fijo / proponer_excluido / proponer_regla / proponer_en_menu / preguntar / ninguna / candidato_eje |
| `estado` | propuesta / mostrada / aceptada / rechazada / caducada |
| `desde`, `vence` | fechas; lo aprendido caduca a los 30 días si nada lo renueva |
| `ref` | ids de evento o mensaje, nunca el texto |

Ventanas: 8 semanas para patrones semanales; 28 días para tasas.

### Ejes

| Eje | Valor | De dónde sale |
|---|---|---|
| `ritmo` | con_prisa / normal / con_tiempo / depende | descartes por tiempo, cambios a algo más corto, minutos de lo cocinado |
| `tanda`, `dia_tanda` | no / ocasional / semanal; L…D | cocinados agrupados por día (despensa `cooked_dish`) |
| `estructura` (por servicio) | primero_segundo / 1_plato | primeros vaciados, `slotType` por día |
| `cocina` | COCINAS × mas / menos | votos, favoritas, cocinados frente a descartes y cambios |
| `familia` | FAMILIAS × sobra / falta | familia del plato quitado frente al puesto |
| `favorita`, `rechazo` | ids de receta | uso repetido y «probable»; cambiado ≥2 veces (solo se propone, nunca a descartes para siempre) |
| `repeticion` | (día, servicio, receta o familia) | semanas «confirmadas» o «probables» |
| `ingrediente_evitado` | id de ingrediente | ingredientes de lo rechazado frente a lo cocinado |
| `hueco_falla` | (día, servicio) | vaciados, «fuera», «hoy pedimos» (nunca por falta de marca) |
| `receta_propia_uso` | ids + nunca_en_menu | cuánto salen y se cocinan las recetas de la casa → `proponer_en_menu` |
| `origen_recetas` | creada_app / creada_bot / copiada_gente / recibida_enlace / variante | `source`, `copied_from_*`, enlaces, `baseDishId` |
| `variante` | (receta del catálogo, qué cambia) | `baseDishId` → candidato a mejorar el catálogo |
| `autor_que_copias`, `receta_que_compartes` | ids | copias de Gente; enlaces enviados |
| `gasto` | <60 / 60-100 / 100-150 / >150 €/semana | tickets y precios observados |
| `basico` | ingrediente | lo que se apunta a mano en la compra → lista de básicos |
| `hora` | mañana / mediodía / tarde / noche | cuándo se consulta «qué comemos» → hora del aviso diario |
| `quien_cocina` | persona + % | autor de cambios, recetas y mensajes en grupo |
| `aceptacion` | alta / media / baja + nuevo o repetido | qué opción eligen o si pulsan «Elige tú» |
| `invitado_recurrente` | (día, servicio, n) | reglas de invitado que se repiten → proponer regla fija |
| `canal` | app / bot / mixto | eventos de cada canal |
| `temporal` | enfermo / dieta_blanda / viaje / vacaciones / invitados / celebracion / sin_cocina / cambio_etapa_bebe / otro | SOLO como pregunta; `cambio_etapa_bebe` por la edad, sin modelo. Nunca escribe salud ni alergias. Nada de dietas de adelgazamiento |

### De observación a eje nuevo

Vista semanal entre casas que agrupa `relacion = sin_eje` y las `etiqueta_libre` de `otro`. Umbral: 30 casas o el 2 % de las activas, en 3 semanas o más, con confianza media o alta, y más del 50 % de aceptación cuando se propone. Si lo cumple: ficha de producto, campo nuevo en `notepadFields.js` con su lector en el motor, parámetro en la herramienta de Lola y línea en la ficha; sube `vocab_v` y el analista lo promociona de `otro` a eje cerrado.

Datos de salud: inferirlos del chat necesita base legal o consentimiento (RGPD, categoría especial). Hasta entonces el analista no los toca.

## 5. Huecos que hay que cerrar, por orden

1. **Seguridad.** Revisión de alergias por persona (hoy `allergiesReviewed` es de toda la casa y no se resetea al añadir a alguien); `buscar_recetas` que marque intolerancias, embarazo y lactancia, y etapa del bebé; la descripción de `ajustar_alergias` dice «o intolerancias» pero solo acepta los 14 alérgenos.
2. **Rastro de lo que se hace.** Eventos del bot y de la vía rápida (`cambiar_plato`, `generar`, opción elegida, descartes) con plato anterior y nuevo y canal; `dish_replaced` de la app con el plato anterior; crear, copiar, recibir y guardar receta con su origen; cocinados en un registro que no se borre con el menú. Sin esto el analista no tiene nada que leer.
3. **Intolerancias y estados** desde Lola, con confirmación y fechas (`dietaryStatesMeta`), y caducidad de la dieta blanda en el servidor.
4. **Dicho frente a deducido en la libreta:** hoy todo lo que guarda `ajustar_gustos` entra como inferido.
5. **Tanda:** que Lola pueda pedir bases (`tanda`, `tandaPlatos`), quitar `cookTime.tanda` (se pierde al cargar la app) y añadir `diaTanda`.
6. **Ficha** en dos bloques, guardada ya montada, con las reglas de Lola reescritas. Medir antes y después con `scripts/bot-evals.mjs` y el registro de tiempos de `bot_route`.
7. **Hilo:** fila oculta en `bot_messages` con la pregunta abierta y las opciones propuestas (como el borrador de receta).
8. **«Semana definitiva»** estimada y la pregunta del domingo.
9. **Analista v1**, empezando por los ejes sin modelo: repeticiones, recetas propias, invitados recurrentes, básicos, gasto, etapa por edad.

## 6. Modelo de datos acordado (5 oct 2026)

La spec viva está en el artefacto «Ficha de la casa»
(https://claude.ai/artifact/6Dgpfp8raH28qUTte3ahPC). Lo que decidió Pablo y
conviene tener aquí:

- **Entidades:** casa (personas, seguridad, cuenta, capacidades, semana tipo,
  niños y comedor, gusto), menú externo (el cole), coyuntura (reglas con
  fecha) y menú semanal (hereda de la casa y guarda solo diferencias).
- **Gusto en cuatro capas:** qué, cómo, nunca (con alcance y excepción) y
  aprendido (siempre «supuesto»). Precedencia: seguridad > nunca > coyuntura >
  diferencias del menú > lo dicho > aprendido > matices.
- **Edad:** no se pregunta. Sin dato, categoría supuesta por parentesco,
  nunca 30 años. El bebé que come con la familia está en los dos grupos.
- **Menús de la casa, recetas de la persona** (v13): `user_menus` y
  `user_menu_weeks` pasan a la casa; `user_recipes` sigue siendo de la persona,
  que se lleva su recetario a otras casas.
- **Calorías por persona, no por grupo** (v8). Peso y altura quedan fuera del
  alta y se piden solo si alguien pide calorías. El sexo se deduce del nombre
  solo si es claro, solo para calorías, y nunca se enseña ni se usa para
  hablar. La actividad, solo si la cuentan. El cálculo vive en
  `src/lib/raciones.js`.
- **El perfilado es un aplazamiento, no un descarte:** antes de proponerlo,
  preguntar si ya toca.
- Huecos vistos de paso: `OnboardingGoals` no se monta, así que `data.kcal`
  vale 2000 para todos; `resolveMemberAge()` devuelve 30 por defecto.

**v17, estresada en Postgres local (PGlite) con 252 pruebas en verde.** El
arnés vivía en el scratchpad temporal de una sesión y **probablemente se ha
perdido**. Si se retoma, habrá que reconstruirlo dentro del repo.
