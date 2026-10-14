# 1Password en el panel (ficha de proyecto)

Los datos del proyecto `panel` de la skill `1password` (`.claude/skills/1password/SKILL.md`, el método de la casa). Se piden con `--proyecto panel` (`npm run skills-encargo -- … --proyecto panel`). Lado: vertical (por estar en `ops/proyectos/<id>/servicios/`). Nunca valores: solo nombres y dónde viven.

## Qué hay

- **Bóveda `Panel HoMenu`**: lo que necesita el servidor del panel. Hoy, la ficha `Postgres del panel` (servidor, puerto, base, usuario y contraseña del Postgres del panel) y la ficha de las copias cifradas de la base.
- **Llave SSH** `HoMenu - Hetzner Panel` (Ed25519), servida por el agente SSH de 1Password: cada conexión pide aprobar en la ventana de 1Password, con Pablo delante (skill `hetzner`).
- **El panel no usa claves de API**: lee los ficheros públicos del repo de la factoría y recibe el informe de coste del PC de Pablo.
- Los ids de las bóvedas y de las fichas, la service account y las operaciones de la cuenta están en la ficha de cada proyecto que comparte la cuenta; aquí solo lo que es del panel.
