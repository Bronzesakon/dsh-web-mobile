# Session Header Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile session header keep sidebar/file controls and running/subagent controls usable while long session and mode names yield space with ellipsis; leave desktop behavior unchanged.

**Architecture:** Keep the host-owned header DOM and React components unchanged. Replace the current independent mobile width caps in `src/client/styles/layout.css.ts` with explicit flex shrink priorities scoped to the session header, while retaining existing `data-mobile-nav` markers and viewport-clamped popover rules. Rebuild committed `lib/` output after the source change.

**Tech Stack:** TypeScript CSS string modules, DSH Web host DOM markers, pnpm, TypeScript compiler, Node test runner.

## Global Constraints

- Mobile breakpoint remains `(max-width: 1023px)`; desktop at `>=1024px` must remain a complete no-op.
- Host owns session name, mode, running status, and subagent UI; do not change host components or third-party packages.
- `MobileNavToggle` and `MobileDrawerFooter` interactions remain unchanged.
- Use stable `data-mobile-nav` markers and structural/class-suffix selectors scoped to the session header.
- Do not add JavaScript width measurement, resize listeners, or new persistent observers.
- Do not hand-edit `lib/`; run `pnpm build` to regenerate it.
- Follow the repository CSS-string style: single quotes in TypeScript, no semicolons, complete comments, and preserve `base -> layout -> compat -> misc` order.

---

### Task 1: Rework mobile session-header flex priorities

**Files:**
- Modify: `src/client/styles/layout.css.ts:229-348` (the existing `Session header on mobile` and `Header popovers on mobile` blocks)
- Test: browser smoke checks against the real DSH Web profile; no new unit test is needed because the behavior is DOM geometry and CSS cascade, not reconciler logic

**Interfaces:**
- Consumes: existing host session header structure, `[data-phase]`, `[class$="_crumbs"]`, `[class$="_headerActions"]`, `[class$="_label"]:has(> svg)`, `[class$="_root"]:has(> button[class$="_trigger"])`, and plugin markers `[data-mobile-nav="toggle"]` / `[data-mobile-nav="files"]`.
- Produces: a mobile header where title text is the first shrinkable lane, mode text shrinks only after the title, status/subagent controls remain non-wrapping, and Files remains the rightmost fixed-size action.

- [ ] **Step 1: Capture a baseline at the required widths**

Use the existing real-profile workflow when a DSH Web profile is available. At approximately 390px and 768px, record the visible header geometry for a long session title, a long mode label, running status, subagent/jobs control, and the Files button. At approximately 1024px, confirm the host layout is the comparison baseline. If no profile is running, continue with source-level checks and report the live-browser check as unavailable rather than substituting a synthetic success claim.

- [ ] **Step 2: Replace independent title/action width caps with explicit flex priorities**

In the existing mobile header block, keep the left toggle absolute and the Files button ordered/rightmost, then apply these declarations to the existing structural anchors:

```css
[data-phase] header > :first-child {
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  min-width: 0 !important;
  gap: 8px !important;
}

[data-phase] header [class$="_crumbs"] {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  max-width: none !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

[data-phase] header [class$="_headerActions"] {
  display: flex !important;
  align-items: center !important;
  flex: 0 1 auto !important;
  min-width: 0 !important;
  max-width: calc(100% - 36px) !important;
  margin-left: auto !important;
  justify-content: flex-end !important;
  gap: 6px !important;
}

[data-phase] header [class$="_label"]:has(> svg) {
  flex: 0 1 auto !important;
  min-width: 5.5rem !important;
  max-width: min(42vw, 220px) !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

[data-phase] header [class$="_root"]:has(> button[class$="_trigger"]) {
  flex: 0 0 auto !important;
  min-width: max-content !important;
  max-width: none !important;
  white-space: nowrap !important;
}

[data-phase] header [data-mobile-nav="files"] {
  order: 3 !important;
  flex: 0 0 auto !important;
}
```

Retain the existing icon padding/position behavior for the mode label, the toggle's fixed placement, and the popover rules. Do not use `header > :last-child` as a new anchor because the reconciler may reparent host nodes.

- [ ] **Step 3: Add a narrow-phone override without changing tablet or desktop behavior**

Inside the existing `(max-width: 1023px)` block, add a nested `(max-width: 479px)` block immediately after the shared header rules:

```css
@media (max-width: 479px) {
  [data-phase] header [class$="_headerActions"] {
    gap: 4px !important;
  }

  [data-phase] header [class$="_label"]:has(> svg) {
    max-width: 36vw !important;
  }
}
```

The title remains `flex: 1 1 0` and therefore yields before the mode/status lane. The mode label retains its icon and readable minimum while its text uses ellipsis. The existing tablet range keeps the wider `42vw` mode ceiling.

- [ ] **Step 4: Keep popovers inside the viewport**

Preserve the existing header menu rule and verify it still applies after the flex changes:

```css
[data-phase] header [class$="_menu"] {
  left: 8px !important;
  right: auto !important;
  width: min(336px, calc(100vw - 16px)) !important;
  max-width: none !important;
  max-height: min(420px, calc(100dvh - 120px)) !important;
}
```

Do not widen this selector outside `[data-phase] header`; unrelated dialogs must retain their existing rules.

- [ ] **Step 5: Review the CSS block for cascade and desktop isolation**

Confirm the new declarations remain inside the existing `(max-width: 1023px)` block, do not reintroduce a desktop selector outside that block, preserve `transform: none` for the open drawer, and keep the existing session-log relocation rule. Confirm no selector depends on `:last-child` for a reparentable host subtree.

- [ ] **Step 6: Run focused static checks**

Run:

```sh
pnpm verify
pnpm test:core
```

Expected: both commands exit successfully; no TypeScript or reconciler-core regression is introduced.

- [ ] **Step 7: Rebuild generated artifacts**

Run:

```sh
pnpm build
git diff --check
```

Expected: the host/client build succeeds, `lib/client.js` and `lib/types` reflect the source stylesheet, and `git diff --check` reports no whitespace errors. Do not manually edit generated files.

- [ ] **Step 8: Exercise the actual responsive surface**

With the real DSH Web profile, verify:

- 390px: long title truncates first; mode remains readable; running/subagent trigger and Files remain visible; no horizontal overflow.
- 390px: opening the running/subagent popover keeps the panel fully inside the viewport and preserves status dots.
- 768px: title gets more room and mode text is less aggressively truncated.
- 1024px: compare against the plugin-disabled host layout; no header or interaction change is introduced.
- Sidebar toggle and Files button still open their existing surfaces.

If the profile is unavailable, report the exact unavailable prerequisite after completing all static verification; do not claim browser validation passed.

- [ ] **Step 9: Commit the implementation**

```sh
git add src/client/styles/layout.css.ts lib
git commit -m "fix: stabilize mobile session header layout"
```

The commit must include the source CSS and generated build output, not hand-edited generated files.
