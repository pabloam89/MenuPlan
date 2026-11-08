# Plan: Comprar en Mercadona — pulsar «Comprar» y encontrar la lista hecha en la app de Mercadona

Verdict: viable a pequeña escala y sin permiso de Mercadona (10 trozos, sin migraciones); probado con la cuenta de Pablo el 6 nov 2026 (lista de 3 productos, vista en su app), sin probar en el móvil ni con la sesión renovada. Pablo decidió el 8 nov 2026 abrirlo a otras familias antes de tener una API de Mercadona, con las condiciones de «Decisions taken».

Fecha: 8 nov 2026. Base leída: `origin/staging` en `87c0735a` (#1375). Escrito en la forma del estándar de planes de la Fábrica (`standards/plan.md`).

Origen: la conversación con Pablo del 6 al 8 nov 2026 (feedback de un usuario: «el valor es el proceso entero, que me llegue la compra»), la skill `mercadona` (`.claude/skills/mercadona/SKILL.md`) y el README del proyecto no oficial [`ivorpad/mercadona-cli`](https://github.com/ivorpad/mercadona-cli).

## El recorrido que se construye

Solo móvil, con la app de HoMenu y la de Mercadona instaladas. Mientras tanto, las pruebas son con la web de HoMenu en el Android de Pablo (trozo 6), y la app de Mercadona de Android.

- **La primera vez:** «Comprar» → «Entra en tu cuenta de Mercadona. Solo esta vez» (con «HoMenu no guarda tu contraseña») → la página de entrada de Mercadona dentro de HoMenu, con correo y contraseña y el autorrelleno del móvil → spinner «Llenando tu lista en Mercadona…» → se abre la app de Mercadona en la lista.
- **Las demás veces:** «Comprar» → spinner → la app de Mercadona en la lista. La sesión se renueva sola.
- **Si falla:** sesión que no se renueva → vuelve la entrada; Mercadona bloquea → «Ahora no he podido. Tu lista está en HoMenu».
- **Ajustes → Mercadona:** «Rellenar la lista en Mercadona» (interruptor) y «Salir de Mercadona».

## Lo desagradable primero

- **Mercadona no da permiso para esto.** Sus condiciones (`https://tienda.mercadona.es/terms.html`, leídas en la skill) prohíben extraer información «mediante alguna técnica de programación» y el uso comercial sin autorización, y dicen que la contraseña es «personal e intransferible». Puede bloquearlo cuando quiera; el plan lo da por hecho y lo prepara (trozo 10).
- **La primera entrada solo se puede hacer en una página real**, por el captcha de Google (README de `ivorpad/mercadona-cli`: «password login needs a Google reCAPTCHA Enterprise token»). Con «Continuar con Google», Google rechaza un navegador automático (skill, «Lo que falló», 6 nov). En el móvil, la web de Mercadona manda a descargar su app (skill, «En el móvil»; comprobado por Pablo en su Android el 8 nov). La salida es abrir la entrada en versión de ordenador: a mano en Chrome mientras se prueba en la web (trozo 6), y dentro de la app después (trozo 8).
- **No hay app de Android, y se prueba en Android.** `package.json:55-59` trae `@capacitor/ios` y no `@capacitor/android`; Pablo usa Android y hoy prueba con la web de HoMenu. Por eso hay un camino para probar ya en la web (trozo 6) y la app de Android es un trozo propio (7), pendiente de la decisión A.
- **La lista sale mal si la despensa está mal.** «3 cabezas de ajo» se guardó como 3 dientes (15 g): la herramienta solo acepta `ud`, `g`, `kg`, `ml`, `l` (`api/_bot/agente.js:492`) y, para el ajo, una `ud` es un diente de 5 g (`src/lib/kitchenUnits.js:103`). Lo arreglan los trozos 3 y 4.

## Chunks

### 1. Comprobar que la sesión de Mercadona se renueva sola
Files: `scripts/mercadona-navegador.mjs`, `scripts/lib/mercadonaPagina.mjs`, `scripts/mercadona-renovar.test.js`, `.claude/skills/mercadona/SKILL.md`
Depends on: none
Blocked by: none
Existing: lo que se guarda al conectar es `MO-user` del `localStorage` y las cookies que no son `httpOnly` (`src/lib/mercadonaConectar.js:21` y `:34-41`). Ningún código renueva la sesión: `git grep -n -i "refresh\|renov" -- scripts/mercadona-trabajador.mjs scripts/lib/mercadona*.mjs src/lib/mercadona*.js api/_bot/mercadona*.js` → sin salida. La skill tiene «cuánto dura la sesión» como «Sin comprobar». El README de `ivorpad/mercadona-cli` dice que el acceso dura «~6 weeks» y que el token de renovación «renews the session headlessly, forever», sin captcha, y que rota en cada renovación. `ls scripts/mercadona-renovar.test.js` → No such file or directory.
Not done: renovar en el trabajador (trozo 2). Este trozo solo añade `--renovar` al script de la skill: mira si la sesión guardada trae un token de renovación, renueva una vez y dice si el token cambió. Lo corre Pablo con su cuenta, y el resultado (fecha de entrada, si renueva, si rota) se apunta en la skill. Si la sesión no trae token de renovación, el trozo 2 cambia: hay que guardarlo al conectar, y eso se escribe aquí antes de seguir.
Done:
```sh
npx vitest run scripts/mercadona-renovar.test.js && node scripts/mercadona-navegador.mjs --renovar
```

### 2. El trabajador renueva la sesión y guarda la nueva, cerrada
Files: `scripts/lib/mercadonaTrabajador.mjs`, `scripts/lib/mercadonaPagina.mjs`, `scripts/mercadona-trabajador-renovar.test.js`, `api/mercadona.js`, `api/_bot/mercadonaEncargos.js`, `api/_bot/mercadonaSesionNueva.test.js`
Depends on: 1
Blocked by: none
Existing: el trabajador abre la sesión, entra y crea la lista con `entrarEnTienda` (`scripts/lib/mercadonaPagina.mjs:47`) y `crearLista` (`:60`), que importa en `scripts/lib/mercadonaTrabajador.mjs:9`. Al cerrar un encargo solo manda el resultado (`api/mercadona.js`, `accion: "cerrar"`); no hay forma de devolver una sesión nueva. El fallo `sesion_caducada` ya existe (`src/lib/mercadonaFallos.js:5`). `ls api/_bot/mercadonaSesionNueva.test.js scripts/mercadona-trabajador-renovar.test.js` → No such file or directory.
Not done: ninguna migración: la sesión nueva sustituye a la vieja en la misma fila de `mercadona_cuenta` (0131), sellada con la clave pública como hoy (`src/lib/mercadonaSello.js`). Si Mercadona contesta «token no válido», el trabajador renueva una vez y reintenta una vez (la regla «sin bucles» de la skill); si no puede, cierra con `sesion_caducada` y la app pide entrar otra vez. La contraseña no entra en ningún paso.
Done:
```sh
npx vitest run scripts/mercadona-trabajador-renovar.test.js api/_bot/mercadonaSesionNueva.test.js api/_bot/mercadonaEncargos.test.js
```

### 3. Lola apunta piezas en la despensa: cabeza, diente, manojo, bolsa
Files: `api/_bot/agente.js`, `api/_bot/despensa.js`, `api/_bot/despensaPiezas.test.js`
Depends on: none
Blocked by: none
Existing: `anadir_despensa` solo acepta `ud`, `g`, `kg`, `ml`, `l` (`api/_bot/agente.js:492`), y `aStock` pasa todo lo demás a `ud` (`api/_bot/despensa.js:45`). Para el ajo, una `ud` es un diente de 5 g (`src/lib/kitchenUnits.js:103`); el catálogo sí distingue «Cabeza de ajos» por su alias (`src/lib/ingredients.js:117`, `piezaPorAlias`). Resultado visto el 7 nov en la casa de Pablo, entrando por la herramienta (`anadir_despensa`, Lola): «3 cabezas de ajo» salió en «En casa» como 3 ud y 15 g. Reproducido sin modelo con las funciones de verdad (un test de usar y tirar sobre `origin/staging`): `gramsPerPiece("ajo")` → 5; `pieceFor("ajo")` → `{ nombre: "diente", g: 5 }`; `pieceFor("Cabeza de ajos")` → `{ nombre: "cabeza", g: 50 }`; `pieceFor("cabeza de ajo")` → `{ nombre: "diente", g: 5 }` (el alias solo casa escrito tal cual). Cifra: antes, 3 cabezas = 15 g; después, 150 g. Quién más lee o escribe `user_pantry` (`git grep -n "user_pantry" -- src api scripts | grep -v test`): escriben `api/_bot/despensa.js` (Lola), `api/_bot/barridoDespensa.js` (el descuento diario), `src/lib/pantry.js` (la app) y `scripts/backfill-pantry-ingredient-ids.mjs`; leen `api/_bot/generar.js:391`, `api/_bot/menu.js:1688`, `api/_bot/plato.js:183` y `api/_bot/ficha.js:511`. La app ya guarda en g/ml/ud (`toCanonicalStockQty`), así que el fallo es solo de la entrada de Lola. `ls api/_bot/despensaPiezas.test.js` → No such file or directory.
Not done: el recibo con cantidades (trozo 4) y las mayúsculas del nombre guardado (`ingredient_name: e.nombre`, `despensa.js:166`), que es solo estético. La pieza se convierte a gramos con el peso del catálogo (`pieceFor`); si el catálogo no sabe cuánto pesa esa pieza para ese alimento, no se adivina: se guarda en `ud` y el recibo lo dice. El test entra por `anadirDespensa` (lo que llama la herramienta) con «3 cabezas de ajo» y comprueba la fila guardada: 150 g, no 3 ud. El alias se busca sin mayúsculas ni plural, para que «cabeza de ajo» también case. Clase del fallo: una unidad dicha que la herramienta no puede escribir y se aplasta a otra sin avisar.
Done:
```sh
npx vitest run api/_bot/despensaPiezas.test.js api/_bot/despensaTodo.test.js src/lib/kitchenUnits.test.js
```

### 4. Lola dice qué ha apuntado en la despensa, con cantidad y unidad
Files: `api/_bot/despensa.js`, `api/_bot/despensaRecibo.test.js`
Depends on: 3
Blocked by: none
Existing: el recibo lista solo nombres (`api/_bot/despensa.js:198`, `hecho` es `e.nombre`); Lola contestó «Apuntado en la despensa: patatas y ajo» a «1kg de patatas y 3 cabezas de ajo» (captura de Pablo, 7 nov). `ls api/_bot/despensaRecibo.test.js` → No such file or directory.
Not done: la pantalla «En casa» no cambia. Clase del fallo: una escritura que no le devuelve a la persona lo que guardó. Cada línea del recibo lleva lo guardado («patatas, 1 kg»; «ajo, 3 cabezas (150 g)»), así la persona ve al momento si se entendió mal.
Done:
```sh
npx vitest run api/_bot/despensaRecibo.test.js api/_bot/despensaTodo.test.js
```

### 5. «Comprar» en un toque: spinner y la lista abierta en la app de Mercadona
Files: `src/components/ComprarMercadona.jsx`, `src/components/BarraComprar.jsx`, `src/screens/Shopping.jsx`, `src/components/ComprarUnToque.test.jsx`
Depends on: none
Blocked by: none
Existing: hoy «Comprar» abre la hoja «Tu lista en Mercadona» con la lista de productos (`src/screens/Shopping.jsx`, `ComprarSheet`), y el enlace a la lista ya existe (`src/lib/mercadonaList.js:58`, `https://tienda.mercadona.es/shopping-lists/<id>`). La skill dice que los enlaces de Mercadona abren su app. `ls src/components/ComprarUnToque.test.jsx` → No such file or directory.
Not done: la entrada en la cuenta (trozo 6). Con la cuenta ya conectada, pulsar «Comprar» no abre ninguna hoja: el botón enseña un spinner con «Llenando tu lista en Mercadona…» y, al terminar, abre `enlaceDeLista` (en la app nativa, con `@capacitor/app`; en la web, un enlace). Lo que no entró sale en una línea bajo el botón. Sin probar si el enlace abre la lista o la portada de la app de Mercadona (Not verified).
Done:
```sh
npx vitest run src/components/ComprarUnToque.test.jsx src/components/BarraComprar.test.jsx src/components/ComprarMercadona.test.jsx
```

### 6. Conectar Mercadona desde el móvil en la web de HoMenu (Android y Chrome), mientras no haya app
Files: `src/components/ConectarMercadona.jsx`, `src/lib/mercadonaConectar.js`, `src/components/ConectarMercadonaMovil.test.jsx`, `.claude/skills/mercadona/SKILL.md`
Depends on: 1, 5
Blocked by: none
Existing: conectar se explica solo para un ordenador (`src/lib/mercadonaConectar.js:2`: «desde un ordenador»). En el móvil, la web de Mercadona manda a descargar su app (skill, «En el móvil»; visto por Pablo en su Android el 8 nov). Las pruebas de hoy son con la web de HoMenu en el Android de Pablo. `ls src/components/ConectarMercadonaMovil.test.jsx` → No such file or directory.
Not done: la app nativa (trozos 7 y 8). Es el camino para probar ya, no el del producto. En un móvil, la pantalla de conectar da tres pasos: abrir tienda.mercadona.es en Chrome con «Sitio de ordenador», entrar con correo y contraseña, y lanzar el marcador escribiendo su nombre en la barra de direcciones. El marcador, la sesión sellada y `guardarSesion` no cambian. Sin comprobar que un marcador se lance así en el Chrome de Android (Not verified). Este trozo escribe en la skill la excepción a «sin disfraces» (la versión de ordenador, solo para la página de entrada): es rebajar una regla de `.claude/`, así que el PR lleva la decisión de Pablo del 8 nov y necesita su Approve (C13).
Done:
```sh
npx vitest run src/components/ConectarMercadonaMovil.test.jsx src/components/ConectarMercadona.test.jsx
```

### 7. La app de HoMenu para Android
Files: `package.json`, `package-lock.json`, `capacitor.config.json`, `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `scripts/android-app.test.js`
Depends on: none
Blocked by: A
Existing: `package.json:55-59` trae `@capacitor/ios` y no `@capacitor/android`; `ls android` → No such file or directory. `capacitor.config.json:2` tiene `"appId": "com.homenu.app"`. Pablo y las pruebas van en Android.
Not done: publicarla en Google Play (decisión A) y la entrada en Mercadona (trozo 8). Este trozo crea el proyecto Android con Capacitor, con el mismo `appId`, y lo deja instalable a mano en un móvil. Toca `package.json`, que es de la puerta: solo añade dependencias, no cambia scripts ni checks (C13 se mantiene); si pone `tests` en rojo, se revierte el PR desde una rama nueva.
Done:
```sh
npx vitest run scripts/android-app.test.js && npx cap sync android
```

### 8. Entrar en Mercadona desde la app de HoMenu (Android e iPhone), sin marcador
Files: `src/lib/mercadonaEntrarApp.js`, `src/lib/mercadonaEntrarApp.test.js`, `src/components/ConectarMercadona.jsx`, `src/components/ConectarMercadona.test.jsx`, `package.json`, `package-lock.json`, `ios/App/Podfile`
Depends on: 2, 6, 7
Blocked by: none
Existing: `@capacitor/browser` (`package.json:56`) abre el navegador del sistema y no deja leer la página, así que no sirve para guardar la sesión. `ls src/lib/mercadonaEntrarApp.js` → No such file or directory.
Not done: la entrada se abre en una ventana web dentro de la app, en versión de ordenador (decisión de Pablo, 8 nov), solo para esta página. La persona escribe su correo y su contraseña en la página de Mercadona; la app no lee esas casillas. Al entrar, la app lee `MO-user` y las cookies, las sella con `mercadonaSello.js` y las guarda con `guardarSesion`, como el marcador. Con «Continuar con Google» no funciona (lo rechaza Google): la pantalla lo dice y enlaza a «¿Has olvidado tu contraseña?». El plugin para leer la página se elige en este trozo y se escribe en el PR. Toca `package.json`, que es de la puerta: solo añade una dependencia, no cambia scripts ni checks (C13 se mantiene); si pone `tests` en rojo, se revierte el PR desde una rama nueva.
Done:
```sh
npx vitest run src/lib/mercadonaEntrarApp.test.js src/components/ConectarMercadona.test.jsx
```

### 9. Ajustes → Mercadona: rellenar la lista o no, y salir
Files: `src/components/AjustesMercadona.jsx`, `src/components/AjustesMercadona.test.jsx`, `src/screens/Settings.jsx`
Depends on: 6
Blocked by: none
Existing: Ajustes no tiene nada de Mercadona (`grep -c -i mercadona src/screens/Settings.jsx` → 0). Desconectar ya existe en el endpoint (`quitarCuenta` en `src/lib/mercadonaApp.js`, `desconectar` en `api/mercadona.js`). `ls src/components/AjustesMercadona.jsx` → No such file or directory.
Not done: «Avisar cuando esté lista», que necesita notificaciones de la app (no comprobadas). El interruptor «Rellenar la lista en Mercadona» es el estado de la cuenta: encendido si está conectada, y apagarlo es salir; no se guarda un dato aparte. Textos en infinitivo: «Rellenar la lista en Mercadona», «Salir de Mercadona». Vale igual en la web y en la app.
Done:
```sh
npx vitest run src/components/AjustesMercadona.test.jsx
```

### 10. Abrirlo a otras familias, con interruptor de apagado y alarma de bloqueos
Files: `api/_bot/mercadonaEncargos.js`, `api/_bot/mercadonaApagado.test.js`, `api/mercadona.js`, `src/components/ConectarMercadona.jsx`, `.claude/skills/mercadona/SKILL.md`
Depends on: 2, 8, 9
Blocked by: none
Existing: solo pueden usarlo las casas de `MERCADONA_CASAS` (`api/_bot/mercadonaEncargos.js:45`, `casaPermitida`). El fallo `bloqueado` ya existe (`src/lib/mercadonaFallos.js:5`), pero nadie lo cuenta ni apaga nada. Hay un tope por casa y día («Has pedido muchas listas hoy», `TEXTO_NO_ENCARGADO` en `src/lib/mercadonaApp.js`). `ls api/_bot/mercadonaApagado.test.js` → No such file or directory.
Not done: escribir a Mercadona para pedir acceso (lo hace Pablo). Cambia `MERCADONA_CASAS` por un apagado general: con `MERCADONA_APAGADO=1` nadie encarga, y la app enseña la lista en HoMenu. Si en las últimas 24 h hay 3 o más encargos con `bloqueado`, se deja de encargar solo y se avisa a Pablo. La pantalla de entrada lleva una frase honesta: «Mercadona podría pedirte que vuelvas a entrar o limitar este servicio. Tu cuenta y tus pedidos no cambian». La skill cambia su regla de cuentas («antes de abrirlo a otra familia: visto bueno de Mercadona o de un abogado») en el mismo PR: es rebajar una regla de `.claude/`, así que lleva la decisión de Pablo del 8 nov y necesita su Approve (C13).
Done:
```sh
npx vitest run api/_bot/mercadonaApagado.test.js api/_bot/mercadonaEncargos.test.js
```

## Decisions for Pablo

### A. ¿Hacemos ya la app de HoMenu para Android?
1. Sí, sin publicarla: se instala a mano en vuestros móviles para probar, gratis (recommended)
2. Sí, y publicarla en Google Play, con la cuenta de desarrollador de pago (unos 25 $ una vez)
3. No por ahora: seguir probando en la web de HoMenu con el marcador del trozo 6

## Decisions taken

- principio 6 | eligió: abrir Comprar en Mercadona a otras familias antes de tener una API de Mercadona (Pablo, 8 nov 2026: «habrá que intentarlo hasta que nos den API») | descartó: esperar al permiso de Mercadona, que puede no llegar nunca | motivo: decidido
- principio 6 | eligió: la primera entrada en versión de ordenador, solo para la página de entrada (Pablo, 8 nov 2026) | descartó: entrar solo desde un ordenador con el marcador, porque los usuarios solo tienen el móvil | motivo: decidido
- principio 4 | eligió: la contraseña vive solo en la cuenta de Mercadona; HoMenu guarda la sesión | descartó: guardar también la contraseña en el servidor o en el móvil, una segunda copia que además no sirve (volver a entrar pide el captcha) | motivo: decidido
- principio 1 | eligió: no esconder que es automático (una sola IP, sin cambiar de servidor por cuenta, sin esquivar captchas) | descartó: repartir cuentas entre varios servidores para que no se note, que es maquillar lo que hacemos ante Mercadona | motivo: decidido
- principio 4 | eligió: el interruptor de Ajustes es el estado de la cuenta conectada | descartó: un dato aparte «rellenar sí o no», que diría lo mismo que tener o no la cuenta | motivo: decidido
- principio 4 | eligió: la pieza dicha («cabeza») se convierte con el peso del catálogo (`piezaPorAlias`) | descartó: una tabla de pesos propia en `despensa.js`, que sería una segunda fuente | motivo: decidido

## Not verified

- La renovación «para siempre» y las seis semanas salen del README de un proyecto no oficial; el trozo 1 lo comprueba con la cuenta de Pablo.
- Que la página de entrada en versión de ordenador deje entrar dentro de una app en el móvil (ni en el Chrome de Pablo ni en la app).
- Si `https://tienda.mercadona.es/shopping-lists/<id>` abre la app de Mercadona en la lista o en su portada.
- Una lista de unos 30 productos, varias familias a la vez y qué hace Mercadona con el uso repetido (la skill: «Dos pasadas no demuestran que no vayan a bloquearlo»).
- Que un marcador se lance en el Chrome de Android escribiendo su nombre en la barra de direcciones (trozo 6).
- La app de Android: no existe hasta el trozo 7, que espera la decisión A.
- Aguacate y espárragos aparecieron en «En casa» sin que Pablo los apuntara (7 nov). Hipótesis sin comprobar: la devolución a la despensa al activarse el menú nuevo (`src/lib/activarSolo.js:50`). Necesita leer `user_pantry` con el usuario de solo lectura antes de ser un trozo.
- Evals de Lola en los trozos 3 y 4: no las lanza ninguna sesión (Pablo, 2 nov 2026); las corre Pablo si quiere.
