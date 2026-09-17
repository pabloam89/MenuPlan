# Compilar y subir la app iOS desde un Mac

Guía para la primera sesión en el Mac (y contexto para Claude si se abre allí).

## Estado (2026-09-17)
- Capacitor 8 con Swift Package Manager; proyecto en `ios/`. Solo iPhone, vertical.
- Bundle ID `com.homenu.app`. La web va empaquetada y llama a `https://homenu.vercel.app/api/*` (`src/lib/apiUrl.js`, CORS en `api/_guard.js`).
- **Pendiente antes de enviar a revisión:**
  1. Login con Google dentro de la app: abrirlo con `@capacitor/browser` y volver por `com.homenu.app://auth-callback` (añadir esa URL en Supabase → Authentication → URL Configuration). Hasta entonces el login no funciona en iOS.
  2. No registrar el service worker ni mostrar `InstallPwaBanner` en nativo.
  3. Sign in with Apple (App Store Review Guideline 4.8).
- Objetivo de la primera sesión: app en un iPhone real y build subida a TestFlight, **sin enviar a revisión**.

## Requisitos
- Xcode 26 o posterior, Node 22 o posterior.
- `.env.production.local` en la raíz (no está en git): `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del proyecto de producción.

## Pasos
```bash
npm ci
npm run build && npx cap sync ios && npx cap open ios
```
En Xcode: Settings → Accounts (Apple ID) → target App → Signing & Capabilities → Team.
Probar en el iPhone (activar Ajustes → Privacidad y seguridad → Modo desarrollador).
Subir: Product → Archive → Distribute App → App Store Connect.

Cada nueva subida necesita subir `CURRENT_PROJECT_VERSION` (Build) en el target.
