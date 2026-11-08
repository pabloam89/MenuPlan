# Plan: Comprar en Mercadona — pulsar «Comprar» y encontrar la lista hecha en la app de Mercadona

Verdict: viable a pequeña escala y sin permiso de Mercadona (11 trozos, sin migraciones nuevas; el 11, encenderlo en producción, va primero; la 0131 la aplicó Pablo el 8 nov por la tarde); probado con la cuenta de Pablo el 6 nov 2026 (lista de 3 productos, vista en su app), sin probar en el móvil ni con la sesión renovada. Pablo decidió el 8 nov 2026 abrirlo a otras familias antes de tener una API de Mercadona, con las condiciones de «Decisions taken».

Fecha: 8 nov 2026. Base leída: `origin/staging` en `87c0735a` (#1375); revisado contra `origin/staging` en `468ea792` (#1380), la base de producción y las variables de Vercel el mismo día, por la tarde. Escrito en la forma del estándar de planes de la Fábrica (`standards/plan.md`).

Origen: la conversación con Pablo del 6 al 8 nov 2026 (feedback de un usuario: «el valor es el proceso entero, que me llegue la compra»), la skill `mercadona` (`.claude/skills/mercadona/SKILL.md`) y el README del proyecto no oficial [`ivorpad/mercadona-cli`](https://github.com/ivorpad/mercadona-cli).

## El recorrido que se construye

Solo móvil y **sobre todo en las apps** (Pablo, 8 nov 2026: el 99 % del tráfico es móvil y la web desaparecerá): **primero la app de iPhone** (los cofundadores tienen iPhone; ya es nativa, con Capacitor: `ios/`, `@capacitor/ios` en `package.json:58`), **luego la de Android** cuando la app nativa exista (otra sesión). Nada se hace desde un ordenador. Pulsar «Comprar» es comprar online en Mercadona: no se pregunta dónde se compra. Se prueba en producción, `https://homenu.vercel.app` (Pablo, 8 nov 2026), que es la web que cargan las apps.

- **La primera vez:**
  1. «Comprar · 87 €».
  2. Una hoja, «Tu lista en Mercadona», con lo que HoMenu podrá hacer: los dos interruptores de Ajustes, «Rellenar la lista en Mercadona» (encendido) y «Pagar la compra» (apagado, «Pronto», no se puede encender); debajo, «HoMenu no ve ni guarda tu contraseña» y el botón «Entrar en Mercadona». Los permisos quedan claros antes de entrar, y son los mismos que luego se cambian en Ajustes (Pablo, 8 nov).
  3. La página de entrada de Mercadona, dentro de HoMenu, en versión de ordenador (la app la pide así sola): correo y contraseña, con el autorrelleno del móvil.
  4. Al entrar, la página se cierra sola y vuelve a Compra con spinner: «Rellenando tu lista en Mercadona…».
  5. «Listo: 23 productos en tu lista de Mercadona» (y «2 sin producto: burrata, pesto» si hace falta). Botón «Abrir Mercadona»: abre la app de Mercadona en la lista. Allí la persona pasa la lista al carro, elige hora y paga.
- **Las demás veces:** «Comprar» → spinner → «Abrir Mercadona». La sesión se renueva sola. La app de Mercadona se abre con ese toque y no sola: un móvil no deja abrir otra app sin un gesto de la persona (Not verified).
- **Si falla:** sesión que no se renueva → vuelve la hoja del paso 2 («Vuelve a entrar en Mercadona»); Mercadona bloquea → «Ahora no he podido. Tu lista está en HoMenu»; entraba con Google → la hoja lo dice y enlaza a «¿Has olvidado tu contraseña?» de Mercadona.
- **Ajustes → Mercadona** (Pablo, 8 nov), en el perfil: los mismos dos interruptores; apagar «Rellenar la lista» es salir.
- **En la web** (sin app): la hoja enseña los interruptores y dice que para entrar en Mercadona se abra la app de HoMenu. El marcador de ordenador sigue donde está, sin cambios, pero no es un camino del producto.

## Lo desagradable primero

- **Mercadona no da permiso para esto.** Sus condiciones (`https://tienda.mercadona.es/terms.html`, leídas en la skill) prohíben extraer información «mediante alguna técnica de programación» y el uso comercial sin autorización, y dicen que la contraseña es «personal e intransferible». Puede bloquearlo cuando quiera; el plan lo da por hecho y lo prepara (trozo 10).
- **La primera entrada solo se puede hacer en una página real**, por el captcha de Google (README de `ivorpad/mercadona-cli`: «password login needs a Google reCAPTCHA Enterprise token»). Con «Continuar con Google», Google rechaza un navegador automático (skill, «Lo que falló», 6 nov). En el móvil, la web de Mercadona manda a descargar su app (skill, «En el móvil»; comprobado por Pablo en su Android el 8 nov). La salida es abrir la entrada en versión de ordenador dentro de la app: en iPhone (trozo 8) y en Android cuando exista su app nativa (trozo 7).
- **Comprar en Mercadona no estaba encendido en ningún sitio.** Al revisar el plan (8 nov 2026, tarde), el proyecto `homenu` de Vercel no tenía ninguna variable `MERCADONA_*` en ningún entorno (78 entradas, ninguna con `MERCADONA`), aunque el código las lee (`api/mercadona.js:32` y `:68`, `api/_bot/mercadonaEncargos.js:45`) y la skill las daba por puestas. Ese mismo día Pablo puso las tres en Production y volvió a desplegar; el trabajador del servidor dejó de recibir `HTTP 401` en cuanto acabó el despliegue que empezó a las 18:38 UTC (último 401 a las 18:42:26). Es el trozo 11.
- **La migración 0131 no estaba aplicada al revisar el plan.** Sus tablas no existían: `npm run consulta -- "select to_regclass('public.mercadona_cuenta'), to_regclass('public.mercadona_encargo')"` → `null`, `null` (8 nov 2026, tarde). Sin ella, encargar contesta `sin_servicio` («Esto aún no está en marcha») aunque estén las variables. La aplicó Pablo ese mismo día con ensayo y `--si --pablo`; después, la misma consulta → `'mercadona_cuenta'`, `'mercadona_encargo'`, y `node scripts/verificar-estado.mjs --solo 0131` → `aplicada 14/14`.
- **El trabajador no estaba en marcha.** La imagen y el runbook estaban (`ops/mercadona-trabajador/compose.yaml`, skill `mercadona`, «Levantar el trabajador»), pero nadie lo había levantado. Pablo lo levantó el 8 nov por la tarde (`docker compose ps` → `Up`; `docker compose logs` → `en marcha`), con su `.env` en `/opt/mercadona/` y las claves creadas en el servidor.
- **La app de Android de Google Play no sirve para entrar en Mercadona.** Es una TWA, la web de producción a pantalla completa (`public/.well-known/assetlinks.json`, paquete `com.homenu.app`), y su código no está en el repo; una TWA es Chrome por dentro y no puede abrir la página de Mercadona y leerla. Sí sirve para «Comprar» una vez conectada la cuenta, porque es la misma web. La app nativa de Android la lleva otra sesión (Pablo, 8 nov 2026); este plan solo depende de ella en el trozo 7.
- **La lista sale mal si la despensa está mal.** «3 cabezas de ajo» se guardó como 3 dientes (15 g): la herramienta solo acepta `ud`, `g`, `kg`, `ml`, `l` (`api/_bot/agente.js:492`) y, para el ajo, una `ud` es un diente de 5 g (`src/lib/kitchenUnits.js:103`). Lo arreglan los trozos 3 y 4.

## Chunks

### 1. Comprobar que la sesión de Mercadona se renueva sola
Files: `scripts/mercadona-navegador.mjs`, `scripts/lib/mercadonaPagina.mjs`, `scripts/mercadona-renovar.test.js`, `.claude/skills/mercadona/SKILL.md`
Depends on: 8, 11
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
Files: `src/components/ComprarMercadona.jsx`, `src/components/BarraComprar.jsx`, `src/screens/Shopping.jsx`, `src/components/useRellenarMercadona.js`, `src/lib/mercadonaApp.js`, `src/components/ComprarUnToque.test.jsx`
Depends on: 6, 9, 11
Blocked by: none
Existing: con la cuenta conectada, «Comprar» ya va directo, sin hoja (#1371): `comprar` en `src/screens/Shopping.jsx:806-808` llama a `mercadona.rellenar()`, y el botón pasa por «Rellenando…» y «Abrir lista» (`PASO_COMPRAR` en `src/lib/mercadonaApp.js`, `pasoDeComprar` en `src/components/useRellenarMercadona.js`), con el enlace a la lista (`src/lib/mercadonaList.js:58`, `https://tienda.mercadona.es/shopping-lists/<id>`). La hoja solo sale sin cuenta, si la sesión caducó o al tocar el importe. Lo que dice el encargo acabado ya existe (`textoDeEncargo`, «Lista creada con N productos. M no han entrado.»). La skill dice que los enlaces de Mercadona abren su app. `ls src/components/ComprarUnToque.test.jsx` → No such file or directory.
Not done: la entrada en la cuenta (trozo 6). Lo que cambia es la forma: spinner en el botón mientras se rellena, con «Rellenando tu lista en Mercadona…» debajo; al acabar, «Listo: N productos en tu lista de Mercadona» y el botón «Abrir Mercadona» (hoy «Abrir lista»). La app de Mercadona se abre con ese toque, no sola al terminar: un enlace que salta a otra app necesita un gesto de la persona (Not verified en Chrome de Android y en la app de iPhone). Lo que no entró sale en una línea bajo el botón. Sin probar si el enlace abre la lista o la portada de la app de Mercadona (Not verified).
Done:
```sh
npx vitest run src/components/ComprarUnToque.test.jsx src/components/BarraComprar.test.jsx src/components/ComprarMercadona.test.jsx
```

### 6. La hoja de la primera vez: qué podrá hacer HoMenu, y entrar
Files: `src/components/ConectarMercadona.jsx`, `src/components/ComprarMercadona.jsx`, `src/components/AjustesMercadona.jsx`, `src/components/ConectarMercadonaHoja.test.jsx`
Depends on: 9
Blocked by: none
Existing: hoy la hoja dice «Conecta tu cuenta una vez y yo te relleno la lista» y «Arrastra el botón a tu barra de marcadores» (`src/components/ConectarMercadona.jsx:15` y `:21`): jerga que Pablo rechazó el 8 nov, y un gesto que en un móvil no existe; en un móvil solo dice «Se hace una sola vez, desde un ordenador» (`:16`). Los interruptores de Ajustes son `AjustesMercadona` (trozo 9). `ls src/components/ConectarMercadonaHoja.test.jsx` → No such file or directory.
Not done: entrar desde la app (trozo 8); hasta entonces el botón «Entrar en Mercadona» no sale. La hoja usa el mismo componente que Ajustes (`AjustesMercadona`), no una copia: los permisos se ven igual en los dos sitios. Sin cuenta, la parte de Comprar que rellena (`RellenarMercadona`, `src/components/ComprarMercadona.jsx:11`) pinta `AjustesMercadona` con «Rellenar la lista» ya encendido, y `AjustesMercadona` pinta debajo la forma de entrar (`Conectar`); en Ajustes el mismo interruptor empieza en el estado de la cuenta. Textos: «Tu lista en Mercadona», «HoMenu no ve ni guarda tu contraseña», «Entrar en Mercadona»; con la sesión caducada, «Vuelve a entrar en Mercadona». Con «Rellenar la lista» apagado no hay nada que hacer: el botón no sale. En la web, en lugar del botón, «Para entrar en Mercadona, abre la app de HoMenu». El marcador de ordenador se queda como está, sin textos nuevos. Pablo descartó el 8 nov el camino de Chrome con «Sitio de ordenador» y marcador en el móvil: demasiados pasos para una familia, y la web desaparecerá.
Done:
```sh
npx vitest run src/components/ConectarMercadonaHoja.test.jsx src/components/ConectarMercadona.test.jsx
```

### 7. Entrar en Mercadona desde la app de Android
Files: `src/lib/mercadonaEntrarApp.js`, `src/lib/mercadonaEntrarAndroid.test.js`, `android/app/src/main/AndroidManifest.xml`
Depends on: 8
Blocked by: none
Existing: `ls android` en `origin/staging` → No such file or directory; la app de Google Play es hoy una TWA (`public/.well-known/assetlinks.json`, paquete `com.homenu.app`), que no puede abrir otra web dentro y leerla.
Not done: la app de Android en sí, que construye otra sesión fuera de este plan (rama `feat/app-android`; Pablo, 8 nov 2026): hasta que exista, este trozo no empieza. Cuando exista, este trozo enciende para Android lo que el 8 hace en iPhone (el mismo `mercadonaEntrarApp.js`) y añade lo que pida el complemento en el manifiesto. El complemento ya lo añade el 8 a `package.json`. `mercadonaEntrarAndroid.test.js` comprueba que en Android se abre la misma página, con el mismo puente y la versión de ordenador, y que el manifiesto deja abrirla; `ls src/lib/mercadonaEntrarAndroid.test.js` → No such file or directory.
Done:
```sh
npx vitest run src/lib/mercadonaEntrarAndroid.test.js && npx cap sync android
```

### 8. Entrar en Mercadona desde la app de iPhone, sin marcador
Files: `src/lib/mercadonaEntrarApp.js`, `src/lib/mercadonaEntrarApp.test.js`, `src/components/ConectarMercadona.jsx`, `src/components/ConectarMercadona.test.jsx`, `package.json`, `package-lock.json`, `ios/App/CapApp-SPM/Package.swift`, `.claude/skills/mercadona/SKILL.md`
Depends on: 6, 11
Blocked by: none
Existing: `@capacitor/browser` (`package.json:56`) abre el navegador del sistema y no deja leer la página, así que no sirve para guardar la sesión. La app de iPhone ya es Capacitor y está en la App Store (`ios/App/`, `@capacitor/ios` en `package.json:58`, complementos por Swift Package Manager en `ios/App/CapApp-SPM/Package.swift`; versión 1.1 en el PR #1381). El complemento `@capgo/capacitor-inappbrowser` (v8, para Capacitor 8, licencia MPL-2.0; leído en su README el 8 nov) abre una página dentro de la app (`openWebView`), con `customUserAgent`, aviso de cambio de dirección (`urlChangeEvent`), `executeScript`, `getCookies` con `includeHttpOnly` y `close`. `ls src/lib/mercadonaEntrarApp.js` → No such file or directory.
Not done: Android (trozo 7). «Entrar en Mercadona» abre la página de entrada dentro de la app, en versión de ordenador (`customUserAgent`; decisión de Pablo, 8 nov), solo para esta página. La persona escribe su correo y su contraseña en la página de Mercadona; la app no lee esas casillas. Cuando la dirección deja la de entrada, la app lee `MO-user` (`executeScript`) y las cookies (`getCookies`), cierra la ventana, las sella con `mercadonaSello.js` y las guarda con `guardarSesion`, como el marcador; y encarga la lista. La versión nueva de la app pasa por la revisión de Apple (1–2 días; la envía Pablo con el workflow de iOS). Este trozo escribe en la skill la excepción a «sin disfraces» (la versión de ordenador, solo para la página de entrada): es rebajar una regla de `.claude/`, así que el PR lleva la decisión de Pablo del 8 nov y necesita su Approve (C13). Toca `package.json`, que es de la puerta: solo añade una dependencia, no cambia scripts ni checks (C13 se mantiene); si pone `tests` en rojo, se revierte el PR desde una rama nueva.
Done:
```sh
npx vitest run src/lib/mercadonaEntrarApp.test.js src/components/ConectarMercadona.test.jsx
```

### 9. Ajustes → Mercadona: hacer la lista y pagar (apagado)
Files: `src/components/AjustesMercadona.jsx`, `src/components/AjustesMercadona.test.jsx`, `src/lib/mercadonaApp.js`, `src/screens/HomeProfileScreen.jsx`, `src/screens/HomeProfileScreen.mercadona.test.jsx`
Depends on: none
Blocked by: none
Existing: los ajustes que ve la familia son la pantalla de perfil (`src/screens/HomeProfileScreen.jsx`, filas como «Formas de entrar», que abren una hoja con interruptores); `SettingsScreen` (`src/screens/Settings.jsx`) solo se pinta con `screen === "settings"` y ningún botón lleva ahí (`grep -n 'setScreen("settings")' src/App.jsx` → solo la vuelta desde «account»). Ninguna de las dos tiene nada de Mercadona (`grep -c -i mercadona src/screens/Settings.jsx src/screens/HomeProfileScreen.jsx` → 0 y 0). Desconectar ya existe en el endpoint (`quitarCuenta` en `src/lib/mercadonaApp.js`, `desconectar` en `api/mercadona.js`) y en la hoja de Comprar («Desconectar mi cuenta de Mercadona», `src/components/ComprarMercadona.jsx:48`). `ls src/components/AjustesMercadona.jsx` → No such file or directory.
Not done: «Avisar cuando esté lista», que necesita notificaciones de la app (no comprobadas), y pagar de verdad. Dos interruptores (Pablo, 8 nov). «Rellenar la lista en Mercadona» es el estado de la cuenta: encendido si está conectada; encenderlo lleva a entrar en Mercadona y apagarlo es salir; no se guarda un dato aparte. «Pagar la compra» se pinta apagado, sin poder encenderse y con «Pronto»: no se guarda nada, porque no habría quién lo leyera (un dato sin lector); cuando un plan propio pruebe el carrito y el pago, ese plan le da su dato y su lector. Apagar «Rellenar la lista» es salir: no hace falta un botón «Salir de Mercadona» aparte (Pablo, 8 nov: simplicidad). La fila «Mercadona» solo sale si el servicio está abierto para la casa (`servicio` de `useRellenarMercadona`), y abre una hoja como «Formas de entrar». Los textos van en `AJUSTE_MERCADONA` de `src/lib/mercadonaApp.js`, junto a `PASO_COMPRAR`. Vale igual en la web y en la app. El test comprueba que «Pagar la compra» no se puede encender y que no llama a nada.
Done:
```sh
npx vitest run src/components/AjustesMercadona.test.jsx src/screens/HomeProfileScreen.mercadona.test.jsx
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

### 11. Encender Comprar en Mercadona en producción
Files: `.claude/skills/mercadona/SKILL.md`
Depends on: none
Blocked by: none
Existing: al empezar el 8 nov 2026, el proyecto `homenu` de Vercel no tenía ninguna variable `MERCADONA_*` (78 entradas, ninguna con `MERCADONA`); esa tarde Pablo puso las tres en Production, la 0131 quedó aplicada y el trabajador quedó en marcha en el servidor. Falta el Done: un encargo `hecho`, que necesita entrar en la cuenta desde la app (trozo 8). El código lee `MERCADONA_TRABAJADOR_TOKEN` (`api/mercadona.js:32`), `MERCADONA_CLAVE_PUBLICA` (`:68`) y `MERCADONA_CASAS` (`api/_bot/mercadonaEncargos.js:45`); el trabajador lee `MERCADONA_API` (`scripts/mercadona-trabajador.mjs:5` y `:70`). La skill dice que están en Vercel.
Not done: ningún cambio de código. Lo hace Pablo, porque son secretos (CLAUDE.md). La 0131 ya está aplicada (8 nov). En Vercel, entorno Production, `MERCADONA_TRABAJADOR_TOKEN`, `MERCADONA_CLAVE_PUBLICA` y `MERCADONA_CASAS` (su casa), con la skill `alta-de-secreto`; en el servidor, `MERCADONA_API=https://homenu.vercel.app/api/mercadona` en `/opt/mercadona/.env` y levantar el trabajador, o reiniciarlo si ya corría (skill `mercadona`, «Levantar el trabajador»; skill `hetzner`). Antes del Done, Pablo pulsa «Comprar» en `https://homenu.vercel.app`. Un encargo solo llega a `hecho` si el trabajador lo cerró con su token, y solo producción tendrá `MERCADONA_TRABAJADOR_TOKEN` (`api/mercadona.js:32`): así el Done prueba las tres variables, el token y que el trabajador apunta a producción. La skill pasa a decir que se prueba en producción y deja de dar las variables por puestas. Las cuentas que se conecten en producción se guardan en la misma base (solo hay una), selladas con la misma clave pública.
Done:
```sh
for v in MERCADONA_TRABAJADOR_TOKEN MERCADONA_CLAVE_PUBLICA MERCADONA_CASAS; do npx vercel env ls production | grep -q "$v" || exit 1; done && npm run -s consulta -- "select status from mercadona_encargo order by created_at desc limit 1" | grep hecho
```

## Decisions taken

- principio 6 | eligió: probar Comprar en Mercadona en producción, `https://homenu.vercel.app` (Pablo, 8 nov 2026) | descartó: probar en staging, que Pablo ya no usa para esto | motivo: decidido
- principio 6 | eligió: que la app de Android la construya otra sesión (Pablo, 8 nov 2026) | descartó: construirla desde este plan, que chocaría en `android/` con esa otra sesión | motivo: decidido
- principio 6 | eligió: abrir Comprar en Mercadona a otras familias antes de tener una API de Mercadona (Pablo, 8 nov 2026: «habrá que intentarlo hasta que nos den API») | descartó: esperar al permiso de Mercadona, que puede no llegar nunca | motivo: decidido
- principio 6 | eligió: la primera entrada en versión de ordenador, solo para la página de entrada (Pablo, 8 nov 2026) | descartó: entrar solo desde un ordenador con el marcador, porque los usuarios solo tienen el móvil | motivo: decidido
- principio 4 | eligió: la contraseña vive solo en la cuenta de Mercadona; HoMenu guarda la sesión | descartó: guardar también la contraseña en el servidor o en el móvil, una segunda copia que además no sirve (volver a entrar pide el captcha) | motivo: decidido
- principio 1 | eligió: no esconder que es automático (una sola IP, sin cambiar de servidor por cuenta, sin esquivar captchas) | descartó: repartir cuentas entre varios servidores para que no se note, que es maquillar lo que hacemos ante Mercadona | motivo: decidido
- principio 4 | eligió: el interruptor «Rellenar la lista en Mercadona» es el estado de la cuenta conectada | descartó: un dato aparte «rellenar sí o no», que diría lo mismo que tener o no la cuenta | motivo: decidido
- principio 6 | eligió: empezar solo con la lista; «Pagar la compra» se ve en Ajustes desde el principio, apagado y sin poder encenderse (Pablo, 8 nov 2026) | descartó: pagar ya, con o sin confirmación, y no enseñar el ajuste | motivo: decidido
- principio 4 | eligió: «Pagar la compra» sin dato guardado hasta que exista el pago | descartó: guardar ya un «pagar sí o no» que nadie lee | motivo: decidido
- principio 4 | eligió: apagar «Rellenar la lista en Mercadona» es salir, sin botón «Salir de Mercadona» aparte | descartó: un botón que haría lo mismo que el interruptor, dos sitios para una sola acción | motivo: decidido
- principio 6 | eligió: pulsar «Comprar» es comprar online en Mercadona, sin preguntar dónde se compra (Pablo, 8 nov 2026) | descartó: «¿Dónde haces la compra?» con tienda u online | motivo: decidido
- principio 6 | eligió: primero la app de iPhone y luego la de Android; nada desde un ordenador ni desde Chrome con marcador (Pablo, 8 nov 2026: los cofundadores tienen iPhone y la web desaparecerá) | descartó: guiar a la familia por Chrome con «Sitio de ordenador» y un marcador, seis pasos a mano | motivo: decidido
- principio 4 | eligió: la hoja de la primera vez enseña los mismos interruptores que Ajustes, con el mismo componente (Pablo, 8 nov 2026: los permisos, claros desde el primer recorrido) | descartó: una copia de los interruptores para la hoja, dos sitios que se pueden separar | motivo: decidido
- principio 1 | eligió: entrar con la página real de Mercadona abierta dentro de la app (`@capgo/capacitor-inappbrowser`, v8, MPL-2.0), donde la persona ve que escribe en Mercadona | descartó: una pantalla nuestra que pida correo y contraseña y entre por detrás, que escondería que la contraseña pasa por HoMenu | motivo: decidido
- principio 1 | eligió: Ajustes → Mercadona en el perfil (`HomeProfileScreen.jsx`), que es el ajuste que ve la familia | descartó: `Settings.jsx`, donde el ajuste estaría en el código sin que ninguna familia pudiera verlo: parecería hecho sin estarlo | motivo: decidido
- principio 4 | eligió: «rellenar» para lo que hace HoMenu en la lista de Mercadona, en la UI («Rellenar la lista», «Rellenando…»), en el código (`useRellenarMercadona`) y en los datos (`mercadona_encargo.status` = `rellenando`) (Pablo, 8 nov 2026: una palabra, un significado) | descartó: «hacer», «llenar» y «rellenar» a la vez para lo mismo | motivo: decidido
- principio 4 | eligió: la pieza dicha («cabeza») se convierte con el peso del catálogo (`piezaPorAlias`) | descartó: una tabla de pesos propia en `despensa.js`, que sería una segunda fuente | motivo: decidido

## Not verified

- La renovación «para siempre» y las seis semanas salen del README de un proyecto no oficial; el trozo 1 lo comprueba con la cuenta de Pablo.
- Que la página de entrada en versión de ordenador deje entrar dentro de una app en el móvil.
- El trozo 1 espera al 8: sin entrar desde la app no hay sesión que renovar, y los dos escriben en la skill.
- Que `@capgo/capacitor-inappbrowser` lea `MO-user` y las cookies de la página de Mercadona en iPhone: solo se ha leído su README.
- Si `https://tienda.mercadona.es/shopping-lists/<id>` abre la app de Mercadona en la lista o en su portada.
- Que un enlace a otra app solo se abra con un toque de la persona (por eso el botón «Abrir Mercadona» y no abrirla sola), en Chrome de Android y en la app de iPhone.
- Una lista de unos 30 productos, varias familias a la vez y qué hace Mercadona con el uso repetido (la skill: «Dos pasadas no demuestran que no vayan a bloquearlo»).
- La app de Android: no existe; la construye otra sesión.
- Los nombres de las variables de Vercel se han mirado; sus valores, no.
- Aguacate y espárragos aparecieron en «En casa» sin que Pablo los apuntara (7 nov). Hipótesis sin comprobar: la devolución a la despensa al activarse el menú nuevo (`src/lib/activarSolo.js:50`). Necesita leer `user_pantry` con el usuario de solo lectura antes de ser un trozo.
- Evals de Lola en los trozos 3 y 4: no las lanza ninguna sesión (Pablo, 2 nov 2026); las corre Pablo si quiere.
