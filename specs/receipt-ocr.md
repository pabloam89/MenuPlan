# Dominio: OCR de recibos y fotos de despensa

## 1. Contrato funcional

**Qué hace.** Tres flujos de visión por IA, todos vía Claude (modelo `FAST_MODEL` = `claude-haiku-4-5-20251001`, `src/lib/aiModels.js:9`) a través del mismo `/api/generate` que usan los demás dominios de IA — pero **sin `task`**: las instrucciones van embebidas directamente en el bloque de texto del mensaje del usuario, no como `system` (ver Puntos de acoplamiento).

| Función (`src/lib/receiptParser.js`) | Entrada | Salida | Uso |
|---|---|---|---|
| `extractReceiptProducts(file)` | foto de ticket | `string[]` (solo nombres) | **Sin ningún llamador en producción** (verificado: `grep -rn extractReceiptProducts src/` solo devuelve la propia definición y `receiptParser.test.js`) — código muerto, mantenido solo por su suite de tests |
| `extractReceiptDetail(file)` | foto de ticket | `{ store, date, lines: [{name, price, qty, unit, kind}] }` | Flujo real de despensa (`PantryReceiptFlow.jsx:90`) |
| `extractPantryPhoto(file)` | foto de nevera/despensa | `{ name, qty, unit }[]` (unit ∈ `g\|ml\|ud`, ya en las mismas unidades cerradas que usa `user_pantry`) | Entrada "Foto" del picker de despensa |

**Invariante de revisión humana**: ninguna extracción escribe directamente en `user_pantry`. El docstring de `imageFileToVisionPayload` (`visionImage.js:7`) lo declara explícitamente: *"amounts are necessarily rough guesses from a photo — the caller lets the user correct them before saving"*. En código: `extractReceiptDetail` se llama en `PantryReceiptFlow.jsx:90`, y `addPantryItems` (la escritura real a Supabase) no se llama hasta `PantryReceiptFlow.jsx:160` — hay una pantalla intermedia de edición ("Repasa y confirma", nombrada así en el historial de commits) entre lectura del modelo y persistencia.

**Clasificación `kind`** (`extractReceiptDetail`): cada línea se etiqueta `food`/`prefab`/`nonfood`. Con un filtro de seguridad adicional en código (no solo en el prompt): `isObviousNonFood()` (`receiptParser.js:228`, regex de ~40 palabras: ropa, higiene, limpieza...) fuerza `nonfood` aunque el modelo haya dicho `food` — invariante explícita para que "un producto de bebé mal etiquetado no llegue nunca al flujo de comida/despensa" (comentario en línea 137-139).

**Preparación de imagen** (`src/lib/visionImage.js`): compresión adaptativa cliente-side (canvas → JPEG), hasta 4 intentos progresivos bajando calidad (0.72→0.45) y tamaño máximo de lado (1600px→900px) hasta caber bajo `MAX_BASE64_CHARS = 2.4M` caracteres (~1.8MB binarios) — margen bajo el límite de payload de ~4.5MB de las funciones serverless de Vercel. HEIC (formato nativo de iPhone) se rechaza con mensaje explícito en vez de fallar de forma opaca.

## 2. Modelo de datos

**Ninguna tabla propia.** El resultado final (tras revisión del usuario) se escribe en `user_pantry` vía `addPantryItems()`/`addLocalPantryItems()` (`src/lib/pantry.js`) — ver esquema completo de `user_pantry` en `auth.md`/esquema global. Columnas relevantes al origen OCR: `source` (`'manual'|'voice'|'photo'`, default `'manual'` — sin constraint DB tipo enum, es `text` libre) y `ingredient_normalized` (usada para el matching difuso descrito en `shopping-list.md`).

**No se persiste la imagen del ticket/nevera en ningún sitio** — el `base64` viaja en memoria del navegador → `/api/generate` → Anthropic, y no hay ningún `INSERT` de la imagen ni en Supabase Storage ni en ninguna tabla. Una vez la respuesta vuelve, el `base64` se descarta.

## 3. Dependencias externas

| Servicio | Modelo | Timeout | Fallo → comportamiento |
|---|---|---|---|
| Anthropic (vía `/api/generate`, sin `task`) | `claude-haiku-4-5-20251001` | El de `fetch` por defecto (sin `AbortController` explícito en `postVisionGenerate`, a diferencia de `aiPlanner.js`) | Mensajes de error específicos por causa: 413 → "La foto es demasiado grande"; detalle con `image\|media\|base64\|type` → "No se pudo procesar la imagen"; genérico → `failLabel` pasado por el caller |

Nota: al no pasar `task`, estas tres llamadas **no obtienen ningún `system` prompt** del servidor (`api/generate.js`: `system = task != null ? SYSTEM_PROMPTS[task] : undefined`) — las instrucciones completas (incluida la taxonomía `kind`, el formato de unidades, las reglas de packs) van en el texto del mensaje de usuario. Siguen sujetas al mismo `api/_guard.js` (rate limit, pin de modelo, tope de `max_tokens`) que el resto de tareas.

## 4. Puntos de acoplamiento

- **Comparte `/api/generate` con `menu-generation` y `recipe-catalog`** — cualquier cambio en el guard compartido (`api/_guard.js`) o en el pinning de modelos (`ALLOWED_MODELS`) afecta a los tres dominios simultáneamente. Ver `menu-generation.md`.
- **`extractPantryPhoto` → `user_pantry`**: las unidades de salida (`g|ml|ud`) están acopladas por contrato al conjunto cerrado de unidades que acepta `user_pantry`/`kitchenUnits.js` — un cambio en ese conjunto de unidades exige actualizar el prompt de `extractPantryPhoto` a mano (no hay una fuente única compartida entre el prompt inline y `kitchenUnits.js`).
- **`isObviousNonFood()` es una lista de palabras mantenida a mano** (`receiptParser.js:226`) — un producto no alimenticio nuevo que no case con esas ~40 palabras pasa el filtro y depende enteramente de que el modelo lo haya clasificado bien.
- **`extractReceiptDetail` reconoce cadenas de supermercado españolas por nombre propio en el prompt** (ej. la instrucción explícita sobre "Hipercor"/"Supercor" vs. "El Corte Inglés", `receiptParser.js:116`) — cualquier cadena nueva o cambio de marca comercial requiere editar el prompt a mano; no hay una lista de tiendas conocidas centralizada.

## 5. Deuda técnica visible

1. **`extractReceiptProducts` es código muerto confirmado** — cero llamadores fuera de su propio test. Coste de mantenimiento (llamada real a `/api/generate`, sujeta a rate limit) sin ningún consumidor.
2. **Sin `AbortController`/timeout explícito en `postVisionGenerate`** (a diferencia de `aiPlanner.js`, que sí lo tiene) — una petición de visión colgada no tiene un límite de tiempo propio en el cliente, solo el que imponga la función serverless de Vercel.
3. **Filtro de no-alimentos y reconocimiento de cadenas de supermercado mantenidos como listas/regex a mano** dentro del prompt — no versionados de forma centralizada, no testeados automáticamente contra casos reales conocidos [`receiptParser.test.js` existe — no verificado en esta pasada si cubre estos casos concretos].
4. **Ninguna imagen se conserva** para depuración o para reentrenar/ajustar prompts — un fallo de extracción no deja rastro reproducible más allá de logs de texto.
