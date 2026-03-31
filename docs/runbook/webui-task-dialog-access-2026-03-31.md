# WebUI Task Dialog Access Review · 2026-03-31

## 当前缺口

- tasks 弹窗原先无法直接看出任务是 `read` 还是 `write`。
- write 任务即使已经绑定 worktree/branch，卡片上也看不出写入落点，用户难以快速判断边界与 merge 风险。

## 候选字段取舍

- 保留：
  - `resourceMode` → 常态展示为 `read-only` / `writable`
  - `git.branch` → 仅对 write + git 任务展示
- 不保留：
  - `git.worktreePath` → 路径噪音过高，不适合常态卡片
  - `provider` → 与边界/风险关联弱，且已有测试约束不常态展示
  - `traceRef` / `archivePath` → 更适合作为排障入口，不应挤占主信息流

## 实施结果

- `webui-src/components/TaskMeta.tsx`
  - 新增 access badge
  - write 任务存在 `git.branch` 时追加 branch chip
- `webui-src/types.ts`
  - 对齐真实 snapshot，补齐 `resourceMode`、`git`、`gitClosure.review`
- `webui/components-dialogs-panels-shared.css`
  - 为 access/branch chip 增加最小样式
- 顺手修正一处真实链路偏差：
  - read-model 输出的 `gitClosure` 是 `review.passed` 结构
  - 前端类型与组件此前错误消费为 `reviewPassed`
  - 本次已对齐为真实字段，避免 review badge 失效

## 自评审

- 只消费现有 snapshot 字段，没有新增后端协议、投影或持久化结构。
- 只增加两类高价值信息，没有把 tasks 弹窗扩成调试面板。
- 额外修复的 `gitClosure` 类型偏差属于本次真实数据链路核验的一部分，ROI 明确且改动很小。

## 验证

- `pnpm vitest run tests/webui-react-task-meta.test.ts tests/webui-react-task-list-item.test.ts tests/webui-react-tasks-dialog.test.ts`
- `pnpm review-code-changes`

## Git 闭环

- feature commit: `9a7bd74a` `Improve task dialog access metadata`
- 合入方式：`main` 上 `git merge --ff-only task/webui-tasks-aafc2984de`
- 后续：本文件提交后再次执行质量门禁并完成最终 merge/cleanup
