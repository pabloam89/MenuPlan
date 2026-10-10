# Plantilla de skill: revision

<!-- Generado desde ops/forja.json (tipos_skill con sus secciones, preguntas_tipo, campos_ficha y criterios) y el estándar de .claude/PLANTILLA-SKILL.md, con «npm run plantillas -- --escribir». No se edita a mano: .claude/plantillas-skill.test.js lo compara. -->

El molde de una skill de tipo `revision`: se copia el esqueleto y se rellena. Lo que vale para todos los tipos (claves, capas, casos de prueba, tamaño, caducidad) está en `.claude/PLANTILLA-SKILL.md`.

| Qué hace | Entra | Sale | Cómo se prueba | Skills de hoy |
|---|---|---|---|---|
| Juzgar un artefacto contra un catálogo y aplicar lo mecánico | artefacto | criterio, estado y arreglo | una pieza mala a propósito da todos sus fallos | `higiene-de-skills` |

## Cómo se llega a este tipo

Es `revision` la skill que responde que sí a la pregunta 2 (`juzga_artefacto`) y que no a las 1 anteriores.

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
3. **Cómo se prueba**: Quién comprueba cada cosa (un test, una medida o una persona) y la pieza mala a propósito que da todos sus fallos.
4. **Cuándo se poda**: Cuándo se quita o se funde en otra, con una señal que se pueda contar.
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
  tipo: revision
  opera_proveedor: false
  juzga_artefacto: true
  encadena: false
  pasos_fijos: false
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

## Cómo se prueba

Quién comprueba cada cosa (un test, una medida o una persona) y la pieza mala a propósito que da todos sus fallos.

## Cuándo se poda

Cuándo se quita o se funde en otra, con una señal que se pueda contar.

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
| `tipo` | enum | no | `revision` |
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

Lo que pide este tipo: una pieza mala a propósito da todos sus fallos. Lo comprueban el nivel 1 (`npx vitest run .claude/skills.test.js`, gratis, en el CI) y el nivel 2 (`npm run skills-prueba -- <skill>`, cuesta tokens).

52 criterios de la forja se aplican a este tipo (los que dicen `tipos: "todos"` o lo nombran). La frase entera de cada uno, en `docs/ops/FORJA.md`.

- **formal** (26): `frontmatter`, `tipo`, `dueno`, `comprobado`, `caducada`, `secciones`, `formato`, `tamano`, `secretos`, `rutas`, `estructura`, `copiado`, `casos`, `casos-negativos`, `fechas`, `sin-parada`, `ejemplos`, `tabla`, `cabeceras`, `tipo-sin-estandar`, `apartado-ausente`, `pocos-puntos`, `sin-fuente`, `ejemplo-sin-origen`, `ejemplo-largo`, `ejemplo-no-cuadra`.

- **material** (13): `solape`, `solape-cercano`, `comando-suelto`, `caduca-pronto`, `comando-muerto`, `ruta-muerta`, `skill-muerta`, `descripcion-sin-palabras`, `frontera-vaga`, `tamano-cerca`, `caso-duplicado`, `caso-en-frontera`, `vocabulario-canonico`.

- **subjetiva** (13): `descripcion-palabras-de-quien-pide`, `frontera-casi-fallos`, `disparador-al-principio`, `solo-lo-que-el-modelo-no-sabe`, `libertad-ajustada`, `camino-por-defecto`, `pasos-con-salida-observable`, `vocabulario-unico`, `ejemplos-canonicos`, `casos-medidos-con-y-sin-skill`, `skill-contrastada-con-fallo-real`, `forma-adecuada-al-contenido`, `sin-duda-con-vecina`.

No hay criterio de skill que no se le aplique.

## El estándar de este tipo

### Qué lo hace bueno

- Cada criterio es observable y va separado de los demás, con la evidencia que lo cumple (fichero y línea, una salida) [I].
- Los criterios viven en su catálogo y la skill los cita; no los copia [I].
- Cada hallazgo sale con un código de un vocabulario cerrado y su arreglo, para poder contarlo [I].
- Quien construye no juzga, y el juez no escribe lo que revisa [I].
- Un criterio discrimina: si pasa igual con la pieza buena que con la mala, se retira [F: EVAL, aserciones que no miden nada].

### Errores típicos

- Criterios con adjetivos («claro», «bueno») sin nada que mirar [I].
- Ejemplos calibrados solo de lo obvio, que cualquier rúbrica separa [I].
- Un juez que arregla lo que juzga: deja de ser independiente [I].
- Juzgar sin mirar antes lo ya apuntado, y dar por nuevo lo conocido [I, caso #320].

### Ejemplo mínimo

Real: `higiene-de-skills`, el primer paso de su método.

```
1. **Lanza el script** sobre la skill: `npm run higiene-skills -- <skill>`. Sale
   una línea `higiene skill: <s> faltas: a avisos: b solape: x con: <otra>` y,
   debajo, cada defecto con su `arreglo`. Para el conjunto, `--todas`.
```
