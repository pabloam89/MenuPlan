# El test del juez

Un control cuyo procesador es un juez solo cuenta si su norma apunta (`test_del_juez` en
`ops/normas.json`) a un fichero de esta carpeta, `<juez>.json`, con casos buenos y malos de
esa norma. Cómo se mide y qué hacer con la cifra:

- **Ensayo (gratis, sin red):** `npm run test-del-juez` valida la forma de los casos. Lo vigila
  `scripts/testDelJuez.test.js`.
- **De pago (lo lanza una persona):** `npm run test-del-juez -- revisor --si [--tope=0.5]`. El juez
  recibe cada caso (diff y norma, sin saber si es bueno o malo); un modelo barato distinto confirma
  que un hallazgo dice lo esperado. Sale una línea `test-del-juez juez: … buenos: a/b malos: c/d`.
- **Cómo leer la línea:** `buenos` es cuántos aprueba bien (un juez que lo señala todo saca 0 aquí) y
  `malos`, cuántos señala bien (uno que lo aprueba todo saca 0 allí). Las dos se vigilan entre sí.
  Un juez que falla un caso de una norma deja esa norma sin comprobar hasta que se revise.
- **Quién marca los casos:** nunca el propio juez (`marcado_por`).
- **Añadir un juez:** su fichero `<juez>.json` con casos buenos y malos por norma, y apuntar
  `test_del_juez` en cada norma; luego bajar el techo de `ops/normas-techos.json`.
