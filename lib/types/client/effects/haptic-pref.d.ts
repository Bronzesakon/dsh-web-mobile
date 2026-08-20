/**
 * Haptic preference: a client-only UI preference kept in localStorage — the
 * vibration is pure browser behavior (navigator.vibrate) with no host
 * setting behind it, so there is no host round-trip. Default ON, matching
 * the always-on behavior before the toggle existed. `write` persists and
 * dispatches a same-tab custom event (the haptic effect re-arms on it);
 * the browser's own `storage` event covers other tabs.
 */
export declare const HAPTIC_KEY = "dsh-mobile-nav.haptic.enabled";
export declare const HAPTIC_EVENT = "dsh-mobile-nav:haptic-pref";
/** Tap vibration strength tiers (durations live in haptic.ts). */
export type HapticIntensity = 'light' | 'medium' | 'heavy';
export declare const HAPTIC_INTENSITY_KEY = "dsh-mobile-nav.haptic.intensity";
export declare function readHapticEnabled(): boolean;
export declare function writeHapticEnabled(enabled: boolean): void;
export declare function readHapticIntensity(): HapticIntensity;
export declare function writeHapticIntensity(intensity: HapticIntensity): void;
//# sourceMappingURL=haptic-pref.d.ts.map