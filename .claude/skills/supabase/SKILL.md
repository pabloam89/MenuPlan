---
name: supabase
description: Úsala para operar una base de datos en Supabase: una consulta a producción, «¿está aplicada?», pg_cron y los crons de la base, el login y Auth (Google), copias o backup (lo que llevan; el cómo, hetzner), o cuando algo de la base no cuadra con el repo. No para: escribir una migración (las reglas de migraciones del proyecto y el agente constructor) ni un Postgres propio en un servidor (hetzner).
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: constructor
  comprobado: "2026-10-09"
  normas: [aplicar-migracion-con-permiso, migracion-pablo-solo-pablo, sin-sql-a-mano, rol-solo-lectura, ensayo-no-cambia-nada]
---

# Supabase

Método de la casa. El proyecto de base de datos concreto (su id, su plan, las copias propias, los roles de lectura, cómo se aplica o se borra con migraciones, los crons y lo que ha fallado ahí) no va aquí: está en la ficha de servicio de ese proyecto (`ops/proyectos/<id>/servicios/supabase.md`), que llega con `--proyecto <id>` en el brief.

## Qué es y dónde

- **Un proyecto de Supabase** da Postgres, Auth y RLS; el código depende de las tres, por eso irse de Supabase no es un cambio de proveedor sin más. Antes de operar, saber si es **la única base y es producción**: entonces cada escritura es en datos reales.
- **Quién lo paga**: si cuelga del Marketplace de otra plataforma (Vercel, por ejemplo), el dueño y quien paga es esa cuenta, y el panel de Supabase solo se abre desde ahí.
- **Copias**: el plan **Free no incluye copias de seguridad** ni la vuelta a un minuto (PITR, que además exige Pro y un extra de pago). Si no hay copias del proveedor, las propias se hacen con `pg_dump` de solo lectura a un servidor aparte (skill `hetzner`).
- **Escribir migraciones** no es de esta skill: son las reglas de migraciones del proyecto y el agente `constructor`.
- **Pendiente:** lo que la ficha del proyecto dice que falta (copias instaladas o ensayadas).

## Claves y accesos

Nombres, para qué sirve cada una y dónde viven: `ops/INVENTARIO.md` (fila Supabase). Las direcciones de 1Password, en `ops/env.1password`. La que usan los scripts para conectar se lee con `leerEnv` de `scripts/lib/env.mjs`. El acceso al panel cuelga de quien paga el proyecto.

Para leer, un **rol de solo lectura** (`select` en los esquemas del proyecto, sin `auth`, `cron`, `vault` ni `storage`), a todo o nada: si su variable no está o no se puede leer, el script falla, y como administrador solo se entra con `--admin` explícito y se avisa. Una tabla con columnas de códigos puede dar `select` solo por columnas: `select *` falla y hay que nombrar las columnas (`count(*)` sí vale). **La frontera es la URL, no el rol**: el read only y los tiempos límite son valores por defecto que la sesión puede cambiar, y con su propia sesión quien tenga la URL puede usar `net.http_*`, objetos grandes o bloqueos consultivos (concesiones de Supabase a todos).

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| Consulta a producción | `set session characteristics as transaction read only`, `begin read only`, solo `select`, `rollback` | filas o recuentos; aunque se colara un `update`, Postgres lo rechaza |
| ¿Qué plan y qué copias tiene? | En el navegador, el panel de Supabase → Database → Backups (pestañas «Scheduled backups» y «Point in time»); si cuelga de otra plataforma, se abre desde ella (en Vercel, Storage → la base → **Open in Supabase**) | el plan, y o la lista de copias o el aviso «Free Plan does not include project backups» |
| Ver los jobs de `pg_cron` | `select jobname, schedule from cron.job` en solo lectura | un job por tarea programada |
| Ver quién es `anon` en una función | `select proname, proacl from pg_proc where proname = '<función>'` en solo lectura | `anon` ni `public` en el ACL |

- Cómo se comprueba que una migración está aplicada, cómo se ensaya y se aplica, y cómo se borra una tabla con datos: pasos de un proyecto, en su ficha.
- **El registro de verdad de las migraciones es el del proyecto** (su `ESTADO.md`), no la tabla de migraciones de Supabase (`supabase_migrations.schema_migrations`): si casi todo se aplicó a mano, tiene muy pocas filas.
- Preferir el catálogo (`pg_catalog`, `information_schema`, `cron.job`) a las
  filas de usuarios; si hay que contar filas, contar, no imprimirlas.
- **pg_cron:** un job hace POST a una URL del proyecto con un secreto, o purga lo viejo; las extensiones las pone una migración.
- **Login (Auth)**: Google por OAuth. El proveedor se configura en Supabase → Auth → Providers, con su cliente de Google Cloud; en local, el login solo vuelve a la URL de retorno dada de alta.
- **Funciones `security definer`**: Supabase concede EXECUTE a `anon` y
  `authenticated` por defecto, y revocar a `public` no lo quita. Cada función
  nueva revoca a los tres y concede explícitamente.

## Lo que falló y por qué

- **2026-10-08 · esta skill daba por buena una «pista» de copias continuas y no
  había ninguna copia.** La consulta de solo lectura `pg_stat_archiver` salía
  sana (`archive_mode = on`, `wal-g`, 8.620 ficheros, 0 fallidos) y se tomó por la
  señal de que Supabase guardaba el historial. Causa: ese archivado es de la
  plataforma, y que funcione no quiere decir que el cliente pueda restaurar nada;
  el panel dice que el plan Free no incluye copias. Arreglo: se miró el panel
  (Database → Backups) y la skill dejó de citar el archivado como prueba. Un
  ajuste del servidor no sustituye al panel.
- **2026-09-17 · el registro de migraciones decía 12 y había más de 60
  aplicadas.** Causa: se aplicaban a mano desde el panel. Arreglo: un registro
  del proyecto con un objeto testigo por migración y un script que lo comprueba solo.
- **2026-09 · `anon` podía ejecutar funciones de compartir.**
  Causa: el EXECUTE por defecto de Supabase. Arreglo: revoke a `anon` en una
  migración y una regla de la casa de tablas con su test.

## Qué requiere el OK de Pablo

- Aplicar una migración: una sesión lo hace solo si el script ve la migración en staging, un ensayo reciente y el OK de `auditor-datos` en la cabecera. Son de Pablo (`!` y `--pablo`): `CONTRAE`, y RLS o permisos de lo que ya existía. El SQL a mano que escribe una sesión, siempre negado.
- Cambiar ajustes del panel: Auth, proveedores, URLs de retorno, plan, crons.
- Subir de plan (Pro) o dar de alta cualquier gasto de Supabase.
- Lo que cambie las copias propias (permisos del rol de copia, qué esquemas salen) o llevarlas a otro sitio: son datos de salud de familias fuera de Supabase, siempre cifrados.
- Restaurar una copia sobre la base, aunque sea una tabla.

## Coste y límites

Lo paga quien contrate el proyecto (en el Marketplace de Vercel, el equipo). Límites del plan Free que muerden: 500 MB de base, CPU compartida y que los proyectos sin actividad se suspenden. Las copias del proveedor, ninguna en Free; **Plan Pro**: hasta 7 días de copias diarias con restauración desde el panel (comprobar el precio en la pantalla de «Upgrade»); **PITR** (volver a un segundo concreto): extra de pago encima de Pro. Las cifras de un proyecto (tamaño de la base, coste de las copias propias), en su ficha.

## Fuentes y comprobación

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/extensions/pg_cron

Comprobado el 2026-10-09: el contenido viene de la versión anterior de esta skill, reordenado a la plantilla; el plan y las copias se leyeron en el panel de Supabase (Database → Backups, pestañas de copias programadas y de PITR), sin tocar nada (de qué proyecto, en su ficha). Sin comprobar: el precio del plan Pro, y restaurar una copia de Supabase.
