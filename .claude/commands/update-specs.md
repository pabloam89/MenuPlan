---
description: Actualiza /specs contra el código y la base de datos actuales tras cambios recientes
---

Actúa como arquitecto de software senior. Vas a **actualizar** las especificaciones técnicas existentes en `/specs`, no a rehacerlas desde cero. Esas specs se generaron por ingeniería inversa del código real y del esquema vivo de Supabase (ver `specs/INDEX.md` para la metodología y fecha de origen). Desde entonces el código ha podido cambiar; tu trabajo es detectar la deriva y corregir solo lo que haya quedado desactualizado.

## Alcance

Ficheros vivos a mantener sincronizados: `specs/auth.md`, `specs/menu-generation.md`, `specs/shopping-list.md`, `specs/receipt-ocr.md`, `specs/recipe-catalog.md`, `specs/pagos.md`, `specs/INDEX.md`.

`specs/AUDIT-REPORT.md` **no** entra en este comando — es una foto fija de una auditoría puntual (agentes de escalabilidad/integridad/seguridad), no documentación viva. No lo toques aquí.

## Proceso

1. **Lee primero lo ya documentado.** Carga los 7 ficheros de arriba para saber qué se afirma hoy sobre cada dominio (contrato funcional, modelo de datos, dependencias externas, puntos de acoplamiento, deuda técnica, marcas `[AMBIGUO]` o `[CORREGIDO fecha]` ya existentes).

2. **Vuelve a derivar la verdad desde las fuentes primarias**, con la misma metodología original — nunca desde la spec anterior ni de memoria:
   - Código real: `src/`, `api/`, `supabase/migrations/`.
   - Esquema vivo de Supabase (tablas, columnas, constraints, RLS, funciones `SECURITY DEFINER`, enums) vía las herramientas MCP de Supabase — el repo puede no reflejar el estado real de la base (ya ha pasado antes: ver el hallazgo transversal de deriva migración↔producción en `INDEX.md`).

3. **Compara y actualiza solo donde haya deriva real.** No reescribas un fichero entero si un dominio no ha cambiado. Cuando corrijas o añadas algo, marca la sección tocada con `[ACTUALIZADO {fecha de hoy}]` siguiendo el mismo estilo que ya usan las correcciones anteriores (`[CORREGIDO 2026-08-22]`, etc.), para que quede rastro de qué cambió y cuándo.

4. **Resuelve o abre `[AMBIGUO]`.** Si una duda marcada anteriormente ya tiene respuesta clara en el código actual, resuélvela y quita la marca. Si aparece una duda nueva, márcala igual que las anteriores y pregúntame en vez de asumir comportamiento.

5. **Actualiza `specs/INDEX.md`** si cambiaron las dependencias entre dominios, el mapa de acoplamiento, o si algún hallazgo transversal quedó resuelto o apareció uno nuevo.

6. **No inventes comportamiento que no esté en el código.** Si algo es ambiguo, márcalo como `[AMBIGUO]` y pregunta en vez de rellenar el hueco.

7. Al terminar, dame un resumen corto en forma de changelog: qué fichero, qué sección, qué cambió y por qué (una línea por cambio). No hace falta que hagas commit ni push — eso lo decido yo después de revisarlo.
