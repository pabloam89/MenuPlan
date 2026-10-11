# Vuelta atrás de un despliegue (#589)

Capa de la skill `vercel`. Nada de esto lo ejecuta una sesión: el rollback es de Pablo (o
Álvaro) en el panel de Vercel, y se anota después en `ops/ensayos-rollback.json`.

## Cuándo

- La puerta de salud abrió el issue «Despliegue sin salud: main» (producción), o la web o
  el bot no responden tras un despliegue y el arreglo no cabe en minutos.
- Para `staging` no hace falta: se arregla con un PR; el «Instant Rollback» es de producción.

## Pasos en el panel (Pablo)

1. Vercel, equipo «menuplan», proyecto `homenu`, pestaña Deployments.
2. Busca el último despliegue de producción que iba bien (estado Ready, anterior al roto).
3. Menú «…» del despliegue, «Instant Rollback», confirma. No reconstruye: vuelve a servir el
   que ya estaba construido, con las variables de entorno que tenía.
4. Alternativa: `request_rollback` del conector de Vercel, si Pablo lo autoriza.
5. Vercel deja de asignar los despliegues nuevos a producción mientras esté en rollback:
   para salir, se promueve el despliegue bueno nuevo desde el panel. Sin comprobar aquí.

## Qué mirar después (3 minutos)

1. `gh workflow run salud-despliegue.yml --ref staging -f url=<dirección del despliegue de
   producción> -f rama=main` y el run en verde (página y función).
2. El canario de Lola: el siguiente aviso del vigía no abre un fallo nuevo (`vigia-lola.yml`).
3. Que la web carga en el móvil y Lola contesta en el chat de prueba.

## Qué NO revierte

- **Las migraciones.** La base es una sola y es producción: volver a un despliegue anterior
  deja el código viejo hablando con el esquema nuevo. Por eso el código no puede depender de
  que una migración ya esté aplicada (CLAUDE.md, «Base de datos») y la migración con
  `CONTRAE` es de Pablo. Una migración se deshace con otra, y no con el rollback.
- Los datos que ya escribió el código roto, las variables de entorno cambiadas después y el
  webhook de Telegram (apunta a un despliegue por su dirección).

## Anotar el ensayo

Tras ensayarlo (en producción, con el despliegue anterior, y volviendo al actual), añade una
entrada a `ops/ensayos-rollback.json`:

```json
{ "fecha": "AAAA-MM-DD", "quien": "pablo", "metodo": "panel", "entorno": "produccion",
  "resultado": "ok", "minutos": 3, "comprobado": ["pagina", "funcion", "canario"], "issue": 589 }
```

Sin enlaces ni ids de despliegue (el repo es público). Valida la forma
`npx vitest run ops/ensayos-rollback.test.js`. Mientras la lista esté vacía, la norma
`rollback-ensayado` sigue blanda y el aviso es el issue 589.
