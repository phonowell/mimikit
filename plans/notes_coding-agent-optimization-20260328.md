# Notes: coding-agent-optimization-20260328

## 当前事实

- 调研归档将 `repo-local 执行合同`、`handoff-first`、`显式 runtime 权限合同`、`review gate` 判为近期最值得借鉴的四个方向。
- 当前 worker system prompt 已强调证据优先级与 handoff 协议，但未显式写出当前任务的 `resource_mode`、worktree/root、branch 或写边界。
- manager state payload 已保留 `resource_mode` 与 `git.worktree_path/branch`，说明运行时事实已经存在，只是没有稳定传给 worker。

## 选择判断

- 本轮不扩 manager schema，不新增自治档位。
- 本轮只把已有运行时事实收敛成 worker 可见的显式合同。
- 这属于“收紧边界表达”，不是“新增能力”。

## 实施后检查

- `buildWorkerPrompt` 现在会注入 `runtime_contract`，但仍保留原有 `M:prompt` / `M:focus_brief` / `M:resume_instruction` 顺序。
- read-only 与 worktree 写任务都已有直接测试覆盖。
- `pnpm review-code-changes` 已通过；未见新增类型或 lint 阻塞。
