# Plantilla de skill: decision

<!-- Generado desde ops/forja.json (tipos_skill con sus secciones, preguntas_tipo, campos_ficha y criterios) y el estándar de .claude/PLANTILLA-SKILL.md, con «npm run plantillas -- --escribir». No se edita a mano: .claude/plantillas-skill.test.js lo compara. -->

El molde de una skill de tipo `decision`: se copia el esqueleto y se rellena. Lo que vale para todos los tipos (claves, capas, casos de prueba, tamaño, caducidad) está en `.claude/PLANTILLA-SKILL.md`.

| Qué hace | Entra | Sale | Cómo se prueba | Skills de hoy |
|---|---|---|---|---|
| Elegir entre opciones con criterios | dilema | opción y porqué | cada criterio aplicado y la escalera seguida | `plan-de-arreglo` |

## Cómo se llega a este tipo

Es `decision` la skill que responde que sí a la pregunta 6 (`elige_opciones`) y que no a las 5 anteriores.

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
3. **Técnicas**: Las técnicas, elegidas por un dato del problema; el detalle de cada una, en `tecnicas/`.
4. **Ejemplo resuelto**: Un caso abstracto y canónico, de punta a punta, que sigue la propia norma de la skill.
5. **Lo que falló y por qué**: `- **AAAA-MM-DD · síntoma.** Causa: … Arreglo: …`, lo más reciente arriba.
6. **Registro de cambios**: `- **AAAA-MM-DD** · qué cambió (#issue)`, lo más reciente arriba; al menos la primera versión.
7. **Fuentes y comprobación**: Enlaces y, en la última línea del fichero, «Comprobado el AAAA-MM-DD: …» o «Sin comprobar: …».

Ni una más ni una menos, y ninguna vacía: lo comprueba la regla `secciones` del nivel 1.

## Esqueleto

```markdown
---
name: <igual que la carpeta>
description: Úsala <cuándo, con las palabras de quien pide>. No para: <lo que es de otra skill, regla o agente>.
metadata:
  tipo: decision
  opera_proveedor: false
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: true
  dueno: <agente de .claude/agents/ que la carga en su skills:>
  comprobado: AAAA-MM-DD
---

# <Nombre>

## Cuándo y para qué

El problema que resuelve, qué entra y qué sale, y «No es para:» con la skill vecina.

## Método

Pasos numerados, cada uno con lo que sale, y cuándo se acaba («Sale bien si …»).

## Técnicas

Las técnicas, elegidas por un dato del problema; el detalle de cada una, en `tecnicas/`.

## Ejemplo resuelto

Un caso abstracto y canónico, de punta a punta, que sigue la propia norma de la skill.

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
| `tipo` | enum | sí | `decision` |
| `opera_proveedor` | bool | sí | `false` en este tipo |
| `juzga_artefacto` | bool | sí | `false` en este tipo |
| `encadena` | bool | sí | `false` en este tipo |
| `pasos_fijos` | bool | sí | `false` en este tipo |
| `sintoma_a_causa` | bool | sí | `false` en este tipo |
| `elige_opciones` | bool | sí | `true` en este tipo |
| `porque_tipo` | texto | no | hueco de texto |
| `nivel` | enum | no | `2`, o sin él (el 1 son los moldes; el 0, la pieza meta) |
| `dueno` | ref | sí | un agente que existe |
| `comprobado` | fecha | sí | AAAA-MM-DD |
| `libertad` | enum | no | `alta`, `media`, `baja` |
| `invocacion` | enum | no | `descripcion`, `guardia`, `precarga` |

## Cómo se prueba

Lo que pide este tipo: cada criterio aplicado y la escalera seguida. Lo comprueban el nivel 1 (`npx vitest run .claude/skills.test.js`, gratis, en el CI) y el nivel 2 (`npm run skills-prueba -- <skill>`, cuesta tokens).

52 criterios de la forja se aplican a este tipo (los que dicen `tipos: "todos"` o lo nombran). La frase entera de cada uno, en `docs/ops/FORJA.md`.

- **formal** (26): `frontmatter`, `tipo`, `dueno`, `comprobado`, `caducada`, `secciones`, `formato`, `tamano`, `secretos`, `rutas`, `estructura`, `copiado`, `casos`, `casos-negativos`, `fechas`, `sin-parada`, `ejemplos`, `tabla`, `cabeceras`, `tipo-sin-estandar`, `apartado-ausente`, `pocos-puntos`, `sin-fuente`, `ejemplo-sin-origen`, `ejemplo-largo`, `ejemplo-no-cuadra`.

- **material** (13): `solape`, `solape-cercano`, `comando-suelto`, `caduca-pronto`, `comando-muerto`, `ruta-muerta`, `skill-muerta`, `descripcion-sin-palabras`, `frontera-vaga`, `tamano-cerca`, `caso-duplicado`, `caso-en-frontera`, `vocabulario-canonico`.

- **subjetiva** (13): `descripcion-palabras-de-quien-pide`, `frontera-casi-fallos`, `disparador-al-principio`, `solo-lo-que-el-modelo-no-sabe`, `libertad-ajustada`, `camino-por-defecto`, `pasos-con-salida-observable`, `vocabulario-unico`, `ejemplos-canonicos`, `casos-medidos-con-y-sin-skill`, `skill-contrastada-con-fallo-real`, `forma-adecuada-al-contenido`, `sin-duda-con-vecina`.

No hay criterio de skill que no se le aplique.

## El estándar de este tipo

### Qué lo hace bueno

- Las opciones se ordenan con un catálogo escrito (la escalera, los mecanismos) y se empieza por la más alta; bajar exige su motivo [I].
- Cada criterio del catálogo se aplica a la opción elegida y se dice cómo, no solo el resultado [I, prueba del tipo en `ops/forja.json`].
- Una recomendación por defecto y, aparte, cuándo conviene otra, no un menú [F: BP, demasiadas opciones].
- Cada paso del método dice lo que sale, y el método dice cuándo se acaba [F: BP, bucles de comprobación].

### Errores típicos

- Elegir por gusto o por costumbre sin pasar por el catálogo [I].
- Un menú de opciones sin la recomendada [F: BP, demasiadas opciones].
- Copiar el catálogo de opciones dentro de la skill: dos versiones que se separan [I].

### Ejemplo mínimo

Real: `plan-de-arreglo`, el paso que elige el mecanismo.

```
4. **Elige el mecanismo, el más alto posible.** `npm run mecanismos` → el
   catálogo `ops/mecanismos.json` por escalones, de bloqueo a texto, con
   cuándo conviene cada uno, qué cuesta y hasta qué veredicto llega. Empieza
   por arriba y baja solo con un motivo: no se puede (el proveedor no lo
   permite), cuesta más que el daño, o alcanza a menos gente de la que debe.
```
