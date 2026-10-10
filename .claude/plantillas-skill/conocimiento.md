# Plantilla de skill: conocimiento

<!-- Generado desde ops/forja.json (tipos_skill con sus secciones, preguntas_tipo, campos_ficha y criterios) y el estándar de .claude/PLANTILLA-SKILL.md, con «npm run plantillas -- --escribir». No se edita a mano: .claude/plantillas-skill.test.js lo compara. -->

El molde de una skill de tipo `conocimiento`: se copia el esqueleto y se rellena. Lo que vale para todos los tipos (claves, capas, casos de prueba, tamaño, caducidad) está en `.claude/PLANTILLA-SKILL.md`.

| Qué hace | Entra | Sale | Cómo se prueba | Skills de hoy |
|---|---|---|---|---|
| Lo que hay que saber del negocio | pregunta | dato y dónde vive | cada afirmación apunta a su fuente | ninguna |

## Cómo se llega a este tipo

Es `conocimiento` la skill que responde que no a las 6 preguntas (el tipo por defecto, `conocimiento`).

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
3. **Lo que hay que saber**: Hechos que el modelo no tiene, cada uno con su fuente.
4. **Dónde vive el dato**: Qué dato, su fuente de verdad y cómo se lee; el dato no se copia aquí.
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
  tipo: conocimiento
  opera_proveedor: false
  juzga_artefacto: false
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

## Lo que hay que saber

Hechos que el modelo no tiene, cada uno con su fuente.

## Dónde vive el dato

Qué dato, su fuente de verdad y cómo se lee; el dato no se copia aquí.

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
| `tipo` | enum | no | `conocimiento` |
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

Lo que pide este tipo: cada afirmación apunta a su fuente. Lo comprueban el nivel 1 (`npx vitest run .claude/skills.test.js`, gratis, en el CI) y el nivel 2 (`npm run skills-prueba -- <skill>`, cuesta tokens).

52 criterios de la forja se aplican a este tipo (los que dicen `tipos: "todos"` o lo nombran). La frase entera de cada uno, en `docs/ops/FORJA.md`.

- **formal** (26): `frontmatter`, `tipo`, `dueno`, `comprobado`, `caducada`, `secciones`, `formato`, `tamano`, `secretos`, `rutas`, `estructura`, `copiado`, `casos`, `casos-negativos`, `fechas`, `sin-parada`, `ejemplos`, `tabla`, `cabeceras`, `tipo-sin-estandar`, `apartado-ausente`, `pocos-puntos`, `sin-fuente`, `ejemplo-sin-origen`, `ejemplo-largo`, `ejemplo-no-cuadra`.

- **material** (13): `solape`, `solape-cercano`, `comando-suelto`, `caduca-pronto`, `comando-muerto`, `ruta-muerta`, `skill-muerta`, `descripcion-sin-palabras`, `frontera-vaga`, `tamano-cerca`, `caso-duplicado`, `caso-en-frontera`, `vocabulario-canonico`.

- **subjetiva** (13): `descripcion-palabras-de-quien-pide`, `frontera-casi-fallos`, `disparador-al-principio`, `solo-lo-que-el-modelo-no-sabe`, `libertad-ajustada`, `camino-por-defecto`, `pasos-con-salida-observable`, `vocabulario-unico`, `ejemplos-canonicos`, `casos-medidos-con-y-sin-skill`, `skill-contrastada-con-fallo-real`, `forma-adecuada-al-contenido`, `sin-duda-con-vecina`.

No hay criterio de skill que no se le aplique.

## El estándar de este tipo

### Qué lo hace bueno

- «Lo que hay que saber» son hechos que el modelo no tiene (reglas del negocio, excepciones, vocabulario propio), no definiciones generales [F: BP, lo conciso].
- «Dónde vive el dato» apunta a la fuente de verdad y dice cómo leerla; no copia el dato [I].
- Se organiza por tema, con el detalle de cada uno en su capa, para cargar solo lo que se necesita [F: BP, organización por dominio].
- Una palabra por cosa en toda la skill [F: BP, terminología coherente].

### Errores típicos

- Copiar el dato (una cifra, una lista, un estado) en la skill: pasa a haber dos fuentes y una se queda vieja [I].
- Cifras o estados que caducan escritos en el cuerpo [F: BP, información que caduca].
- Mezclar dos temas en una skill, que acaba solapando con otra [F: SB, según resúmenes; I el reparto].
- Explicar el tema como un manual en lugar de lo que el modelo no sabe [F: BP, lo conciso].

### Ejemplo mínimo

Real: `estilo-de-respuesta`, provisional en este tipo hasta que exista el artefacto de estándares; la norma de «La norma».

```
- la primera línea es una sola frase y está en negrita;
- hay cuatro ideas o menos;
- no hay cabeceras, tablas largas ni listas de ficheros;
```
