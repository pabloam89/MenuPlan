# Plantilla de skill: flujo

<!-- Generado desde ops/forja.json (tipos_skill, preguntas_tipo, campos_ficha y criterios), las secciones de scripts/lib/plantillasSkill.mjs y el estándar de .claude/PLANTILLA-SKILL.md, con «npm run plantillas -- --escribir». No se edita a mano: .claude/plantillas-skill.test.js lo compara. -->

El molde de una skill de tipo `flujo`: se copia el esqueleto y se rellena. Lo que vale para todos los tipos (claves, capas, casos de prueba, tamaño, caducidad) está en `.claude/PLANTILLA-SKILL.md`.

| Qué hace | Entra | Sale | Cómo se prueba | Skills de hoy |
|---|---|---|---|---|
| Encadenar skills y agentes | caso | cerrado por etapas | cada etapa apunta a una skill o agente que existe y tiene puerta | `issues` |

## Cómo se llega a este tipo

Es `flujo` la skill que responde que sí a la pregunta 3 (`encadena`) y que no a las 2 anteriores.

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
3. **Etapas**: Cada etapa con la skill o el agente que la lleva y su puerta: lo que la hace cumplir.
4. **Lo que falló y por qué**: `- **AAAA-MM-DD · síntoma.** Causa: … Arreglo: …`, lo más reciente arriba.
5. **Registro de cambios**: `- **AAAA-MM-DD** · qué cambió (#issue)`, lo más reciente arriba; al menos la primera versión.
6. **Fuentes y comprobación**: Enlaces y, en la última línea del fichero, «Comprobado el AAAA-MM-DD: …» o «Sin comprobar: …».

Ni una más ni una menos, y ninguna vacía: lo comprueba la regla `secciones` del nivel 1.

## Esqueleto

```markdown
---
name: <igual que la carpeta>
description: Úsala <cuándo, con las palabras de quien pide>. No para: <lo que es de otra skill, regla o agente>.
metadata:
  tipo: flujo
  dueno: <agente de .claude/agents/ que la carga en su skills:>
  comprobado: AAAA-MM-DD
---

# <Nombre>

## Cuándo y para qué

El problema que resuelve, qué entra y qué sale, y «No es para:» con la skill vecina.

## Método

Pasos numerados, cada uno con lo que sale, y cuándo se acaba («Sale bien si …»).

## Etapas

Cada etapa con la skill o el agente que la lleva y su puerta: lo que la hace cumplir.

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
| `tipo` | enum | no | `flujo` |
| `nivel` | enum | no | `0`, `1`, `2` |
| `dueno` | ref | sí | un agente que existe |
| `comprobado` | fecha | sí | AAAA-MM-DD |
| `libertad` | enum | no | `alta`, `media`, `baja` |
| `invocacion` | enum | no | `descripcion`, `guardia`, `precarga` |

## Cómo se prueba

Lo que pide este tipo: cada etapa apunta a una skill o agente que existe y tiene puerta. Lo comprueban el nivel 1 (`npx vitest run .claude/skills.test.js`, gratis, en el CI) y el nivel 2 (`npm run skills-prueba -- <skill>`, cuesta tokens).

52 criterios de la forja se aplican a este tipo (los que dicen `tipos: "todos"` o lo nombran). La frase entera de cada uno, en `docs/ops/FORJA.md`.

- **formal** (26): `frontmatter`, `tipo`, `dueno`, `comprobado`, `caducada`, `secciones`, `formato`, `tamano`, `secretos`, `rutas`, `estructura`, `copiado`, `casos`, `casos-negativos`, `fechas`, `sin-parada`, `ejemplos`, `tabla`, `cabeceras`, `tipo-sin-estandar`, `apartado-ausente`, `pocos-puntos`, `sin-fuente`, `ejemplo-sin-origen`, `ejemplo-largo`, `ejemplo-no-cuadra`.

- **material** (13): `solape`, `solape-cercano`, `comando-suelto`, `caduca-pronto`, `comando-muerto`, `ruta-muerta`, `skill-muerta`, `descripcion-sin-palabras`, `frontera-vaga`, `tamano-cerca`, `caso-duplicado`, `caso-en-frontera`, `vocabulario-canonico`.

- **subjetiva** (13): `descripcion-palabras-de-quien-pide`, `frontera-casi-fallos`, `disparador-al-principio`, `solo-lo-que-el-modelo-no-sabe`, `libertad-ajustada`, `camino-por-defecto`, `pasos-con-salida-observable`, `vocabulario-unico`, `ejemplos-canonicos`, `casos-medidos-con-y-sin-skill`, `skill-contrastada-con-fallo-real`, `forma-adecuada-al-contenido`, `sin-duda-con-vecina`.

No hay criterio de skill que no se le aplique.

## El estándar de este tipo

### Qué lo hace bueno

- Cada etapa nombra la skill o el agente que la lleva, y existe [I, prueba del tipo en `ops/forja.json`].
- Cada etapa tiene su puerta: lo que la hace cumplir (un hook, el CI, un workflow), no solo el texto [I, CLAUDE.md «Lo que hace cumplir esto»].
- Dice qué entra y qué sale de cada etapa, para que la siguiente sepa por dónde empezar [I].

### Errores típicos

- Copiar dentro el método de una etapa que ya tiene su skill: dos versiones [I].
- Una etapa sin dueño o sin puerta, que depende de que alguien se acuerde [I, CLAUDE.md «Cuando algo falla»].
- Encadenar etapas sin decir qué sale de cada una, y que la siguiente lo adivine [I].

### Ejemplo mínimo

Real: `issues`, el árbol de un fallo hasta su arreglo.

```
problema de fondo (tipo:fondo)   qué falla de fondo, su arreglo general y cómo se probará
  ├─ caso (tipo:caso)            dónde se ha visto: la evidencia
  └─ encargo (tipo:encargo)      una parte del arreglo, con su dueño y su PR
```
