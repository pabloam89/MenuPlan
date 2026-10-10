# Buscar antes de investigar (#384)

Detalle de la pieza que pone delante de la sesión lo ya apuntado. La regla
está en `SKILL.md`; aquí, cómo funciona.

- **El índice** (`npm run issues -- --indexar`, y el arranque de cada sesión de
  paso) guarda de cada issue de la casa y de los PR de la casa: número, estado,
  etiquetas, título, resumen, citas, quién lo lleva y encargos colgados. Vive
  en la carpeta temporal, fuera del repo. Solo entra lo escrito por OWNER,
  MEMBER o COLLABORATOR (el repo es público; #313).
- **El hook** `.claude/hooks/buscar-antes.mjs` ve un error, un test rojo ajeno,
  «Agent type … not found» o la carpeta principal fuera de `staging`, busca en
  el índice y pone en el contexto una frase fija con la señal y, si hay,
  «datos de GitHub» con los issues parecidos (títulos saneados). Una vez por
  señal y sesión; el aviso informa y no frena nada. La denegación de la guardia la añade la propia
  guardia a su mensaje.
- **Lo que cuenta** cada aviso queda en `senales.log` (junto al índice), una
  línea por señal con su `resultado`.

## Lo que falló y por qué

- **2026-10-09 · se trató como misterio lo ya arreglado (#348, #320).** Causa: buscar lo apuntado dependía de acordarse. Arreglo: (#384) el índice, `npm run buscar` y el hook `buscar-antes.mjs`, con test en `.claude/hooks/buscar-antes.test.js`.
