# WebUI 设计语言（v1）

## 适用范围
- 适用对象：`src/webui/*.css`、`src/webui/index.html`、对应 DOM class 约定。
- 目标：保证后续迭代在视觉、交互、结构上可持续一致。
- 基线风格：同色调低对比 + 新态拟物（neumorphism）轻量触感。

## 当前定稿（2026-02-12）
- 全局色调：近白冷中性；主背景与主面板同色系。
- 光源语义：统一左上高光、右下暗影；按压时阴影反转。
- 消息区容器：`messages` 使用极浅灰纯色（无渐变）。
- 气泡语义：消息区背景灰；`agent` 近白、`user` 浅蓝、`system` 略深于背景的中灰。
- 气泡边界：三类消息气泡统一 `1px` 极细边框；当前策略为 `agent` 边框略强于 `system`。
- 引用块：保留左侧竖线；竖线与正文的间距已加宽（消息内与输入预览一致）。
- 输入框：无边框，仅保留轻微凹陷（micro inset）。
- 任务弹窗：`tasks-list` 为平面浅色层，不使用凹陷阴影。
- 弹窗遮罩：使用偏冷中性灰半透明底，透过度低于早期版本。
- 按钮：全局不可文本选中/复制（`user-select: none`）。

## 设计原则
- 同色调优先：背景与组件共享同一色系，不做高反差分层。
- 层级靠阴影：用阴影语义表达层级，不靠重边框堆层。
- 交互可触感：可点击控件在 `:active` 必须有“凹陷 + 微位移”反馈。
- 强调克制：主色只用于核心动作与状态，不大面积铺色。
- 最小复杂度：优先复用 token，不引入平行体系。

## 信息架构
- 结构顺序：`header -> messages -> composer -> dialogs`。
- 主容器：`main[data-app]` 控制纵向布局与最大宽度。
- 核心分区：
- `app-header`：状态与全局动作。
- `messages-section`：消息流与回到底部按钮。
- `composer`：输入、引用预览、发送按钮。
- `tasks-dialog` / `restart-dialog`：操作型对话框。

## Token 体系
- 来源：`src/webui/base.css`。
- 基础色：`--bg` `--panel` `--panel-soft` `--panel-strong` `--well-bg` `--messages-bg` `--text` `--muted`。
- 语义色：`--accent` `--success` `--warning` `--danger`。
- 气泡色：`--bubble-*-bg` `--bubble-*-text` `--bubble-*-border`（`agent`/`user`/`system`）。
- 状态色：`--status-running` `--status-success` `--status-fail` 等。
- 阴影：`--shadow-raised` `--shadow-raised-soft` `--shadow-inset` `--shadow-inset-soft` `--shadow-floating` `--shadow-dialog`。
- 形状：`--radius` `--radius-sm`。
- 焦点：`--focus-ring`。

## 层级语法
- 凸起层（Raised）：卡片、面板、默认按钮；使用 `--shadow-raised` / `--shadow-raised-soft`。
- 凹陷层（Inset）：输入区与交互按压态；使用 `--shadow-inset` / `--shadow-inset-soft`。
- 浮动层（Floating）：悬浮快捷按钮；使用 `--shadow-floating`。
- 凹陷白名单（当前实现）：
- `.composer textarea`
- 交互按压态（`:active` / `[aria-pressed='true']`）
- 禁止凹陷的常规信息区：
- 消息气泡主体
- 元信息胶囊（如 origin / task profile）
- 引用预览显示态
- `tasks-list`

## 组件规范
- 按钮（`.btn`）：默认凸起；按压切换凹陷 + 微位移。
- 消息气泡（`.message article`）：极轻微凸起，统一极细边框，按角色使用独立 bg/text/border token。
- 引用块（`.message-quote` / `.quote-preview`）：保留竖向角色条与弱化凸起阴影；不使用凹陷显示态；`.quote-preview` 的角色 `bg/text` 必须复用 `--bubble-*` token 与消息气泡对齐。
- 引用按钮（`.message-quote-btn`）：保留凹凸按压反馈。
- 清除引用按钮（`.quote-clear`）：凸起阴影需弱于常规图标按钮，仅保留轻微触感。
- 任务面板（`.tasks-*`）：列表平面浅色层 + 任务项凸起层；任务链接保留按压反馈。

## 交互与可用性
- `hover`：只做轻量色彩/阴影变化，不做大位移动效。
- `focus-visible`：统一使用 `--focus-ring`，不得去除可见焦点。
- `disabled`：降低透明度并禁用 pointer 语义。
- 动效基线：`120ms ~ 220ms`，以 `ease-out` 为主。
- 动效降级：`prefers-reduced-motion: reduce` 下关闭动画与 transform 过渡。

## 响应式与可访问性
- 断点：`max-width: 640px`。
- 移动端：消息气泡宽度放宽；composer 按钮纵向铺满；悬浮按钮位置收紧。
- 所有图标按钮必须有 `aria-label`。
- 对话框必须有 `aria-labelledby`，必要时补 `aria-describedby`。
- 状态文本需可被读屏感知（如 `aria-live="polite"`）。

## 文件职责映射
- `base.css`：全局 token 与元素基线。
- `layout.css`：页面框架、消息容器、输入区外壳。
- `components-core.css`：按钮、状态、通用小组件。
- `components-messages.css`：消息流、引用、加载态。
- `components-dialogs.css`：任务与重启弹窗。
- `components-markdown.css`：Markdown 渲染细节。
- `components-responsive.css`：动效降级与移动端覆写。

## 迭代协议
- 改颜色/阴影优先改 token，不散落硬编码值。
- 新组件必须声明其层级语法（Raised / Inset / Floating）。
- 新可点击元素必须接入统一按压反馈。
- 涉及核心操作的新强调色，优先评估是否复用 `--accent`。
- 每次改版后至少检查：`header`、`messages`、`composer`、`dialogs` 四区一致性。

## 参考链接
- https://css-tricks.com/neumorphism-and-css/
- https://idevie.com/design/ui/what-is-neumorphism-is-it-all-about-soft-ui
- https://m3.material.io/styles/elevation/overview
- https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
