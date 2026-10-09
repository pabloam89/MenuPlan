# Plantilla de skill

Toda skill de `.claude/skills/<nombre>/` sirve para que una sesión con prisa
haga algo bien sin haber estado en la sesión que la escribió. Hay ocho tipos
(la lista y su estado viven en `ops/flujo.json`, `tipos_skill`); todas
comparten la estructura común y cada tipo tiene sus secciones. La de tipo
**herramienta** es un **runbook**: cómo se opera un servicio.

La forma la vigila `.claude/skills.test.js` (nivel 1, gratis, en el CI) con las
reglas de `scripts/lib/skills.mjs`; si algo de aquí cambia, cambia allí y el test
comprueba que los dos dicen lo mismo. Que la skill ayude de verdad lo mide el
nivel 2, `npm run skills-prueba -- <skill>`, que cuesta tokens.

Está fuera de `.claude/skills/` a propósito, igual que la plantilla de agentes:
ahí Claude Code la cargaría como si fuera una skill más.

## Reglas que valen para todas

- **Nunca valores de claves**, solo su nombre y dónde viven (el test busca
  patrones de clave y de cadenas de conexión con contraseña).
- **Lo que no se ha comprobado se dice**: `Sin comprobar` al final, con el
  motivo. Una skill que parece verificada y no lo está es peor que ninguna.
- **Cuando algo falla, la lección va al test o a la guardia; si no se puede,
  aquí, en «Lo que falló y por qué»; a la memoria, nunca** (ver `CLAUDE.md`).
- Una skill nueva solo se crea si cumple la regla de parada de
  `docs/ops/FLUJO.md` (se usa dos veces, no repite nada, tiene dueño y test).
  Un proveedor nuevo estrena su runbook con su primera lección, no antes.
- **El saber vive en una sola skill.** Si dos se pisan, una manda y la otra la
  cita por su nombre; el test falla si un párrafo largo aparece igual en dos.
- Comandos copiables tal cual, con lo que **debe salir**. «Funciona» no es una
  comprobación: di qué se ve cuando funciona.

## Estructura común

Toda skill, sea del tipo que sea, tiene estas piezas:

| Pieza | Dónde vive | Obligatoria |
|---|---|---|
| **Método** | `SKILL.md`: en herramienta, «Operaciones habituales»; en los demás, la sección «Método» | sí |
| **Técnicas** | `tecnicas/<técnica>.md`, una por fichero, citadas desde `SKILL.md` | si las hay (en oficio, la sección «Técnicas» las resume) |
| **Referencias** | `referencias/<tema>.md`: el detalle largo que no se lee siempre; las fuentes de fuera, en «Fuentes y comprobación» | si las hay |
| **Scripts** | `scripts/` del repo si los usa más de una pieza; `scripts/` de la skill si solo ella | si los hay |
| **Plantillas** | `plantillas/<nombre>`: el texto o fichero que se copia y se rellena | si las hay |
| **Casos de prueba** | `casos.json` en la carpeta de la skill (formato abajo) | sí, al menos 4 casos |
| **Registro de cambios** | La sección «Registro de cambios», una línea fechada por cambio. En herramienta hacen ese papel «Lo que falló y por qué» y las líneas «Comprobado el …» | sí |

En la carpeta solo puede haber `SKILL.md`, `casos.json` y las subcarpetas
`referencias/`, `tecnicas/`, `scripts/` y `plantillas/`; cada fichero de una
subcarpeta lo cita `SKILL.md` con su ruta entera
(`` `.claude/skills/<nombre>/referencias/<tema>.md` ``): lo que no se cita no lo
abre nadie, y el test lo da por huérfano.

### Carga por capas

`SKILL.md` es lo que se carga siempre: corto, **como mucho 220 líneas** (el test
lo mide; no se sube el tope, se parte). Lo que solo hace falta a veces (un
procedimiento largo, una tabla de referencia, un ejemplo resuelto) va a una
capa y `SKILL.md` dice cuándo abrirla: «Para instalar las copias, abre …».

### Frontmatter

```yaml
---
name: <igual que la carpeta>
description: Úsala <cuándo: los disparadores concretos>. No para: <qué es de otra skill, regla o agente>.
metadata:
  tipo: <uno de los ocho>
  dueno: <agente de .claude/agents/ que la carga en su skills:>
  comprobado: AAAA-MM-DD
---
```

- `description` es lo que lee quien decide si abrirla: dice cuándo, con las
  palabras con que se pide, y qué no es suyo. Entre 81 y 600 caracteres.
- `dueno` es quien la mantiene, y tiene que llevarla en su `skills:`.
- `comprobado` es la última vez que alguien la contrastó con la realidad, y la
  fecha tiene que salir en su línea `Comprobado el AAAA-MM-DD: …`. **Caduca a
  los 90 días** (`PLAZO_COMPROBADO_DIAS`): un trimestre, lo mismo que la ventana
  máxima de observación de un fondo y que la vida de los tokens que antes
  caducan; los proveedores cambian antes que eso. Al caducar se vuelve a
  comprobar, no se cambia la fecha sin más.

### Casos de prueba (`casos.json`)

```json
{
  "skill": "<nombre>",
  "casos": [
    { "id": "ci-rojo", "peticion": "El CI de mi PR está en rojo, ¿qué ha fallado?", "skill": "<nombre>",
      "debe_salir": ["Propone gh run view <id> --log-failed", "No relanza sin mirar el log"] },
    { "id": "frontera-despliegue", "peticion": "La preview de Vercel no arranca", "skill": "vercel" }
  ]
}
```

- Al menos **4 casos**: 3 que deben cargar esta skill, con `debe_salir` (lo
  que tiene que decir o hacer quien la abra, comprobable), y 1 de frontera, que
  debe cargar otra skill o `ninguna` (el que mejor separa: la petición que se
  parece y no es suya).
- `peticion` en las palabras de quien pide, no en las de la skill. Nada de
  datos de familias ni nada sensible: el repo es público.
- Campos: `id`, `peticion`, `skill`, `debe_salir` y, si hace falta, `nota`.

## Los ocho tipos y sus secciones

Secciones obligatorias, en este orden. Los tipos que no son herramienta
comparten cabeza («Cuándo y para qué», «Método») y cola («Lo que falló y por
qué», «Registro de cambios», «Fuentes y comprobación»).

| Tipo | Qué guarda | Secciones, en orden |
|---|---|---|
| `herramienta` | Cómo se opera un servicio | Qué es y dónde · Claves y accesos · Operaciones habituales · Lo que falló y por qué · Qué requiere el OK de Pablo · Coste y límites · Fuentes y comprobación |
| `oficio` | Cómo se piensa un tipo de problema | Cuándo y para qué · Método · Técnicas · Ejemplo resuelto · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `dominio` | El conocimiento del negocio | Cuándo y para qué · Método · Lo que hay que saber · Dónde vive el dato · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `estandar` | Cómo deben quedar las cosas | Cuándo y para qué · Método · La norma · Bien y mal · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `receta_cambio` | Los pasos de una acción que se repite | Cuándo y para qué · Método · Antes de empezar · Cómo se comprueba · Qué requiere el OK de Pablo · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `rubrica_juez` | Qué mira un juez y cómo puntúa | Cuándo y para qué · Método · Qué mira · Cómo puntúa · Ejemplos calibrados · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `investigacion` | Cómo buscar fuera y destilar | Cuándo y para qué · Método · Pregunta y alcance · Dónde buscar · Cómo se destila · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `meta` | Cómo crear, probar y podar las propias piezas | Cuándo y para qué · Método · Cómo se prueba · Cuándo se poda · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |

Hoy solo hay skills de tipo herramienta; el estado de cada tipo lo lleva
`ops/flujo.json`. Los demás quedan declarados y no se crea ninguno hasta que
cumpla la regla de parada.

### Forma del tipo herramienta

```markdown
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

1. **Qué es y dónde.** Para quien llega de nuevas. Si hay un nombre antiguo o
   una trampa de identidad (otro nombre, otra cuenta), aquí.
2. **Claves y accesos.** Una línea por clave o acceso. Si el detalle manda en
   `ops/INVENTARIO.md`, se cita, no se copia.
3. **Operaciones habituales.** Una fila por operación, ordenadas de más a menos
   frecuentes. La tercera columna es lo que permite saber, sin preguntar, si
   ha ido bien. Lo que necesita un OK de Pablo se marca en la fila con «(OK)».
   Un procedimiento de muchos pasos va a `referencias/` y aquí queda su fila.
4. **Lo que falló y por qué.** Lo más reciente arriba. La fecha es de cuando
   pasó, `AAAA-MM-DD` (o `AAAA-MM` si no se sabe el día). Cada entrada cierra
   con su **Arreglo**; si no se ha arreglado, el arreglo dice «Sin resolver» y
   qué hay que hacer.
5. **Qué requiere el OK de Pablo.** La lista de gateways de este dominio. Es la
   misma regla de `CLAUDE.md`, concretada para este servicio.
6. **Coste y límites.** Una cifra con su fecha. «Sin coste propio» si no lo hay.
7. **Fuentes y comprobación.** La última línea del fichero es siempre
   `Comprobado el AAAA-MM-DD: …` o `Sin comprobar: …`.

### Los demás tipos

- **Cuándo y para qué**: el problema que resuelve y cuándo no usarla.
- **Método**: los pasos, en orden, cada uno con lo que sale. Lo largo, a una capa.
- **Lo que falló y por qué**: igual que en herramienta, con fecha, causa y
  arreglo; una skill nueva puede empezar sin entradas y decirlo.
- **Registro de cambios**: `- **AAAA-MM-DD** · qué cambió (#issue)`, lo más
  reciente arriba; al menos la primera versión.
- La última línea, como en herramienta: `Comprobado el …` o `Sin comprobar: …`.

## Nivel 2: ¿ayuda de verdad?

`npm run skills-prueba -- <skill> [<skill>…]` (cuesta tokens; tope propio de
1 $ por pasada si no se pide otro con `--tope`, y nunca más de lo que queda del
presupuesto mensual de evals de `scripts/lib/evals.mjs`):

1. **Disparo**: para cada caso, un modelo barato ve solo los nombres y las
   descripciones de todas las skills y elige una (o `ninguna`). Acierta si
   coincide con el `skill` del caso.
2. **Ejecución**: para cada caso propio, el modelo de las sesiones lee el
   `SKILL.md` y contesta a la petición sin ejecutar nada; un corrector barato
   mira cada línea de `debe_salir`.
3. Guarda el resultado en `ops/skills-prueba/<skill>.json` y lo compara con la
   pasada anterior caso a caso (`mejora`, `empeora`, `igual`, `nuevo`).

Se lanza al cambiar una skill y antes de subir su fecha de `comprobado`. Con
`--ensayo` dice qué correría y cuánto costaría como mucho, sin llamar a nadie.
