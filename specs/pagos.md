# Dominio: Pagos

## Hallazgo — este dominio no existe en el código

Siguiendo la instrucción de no inventar comportamiento no presente en el código: **no hay ninguna integración de pagos, suscripciones ni facturación en esta aplicación**, en ningún estado (ni activa, ni a medio construir, ni deshabilitada).

Evidencia (verificada al inicio de esta auditoría, 2026-08-16):

- `grep -rli "stripe\|payment\|checkout\|subscription\|billing" src/ api/ package.json supabase/` no produce ningún resultado real. Los 4 "hits" iniciales fueron falsos positivos, confirmados leyendo cada uno:
  - `src/lib/useAuth.js:43` — `sub?.subscription?.unsubscribe?.()`, el objeto de suscripción a eventos del SDK de Supabase Auth JS, sin relación con facturación.
  - `src/screens/Shopping.jsx` — `CookDayStripe`, nombre de un componente de UI ("franja del día"), no relacionado con Stripe.
  - `src/lib/menusSync.test.js` / `menusSync.supabase.test.js` — la palabra "checkout" aparece en comentarios refiriéndose a "this checkout" (el directorio de trabajo git), no a un flujo de compra.
- `package.json` no tiene `stripe` ni ninguna librería de pagos como dependencia.
- No existe ningún directorio `supabase/functions/` (Edge Functions) que pudiera alojar webhooks de pago.
- No hay ninguna tabla en el esquema de Supabase (`information_schema.columns`, 19 tablas revisadas íntegramente para esta auditoría) con nombre o columnas sugerentes de planes, suscripciones, precios o transacciones.
- La aplicación no tiene ningún gate de "premium"/"pro"/paywall visible en `src/screens/` ni `src/App.jsx`.

## Implicación para el resto de la spec

Ningún otro dominio (auth, generación de menús, catálogo, compra, OCR) depende de un estado de pago o suscripción. `user_profiles` no tiene columna de plan/tier. El modelo de negocio actual, tal y como está reflejado en el código, es de acceso completo y gratuito, incluso sin cuenta (ver invariante central en `auth.md`).

[AMBIGUO — no se puede responder desde el código]: si hay intención de negocio de monetizar la aplicación, no hay ningún andamiaje preparatorio (ni siquiera un flag apagado) sobre el que construirlo. Cualquier trabajo de "pagos" partiría de cero.
