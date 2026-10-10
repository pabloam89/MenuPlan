# Normas de HoMenu

<!-- Generado desde ops/normas.json y .claude/hooks/avisos-guardia.mjs con «npm run normas -- --escribir». No se edita a mano: ops/normas.test.js lo compara. -->

Una norma es algo que el repo dice que se cumple siempre. Cada una se escribe por campos (nombre, sujeto, fuerza, condición, exigencia, control; plantilla de `scripts/lib/regla.mjs`, guía en `docs/ops/REDACCION.md`) y su frase sale de ellos. La tabla dice también quién la hace cumplir, con qué se comprueba y qué avisos de la guardia la citan. Un aviso que salta dice, en este orden, qué se niega, por qué, qué hacer en su lugar y a quién pedirlo, y deja en el registro de eventos su id y el de su norma.

## Normas

| Norma | Sujeto | Fuerza | Frase | Quién la hace cumplir | Control | Avisos de la guardia |
|---|---|---|---|---|---|---|
| `evals-tope-mensual` | lola | NO DEBE | **Tope mensual de evals.** El bot Lola NO DEBE gastar más de 75 € al mes en evals. | script_propio · rota | test: `scripts/lib/evals.test.js` | — |
| `copia-nocturna-base` | base | DEBE | **Copia nocturna de la base.** La base de datos de producción DEBE copiarse cada noche, cifrada y con un aviso si falla. | nada · rota | test: `scripts/copias.test.js` | — |
| `copias-solo-con-su-rol` | base | DEBE | **Copia con su propio rol.** Cuando se hace su copia nocturna, la base de datos de producción DEBE entrar solo con el usuario copia_lectura. | script_propio · semidura | test: `scripts/copias.test.js` | — |
| `tope-diario-ia` | endpoint | DEBE | **Tope diario de IA.** Cuando usa IA, cada endpoint de la app DEBE aplicar un tope diario global de IA. | codigo_en_ejecucion · dura | test: `api/_guard.test.js` | — |
| `tope-diario-voz` | lola | DEBE | **Tope diario de voz.** Cuando transcribe notas de voz, el bot Lola DEBE aplicar un tope diario. | codigo_en_ejecucion · dura | test: `api/_bot/voz.test.js` | — |
| `jueces-sin-escritura` | agente | NO DEBE | **Jueces sin escritura.** Cuando es un juez, cada agente NO DEBE tener Edit ni Write, contando las herramientas que da la memoria. | ci · dura | test: `.claude/agentes.test.js` | — |
| `produccion-solo-desde-main` | despliegue | DEBE | **Producción solo desde main.** Cada despliegue a producción DEBE salir solo de main. | nada · blanda | juicio | — |
| `ajustes-servicios-ok-pablo` | ajuste | DEBE | **Ajustes con OK de Pablo.** Cada cambio de ajustes de GitHub, Vercel o Supabase DEBE pedir el OK de Pablo. | clasificador · blanda | juicio | `reglas-del-repo` |
| `secretos-ok-pablo` | secreto | DEBE | **Secretos con OK de Pablo.** Cuando se crea, rota o cambia, cada secreto o variable de entorno DEBE pedir el OK de Pablo. | clasificador · blanda | juicio | — |
| `permisos-ok-pablo` | permiso | DEBE | **Permisos con OK de Pablo.** Cada cambio de permisos o de hooks de Claude DEBE pedir el OK de Pablo. | guardia · blanda | test: `.claude/hooks/guardia.test.js` | — |
| `evals-antes-de-fusionar` | lola | DEBE | **Evals antes de fusionar.** Cuando cambia lo que lee, el bot Lola DEBE pasar las evals antes de fusionar. | nada · blanda | juicio | `escribir-lo-de-lola` |
| `endpoint-nuevo-juez-seguridad` | endpoint | DEBE | **Endpoint nuevo al juez.** Cuando es nuevo, cada endpoint de la app DEBE pasar por el juez seguridad. | nada · blanda | juicio | — |
| `main-solo-por-pr-con-tests` | main | DEBE | **Main solo por PR.** La rama main DEBE recibir cambios solo por PR con el check tests en verde. | github_regla · semidura | planos: check_obligatorio:main | — |
| `rutas-protegidas-aprobacion-de-dueno` | pr | DEBE | **Aprobación de dueño.** Cuando toca las rutas de .github/CODEOWNERS, cada PR DEBE llevar la aprobación de su dueño. | github_regla · blanda | test: `scripts/rulesets.test.js` | `aprobar-pr` |
| `main-solo-pablo` | main | DEBE | **Main solo de Pablo.** La rama main DEBE recibir subidas y fusiones solo de Pablo. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `push-a-main`, `fusion-con-repo-ajeno`, `fusion-auto`, `fusion-fuera-de-staging`, `fusion-base-ilegible`, `base-cambiada`, `fusion-por-api` |
| `aplicar-migracion-con-permiso` | migracion | DEBE | **Permiso para aplicar migración.** Cuando se aplica, cada migración DEBE estar en staging, tener un ensayo reciente y el OK del juez auditor-datos. | script_propio · semidura | test: `scripts/lib/permisoAplicar.test.js` | — |
| `ensayo-no-cambia-nada` | migracion | NO DEBE | **Ensayo sin cambios.** Cuando se ensaya, cada migración NO DEBE cambiar nada. | script_propio · semidura | script: `scripts/apply-migration.mjs` | — |
| `guardia-vigila-cada-orden` | guardia | DEBE | **Guardia en cada orden.** La guardia de Claude DEBE vigilar cada orden de una sesión. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `fusion-sin-numero`, `entrada-ilegible` |
| `migracion-pablo-solo-pablo` | migracion | DEBE | **Migraciones de Pablo.** Cuando contrae o toca permisos (--pablo), cada migración DEBE lanzarla solo Pablo. | guardia · semidura | test: `scripts/lib/permisoAplicar.test.js` | `apply-migration-pablo` |
| `sin-sql-a-mano` | sesion | NO DEBE | **Sin SQL a mano.** Cada sesión de Claude NO DEBE escribir en producción con SQL a mano. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `sql-contra-produccion` |
| `staging-exige-tests` | staging | DEBE | **Staging exige tests.** La rama staging DEBE recibir cambios solo con el check tests en verde, sea por PR o por push. | github_regla · semidura | planos: check_obligatorio:staging | `push-directo-a-staging` |
| `limite-mensajes-bot` | lola | DEBE | **Límite mensual de mensajes.** El bot Lola DEBE limitar a 100 los mensajes al mes de cada casa. | codigo_en_ejecucion · semidura | juicio | — |
| `limite-por-ip` | endpoint | DEBE | **Límite por IP.** Cuando usa IA, cada endpoint de la app DEBE tener un límite por IP. | codigo_en_ejecucion · semidura | juicio | — |
| `rol-solo-lectura` | base | DEBE | **Consultas de solo lectura.** Cuando se consulta, la base de datos de producción DEBE entrar con el rol de solo lectura. | base_datos · semidura | test: `scripts/rolLectura.test.js` | — |
| `migracion-aplicada-no-se-edita` | migracion | DEBE | **Migración aplicada intocable.** Cuando ya está aplicada, cada migración DEBE dejarse como está y corregirse con una migración nueva. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `migracion-estado-ilegible`, `migracion-aplicada` |
| `secretos-en-environments` | secreto | DEBE | **Secretos en environments.** Cuando está en un environment, cada secreto o variable de entorno DEBE llegar solo a la rama staging. | github_regla · dura | planos: environment_solo_rama:staging | — |
| `secretos-de-repo` | secreto | NO DEBE | **Sin secretos de repo.** Cuando es de Actions, cada secreto o variable de entorno NO DEBE estar a nivel de repo. | nada · blanda | planos: secretos_de_repo | — |
| `deploy-key-unica` | repo | DEBE | **Una sola deploy key.** El repositorio DEBE tener una sola deploy key de escritura, la del cron; otra pide el OK de Pablo. | nada · blanda | planos: deploy_keys_escritura | — |
| `caducidad-token-vercel` | secreto | DEBE | **Caducidad del token de Vercel.** Cuando es el token de Vercel, cada secreto o variable de entorno DEBE caducar a los 90 días, con la fecha anotada y la rotación antes. | persona · blanda | juicio | — |
| `caducidad-clave-anthropic-evals` | secreto | DEBE | **Caducidad de clave de evals.** Cuando es la clave de Anthropic de las evals, cada secreto o variable de entorno DEBE caducar al año. | nada · blanda | juicio | — |
| `presupuesto-por-alcance` | fondo | DEBE | **Presupuesto por alcance.** Cada problema de fondo DEBE sacar su esfuerzo del presupuesto de su alcance y su causa, y no de lo que decida la sesión. | nada · blanda | test: `ops/presupuestos.test.js` | — |
| `rondas-tope-duro` | fondo | NO DEBE | **Tope de rondas.** Cada problema de fondo NO DEBE pasar de las rondas del presupuesto de constructor y juez. | script_propio · semidura | test: `scripts/fondos-rondas.test.js` | — |
| `skill-antes-de-tocar` | sesion | DEBE | **Skill antes de tocar.** Cuando edita las rutas de un dominio o lanza uno de sus comandos de riesgo, cada sesión de Claude DEBE abrir antes la skill del dominio. | guardia · blanda | test: `.claude/hooks/guardia.test.js` | `puerta-de-skill-edicion` |
| `quien-construye-no-juzga` | agente | NO DEBE | **Constructor distinto del juez.** Cada agente NO DEBE juzgar lo que ha construido. | nada · blanda | juicio | — |
| `test-visto-fallar` | codigo | DEBE | **Test visto fallar.** Cuando es un test nuevo, el código del producto DEBE verse fallar una vez antes de creérselo. | nada · blanda | juicio | — |
| `plan-b-migracion` | codigo | NO DEBE | **Plan B de migración.** El código del producto NO DEBE depender de que la migración ya esté aplicada. | nada · blanda | juicio | — |
| `principios-revision` | principio | DEBE | **Principios en revisión.** Cuando está marcado [revisión], cada principio de datos DEBE ser vigilado por el juez auditor-datos. | persona · blanda | juicio | — |
| `gasto-ok-pablo` | gasto | DEBE | **Gasto con OK de Pablo.** Cada gasto de dinero DEBE pedir el OK de Pablo. | nada · blanda | juicio | — |
| `push-protection` | repo | DEBE | **Secret scanning activo.** El repositorio DEBE tener activos el secret scanning y la push protection. | proveedor · semidura | planos: push_protection | — |
| `uniones-antes-de-borrar` | sesion | DEBE | **Uniones antes de borrar.** Cuando borra una carpeta, cada sesión de Claude DEBE quitar antes sus uniones. | script_propio · semidura | test: `scripts/limpiar-worktrees.test.js` | — |
| `linea-runbook` | pr | DEBE | **Línea «Runbook:» del PR.** Cuando toca un dominio, cada PR DEBE llevar la línea «Runbook:». | ci · semidura | test: `scripts/runbook-pr.test.js` | — |
| `lint-con-linea-base` | codigo | NO DEBE | **Lint con línea base.** El código del producto NO DEBE añadir errores de lint nuevos respecto a la línea base. | ci · semidura | workflow: `.github/workflows/tests.yml` | — |
| `principios-auto` | principio | DEBE | **Principios automáticos.** Cuando está marcado [auto], cada principio de datos DEBE comprobarse en el CI. | ci · dura | test: `supabase/principios.test.js` | — |
| `tabla-modulo-dueno` | dato | DEBE | **Una tabla, un dueño.** Cuando es una tabla, cada tabla y cada campo de la base DEBE tener un solo módulo dueño. | ci · semidura | test: `supabase/cableado.test.js` | — |
| `tope-canario` | lola | DEBE | **Tope del canario.** El bot Lola DEBE limitar el canario a 2 por hora y 30 al día. | codigo_en_ejecucion · dura | test: `api/bot/canario.test.js` | — |
| `sin-push-forzado` | repo | NO DEBE | **Sin push forzado.** El repositorio NO DEBE admitir push forzado ni borrado de main y staging. | github_regla · dura | planos: sin_push_forzado:main | — |
| `pr-al-dia-y-closes` | pr | DEBE | **PR al día con Closes.** Cada PR DEBE abrirse con la rama al día y, si la rama es de un issue, con Closes #n. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `pr-sin-closes`, `rama-atrasada`, `rama-sin-comprobar`, `pr-pisado-por-staging`, `pr-choques-sin-comprobar` |
| `sin-git-stash` | sesion | NO DEBE | **Sin git stash.** Cada sesión de Claude NO DEBE usar git stash. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `stash` |
| `sin-git-add-todo` | sesion | NO DEBE | **Sin git add masivo.** Cada sesión de Claude NO DEBE usar git add . ni commit -a. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `add-a-ciegas` |
| `no-trabajar-en-principal` | sesion | NO DEBE | **Sin trabajo en la principal.** Cada sesión de Claude NO DEBE trabajar en la carpeta principal. | guardia · semidura | test: `.claude/hooks/principal.test.js` | `carpeta-principal` |
| `issues-con-buscar-antes` | issue | DEBE | **Issues con búsqueda previa.** Cuando se crea, cada issue DEBE crearse con npm run issues -- --nuevo. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `issue-a-pelo` |
| `skill-antes-de-riesgo` | sesion | DEBE | **Skill antes de riesgo.** Cuando lanza el primer comando de riesgo de un dominio, cada sesión de Claude DEBE abrir antes su skill. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `puerta-de-skill-comando` |
| `pendientes-a-issue` | sesion | DEBE | **Pendientes a un issue.** Cuando deja decisiones o pendientes, cada sesión de Claude DEBE registrarlos en un issue. | guardia · semidura | test: `.claude/hooks/pendientes.test.js` | — |
| `catalogo-mercadona-minimo` | catalogo.mercadona | NO DEBE | **Mínimo del catálogo Mercadona.** El catálogo de productos de Mercadona NO DEBE guardarse con menos de 500 productos ni con una caída de más del 20 %. | ci · dura | test: `scripts/mercadona-sync-comprobar.test.js` | — |
| `vocabulario-cerrado` | dato | DEBE | **Vocabulario cerrado.** Cuando se va a agrupar o contar, cada tabla y cada campo de la base DEBE tener un vocabulario cerrado. | nada · blanda | test: `src/lib/vocabularios.test.js` | — |
| `campo-con-lector` | dato | DEBE | **Dato con lector.** Cada tabla y cada campo de la base DEBE tener algún lector. | persona · blanda | juicio | — |
| `hora-de-madrid` | sesion | DEBE | **Hora de Madrid.** Cuando da una hora, cada sesión de Claude DEBE sacarla de npm run hora y nunca de date. | nada · blanda | test: `scripts/hora.test.js` | — |
| `fuera-de-onedrive` | sesion | NO DEBE | **Fuera de OneDrive.** Cada sesión de Claude NO DEBE trabajar dentro de OneDrive. | guardia · blanda | juicio | — |
| `tests-del-fichero` | sesion | DEBE | **Tests del fichero.** Cada sesión de Claude DEBE lanzar los tests de los ficheros que toca y no la suite entera. | nada · blanda | juicio | — |
| `lecciones-a-un-test` | fallo | DEBE | **Aprendizajes a un test.** Cada fallo DEBE dejar su aprendizaje en un test y nunca en la memoria. | nada · blanda | juicio | — |
| `cuando-algo-falla` | fallo | DEBE | **Hasta el problema de fondo.** Cada fallo DEBE analizarse hasta su problema de fondo y registrarse como caso en un issue. | ci · semidura | test: `scripts/casos-pr.test.js` | `pr-sin-casos` |
| `repo-publico-sin-detalle` | repo | NO DEBE | **Repo público sin detalle.** El repositorio NO DEBE contener nada sensible en un issue, un commit o un PR. | nada · blanda | juicio | — |
| `fondo-con-ficha-y-controles` | fondo | DEBE | **Ficha y controles del fondo.** Cada problema de fondo DEBE llevar una ficha válida y pasar sus controles en cada evento del issue. | script_propio · semidura | test: `scripts/fondos-evento.test.js` | — |
| `plan-tres-encargos-con-preventivo` | fondo | DEBE | **Plan de tres encargos.** Cada problema de fondo DEBE tener como mucho tres encargos, cada uno con su bloque encargo completo, y al menos uno preventivo con mecanismo automático. | script_propio · semidura | test: `scripts/fondos-encargos.test.js` | — |
| `pr-agente-y-closes-en-ci` | pr | DEBE | **Agente y Closes del PR.** Cada PR DEBE llevar la línea Agente: y, si la rama es de un issue, su Closes #n. | ci · semidura | test: `scripts/fondos-pr.test.js` | — |
| `eventos-de-hooks-registrados` | guardia | DEBE | **Eventos de hooks registrados.** La guardia de Claude DEBE dejar una línea en el registro local de eventos por cada bloqueo, cada permiso que pide y cada skill que se abre. | guardia · semidura | test: `.claude/hooks/eventos.test.js` | — |
| `estandar-por-tarea-de-agente` | agente | DEBE | **Estándar por tarea.** Cada agente DEBE listar sus tareas, cada una con su estándar y su fuente pública. | ci · semidura | test: `ops/estandares-agentes.test.js` | — |
| `estandar-citado-en-el-informe` | agente | DEBE | **Estándar citado en el informe.** Cuando construye, cada agente DEBE citar en su informe el estándar de la tarea (ESTÁNDAR:), que el revisor contrasta con el diff. | persona · blanda | test: `.claude/agentes.test.js` | — |
| `presupuestos-se-recalibran` | presupuesto | DEBE | **Presupuestos recalibrados.** Cada presupuesto del catálogo de esfuerzo DEBE recalibrarse con lo medido. | persona · blanda | test: `scripts/fabrica.test.js` | — |
| `criterios-de-forja-en-un-catalogo` | forja | DEBE | **Criterios de la forja.** El catálogo de criterios de la forja DEBE guardar cada criterio una vez, en ops/forja.json, con su capa, su fuente y su control. | ci · dura | test: `ops/forja.test.js` | — |
| `push-forzado-con-permiso` | sesion | DEBE | **Push forzado con permiso.** Cuando hace un push forzado, cada sesión de Claude DEBE confirmar antes que la rama es suya y que nadie más trabaja en ella. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `push-forzado` |
| `build-con-prebuild` | sesion | NO DEBE | **Build con prebuild.** Cada sesión de Claude NO DEBE lanzar vite build a secas. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `vite-build-a-secas` |
| `variables-production-solo-pablo` | secreto | DEBE | **Variables de producción de Pablo.** Cuando son las variables de Production de Vercel, cada secreto o variable de entorno DEBE bajarse y listarse solo desde la terminal de Pablo. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `vercel-production` |
| `claves-de-pablo-solo-pablo` | secreto | DEBE | **Claves de Pablo en 1Password.** Cuando están en la bóveda HoMenu, cada secreto o variable de entorno DEBE leerse solo desde la terminal de Pablo. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `op-de-pablo` |
| `edicion-con-edit-y-write` | sesion | NO DEBE | **Edición con Edit y Write.** Cada sesión de Claude NO DEBE editar ficheros del repo con Set-Content, Out-File o Add-Content. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `escribir-por-terminal` |
| `sesion-con-su-identidad` | sesion | NO DEBE | **Sesión con su identidad.** Cada sesión de Claude NO DEBE salirse de la identidad de la App homenu-sesiones ni usar las credenciales de Pablo. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `token-de-sesion-quitado`, `identidad-git-cambiada`, `credenciales-guardadas`, `powershell-sin-token` |
| `token-de-sesion-no-se-imprime` | sesion | NO DEBE | **Token de sesión sin imprimir.** Cada sesión de Claude NO DEBE imprimir el token de la sesión. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `token-impreso` |
| `issues-no-se-borran` | issue | NO DEBE | **Issues sin borrado.** Cada issue NO DEBE borrarse ni trasladarse, ni borrar sus etiquetas. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `borrar-issue` |
| `migracion-numero-libre` | migracion | NO DEBE | **Número de migración libre.** Cuando se crea, cada migración NO DEBE usar un número que staging ya usa. | guardia · semidura | test: `.claude/hooks/guardia.test.js` | `migracion-numero-ocupado` |
| `regex-de-alimento-con-frontera` | alimento.regex | DEBE | **Regex con frontera de palabra.** Cada regex sobre nombres de alimento DEBE usar la frontera de palabra (\b) y probarse contra el catálogo entero, no contra los ejemplos del fallo. | nada · blanda | juicio | — |
| `foodid-nulo-mira-las-dos-tablas` | alimento.decision | DEBE | **FoodId nulo y dos tablas.** Cuando el foodId es null, cada decisión de un foodId en las tablas BEDCA y CIQUAL DEBE decidirse mirando todos los candidatos y las dos tablas, BEDCA (española) y CIQUAL (francesa). | nada · blanda | juicio | — |
| `masa-no-comestible-fuera-de-la-compra` | receta | DEBE | **Masa no comestible fuera.** Cada receta del catálogo DEBE descontar de la nutrición, y no de la lista de la compra, la masa que no se come. | ci · semidura | test: `src/data/racion.test.js` | — |
| `solo-estrella-se-propone` | receta | DEBE | **Solo estrella se propone.** Cuando se propone, cada receta del catálogo DEBE tener estrella: true. | ci · semidura | test: `src/data/estrella.test.js` | — |
| `pool-corto-es-error` | catalogo | DEBE | **Pool corto es error.** Cuando el pool de recetas se queda corto, el catálogo de recetas y alimentos DEBE devolver error y no rellenar con recetas sin estrella. | nada · blanda | juicio | — |
| `estrella-a-mano-con-foto` | receta | DEBE | **Estrella a mano con foto.** Cuando sube al catálogo estrella, cada receta del catálogo DEBE subir a mano y con su foto en src/assets/dishes/dishImages.json. | nada · blanda | juicio | — |
| `cocina-extranjera-apagada` | receta | DEBE | **Cocina extranjera apagada.** Cuando es de cocina extranjera, cada receta del catálogo DEBE quedar apagada salvo que la casa la marque. | ci · semidura | test: `src/utils/filterRecipesCocinas.test.js` | — |
| `sin-pairing-de-platos` | receta | NO DEBE | **Sin pairing de platos.** Cada receta del catálogo NO DEBE combinarse con guarniciones. | nada · blanda | juicio | — |
| `build-valida-catalogo` | catalogo | DEBE | **Build valida el catálogo.** Cuando se hace el build, el catálogo de recetas y alimentos DEBE validarse con scripts/validate-catalog.mjs, el filtro que usa Vercel. | ci · semidura | script: `scripts/validate-catalog.mjs` | — |
| `procedencia-del-numero` | alimento | DEBE | **Procedencia de cada número.** Cuando su número está en uso, cada alimento del catálogo DEBE decir con qué autoridad se eligió su ficha. | ci · dura | test: `src/data/procedencia.test.js` | — |
| `nombre-y-clave-al-mismo-ingrediente` | receta | DEBE | **Nombre y clave, mismo ingrediente.** Cuando una línea apunta a un ingrediente por nombre y por ingredientId, cada receta del catálogo DEBE resolver al mismo ingrediente por los dos caminos. | ci · dura | test: `src/data/dosCarriles.test.js` | — |
| `vispera-no-es-rapida` | receta | NO DEBE | **Víspera no es rápida.** Cuando hay que empezarla otro día, cada receta del catálogo NO DEBE proponerse como plato rápido. | ci · dura | test: `src/data/vispera.test.js` | — |
| `aparato-en-su-vocabulario` | receta | DEBE | **Aparato en su vocabulario.** Cuando declara un aparato, cada receta del catálogo DEBE usar en methods[].appliance solo ids de APPLIANCE_LABELS, y en requiredAppliance solo aparatos declarables. | ci · dura | test: `src/data/aparatos.test.js` | — |

## Sujetos

| Sujeto | En la frase | Normas |
|---|---|---|
| base | la base de datos de producción | 3 |
| lola | el bot Lola | 5 |
| endpoint | cada endpoint de la app | 3 |
| agente | cada agente | 4 |
| despliegue | cada despliegue a producción | 1 |
| ajuste | cada cambio de ajustes de GitHub, Vercel o Supabase | 1 |
| secreto | cada secreto o variable de entorno | 7 |
| permiso | cada cambio de permisos o de hooks de Claude | 1 |
| main | la rama main | 2 |
| staging | la rama staging | 1 |
| pr | cada PR | 4 |
| migracion | cada migración | 5 |
| sesion | cada sesión de Claude | 16 |
| repo | el repositorio | 4 |
| fondo | cada problema de fondo | 4 |
| codigo | el código del producto | 3 |
| principio | cada principio de datos | 2 |
| gasto | cada gasto de dinero | 1 |
| dato | cada tabla y cada campo de la base | 3 |
| fallo | cada fallo | 2 |
| issue | cada issue | 2 |
| guardia | la guardia de Claude | 2 |
| presupuesto | cada presupuesto del catálogo de esfuerzo | 1 |
| forja | el catálogo de criterios de la forja | 1 |
| catalogo.mercadona | el catálogo de productos de Mercadona | 1 |
| catalogo | el catálogo de recetas y alimentos | 2 |
| receta | cada receta del catálogo | 8 |
| alimento | cada alimento del catálogo | 1 |
| alimento.regex | cada regex sobre nombres de alimento | 1 |
| alimento.decision | cada decisión de un foodId en las tablas BEDCA y CIQUAL | 1 |

## Cómo se comprueban

| Tipo de control | Qué es | Normas |
|---|---|---|
| test | Un test del repo que falla en el CI | 58 |
| planos | Un criterio de la medición semanal de ops/planos.json (con red, cada lunes) | 7 |
| workflow | Un paso de un workflow de GitHub Actions que falla el check | 1 |
| script | Un script del repo que comprueba y se lanza a mano o en el build | 2 |
| juicio | El juicio de una persona o de un LLM sobre sus casos: no hay nada que falle solo | 24 |

## Avisos de la guardia

| Aviso | Norma | Qué se niega |
|---|---|---|
| `push-a-main` | `main-solo-pablo` | Subir a main desde una sesión |
| `push-directo-a-staging` | `staging-exige-tests` | Subir directo a staging |
| `push-forzado` | `push-forzado-con-permiso` | Hacer un push forzado |
| `pr-sin-closes` | `pr-al-dia-y-closes` | Abrir el PR sin `Closes #{issue}` en su cuerpo |
| `pr-sin-casos` | `cuando-algo-falla` | Abrir el PR sin una línea «Casos:» válida |
| `rama-atrasada` | `pr-al-dia-y-closes` | Abrir el PR con la rama atrasada |
| `rama-sin-comprobar` | `pr-al-dia-y-closes` | Abrir el PR sin saber si la rama tiene lo último de staging |
| `pr-pisado-por-staging` | `pr-al-dia-y-closes` | Fusionar este PR sin ponerlo al día |
| `pr-choques-sin-comprobar` | `pr-al-dia-y-closes` | Fusionar este PR sin saber si staging ha tocado lo mismo |
| `fusion-con-repo-ajeno` | `main-solo-pablo` | Fusionar con `gh -R … pr merge` |
| `fusion-sin-numero` | `guardia-vigila-cada-orden` | Fusionar sin el número del PR justo detrás de `merge` |
| `fusion-auto` | `main-solo-pablo` | Fusionar con `gh pr merge --auto` |
| `fusion-fuera-de-staging` | `main-solo-pablo` | Fusionar un PR que va contra {base} |
| `fusion-base-ilegible` | `main-solo-pablo` | Fusionar un PR sin conocer su rama base |
| `base-cambiada` | `main-solo-pablo` | Cambiar la base de un PR a {base} |
| `fusion-por-api` | `main-solo-pablo` | Fusionar, cambiar la base de un PR o borrar por `gh api` |
| `stash` | `sin-git-stash` | Usar `git stash` |
| `add-a-ciegas` | `sin-git-add-todo` | Usar `git add .`, `-A` o `commit -a` |
| `vite-build-a-secas` | `build-con-prebuild` | Lanzar `vite build` a secas |
| `issue-a-pelo` | `issues-con-buscar-antes` | Crear un issue con `gh issue create` |
| `borrar-issue` | `issues-no-se-borran` | Borrar o trasladar un issue, o borrar una etiqueta |
| `escribir-por-terminal` | `edicion-con-edit-y-write` | Usar Set-Content, Out-File o Add-Content sobre ficheros del repo |
| `carpeta-principal` | `no-trabajar-en-principal` | Trabajar en la carpeta principal (C:\dev\MenuPlan) |
| `puerta-de-skill-comando` | `skill-antes-de-riesgo` | Lanzar este comando sin haber abierto {las_skills} {lista} |
| `puerta-de-skill-edicion` | `skill-antes-de-tocar` | Editar este fichero sin haber abierto {las_skills} {lista} |
| `escribir-lo-de-lola` | `evals-antes-de-fusionar` | Escribir desde la shell en lo que lee Lola |
| `entrada-ilegible` | `guardia-vigila-cada-orden` | Dejar pasar una orden que la guardia no ha podido leer |
| `vercel-production` | `variables-production-solo-pablo` | Bajar o listar las variables de Production de Vercel |
| `op-de-pablo` | `claves-de-pablo-solo-pablo` | Leer 1Password fuera de `npm run op -- …`, o tocar lo que es de Pablo |
| `apply-migration-pablo` | `migracion-pablo-solo-pablo` | Lanzar `apply-migration` con `--pablo` |
| `sql-contra-produccion` | `sin-sql-a-mano` | Escribir SQL a mano que escribe, borra o cambia permisos contra producción |
| `migracion-numero-ocupado` | `migracion-numero-libre` | Usar el número {numero} para una migración |
| `migracion-estado-ilegible` | `migracion-aplicada-no-se-edita` | Editar {nombre} sin saber si está aplicada |
| `migracion-aplicada` | `migracion-aplicada-no-se-edita` | Editar {nombre}, que ya está aplicada en producción |
| `token-de-sesion-quitado` | `sesion-con-su-identidad` | Quitar o vaciar GH_TOKEN |
| `identidad-git-cambiada` | `sesion-con-su-identidad` | Cambiar de dónde saca git sus credenciales o quién firma (credential.helper, GIT_CONFIG_*, GIT_AUTHOR_*, GIT_COMMITTER_*) |
| `credenciales-guardadas` | `sesion-con-su-identidad` | Sacar o cambiar las credenciales guardadas del PC (gh auth token, login o switch, git credential, cmdkey) |
| `powershell-sin-token` | `sesion-con-su-identidad` | Lanzar gh o git (push, pull, fetch, clone) desde PowerShell sin envoltorio |
| `reglas-del-repo` | `ajustes-servicios-ok-pablo` | Cambiar las reglas del repo (rulesets, protección de ramas, colaboradores, secretos, variables, ajustes del repo, environments, hooks o llaves) |
| `aprobar-pr` | `rutas-protegidas-aprobacion-de-dueno` | Aprobar un PR desde una sesión |
| `token-impreso` | `token-de-sesion-no-se-imprime` | Imprimir el token de la sesión |

Total: 92 normas (rota 2, semidura 45, dura 13, blanda 32) y 41 avisos de la guardia.
