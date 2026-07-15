import { Capacitor } from '@capacitor/core'
import { StatusBar } from '@capacitor/status-bar'

/**
 * Platform screen helpers for the Android app:
 *  - fullscreen: hide the status bar so the app uses the whole display
 *  - keep-awake: hold a screen Wake Lock while a game is in progress
 * All calls are safe no-ops on the web / where unsupported.
 */

/** Hide the status bar for a fullscreen, game-like presentation. */
export async function enableFullscreen(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await StatusBar.hide()
  } catch {
    // Plugin unavailable or unsupported — ignore.
  }
}

// `WakeLockSentinel` isn't in every TS lib target; keep it loosely typed.
let wakeLock: { release: () => Promise<void> } | null = null
let keepOn = false

async function requestWakeLock(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<never> } }
  if (!nav.wakeLock || wakeLock) return
  try {
    wakeLock = await nav.wakeLock.request('screen')
    // The OS releases the lock when the app is backgrounded; drop our handle.
    ;(wakeLock as unknown as EventTarget).addEventListener?.('release', () => {
      wakeLock = null
    })
  } catch {
    wakeLock = null
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible' && keepOn) void requestWakeLock()
}

/** Keep the screen on (call when a game becomes active). */
export async function keepScreenOn(): Promise<void> {
  keepOn = true
  document.addEventListener('visibilitychange', onVisibilityChange)
  await requestWakeLock()
}

/** Allow the screen to sleep again (call when leaving the game). */
export async function allowScreenSleep(): Promise<void> {
  keepOn = false
  document.removeEventListener('visibilitychange', onVisibilityChange)
  try {
    await wakeLock?.release()
  } catch {
    // ignore
  }
  wakeLock = null
}
