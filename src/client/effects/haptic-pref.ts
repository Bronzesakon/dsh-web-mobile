/**
 * Haptic preference: a client-only UI preference kept in localStorage — the
 * vibration is pure browser behavior (navigator.vibrate) with no host
 * setting behind it, so there is no host round-trip. Default ON, matching
 * the always-on behavior before the toggle existed. `write` persists and
 * dispatches a same-tab custom event (the haptic effect re-arms on it);
 * the browser's own `storage` event covers other tabs.
 */
export const HAPTIC_KEY = 'dsh-mobile-nav.haptic.enabled'
export const HAPTIC_EVENT = 'dsh-mobile-nav:haptic-pref'
/** Tap vibration strength tiers (durations live in haptic.ts). */
export type HapticIntensity = 'light' | 'medium' | 'heavy'
export const HAPTIC_INTENSITY_KEY = 'dsh-mobile-nav.haptic.intensity'

export function readHapticEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HAPTIC_KEY)
    return raw === null ? true : raw !== '0'
  } catch {
    return true
  }
}

export function writeHapticEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTIC_KEY, enabled ? '1' : '0')
  } catch {
    // Storage unavailable (private mode / quota): the toggle still works for
    // this session through the event below, it just will not persist.
  }
  document.dispatchEvent(new CustomEvent(HAPTIC_EVENT))
}

export function readHapticIntensity(): HapticIntensity {
  try {
    const raw = localStorage.getItem(HAPTIC_INTENSITY_KEY)
    return raw === 'medium' || raw === 'heavy' ? raw : 'light'
  } catch {
    return 'light'
  }
}

export function writeHapticIntensity(intensity: HapticIntensity): void {
  try {
    localStorage.setItem(HAPTIC_INTENSITY_KEY, intensity)
  } catch {
    // Storage unavailable: the selection still works for this session, it
    // just will not persist.
  }
  document.dispatchEvent(new CustomEvent(HAPTIC_EVENT))
}
