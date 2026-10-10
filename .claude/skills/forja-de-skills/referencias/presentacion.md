# Presentación: cómo se escribe lo que se lee

Cómo se da forma al texto de una skill (`SKILL.md` y sus capas). Pablo lo pidió
el 10 oct 2026 (#410): una skill bien pensada pero mal puesta en la página se
lee peor y se copia peor. Marca: **[F: fuente]** está en la fuente citada (en
`SKILL.md`, «Fuentes y comprobación»); **[I]** es criterio nuestro. Las guías
oficiales dicen poco de formato: pasos numerados si importa el orden, tablas
para referencia y los comandos en bloque de código. Lo demás es [I].

## Cuándo usar cada forma

| Forma | Cuándo | Cuándo no | Fuente |
|---|---|---|---|
| Tabla | Datos comparables con las mismas columnas en cada fila (comando y salida, vocabulario y significado) | Explicar o razonar: la prosa no cabe en una celda | [F: BP] |
| Lista numerada | Pasos en orden, donde cambiar el orden rompe el resultado | Cosas que no tienen orden | [F: BP] |
| Lista con viñetas | Cosas sin orden: opciones, condiciones, lo que hay que saber | Pasos que se hacen uno detrás de otro | [I] |
| Negrita | Una idea que no puede pasar desapercibida, o el nombre de lo que se define | Decoración, o más de una o dos por sección | [I] |
| Código en línea | Un comando corto, una ruta, un nombre de fichero o de variable, un valor literal | Una frase normal | [I] |
| Bloque de código | Un comando largo o de varias líneas, una salida esperada, el formato de un fichero | Un nombre suelto | [F: BP] |
| Párrafo | Una sola idea, de dos a cuatro frases | Un muro de texto: se parte | [I] |

## Un idioma y un vocabulario

- **Castellano** en la prosa; los comandos, rutas y nombres de código, tal cual
  están [I].
- **Una palabra por cosa**: si el fallo se llama «caso», no se llama también
  «incidente» ni «problema» en la misma skill [F: BP, terminología coherente].
- Las cabeceras bajan de nivel de una en una: de `##` a `###`, no de `##` a
  `####` [I].

## Quién lo comprueba

| Regla | Quién | Código |
|---|---|---|
| Un comando de la casa fuera de código (`npm run …`, `gh …`, `git …`) | Test del nivel 1 | `comando-suelto` |
| Tabla con filas de distinto ancho o con celdas vacías (típico: un `\|` sin escapar dentro de código) | Test del nivel 1 | `tabla` |
| Cabeceras que saltan de nivel | Test del nivel 1 | `cabeceras` |
| Si una tabla debía ser una lista, si la negrita sobra, si el párrafo se alarga, si el vocabulario es uno solo | Una persona (el `revisor`) | ninguno: no se puede medir |

El test mira `SKILL.md` y cada fichero `.md` de sus capas; no mira los bloques de
código. Un comando con su salida va en una tabla de operaciones o en un bloque;
en una frase, entre comillas invertidas.
