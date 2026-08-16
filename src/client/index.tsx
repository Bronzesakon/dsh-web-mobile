import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { MobileNavToggle } from './MobileNavToggle.tsx'
import { MobileNavOverlay } from './MobileNavOverlay.tsx'
import { MobileDrawerFooter } from './MobileDrawerFooter.tsx'
import { MOBILE_CSS } from './styles/index.ts'
import { installDebugBadge } from './debug.ts'
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

  // Diagnostic overlay for phone-side repros (?mobile-nav-debug=1).
  installDebugBadge(ctx)

  // Phone chrome: KEEP the system status bar (no fullscreen) and make it
  // blend into the page. On narrow screens:
  // - The viewport meta gains viewport-fit=cover, so env(safe-area-inset-top)
  //   is the real status-bar / notch height and the stylesheet can push every
  //   surface below it (off notched phones, or in a browser tab where the
  //   layout viewport already sits below the status bar, the inset is 0 and
  //   nothing shifts).
  // - A theme-color meta tracks the shell background (the official theme is
  //   toggled by body[data-ds-dark-theme], which flips --dsw-alias-bg-base):
  //   Android then paints the status bar / URL bar with the page's own base
  //   color, so the status bar reads as part of the UI instead of a foreign
  //   strip. The drawer paints the same strip on iOS / notch displays.
  // - gesturestart is suppressed as the legacy-iOS fallback for double-tap
  //   zoom; modern browsers are covered by the stylesheet's
  //   touch-action: manipulation (which keeps pan and pinch zoom).
  ctx.effect(() => {
    const narrow = window.matchMedia('(max-width: 1023px)')
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    const originalViewport = viewport?.content ?? ''
    const themeMeta = document.createElement('meta')
    themeMeta.name = 'theme-color'
    const bodyBg = (): string => getComputedStyle(document.body).backgroundColor

    const sync = (): void => {
      if (viewport !== null) viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
      themeMeta.content = bodyBg()
      if (themeMeta.parentElement === null) document.head.appendChild(themeMeta)
    }
    const restore = (): void => {
      if (viewport !== null) viewport.content = originalViewport
      themeMeta.remove()
    }
    const onGestureStart = (event: Event) => event.preventDefault()
    if (narrow.matches) sync()
    const onChange = (event: MediaQueryListEvent) => (event.matches ? sync() : restore())
    narrow.addEventListener('change', onChange)
    const observer = new MutationObserver(() => {
      if (narrow.matches) themeMeta.content = bodyBg()
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    document.addEventListener('gesturestart', onGestureStart)
    return () => {
      narrow.removeEventListener('change', onChange)
      observer.disconnect()
      document.removeEventListener('gesturestart', onGestureStart)
      restore()
    }
  }, 'dsh-mobile-nav: status bar theme + viewport + zoom guard')

  // dsh-web-ui compatibility: the aionui explorer column would render as a
  // sheet over the whole mobile UI whenever its (persisted) expanded state
  // is active — including right after a reload, with no way out (the
  // suite's floating expand button only exists while collapsed). Instead
  // of fighting the suite's store timing, the mobile stylesheet keeps the
  // explorer column hidden by default and the header's Files action (plus
  // the drawer footer entry) opens it via the `data-aionui-explorer-open`
  // marker on the frame. This effect just clears that marker when the
  // sheet's own collapse chevron is tapped, so closing is symmetric with
  // opening.
  ctx.effect(() => {
    // Arm on the CURRENT width and re-arm on every width change: the guard
    // used to run once at apply time, so a wide→narrow transition (desktop
    // resize, tablet split view) left the markers dead and the explorer /
    // preview sheets could neither open nor close properly.
    const narrow = window.matchMedia('(max-width: 1023px)')
    let cleanup: (() => void) | undefined
    const install = (): void => {
      cleanup?.()
      if (!narrow.matches) {
        cleanup = undefined
        return
      }
      const onChevronClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        if (target === null || !target.closest('.aionui-collapse-chevron')) return
        document.querySelector('[data-mobile-nav="frame"]')?.removeAttribute('data-aionui-explorer-open')
      }
      document.addEventListener('click', onChevronClick, true)
      cleanup = () => document.removeEventListener('click', onChevronClick, true)
    }
    install()
    narrow.addEventListener('change', install)
    return () => {
      narrow.removeEventListener('change', install)
      cleanup?.()
    }
  }, 'dsh-mobile-nav: aionui explorer close marker')

  // dsh-web-ui compatibility: the aionui preview column persists its open
  // tabs in localStorage and restores them on load, which would pop the
  // preview sheet over the fresh UI after a reload. Gate it like the
  // explorer: the stylesheet keeps the column hidden unless the frame
  // carries `data-aionui-preview-open`; this effect sets that marker when
  // the user actually taps a file row in the explorer sheet, and clears it
  // whenever the suite hides the column again (collapse chevron / tab
  // close), so a restored-but-unwanted sheet never appears.
  ctx.effect(() => {
    // Arm on the CURRENT width and re-arm on every width change (see the
    // explorer marker effect for why).
    const narrow = window.matchMedia('(max-width: 1023px)')
    let cleanup: (() => void) | undefined
    const install = (): void => {
      cleanup?.()
      if (!narrow.matches) {
        cleanup = undefined
        return
      }
      const frame = (): HTMLElement | null => document.querySelector('[data-mobile-nav="frame"]')
      // Closing the preview sheet also drops the fullscreen marker, so the
      // next preview starts in the sheet layout again.
      const closePreview = (): void => {
        frame()?.removeAttribute('data-aionui-preview-open')
        frame()?.removeAttribute('data-mobile-preview-full')
      }
      const onTap = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        if (target === null) return
        const row = target.closest('[data-aionui-explorer-col] [class*="_treeRow"]')
        if (row === null) return
        // Only FILE rows open the preview sheet. Directory rows toggle
        // expansion and must not pop the (possibly stale, restored-from-
        // localStorage) preview tab over the tree. Substring matching:
        // the suite's hashed classes carry a hash prefix, so the exact-token
        // `class~=` form never matches and the trailing `$=` form misses
        // selected rows (`_treeRowSelected`) and open arrows
        // (`_treeArrowOpen`) — regressions of issue #8. The arrow gate must
        // additionally exclude the leaf marker: FILE rows render a
        // `_treeArrowEmpty` span whose class still contains the `_treeArrow`
        // substring, so a bare substring match would treat every row as a
        // directory and no preview would ever open.
        if (row.querySelector('[class*="_treeArrow"]:not([class*="_treeArrowEmpty"])') !== null) return
        frame()?.setAttribute('data-aionui-preview-open', '')
      }
      // The preview sheet's own collapse button (the two inward arrows in the
      // tab bar) closes the AionUI store, but on mobile the suite's layout sync
      // can be skipped while its shell-track mirror is not ready yet — in that
      // case the inline visibility never flips to hidden and the visibility
      // watcher below would never clear our marker. Clear it directly on the
      // button click so the sheet always closes regardless of the suite's sync.
      const onCollapse = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        if (target === null) return
        if (target.closest('[data-aionui-preview-col] [class$="_panelCollapse"]') !== null) {
          closePreview()
        }
      }
      const sync = (): void => {
        const pv = document.querySelector<HTMLElement>('[data-aionui-preview-col]')
        if (pv === null) return
        // Read the suite's inline visibility, not the computed value: while the
        // `data-aionui-preview-open` marker is present our stylesheet forces the
        // sheet visible with !important, so getComputedStyle() would never report
        // hidden and the marker would never be cleared.
        if (pv.style.visibility === 'hidden') closePreview()
      }
      document.addEventListener('click', onTap, true)
      document.addEventListener('click', onCollapse, true)
      const observer = new MutationObserver(sync)
      observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] })
      sync()
      cleanup = () => {
        document.removeEventListener('click', onTap, true)
        document.removeEventListener('click', onCollapse, true)
        observer.disconnect()
      }
    }
    install()
    narrow.addEventListener('change', install)
    return () => {
      narrow.removeEventListener('change', install)
      cleanup?.()
    }
  }, 'dsh-mobile-nav: preview sheet open marker')

  // The official conversation status row (turns / steps / LLM time / TTFT /
  // cache) has a hashed class, so the stylesheet cannot target it directly.
  // Mark the exact row on narrow screens by text: a [class$=_root] that
  // carries the metrics text and no textarea (the composer card also ends in
  // _root and can mention turns in its model line). The CSS then lays the
  // marked row out as ONE horizontally scrolling line with every metric
  // reachable.
  ctx.effect(() => {
    // Arm on the CURRENT width and re-arm on every width change (see the
    // explorer marker effect for why).
    const narrow = window.matchMedia('(max-width: 1023px)')
    let cleanup: (() => void) | undefined
    const install = (): void => {
      cleanup?.()
      if (!narrow.matches) {
        cleanup = undefined
        return
      }
      // The composer root renders the TPS readout ("TPS 89.4 tok/s") as its
      // own row BELOW the status strip; fold it into the strip so every
      // metric scrolls together. The suite re-renders its own tree, so this
      // must be idempotent and re-run on every mutation.
      const moveTps = (stats: Element): void => {
        if ([...stats.children].some((c) => /^TPS\s+\d/.test((c.textContent ?? '').trim()))) return
        const stack = stats.closest('[class$="_composerStack"]')
        if (stack === null) return
        for (const el of stack.querySelectorAll('div')) {
          const text = (el.textContent ?? '').trim()
          if (!/^TPS\s+\d/.test(text)) continue
          if (el.children.length > 0) continue
          stats.appendChild(el)
          return
        }
      }
      const mark = (): void => {
        for (const root of document.querySelectorAll('[data-phase] [class$="_root"]')) {
          // The status row lives inside the composer stack; message-area
          // blocks can also mention turns/steps and must be skipped.
          if (root.closest('[class$="_composerStack"]') === null) continue
          // The todo plan strip also lives in the composer stack and its root
          // ends in _root. Its items may legitimately contain "步"/"steps" in
          // their text, so never mistake it (or any interactive dock panel)
          // for the stats strip.
          if (root.matches('[data-testid="todo-panel"]')) continue
          if (root.querySelector('button') !== null) continue
          const text = root.textContent ?? ''
          if (!/(turns|steps|\bLLM\b|轮|步)/.test(text)) continue
          if (root.querySelector('textarea') !== null) continue
          root.setAttribute('data-mobile-nav', 'stats')
          moveTps(root)
          return
        }
      }
      const observer = new MutationObserver(mark)
      observer.observe(document.body, { childList: true, subtree: true })
      mark()
      cleanup = () => {
        observer.disconnect()
      }
    }
    install()
    narrow.addEventListener('change', install)
    return () => {
      narrow.removeEventListener('change', install)
      cleanup?.()
    }
  }, 'dsh-mobile-nav: stats line marker')

  // The dsh-web-ui explorer / preview columns toggle via `visibility`
  // (their inline style), which never restarts a CSS animation — so the
  // sheets would only animate on first mount. Replay the rise animation
  // with the Web Animations API each time a column turns visible, then
  // leave the resting state to the stylesheet.
  ctx.effect(() => {
    // Arm on the CURRENT width and re-arm on every width change (see the
    // explorer marker effect for why).
    const narrow = window.matchMedia('(max-width: 1023px)')
    let cleanup: (() => void) | undefined
    const install = (): void => {
      cleanup?.()
      if (!narrow.matches) {
        cleanup = undefined
        return
      }
      const cols = ['[data-aionui-explorer-col]', '[data-aionui-preview-col]']
      const seen = new Map<string, boolean>()
      const play = (el: Element): void => {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(28px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 280, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' },
        )
      }
      const check = (): void => {
        for (const sel of cols) {
          const el = document.querySelector(sel)
          if (el === null) continue
          const visible = getComputedStyle(el).visibility === 'visible'
          const prev = seen.get(sel) ?? false
          if (visible && !prev) play(el)
          seen.set(sel, visible)
        }
      }
      const observer = new MutationObserver(check)
      // Visibility flips come through inline style mutations (suite) or the
      // explorer-open marker on the frame; class changes are watched too.
      observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class', 'data-aionui-explorer-open'] })
      check()
      cleanup = () => {
        observer.disconnect()
      }
    }
    install()
    narrow.addEventListener('change', install)
    return () => {
      narrow.removeEventListener('change', install)
      cleanup?.()
    }
  }, 'dsh-mobile-nav: sheet rise animation replay')

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
  //
  // Footer stacking relies on the list-slot sort by (priority, order):
  // dsh-remote-web-ui leaves it unset (default 0, its two icon buttons stay
  // on top) and dsh-usage-stats uses 10. Order 5 keeps the Files + Session
  // log pills directly under the icon row with the usage/balance badge
  // below them — instead of a tie at 10 where registration order could
  // wedge the badge between the icons and the pills.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'mobile-nav-session-log',
    order: 5,
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
