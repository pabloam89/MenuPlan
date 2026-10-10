# Registro de decisiones de operación

Lo que pasó por un gateway (ver `CLAUDE.md`): qué se decidió, por qué y quién
lo aprobó. Lo lleva el agente `gobierno`; cualquier sesión puede añadir una
fila. La más reciente, arriba. Sin valores de claves.

| Fecha | Qué | Por qué | Aprobó |
|---|---|---|---|
| 2026-10-10 | La guardia deja de preguntar al editar `settings.json` y los hooks (opción 3, sustituye a lo del PR #223); se cambian por PR con juez y CI. Ampliar permisos se le pregunta a Pablo en el chat | Con tanta fase tocando hooks la pregunta saltaba a cada paso y la respuesta era que sí. Riesgo abierto, sin decidir: `staging` admite push directo en GitHub y una guardia editada vale en la orden siguiente (#326) | Pablo |
| 2026-10-08 | Una sesión aplica migraciones (`apply-migration --si`) si el script ve: la migración en staging, un ensayo de menos de una hora y `-- AUDITADA: auditor-datos AAAA-MM-DD OK` en la cabecera. `CONTRAE` y RLS o permisos de lo existente, solo Pablo con `!` y `--pablo` (la guardia niega `--pablo`). Sustituye a la fila de abajo | Sin otra base donde aplicar, que el trabajo no se pare esperando a Pablo, con un juez que no escribió la migración. Lo irreversible y lo que decide quién ve los datos de cada familia sigue siendo de una persona | Pablo |
| 2026-10-08 | Escribir en producción (`apply-migration --si`, SQL que escribe) pasa de «preguntar» a «negar» en la guardia: lo lanza Pablo con `!` | En modo auto un «preguntar» del hook puede resolverlo el clasificador y no una persona | Pablo |
| 2026-10-08 | `npm run tarea` / `npm run retirar`, registro de sesiones y números de migración en el arranque, `.gitattributes` con LF, `testTimeout` de 30 s | Quitar los roces de abrir y cerrar tareas, que las sesiones se vean entre sí y que los tests no fallen por reloj | Pablo |
| 2026-10-07 | Secret scanning y push protection activados | Repo público: que una clave no llegue a GitHub | Pablo |
| 2026-10-07 | Protección de ramas en GitHub, también para administradores: `main` solo por PR con `tests` en verde; `main` y `staging` sin force push ni borrado. La guardia niega el push directo a `staging` | Que ningún error llegue a producción sin PR y pruebas; `staging` no exige PR en GitHub porque el cron de Mercadona empuja directo | Pablo |
| 2026-10-07 | `CLAUDE.md`, `.claude/settings.json` compartido con los hooks `arranque` y `guardia`, y los agentes `gobierno` y `datos` | Las reglas vivían en la memoria de un solo PC; los hooks las hacen cumplir en todas las sesiones | Pablo |
| 2026-09-08 | Acceso de los socios, plan (en espera): organización de GitHub `menuplanai` en plan Free, transferir el repo, reenlazar Vercel comprobando un despliegue antes de seguir, repo privado y Manu con rol Read | En un repo de cuenta personal no existe solo lectura: colaborador = escritura. En repos privados de una org Free no hay protección de ramas (Team, 4 $/usuario/mes); con Manu en Read no hace falta | Pablo |
| 2026-10-07 | Repo privado: en espera | Coste medido (~600 de 2.000 min de Actions) y despliegues «Blocked» de autores no miembros | Pablo |
| 2026-10-07 | `staging` rama por defecto; el cron de Mercadona empuja a `staging` | Que las sesiones y PRs nuevos salgan de lo que de verdad se trabaja | Pablo |
| 2026-10-07 | Copia de trabajo fuera de OneDrive, a `C:\dev\MenuPlan` | OneDrive sincroniza a medias mientras git escribe, y replicaba las claves | Pablo |
| 2026-10-07 | Las sesiones fusionan sus PR a `staging` con el CI verde; a `main`, nunca | Quitar clics sin abrir la puerta a producción | Pablo |
