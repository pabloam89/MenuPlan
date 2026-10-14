# Tailscale en el panel (ficha de proyecto)

Los datos del proyecto `panel` de la skill `tailscale` (`.claude/skills/tailscale/SKILL.md`, el método de la casa). Se piden con `--proyecto panel` (`npm run skills-encargo -- … --proyecto panel`). Lado: vertical (por estar en `ops/proyectos/<id>/servicios/`). El cómo se opera, en la skill.

## Qué hay

- **El panel solo se ve por Tailscale**: `http://100.73.252.32:8080`, la dirección de la red privada del servidor. No hay puerto público; el puerto va atado a esa IP.
- **Quién entra:** el PC de Pablo (también le envía el informe de coste cada 10 minutos).
- **Si la red cae**, el panel sigue vivo pero inaccesible; la vía de emergencia es la consola web de Hetzner (skill `hetzner`).
- La cuenta, las máquinas y las comprobaciones de la red están en la ficha de cada proyecto que usa la misma red; no se repiten aquí.
