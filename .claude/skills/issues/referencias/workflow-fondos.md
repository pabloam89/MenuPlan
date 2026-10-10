# Qué hace el workflow fondos

**Qué hace el workflow `fondos`**, solo sobre issues de la casa (autor
`OWNER`, `MEMBER` o `COLLABORATOR`) con etiqueta `tipo:fondo`, `tipo:caso` o
`tipo:encargo`: en cada alta, edición, etiqueta, cierre o reapertura (venga de
la CLI, el MCP o la web), y una vez al día (06:35 UTC). **Colgar un hijo de un
fondo no lanza ningún workflow** (GitHub no tiene disparador para sub-issues):
lo ve el pase diario, como mucho 24 h después, en los fondos abiertos con
ficha y en los cerrados con un caso `no-aguanto-*` o posterior al cierre
(`npm run issues -- --colgar` reabre al momento). Lo que hace:
- deja UN comentario con la marca `<!-- menuplan:fondo -->` (lo actualiza, no
  apila) con una línea por regla que falla, y pone `control:ok` o `control:falla`;
- reglas: `ficha-ausente`, `ficha-bloque`, `ficha-vocabulario`,
  `ficha-incompleta`, `causa-distinta`, `sin-diagnostico`,
  `observacion-sin-verificacion`, `verificacion-no-existe`, `verificacion-no-vale`,
  `observacion-sin-ventana`, `ventana-excesiva`, `cierre-sin-aprendizaje`,
  `clasificacion` (las `faltas()` de `issues.mjs`), `sin-fondo`, `caso-sin-analisis` (en casos y encargos), `plan-grande` (plan vigente: abiertos más
  preventivos automáticos hechos), `encargo-*` y `sin-preventivo-automatico` (#396, `docs/ops/ENCARGO.md`; norma `plan-tres-encargos-con-preventivo`);
- un fondo cerrado sin `aprendizaje` se **reabre**; un caso `no-aguanto-*` (o uno
  posterior al cierre) reabre el fondo y, una vez por caso, **sube un nivel de
  alcance** en la ficha (una vez por caso: la marca del comentario lo anota,
  también en fondos sin ficha); la ventana vencida sin casos nuevos y sin
  ningún no-aguanto lo pasa a `cerrado-eficaz` y lo cierra con su `arreglo:`, y
  con casos nuevos lo reabre. Los fondos de antes de la fecha de «Fechas» de Fuentes y comprobación (en SKILL.md) sin ficha solo
  avisan (el #334 va con ficha desde el principio: `npm run issues` lo marca).
- La marca del comentario lleva el `run` del workflow, y solo se lee un comentario
  del bot cuyo run sea de `fondos.yml`: otro workflow con el mismo bot no la falsifica.
- Informa y actúa sobre el estado del propio fondo; no impide editar. Si la API
  de GitHub no responde, el run falla con la causa (relánzalo); no culpa a nadie.
