---
name: vercel
description: Úsala con un despliegue de Vercel — preview de un PR, staging o producción —, uno que sale Blocked, en rojo o no arranca, para leer logs, ver, bajar, listar o tocar las variables de entorno (también las de producción, que la guardia niega bajar), subir a Blob, o al preguntar por un cron, un dominio o qué hay desplegado. No para: el CI de GitHub (github), la base de datos (supabase) ni dar de alta o rotar una clave (alta-de-secreto).
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: constructor
  comprobado: "2026-10-08"
  normas: [produccion-solo-desde-main, variables-production-solo-pablo, vuelta-atras-probada]
---

# Vercel

Método de la casa. El equipo, el proyecto, lo que despliega, sus funciones, el vigía y lo que ha fallado en un proyecto concreto no van aquí: están en la ficha de servicio de ese proyecto (`ops/proyectos/<id>/servicios/vercel.md`), que llega con `--proyecto <id>` en el brief. Si no te llegó (no pasaste por `/orquestar`), ábrela tú en esa ruta, con el id de tu proyecto: la puerta de la guardia te la sugiere al pedirte esta skill.

## Qué es y dónde

- **Un equipo y un proyecto** de Vercel que despliegan la app (Vite, `dist/`) y las funciones de `api/`, en una región fija (`vercel.json`) cerca de la base de datos.
- **Ramas**: cada PR tiene su preview; la rama de integración despliega en un entorno personalizado de staging; `main` es producción.
- **Una función que lee un fichero en tiempo de ejecución** necesita ese fichero en su `includeFiles`: lo que no esté en la lista no viaja al despliegue. Lo que importa una función desde `scripts/` tampoco viaja (`.vercelignore`).
- **Blob**: almacén de ficheros del proyecto (fotos y sus derivados).
- **Crons**: los de `vercel.json`, si los hay; otros pueden vivir en GitHub Actions o en la base (skills `github` y `supabase`).
- **Marketplace**: una integración (la base de datos, por ejemplo) cuelga del equipo y la paga Vercel.

## Claves y accesos

Los nombres, para qué sirve cada una y en qué entorno están se apuntan en
`ops/INVENTARIO.md`; las direcciones de 1Password, en `ops/env.1password`.
Aquí no se repiten. Las variables se asignan **por entorno** (Production, Preview,
Development y los personalizados): que una falte en Preview no es por fuerza un
fallo, y la lista de las que faltan a propósito está en la ficha del proyecto.

El acceso a Vercel desde Claude es el conector de claude.ai (con el equipo y el
proyecto de la ficha). La CLI `vercel` puede estar instalada en el PC de la persona, pero
**sin sesión**: ella entra con `! npx vercel login` cuando la necesita y sale
al terminar. La guardia niega a las sesiones bajar o listar las variables de
Production (`vercel env pull|ls … production`, `vercel pull --environment=production`):
llevan la clave de administrador de la base y el token del bot (#332).

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| Estado y logs de un despliegue | el conector de Vercel: `list_deployments`, `get_deployment`, `get_runtime_logs`, `get_runtime_errors` | el estado (`READY`, `ERROR`, …) y los logs. Primero se miran los logs; luego se toca nada |
| ¿Qué hay en staging? | `git fetch origin` y mirar `origin/staging` | el commit. Vercel solo dice si ese commit desplegó bien |
| Build local igual que Vercel | el script `build` del proyecto (`npm run build`), que corre su `prebuild` | build verde. Nunca el compilador a secas (`vite build`) |
| Volver atrás en producción (OK) | «Instant Rollback» del panel o `request_rollback` del conector | el despliegue anterior vuelve a ser el de producción |

**Vuelta atrás.** Nada revierte solo: una puerta de salud tras desplegar avisa en rojo
cuando un despliegue no responde, y volver al anterior lo hace una persona. Qué NO se
revierte: las migraciones de la base. Los clics del panel y cómo anotar el ensayo, en
la ficha del proyecto.

## Lo que falló y por qué

- **2026-09-24 · despliegue «Blocked»** (repo privado): duración
  0 ms, estado `UNKNOWN` en la CLI, «This deployment can not be redeployed»,
  Cancel en gris aun siendo Owner. Causa: el ajuste «añadir como Developer a
  quien commitea en un repo privado» retiene el despliegue mientras el autor del
  commit no es miembro del equipo. Arreglo: commitear con una identidad que ya
  sea miembro (`git config user.email <id>+<usuario>@users.noreply.github.com`);
  pasó de retenido a Ready en 9 s. Un repo público no lo sufre; si pasa a
  privado, esto vuelve.
- **2026-09-22 · staging roto por un build que en local pasaba.** Causa: se
  verificó con `vite build`, y el `prebuild` de Vercel cazó un `no-undef`.
  Arreglo: la guardia niega `vite build` a secas.
- **2026-10-08 · `vercel logs` devuelve como mucho 50 peticiones**, aunque se
  pida `--limit 2000` (CLI 62.1.0), y sin avisar. Causa: es el tope de la CLI;
  las da de la más nueva a la más vieja, y `--until` incluye el instante
  límite. Arreglo: paginar hacia
  atrás con `--since`/`--until` en ISO y quitar repetidos por `id`, como hace
  `scripts/bot-fallos.mjs` (`paginar`). En producción puede no haber tráfico
  reciente: el informe dice qué entorno y qué rango ha cubierto.
- **2026-10-09 · los logs de un entorno personalizado no están en su nombre.**
  Causa: `vercel logs --environment` solo acepta `production` o `preview` (con
  otro valor: «Invalid environment»), y el entorno personalizado de staging sale
  como `preview`. Arreglo: elegir el entorno por una variable que siga al
  tráfico real (en el vigía, `VIGIA_ENTORNO`).
- **2026-10-09 · «User not found.» con un token que sí existe.** Causa: el
  token se creó con scope del equipo, y la CLI pregunta primero por el usuario
  (`/v2/user` da 404 con ese token, aunque el API REST del proyecto responda
  200). Arreglo: un token para la CLI se crea con scope **«Full Account»**, que
  cubre la cuenta y el equipo, y a 90 días. En un runner sin `.vercel/` la CLI
  necesita `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` en su entorno.
- **2026-10-09 · la CLI tenía la sesión de la persona abierta (Owner).**
  Causa: un login antiguo que se quedó en el AppData de Windows (carpeta
  com.vercel.cli); cualquier sesión podía bajarse las variables de Production
  (lo vio el juez `seguridad`, #332). Arreglo: `vercel logout` (comprobado: el
  fichero de sesión ya no existe y `whoami` da «Logged out») y la regla de la
  guardia que niega `vercel env pull|ls … production`, con su test en
  `guardia.test.js`.

## Qué requiere el OK de Pablo

- Subir o promover a producción, y el rollback.
- Crear, cambiar o borrar variables de entorno (en cualquier entorno).
- Cambiar ajustes del equipo o del proyecto: dominios, miembros, protección,
  plan, integraciones del Marketplace.
- Borrar despliegues, stores de Blob o cualquier recurso.

## Coste y límites

Plan del equipo (Pro, por ejemplo); lo que se contrata por el Marketplace sale de
ahí. Límites que muerden: `maxDuration` de una función y el tamaño de los
ficheros que lee (`includeFiles`). Si el repo pasa a privado, los commits de
autores que no son miembros del equipo se bloquean y cuentan como asientos.

## Fuentes y comprobación

- https://vercel.com/docs/deployments/troubleshoot-a-build
- https://vercel.com/docs/projects/environment-variables
- https://vercel.com/docs/instant-rollback

Comprobado el 2026-10-08: el contenido viene de la versión anterior de esta skill, reordenado a la plantilla sin cambiar los hechos; hoy no se ha vuelto a ejecutar lo que cita (qué se comprobó de cada proyecto, en su ficha). Sin comprobar: un rollback real en producción.
