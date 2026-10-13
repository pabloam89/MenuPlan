# Plantilla de skill: servicio

<!-- Generado desde ops/forja/ (tipos_skill con sus secciones, preguntas_tipo, campos_ficha y criterios) y el estándar de .claude/PLANTILLA-SKILL.md, con «npm run plantillas -- --escribir». No se edita a mano: .claude/plantillas-skill.test.js lo compara. -->

El molde de una skill de tipo `servicio`: se copia el esqueleto y se rellena. Lo que vale para todos los tipos (claves, capas, casos de prueba, tamaño, caducidad) está en `.claude/PLANTILLA-SKILL.md`.

| Qué hace | Entra | Sale | Cómo se prueba | Skills de hoy |
|---|---|---|---|---|
| Operar un sistema externo concreto | petición | comando y resultado esperado | los comandos existen, la salida es comprobable y la caducidad es corta | `github`, `vercel`, `supabase`, `telegram`, `hetzner`, `tailscale`, `1password` |

## Cómo se llega a este tipo

Es `servicio` la skill que responde que sí a la pregunta 1 (`opera_proveedor`).

Las preguntas, en el orden en que se hacen; manda la primera con sí:

1. `opera_proveedor` — ¿Opera un sistema o proveedor externo concreto? → `servicio`
2. `juzga_artefacto` — ¿Juzga un artefacto que ya existe? → `revision`
3. `encadena` — ¿Encadena skills o agentes? → `flujo`
4. `pasos_fijos` — ¿Son pasos fijos con comprobación? → `procedimiento`
5. `sintoma_a_causa` — ¿Va de un síntoma a su causa? → `diagnostico`
6. `elige_opciones` — ¿Elige entre opciones con criterios? → `decision`

Cada skill declara sus respuestas (`true` o `false` a cada pregunta) en su frontmatter, junto a su `tipo`; `tipoDeSkill` las convierte en el tipo, y el nivel 1 (`.claude/skills.test.js`) falla si el `tipo` no es ese. Si una respuesta no es evidente, `porque_tipo` dice por qué.

## Secciones obligatorias, en orden

1. **Qué es y dónde**: Qué es, para qué lo usamos, de quién es y su estado real; **Pendiente:** lo que falta, sin disimular.
2. **Claves y accesos**: Nombres (nunca valores) de claves y accesos y dónde viven; el detalle manda en `ops/INVENTARIO.md`.
3. **Operaciones habituales**: Tabla `| Qué | Comando | Debe salir |`, de más a menos frecuente; lo que pide el OK de Pablo, con «(OK)».
4. **Lo que falló y por qué**: `- **AAAA-MM-DD · síntoma.** Causa: … Arreglo: …`, lo más reciente arriba.
5. **Qué requiere el OK de Pablo**: Una lista de lo que nunca se hace sin su sí explícito.
6. **Coste y límites**: Cuánto cuesta, qué tope muerde y qué lo dispara; «Sin coste propio» si no lo hay.
7. **Fuentes y comprobación**: Enlaces y, en la última línea del fichero, «Comprobado el AAAA-MM-DD: …» o «Sin comprobar: …».

Ni una más ni una menos, y ninguna vacía: lo comprueba la regla `secciones` del nivel 1.

## Esqueleto

```markdown
---
name: <igual que la carpeta>
description: Úsala <cuándo, con las palabras de quien pide>. No para: <lo que es de otra skill, regla o agente>.
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: <agente de .claude/agents/ que la carga en su skills:>
  comprobado: AAAA-MM-DD
  normas: [<id de ops/normas.json a la que sirve>, <otra>]
---

# <Nombre>

## Qué es y dónde

Qué es, para qué lo usamos, de quién es y su estado real; **Pendiente:** lo que falta, sin disimular.

## Claves y accesos

Nombres (nunca valores) de claves y accesos y dónde viven; el detalle manda en `ops/INVENTARIO.md`.

## Operaciones habituales

Tabla `| Qué | Comando | Debe salir |`, de más a menos frecuente; lo que pide el OK de Pablo, con «(OK)».

## Lo que falló y por qué

`- **AAAA-MM-DD · síntoma.** Causa: … Arreglo: …`, lo más reciente arriba.

## Qué requiere el OK de Pablo

Una lista de lo que nunca se hace sin su sí explícito.

## Coste y límites

Cuánto cuesta, qué tope muerde y qué lo dispara; «Sin coste propio» si no lo hay.

## Fuentes y comprobación

Enlaces y, en la última línea del fichero, «Comprobado el AAAA-MM-DD: …» o «Sin comprobar: …».

Comprobado el AAAA-MM-DD: <cómo se comprobó, y qué no>.
```

## Campos de la ficha

Los de `campos_ficha.skill` de `ops/forja/`; lo que no está declarado no va en el frontmatter.

| Campo | Clase | Obligatorio | Valores |
|---|---|---|---|
| `name` | ref | sí | una skill que existe |
| `description` | texto | sí | hueco de texto |
| `tipo` | enum | sí | `servicio` |
| `opera_proveedor` | bool | sí | `true` en este tipo |
| `juzga_artefacto` | bool | sí | `false` en este tipo |
| `encadena` | bool | sí | `false` en este tipo |
| `pasos_fijos` | bool | sí | `false` en este tipo |
| `sintoma_a_causa` | bool | sí | `false` en este tipo |
| `elige_opciones` | bool | sí | `false` en este tipo |
| `porque_tipo` | texto | no | hueco de texto |
| `nivel` | enum | no | `2`, o sin él (el 1 son los moldes; el 0, la pieza meta) |
| `dueno` | ref | sí | un agente que existe |
| `comprobado` | fecha | sí | AAAA-MM-DD |
| `normas` | ref | sí | una norma que existe |
| `libertad` | enum | no | `alta`, `media`, `baja` |
| `invocacion` | enum | no | `descripcion`, `guardia`, `precarga` |

## Cómo se prueba

Lo que pide este tipo: los comandos existen, la salida es comprobable y la caducidad es corta. Lo comprueban el nivel 1 (`npx vitest run .claude/skills.test.js`, gratis, en el CI) y el nivel 2 (`npm run skills-prueba -- <skill>`, cuesta tokens).

51 criterios de la forja se aplican a este tipo (los que dicen `tipos: "todos"` o lo nombran). La frase entera de cada uno, en `docs/ops/FORJA.md`.

- **formal** (25): `apartado-ausente`, `cabeceras`, `caducada`, `casos-negativos`, `casos`, `comprobado`, `copiado`, `dueno`, `ejemplo-largo`, `ejemplo-no-cuadra`, `ejemplo-sin-origen`, `ejemplos`, `estructura`, `fechas`, `formato`, `frontmatter`, `pocos-puntos`, `rutas`, `secciones`, `secretos`, `sin-fuente`, `tabla`, `tamano`, `tipo-sin-estandar`, `tipo`.

- **material** (13): `caduca-pronto`, `caso-duplicado`, `caso-en-frontera`, `comando-muerto`, `comando-suelto`, `descripcion-sin-palabras`, `frontera-vaga`, `ruta-muerta`, `skill-muerta`, `solape-cercano`, `solape`, `tamano-cerca`, `vocabulario-canonico`.

- **subjetiva** (13): `camino-por-defecto`, `casos-medidos-con-y-sin-skill`, `descripcion-palabras-de-quien-pide`, `disparador-al-principio`, `ejemplos-canonicos`, `forma-adecuada-al-contenido`, `frontera-casi-fallos`, `libertad-ajustada`, `pasos-con-salida-observable`, `sin-duda-con-vecina`, `skill-contrastada-con-fallo-real`, `solo-lo-que-el-modelo-no-sabe`, `vocabulario-unico`.

No se le aplican: `sin-parada`.

## La plantilla de este tipo

### Qué lo hace bueno

- Cada operación es una fila con el comando exacto y lo que debe salir: donde un error cuesta caro, pasos cerrados y no consejos [F: BP, grados de libertad].
- «Lo que falló y por qué» recoge fallos reales con su causa y su arreglo; es la memoria del servicio y lo que el modelo no sabe [S].
- Lo irreversible está nombrado en «Qué requiere el OK de Pablo», y lo no comprobado se dice en la última línea [S].
- El estado real y lo pendiente, sin disimular; el procedimiento largo, en una capa que `SKILL.md` cita [F: BP, un solo nivel de profundidad].

### Errores típicos

- Pegar la documentación del proveedor, que el modelo ya conoce [F: BP, lo conciso].
- Una fila sin «Debe salir»: no se sabe si fue bien [S].
- Precios, versiones o «desde tal día» escritos en el cuerpo, que se quedan viejos [F: BP, información que caduca].
- Un procedimiento de veinte pasos metido en una celda de la tabla [S].

### Ejemplo mínimo

Real: `tailscale`, la tabla de «Operaciones habituales».

```
| Qué | Comando | Debe salir |
|---|---|---|
| Probar la entrada al servidor | `ssh root@100.73.252.32 hostname` | `HoMenu-Panel` |
```
