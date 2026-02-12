# WebUI 设计语言（v1）

## 适用范围
- 适用对象：`src/webui/*.css`、`src/webui/index.html`、对应 DOM class 约定。
- 目标：保证后续迭代在视觉、交互、结构上可持续一致。
- 基线风格：同色调低对比 + 新态拟物（neumorphism）挤压感。

## 设计原则
- 同色调优先：背景与组件共享同一色系，不做高反差分层。
- 层级靠阴影：用亮部（左上）+暗部（右下）表达抬起/凹陷。
- 交互可触感：可点击元素按压时必须出现阴影反转。
- 强调克制：主色仅用于核心动作与状态，避免大面积高饱和。
- 最小复杂度：优先复用 token 与已有 class 语义，不引入平行体系。

## 信息架构（页面骨架）
- 结构顺序：`header -> messages -> composer -> dialogs`。
- 主容器：`main[data-app]` 控制纵向布局与最大宽度。
- 对话页核心块：
- `app-header`：状态与全局动作。
- `messages-section`：消息流与回到底部按钮。
- `composer`：输入、引用预览、发送按钮。
- `tasks-dialog` / `restart-dialog`：操作型对话框。

## Token 体系
- 来源：`src/webui/base.css`。
- 色彩 token：`--bg` `--panel` `--panel-soft` `--panel-strong` `--text` `--muted`。
- 语义色 token：`--accent` `--success` `--warning` `--danger`。
- 状态色 token：`--status-running` `--status-success` `--status-fail` 等。
- 阴影 token：`--shadow-raised` `--shadow-raised-soft` `--shadow-inset` `--shadow-inset-soft` `--shadow-floating`。
- 形状 token：`--radius` `--radius-sm`。
- 焦点 token：`--focus-ring`。

## 层级语法（必须遵循）
- 凸起层（Raised）：卡片、面板、默认按钮。
- 使用：`--shadow-raised` 或 `--shadow-raised-soft`。
- 凹陷层（Inset）：输入区、容器内部槽、按压态。
- 使用：`--shadow-inset` 或 `--shadow-inset-soft`。
- 浮动层（Floating）：悬浮快捷按钮。
- 使用：`--shadow-floating`。

## 组件规范
- 按钮（`.btn`）
- 默认态：凸起阴影；`hover` 增强凸起。
- 按压态：`:active` / `[aria-pressed='true']` / `.is-pressed` 必须切换凹陷阴影并轻微位移。
- 变体：
- `btn--primary` 仅用于关键提交动作。
- `btn--danger` 仅用于破坏性操作。
- `btn--icon-muted` 用于次级图标动作。
- 消息（`.message article`）
- `user`：可用 `--accent-soft` 做轻强调，但保持低对比。
- `agent`：保持中性面板色。
- `system`：使用更低层级表面（`--panel-strong`）区别系统提示。
- 引用块（`.message-quote` / `.quote-preview`）
- 必须包含竖向角色条（`--quote-bar`）+ 轻量背景。
- 角色只改语义色，不改结构与层级语法。
- 任务面板（`.tasks-*`）
- 列表槽位为凹陷层，任务项为凸起层。
- 可点击任务链接需要按压反馈（阴影反转）。

## 文本与排版
- 基础字体：系统中日韩无衬线组合（见 `base.css`）。
- 文本分层：正文 `--text`，辅助信息 `--muted`。
- 数值信息：耗时、token 使用 `tabular-nums` 对齐。
- Markdown 内容保持可读性优先，不追求视觉装饰。

## 交互状态规范
- `hover`：只做轻量色彩/阴影变化，不做大位移动效。
- `focus-visible`：统一使用 `--focus-ring`，不得去除可见焦点。
- `active`：可点击控件统一“凹陷+微位移”反馈。
- `disabled`：降低透明度并禁用 pointer 语义。

## 动效规范
- 入场动效：消息与对话框允许短时淡入/位移动效。
- 时长基线：`120ms ~ 220ms`，缓动以 `ease-out` 为主。
- 降级：`prefers-reduced-motion: reduce` 必须关闭动画与 transform 过渡。

## 响应式规范
- 断点：`max-width: 640px`。
- 移动端策略：
- 消息气泡宽度放宽（避免过窄）。
- composer 按钮纵向铺满。
- 悬浮按钮位置收紧，避免遮挡输入。

## 可访问性规范
- 所有图标按钮必须有 `aria-label`。
- 对话框必须有 `aria-labelledby`，必要时补 `aria-describedby`。
- 状态文本需可被读屏感知（如 `aria-live="polite"`）。
- 仅视觉区分状态时，需保留语义文本或可读标签。

## 文件职责映射
- `base.css`：全局 token 与元素基线。
- `layout.css`：页面框架、面板容器、对话框外壳。
- `components-core.css`：按钮、状态、通用小组件。
- `components-messages.css`：消息流、引用、加载态。
- `components-dialogs.css`：任务与重启对话框。
- `components-markdown.css`：markdown 渲染细节。
- `components-responsive.css`：动效降级与移动端覆写。

## 迭代协议（后续改版必须执行）
- 改颜色/阴影优先改 token，不直接散落硬编码值。
- 新组件必须声明其层级语法（Raised / Inset / Floating）。
- 新可点击元素必须接入统一按压反馈规则。
- 涉及核心操作的新强调色使用，先评估是否可复用 `--accent`。
- 变更后至少检查：header、messages、composer、dialogs 四区视觉一致性。

## 验收清单
- 页面背景与主要组件保持同色调。
- 关键操作可被主色快速识别，但整体对比不过激。
- 按压交互均有阴影反转反馈。
- 移动端与 reduced-motion 分支无明显回归。
