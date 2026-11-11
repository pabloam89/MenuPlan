---
name: mercadona
description: Úsala al probar o tocar que un agente rellene una lista en una cuenta de Mercadona (`scripts/mercadona-navegador.mjs`), al entrar en una cuenta con navegador real, si Mercadona o Google rechazan el login, o antes de abrirlo a otra familia. No para: el catálogo y sus precios semanales (cron `mercadona-sync`), el emparejador de ingredientes (regla catalogo) ni el servidor en sí (hetzner).
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: pablo
  comprobado: "2026-11-06"
---

# Mercadona (rellenar una lista con un navegador real)

## Qué es

Prototipo: un navegador real hace la compra en la cuenta de la persona, **hasta
donde ella lo haya encendido**. Sin API pública: se usan las mismas llamadas que
su propia web (`referencias/pedido.md`).

**Tres pasos, en orden** (Pablo, 8 nov 2026; trozos 12 a 24 de
`specs/plan-comprar-mercadona.md`). Cada uno solo si la persona lo ha encendido
(`mercadona_cuenta.llega_hasta`), y cada uno lleva los de antes:

1. **Rellenar la lista** (`lista`): una lista nueva en su cuenta. No toca el carro.
2. **Reservar la hora de entrega** (`reservar`): suma la lista al carro sin quitar
   lo que ya tenía, crea el pedido y reserva la hora que la persona elija.
3. **Pagar la compra** (`pagar`): confirma el pedido.

**El carro se suma, nunca se pisa.** Mercadona sustituye el carro entero en cada
escritura: se lee con su `version`, se suma la lista y se escribe una vez.

**Nunca se paga sin que la persona confirme ese importe en ese pedido**, y nunca
más de lo confirmado. Si no se puede leer el total, no se paga. Además, el pago lo
aprueba siempre la persona en su banco: confirmar manda a la autenticación del
banco, y el bot no puede cerrarlo solo.

## Reglas

- **Solo cuentas de quien lo ha pedido.** Solo las casas de `MERCADONA_CASAS`:
  Pablo y quien él nombre, con su consentimiento. Antes de abrirlo a otra familia:
  visto bueno de Mercadona o de un abogado (ver «Condiciones»). El trozo 10 de
  `specs/plan-comprar-mercadona.md` propone cambiar esta regla.
- **Sin disfraces.** Ni ocultar que es automático, ni cambiar huella o IP, ni
  repartir cuentas entre servidores, ni esquivar captchas. Si bloquean, se para y
  se cuenta: ese es el resultado. **Una excepción** (Pablo, 8 nov 2026; trozo 8
  del plan): en la app, la página de entrada de Mercadona se abre en versión de
  ordenador (`UA_ORDENADOR` de `src/lib/mercadonaEntrarApp.js`), porque en un
  teléfono manda a descargar su app. Solo esa página, la abre la persona y entra
  ella; el trabajador no cambia.
- **La contraseña, nunca por el chat y nunca guardada.** La escribe la persona en
  la página de Mercadona. Se guarda la sesión, no la contraseña: ni en el servidor
  ni en el móvil. Volver a entrar pide el captcha, así que guardarla no serviría.
- **La sesión es un secreto.** Lleva el token: no se abre, no se imprime y no va
  al repo. Solo se guarda sellada en `mercadona_cuenta`, y en claro vive en la
  memoria del trabajador lo que dura un encargo.
- **Sin bucles.** Es una cuenta real: una pasada y se mira. Nada de reintentar
  contra un error raro.

## Comprar: cómo va

Quien toca Comprar en la app (o se lo pide a Lola) crea un encargo en `mercadona_encargo`
(0131). El trabajador, en un contenedor en Hetzner, pregunta cada 20 s a
`api/mercadona.js?trabajador=1`, abre la sesión en un navegador limpio, crea la lista y
cierra el encargo. No tiene acceso a la base. Con el servidor de 1 GB, de uno en uno.

- **El recorrido al que vamos** (solo móvil, sin marcador ni hojas): está en
  «El recorrido que se construye» de `specs/plan-comprar-mercadona.md`.
- **Conectar una cuenta:** hoy, desde un ordenador. La sesión se sella en el navegador
  (`src/lib/mercadonaSello.js`) y se envía sellada. Basta con el `localStorage` y las
  cookies que no son `httpOnly`: comprobado el 6 nov 2026 en un navegador limpio (leer listas, 200).
- **Pasar a un navegador en la nube:** cambiar `abrirNavegador` en
  `scripts/mercadona-trabajador.mjs`, y nada más.
- **Variables.** En Vercel: `MERCADONA_TRABAJADOR_TOKEN` (secreto), `MERCADONA_CLAVE_PUBLICA`
  y `MERCADONA_CASAS`. En el servidor, `/opt/mercadona/.env` (600): `MERCADONA_API`, el
  mismo token y `MERCADONA_CLAVE_PRIVADA`, que solo vive ahí y en 1Password.
  Las tres están **en Production desde el 8 nov 2026** (las puso Pablo; antes no había
  ninguna `MERCADONA_*` en ningún entorno). Se prueba en producción
  (`https://homenu.vercel.app`, decisión de Pablo del 8 nov), y `MERCADONA_API` es
  `https://homenu.vercel.app/api/mercadona` (trozo 11 de `specs/plan-comprar-mercadona.md`).
  Staging y las vistas previas no tienen las variables: ahí Comprar no se enciende.
- **Rotar la clave** deja fuera las cuentas conectadas: hay que volver a conectarlas.

## Operaciones

| Qué | Comando | Debe salir |
|---|---|---|
| Entrar (a mano, una vez) | `node scripts/mercadona-navegador.mjs --entrar` | `resultado: sesion_guardada`; con correo y contraseña, **no** con Google |
| Ensayo, sin escribir | `node scripts/mercadona-navegador.mjs` | `resultado: ensayo_ok` |
| Crear la lista | `node scripts/mercadona-navegador.mjs --si` | `resultado: productos_completos` y `entraron N de N` |
| Otra lista | añadir `--lista fichero.json` | `{ name, products: [{ merca_code, quantity }] }` |
| Exportar la sesión | `--exportar fichero` | `resultado: sesion_exportada` |
| Crear las claves (en el servidor) | `node scripts/mercadona-trabajador.mjs --claves fichero` | guarda la privada en el fichero y escribe la pública |
| Levantar el trabajador | `chmod -R a+rX /opt/mercadona/repo && cd /opt/mercadona/repo/ops/mercadona-trabajador && docker compose up -d --build` | `docker compose logs` dice `en marcha` |
| Cómo van los encargos | `npm run consulta -- "select status, fallo, count(*) from mercadona_encargo group by 1, 2"` | los `fallido`, con su motivo |
| Usar esa sesión en un servidor | `--estado fichero`, en un contenedor desechable | igual que en el PC |

La sesión vive en `~/.menuplan/mercadona-perfil` (o `MERCADONA_PERFIL`).

**En el servidor:** imagen `mcr.microsoft.com/playwright:v<versión>-noble`, con
`--memory=900m --cpus=0.8`, porque comparte máquina con el panel (1 GB de RAM).
Lanzar con `nohup` y borrar la sesión con un `trap`. Al acabar, quitar carpeta e
imagen (~2 GB). Cómo entrar: skill `hetzner`.

## Condiciones

`https://tienda.mercadona.es/terms.html` (última actualización que figura: 21 may
2018; volver a leerlas antes de decidir nada):

- Prohíben extraer información «mediante alguna técnica de programación».
- Los servicios y la información no pueden usarse con fines comerciales o
  publicitarios sin su autorización previa.
- La contraseña es personal e intransferible.

`robots.txt` prohíbe `/api` a los robots. Esto alcanza también al catálogo semanal.
Sin asesoría legal: no es una opinión de abogado.

## En el móvil

- Por debajo de 992 px en un teléfono, su web manda a descargar la app (visto en
  el Android de Pablo, otra vez el 8 nov). Las listas no están entre las páginas
  permitidas.
- Sus enlaces abren la app, y la sesión de la app no es la del navegador.
- **La sesión de la app de Mercadona no se puede usar desde HoMenu:** cada app está
  aislada. Que la persona tenga su app abierta no ahorra la entrada en HoMenu.
- Sin importar listas por enlace, y sin llamadas desde otra web ni iframe.
- La app de HoMenu solo existe para iPhone (`@capacitor/ios` en `package.json`, sin
  `@capacitor/android`); Pablo prueba en Android, con la web de HoMenu. La app de
  Android es el trozo 7 del plan, pendiente de su decisión A.

## La sesión: cuánto dura

Sin dato oficial. El README de [`ivorpad/mercadona-cli`](https://github.com/ivorpad/mercadona-cli)
(no oficial, leído el 8 nov 2026) dice:

- El acceso dura «~6 weeks».
- El token de renovación «renews the session headlessly, forever», sin captcha, y
  rota en cada renovación: hay que guardar siempre el último.
- Entrar con contraseña pide un captcha de Google (reCAPTCHA Enterprise): la primera
  entrada solo se puede hacer en una página real.

Sin comprobar con nuestra cuenta: lo comprueba el trozo 1 del plan
(`node scripts/mercadona-navegador.mjs --renovar`), y el resultado se apunta aquí.

## Lo que falló y por qué

- **2026-11-06 · «No se ha podido iniciar sesión».** Causa: el botón «Entrar con
  Google» en un navegador automático; rechaza Google
  (`accounts.google.com/v3/signin/rejected`), no Mercadona. Arreglo: correo y
  contraseña de Mercadona (con «¿Has olvidado tu contraseña?» si no tiene).
- **2026-11-06 · aviso `--no-sandbox` en Chrome.** Causa: valor por defecto de
  Playwright. Arreglo: `chromiumSandbox: true` en el PC.
- **2026-11-08 · el contenedor del trabajador se reiniciaba sin parar.** Causa: el
  contenedor no podía abrir su script (`docker compose logs`: `syscall: 'open'`,
  `path: '/app/scripts/mercadona-trabajador.mjs'`), porque la copia del repo en el
  servidor no dejaba leer a otros usuarios (sin comprobar si por el `umask`). Arreglo: `chmod -R a+rX /opt/mercadona/repo` y
  reconstruir; el comando de «Levantar el trabajador» ya lo lleva.
- **2026-11-08 · el trabajador recibía `HTTP 401`.** Causa: el token pegado en Vercel no
  era el del servidor. Arreglo: copiarlo del servidor al portapapeles sin verlo
  (`ssh … | clip.exe`), comprobar que son 64 caracteres hexadecimales, editar la
  variable y volver a desplegar: sin variables nuevas, el despliegue viejo no las ve.
- **2026-11-11 · en la app de iPhone, la página de Mercadona salía descuadrada** (una
  imagen tapaba todo). Causa: el disfraz de ordenador cambia lo que se pide, no el ancho:
  la web de ordenador se dibujaba en ~390 px. Arreglo (`src/lib/mercadonaEntrarApp.js`):
  `preferredContentMode: "desktop"` y un `preShowScript` en `documentStart` que fija la
  viewport a 1280 px. El complemento solo acepta el script con `isPresentAfterPageLoad`,
  y entonces la ventana no se ve hasta que carga: por eso hay un tope de 30 s a la carga.
- **2026-11-11 · en la app de iPhone, «Abrir lista» pasaba por Safari sin sesión.** Causa:
  un `<a target=_blank>` en Capacitor va a `UIApplication.open`, que abría Safari (sin la
  sesión de Mercadona); tras entrar, saltaba a la app de Mercadona, si la había. Arreglo:
  en la app, la lista se abre en el mismo navegador interno con el que se entró
  (`abrirEnMercadona`, `src/components/EnlaceMercadona.jsx`); el complemento guarda cookies y
  localStorage entre aperturas. Sigue igual el enlace que Lola manda por el chat.

## Fuentes y comprobación

Comprobado el 2026-11-06 con la cuenta de Pablo: login a mano en Chrome
automatizado; lista de 3 productos desde su PC (3 de 3, vista en la app); misma
lista desde el servidor de Hetzner, con la sesión exportada (3 de 3).

La respuesta de su lista no trae cantidades: `products_quantity` cuenta productos distintos. La cantidad sí se guarda: una lista con cantidad 3 sale en su web como «Añadir 3 uds. al carro» (visto el 6 nov). El script solo comprueba productos.

Sin comprobar: que el trabajador pase la lista al carrito (a mano sí, el 8 nov: `referencias/pedido.md`), una compra de ~30 productos, cuánto dura
la sesión (ver «La sesión: cuánto dura»), varias familias a la vez, qué hace
Mercadona con un uso repetido, la entrada en versión de ordenador dentro de la app,
que la sesión siga al abrir la lista dentro de la app (ver «Lo que falló», 11 nov),
y si el enlace de una lista abre la app de Mercadona en la lista o en su portada. Dos pasadas no
demuestran que no vayan a bloquearlo.
