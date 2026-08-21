# Session Header Responsive Layout Design

## Problem

The mobile session header currently gives independent width rules to the session title, mode label, running/subagent controls, and plugin file action. At narrow widths, long titles can consume the space needed by mode/status controls; the mode label can become unreadable; right-side actions can drift or overflow; and header popovers can be clipped by the viewport.

The host owns the session name, current mode, running status, and subagent UI. The plugin owns only its mobile navigation/file controls and the responsive CSS adaptation. Desktop behavior must remain unchanged at widths >= 1024px.

## Goals

- Keep the mobile header on one compact row.
- Keep sidebar and file controls visible and tappable.
- Make the session title the first element to yield space, using ellipsis instead of overflow.
- Preserve a readable mode label; ellipsize its text only after the title yields.
- Preserve running/subagent status indicators and trigger hit areas.
- Keep running/subagent popovers fully inside the viewport.
- Give tablets more title space than phones without introducing an unnecessary second row.
- Avoid new JavaScript measurement, resize listeners, host DOM changes, or third-party source changes.
- Preserve a complete no-op for the host layout at >= 1024px.

## Non-goals

- Changing host-owned session metadata or its business state.
- Replacing the host's header components.
- Moving session-log behavior back into the session header.
- Changing drawer, explorer, preview, or session-log interaction semantics.
- Introducing a desktop redesign.

## Layout contract

At mobile widths, the header uses explicit flex shrink priorities rather than unrelated fixed width caps:

1. The sidebar toggle remains a fixed-size control at the left edge.
2. The session title is a shrinkable lane with `min-width: 0` and single-line ellipsis.
3. The mode label keeps its icon and a readable text lane; its text may ellipsize but the control cannot collapse to an unreadable sliver.
4. Running/subagent controls retain their status indicators, counts, and trigger hit areas. They remain non-wrapping and interactive.
5. The file control is fixed-size and remains the rightmost plugin action.

The existing slot/component structure remains intact. CSS targets the existing stable `data-mobile-nav` markers and the already-used structural/class-suffix anchors. No wrapper or reparenting change is required unless verification proves the current host DOM lacks a stable anchor.

## Responsive behavior

### Phones below 480px

- Preserve one row and compact gaps.
- Shrink the title first.
- Keep the mode icon and text lane visible; truncate the text with ellipsis when necessary.
- Keep running/subagent controls at natural minimum width.
- Keep the file control visible at the right edge.
- Clamp header popovers to the viewport with a small safe inset and a bounded height.

### Tablets from 480px through 1023px

- Preserve one row.
- Relax the title constraint so more of the session name is visible.
- Allow mode text to use natural width when space permits.
- Keep status controls and the file action in stable positions.
- Retain the same popover viewport clamping behavior.

### Desktop at 1024px and wider

- The plugin's mobile header overrides do not apply.
- Host header layout and host actions remain unchanged.
- Mobile navigation/file controls remain hidden according to the existing desktop rules.

## Implementation boundary

Primary source change: `src/client/styles/layout.css.ts`, replacing the current session-header width/ordering rules with the explicit shrink-priority contract while preserving existing mobile markers and popover rules.

Optional source change: `src/client/styles/base.css.ts` only if the shared mobile button dimensions or gaps must be normalized for the new header contract.

Generated output: run `pnpm build` after source changes so committed `lib/` artifacts are refreshed. Do not hand-edit `lib/`.

## Verification

- `pnpm verify`
- `pnpm test:core`
- `pnpm build`
- `git diff --check`
- Real-profile/browser checks at approximately 390px, 768px, and 1024px.

The browser checks must exercise long session names, long mode names, running state, subagent state, the sidebar toggle, the file action, and the running/subagent popover. At 1024px, compare with the plugin disabled and confirm no host layout change.

## Risks and mitigations

- **Hashed host class selectors can drift.** Keep stable markers and structural selectors as the primary anchors; retain class-suffix selectors only inside the owning header region.
- **Independent flex items can still overflow if a parent has no shrink lane.** Set `min-width: 0` on the title/action containers and keep fixed controls `flex: 0 0 auto`.
- **Popover clipping can reappear after reparenting.** Anchor the mobile menu to the header/viewport region and cap width/height using viewport-relative constraints; verify both phone and tablet widths.
- **Generated artifacts can become stale.** Treat `pnpm build` as part of the same change, not a follow-up.
