# Repository Guidelines

## Project Overview

`@dsh-external/dsh-mobile-nav` is a single-package, client-only plugin for the DSH (DeepSeek Harness) Web UI. On viewports below 1024px it turns the sidebar rail into an overlay drawer, keeps the conversation area full width, and adapts settings, file explorer/preview sheets, status-bar safe areas, composer controls, and usage statistics. At 1024px and wider it must remain a no-op.

Names differ by boundary: the README/GitHub project is `dsh-web-mobile`, the npm package is `@dsh-external/dsh-mobile-nav`, and the patch row id is `dsh-mobile-nav`. There is no application server or workspace/monorepo layer.

## Architecture & Data Flow

1. `cordis.patch.yml` inserts the `dsh-mobile-nav` host row. `src/index.ts` intentionally exports an empty `apply()` so the plugin is visible to the host Loader.
2. `package.json` exposes `./client` and declares `dsh.client.platform: "web"`; DSH discovers the browser half from `src/client/index.tsx`.
3. The client fiber injects `slots`, `layout`, `locale`, and `sessionLogDownload`. Its `apply(ctx)` registers locale dictionaries, injects one stylesheet, installs diagnostics/effects, and registers two slots:
   - `conversation.session.header.actions` → `MobileNavToggle` (`order: 10`): drawer and Files controls.
   - `sidebar.footer.action` → `MobileDrawerFooter` (`order: 5`): Files and session-log actions. The order keeps these below the remote icon row and above usage badges.
4. A shared full-tree reconciler (`installReconciler` + `addReconcilerTask` in `src/client/effects/phone-chrome.ts`) owns frame markers, settings-toolbar/chip reparenting, preview-fullscreen toggle, sheet-rise replay, and stats-line marking. Tasks run only while the mobile breakpoint is active, coalesced to one pass per animation frame. `installFrameController` / `installReconciler` / `registerReconcileTasks` each return a disposer collected in one `ctx.effect` in `apply`, so a same-environment plugin reload rebuilds the reconciler from scratch.
5. `src/client/effects/` handles phone chrome, dsh-web-ui compatibility, statistics-row marking, and the optional debug badge. DOM integrations use observers and idempotent reconciliation because third-party React renders can replace injected nodes.
6. `src/client/styles/index.ts` concatenates CSS modules in the load-bearing order `base → layout → compat → misc`; the client injects the result as one `<style data-plugin>` tag. Mobile rules target `(max-width: 1023px)`; desktop rules hide mobile controls and preserve the uninstalled layout.

Third-party compatibility is implemented through scoped DOM markers, `MutationObserver`, stable attributes, and carefully scoped class/text anchors. Do not modify third-party source packages.

## Key Directories

- `src/`: TypeScript source. `src/index.ts` is the host half; `src/client/` is the browser half.
- `src/client/effects/`: lifecycle-managed DOM effects grouped by domain (`phone-chrome`, `aionui-compat`, `stats-line`).
- `src/client/styles/`: CSS-as-TypeScript string modules (`base.css.ts`, `layout.css.ts`, `compat.css.ts`, `misc.css.ts`) plus the concatenation entry point.
- `scripts/`: build wrapper and the standalone `cdp-probe.mjs` browser smoke probe.
- `lib/`: committed TypeScript declarations and generated host/client artifacts. Treat it as build output; do not hand-edit it.
- `assets/`: README/package screenshots and other distributable assets.
- `.client-build/`: temporary client TypeScript output consumed and removed by the custom bundler.

## Development Commands

```sh
pnpm install
pnpm verify                 # type-check host and client halves
pnpm build                  # emit both halves and rebuild lib/client.js
npm run prepack             # runs npm run build before packaging
npm pack                    # package smoke check; invokes prepack
```

`pnpm build` is equivalent to:

```sh
tsc -p tsconfig.json && tsc -p tsconfig.client.json && node scripts/build-client.mjs
```

For a local DSH Web profile:

```sh
dsh plugin --profile web add link:/path/to/dsh-web-mobile
dsh --profile web --dump-config
dsh web
```

The config dump should contain the `dsh-mobile-nav` row. There is no package `dev`, `start`, `test`, or `lint` script; the host `dsh web` process is the runtime.

## Code Conventions & Common Patterns

- Keep the host/client split intact. The empty host `apply()` is intentional; browser behavior belongs in `src/client/`.
- Use stable `data-*` markers and structural selectors before hashed classes. For unavoidable hashed classes, scope substring/suffix selectors to the owning region; for tree rows use `[class*="_treeRow"]`, and exclude `[class*="_treeArrowEmpty"]` when distinguishing directories from files.
- Put every long-lived style tag, listener, timer, or `MutationObserver` inside `ctx.effect(() => { ...; return disposer }, label)`. Re-arm width-sensitive effects on `matchMedia('(max-width: 1023px)')` changes so wide→narrow transitions work.
- Treat DOM markers as the cross-module state contract: common markers include `data-mobile-nav="frame"`, `data-sidebar-collapsed`, `data-aionui-explorer-open`, `data-aionui-preview-open`, and `data-mobile-preview-full`.
- Use idempotent `ensure()`/reparent logic when injecting nodes into third-party React-owned DOM. Clean up moved nodes, observers, attributes, and listeners on disposal.
- Dependency injection/state: obtain DSH services through the declared fiber `inject` list and slot `inject` props; use React state for local mirrors and `data-*` markers for cross-effect state.
- Client runtime effects are currently synchronous DOM work; follow that pattern unless a new contract requires async behavior. Use the optional debug badge's captured `error`/`unhandledrejection` output when diagnosing failures instead of swallowing exceptions.
- Match the existing TypeScript style (single quotes, no semicolons, explicit exported return types) and name effect installers `install<Domain>`.
- Client-local relative imports must include `.ts`/`.tsx` extensions; `tsconfig.client.json` rewrites them for the CommonJS emit. Use type-only imports for DSH module augmentation and SlotMap/Context typing; do not introduce runtime imports for types.
- Add locale keys to `zh` first, then mirror the same keys in typed `en`; `MobileNavKey` is derived from `zh`.
- Keep CSS in `src/client/styles/`, not in component files. Preserve the `base → layout → compat → misc` concatenation order and complete CSS comments/section boundaries.
- Preserve mobile-only behavior and modal precedence: capture-phase drawer handlers must yield to `[aria-modal="true"]` dialogs and ignore session-row action buttons. `transform: none`, rather than an identity `translateX(0)`, is required for the open drawer so fixed descendants keep the correct containing block.
- Keep `sidebar.footer.action` ordering deliberate (`order: 5` for this plugin). Do not tie it with the usage-statistics slot.
- Do not edit `lib/` directly. After any source/config change that affects output, rebuild and include the generated artifacts.

## Important Files

- `package.json`: package exports, DSH client declaration, scripts, peer dependencies, and package manager.
- `tsconfig.json`: strict host/ESM compilation to `lib/`.
- `tsconfig.client.json`: strict client/CommonJS compilation to `.client-build/`, declaration output, path mappings, and import-extension rewriting.
- `cordis.patch.yml`: the single host plugin row.
- `src/client/index.tsx`: client composition, fiber injection, effect installation, locale registration, and slot registration.
- `src/client/MobileNavToggle.tsx` / `MobileDrawerFooter.tsx`: header and drawer actions.
- `src/client/effects/*.ts`: phone chrome, third-party compatibility, statistics, and diagnostics.
- `src/client/debug.ts`: opt-in `?mobile-nav-debug=1` runtime diagnostics and error capture.
- `src/client/styles/index.ts` and `src/client/styles/*.css.ts`: mobile stylesheet source and ordering.
- `scripts/build-client.mjs`: recursive client-module collector and `window.__ModuleLoader__.load` wrapper.
- `scripts/cdp-probe.mjs`: optional standalone 390×844 CDP smoke probe; it is not part of `pnpm verify` or `pnpm build`.
- `README.md`: supported behavior, compatible plugin versions, installation, build, and manual verification.

## Runtime/Tooling Preferences

- Use `pnpm@11.7.0` with the committed `pnpm-lock.yaml` (lockfile v9). The package is ESM (`"type": "module"`) and build scripts run under Node.
- TypeScript is the compiler; React 18 and DSH client packages are peer dependencies. Keep peer versions aligned with `package.json` and the README compatibility matrix.
- The host half emits ESM directly. The client half emits CommonJS, then `scripts/build-client.mjs` recursively inlines relative modules into `lib/client.js`; bare platform imports remain host-resolved `require()` calls. Do not replace this with a general-purpose bundler without an explicit design change.
- `lib/` is intentionally committed because consumers install the repository/package without a build step. A source change is incomplete until `pnpm build` refreshes it.
- CSS relies on `:has()` and therefore requires Chromium 105+; preserve `prefers-reduced-motion` behavior. When diagnosing old WebViews, remember unsupported `:has()` rules can disappear silently.

## Testing & QA

There is no test framework, coverage setup, linter, formatter, or CI workflow. The automated gate is `pnpm verify`; `pnpm build` additionally exercises the custom bundler. Use `git diff --check` for whitespace hygiene.

After source/layout changes, install the linked plugin in a real DSH Web profile, restart `dsh web`, and check both sides of the breakpoint:

- **Narrow phone (~390px):** rail hidden; drawer/FAB/backdrop open and close; Escape; session-row action menus do not close the drawer; settings remains usable; Files opens explorer/preview sheets; session-log/footer actions work; preview fullscreen opens and resets.
- **Tablet (768–1023px):** verify the intended centered and width-constrained sheet geometry separately from phone behavior.
- **Desktop (≥1024px):** compare with the plugin disabled; there must be no layout or interaction change.

For phone-side debugging, add `?mobile-nav-debug=1` to display live viewport, frame/marker, floating-panel, and captured-JavaScript-error state. Use a fresh browser context or clear site data when a device appears to load stale UI; compare the served client revision with `sha1sum lib/client.js` before changing code. The optional `node scripts/cdp-probe.mjs` expects a local DSH server at `127.0.0.1:3080` and is a targeted smoke probe, not a replacement for real-profile checks.

Validate compatible third-party versions when exercising integrations: `dsh-web-ui-all` 0.1.14, `dshmarket` 1.2.2, `dsh-usage-stats` 0.1.2, and `@omdsh-dev/dsh-genui` 0.8.3.

## Pitfalls

- **CSS 互斥优先级会造成「按钮看似失效」**：同一 marker 族的互斥规则（如 preview 打开时 explorer `visibility:hidden`）会让功能代码正确但 UI 无响应。排查「点了没反应」先对照 `compat.css`/`layout.css` 里该元素的互斥声明，再动 JS。打开 explorer 前必须先清 `data-aionui-preview-open`（两个入口：`MobileNavToggle.toggleExplorer` 与 `MobileDrawerFooter.openExplorer`），与「点文件行开 preview」保持对称。
- **全树 reconciler 的 task 必须幂等且 dispose 可恢复**：`ensure` 每次移动第三方 DOM 时刷新 `origin`（React 会重建节点）；`dispose` 找回元素限定在被移动容器内，不用全局文本搜索；task 注册的 disposer 不得丢弃，否则同环境插件重载后 reconciler 失效。
- **文档/注释与实现的漂移**：`MobileNavOverlay.tsx` 已删除（2026-08-16），其职责由 shared reconciler task（`settings-toolbar-reparent`/`git-chip-reparent`）承担。注释与架构描述提到该组件即视为过时，改为引用 task 名。
