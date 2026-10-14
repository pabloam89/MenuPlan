# Hetzner en el panel (ficha de proyecto)

Los datos del proyecto `panel` de la skill `hetzner` (`.claude/skills/hetzner/SKILL.md`, el método de la casa): dónde corre el panel de la factoría y cómo se despliega. Se piden con `--proyecto panel` (`npm run skills-encargo -- … --proyecto panel`). Lado: vertical (por estar en `ops/proyectos/<id>/servicios/`). Nunca valores de claves: solo nombres y dónde viven.

## Qué hay

- **Servidor `HoMenu-Panel`** (CPX02, Falkenstein) en la cuenta de Hetzner de Pablo: aloja el panel y su Postgres. El servidor sirve también a otros proyectos (copia nocturna de la base), así que su cuenta, su cortafuegos y sus copias están en la ficha de cada proyecto que lo usa.
- **El panel**: repo privado `pabloam89/homenu-panel` (en el PC, `C:\dev\homenu-panel`), en `http://100.73.252.32:8080`, solo por Tailscale. Qué corre, cómo se despliega, la tarea de Windows que le envía el coste y lo que ha fallado: `.claude/skills/hetzner/referencias/panel.md`.
- **Claves:** la contraseña del Postgres del panel vive en 1Password, bóveda `Panel HoMenu`, y su copia en `/opt/panel/.env` del servidor (ver `ops/INVENTARIO.md`). El panel en sí no usa claves de API.

## Operaciones

El despliegue y la comprobación (`curl http://100.73.252.32:8080/<vista>` devuelve 200) están en la referencia de arriba. Cada conexión SSH pide aprobar en 1Password: avisar antes a Pablo (skill `1password`).
