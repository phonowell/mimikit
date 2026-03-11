# task_plan_webui_no_framework_engineering_20260311

- type: implementation
- status: completed
- scope: main 分支问题5【WebUI 无框架但自研框架化】

## 能力评估
- 已使用 `brainstorming`：任务目标已固定，先做现状扫描与两条路线收敛，再落最小首刀，避免先引入新抽象。
- 已使用 `writing-plans`：按仓库规则写入 `plans/`，持续更新执行进展，不额外引入 `docs/plans/`。
- 已执行 `review-code-changes` 门禁：通过 `pnpm run review-code-changes` 复跑 `lint` / `type-check` / `test`。
- 继续维持原生 `html/css/js`：`webui/AGENTS.md` 明确禁止新增前端框架与构建链。

## 组织成本点
- `webui/index.html:25` 在单个页面骨架里同时承载顶部工具栏、消息区、choice panel、输入区、delete mode、plans/tasks/focuses 对话框与 restart/reset/delete 确认框；`webui/app-elements.js:3` 以 50+ 个 selector 把这些节点暴露给脚本层，模块边界主要靠 DOM 契约而非组件边界维持。
- `webui/layout.css:26`、`webui/layout.css:46`、`webui/layout.css:67`、`webui/layout.css:77`、`webui/layout.css:367` 对 7 类 dialog 重复声明 open/closing/backdrop/reduced-motion 规则；同一文件还混放页面布局、菜单、toast、消息容器、composer、delete-mode 和移动端响应式，形成 450 行的复合样式入口。
- `webui/messages/controller.js:23` 作为消息区总装配器，同时连接 scroll、loading、quote、delete dialog、payload、queue、SSE、send、status、time tick；虽然已有 `controller-payload` / `controller-sse` / `controller-queue`，但视图状态与副作用之前仍滞留在主控制器中。
- `webui/choice.js:41` 通过 `onPanelVisibilityWillChange` / `onPanelVisibilityDidChange` 把 choice panel 布局副作用反向抛给 messages controller，`webui/delete-mode.js:44` 则在外层维护 delete mode UI 开关；事件流跨文件往返，导致“谁拥有消息视图状态”不够清晰。

## 路线结论
- 路线 A（推荐，当前执行）：继续无框架，但补齐最小工程化约定——`index.html` 只保留稳定 DOM 契约，新增逻辑优先下沉到功能模块；控制器只做装配，局部视图状态单独成模块；事件流保持“快照/输入 -> 状态 -> 渲染/副作用”的单向约束。
- 路线 A 的最低约定：页面模块只读自己声明的 DOM；局部状态只允许一个 owner；渲染函数不直接读取全局状态；副作用入口统一挂在 controller/bind 层，不把 `classList/style/scroll` 操作散落到 payload/render 模块。
- 路线 B（仅设门槛，不立即引入）：只有当出现跨面板共享响应式状态、同一状态需要 3 处以上手动重渲染、或 imperative DOM 编排已经让回归测试必须依赖整页交互时，才评估 Preact/Alpine 一类轻量框架。
- 路线 B 的判定门槛：① messages/tasks/plans/focus 至少出现一类跨视图共享 UI 状态；② 同一状态至少有两个以上写入口和两个以上 DOM 更新点；③ 模块级测试已不足以覆盖回归，必须频繁写浏览器级用例。

## 首刀落地
- 新增 `webui/messages/controller-view-state.js`：收拢 choice panel 布局位移、delete mode 状态切换、time tick 触发的消息时间重渲染，形成消息视图状态的单一 owner。
- 更新 `webui/messages/controller.js`：仅保留模块装配与跨模块连线，对外暴露的 delete mode / layout shift 接口全部改由 `viewState` 提供；当前文件降到 193 行，回到仓库 200 行阈值内。
- 新增 `tests/controller-view-state.test.ts`：覆盖布局位移吸底保持、delete mode 切换清 quote 与重渲染，锁住本次拆分的最小稳定契约。

## 验收步骤
- 自动验证：`pnpm vitest run tests/controller-view-state.test.ts`
- 仓库检查：`pnpm run lint`、`pnpm run type-check`、`pnpm run test`、`pnpm run review-code-changes`
- 手动验收 1：运行 `tsx src/cli/index.ts --port 8787`，打开 WebUI，确认消息列表可正常渲染与滚动。
- 手动验收 2：进入/退出 delete mode，确认输入区与退出条切换正常，进入 delete mode 时 quote 预览被清空。
- 手动验收 3：触发 choice panel 显示/隐藏，若消息列表原本贴底，布局变化后仍保持贴底；若原本未贴底，不强制跳到底部。
- 手动验收 4：切换 Tasks / Plans / Focus 面板，确认本次消息区拆分未影响其他面板交互。

## Commit 信息
- branch: main
- message: refactor: isolate webui message view state
- scope: selective add，仅包含本任务 4 个文件，未带入当前工作区中未归属本任务的 docs 改动。
- note: 最终 commit hash 仅在会话输出中记录，避免在归档文件里写入自指 hash。

## 执行更新
- 2026-03-11：已读取外置任务、根级规则与 `webui/AGENTS.md`，确认本轮只允许原生 `html/css/js` 方案。
- 2026-03-11：已确认问题样本：`webui/index.html` 417 行、`webui/layout.css` 450 行、拆分前 `webui/messages/controller.js` 233 行；主成本集中在 DOM 契约、样式职责与消息控制器视图状态混杂。
- 2026-03-11：已落地 `controller-view-state` 首刀，并补充 `tests/controller-view-state.test.ts`。
- 2026-03-11：已完成 `pnpm run lint`、`pnpm run type-check`、`pnpm run test`、`pnpm run review-code-changes`。
