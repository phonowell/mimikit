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

## 规范依据（摘要）
- 新态拟物仅适合少层级（建议 2-3 层），并要求统一光源方向。
- 阴影必须承载语义层级（surface / well / pressed），不能仅作装饰。
- 凹陷态应限于“槽位和交互瞬时状态”，不应泛化到信息卡片。
- 文本和控件对比度必须满足可读性基线（WCAG）。
- 阴影展示需避免被父容器 `overflow` 裁剪。
- 参考链接：
- https://css-tricks.com/neumorphism-and-css/
- https://idevie.com/design/ui/what-is-neumorphism-is-it-all-about-soft-ui
- https://m3.material.io/styles/elevation/overview
- https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

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
- 色彩 token：`--bg` `--panel` `--panel-soft` `--panel-strong` `--well-bg` `--text` `--muted`。
- 语义色 token：`--accent` `--success` `--warning` `--danger`。
- 状态色 token：`--status-running` `--status-success` `--status-fail` 等。
- 阴影 token：`--shadow-raised` `--shadow-raised-soft` `--shadow-inset` `--shadow-inset-soft` `--shadow-floating` `--shadow-dialog`。
- 形状 token：`--radius` `--radius-sm`。
- 焦点 token：`--focus-ring`。

## 层级语法（必须遵循）
- 凸起层（Raised）：卡片、面板、默认按钮。
- 使用：`--shadow-raised` 或 `--shadow-raised-soft`。
- 凹陷层（Inset）：输入区、列表槽位、按压态。
- 使用：`--shadow-inset` 或 `--shadow-inset-soft`。
- 浮动层（Floating）：悬浮快捷按钮。
- 使用：`--shadow-floating`。
- 凹陷白名单（当前实现）：
- `.tasks-list`
- `.composer textarea`
- 交互按压态（`:active` / `[aria-pressed='true']`）
- 禁止凹陷的常规信息区：
- 消息气泡主体
- 元信息胶囊（如 origin / task profile）
- 引用预览显示态

## 组件规范
- 按钮（`.btn`）
- 默认态：凸起阴影；`hover` 增强凸起。
- 按压态：`:active` / `[aria-pressed='true']` / `.is-pressed` 必须切换凹陷阴影并轻微位移。
- 变体：
- `btn--primary` 仅用于关键提交动作。
- `btn--danger` 仅用于破坏性操作。
- `btn--icon-muted` 用于次级图标动作。
- 消息（`.message article`）
- 三类消息气泡使用极轻微凸起（micro raised），保持轻质感但不夸张。
- 三类消息气泡底色需避开近白亮度区，避免左上高光导致边界发虚。
- `user`：使用 `--bubble-user-bg`，用于轻强调。
- `agent`：保持中性面板色。
- `system`：使用 `--bubble-system-bg` 区分系统提示。
- 引用块（`.message-quote` / `.quote-preview`）
- 必须包含竖向角色条（`--quote-bar`）+ 轻量背景。
- 角色只改语义色，不改结构与层级语法。
- `.quote-preview.is-visible` 使用凸起层，不使用凹陷层。
- `.message-quote` 与 `.quote-preview` 使用弱化凸起阴影，避免喧宾夺主。
- `.message-quote-btn` 保持凹凸按压反馈，不随气泡平面化被移除。
- 任务面板（`.tasks-*`）
- 列表槽位为凹陷层，任务项为凸起层。
- 可点击任务链接需要按压反馈（阴影反转）。
- `task-profile` 归类为信息标签，保持平面/轻凸起，不使用 inset。

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

## 变更记录（2026-02-12）
- 调整阴影深度：整体降强度，减少“塌陷感”和脏边缘。
- 引入 `--well-bg`，统一凹陷槽位底色（消息列表/任务列表/输入框）。
- 收敛凹陷语义：仅保留槽位、输入框和按压态；去除信息胶囊凹陷。
- 按压位移由 `1px` 下调到 `0.5px`，触觉反馈更自然。
- 解决 dialog 阴影裁剪问题：dialog 容器使用 `overflow: visible` 并留出内边距。
- 视觉微调（二）：输入框边框降为 `--border-hairline`，消息纵向间距调至 `14px`。
- 视觉微调（二）：dialog 面板改用 `--shadow-dialog`，降低半透明背景上的高光突兀感。
- 视觉微调（二）：`status-dot` 增加凸起高光/暗影，提升质感与可辨识度。
- 视觉微调（三）：新增 `--bubble-agent-bg / --bubble-user-bg / --bubble-system-bg`，拉大三类消息气泡差分。
- 视觉微调（四）：消息气泡改为平面样式（去除气泡阴影），保留引用块和引用按钮的凹凸反馈。
- 视觉微调（五）：消息气泡改为“极轻微凹陷”，在不恢复重凹凸的前提下增加质感。
- 视觉微调（六）：消息气泡从“极轻微凹陷”切换为“极轻微凸起”，并下调引用块的阴影突出度。
- 视觉微调（七）：`agent` 气泡弱化左上高光并增加细内描边，修复左上边界发虚问题。
- 视觉微调（八）：移除 `agent` 细描边，统一所有气泡为更轻的 micro raised；引用块/引用预览再降一档突出强度。
- 视觉微调（九）：全局高光/暗影切换为更明显暖橙色调，并统一消息气泡、引用块、引用预览的局部阴影为同一暖橙语义。
- 视觉微调（十）：回滚暖橙阴影方案，恢复白色高光 + 中性灰影的全局阴影语义。
- 视觉微调（十一）：三类气泡底色整体下调亮度（避开近白高光模糊），输入框降为轻微凹陷并继续弱化边框。
- 视觉微调（十二）：进一步拉开三类气泡与 `--well-bg` 的亮度差，增强消息区块可分辨性。
- 视觉微调（十三）：全局色板由灰蓝转为暖中性（背景/面板/边框/阴影深色端与气泡 token 同步去蓝化）。
- 视觉微调（十四）：暖中性继续收敛为“淡鹅黄色”低饱和基底，阴影深色端提亮以消除咖啡色厚重感。
- 视觉微调（十五）：整体改为“近白晶莹”中性灰基调（背景/面板/边框/阴影与气泡同步去暖化、去棕化）。
- 视觉微调（十六）：色温再向冷中性微调，并将输入框凹陷降为 micro inset（更弱边框 + 更浅内阴影）。
- 视觉微调（十七）：输入框移除边框仅保留轻微凹陷；messages 内部凹陷去除，避免外凸后立刻内凹的层级冲突。

## 验收清单
- 页面背景与主要组件保持同色调。
- 关键操作可被主色快速识别，但整体对比不过激。
- 按压交互均有阴影反转反馈。
- 移动端与 reduced-motion 分支无明显回归。
