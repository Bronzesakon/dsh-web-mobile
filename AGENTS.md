# dsh-web-mobile (dsh-mobile-nav)

## Project

- Single-package, client-only plugin for the DSH (DeepSeek Harness) Web UI. It adapts the web UI to portrait/mobile viewports below 1024px (overlay drawer, full-width conversation, adapted settings/explorer/preview sheets, status-bar safe areas, composer row, stats line). At ≥1024px it must be a complete no-op.
- Names differ by boundary: README/GitHub project = `dsh-web-mobile`; npm package = `@dsh-external/dsh-mobile-nav`; patch row id = `dsh-mobile-nav`.
- No monorepo, no application server, no workspace layer.
- Real entrypoints:
  - `cordis.patch.yml` inserts the single host plugin row.
  - `src/index.ts` is the host half and intentionally exports an empty `apply()` so the row is visible to the host Loader.
  - `package.json` exposes `./client` and declares `dsh.client.platform: "web"`; DSH discovers the browser half from `src/client/index.tsx`.
- Key layout:
  - `src/client/` — browser half (components, effects, styles, locales, debug).
  - `src/client/effects/` — DOM effects grouped by domain.
  - `src/client/styles/` — CSS as TypeScript string modules.
  - `lib/` — committed build output (host + inlined client bundle + d.ts). Treat as generated; do not hand-edit.
  - `scripts/` — custom client bundler and optional CDP smoke probe.
  - `tests/` — `node:test` unit tests for the reconciler core.

## Commands

```sh
pnpm install                       # install (pnpm@11.7.0, lockfile v9)
pnpm verify                        # type-check host + client halves (tsc --noEmit)
pnpm test:core                     # node --test tests/reconciler-core.test.ts (unit tests)
pnpm build                         # tsc host && tsc client && node scripts/build-client.mjs
npm run prepack                    # runs npm run build before packaging
npm pack                           # package smoke check (invokes prepack)
```

- `pnpm build` is the required gate after any source change: it emits host ESM, client CommonJS, then inlines the client into `lib/client.js`. `lib/` is committed, so a change is incomplete until `pnpm build` refreshes it.
- `pnpm verify` + `pnpm test:core` are the fast local checks; there is no lint/format/CI.
- Optional CDP regression probe (not part of `verify`/`build`):

```sh
DSH_PROBE_SESSION_ID=<id> pnpm smoke:cdp
# env: DSH_PROBE_URL (default http://127.0.0.1:3080/), DSH_PROBE_CHROME (default chromium),
#      DSH_PROBE_TIMEOUT_MS, DSH_PROBE_REQUIRE_CHIP (0/1)
```

  Requires a local DSH Web profile already running at `127.0.0.1:3080`.

- Local DSH profile workflow:

```sh
dsh plugin --profile web add link:/path/to/dsh-web-mobile
dsh --profile web --dump-config   # should contain the dsh-mobile-nav row
dsh web
```

## Architecture

- Host/client split is load-bearing. All browser behavior lives in `src/client/`; the host half stays an empty `apply()`.
- `src/client/index.tsx` injects `['slots', 'layout', 'locale', 'sessionLogDownload']`. Its `apply()` registers locale dictionaries, injects one `<style data-plugin>` tag, installs effects, and registers exactly two slots:
  - `conversation.session.header.actions` → `MobileNavToggle` (`order: 10`): drawer toggle + Files button.
  - `sidebar.footer.action` → `MobileDrawerFooter` (`order: 5`): Files + session-log actions. Order 5 keeps them below the remote icon row (order default 0) and above usage badges (order 10). Do not tie with usage stats.
  - There is **no settings slot** anymore; the haptic feedback feature was removed.
- Shared full-tree reconciler:
  - `src/client/effects/reconciler-core.ts` is a DOM-free engine with **zero imports**. It owns task registry, dirty-key routing (`scopes`), coalesced rAF flush scheduling, and per-task error isolation.
  - `src/client/effects/phone-chrome.ts` is the thin browser adapter: one `MutationObserver` on `document.documentElement` maps records to dirty keys (`attributeName`, or `'*'` for tree changes), feeds `core.note()`, and drives activation/deactivation via `installMobileEffect`.
  - Tasks only run while the mobile breakpoint is active, coalesced to one pass per animation frame. `stats-line` must stay `scopes: ['*']` because TPS updates are childList/characterData text mutations.
  - Registered tasks: `frame-marker`, `preview-fullscreen-toggle`, `git-chip-reparent`, `settings-toolbar-reparent`, `preview-close-sync`, `sheet-rise-replay`, `stats-line`, `overlay-backdrop-fab`.
- Effects:
  - `phone-chrome.ts` — status bar/theme-color/viewport meta, `gesturestart` zoom guard, drawer close interactions (Escape + navigation taps), and the overlay backdrop/FAB via reconciler tasks.
  - `aionui-compat.ts` — dsh-web-ui explorer/preview markers and sheet rise animation.
  - `stats-line.ts` — marks the official status row and moves the TPS readout into it.
  - `debug.ts` — opt-in `?mobile-nav-debug=1` live diagnostic badge (no-op without the query param).
- Styles: `src/client/styles/index.ts` concatenates `base → layout → compat → misc` in that load-bearing order and injects one `<style data-plugin="@dsh-external/dsh-mobile-nav">`. Mobile rules target `(max-width: 1023px)`; desktop rules hide mobile controls and must preserve the uninstalled layout.
- Third-party compatibility is implemented through scoped DOM markers, stable `data-*` attributes, `MutationObserver`, and carefully scoped class/text anchors. Never modify third-party source packages.

## Conventions

- Keep the host/client split intact; the empty host `apply()` is intentional.
- Use stable `data-*` markers and structural selectors before hashed classes. For unavoidable hashed classes, scope substring/suffix selectors to the owning region; for tree rows use `[class*="_treeRow"]` and exclude `[class*="_treeArrowEmpty"]` when distinguishing directories from files.
- Put every long-lived style tag, listener, timer, or `MutationObserver` inside `ctx.effect(() => { ...; return disposer }, label)`. Re-arm width-sensitive effects on `matchMedia('(max-width: 1023px)')` changes via `installMobileEffect` so wide→narrow transitions work.
- Treat DOM markers as the cross-module state contract: `data-mobile-nav="frame"`, `data-sidebar-collapsed`, `data-aionui-explorer-open`, `data-aionui-preview-open`, `data-mobile-preview-full`, `data-mobile-nav="stats"`.
- Use idempotent `ensure()`/reparent logic when injecting nodes into third-party React-owned DOM. Clean up moved nodes, observers, attributes, and listeners on disposal.
- Obtain DSH services through the declared fiber `inject` list and slot `inject` props; use React state for local mirrors and `data-*` markers for cross-effect state.
- Client runtime effects are currently synchronous DOM work; follow that pattern unless a new contract requires async behavior. Use the debug badge's captured `error`/`unhandledrejection` output when diagnosing failures instead of swallowing exceptions.
- TypeScript style: single quotes, no semicolons, explicit exported return types, installer names `install<Domain>`.
- Client-local relative imports must include `.ts`/`.tsx` extensions; `tsconfig.client.json` rewrites them for CommonJS emit. Use type-only imports for DSH module augmentation and SlotMap/Context typing.
- **`src/client/effects/` 禁 `../` import**：自定义打包器（`scripts/build-client.mjs`）无法解析 effects 目录向父级的相对 require（会把 `../x.ts` 误解析为同目录 `x.js` 并报 `client module not found`）。effects 内文件只能引用同目录模块或裸模块；跨模块共享的纯逻辑放同目录新文件（如 `reconciler-core.ts` 保持零 import），第三方任务模块统一经 `phone-chrome.ts` 拿 `ReconcilerTask` 类型。
- Add locale keys to `zh` first, then mirror the same keys in typed `en`; `MobileNavKey` is derived from `zh`.
- Keep CSS in `src/client/styles/`, not in component files. Preserve the `base → layout → compat → misc` concatenation order and complete CSS comments/section boundaries.
- Preserve mobile-only behavior and modal precedence: capture-phase drawer handlers must yield to `[aria-modal="true"]` dialogs and ignore session-row action buttons. `transform: none`, rather than an identity `translateX(0)`, is required for the open drawer so fixed descendants keep the correct containing block.
- Do not edit `lib/` directly; rebuild and include generated artifacts after any source/config change.

## Pitfalls

- **CSS 互斥优先级会造成「按钮看似失效」**：同一 marker 族的互斥规则（如 preview 打开时 explorer `visibility:hidden`）会让功能代码正确但 UI 无响应。排查「点了没反应」先对照 `compat.css`/`layout.css` 里该元素的互斥声明，再动 JS。打开 explorer 前必须先清 `data-aionui-preview-open`（两个入口：`MobileNavToggle.toggleExplorer` 与 `MobileDrawerFooter.openExplorer`），与「点文件行开 preview」保持对称。
- **dsh-meme 表情卡片右缘溢出 + 网格不自适应 + 滚动条太粗**：`.meme-picker`（`conversation.input.overlay`，id meme-picker）用 `width:min(360px,90vw)` 对**视口**计算宽度，而卡片锚定在输入区的 overlay anchor（左右各 17px 内缩）里——窄屏手机（390px）下 border-box 377px 超过 anchor 356px，右缘会冲出屏幕。`compat.css` 里已用 `[data-mobile-nav="frame"] .meme-picker { left/right:0; width:auto; box-sizing:border-box; max-width:386px }` 修正：手机端贴 anchor 双侧对齐（左右安全距离对称），平板端保持原 386px 卡宽不拉伸。网格内部 `.mp-grid` 原是 flex + 固定 76px `.mp-cell`，手机端每行只有 3 列且右侧留 ~78px 空白；已改用 `display:grid; grid-template-columns:repeat(auto-fill,minmax(64px,1fr))` + `.mp-cell { width:100%; height:auto; aspect-ratio:1 }`（均 `!important` 覆盖 dsh-meme 行内 width/height），手机端 4 列、平板端 5 列满宽，间隙保持 8px，末行不完整属正常。网格右侧滚动条默认 WebKit 太粗，已加 `scrollbar-width:thin` + `::-webkit-scrollbar { width:4px }` 圆角细条。以后 dsh-meme 改卡片宽度或缩略图尺寸记得回来对账。
- **agent preset 模式选择菜单手机端撑满屏**：新会话主界面点「Agent preset」模式选择，打开的是官方 `@deepseek-ai/dsh-client-ui-agent-preset` 的 `[role="menu"]` portal（挂在 `document.body`，不在 `[data-mobile-nav="frame"]` 内），其 CSS `position:fixed; max-height:820px; bottom:12px` 在手机视口下从触发器一直拉到距底 12px，几乎占满整屏。`compat.css` 里用 `[role="menu"]:has([class*="cubgiG_item"])`（`:has` 精确圈定该菜单，不误伤 model/access mode 等其他 `role=menu`）改成打磨过的底部弹层：水平居中（官方 max-width 360px 默认 left:12 会留 12/18px 不对称边距）、`top:auto; left:50%; transform:translateX(-50%); bottom:12px; width:min(100% - 24px,360px); max-height:min(55dvh,440px); padding:30px 6px 10px; border-radius:16px`，加顶部 36×4px 拖拽手柄（`::before`，pointer-events:none），内部 viewport 滚动。竖屏下该菜单内部滚动条默认 WebKit 太粗会占 ~15px 挤窄文字描述，已加 `[class*="_viewport_"] { scrollbar-width:thin }` + `::-webkit-scrollbar { width:4px }` 圆角细条。桌面 ≥1024px 在 media query 外，保持官方大下拉。注意：`cubgiG_` 是 agent-preset 包的 CSS module 哈希，包升级时需回来对账。
- **全树 reconciler 的 task 必须幂等且 dispose 可恢复**：`ensure` 每次移动第三方 DOM 时刷新 `origin`（React 会重建节点）；`dispose` 找回元素限定在被移动容器内，不用全局文本搜索；task 注册的 disposer 不得丢弃，否则同环境插件重载后 reconciler 失效。
- **文档/注释与实现的漂移**：`MobileNavOverlay.tsx` 已删除，其职责由 shared reconciler task（`settings-toolbar-reparent`/`git-chip-reparent`）承担；提到该组件即视为过时。触觉反馈（`HapticRow`/`haptic-pref`）也已从源码移除，README 相关条目已清理（2026-08-21）。
- **合并涉及 CSS 字符串的 PR 会冲突在生成文件**：`lib/types/client/styles/*.css.d.ts` 和 `.d.ts.map` 是单行大字符串，双方只要都改过同一 CSS 模块，git 会在这些生成文件上报行级冲突。解法是合并后跑 `pnpm build` 重建 lib 再 `git add`，不要手工编辑 d.ts。
- **`?mobile-nav-debug=1` 的 debug badge 不能观察自己写入的子树**：badge 位于 `document.body` 内，而 `paint()` 写 `badge.textContent` 会产生 childList mutation；若 MutationObserver 直接以 `paint` 为回调，会把自身输出再次喂给 `paint()`，造成页面硬冻结（headless/真实浏览器都会卡在 "Loading plugins…"）。回调必须跳过 `badge` 自身及其子树上的 mutation（`record.target === badge || badge.contains(record.target)`），否则调试模式本身就是事故源。
- **CSS 模板字符串注释内禁止反引号**：`src/client/styles/*.css.ts` 的 CSS 是 TypeScript 模板字面量，注释里写 Markdown 反引号会提前终止模板，tsc 报 `TS1005`。引用类名用普通引号或纯文本。
- CSS relies on `:has()` and therefore requires Chromium 105+; unsupported `:has()` rules can disappear silently in old WebViews. Preserve `prefers-reduced-motion` behavior.
- Generated code discipline: `lib/` is intentionally committed because consumers install without a build step. A source change is incomplete until `pnpm build` refreshes it.
- **页面状态/bundle 校验**：插件加载的 `dsh-mobile-nav/client.js?rev=<12位>` 就是 `sha1sum lib/client.js` 前 12 位（服务端 no-cache 读当前 lib，rev 仅作缓存 bust）。设备出现旧 UI 时先换全新 browser context/清站点数据——复用旧 context 会让 harness web 进入「fence-only」状态（frame 内联 `display:none`、最后一条 dsh-ui fence 挂 app 根级），与插件无关；再用 `sha1sum lib/client.js` 与服务端 rev 比对，不要据此改 mobile-nav 代码。

## Testing & QA

- Automated gates: `pnpm verify` (typecheck) and `pnpm test:core` (reconciler-core unit tests). `pnpm build` additionally exercises the custom client bundler. Use `git diff --check` for whitespace hygiene.
- There is no linter, formatter, coverage setup, or CI workflow.
- After source/layout changes, install the linked plugin in a real DSH Web profile, restart `dsh web`, and check both sides of the breakpoint:
  - **Narrow phone (~390px):** rail hidden; drawer/FAB/backdrop open and close; Escape; session-row action menus do not close the drawer; settings remains usable; Files opens explorer/preview sheets; session-log/footer actions work; preview fullscreen opens and resets.
  - **Tablet (768–1023px):** verify the intended centered and width-constrained sheet geometry separately from phone behavior.
  - **Desktop (≥1024px):** compare with the plugin disabled; there must be no layout or interaction change.
- For phone-side debugging, add `?mobile-nav-debug=1` to display live viewport, frame/marker, floating-panel, and captured-JavaScript-error state. The optional `pnpm smoke:cdp` is a targeted smoke probe, not a replacement for real-profile checks.
- Playwright 验证 DSH Web 移动端布局必须用**全新 browser context**，并通过 `addInitScript` 写入 `localStorage['dsh.sessions.current'] = JSON.stringify({sessionId})`；复用长活 context 会出现「fence-only」假象（见 Pitfalls「页面状态/bundle 校验」）。点 backdrop 关抽屉时默认点元素中心会被抽屉盖住，改用 `page.mouse.click(x, y)` 点抽屉右侧露出区域。
- 不要用 Playwright route 拦截插件 `client.js` 并 fulfill 空 body 做 A/B 实验：空响应被缓存后 boot 会报「loaded without registering」并挂起。A/B 用 `git show <commit>:lib/client.js > lib/client.js` 换文件。
- Validate compatible third-party versions when exercising integrations: `dsh-web-ui-all` 0.1.14, `dshmarket` 1.2.2, `dsh-usage-stats` 0.1.2, `@omdsh-dev/dsh-genui` 0.8.3.

## Maintenance

- This file is a living reference. Whenever you discover a new repo-specific command, convention, or pitfall, update it in place.
- Keep it accurate and concise; remove stale entries as the codebase changes (e.g. removed features, renamed files, new scripts).
- Verify claims against source before writing them; do not preserve guidance that no longer matches the current tree.
