# dzri mobile

Capacitor native wrapper for dzri, packaged for Google Play and the App
Store.

## Why this loads a remote URL instead of bundling a build

dzri is a Next.js app with server components, API routes, and
session-cookie auth — all of which need a live backend. There is no
static export of it to bundle into the app. Instead, `capacitor.config.ts`
sets `server.url` to `https://dzri.am`, so the native shell is a thin
WebView pointed at the real production site. `www/index.html` is a
placeholder only, required because the Capacitor CLI insists `webDir`
point at a non-empty directory — it is never actually shown, since
`server.url` overrides it at runtime.

This means there is no local dev/build step for the web content here.
Changes to the app ship the normal way (deploy to `dzri.am`); this
wrapper only needs rebuilding when native config, plugins, icons, or
splash screens change.

## Opening the native projects

- `mobile/ios` requires Xcode, so it can only be opened on macOS:
  `npx cap open ios`
- `mobile/android` requires Android Studio:
  `npx cap open android`

## Common commands

Run these from inside `mobile/`:

```
npm install            # install Capacitor deps
npx cap add ios         # generate the Xcode project (first time only)
npx cap add android      # generate the Gradle project (first time only)
npx cap sync             # copy config/plugins into both native projects
```

Run `npx cap sync` after changing `capacitor.config.ts` or adding a
Capacitor plugin, and before opening either native project.

## Not set up yet

- App icons and splash screens (Capacitor defaults are in place for now)
- Push notifications
