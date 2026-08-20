import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { createReconcilerCore } from './reconciler-core.ts'
import type { ReconcilerTask } from './reconciler-core.ts'
import { createPreviewCloseTask, createSheetRiseTask } from './aionui-compat.ts'
import { createStatsLineTask } from './stats-line.ts'

// The custom client bundler cannot resolve `../` requires from src/client/effects,
// so this mirrors the namespace id from src/client/locales.ts. Keep in sync.
const NS = 'mobileNav'

/** Same breakpoint as the shell's SIDEBAR_AUTO_COLLAPSE (viewport < 1024). */
export const MOBILE_QUERY = '(max-width: 1023px)'

/** Desktop no-op boundary, kept next to the mobile query for one source of truth. */
export const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * Re-arm a mobile-only DOM effect on every width change. Replaces the
 * repeated matchMedia + change-listener scaffold so all breakpoint strings
 * live in one place.
 */
export function installMobileEffect(
  ctx: ClientContext,
  label: string,
  install: (narrow: MediaQueryList) => (() => void) | undefined,
): void {
  ctx.effect(() => {
    const narrow = window.matchMedia(MOBILE_QUERY)
    let cleanup: (() => void) | undefined
    const arm = (): void => {
      cleanup?.()
      cleanup = narrow.matches ? install(narrow) : undefined
    }
    arm()
    narrow.addEventListener('change', arm)
    return () => {
      narrow.removeEventListener('change', arm)
      cleanup?.()
    }
  }, label)
}

/** The AppFrame element: direct parent of the shell overlay layer. */
export function findFrame(): HTMLElement | null {
  return document.querySelector('[data-shell-overlay]')?.parentElement ?? null
}

/** Resolve the plugin-owned frame marker, falling back to the raw shell frame. */
export function getFrame(): HTMLElement | null {
  return document.querySelector('[data-mobile-nav="frame"]') ?? findFrame()
}

/**
 * Frame marker controller: owns `data-mobile-nav="frame"` and every plugin
 * marker that can survive on the shell-owned frame. Installed once at apply
 * time so effects no longer each need to find/set/clear the frame. Returns a
 * disposer that unregisters the task and resets the installed flag, so a
 * same-environment plugin reload can rebuild the reconciler from scratch.
 */
export function installFrameController(): () => void {
  if (frameControllerInstalled) return () => {}
  frameControllerInstalled = true
  let frame: HTMLElement | null = null
  const removeTask = addReconcilerTask({
    name: 'frame-marker',
    scopes: ['*'],
    ensure: () => {
      frame = findFrame()
      if (frame !== null && !frame.hasAttribute('data-mobile-nav')) {
        frame.setAttribute('data-mobile-nav', 'frame')
      }
    },
    dispose: () => {
      if (frame !== null) {
        frame.removeAttribute('data-mobile-nav')
        frame.removeAttribute('data-mobile-preview-full')
        frame.removeAttribute('data-aionui-explorer-open')
        frame.removeAttribute('data-aionui-preview-open')
      }
      frame = null
    },
  })
  return () => {
    removeTask()
    frameControllerInstalled = false
  }
}

/**
 * One unit of DOM reconciliation driven by the shared full-tree observer.
 * Defined in the DOM-free core so registration / dirty routing / coalescing
 * are unit-testable; kept reachable from here so the third-party task modules
 * (aionui-compat, stats-line) keep importing it via `./phone-chrome.ts`.
 */
export type { ReconcilerTask } from './reconciler-core.ts'

let frameControllerInstalled = false
let reconcileTasksRegistered = false
let reconcilerInstalled = false

// The DOM-free core owns the task registry, dirty-key routing, and coalesced
// flush scheduling; this module is the thin browser adapter that feeds it
// MutationObserver records and drives its lifecycle from the mobile effect.
const core = createReconcilerCore({
  requestFrame: (flush) => {
    let id = 0
    const run = (): void => {
      id = 0
      flush()
    }
    id = requestAnimationFrame(run)
    return () => {
      if (id !== 0) cancelAnimationFrame(id)
    }
  },
})

/**
 * One full-tree MutationObserver for every mobile DOM reconciler. Tasks can be
 * registered from React or plain effects; they only run while the mobile
 * breakpoint is active and are re-armed automatically on width changes.
 */
export function installReconciler(ctx: ClientContext): () => void {
  if (reconcilerInstalled) return () => {}
  reconcilerInstalled = true
  installMobileEffect(ctx, 'dsh-mobile-nav: DOM reconciler', () => {
    // Coalesce every mutation burst (typing, animations, per-token TPS
    // re-renders) into one dirty-key pass per animation frame instead of
    // running every task synchronously per mutation. Until every task
    // declares scopes, all of them stay unscoped and run on every flush —
    // behavior is identical to the previous full pass.
    const observer = new MutationObserver((records) => {
      const keys = new Set<string>()
      for (const record of records) {
        keys.add(
          record.type === 'attributes' && record.attributeName !== null ? record.attributeName : '*',
        )
      }
      core.note(keys)
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'style',
        'class',
        'data-phase',
        'data-sidebar-collapsed',
        'data-aionui-explorer-open',
        'data-aionui-preview-open',
        'data-mobile-preview-full',
      ],
    })
    core.activate()
    return () => {
      observer.disconnect()
      core.deactivate()
    }
  })
  return () => {
    reconcilerInstalled = false
  }
}

/** Register a reconciler task. The returned disposer removes it immediately. */
export function addReconcilerTask(task: ReconcilerTask): () => void {
  return core.register(task)
}

/**
 * Phone chrome: KEEP the system status bar (no fullscreen) and make it
 * blend into the page. On narrow screens:
 * - The viewport meta gains viewport-fit=cover, so env(safe-area-inset-top)
 *   is the real status-bar / notch height and the stylesheet can push every
 *   surface below it (off notched phones, or in a browser tab where the
 *   layout viewport already sits below the status bar, the inset is 0 and
 *   nothing shifts).
 * - A theme-color meta tracks the shell background (the official theme is
 *   toggled by body[data-ds-dark-theme], which flips --dsw-alias-bg-base):
 *   Android then paints the status bar / URL bar with the page's own base
 *   color, so the status bar reads as part of the UI instead of a foreign
 *   strip. The drawer paints the same strip on iOS / notch displays.
 * - gesturestart is suppressed as the legacy-iOS fallback for double-tap
 *   zoom; modern browsers are covered by the stylesheet's
 *   touch-action: manipulation (which keeps pan and pinch zoom).
 */
export function installPhoneChrome(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-mobile-nav: status bar theme + viewport + zoom guard', () => {
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
    const observer = new MutationObserver(() => {
      themeMeta.content = bodyBg()
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    document.addEventListener('gesturestart', onGestureStart)
    sync()
    return () => {
      observer.disconnect()
      document.removeEventListener('gesturestart', onGestureStart)
      restore()
    }
  })
}

function createPreviewFullscreenTask(t: TranslateNS<typeof NS>): ReconcilerTask {
  let button: HTMLButtonElement | null = null
  const syncLabel = (target: HTMLButtonElement): void => {
    const full = getFrame()?.hasAttribute('data-mobile-preview-full') ?? false
    const label = t(full ? 'previewExitFullscreen' : 'previewFullscreen')
    if (target.getAttribute('aria-label') === label) return
    target.setAttribute('aria-label', label)
    target.title = label
  }
  const onClick = (): void => {
    getFrame()?.toggleAttribute('data-mobile-preview-full')
    if (button !== null) syncLabel(button)
  }
  return {
    name: 'preview-fullscreen-toggle',
    // The flush runs on the next frame, by which time React has rendered the
    // preview col, so the open marker alone is a reliable trigger — no '*'.
    scopes: ['data-aionui-preview-open', 'data-mobile-preview-full'],
    ensure: () => {
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
    },
    dispose: () => {
      button?.remove()
      button = null
    },
  }
}

function createGitChipTask(): ReconcilerTask {
  return {
    name: 'git-chip-reparent',
    scopes: ['*'],
    ensure: () => {
      const chip = document.querySelector('[data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor]')
      if (chip === null) return
      const card = document.querySelector('textarea')?.closest('[class$="_card"]')
      if (card == null) return
      if (chip.parentElement !== card) card.insertBefore(chip, card.firstChild)
    },
    dispose: () => {
      const chip = document.querySelector('[data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor]')
      const dock = document.querySelector('[data-slot="conversation.input.dock"]')
      if (chip !== null && dock !== null && chip.parentElement !== dock) dock.appendChild(chip)
    },
  }
}

function createSettingsToolbarTask(): ReconcilerTask {
  let origin: { parent: Node; next: Node | null } | null = null
  return {
    name: 'settings-toolbar-reparent',
    scopes: ['*'],
    ensure: () => {
      const dialog = document.querySelector('[aria-modal="true"]')
      if (dialog === null) return
      const nav = dialog.querySelector(':scope > [class$="_nav"]')
      const header = dialog.querySelector('[class$="_header"]')
      if (nav === null || header === null) return
      if (header.parentElement === nav) return
      // The dialog DOM can be rebuilt by React between mutations: refresh
      // the origin every time we actually move the header, so disposal
      // restores it where it currently belongs, not where it was first seen.
      if (header.parentElement !== null) {
        origin = { parent: header.parentElement, next: header.nextSibling }
      }
      nav.appendChild(header)
    },
    dispose: () => {
      if (origin === null) return
      const header = document.querySelector('[aria-modal="true"] [class$="_header"]')
      if (header !== null && origin.parent.isConnected) {
        origin.parent.insertBefore(header, origin.next)
      }
      origin = null
    },
  }
}

/**
 * Overlay elements: the dimmed backdrop (closes the drawer on tap) and the
 * floating directory button for hero/blank phases with no session header.
 * Both are plain DOM nodes reconciled against the frame's collapsed marker
 * (the shell sets `data-sidebar-collapsed` when the drawer is closed). The
 * removed MobileNavOverlay React component used to render these; they live
 * here now, owned by the shared reconciler.
 */
export function createOverlayTask(
  t: TranslateNS<typeof NS>,
  toggleSidebar: () => void,
): ReconcilerTask {
  let backdrop: HTMLDivElement | null = null
  let fab: HTMLButtonElement | null = null
  const drawerOpen = (): boolean => {
    const frame = getFrame()
    return frame !== null && !frame.hasAttribute('data-sidebar-collapsed')
  }
  const heroPhase = (): boolean =>
    document.querySelector('[data-phase="active"]') === null
  return {
    name: 'overlay-backdrop-fab',
    // '*' stays: the frame can render after activation (the shell mounts it
    // with data-sidebar-collapsed already set), and the FAB must appear on
    // the hero phase even when no drawer attribute ever changes again.
    scopes: ['*', 'data-sidebar-collapsed', 'data-phase'],
    ensure: () => {
      const frame = getFrame()
      if (frame === null) return
      // Backdrop: present while the drawer is open; its tap closes it.
      if (drawerOpen() && backdrop === null) {
        backdrop = document.createElement('div')
        backdrop.dataset.mobileNav = 'backdrop'
        backdrop.setAttribute('role', 'button')
        backdrop.setAttribute('aria-label', t('backdrop'))
        backdrop.addEventListener('click', toggleSidebar)
        frame.appendChild(backdrop)
      } else if (!drawerOpen() && backdrop !== null) {
        backdrop.remove()
        backdrop = null
      }
      // FAB: fallback for phases without a session header, drawer closed.
      if (heroPhase() && !drawerOpen() && fab === null) {
        fab = document.createElement('button')
        fab.type = 'button'
        fab.dataset.mobileNav = 'fab'
        fab.setAttribute('aria-label', t('open'))
        fab.title = t('open')
        fab.innerHTML =
          '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="18" height="18">' +
          '<path fill-rule="evenodd" clip-rule="evenodd" d="M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.8148 14.0642 3.99125 14.0784 4.1828 14.0883V1.91166Z" fill="currentColor"/>' +
          '</svg>'
        fab.addEventListener('click', toggleSidebar)
        frame.appendChild(fab)
      } else if ((!heroPhase() || drawerOpen()) && fab !== null) {
        fab.remove()
        fab = null
      }
    },
    dispose: () => {
      backdrop?.remove()
      backdrop = null
      fab?.remove()
      fab = null
    },
  }
}

/**
 * Drawer close interactions that are plain event listeners, not DOM
 * reconciliation:
 * - Escape closes the drawer (yielding to any open modal dialog, which owns
 *   its own Escape handling).
 * - Tapping a navigation target inside the drawer (session row, task board /
 *   ssh takeover entries, search results) closes the drawer so the content
 *   it opened gets the whole screen. Session-row action buttons (kebab) are
 *   excluded — they open a menu that must survive the tap.
 */
export function installOverlayInteractions(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-mobile-nav: drawer close (Escape + navigate)', () => {
    const toggleSidebar = (): void => ctx.layout.toggleSidebar()
    const drawerOpen = (): boolean => {
      const frame = getFrame()
      return frame !== null && !frame.hasAttribute('data-sidebar-collapsed')
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[aria-modal="true"]') !== null) return
      if (drawerOpen()) toggleSidebar()
    }
    // Capture phase: run before the shell or a plugin processes the click,
    // so takeover panels never render under the open drawer.
    const onDrawerClick = (event: MouseEvent): void => {
      if (document.querySelector('[aria-modal="true"]') !== null) return
      if (!drawerOpen()) return
      const target = event.target as HTMLElement | null
      if (target === null) return
      const drawer = document.querySelector<HTMLElement>('[data-mobile-nav="frame"] > :first-child')
      if (drawer === null || !drawer.contains(target)) return
      if (target.closest('[class*="sessionRow"] button') !== null) return
      const navigates = target.closest(
        'button[data-dsh-taskboard-entry], button[data-dsh-ssh-entry], [class*="newSession"], [class*="sessionRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"]',
      )
      if (navigates !== null) toggleSidebar()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('click', onDrawerClick, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('click', onDrawerClick, true)
    }
  })
}

/**
 * Register the shared DOM reconciler tasks that used to each own a full-tree
 * MutationObserver. The React FAB task is registered separately from the
 * overlay component because it drives React state. Returns a disposer that
 * unregisters every task and resets the flag, so a same-environment plugin
 * reload can rebuild the reconciler from scratch.
 */
export function registerReconcileTasks(ctx: ClientContext): () => void {
  if (reconcileTasksRegistered) return () => {}
  reconcileTasksRegistered = true
  const t = ctx.locale.bind(NS)
  const removeTasks = [
    addReconcilerTask(createPreviewFullscreenTask(t)),
    addReconcilerTask(createGitChipTask()),
    addReconcilerTask(createSettingsToolbarTask()),
    addReconcilerTask(createPreviewCloseTask()),
    addReconcilerTask(createSheetRiseTask()),
    addReconcilerTask(createStatsLineTask()),
    addReconcilerTask(createOverlayTask(t, () => ctx.layout.toggleSidebar())),
  ]
  return () => {
    for (const remove of removeTasks) remove()
    reconcileTasksRegistered = false
  }
}

