---
name: revision-de-diseno
description: Úsala para revisar un sistema de diseño o una pantalla contra las leyes y los bloques de META-DISENO.md y sacar su lista de hallazgos con el arreglo de cada uno: «revisa el diseño de esta pantalla», «¿cumple el sistema del panel?», «¿qué le falta a HoMenu para estar completo?», «¿llega el contraste?», «antes de entregar, repasa el diseño». No para: revisar una skill (higiene-de-skills), juzgar la app en el navegador con capturas (agente qa), crear tokens, primitivos o pantallas (agente diseno) ni la voz de Lola.
metadata:
  tipo: revision
  opera_proveedor: false
  juzga_artefacto: true
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: diseno
  comprobado: 2026-10-12
  normas: [screen-accessible, test-visto-fallar]
---

# Revisión de diseño

## Cuándo y para qué

Para repasar una **instancia** (HoMenu, el panel, una pantalla o hoja nueva)
contra los dos niveles de `docs/diseno/META-DISENO.md` y devolver una lista de
hallazgos, cada uno con su código y su arreglo (#591). Entra el nombre de la
instancia y su perfil N2 (P1 para HoMenu, P2 para el panel), o una pantalla;
sale la lista y una cifra. Es el control que hace `diseno` antes de entregar;
el juicio final con capturas es de `qa`, y quien construye no juzga.

No es para:
- revisar una skill: `higiene-de-skills`;
- juzgar la app en el navegador, a 375 y 420 px, con capturas: el agente `qa`;
- crear o cambiar un token, un primitivo o una pantalla: el agente `diseno`, con
  su estándar (`npm run estandar -- diseno pantalla-con-tokens`);
- la voz de Lola o el tono del bot.

Se poda si nadie la abre en 90 días, o si el paso 2 del método deja de ser un
test y pasa a leerse a mano otra vez.

## Qué mira

Dos catálogos, que se citan y no se copian:

- **N0, las leyes** L01–L22 (`docs/diseno/META-DISENO.md`, sección 2). Cada una
  dice cómo se comprueba y si existe (`[existe]`) o no (`[por construir]`).
  Una ley sin comprobación **no cuenta como cumplida**.
- **N1, los bloques** A–Q, en `ops/diseno/bloques.json`: cuáles obliga su perfil,
  los apartados de cada uno y las fichas de token, componente, patrón y
  biblioteca. Un bloque que su perfil pide está cubierto o lleva «no aplica» con motivo.

El contraste, con una norma detrás <!-- norma:screen-accessible -->, lo mide
`src/design/contraste.test.js` sobre `ops/diseno/contraste.json`.

Vocabulario cerrado de hallazgos (el código es lo que se cuenta):

| Código | Señal observable | Ley o bloque | Gravedad |
|---|---|---|---|
| `valor-suelto-nuevo` | `npm run lint:base` da más valores sueltos que antes | L01 | falta |
| `contraste-bajo` | una pareja de `ops/diseno/contraste.json` no llega y no está en `excepciones` | L05 | falta |
| `excepcion-sobra` | una pareja de `excepciones` ya llega y sigue en la lista | L05 | falta |
| `pareja-sin-declarar` | texto y fondo nuevos que no están en `contraste.json` | L05 | aviso |
| `objetivo-pequeno` | control interactivo con área menor que `tam-tactil` (40) | L06 | falta |
| `color-unica-senal` | error, estado o selección que solo cambia de color | L08 | falta |
| `estado-sin-definir` | componente interactivo sin alguno de los estados del vocabulario de `bloques.json` | L14 | aviso |
| `componente-duplicado` | un primitivo nuevo que hace lo de uno de `src/components/ui.jsx` | L17 | falta |
| `bloque-sin-declarar` | bloque que el perfil pide, sin contenido ni «no aplica» con motivo | N1 | falta |
| `no-aplica-sin-motivo` | un «no aplica» sin su porqué | N1 | falta |
| `ficha-incompleta` | token, componente o patrón al que le falta un campo de su ficha | N1 C, D, E | aviso |
| `ley-sin-comprobacion` | se da por cumplida una ley marcada `[por construir]` | N0 | falta |

Falso positivo conocido: `estado-sin-definir` y `ficha-incompleta` saltan en casi
todo componente de HoMenu hoy, porque no hay ficha por componente (paso 5 del
orden de META-DISENO.md); se cuentan, no se arreglan de paso.

La pieza mala a propósito: los tests de `src/design/contraste.test.js` y de
`ops/diseno/bloques.test.js` rompen un dato a propósito y esperan el fallo
(`contraste-bajo`, `excepcion-sobra`, `bloque-sin-declarar`). Del resto no hay
script: es lectura con la lista.

## Cómo puntúa

- **Falta**: bloquea la entrega. Se arregla, o se declara como excepción con
  motivo y dueño en el sitio que corresponde (`excepciones` de `contraste.json`,
  «no aplica» del bloque).
- **Aviso**: se mira y se decide; si es falso positivo, se dice por qué en el PR.
- **La cifra** de una instancia, una línea: `diseno instancia: <i> perfil: <P>
  faltas: a avisos: b bloques: x de y contraste: n parejas, m excepciones`.
  Se pone antes y después en el PR. Bajan juntas las faltas, las excepciones de
  contraste y los valores sueltos; ninguna sube. Una cifra sola no es objetivo:
  se lee con una pantalla mirada a mano.
- Cada resultado nuevo de contraste o de bloques se ve fallar una vez antes de
  creérselo <!-- norma:test-visto-fallar -->, igual que los tests de arriba.

## Método

1. **Busca lo ya apuntado**: `npm run buscar -- "<instancia o pantalla>"` y
   `npm run issues`. Cada hallazgo lleva `YA APUNTADO: #n` o `NUEVO (buscado: …)`.
2. **Mide lo que se mide**: `npx vitest run src/design/contraste.test.js
   ops/diseno/bloques.test.js`. Sale verde, o el nombre de la pareja o del bloque
   que falla; apunta cuántas `excepciones` hay (`ops/diseno/contraste.json`).
3. **Cuenta los valores sueltos**: `npm run lint:base`. Sale `Valores sueltos: n
   (base n)`; si `n` sube, `valor-suelto-nuevo`.
4. **Abre el perfil**: busca el perfil de la instancia en `ops/diseno/bloques.json`
   y, de los 17 bloques, los que obligan. Para cada uno, dónde está su contenido
   (`DESIGN_SYSTEM.md`, `docs/diseno/ESTADO.md`, el código) o su «no aplica».
5. **Recorre L01–L22** con la instancia delante. Por cada ley, una de tres: test
   en verde (paso 2 o 3), revisada a mano con su evidencia (fichero, línea o captura de
   `qa`), o `[por construir]` y entonces no se da por cumplida.
6. **Redacta los hallazgos** con el código de la tabla, su evidencia y su arreglo:
   el token que falta se crea en el sistema primero (`token-o-primitivo-nuevo`).
   No se arregla en la misma pasada lo que no pide el hallazgo.
7. **Pon la cifra** de la instancia y, si el PR migra una pantalla, la de valores
   sueltos del fichero antes y después.

Sale bien si: los dos tests del paso 2 en verde, `lint:base` sin subir, cada
hallazgo con código, evidencia y arreglo, y cada ley con su estado dicho.

## Lo que falló y por qué

- **2026-10-12 · el contraste de HoMenu no se medía y 5 de 23 parejas declaradas no llegan a AA (#591).**
  Causa: `DESIGN_SYSTEM.md` decía «contraste alto» sin cifra y ningún test lo
  calculaba (el metadato `tinta-tenue` da 3,28:1, el placeholder 2,31:1). Arreglo: el
  test `src/design/contraste.test.js` con una lista de excepciones que solo baja.

## Registro de cambios

- **2026-10-12** · Primera versión: doce códigos de hallazgo sobre las leyes de N0 y los bloques de N1, con el contraste y los bloques medidos por test (#591, paso 6 del orden de META-DISENO.md).

## Fuentes y comprobación

- `docs/diseno/META-DISENO.md`: las leyes (sección 2), los bloques (sección 3) y los perfiles (sección 4).
- `docs/diseno/ESTADO.md`: decisiones D1–D12 y cifras de HoMenu.
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ (1.4.3, 1.4.11, 2.5.8).

Comprobado el 2026-10-12: los dos tests del paso 2 y `npm run lint:base` sobre HoMenu, cada regla de los tests vista fallar. Sin comprobar: el uso con una pantalla real de principio a fin, el panel (aún sin tokens) y `npm run skills-prueba -- revision-de-diseno` (cuesta tokens).
