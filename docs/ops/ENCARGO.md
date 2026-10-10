# El formato de un encargo

<!-- Generado desde scripts/lib/issues.mjs con `npm run flujo -- --escribir`. No se edita a mano: scripts/encargo.test.js lo compara. -->

Referencia común de las skills de oficio (`causa-raiz`, `plan-de-arreglo`) para escribir un encargo (`tipo:encargo`) que cuelga de un fondo. El cuerpo lleva el bloque de abajo (el formulario de encargo lo trae) además del «Qué».

| Clave | Vale | Obligatoria |
|---|---|---|
| `fondo` | `#n` del fondo del que cuelga | sí |
| `tipo_accion` | `preventivo`, `detectivo`, `correctivo` | sí |
| `mecanismo` | un `id` de `ops/mecanismos.json`; su escalón sale de ahí | sí |
| `por_que_no_mas_alto` | texto: por qué no se usa un mecanismo de un escalón más alto | si el escalón no es el primero (bloqueo) |
| `clase` | texto: qué parte de la clase del fondo cubre | sí |
| `depende_de` | `#n, #m` o `ninguno` | sí |
| `constructor` | un agente de `.claude/agents/` o `sesión` | sí |
| `juez` | un agente juez de `.claude/agents/`, distinto del constructor | sí |
| `verificacion` | ruta del fichero que prueba la clase (un `*.test.js` si el escalón es test_ci) | sí |
| `hecho_cuando` | texto: lo que se ve cuando está hecho | sí |
| `ficheros` | rutas que toca, separadas por coma | no |

Tipos de acción:

- `preventivo`: Impide que la clase vuelva a pasar.
- `detectivo`: Avisa en cuanto vuelve a pasar.
- `correctivo`: Arregla las instancias que ya hay (el barrido).

**Automático** quiere decir que el escalón de su mecanismo es `bloqueo` o `test_ci`: se cumple sin que nadie se acuerde. Un fondo lleva como mucho 3 encargos, y al menos uno es `preventivo` y automático.

Plantilla:

```encargo
fondo:
tipo_accion:
mecanismo:
por_que_no_mas_alto:
clase:
depende_de:
constructor:
juez:
verificacion:
hecho_cuando:
ficheros:
```
