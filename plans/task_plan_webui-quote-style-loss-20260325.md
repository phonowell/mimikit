# task_plan_webui_quote_style_loss_20260325

## 类型
implementation

## 背景
修复 WebUI 中点击 message quote 按钮后，composer 上方 quoted preview 样式丢失的问题。要求在独立 worktree 内完成最小修复、静态验证、review 门禁和闭环收尾。

## 计划
- [completed] 1. 锁定根因：确认 quote preview 组件的状态类与角色属性是否缺失，核对对应 CSS 选择器。
- [completed] 2. 实施修复：在 `webui-src/components/Composer.tsx` 和必要的上层传参处补齐展示态与角色态。
- [completed] 3. 生成产物：运行 webui 构建，确保 `webui/generated/**` 与源码一致。
- [completed] 4. 质量门禁：按 code-reviewer 流程复核 diff，补齐任何阻塞问题并执行最小验证。
- [in_progress] 5. 闭环收尾：合并回主分支，清理 worktree / 临时分支，记录归档与证据。

## 风险
- 仅修样式态可能掩盖更深的渲染问题，所以需要同步核对 `quote.role` 传递链。
- `webui/generated/app.js` 是构建产物，必须与源码同步，避免提交半成品。

## 验证
- 代码审查确认 `quote-preview` 在有 quote 时进入可见态。
- 代码审查确认 `data-role` 继续驱动角色色彩变体。
- `pnpm build:webui` 成功，生成产物与源码一致。
