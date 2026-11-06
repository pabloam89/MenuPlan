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

Prototipo: un navegador real rellena una **lista** en la cuenta de la persona.
Luego ella la revisa en Listas de la app de Mercadona y paga allí. Sin API
pública: se usa la misma llamada que su propia web.

**Lista y no carrito:** el carrito se sustituye entero y pisaría lo que hubiera.
**Nunca paga:** no hay ningún paso de carrito, reparto ni pago, y no se añade.

## Reglas

- **Solo cuentas de quien lo ha pedido.** Solo las casas de `MERCADONA_CASAS`:
  Pablo y quien él nombre, con su consentimiento. Antes de abrirlo a otra familia:
  visto bueno de Mercadona o de un abogado (ver «Condiciones»).
- **Sin disfraces.** Ni ocultar que es automático, ni cambiar huella o IP, ni
  esquivar captchas. Si bloquean, se para y se cuenta: ese es el resultado.
- **La contraseña, nunca por el chat.** La escribe la persona en la ventana del
  navegador. Se guarda la sesión, no la contraseña.
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

- **Conectar una cuenta:** desde un ordenador, con un marcador. Abre HoMenu, que sella la
  sesión en el navegador (`src/lib/mercadonaSello.js`) y la envía. Basta con lo que el
  marcador puede leer: comprobado el 6 nov 2026 en un navegador limpio (leer listas, 200).
- **Pasar a un navegador en la nube:** cambiar `abrirNavegador` en
  `scripts/mercadona-trabajador.mjs`, y nada más.
- **Variables.** En Vercel: `MERCADONA_TRABAJADOR_TOKEN` (secreto), `MERCADONA_CLAVE_PUBLICA`
  y `MERCADONA_CASAS`. En el servidor, `/opt/mercadona/.env` (600): `MERCADONA_API`, el
  mismo token y `MERCADONA_CLAVE_PRIVADA`, que solo vive ahí y en 1Password.
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
| Levantar el trabajador | `cd /opt/mercadona/repo/ops/mercadona-trabajador && docker compose up -d --build` | `docker compose logs` dice `en marcha` |
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
  el Android de Pablo). Las listas no están entre las páginas permitidas.
- Sus enlaces abren la app, y la sesión de la app no es la del navegador.
- Sin importar listas por enlace, y sin llamadas desde otra web ni iframe.

## Lo que falló y por qué

- **2026-11-06 · «No se ha podido iniciar sesión».** Causa: el botón «Entrar con
  Google» en un navegador automático; rechaza Google
  (`accounts.google.com/v3/signin/rejected`), no Mercadona. Arreglo: correo y
  contraseña de Mercadona (con «¿Has olvidado tu contraseña?» si no tiene).
- **2026-11-06 · aviso `--no-sandbox` en Chrome.** Causa: valor por defecto de
  Playwright. Arreglo: `chromiumSandbox: true` en el PC.

## Fuentes y comprobación

Comprobado el 2026-11-06 con la cuenta de Pablo: login a mano en Chrome
automatizado; lista de 3 productos desde su PC (3 de 3, vista en la app); misma
lista desde el servidor de Hetzner, con la sesión exportada (3 de 3).

La respuesta de su lista no trae cantidades: `products_quantity` cuenta productos distintos. La cantidad sí se guarda: una lista con cantidad 3 sale en su web como «Añadir 3 uds. al carro» (visto el 6 nov). El script solo comprueba productos.

Sin comprobar: pasar la lista al carrito, una compra de ~30 productos, cuánto dura
la sesión, varias familias a la vez, y qué hace Mercadona con un uso repetido. Dos
pasadas no demuestran que no vayan a bloquearlo.
