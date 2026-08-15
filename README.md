# dsh-mobile-nav

DeepSeek Harness web UI 移动端适配插件(client-only)。

## 解决的问题

窄屏(< 1024px)下官方布局会把左侧边栏折叠成一条 56px 的图标 rail,展开目录时又
会挤压中间会话列,手机上几乎没有可用宽度。本插件在窄屏下:

- **完全隐藏 rail**:网格改为 `1fr 0 0`(抽屉脱离 grid 流后,中心列独占视口);
- **目录变成抽屉**:点标题旁的按钮(或 hero 态的浮动按钮)时,侧边栏以
  overlay 抽屉形式从左滑入,压在会话之上而不是挤压它;抽屉宽度严格贴合
  侧栏内容(`max-content`,约 280px),不产生白边;
- **避开摄像头**:不做顶部预留空间(应用仍从视口顶端开始);打开目录的
  浮动按钮放在**左侧边缘 y=72px**(摄像头带之下、hero 输入卡之上),
  不会被刘海/挖孔/状态栏挡住;
- **会话头部重排(移动端)**:目录按钮移到**最左侧**,其后依次是会话名称、
  模式徽标;大块的 **Session log 胶囊从头部移除**,移到抽屉底部
  (Settings 旁),复用官方 `ctx.sessionLogDownload` 下载逻辑(进度/结果
  弹窗与桌面端一致);桌面端头部完全不变;
- **设置界面移动端适配**:官方设置弹窗(800px 双栏)在手机上改为**近全宽
  sheet**(`calc(100vw - 16px)`、左缘 8px、高度自适应内容、上限 800px):
  导航标签两行全部可见(隐藏冗余标题,不再横向滚动截断)、工具栏左右
  分散(Open configuration file 靠左、圆形关闭按钮靠右)、设置条目保持
  横向布局、Appearance 三卡片压缩为一行;所有设置专用规则用
  `:has(> :first-child > :last-child > button)` 限定,导出会话对话框
  (同款 primitives Modal)保持官方居中卡片并限制 `max-width` 防溢出;
  抽屉打开态为 `transform: none`(不用 `translateX(0)`),避免恒等
  transform 让抽屉成为 fixed 弹窗遮罩的 containing block 导致侧栏内容
  被聚焦滚动推移;Escape 只关设置、不误关抽屉;
- **主界面无残留**:抽屉关闭态 `translateX(-110%)` 完全移出视口(此前
  `-105%` 会露出 14px 白边 + 32px 模糊阴影形成贯穿全高的左侧灰带),
  抽屉本身不设 box-shadow,遮罩已足够分层;
- **设置面板弹出动画**:官方设置弹窗挂载时无任何动画(瞬间出现),插件
  补上淡入 + 轻微上移/缩放(sheet-in,约 0.22s)并同步遮罩淡入,
  `prefers-reduced-motion` 下自动禁用;
- **移动端正文排版**:会话消息文字 16px → 15px、左右留白 32px → 20px
  (行宽更宽),仅作用于会话消息流(`_scroll:has(p)`),左侧抽屉历史栏
  与输入框文字不受影响;
- **输入框底栏防重叠**:官方底栏给模型胶囊 `flex:0 0 auto`,把 agent
  权限胶囊(盾牌)挤到 15px,盾牌箭头溢出压在模型名上;插件改为权限
  胶囊保持自然宽(44px)、模型胶囊允许收缩(`:has(textarea)` 锚定输入
  卡片,不依赖 hash 类),盾牌与模型名不再重叠;
- 半透明遮罩 + 点击遮罩 / Escape 关闭;宽屏(≥1024px)下不产生任何变化。

## 实现要点

- 纯 client 插件:host 侧只有空 `apply`,浏览器半身通过 `exports["./client"]` 分发;
- 只依赖框架稳定属性:`data-sidebar-collapsed`、`data-shell-overlay`、
  `data-side`、`data-phase`、`aria-modal`,不耦合任何 hash class
  (唯一例外:Appearance 卡片横排依赖官方 `_cubeRow` 类后缀);
- 插件自身通过 `data-mobile-nav="frame"` 标记 AppFrame,再由 CSS 完成网格
  重排与抽屉位移;设置面板与导出对话框的区分需要 `:has()`(Chromium
  105+,2022);
- 目录开合状态用 MutationObserver 镜像 AppFrame 的 `data-sidebar-collapsed`,
  调用 `ctx.layout.toggleSidebar()` 驱动,与官方面板状态机一致;
- client bundle 用 tsc(CJS)+ 内联器打包为 `__ModuleLoader__` 形态,仅
  require 平台模块(react / primitives)。

## 构建

```sh
pnpm install
pnpm build        # tsc host + tsc client + 内联打包 lib/client.js
```

## 安装

```sh
# 本地开发 / 已有 checkout
dsh plugin --profile web add link:/path/to/dsh-mobile-nav

# GitHub 分发(push 后,仓库含 prepare 构建脚本,产物由安装时构建)
dsh plugin --profile web add github:<owner>/<repo>
```

注意:

- 插件的 `prepare` 脚本在安装时自动构建 `lib/`(产物不入库);
- pnpm ≥10 默认拦截 Git 依赖的构建脚本:首次 `add` 会失败并打印
  `allowBuilds` 所需的精确 key,把它加入
  `profiles/<name>/pnpm-workspace.yaml` 后重跑 `add` 即可;
- 安装后重启 profile 生效;此后 client bundle 变更只需刷新页面。

## 验证

- `pnpm verify` 双 program 类型检查;
- 真实组合:`dsh --profile web --dump-config` 应出现插件层;
- 移动端(390px):rail 消失、中心列全宽、FAB 在安全区下方(y≥56px)、
  抽屉开合/遮罩/Escape、设置弹窗单列适配;
- 桌面端(≥1024px)外观与未安装时一致。
