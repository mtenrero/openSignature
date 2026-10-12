# oSign como app nativa (Capacitor)

La versión móvil es una PWA "native-like" (barra de pestañas inferior, hojas inferiores,
safe-areas, modo oscuro) y se empaqueta como app nativa con Capacitor apuntando a la app
desplegada (`server.url`). Este repositorio solo contiene el andamiaje: **no** se generan
plataformas nativas aquí.

## Qué hay ya en el repo

- `capacitor.config.ts`: `appId` (placeholder `eu.osign.app`), `server.url`
  (`CAPACITOR_SERVER_URL`, por defecto `https://osign.eu`), colores de fondo.
- `app/manifest.ts` + `public/icons/*`: manifiesto PWA e iconos (`node scripts/generate-icons.mjs` los regenera).
- `app/layout.tsx`: `viewport-fit=cover`, `theme-color` claro/oscuro, metas de iOS (`appleWebApp`).
- UI con `env(safe-area-inset-*)`, unidades `dvh` y objetivos táctiles de 44px.

## Pasos de build (en una máquina con Xcode / Android Studio)

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
# (opcional) plugins: @capacitor/status-bar @capacitor/splash-screen @capacitor/share @capacitor/browser
npx cap add ios        # y/o: npx cap add android
# Apunta al despliegue (staging o producción), nunca a un servidor local con credenciales reales
CAPACITOR_SERVER_URL=https://osign.eu npx cap sync
npx cap open ios       # compilar/firmar desde Xcode
npx cap open android   # compilar/firmar desde Android Studio
```

## Reglas para que la web funcione bien dentro del WebView

- Navegación en la misma pestaña: no usar `window.open` tras un `await` (iOS lo bloquea y en
  Capacitor abriría el navegador del sistema). Las descargas/PDF se abren con descarga o `navigator.share`.
- El SSO (Auth0/Authentik) debe permitirse en `server.allowNavigation`; si el IdP bloquea WebViews,
  usar `@capacitor/browser` y un esquema de retorno (deep link).
- iOS: `contentInset: 'never'` porque la web ya gestiona las safe-areas.
- Notificaciones push, biometría, etc. quedan fuera de este andamiaje.

## Seguridad en desarrollo

No arranques `next dev` con el `.env.local` de producción para probar el shell. Usa los
entornos de e2e (`E2E_PORT=3101 npx playwright test e2e/mobile`) que vacían los proveedores
reales y usan una Mongo en memoria.
