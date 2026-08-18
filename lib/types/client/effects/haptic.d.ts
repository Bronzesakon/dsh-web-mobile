import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
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
export declare function installHaptic(ctx: ClientContext): void;
//# sourceMappingURL=haptic.d.ts.map