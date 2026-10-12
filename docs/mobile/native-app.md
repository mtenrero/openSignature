# oSign como app nativa (Capacitor)

La versión móvil es una PWA "native-like" (barra de pestañas inferior, hojas inferiores, safe-areas,
modo oscuro, objetivos táctiles de 44px) y se empaqueta como app nativa con Capacitor apuntando a la
app **desplegada** (`server.url`). Este repositorio solo contiene el andamiaje: **no** se generan
plataformas nativas aquí (no hay `ios/` ni `android/`) y no hay dependencias `@capacitor/*`.

## Qué hay ya en el repo

| Pieza | Para qué |
| --- | --- |
| `capacitor.config.ts` | Configuración con tipo local (compila sin `@capacitor/cli`). `appId` placeholder `eu.osign.app`, `server.url` (`CAP_SERVER_URL`, por defecto `https://osign.eu/signatures`), `cleartext:false`, `allowNavigation` solo `osign.eu` y `*.osign.eu`. |
| `capacitor-www/index.html` | Página "Sin conexión" con botón Reintentar. Capacitor exige un `webDir`; la UI real viene de `server.url`. |
| `app/manifest.ts` + `public/icons/*` | Manifiesto PWA e iconos (`node scripts/generate-icons.mjs` los regenera). |
| `app/layout.tsx` | `viewport-fit=cover`, `theme-color` claro (#ffffff = `--os-surface`) / oscuro (#0e1116 = `--os-bg`), metas de iOS. `theme_color` del manifiesto es el claro (#ffffff) para coincidir con el cromo de la app; el azul de marca `#0058e6` solo se usa en los iconos. |
| `styles/tokens.css` | Variables `--os-safe-*` basadas en `env(safe-area-inset-*)`. |

`__tests__/unit/capacitorConfig.test.ts` protege los invariantes (https, sin cleartext, appId con formato
reverse-DNS, `webDir` existente, `allowNavigation` limitado a osign.eu).

## Requisitos

- macOS con Xcode 15+ y CocoaPods para iOS; Android Studio (JDK 17) para Android.
- Node de la versión del repo (`.nvmrc`).
- Una cuenta de Apple Developer / Google Play Console y un `appId` propio (sustituye el placeholder
  `eu.osign.app` antes de `cap add`; no se puede cambiar cómodamente después de publicar).

## Pasos de build (documentados, NO se ejecutan en este repo)

```bash
# 1. Dependencias (solo en la máquina de build, o en una rama dedicada)
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/ios @capacitor/android
# plugins recomendados: @capacitor/status-bar @capacitor/splash-screen @capacitor/share @capacitor/browser @capacitor/app

# 2. Plataformas
npx cap add ios        # y/o: npx cap add android

# 3. Sincronizar contra el despliegue (staging o producción), nunca contra un servidor local con credenciales reales
CAP_SERVER_URL=https://osign.eu/signatures npx cap sync

# 4. Compilar y firmar desde el IDE
npx cap open ios
npx cap open android
```

## Safe areas y barra de estado

- La web gestiona las safe-areas (`viewport-fit=cover`, `env(safe-area-inset-*)`); por eso
  `ios.contentInset: 'never'`. No añadas padding nativo adicional.
- Barra de estado: con `@capacitor/status-bar`, estilo `Default`/`Dark` según el esquema de color y
  `overlaysWebView: true` en iOS y Android para que el app bar sticky pinte bajo la barra.
- Splash: `launchShowDuration: 0` para ocultarlo en cuanto carga el WebView; define el color de fondo
  (`#f5f6f8` claro / `#0e1116` oscuro) en el asset del splash.
- El teclado virtual: la barra de pestañas se oculta sola cuando `visualViewport` se reduce (`useKeyboardOpen`).

## Deep links (enlaces de firma `/sign/*`)

El firmante recibe `https://osign.eu/sign/<shortId>`. Para abrirlo en la app:

- iOS: Associated Domains `applinks:osign.eu` y servir `/.well-known/apple-app-site-association` con
  `paths: ["/sign/*"]` (appID = `<TeamID>.<appId>`).
- Android: `intent-filter` con `autoVerify` para `https://osign.eu/sign/*` y `/.well-known/assetlinks.json`.
- En la app, `@capacitor/app` emite `appUrlOpen`; navega con `window.location.assign(url)` dentro del WebView.
- El middleware ya excluye `/manifest.webmanifest` y `/icons/*`; añade `/.well-known/*` a las rutas públicas al implementarlo.

## Caveat de login (importante)

`allowNavigation` no incluye ningún IdP. Google y Auth0 (con Google) **bloquean OAuth en WebViews
embebidos** (`disallowed_useragent`). Trabajo posterior necesario:

1. Abrir el IdP en `SFSafariViewController` / Chrome Custom Tabs con `@capacitor/browser`.
2. Volver a la app con un universal link / app link (`https://osign.eu/auth/native-callback`) que
   `@capacitor/app` entrega como `appUrlOpen`, y completar la sesión en el WebView.
3. Authentik (VetControl) sí funciona dentro del WebView; en ese caso añade su host a `allowNavigation`.

Hasta entonces, el inicio de sesión desde la app nativa solo es fiable con credenciales/IdP que admitan WebView.

## Instalar como PWA (sin tienda)

- iOS Safari: Compartir → "Añadir a pantalla de inicio".
- Android Chrome: menú ⋮ → "Instalar aplicación" (o el aviso de instalación).
- Escritorio Chrome/Edge: icono de instalar en la barra de direcciones.

El manifiesto abre `/signatures` en modo `standalone` con iconos normales y maskable.

## Reglas para que la web funcione bien dentro del WebView

- Navegación en la misma pestaña: nunca `window.open` tras un `await` (iOS lo bloquea y en Capacitor
  abriría el navegador del sistema). Las descargas/PDF usan descarga o `navigator.share` (`lib/ui/share.ts`).
- Sin dependencias de `hover`; objetivos ≥44px; unidades `dvh`.
- Notificaciones push, biometría, etc. quedan fuera de este andamiaje.

## Seguridad en desarrollo

No arranques `next dev` con el `.env.local` de producción para probar el shell. Usa los entornos de
e2e (`E2E_PORT=3101 npx playwright test e2e/mobile`), que vacían los proveedores reales y usan Mongo en memoria.
