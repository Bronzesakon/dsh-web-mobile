import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { MobileNavToggle } from './MobileNavToggle.tsx'
import { MobileNavOverlay } from './MobileNavOverlay.tsx'
import { MobileDrawerFooter } from './MobileDrawerFooter.tsx'
import { MOBILE_CSS } from './mobile.css.ts'
import { NS, en, zh } from './locales.ts'
import type { MobileNavKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Directory-drawer controls copy. */
    'mobileNav': MobileNavKey
  }
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'layout', 'locale', 'sessionLogDownload']

/**
 * Mobile-adaptive shell, browser half: injects the mobile stylesheet, then
 * contributes the directory toggle to the session header and the backdrop +
 * floating button to the shell overlay.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-mobile-nav: dictionaries')

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = '@dsh-external/dsh-mobile-nav'
    tag.dataset.pluginCss = '@dsh-external/dsh-mobile-nav/mobile.css'
    tag.textContent = MOBILE_CSS
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'dsh-mobile-nav: styles')

  // dsh-web-ui compatibility: the aionui explorer column would render as a
  // full-screen sheet over the whole mobile UI whenever its (persisted)
  // expanded state is active — including right after a reload, with no way
  // out (the suite's floating expand button only exists while collapsed).
  // Instead of fighting the suite's store timing, the mobile stylesheet keeps
  // the explorer column hidden by default and the drawer's Files action
  // opens it via the `data-aionui-explorer-open` marker on the frame. This
  // effect just clears that marker when the sheet's own collapse chevron is
  // tapped, so closing is symmetric with opening.
  ctx.effect(() => {
    const narrow = window.matchMedia('(max-width: 1023px)')
    if (!narrow.matches) return () => {}
    const onChevronClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target === null || !target.closest('.aionui-collapse-chevron')) return
      document.querySelector('[data-mobile-nav="frame"]')?.removeAttribute('data-aionui-explorer-open')
    }
    document.addEventListener('click', onChevronClick, true)
    return () => document.removeEventListener('click', onChevronClick, true)
  }, 'dsh-mobile-nav: aionui explorer close marker')

  // The official conversation status row (turns / steps / LLM time / TTFT /
  // cache) has a hashed class, so the stylesheet cannot target it directly.
  // Mark the exact row on narrow screens by text: a [class$=_root] that
  // carries the metrics text and no textarea (the composer card also ends in
  // _root and can mention turns in its model line). The marker lets the CSS
  // collapse the row to one horizontally scrolling line.
  ctx.effect(() => {
    const narrow = window.matchMedia('(max-width: 1023px)')
    if (!narrow.matches) return () => {}
    let marked = false
    const mark = (): void => {
      if (marked) return
      for (const root of document.querySelectorAll('[data-phase] [class$="_root"]')) {
        const text = root.textContent ?? ''
        if (!/(turns|steps|\bLLM\b|轮|步)/.test(text)) continue
        if (root.querySelector('textarea') !== null) continue
        root.setAttribute('data-mobile-nav', 'stats')
        marked = true
        return
      }
    }
    const observer = new MutationObserver(mark)
    observer.observe(document.body, { childList: true, subtree: true })
    mark()
    return () => {
      observer.disconnect()
    }
  }, 'dsh-mobile-nav: stats line marker')

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'mobile-nav-toggle',
    order: 10,
    locale: NS,
    inject: () => ({
      toggleSidebar: () => ctx.layout.toggleSidebar(),
    }),
  }, MobileNavToggle))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'mobile-nav-overlay',
    order: 10,
    locale: NS,
    inject: () => ({
      toggleSidebar: () => ctx.layout.toggleSidebar(),
    }),
  }, MobileNavOverlay))

  // Session log download, relocated from the session header to the drawer
  // footer on mobile (the header capsule is hidden by CSS); the drawer
  // footer also hosts the Files action that opens the dsh-web-ui explorer
  // sheet.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'mobile-nav-session-log',
    order: 10,
    locale: NS,
    inject: () => ({
      downloadSessionLog: (sessionId: string) => ctx.sessionLogDownload.download(sessionId),
      toggleSidebar: () => ctx.layout.toggleSidebar(),
    }),
  }, MobileDrawerFooter))
}

// Type-only augmentation imports: pull the layout / conversation / sidebar
// SlotMap merges and the sessionLogDownload service typing into this program
// without any runtime import.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-session-log-export/client'
