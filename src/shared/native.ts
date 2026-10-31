import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  SystemBarType,
} from "@capacitor/core"

import { App as CapApp } from "@capacitor/app"

/** True when running inside the Android app (not a normal browser). */

const isNativeApp = Capacitor.isNativePlatform()

/**
 * Where the Android back button goes from a screen. "exit" leaves the app;
 * "previous" returns to whichever screen opened this one. Each feature lists its
 * own screens in its navigation.ts; src/navigation.ts combines them.
 */

export type BackTarget<S extends string> = S | "exit" | "minimize" | "previous"

/** Screens with a navy top bar get white status-bar icons; light screens get dark icons. */

export function applyStatusBar(screen: string) {
  document.body.dataset.screen = screen

  if (!isNativeApp) return

  const style = screen === "home" ? SystemBarsStyle.Dark : SystemBarsStyle.Light

  SystemBars.setStyle({ style, bar: SystemBarType.StatusBar }).catch(() => {})
}

/**
 * Handles the Android hardware/gesture back button:
 * 1. If a pop-up sheet is open, close it.
 * 2. Otherwise go to the previous screen.
 * 3. On the first screens, leave or minimize the app.
 */

export function listenForBackButton<S extends string>(
  backTargets: Record<S, BackTarget<S>>,

  getScreen: () => S,

  getPrevScreen: () => S,

  go: (screen: S) => void,
) {
  if (!isNativeApp) return () => {}

  const handle = CapApp.addListener("backButton", () => {
    const backdrop = document.querySelector<HTMLElement>(
      '[role="dialog"] > div[aria-hidden="true"]',
    )

    if (backdrop) {
      backdrop.click()

      return
    }

    const target = backTargets[getScreen()]

    if (target === "exit") CapApp.exitApp()
    else if (target === "minimize") CapApp.minimizeApp()
    else go(target === "previous" ? getPrevScreen() : target as S)
  })

  return () => {
    handle.then((h) => h.remove())
  }
}
