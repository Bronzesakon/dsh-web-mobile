import { useEffect, useLayoutEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from './locales.ts'

/** Full props for the shell overlay entry. */
export interface MobileNavOverlayProps extends PropsRuntime<'shell.overlay'>, PropsLocale<typeof NS> {
  /** Bound ctx.layout.toggleSidebar(). */
  toggleSidebar: () => void
}

/** Same breakpoint as the shell's SIDEBAR_AUTO_COLLAPSE (viewport < 1024). */
const MOBILE_QUERY = '(max-width: 1023px)'

/** Live matchMedia hook for the narrow breakpoint. */
function useMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY)
    const onChange = (event: MediaQueryListEvent) => setMobile(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return mobile
}

/** The AppFrame element: direct parent of the shell overlay layer. */
function findFrame(): HTMLElement | null {
  return document.querySelector('[data-shell-overlay]')?.parentElement ?? null
}

/**
 * Mobile shell overlay: owns the `data-mobile-nav` marker on the AppFrame
 * element (the CSS restructure keys off it), mirrors the frame's collapsed
 * state into React state, and renders the dimmed backdrop plus a floating
 * directory button for the hero/blank phases that have no session header.
 */
export function MobileNavOverlay({ toggleSidebar, t }: MobileNavOverlayProps) {
  const mobile = useMobile()
  const [open, setOpen] = useState(false)
  const [fabVisible, setFabVisible] = useState(false)

  // Frame ownership + open-state mirror. On wide screens this effect is inert:
  // the marker is never set, so the layout is untouched.
  useLayoutEffect(() => {
    if (!mobile) {
      setOpen(false)
      return
    }
    const frame = findFrame()
    if (frame === null) return
    frame.setAttribute('data-mobile-nav', 'frame')
    const sync = () => setOpen(!frame.hasAttribute('data-sidebar-collapsed'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed'] })
    return () => {
      observer.disconnect()
      // Drop EVERY marker this plugin can leave on the shell-owned frame.
      // The frame outlives our unmount, and the explorer / preview markers
      // are written by the header toggle and the drawer footer — not here —
      // so leaving them behind survived a narrow→wide→narrow trip and popped
      // the sheet open again on the next mobile mount, which is exactly the
      // restored-state-covers-the-UI failure this plugin exists to prevent.
      frame.removeAttribute('data-mobile-nav')
      frame.removeAttribute('data-mobile-preview-full')
      frame.removeAttribute('data-aionui-explorer-open')
      frame.removeAttribute('data-aionui-preview-open')
    }
  }, [mobile])

  // The floating button is a fallback for surfaces without a session header:
  // phase "active" means the header (and its toggle) is rendered already.
  useEffect(() => {
    if (!mobile) {
      setFabVisible(false)
      return
    }
    const sync = () => setFabVisible(document.querySelector('[data-phase="active"]') === null)
    sync()
    const observer = new MutationObserver(sync)
    // childList: the conversation root can be replaced wholesale on session
    // switches, so attribute-only observation would miss the new phase.
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-phase'],
    })
    return () => observer.disconnect()
  }, [mobile])

  // Escape closes the drawer — but yields to an open modal dialog (e.g. the
  // settings panel), which owns its own Escape handling.
  useEffect(() => {
    if (!mobile || !open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('[aria-modal="true"]') === null) toggleSidebar()
    }
    // Capture phase: run before the settings panel's own document-bubble Escape
    // handler, so the modal is still present when we yield to it.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [mobile, open, toggleSidebar])

  // Navigation inside the drawer closes it: tapping a session row or a
  // plugin takeover entry (task board / ssh) must hand the screen to the
  // content it just opened. Capture phase — the drawer closes before the
  // shell or a plugin processes the click, so takeover panels never render
  // under the open drawer.
  //
  // Deliberately NOT closed by this rule:
  // - Settings / Session log: their dialogs render INSIDE the drawer DOM
  //   (portaled into the sidebar); closing the drawer would slide the dialog
  //   off-screen with it.
  // - Workspace folder chevrons, the logo: pure UI toggles, not navigation.
  // - Anything while a modal dialog is open: the dialog owns the screen.
  useEffect(() => {
    if (!mobile || !open) return
    const onDrawerClick = (event: MouseEvent) => {
      if (document.querySelector('[aria-modal="true"]') !== null) return
      const target = event.target as HTMLElement | null
      if (target === null) return
      const drawer = document.querySelector<HTMLElement>('[data-mobile-nav="frame"] > :first-child')
      if (drawer === null || !drawer.contains(target)) return
      // A session row's own action buttons — the "Session actions" kebab
      // (delete / rename), revealed on hover / long-press — open an edit
      // menu. Tapping one must NOT count as tapping the row, or the drawer
      // would close and take the just-opened menu with it.
      if (target.closest('[class*="sessionRow"] button') !== null) return
      const navigates = target.closest(
        'button[data-dsh-taskboard-entry], button[data-dsh-ssh-entry], [class*="newSession"], [class*="sessionRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"]',
      )
      if (navigates !== null) toggleSidebar()
    }
    document.addEventListener('click', onDrawerClick, true)
    return () => document.removeEventListener('click', onDrawerClick, true)
  }, [mobile, open, toggleSidebar])

  // Fullscreen toggle for the aionui preview sheet. The button is appended
  // INTO the preview column (position: absolute against it), so it rides
  // the sheet's own motion — open animation, geometry transition — locked
  // by construction instead of matching transition curves, and it hides
  // with the sheet automatically. The suite's React re-renders the column
  // content, so a MutationObserver re-appends the button whenever it is
  // wiped. (The sheet is z-index 56, above the overlay layer's z-20
  // stacking context, so a button inside the sheet is never covered.)
  // Clicking toggles the frame's `data-mobile-preview-full` marker; the
  // two SVG icons swap via CSS and the accessible name follows the marker
  // (the icon swap alone left a screen reader announcing "Fullscreen
  // preview" while the button actually exits fullscreen).
  useEffect(() => {
    if (!mobile) return
    let button: HTMLButtonElement | null = null
    let observer: MutationObserver | null = null
    // The marker also gets cleared when the sheet closes (see the preview
    // effect in effects/aionui-compat.ts), so the name is derived from the
    // marker rather than tracked separately.
    const syncLabel = (target: HTMLButtonElement): void => {
      const full = findFrame()?.hasAttribute('data-mobile-preview-full') ?? false
      const label = t(full ? 'previewExitFullscreen' : 'previewFullscreen')
      // ensure() runs on every body mutation batch, so only write when the
      // name actually changed — an unconditional write would dirty the DOM
      // and feed the observer that called us.
      if (target.getAttribute('aria-label') === label) return
      target.setAttribute('aria-label', label)
      target.title = label
    }
    const onClick = (): void => {
      findFrame()?.toggleAttribute('data-mobile-preview-full')
      if (button !== null) syncLabel(button)
    }
    const ensure = (): void => {
      const col = document.querySelector('[data-aionui-preview-col]')
      if (col === null) return
      if (button === null) {
        button = document.createElement('button')
        button.type = 'button'
        button.dataset.mobileNav = 'preview-full-toggle'
        button.innerHTML = [
          '<svg class="dsh-mobile-nav-full-in" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
          '<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
          '</svg>',
          '<svg class="dsh-mobile-nav-full-out" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
          '<path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
          '</svg>',
        ].join('')
        button.addEventListener('click', onClick)
      }
      syncLabel(button)
      if (button.parentElement !== col) col.appendChild(button)
    }
    ensure()
    observer = new MutationObserver(ensure)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      button?.remove()
    }
  }, [mobile, t])

  // Move the git branch chip (conversation.input.dock) INTO the composer
  // card on mobile: it reads as a stray capsule floating between the dock
  // rows and the input card. Reparenting into the card lets CSS pin it to
  // the card's top-left (the card is position: relative) and give the card
  // a chip row via padding-top. The dock's React re-render restores the
  // chip to the dock, so a MutationObserver re-appends idempotently (same
  // pattern as the preview fullscreen toggle above). When the viewport
  // widens, cleanup moves the chip back to the dock — the desktop layout
  // is untouched.
  useEffect(() => {
    if (!mobile) return
    let observer: MutationObserver | null = null
    const ensure = (): void => {
      const chip = document.querySelector(
        '[data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor]',
      )
      if (chip === null) return
      const card = document.querySelector('textarea')?.closest('[class$="_card"]')
      if (card == null) return
      if (chip.parentElement !== card) card.insertBefore(chip, card.firstChild)
    }
    ensure()
    observer = new MutationObserver(ensure)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer?.disconnect()
      const chip = document.querySelector(
        '[data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor]',
      )
      const dock = document.querySelector('[data-slot="conversation.input.dock"]')
      if (chip !== null && dock !== null && chip.parentElement !== dock) dock.appendChild(chip)
    }
  }, [mobile])

  // Settings dialog: move the toolbar (Open configuration file + close)
  // INTO the nav row so it shares ONE line with the category tabs — the
  // official layout gives the toolbar its own row under the tabs, which on
  // a phone leaves a full-width dead gap and pushes the options area down
  // (user feedback 2026-08-16). The toolbar is React-owned, so a
  // MutationObserver re-appends idempotently (same pattern as the chip
  // above). Desktop untouched: this effect only runs while the frame
  // marker is active. The toolbar is anchored by its class suffix — the
  // export dialog (header + description + body) has no nav row, so
  // querying the nav first makes the move a no-op there.
  useEffect(() => {
    if (!mobile) return
    let observer: MutationObserver | null = null
    // Where the toolbar sat before the first move, so disposal can put it
    // back exactly (its official slot is a row of its own after the tabs).
    // Without this the toolbar stayed wedged in the tab row after a
    // narrow→wide transition, with no mobile CSS left to compensate.
    let origin: { parent: Node; next: Node | null } | null = null
    const ensure = (): void => {
      const dialog = document.querySelector('[aria-modal="true"]')
      if (dialog === null) return
      const nav = dialog.querySelector(':scope > [class$="_nav"]')
      const header = dialog.querySelector('[class$="_header"]')
      if (nav === null || header === null) return
      if (header.parentElement === nav) return
      if (origin === null && header.parentElement !== null) {
        origin = { parent: header.parentElement, next: header.nextSibling }
      }
      nav.appendChild(header)
    }
    ensure()
    observer = new MutationObserver(ensure)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer?.disconnect()
      if (origin === null) return
      const header = document.querySelector('[aria-modal="true"] [class$="_header"]')
      // Only restore while the recorded slot is still in the document: the
      // dialog is usually gone by now, and re-inserting into a detached tree
      // would resurrect it.
      if (header !== null && origin.parent.isConnected) {
        origin.parent.insertBefore(header, origin.next)
      }
    }
  }, [mobile])

  if (!mobile) return null
  return (
    <>
      {open && (
        <div
          data-mobile-nav="backdrop"
          role="button"
          aria-label={t('backdrop')}
          onClick={() => toggleSidebar()}
        />
      )}
      {fabVisible && !open && (
        <button
          type="button"
          data-mobile-nav="fab"
          aria-label={t('open')}
          title={t('open')}
          onClick={() => toggleSidebar()}
        >
          <IconPanelLeftOutline16 size={18} />
        </button>
      )}
    </>
  )
}
