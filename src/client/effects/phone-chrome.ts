import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
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

/** One unit of DOM reconciliation driven by the shared full-tree observer. */
export interface ReconcilerTask {
  readonly name: string
  /** Called once on activation and after every observed DOM mutation. */
  ensure(): void
  /** Called on deactivation, disposal, or explicit removal. */
  dispose(): void
}

const registered = new Set<ReconcilerTask>()
let frameControllerInstalled = false
let reconcileTasksRegistered = false
let reconcilerInstalled = false

interface ActiveReconciler {
  tasks: Set<ReconcilerTask>
  observer: MutationObserver
}

let active: ActiveReconciler | null = null

function runTasks(tasks: Set<ReconcilerTask>): void {
  for (const task of tasks) {
    try {
      task.ensure()
    } catch (error) {
      console.error(`[dsh-mobile-nav] reconciler task ${task.name} failed`, error)
    }
  }
}

/**
 * One full-tree MutationObserver for every mobile DOM reconciler. Tasks can be
 * registered from React or plain effects; they only run while the mobile
 * breakpoint is active and are re-armed automatically on width changes.
 */
export function installReconciler(ctx: ClientContext): () => void {
  if (reconcilerInstalled) return () => {}
  reconcilerInstalled = true
  installMobileEffect(ctx, 'dsh-mobile-nav: DOM reconciler', () => {
    const tasks = new Set(registered)
    // Coalesce every mutation burst (typing, animations, per-token TPS
    // re-renders) into one full-tree pass per animation frame instead of
    // running every task synchronously per mutation.
    let raf = 0
    const schedule = (): void => {
      if (raf !== 0) return
      raf = requestAnimationFrame(() => {
        raf = 0
        runTasks(tasks)
      })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'style',
        'class',
        'data-phase',
        'data-aionui-explorer-open',
        'data-aionui-preview-open',
        'data-mobile-preview-full',
      ],
    })
    active = { tasks, observer }
    runTasks(tasks)
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      observer.disconnect()
      for (const task of tasks) {
        try {
          task.dispose()
        } catch (error) {
          console.error(`[dsh-mobile-nav] reconciler task ${task.name} dispose failed`, error)
        }
      }
      active = null
    }
  })
  return () => {
    reconcilerInstalled = false
  }
}

/** Register a reconciler task. The returned disposer removes it immediately. */
export function addReconcilerTask(task: ReconcilerTask): () => void {
  registered.add(task)
  if (active !== null) {
    active.tasks.add(task)
    try {
      task.ensure()
    } catch (error) {
      console.error(`[dsh-mobile-nav] reconciler task ${task.name} failed`, error)
    }
  }
  return () => {
    registered.delete(task)
    if (active !== null) {
      active.tasks.delete(task)
      try {
        task.dispose()
      } catch (error) {
        console.error(`[dsh-mobile-nav] reconciler task ${task.name} dispose failed`, error)
      }
    }
  }
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
  ]
  return () => {
    for (const remove of removeTasks) remove()
    reconcileTasksRegistered = false
  }
}

