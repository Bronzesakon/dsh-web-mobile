import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** dsh-web-ui 兼容：explorer / preview 列的显隐标记与升起动画（同域同机制，合并一处）。 */
export function installAionuiCompat(ctx: ClientContext): void {
  // 1) explorer 关闭标记
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

  // 2) preview 开关标记
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

  // 3) 升起动画重放
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
}
