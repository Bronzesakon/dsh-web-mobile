import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from './locales.ts';
/** Full props for the General-settings row (the slot owner passes nothing). */
export type HapticRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<typeof NS>;
/**
 * General-settings preference row: pill switch for the tap vibration plus an
 * intensity selector styled after the official LanguageRow pill control
 * (bg-module-platform + chevron Menu). Client-only preferences — the switch
 * is a plain role=switch button (no official switch primitive exists) and
 * the intensity is a portaled Menu. Layout is a column: title + plugin
 * attribution on top, then a controls row with the switch and the selector
 * side by side, so the long title never squeezes the controls on a narrow
 * phone. While the switch is off the selector is disabled and grayed by the
 * stylesheet. State is read from localStorage on mount, so the row always
 * reflects the persisted preferences; writes persist and the haptic effect
 * re-arms on the custom event (intensity is read per tap, no re-arm needed).
 * The row renders on any width but the stylesheet hides it on desktop, where
 * the vibration can never fire (the plugin keeps ≥1024px identical to an
 * uninstalled state).
 */
export declare function HapticRow({ t }: HapticRowProps): import("react").JSX.Element;
//# sourceMappingURL=HapticRow.d.ts.map