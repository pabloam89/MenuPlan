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

## Capturas para App Store Connect (App Store → Previews and Screenshots)
Sacarlas del **Simulador de Xcode** (Xcode → Open Developer Tool → Simulator, o al correr la app con ▶), no de la web ni de Android:
1. Elige un simulador de iPhone grande (ej. iPhone 16 Pro Max) en la barra de Xcode antes de darle a ▶.
2. Navega a la pantalla que quieras mostrar.
3. `Cmd+S` en el Simulador: guarda un PNG en el Escritorio con el tamaño exacto que pide Apple, listo para arrastrar.
4. Repite para 3-4 pantallas (menú semanal, lista de la compra, una receta, el feed social).
5. Arrastra los PNG a "Previews and Screenshots" → iPhone → 6.5"/6.9" Display en App Store Connect.

## Estado de App Store Connect (2026-09-17)
Ya hecho desde el navegador (sin esperar al Mac): Team ID, App ID `com.homenu.app` con Sign in with Apple, ficha "HoMenu" creada, Age Rating (13+ por UGC/feed social), App Privacy con los tipos de dato reales de la app (no los que Apple/otro dev había dejado puestos por defecto).
Pendiente en App Store Connect: decidir trader/non-trader a nivel de app (Digital Services Act, en App Information), Support URL, capturas (arriba), Description/Keywords ya redactadas — ver conversación o pedir a Alvaro.
