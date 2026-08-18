import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from './locales.ts';
/** Full props for the shell overlay entry. */
export interface MobileNavOverlayProps extends PropsRuntime<'shell.overlay'>, PropsLocale<typeof NS> {
    /** Bound ctx.layout.toggleSidebar(). */
    toggleSidebar: () => void;
}
/**
 * Mobile shell overlay: mirrors the frame's collapsed state into React state,
 * renders the dimmed backdrop plus a floating directory button for the
 * hero/blank phases that have no session header. The frame marker itself is
 * owned by the shared frame controller; reparenting work lives in the shared
 * DOM reconciler.
 */
export declare function MobileNavOverlay({ toggleSidebar, t }: MobileNavOverlayProps): import("react").JSX.Element | null;
//# sourceMappingURL=MobileNavOverlay.d.ts.map