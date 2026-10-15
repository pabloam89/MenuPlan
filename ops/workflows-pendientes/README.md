# Workflows que esperan a Pablo

La App de las sesiones (`homenu-sesiones`) no tiene el permiso `workflows`: GitHub rechaza su push de
cualquier fichero de `.github/workflows/` (#821, #839). Un workflow nuevo o cambiado lo prepara la
sesión aquí, con el mismo nombre que tendrá en `.github/workflows/`, y Pablo lo mueve con sus
credenciales en la rama del PR (desde la web de GitHub o su PowerShell).

Mientras espera aquí:

- `ops/workflows.test.js` lo lee como YAML igual que a los de `.github/workflows/`.
- El test propio del workflow, si lo tiene, lee el de aquí si existe (por ejemplo,
  `scripts/fotoIssues.test.js` con `foto-issues.yml`, #844).

El commit de Pablo copia el contenido a `.github/workflows/<nombre>.yml` y borra el de aquí; esta
nota se queda para la próxima vez.
