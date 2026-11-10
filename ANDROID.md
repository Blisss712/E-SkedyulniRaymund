# E-Skedyul on Android

The same React code runs as a website **and** as an Android app, using [Capacitor](https://capacitorjs.com).
The `android/` folder is a normal Android Studio project that wraps the built website.

## Easiest: let GitHub build the APK (no Android Studio needed)

1. Push this project to a GitHub repository (branch `main`).
2. Open the repo on GitHub → **Actions** → **Build Android APK**. It starts automatically on every push
   (or click **Run workflow**).
3. When it turns green (about 5–8 minutes), open the run and download **E-Skedyul-android-apk** under *Artifacts*.
4. Unzip it, send `app-debug.apk` to the phone, and open it. Android will ask to allow installing from this source — allow it.

## With Android Studio (to test on an emulator or a phone with USB)

```bash
pnpm install
pnpm android:sync     # builds the website and copies it into android/
pnpm android:open     # opens the android/ folder in Android Studio
```

In Android Studio, wait for Gradle to finish, pick a device, and press ▶ Run.

**Every time you change the React code, run `pnpm android:sync` again** so the app gets the new version.

## Android-specific behaviour

- **Back button / back gesture**: closes an open pop-up first, then goes to the previous screen.
  On the welcome screen it exits; on the home screen it minimises the app. (See `src/native.ts`.)
- **Status bar and notch**: content is kept clear of the status bar and gesture bar (`env(safe-area-inset-*)`).
- **Works offline**: the Inter font is bundled with the app instead of loaded from Google Fonts.
- **Icon and splash screen**: made from the E-Skedyul church logo (`assets/`). To change them, replace the
  files in `assets/` and run `npx @capacitor/assets generate --android --iconBackgroundColor '#1B3A6B' --splashBackgroundColor '#F4F6FB'`.
- **Phone schedule layout**: My Schedule opens in *One Day* view on phones (bigger, easier to read) and
  *Whole Week* on tablets and computers. Both buttons are always there.

## Also installable from Chrome

The website has a web app manifest, so on an Android phone you can open it in Chrome →
⋮ menu → **Add to Home screen** and it opens full-screen like an app.
