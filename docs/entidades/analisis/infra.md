# Familia INFRA, ACCESO Y CONTENCIÓN

Fuentes leídas: `ops/entidades.json` (v2, 11 oct), `ops/recursos.json` (23 recursos), `ops/planos.json`, `ops/INVENTARIO.md`, `ops/entidades-sujetos.json`, glosario (`entorno`, `identidad`, `servicio`, `zona`), `scripts/lib/recursos.mjs`, `scripts/lib/tokenSesion.mjs`, skills `supabase` y `alta-de-secreto`, `git ls-files` de `origin/staging`. Nota: en `C:\dev\MenuPlan-super-tabla-entidades` no hay ningún SUPER-TABLA.md (solo copia de la raíz del repo); no he podido contrastar con él.

## Tabla resumen

| Entidad | Registrada hoy | Nivel | Clase de relación principal | Veredicto |
|---|---|---|---|---|
| identity | parcial (solo vocabulario de 4 valores) | pieza | es-un (cuenta/App/service account/bot) | Se queda, pero se parte: el vocabulario `IDENTIDADES` no es la entidad |
| team-member | no (prosa en CLAUDE.md) | pieza | parte-de factoría | Se queda; registrar 3 filas |
| service | no (22 filas en prosa) | pieza | referencia (proveedor, eje aparte) | Se queda; NO es un nivel de contención |
| secret | no (INVENTARIO + 9 filas en recursos) | pieza | parte-de bóveda | Se queda como tipo de `resource` |
| vault | 3 filas en recursos | pieza | contenedor de secretos | Se queda como tipo de `resource` |
| environment | no | plantilla de 4 piezas | parte-de proyecto | Se queda; cerrar vocabulario y separar los environments de GitHub |
| deployment | no | pieza efímera | referencia a rama y entorno | Pasa a tipo de evento |
| resource | sí, `ops/recursos.json` | plantilla | supertipo | Se queda y es la tabla base de la familia |
| repo | no | pieza | referencia de proyecto | Entra como tipo de `resource` |
| project | no (nombre usado en 4 sentidos) | pieza | parte-de factoría | Entidad nueva; renombrar el tipo `proyecto` de recursos |
| app / identidad de máquina | 2 Apps en recursos | pieza | es-un identity | Subtipo de identity, no entidad propia |
| permission / capability | no | — | atributo | Pasa a campo, solo si tiene lector |
| plane | sí, `ops/planos.json` | meta | clasificación | Se queda, fuera del eje de contención |
| zone | término de glosario | — | selector de rutas | Pasa a campo; sirve para medir la separación |
| workspace | una frase en una skill | — | atributo | No es entidad |
| objective | GQM en `metricas.json` | — | campo | No es entidad |

## La jerarquía propuesta (eje de contención)

Contención = «A es parte de B y desaparece si B desaparece o se separa». Es distinto del eje meta/plantilla/pieza (que dice de qué molde sale algo). Propongo cuatro niveles; un recurso cuelga del nivel más bajo en el que se usa solo.

```
FACTORÍA (HoMenu como empresa)
  cuentas y proveedores comunes: GitHub pabloam89, 1Password, Vercel (equipo menuplan), Hetzner, Tailscale
  gente: team-member (Pablo, Álvaro, Manu)
  maquinaria de trabajo: agentes, skills, normas, hooks, glosario, forja, planos, issues
  identidades de máquina del trabajo: App homenu-sesiones, App homenu-dependabot-merge, service accounts
  bóvedas: HoMenu, HoMenu-sesiones, Panel HoMenu
  método de diseño (la forja de diseño, DESIGN_SYSTEM.md como criterio)
 └─ PROYECTO HoMenu (el producto: app + Lola)
      repo pabloam89/MenuPlan (hoy compartido con la factoría)
      proyecto Vercel `homenu`, proyecto Supabase, bot Lola, Blob, Upstash
      sistema de diseño del producto (tokens en src/design, assets, ilustraciones)
      claves de runtime (las de Vercel, Telegram Lola, Supabase)
      └─ ENTORNO: local · preview · staging · producción
 └─ PROYECTO Panel (herramienta de la factoría)
      repo privado pabloam89/homenu-panel, servidor HoMenu-Panel, su Postgres, copias de la base
      └─ ENTORNO: producción (único)
```

Qué cuelga de cada nivel, en una línea cada uno:

- **Repos**: del proyecto (1 repo por proyecto hoy; el vínculo repo-proyecto es campo, no contención, porque el repo de HoMenu contiene también factoría).
- **Servicios**: de ninguno. Son el proveedor (eje transversal): Vercel da una cuenta a la factoría y un proyecto a HoMenu. Un servicio no es un nivel.
- **Entornos**: del proyecto. Importante: en HoMenu solo hay una base (producción) para todos los entornos, así que el entorno es de código, no de datos (Comprobado: `CLAUDE.md`, «Base de datos»).
- **Claves**: del nivel que las usa. Las de runtime, del proyecto HoMenu; las de sesiones y GitHub, de la factoría. La bóveda las contiene (eje de almacén, aparte).
- **Apps de GitHub**: factoría (actúan sobre el repo del producto, pero son del equipo de trabajo).
- **Sistema de diseño**: dividido. El método y el criterio (`DESIGN_SYSTEM.md`, forja) son factoría; los tokens y assets (`src/design`, `public`) son del proyecto HoMenu.
- **Panel**: proyecto propio hijo de la factoría, con su repo, su servidor y su entorno único.

Tres cosas que no son contención y no deben mezclarse con ella: proveedor (service), almacén (vault→secret) y clasificación (plane, zone).

## El dato: por qué la factoría vive en el repo del producto

Medido sobre `git ls-files` (2.722 ficheros), mi corte, que difiere un poco del tuyo (881/1.752):

| Parte | Ficheros |
|---|---|
| Factoría (`.claude` 123, `.github` 17, `docs/ops`/`docs/entidades` 10, `ops` 393, `scripts` 363) | 906 |
| Producto con imágenes (`src` 547, `api` 172, `supabase` 118, `specs` 17, `public` 915, otros) | 1.792 |
| Producto sin `public` ni `Avatares` (código y datos) | 877 |
| Sueltos de raíz (config, `package.json`, `CLAUDE.md`) | 24 |

Lectura (Comprobado el recuento; el resto, Creo): en código y especificaciones la factoría ya pesa lo mismo que el producto (906 frente a 877); lo que infla el producto son 915 imágenes de `public`. Los 363 ficheros de `scripts/` mezclan los dos mundos (265 sin contar `lib/`; al menos 35 son de catálogo, imágenes o Mercadona) y no se pueden asignar a un lado sin leerlos uno a uno. La razón de que viva ahí no es técnica sino histórica: el repo es público y lo único que lleva CI, guardia y rulesets; los hooks y `npm run` de la factoría actúan sobre el repo donde está la sesión. Una sesión = una carpeta = una rama (`CLAUDE.md`), y la guardia opera sobre ese repo. Separar hoy rompería `guardia.mjs`, `dominios-skills.json` y los 61 scripts de `package.json`.

Consecuencia para el modelo: no hace falta mover ficheros para modelar la contención. Basta con declarar la zona `factoria` por rutas (ver ficha de `zone`) y que `project` apunte a `repo` por campo. Mover es una decisión posterior, con el contador de zona como cifra de antes y después.

---

## Fichas

### identity
1. **Qué es.** La cuenta con la que algo actúa en un servicio: login, App de GitHub, cuenta de servicio o bot del equipo (`ops/glosario/terminos/identidad.json`; `ops/entidades.json`, nota de `identity`). Hay otra cosa distinta con nombre parecido: `channel-identity` (cuenta de un canal de la casa), vertical.
2. **Quién la lee.** `scripts/lib/tokenSesion.mjs` (arranque, tokens de 1 h) y la guardia (que niega volver a credenciales de Pablo). Lector del registro: ninguno, no existe.
3. **Nivel.** Pieza. Su plantilla sería `resource` con tipo `app`/`service-account`/`cuenta`.
4. **Relaciones.** belongs_to team-member (N:1, `stored_as: none`); uses vault (N:M, none). Es-un: App, service account, deploy key, bot de Telegram (subtipos). Parte-de: factoría.
5. **Ciclo de vida.** Creada → en uso → rotada (su clave) → revocada. La cambia Pablo (alta y rotación son suyas por la regla de secretos).
6. **Fuente y copias.** Fuente real: el panel del proveedor. Copias: `ops/INVENTARIO.md` (prosa) y `ops/recursos.json` (2 Apps + 2 service accounts + 4 cuentas). Dos sitios que dicen lo mismo con fechas.
7. **Quién crea y mantiene.** Human (Pablo), irreducible: crear identidades es suyo.
8. **Veredicto.** Se parte. `IDENTIDADES = ["pablo","app","otra","desconocida"]` (`tokenSesion.mjs:35`) no clasifica identidades sino al **actor observado** en una sesión; debería llamarse así (`actor`). La entidad identity real es el subconjunto de `resource` con tipo cuenta/app/service-account/deploy-key. Dato que lo decide: 4 valores del código frente a 8 identidades reales en recursos.json.
9. **No sé.** Cuántos bots o cuentas hay fuera de recursos.json (Resend, Groq...); se averigua cruzando INVENTARIO (22 filas) con recursos (23 recursos).

### team-member
1. **Qué es.** Persona del equipo: Pablo, Álvaro, Manu (`CLAUDE.md`, «Equipo»; `ops/entidades.json`, decisión del 11 oct). No es `person` (la persona de la casa).
2. **Quién la lee.** `ACTORES.persona`, asignación de issues (`assigned_to`), `resource.dueno` (`pablo`/`ambos`).
3. **Nivel.** Pieza.
4. **Relaciones.** parte-de factoría (N:1, none). referencia desde decision.assigned_to, identity.belongs_to, resource.dueno (campo, hoy `dueno` solo conoce pablo/ambos/por-confirmar: no nombra a Álvaro).
5. **Ciclo de vida.** Alta (acceso al repo, 1Password, Vercel) → baja. Lo cambia Pablo. Baja dispara la rotación de claves (norma de `alta-de-secreto`: «al irse alguien con acceso»).
6. **Fuente y copias.** Fuente: prosa de `CLAUDE.md`. Copias: INVENTARIO («Owners: Pablo y Álvaro»), vocabulario `dueno`.
7. **Crea y mantiene.** Human, irreducible.
8. **Veredicto.** Se queda. Registrar 3 filas con id y herramientas a las que tiene acceso; lo que lo decide: la baja de alguien exige conocer sus accesos y hoy no se pueden contar.
9. **No sé.** Qué accesos exactos tiene Álvaro (1Password, Hetzner, Tailscale); se averigua preguntándole.

### service
1. **Qué es.** Proveedor externo con cuenta dueña (Vercel, Supabase, GitHub, Anthropic, 1Password) que INVENTARIO apunta (`ops/glosario/terminos/servicio.json`). Fuente: `ops/INVENTARIO.md`, tabla de ~22 filas.
2. **Quién la lee.** `scripts/lib/recursos.mjs` (campo `servicio` con vocabulario), skills por servicio, `dominios-skills.json`.
3. **Nivel.** Pieza; sin plantilla (la fila de INVENTARIO es el molde informal).
4. **Relaciones.** 1:N hacia resource (por campo `servicio`). Referencia, no contención: Vercel aloja a la vez una cuenta (factoría) y un proyecto (HoMenu). environment.belongs_to service (`none`) está mal puesto: ver ficha de `environment`.
5. **Ciclo de vida.** Contratado → activo → suspendido (los dos proyectos de pruebas de Supabase) → retirado.
6. **Fuente y copias.** INVENTARIO es la fuente; recursos.json repite 9 servicios con fecha y dueño. La nota ya dice «cuando una fecha cambie, cambia allí».
7. **Crea y mantiene.** Human (altas), y mantenimiento evitable: `recursos.json` ya lo calcula.
8. **Veredicto.** Se queda, como vocabulario cerrado (campo `servicio` de resource) y no como tabla de contención. La tabla de INVENTARIO debería generarse del registro. Dato: ya hay 9 valores cerrados en `recursos.mjs`, el INVENTARIO tiene 22 filas: 13 sin registro.
9. **No sé.** La cuenta dueña de 9 filas marcadas con ❓; se averigua con el paso 1 de los pendientes de INVENTARIO.

### secret
1. **Qué es.** Clave, token o secreto (`ops/entidades.json`: «hoy se dice clave, secreto y token»; glosario: `clave`). Fuente: INVENTARIO y 7 claves + 1 token + 1 deploy key en `recursos.json`.
2. **Quién la lee.** `leerEnv` (`scripts/lib/env.mjs`), `ops/env.1password`, cumplimiento semanal (caducidades), normas `caducidad-*`.
3. **Nivel.** Pieza de la plantilla `resource` (tipos clave, token, deploy-key).
4. **Relaciones.** lives_in vault (N:1, campo en la dirección `op://`); belongs_to service (N:1, cuenta dueña); copia → destinos (Vercel, environment de GitHub, fichero del servidor), N:M, solo en prosa de INVENTARIO.
5. **Ciclo de vida.** Alta → en uso → a 14 días de caducar → rotada → retirada (`alta-de-secreto`). La cambia Pablo.
6. **Fuente y copias.** Fuente: la ficha de 1Password. Copias derivadas por diseño: Vercel, GitHub, servidor, `.env.local` (direcciones, no valores). Dato: en INVENTARIO hay unas 40 variables nombradas y en recursos.json solo 9 secretos.
7. **Crea y mantiene.** Human, irreducible (creación, rotación); registro evitable.
8. **Veredicto.** Se queda como tipo de `resource`, con campos `ficha`, `boveda`, `destinos[]`. No se crea tabla aparte. Lo decide el dato de cobertura: 9 de ~40.
9. **No sé.** Cuántas variables de Vercel existen realmente; se mira con `vercel env ls` (lo lanza Pablo).

### vault
1. **Qué es.** Bóveda de 1Password: `HoMenu` (solo Pablo), `HoMenu-sesiones` (copia de lo que leen las sesiones), `Panel HoMenu` (servidor). Fuente: INVENTARIO («Qué vive en cada bóveda») y 3 filas de recursos.json.
2. **Quién la lee.** `scripts/boveda-sesiones.mjs` (lista `COPIAR`, atada por test a `ops/env.1password`), la service account.
3. **Nivel.** Pieza; contenedor.
4. **Relaciones.** contiene secret (1:N); identity.uses vault (N:M). Aquí hay una asimetría útil: `HoMenu-sesiones` es **copia** de parte de `HoMenu` (fuente y derivado).
5. **Ciclo de vida.** Creada → poblada → rotada. Pablo.
6. **Fuente y copias.** `COPIAR` es el único sitio que dice qué va en cada bóveda en forma de código; la tabla de INVENTARIO repite lo mismo en prosa.
7. **Crea y mantiene.** Human (creación), automatic en parte (`boveda-sesiones.mjs`).
8. **Veredicto.** Se queda como tipo `boveda` de resource. No es nivel de contención; es el almacén. Hoy solo 2 bóvedas son de la factoría y 1 del Panel: el campo `parte_de` las ubica.
9. **No sé.** Si «dudoso» en la tabla (Anthropic y AI Gateway en sesiones) se resolvió; se mira en la consola de Anthropic.

### environment
1. **Qué es.** «Un sitio donde corre el código y que tiene su propia configuración: local, preview, staging o producción» (`ops/glosario/terminos/entorno.json`). Pero `ops/entidades.json` avisa de tres sentidos: entornos de Vercel, `VIGIA_ENTORNO`, environments de GitHub.
2. **Quién la lee.** `ops/planos.json` plano 5 («Entornos»), `apply-migration` (exige staging), `migration.applied_in environment`.
3. **Nivel.** Plantilla con 4 piezas (local, preview, staging, producción).
4. **Relaciones.** parte-de proyecto (N:1). `belongs_to service` (declarada) es la clase equivocada: un entorno es de un proyecto, no de un proveedor. Dato: en HoMenu hay una sola base, así que `staging` y `producción` comparten datos.
5. **Ciclo de vida.** Fijo; solo cambia con una decisión de Pablo.
6. **Fuente y copias.** INVENTARIO, la skill `vercel`, la skill `github`: tres textos.
7. **Crea y mantiene.** Human.
8. **Veredicto.** Se queda, pero se separa el cuarto sentido: los **environments de GitHub** (`vigia`, `dependabot-auto`, `mercadona-sync`) no son entornos de código, son puertas de secretos con política de ramas. Se renombran `secret-scope` (término nuevo en el glosario) y viven como campo `destinos` del secreto. Dato: los tres existen para guardar secretos, no para correr código.
9. **No sé.** Si el entorno `preview` de Vercel usa las mismas claves que producción; se mira con `vercel env ls`.

### deployment
1. **Qué es.** Lo que sale de una rama: la versión que ven las casas (`ops/entidades.json`: «no es entidad todavía, se identifica por el id de Vercel, la rama o el PR»).
2. **Quién la lee.** `ops/salud-despliegue.test.js`, el vigía de Lola (lee logs), plano 12 (release).
3. **Nivel.** Pieza efímera, sin plantilla.
4. **Relaciones.** comes_from branch (N:1, campo en Vercel, fuera del repo); belongs_to environment (N:1, none). Referencia.
5. **Ciclo de vida.** Construido → listo/fallido → sustituido. Lo hace Vercel (automatic).
6. **Fuente y copias.** Vercel es la fuente; el repo no la copia (bien).
7. **Crea y mantiene.** Automatic, sin humano.
8. **Veredicto.** Pasa a **tipo de evento** (`deploy`), con campos entorno y rama. No hace falta registro: Vercel ya lo guarda. Lo decide que su único lector son un test y el vigía, y ninguno necesita un id propio.
9. **No sé.** Si algún script cuenta despliegues por entorno; se busca con `npm run buscar -- "deploy"`.

### resource (candidato)
1. **Qué es.** Una entrada de `ops/recursos.json` por clave, token, App, deploy key, bóveda, service account, proyecto, servidor o cuenta, con servicio, tipo, dueño, fecha y caducidad (comentario del fichero; `scripts/lib/recursos.mjs`).
2. **Quién la lee.** `ops/recursos.test.js` (forma) y la sección «Caducidades» del informe semanal (`scripts/cumplimiento.mjs --informe`); las normas `caducidad-*` apuntan aquí.
3. **Nivel.** Plantilla. Piezas: los 23 recursos. Por tipo (Comprobado): clave 7, cuenta 4, bóveda 3, app 2, proyecto 2, service-account 2, token 1, deploy-key 1, servidor 1.
4. **Relaciones.** Es-un: secret, vault, identity/app, repo (por añadir), proyecto-de-servicio, servidor, cuenta. Hoy solo tiene el campo `servicio`; **no tiene `parte_de`**, así que la contención factoría > proyecto no se puede leer.
5. **Ciclo de vida.** creado → en uso → por caducar (14 días) → rotado/retirado. El reloj lo da la fecha; la acción es de Pablo.
6. **Fuente y copias.** Fuente de las fechas: recursos.json. INVENTARIO repite fechas en prosa (con la nota de que manda recursos). Dato: 6 de 23 con caducidad «por-confirmar» y 1 con dueño «por-confirmar».
7. **Crea y mantiene.** Human en la entrada; el test y el informe son automatic.
8. **Veredicto.** Se queda y se promociona a supertipo de esta familia. Añadir dos campos con lector claro: `parte_de` (id de factoría, proyecto o recurso) y `proyecto`. Dato que lo decide: ya sirve a 9 tipos de cosas con un solo test y un solo informe.
9. **No sé.** Si cubre los recursos de pago (Anthropic, Resend, Groq); se cruza con INVENTARIO.

### repo (candidato)
1. **Qué es.** El repositorio de código. Hay dos: `pabloam89/MenuPlan` (público, 2.722 ficheros, producto y factoría juntos) y `pabloam89/homenu-panel` (privado, el panel) (INVENTARIO). Hay restos de `pabloartinano/MenuPlan`, que son un error (`CLAUDE.md`).
2. **Quién la lee.** Planos 1 y 3 (`repo: pabloam89/MenuPlan` en `planos.json`), `scripts/rulesets.mjs`, guardia, `gh` en todo el flujo.
3. **Nivel.** Pieza; sin registro.
4. **Relaciones.** Referencia de proyecto (1:1 hoy; N:1 posible). No es contención: un repo puede contener a la vez factoría y producto, como pasa hoy.
5. **Ciclo de vida.** Fijo; rulesets y visibilidad las cambia Pablo (repo privado en espera por decisión de Pablo del 7 oct).
6. **Fuente y copias.** GitHub; el nombre está escrito en ~varios ficheros (planos.json, skills, INVENTARIO).
7. **Crea y mantiene.** Human.
8. **Veredicto.** Entra como tipo `repo` de resource (2 filas). Lo decide que hoy el nombre está repetido a mano y la decisión de separar factoría/producto se tomará sobre este recurso.
9. **No sé.** Cuántos ficheros citan el nombre del repo; `grep` de `pabloam89/MenuPlan`.

### project (candidato)
1. **Qué es.** No existe como entidad. La palabra «proyecto» designa cuatro cosas: HoMenu (el producto), el panel, un proyecto de Vercel/Supabase/Hetzner (`recursos.mjs:51`: «un proyecto de un servicio») y «el proyecto» en general (`entidad.json`: «una cosa del proyecto»). Es la mayor colisión de la familia.
2. **Quién la lee.** Nadie como entidad. Los tipos `proyecto` de recursos.json (vercel-proyecto-homenu, supabase-proyecto-produccion) sí son leídos por el informe.
3. **Nivel.** Pieza de la factoría; molde: una plantilla con campos repo, entornos, claves, servicios.
4. **Relaciones.** parte-de factoría (N:1, hoy none). Contiene entornos (1:N), recursos (1:N) y especificaciones. Cardinalidad real hoy: 2 proyectos (HoMenu y Panel).
5. **Ciclo de vida.** Idea → activo → archivado. Lo decide Pablo. El archivo de Remotion (borrado el 7 oct) fue en la práctica un proyecto retirado.
6. **Fuente y copias.** Ninguna.
7. **Crea y mantiene.** Human.
8. **Veredicto.** Entidad nueva con 2 filas y un registro mínimo (id, repo, entornos). Renombrar el tipo `proyecto` de recursos a `proyecto-de-servicio` para quitar la colisión. Lo decide el dato: 4 sentidos de una palabra, 0 registros.
9. **No sé.** Si el sistema de diseño necesita ser proyecto propio; depende de si se reutiliza en otro producto (hoy no hay otro).

### app / identidad de máquina (candidato)
1. **Qué es.** Las GitHub Apps `homenu-sesiones` (App ID 5260552; tokens de 1 h; contents, PRs, issues y workflows de escritura, workflows desde el 15 oct 2026) y `homenu-dependabot-merge` (App ID 5250358; contents, PRs y workflows de escritura; fusiona los PR de actions) (INVENTARIO). Más service accounts de 1Password (2), la deploy key de Mercadona y el bot «HoMenu avisos».
2. **Quién la lee.** `scripts/lib/tokenSesion.mjs` (la primera), `dependabot-auto.yml` (la segunda), recursos.json (4 filas: app y clave de cada una).
3. **Nivel.** Pieza de `resource`.
4. **Relaciones.** Es-un identity (subtipo). Cada App → su clave (1:1, campo en recursos por convención de id: `-clave`). Parte-de factoría.
5. **Ciclo de vida.** Creada → instalada → clave rotada. Pablo.
6. **Fuente y copias.** Permisos: panel de GitHub (fuente), INVENTARIO (copia en prosa «de diseño, sin recomprobar»). La App de sesiones tuvo Workflows quitado por revisión de `seguridad` (10 oct 2026) y lo recuperó por decisión de Pablo (#422, 15 oct 2026).
7. **Crea y mantiene.** Human, irreducible.
8. **Veredicto.** No es entidad; es un valor del tipo (`app`) de resource/identity. Lo decide que ya cabe en `resource` sin campos nuevos más allá de `capacidades`.
9. **No sé.** Si los permisos reales coinciden con INVENTARIO; solo se ve con `gh api /app` o en el panel (Pablo).

### permission / capability (candidato)
1. **Qué es.** Lo que una identidad puede hacer. Hoy vive en tres sitios que no se conocen: permisos de App en prosa (INVENTARIO), `settings.json` (41 `allow`, 5 `deny`) y rulesets de GitHub (`scripts/rulesets.mjs`, plano 7). La bóveda de lectura es otra forma de permiso.
2. **Quién la lee.** El plano 7 (seguridad), la guardia, el juez `seguridad`.
3. **Nivel.** No aplica; son atributos.
4. **Relaciones.** identity 1:N capacidades (none).
5. **Ciclo de vida.** Se cambia al ampliar permisos de `settings.json` (pide el sí de Pablo según `CLAUDE.md`).
6. **Fuente y copias.** Tres fuentes distintas, ninguna generada de otra.
7. **Crea y mantiene.** Human con juez.
8. **Veredicto.** Pasa a campo `capacidades` (vocabulario cerrado) de resource, y solo para identidades de máquina. Lector: el plano 7. Si no se compromete un lector, no se añade (principio «ningún campo sin lector»).
9. **No sé.** Si el plano 7 podría medir hoy ese campo; se mira en `planos.json`, nivel 7.

### plane
1. **Qué es.** Uno de 13 planos: una pregunta («¿Dónde vive el código y cómo llega a producción?») con criterios por nivel (0-4/5) y agentes responsables (`ops/planos.json`; tabla de `ops/PLANOS.md`).
2. **Quién la lee.** `npm run planos`, `ops/planos.test.js`, workflow semanal `planos-semanal.yml`, `/orquestar`.
3. **Nivel.** Meta: define el molde de evaluación. Las piezas son los criterios con tipo (`fichero_existe`, `regla_github`, `a_juicio`...). Niveles medidos al 9 oct: 1-13 = 3,3,3,2,1,1,2,1,1,1,3,1,1.
4. **Relaciones.** Referencia a agentes (N:M, campo `agentes`); sin relación de contención: los planos miden **a través de** factoría y proyecto, no cuelgan de ellos. Plano 5 «Entornos» sí toca environment; plano 8 «Datos» toca table y migration.
5. **Ciclo de vida.** Se mide semanalmente; cada juicio caduca a 30 días. Lo cambia el agente `gobierno`.
6. **Fuente y copias.** `planos.json` es fuente y genera `PLANOS.md` (derivado, con test).
7. **Crea y mantiene.** Agent, con intervención humana al decidir el criterio.
8. **Veredicto.** Se queda, fuera del eje de contención. Dato: ya es el registro mejor hecho de la familia (id, test, derivado generado). Inconsistencia: el plano 11 «Entrada del trabajo» tiene como responsable «la sesión principal», que no es agente.
9. **No sé.** Si el plano mide por proyecto o solo el repo MenuPlan (`repo` fijo en el JSON); es una sola línea, pero implica que el Panel no está medido.

### zone
1. **Qué es.** «El conjunto de ficheros, por sus rutas, al que aplica una regla, un dominio o un término del glosario» (`ops/glosario/terminos/zona.json`).
2. **Quién la lee.** Rutas de `dominios-skills.json`, `.claude/rules`, `npm run tarea -- --zona`, `npm run issues -- --zonas`.
3. **Nivel.** No aplica: es un selector.
4. **Relaciones.** Referencia a ficheros por patrón de ruta (N:M, campo `rutas`).
5. **Ciclo de vida.** Sin ciclo; lo que cambia es el patrón.
6. **Fuente y copias.** Patrones repetidos en `dominios-skills.json`, reglas y `ops/MODULOS.json`.
7. **Crea y mantiene.** Human/agent al añadir un dominio.
8. **Veredicto.** Pasa a campo (`rutas`) y se usa para una cosa nueva: declarar la zona `factoria` por rutas (`.claude`, `.github`, `ops`, `scripts`, `docs/ops`...) frente a `producto`. Con eso el 906 frente a 877 se cuenta sin mover nada y es la cifra de «antes» si algún día se separa. Lo decide que ya existe el mecanismo y no cuesta una entidad.
9. **No sé.** Dónde caen los 265 scripts que mezclan los dos mundos; se averigua leyéndolos y clasificándolos (hay 35 con nombre de catálogo o imagen).

### workspace (candidato)
1. **Qué es.** Un «workspace» aparece una vez, en `alta-de-secreto`: el workspace de la consola de Anthropic donde se crea la clave y que fija su límite de gasto. No hay otra definición.
2. **Quién la lee.** Nadie (es texto de skill).
3. **Nivel.** No aplica.
4. **Relaciones.** Sería atributo de la clave de Anthropic (1:N), none.
5. **Ciclo de vida.** Sin datos.
6. **Fuente y copias.** Consola de Anthropic.
7. **Crea y mantiene.** Human.
8. **Veredicto.** No es entidad. Si se quiere registrar, es un campo `ambito` de la clave `anthropic-clave-evals`; hoy esa clave tiene creado y caducidad «por-confirmar», así que no hay ni dato que rellenar. Ojo con la confusión con `carpeta de trabajo`.
9. **No sé.** Cuántos workspaces hay en la consola; lo mira Pablo.

### objective (candidato)
1. **Qué es.** No es entidad del repo. Aparece como el primer nivel del GQM de `ops/metricas.json` (objetivo, pregunta, métrica) y como «tamaño de objetivo» táctil en un estándar de diseño.
2. **Quién la lee.** `ops/metricas.test.js` (si valida el campo; no lo he comprobado).
3. **Nivel.** No aplica.
4. **Relaciones.** objetivo 1:N pregunta 1:N métrica, dentro de `metric`.
5. **Ciclo de vida.** Sin datos.
6. **Fuente y copias.** `metricas.json`.
7. **Crea y mantiene.** Human.
8. **Veredicto.** No es entidad: pasa a campo de `metric`. Los objetivos de producto o de proyecto (qué quiere HoMenu) tampoco tienen registro; si Pablo los quiere, serían un campo de `project`, no una familia nueva.
9. **No sé.** Si `metricas.test.js` obliga a que cada métrica tenga objetivo; se lee el test.

---

## Qué diría un modelo completo, en una frase por regla

- Contención = factoría > proyecto > entorno. Solo `project`, `environment` y `team-member` son piezas de contención reales; todo lo demás es recurso con un `parte_de`.
- Proveedor (service), almacén (vault) y clasificación (plane, zone) son ejes distintos y no son niveles.
- `resource` se convierte en la tabla base de secret, vault, identity, app, repo y cuenta; con dos campos nuevos (`parte_de`, `proyecto`) y uno con lector si se acepta (`capacidades`).
