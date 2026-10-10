# Plantilla de skill: diagnostico

<!-- Generado desde ops/forja.json (tipos_skill, preguntas_tipo, campos_ficha y criterios), las secciones de scripts/lib/plantillasSkill.mjs y el estándar de .claude/PLANTILLA-SKILL.md, con «npm run plantillas -- --escribir». No se edita a mano: .claude/plantillas-skill.test.js lo compara. -->

El molde de una skill de tipo `diagnostico`: se copia el esqueleto y se rellena. Lo que vale para todos los tipos (claves, capas, casos de prueba, tamaño, caducidad) está en `.claude/PLANTILLA-SKILL.md`.

| Qué hace | Entra | Sale | Cómo se prueba | Skills de hoy |
|---|---|---|---|---|
| De un síntoma a su causa | fallo | causa en campos cerrados | la salida rellena la ficha y hay un criterio de parada | `causa-raiz` |

## Cómo se llega a este tipo

Es `diagnostico` la skill que responde que sí a la pregunta 5 (`sintoma_a_causa`) y que no a las 4 anteriores.

Las preguntas, en el orden en que se hacen; manda la primera con sí:

1. `opera_proveedor` — ¿Opera un sistema o proveedor externo concreto? → `servicio`
2. `juzga_artefacto` — ¿Juzga un artefacto que ya existe? → `revision`
3. `encadena` — ¿Encadena skills o agentes? → `flujo`
4. `pasos_fijos` — ¿Son pasos fijos con comprobación? → `procedimiento`
5. `sintoma_a_causa` — ¿Va de un síntoma a su causa? → `diagnostico`
6. `elige_opciones` — ¿Elige entre opciones con criterios? → `decision`

Las respuestas de cada skill (sí o no a cada pregunta) van en `respuestas_tipo` de `ops/forja.json`; `tipoDeSkill` las convierte en el tipo, y el nivel 1 (`.claude/skills.test.js`) falla si el `tipo` del frontmatter no es ese.

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
  tipo: diagnostico
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
| `tipo` | enum | no | `diagnostico` |
| `nivel` | enum | no | `0`, `1`, `2` |
| `dueno` | ref | sí | un agente que existe |
| `comprobado` | fecha | sí | AAAA-MM-DD |
| `libertad` | enum | no | `alta`, `media`, `baja` |
| `invocacion` | enum | no | `descripcion`, `guardia`, `precarga` |

## Cómo se prueba

Lo que pide este tipo: la salida rellena la ficha y hay un criterio de parada. Lo comprueban el nivel 1 (`npx vitest run .claude/skills.test.js`, gratis, en el CI) y el nivel 2 (`npm run skills-prueba -- <skill>`, cuesta tokens).

52 criterios de la forja se aplican a este tipo (los que dicen `tipos: "todos"` o lo nombran). La frase entera de cada uno, en `docs/ops/FORJA.md`.

- **formal** (26): `frontmatter`, `tipo`, `dueno`, `comprobado`, `caducada`, `secciones`, `formato`, `tamano`, `secretos`, `rutas`, `estructura`, `copiado`, `casos`, `casos-negativos`, `fechas`, `sin-parada`, `ejemplos`, `tabla`, `cabeceras`, `tipo-sin-estandar`, `apartado-ausente`, `pocos-puntos`, `sin-fuente`, `ejemplo-sin-origen`, `ejemplo-largo`, `ejemplo-no-cuadra`.

- **material** (13): `solape`, `solape-cercano`, `comando-suelto`, `caduca-pronto`, `comando-muerto`, `ruta-muerta`, `skill-muerta`, `descripcion-sin-palabras`, `frontera-vaga`, `tamano-cerca`, `caso-duplicado`, `caso-en-frontera`, `vocabulario-canonico`.

- **subjetiva** (13): `descripcion-palabras-de-quien-pide`, `frontera-casi-fallos`, `disparador-al-principio`, `solo-lo-que-el-modelo-no-sabe`, `libertad-ajustada`, `camino-por-defecto`, `pasos-con-salida-observable`, `vocabulario-unico`, `ejemplos-canonicos`, `casos-medidos-con-y-sin-skill`, `skill-contrastada-con-fallo-real`, `forma-adecuada-al-contenido`, `sin-duda-con-vecina`.

No hay criterio de skill que no se le aplique.

## El estándar de este tipo

### Qué lo hace bueno

- Un camino por defecto y una salida para el caso raro, no un menú de opciones [F: BP, demasiadas opciones].
- Cada paso del método dice lo que sale, y el método dice cuándo se acaba [F: BP, bucles de comprobación] y la condición de parada [I: por analogía, BEA].
- Las técnicas se eligen por un dato del problema (su tipo de causa, su alcance), no por gusto [I].
- Lo que no se ha podido comprobar se escribe como hipótesis, con la observación que la confirmaría [I].
- Un ejemplo resuelto, abstracto y canónico, que sigue la propia norma de la skill [I por analogía, CE, ejemplos canónicos].

### Errores típicos

- Un método de principios («analiza bien») sin pasos que se puedan ver [F: BP, instrucciones claras].
- Un ejemplo copiado de un caso real, con nombres o datos de familias [I].
- Dar libertad total donde un fallo cuesta caro [F: BP, grados de libertad].
- El catálogo de técnicas copiado dentro de la skill y también en su fuente: dos versiones [I].

### Ejemplo mínimo

Real: `causa-raiz`, el paso que cierra la causa.

```
6. **Escribe la causa en tres piezas**: *mecanismo* (qué hace el sistema) +
   *condición* (cuándo falla) + *control ausente* (qué debía pararlo y no
   existe o no lo ve). Plantilla: «<mecanismo> falla cuando <condición>, y
   <control> no lo para porque <motivo>». Va al campo `mecanismo` de la ficha.
```
