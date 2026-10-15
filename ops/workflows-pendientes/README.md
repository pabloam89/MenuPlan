# Workflows pendientes: la vía de respaldo

Desde el 15 oct 2026 la App de las sesiones (`homenu-sesiones`) tiene el permiso `workflows` en
escritura: lo decidió Pablo (opción C de #422, caso #821) y lo activó él en GitHub. Una sesión ya
empuja `.github/workflows/` en su rama como cualquier otro fichero, y el PR que lo cambia no se
fusiona sin `seguridad` en su línea «Jueces:» (la guardia, norma `workflow-con-juez-seguridad`).

Esta carpeta queda como **respaldo**, para cuando la App vuelva a no poder empujar un workflow (el
permiso se quita, el token sale sin él, o GitHub rechaza el push con «refusing to allow a GitHub App
to create or update workflow … without `workflows` permission», como pasó del 10 al 15 oct 2026,
#839). Entonces la sesión prepara aquí el workflow nuevo o cambiado, con el mismo nombre que tendrá
en `.github/workflows/`, y Pablo lo mueve con sus credenciales en la rama del PR (desde la web de
GitHub o su PowerShell).

Mientras espera aquí:

- `ops/workflows.test.js` lo lee como YAML igual que a los de `.github/workflows/`.
- El test propio del workflow, si lo tiene, lee el de aquí si existe (por ejemplo,
  `scripts/fotoIssues.test.js` con `foto-issues.yml`, #844).

El commit que lo mueve copia el contenido a `.github/workflows/<nombre>.yml` y borra el de aquí;
esta nota se queda para la próxima vez.
