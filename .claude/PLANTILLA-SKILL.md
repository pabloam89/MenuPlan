# Plantilla de skill (runbook)

Toda skill de `.claude/skills/<nombre>/SKILL.md` es un **runbook**: lo abre una
sesión con prisa, a mitad de un fallo, y tiene que poder seguirlo sin haber
estado en la sesión que lo escribió. Todas tienen esta forma. El proveedor, el
servicio o la herramienta cambian de una a otra; las secciones, no.
`.claude/skills.test.js` falla si a una skill le falta alguna sección, están
desordenadas o una entrada se sale del formato.

Está fuera de `.claude/skills/` a propósito, igual que la plantilla de agentes:
ahí Claude Code la cargaría como si fuera una skill más.

## Reglas que valen para todas

- **Nunca valores de claves**, solo su nombre y dónde viven (el test busca
  patrones de clave y de cadenas de conexión con contraseña).
- **Lo que no se ha comprobado se dice**: `Sin comprobar` al final, con el
  motivo. Un runbook que parece verificado y no lo está es peor que ninguno.
- **Cuando algo falla, la lección va al test o a la guardia; si no se puede,
  aquí, en «Lo que falló y por qué»; a la memoria, nunca** (ver `CLAUDE.md`).
- Un proveedor nuevo estrena su skill con su primera lección, no antes.
- Una skill por proveedor o herramienta. Si dos se pisan, una manda y la otra
  la cita por su nombre.
- Comandos copiables tal cual, con lo que **debe salir**. «Funciona» no es una
  comprobación: di qué se ve cuando funciona.

## Forma

```markdown
---
name: <igual que la carpeta>
description: Úsala <cuándo: los disparadores concretos>. No para: <qué es de otra skill, regla o agente>.
---

# <Nombre>

## Qué es y dónde
Qué es, para qué lo usamos, quién es el dueño y qué pasa cuando no es lo que
parece. Estado real hoy y **Pendiente:** lo que falta, sin disimular.

## Claves y accesos
Nombres (no valores), dónde viven y cómo se entra. Cuentas, llaves, tokens.

## Operaciones habituales
| Qué | Comando | Debe salir |
|---|---|---|
| Lo que se hace a menudo | `comando` | lo que se ve si ha ido bien |

## Lo que falló y por qué
- **AAAA-MM-DD · síntoma tal como se ve.** Causa: … Arreglo: …

## Qué requiere el OK de Pablo
- Lo que nunca se hace sin su sí explícito.

## Coste y límites
Cuánto cuesta, qué tope o cuota hay, y qué lo dispara.

## Fuentes y comprobación
- Enlaces de la documentación oficial.

Comprobado el AAAA-MM-DD: cómo se comprobó, y qué NO se comprobó.
```

## Cómo se rellena cada sección

1. **Qué es y dónde.** Para quien llega de nuevas. Si hay un nombre antiguo o
   una trampa de identidad (otro nombre, otra cuenta), aquí.
2. **Claves y accesos.** Una línea por clave o acceso. Si el detalle manda en
   `ops/INVENTARIO.md`, se cita, no se copia.
3. **Operaciones habituales.** Una fila por operación, ordenadas de más a menos
   frecuentes. La tercera columna es lo que permite saber, sin preguntar, si
   ha ido bien. Lo que necesita un OK de Pablo se marca en la fila con «(OK)».
4. **Lo que falló y por qué.** Lo más reciente arriba. La fecha es de cuando
   pasó, `AAAA-MM-DD` (o `AAAA-MM` si no se sabe el día). Cada entrada cierra
   con su **Arreglo**; si no se ha arreglado, el arreglo dice «Sin resolver» y
   qué hay que hacer.
5. **Qué requiere el OK de Pablo.** La lista de gateways de este dominio. Es la
   misma regla de `CLAUDE.md`, concretada para este servicio.
6. **Coste y límites.** Una cifra con su fecha. «Sin coste propio» si no lo hay.
7. **Fuentes y comprobación.** La última línea del fichero es siempre
   `Comprobado el AAAA-MM-DD: …` o `Sin comprobar: …`.
