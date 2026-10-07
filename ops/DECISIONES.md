# Registro de decisiones de operación

Lo que pasó por un gateway (ver `CLAUDE.md`): qué se decidió, por qué y quién
lo aprobó. Lo lleva el agente `gobierno`; cualquier sesión puede añadir una
fila. La más reciente, arriba. Sin valores de claves.

| Fecha | Qué | Por qué | Aprobó |
|---|---|---|---|
| 2026-10-07 | `CLAUDE.md`, `.claude/settings.json` compartido con los hooks `arranque` y `guardia`, y los agentes `gobierno` y `datos` | Las reglas vivían en la memoria de un solo PC; los hooks las hacen cumplir en todas las sesiones | Pablo |
| 2026-10-07 | Repo privado: en espera | Coste medido (~600 de 2.000 min de Actions) y despliegues «Blocked» de autores no miembros | Pablo |
| 2026-10-07 | `staging` rama por defecto; el cron de Mercadona empuja a `staging` | Que las sesiones y PRs nuevos salgan de lo que de verdad se trabaja | Pablo |
| 2026-10-07 | Copia de trabajo fuera de OneDrive, a `C:\dev\MenuPlan` | OneDrive sincroniza a medias mientras git escribe, y replicaba las claves | Pablo |
| 2026-10-07 | Las sesiones fusionan sus PR a `staging` con el CI verde; a `main`, nunca | Quitar clics sin abrir la puerta a producción | Pablo |
