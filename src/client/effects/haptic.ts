import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { HAPTIC_EVENT, HAPTIC_KEY, readHapticEnabled, readHapticIntensity } from './haptic-pref.ts'
import type { HapticIntensity } from './haptic-pref.ts'

/** Vibration duration per intensity tier (ms). */
const INTENSITY_MS: Record<HapticIntensity, number> = {
  light: 8,
  medium: 15,
  heavy: 30,
}

/**
 * Tap haptics: a short vibration tick on tap of any interactive element
 * (Android only — iOS has no navigator.vibrate), the "physical" half of
 * the press feedback the stylesheet provides. The duration follows the
 * intensity preference (light 8ms / medium 15ms / heavy 30ms — the system
 * drives the linear motor on devices that have one). Throttled to 60ms so
 * a double-tap or fast typing cannot buzz repeatedly. Gated by the
 * General-settings preference (default on) and the narrow viewport:
 * desktop is a no-op, the listener only exists while the viewport is
 * narrow AND the preference is enabled.
 */
export function installHaptic(ctx: ClientContext): void {
  ctx.effect(() => {
    // Arm on the CURRENT width + preference and re-arm on every change of
    // either (same pattern as the aionui explorer marker effects): a
    // wide→narrow transition must install the listener, a narrow→wide
    // transition must drop it so desktop taps never buzz, and the settings
    // toggle must switch the listener without a reload. Intensity is read
    // per tap, so changing it needs no re-arm.
    const narrow = window.matchMedia('(max-width: 1023px)')
    let cleanup: (() => void) | undefined
    const install = (): void => {
      cleanup?.()
      if (!narrow.matches || !readHapticEnabled() || typeof navigator.vibrate !== 'function') {
        cleanup = undefined
        return
      }
      let last = 0
      const onTap = (event: MouseEvent): void => {
        const target = event.target as HTMLElement | null
        if (target === null) return
        if (target.closest('button, [role="button"], [role="tab"], [role="treeitem"], [role="option"], [role="switch"], a') === null) {
          return
        }
        const now = performance.now()
        if (now - last < 60) return
        last = now
        navigator.vibrate(INTENSITY_MS[readHapticIntensity()])
      }
      document.addEventListener('click', onTap, true)
      cleanup = () => document.removeEventListener('click', onTap, true)
    }
    const onStorage = (event: StorageEvent): void => {
      // Cross-tab: another tab toggled the preference.
      if (event.key === null || event.key === HAPTIC_KEY) install()
    }
    const onPref = (): void => install()
    install()
    narrow.addEventListener('change', install)
    document.addEventListener(HAPTIC_EVENT, onPref)
    window.addEventListener('storage', onStorage)
    return () => {
      narrow.removeEventListener('change', install)
      document.removeEventListener(HAPTIC_EVENT, onPref)
      window.removeEventListener('storage', onStorage)
      cleanup?.()
    }
  }, 'dsh-mobile-nav: tap haptic feedback')
}
