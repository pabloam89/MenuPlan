# El test del juez

Un control cuyo procesador es un juez solo cuenta si su norma apunta (`test_del_juez` en
`ops/normas.json`) a un fichero de esta carpeta, `<juez>.json`, con casos buenos y malos de
esa norma. Cómo se mide y qué hacer con la cifra:

- **Ensayo (gratis, sin red):** `npm run test-del-juez` valida la forma de los casos. Lo vigila
  `scripts/testDelJuez.test.js`.
- **De pago (lo lanza una persona):** `npm run test-del-juez -- revisor --si [--tope=0.5]`. El juez
  recibe cada caso (diff y norma con su condición, sin saber si es bueno o malo); el corrector **no es un modelo**:
  es determinista y gratis. Cada caso malo lleva `claves_senal` (grupos de palabras; un hallazgo vale si contiene,
  sin tildes ni mayúsculas, alguna palabra de cada grupo). La respuesta del juez se lee con tolerancia (vallas ```,
  prosa alrededor y escapes inválidos; `extraerJson`). Sale una línea `test-del-juez juez: … buenos: a/b malos: c/d`.
- **Cómo leer la línea:** `buenos` es cuántos aprueba bien (un juez que lo señala todo saca 0 aquí) y
  `malos`, cuántos señala bien (uno que lo aprueba todo saca 0 allí). Las dos se vigilan entre sí.
  Un juez que falla un caso de una norma deja esa norma sin comprobar hasta que se revise.
- **Quién marca los casos:** nunca el propio juez (`marcado_por`).
- **Añadir un juez:** su fichero `<juez>.json` con casos buenos y malos por norma, y apuntar
  `test_del_juez` en cada norma; luego bajar el techo de `ops/normas-techos.json`.

## El umbral A (decisión de Pablo, #698)

- **Casos:** cada norma, 4 o más (2 o más buenos y 2 o más malos). Un caso mínimo no vale, y el fichero
  de otro juez tampoco (su campo `juez` tiene que ser el de su nombre).
- **Umbral:** todos los buenos aprobados y al menos el 80 % de los malos señalados, en **dos pasadas
  seguidas** (como en `skills-prueba`) y sobre los casos que el fichero tiene hoy: si se amplían, hay que
  volver a medir. Una pasada que se paró por el tope no cuenta.
- **Registro:** cada pasada de pago escribe en `ops/test-del-juez/pasadas.json` (juez, fecha, cifra y coste),
  y la línea `test-del-juez umbral juez: … umbral_a: si|no`. Sin ese registro, la norma sigue sin comprobar:
  el techo `juez_sin_pasada_de_pago` de `ops/normas-techos.json` lo vigila y baja a 0 al registrarlas.
- **Quién la lanza:** otra sesión distinta de la que escribió los casos, con tope de 0,5 $ la primera vez.
- **Cuánto cuesta una pasada:** una pasada completa del revisor son 24 llamadas, todas al juez (el corrector ya
  no llama a nadie); unos 0,12-0,13 $, así que dos pasadas seguidas cuestan unos 0,25-0,3 $. Si el tope de 0,5 $ corta una pasada, queda con `sin_correr`
  mayor que 0 y **cuenta como parada**: no cumple el umbral y hay que repetirla entera.
- **Qué vigila el registro de pasadas** (`faltasDePasadas`, `faltasDeHistoria`): `coste_usd` mayor que 0;
  `casos = buenos + malos`; los aciertos no pasan de los casos; dos pasadas no pueden ser idénticas; cada
  pasada lleva `casos_hash` (hash de los casos del juez **más el prompt entero y la versión del corrector**
  (`VERSION_CORRECTOR`)), y editar un caso, el prompt o el corrector invalida las pasadas anteriores aunque el número
  no cambie (un prompt distinto es otro instrumento de medida); y el fichero solo crece por el final respecto a `origin/staging`.
- **Qué mide: al juez sin herramientas.** El test le da solo el diff, el cuerpo del PR y la norma; no puede
  leer el repo ni correr nada (por eso el aviso fijo del prompt). El aviso le dice que tome como dato lo
  que el diff o el cuerpo afirman y que no señale lo que solo se sabría mirando fuera. Hay un sesgo posible:
  los malos cuya señal es una **ausencia** (`columna-sin-lector`, `columna-solo-escrita`,
  `permiso-nuevo-sin-ok`, `test-nuevo-que-nunca-falla`, `test-tautologico`) no se ven sin mirar fuera, y un
  juez que calla lo no verificable los aprueba. Si tras la medida `columna-solo-escrita` o
  `columna-sin-lector` caen, es señal de este sesgo y no necesariamente de un juez malo: el juez real, con
  herramientas, los vería.

## Por qué el corrector es determinista (14 oct 2026)

En la segunda tanda de pago el juez señaló casi todos los malos, pero el corrector de modelo rechazó 4 hallazgos que sí decían
el defecto (8 de 12 aceptados) y hubo respuestas ilegibles. Con los hallazgos reales guardados
(`scripts/fixtures/test-del-juez-pasada-2.json`, sin claves), `claves_senal` acepta los 12 de 12 y ninguno de los 132
cruces (el hallazgo de un defecto no vale para otro): lo vigila `scripts/testDelJuezCorrector.test.js`.
Además, el prompt del juez omitía la `condicion` de la norma, de modo que `permisos-ok-pablo` se leía como
«todo permiso necesita el OK» y el caso bueno `quitar-permiso` (que solo restringe) salía señalado; ahora dice
«cuando amplía los permisos…». La norma no cambia. Cualquier cambio del corrector o de los casos invalida
las pasadas anteriores (hash): hay que repetir las dos pasadas de pago.
