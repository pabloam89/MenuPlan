# Plantilla de skill: procedimiento

<!-- Generado desde ops/forja.json (tipos_skill con sus secciones, preguntas_tipo, campos_ficha y criterios) y el estándar de .claude/PLANTILLA-SKILL.md, con «npm run plantillas -- --escribir». No se edita a mano: .claude/plantillas-skill.test.js lo compara. -->

El molde de una skill de tipo `procedimiento`: se copia el esqueleto y se rellena. Lo que vale para todos los tipos (claves, capas, casos de prueba, tamaño, caducidad) está en `.claude/PLANTILLA-SKILL.md`.

| Qué hace | Entra | Sale | Cómo se prueba | Skills de hoy |
|---|---|---|---|---|
| Pasos fijos que cambian algo | situación | cambio hecho y comprobado | cada paso con su verificación y su marcha atrás | `alta-de-secreto` |

## Cómo se llega a este tipo

Es `procedimiento` la skill que responde que sí a la pregunta 4 (`pasos_fijos`) y que no a las 3 anteriores.

Las preguntas, en el orden en que se hacen; manda la primera con sí:

1. `opera_proveedor` — ¿Opera un sistema o proveedor externo concreto? → `servicio`
2. `juzga_artefacto` — ¿Juzga un artefacto que ya existe? → `revision`
3. `encadena` — ¿Encadena skills o agentes? → `flujo`
4. `pasos_fijos` — ¿Son pasos fijos con comprobación? → `procedimiento`
5. `sintoma_a_causa` — ¿Va de un síntoma a su causa? → `diagnostico`
6. `elige_opciones` — ¿Elige entre opciones con criterios? → `decision`

Cada skill declara sus respuestas (`true` o `false` a cada pregunta) en su frontmatter, junto a su `tipo`; `tipoDeSkill` las convierte en el tipo, y el nivel 1 (`.claude/skills.test.js`) falla si el `tipo` no es ese. Si una respuesta no es evidente, `porque_tipo` dice por qué.

## Secciones obligatorias, en orden

1. **Cuándo y para qué**: El problema que resuelve, qué entra y qué sale, y «No es para:» con la skill vecina.
2. **Método**: Pasos numerados, cada uno con lo que sale, y cuándo se acaba («Sale bien si …»).
3. **Antes de empezar**: Lo que se comprueba antes del primer paso, con lo que debe salir.
4. **Cómo se comprueba**: Cómo se confirma el resultado sin enseñar nada sensible.
5. **Qué requiere el OK de Pablo**: Una lista de lo que nunca se hace sin su sí explícito.
6. **Lo que falló y por qué**: `- **AAAA-MM-DD · síntoma.** Causa: … Arreglo: …`, lo más reciente arriba.
7. **Registro de cambios**: `- **AAAA-MM-DD** · qué cambió (#issue)`, lo más reciente arriba; al menos la primera versión.
8. **Fuentes y comprobación**: Enlaces y, en la última línea del fichero, «Comprobado el AAAA-MM-DD: …» o «Sin comprobar: …».

Ni una más ni una menos, y ninguna vacía: lo comprueba la regla `secciones` del nivel 1.

## Esqueleto

```markdown
---
name: <igual que la carpeta>
description: Úsala <cuándo, con las palabras de quien pide>. No para: <lo que es de otra skill, regla o agente>.
metadata:
  tipo: procedimiento
  opera_proveedor: false
  juzga_artefacto: false
  encadena: false
  pasos_fijos: true
  sintoma_a_causa: false
  elige_opciones: false
  dueno: <agente de .claude/agents/ que la carga en su skills:>
  comprobado: AAAA-MM-DD
---

# <Nombre>

## Cuándo y para qué

El problema que resuelve, qué entra y qué sale, y «No es para:» con la skill vecina.

## Método

Pasos numerados, cada uno con lo que sale, y cuándo se acaba («Sale bien si …»).

## Antes de empezar

Lo que se comprueba antes del primer paso, con lo que debe salir.

## Cómo se comprueba

Cómo se confirma el resultado sin enseñar nada sensible.

## Qué requiere el OK de Pablo

Una lista de lo que nunca se hace sin su sí explícito.

## Lo que falló y por qué

`- **AAAA-MM-DD · síntoma.** Causa: … Arreglo: …`, lo más reciente arriba.

## Registro de cambios

`- **AAAA-MM-DD** · qué cambió (#issue)`, lo más reciente arriba; al menos la primera versión.

## Fuentes y comprobación

Enlaces y, en la última línea del fichero, «Comprobado el AAAA-MM-DD: …» o «Sin comprobar: …».

Comprobado el AAAA-MM-DD: <cómo se comprobó, y qué no>.
```

## Campos de la ficha

Los de `campos_ficha.skill` de `ops/forja.json`; lo que no está declarado no va en el frontmatter.

| Campo | Clase | Obligatorio | Valores |
|---|---|---|---|
| `name` | ref | sí | una skill que existe |
| `description` | texto | sí | hueco de texto |
| `tipo` | enum | no | `procedimiento` |
| `opera_proveedor` | bool | no | `true` o `false` |
| `juzga_artefacto` | bool | no | `true` o `false` |
| `encadena` | bool | no | `true` o `false` |
| `pasos_fijos` | bool | no | `true` o `false` |
| `sintoma_a_causa` | bool | no | `true` o `false` |
| `elige_opciones` | bool | no | `true` o `false` |
| `porque_tipo` | texto | no | hueco de texto |
| `nivel` | enum | no | `0`, `1`, `2` |
| `dueno` | ref | sí | un agente que existe |
| `comprobado` | fecha | sí | AAAA-MM-DD |
| `libertad` | enum | no | `alta`, `media`, `baja` |
| `invocacion` | enum | no | `descripcion`, `guardia`, `precarga` |

## Cómo se prueba

Lo que pide este tipo: cada paso con su verificación y su marcha atrás. Lo comprueban el nivel 1 (`npx vitest run .claude/skills.test.js`, gratis, en el CI) y el nivel 2 (`npm run skills-prueba -- <skill>`, cuesta tokens).

52 criterios de la forja se aplican a este tipo (los que dicen `tipos: "todos"` o lo nombran). La frase entera de cada uno, en `docs/ops/FORJA.md`.

- **formal** (26): `frontmatter`, `tipo`, `dueno`, `comprobado`, `caducada`, `secciones`, `formato`, `tamano`, `secretos`, `rutas`, `estructura`, `copiado`, `casos`, `casos-negativos`, `fechas`, `sin-parada`, `ejemplos`, `tabla`, `cabeceras`, `tipo-sin-estandar`, `apartado-ausente`, `pocos-puntos`, `sin-fuente`, `ejemplo-sin-origen`, `ejemplo-largo`, `ejemplo-no-cuadra`.

- **material** (13): `solape`, `solape-cercano`, `comando-suelto`, `caduca-pronto`, `comando-muerto`, `ruta-muerta`, `skill-muerta`, `descripcion-sin-palabras`, `frontera-vaga`, `tamano-cerca`, `caso-duplicado`, `caso-en-frontera`, `vocabulario-canonico`.

- **subjetiva** (13): `descripcion-palabras-de-quien-pide`, `frontera-casi-fallos`, `disparador-al-principio`, `solo-lo-que-el-modelo-no-sabe`, `libertad-ajustada`, `camino-por-defecto`, `pasos-con-salida-observable`, `vocabulario-unico`, `ejemplos-canonicos`, `casos-medidos-con-y-sin-skill`, `skill-contrastada-con-fallo-real`, `forma-adecuada-al-contenido`, `sin-duda-con-vecina`.

No hay criterio de skill que no se le aplique.

## El estándar de este tipo

### Qué lo hace bueno

- Pasos numerados en orden fijo, cada uno con lo que sale al terminarlo [F: BP, flujos con pasos claros y listas de comprobación].
- «Antes de empezar» comprueba las condiciones y «Cómo se comprueba» confirma el resultado sin enseñar datos sensibles [F: BP, bucles de comprobación].
- Los pasos que no se pueden deshacer son de una persona: el procedimiento deja los comandos listos y no los lanza [I].
- Al sustituir algo, primero se comprueba lo nuevo y solo entonces se retira lo viejo [I].
- Una lista de comprobación que se copia y se marca al final [F: BP, listas de comprobación].

### Errores típicos

- Pasos sin salida observable: «comprueba que esté bien» [F: BP, instrucciones claras].
- Probar solo en local algo que corre en otro entorno [I, lección de la propia `alta-de-secreto`].
- Un valor secreto escrito en el comando, que queda en la conversación [I].
- Mezclar varios procedimientos en uno (dar de alta, rotar y operar el servicio) sin decir qué es de cada uno [I].

### Ejemplo mínimo

Real: `alta-de-secreto`, el primer paso de su método.

```
1. **Una clave, un uso.** Decide quién la usa (un workflow, el despliegue, un
   script del PC, el servidor) y no reutilices la de otro uso: si se filtra o
   caduca, solo cae ese. Sale: una línea «para qué, quién la lee, dónde vive».
```
