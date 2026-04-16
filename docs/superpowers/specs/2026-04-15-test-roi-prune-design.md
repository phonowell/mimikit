# Test ROI Prune Design

## Goal

在不削弱主线回归价值的前提下，按 ROI 清理至少 `30%` 的测试用例，并把“测试不得产生实际费用”从约定变成硬门禁。

## Current State

- 当前基线约 `460` 个 `test(...)` 用例。
- 仓库中低 ROI 测试主要集中在三类：
  - `webui` 静态渲染/格式化/标签断言
  - `prompt/reply` 字面文案与模板拼字断言
  - `memory` 一类辅助写入的细碎 guard 文案测试
- 当前 `vitest` 没有统一 setup，默认并未硬性阻断外网或真实 API key。

## Decision

本轮采用“硬裁剪 + 最小门禁补强”：

1. 直接删除低 ROI 测试文件，而不是把低价值断言搬到别处
2. 保留核心高价值测试：
   - manager 主状态机 / intent-evidence / write lane / runtime follow-up
   - worker / orchestrator / cli / archive / integration 主路径
3. 新增统一测试环境门禁：
   - 清空常见真实 provider API key
   - 阻断外部 `fetch`
   - 只允许 `localhost/127.0.0.1/::1` 这类本地回环请求

## Why This Approach

- 相比“逐文件微调合并”，直接删除低 ROI 文件更稳、更快，也更符合仓库“删除优于保留”的规则。
- 相比“保留 UI/prompt 拼字测试再慢慢改”，这轮目标是整体减负和提 ROI，不是润色旧测试。
- 真正需要保护的，是状态变化、对象归属、授权门禁、续跑路径与端到端主链，不是文案或 DOM 片段。

## Prune Scope

优先删除：

- `tests/webui-*.test.ts`
- `tests/*prompt*.test.ts`
- `tests/*reply*.test.ts`
- `tests/task-results-archive.test.ts`
- `tests/focus-result-feedback.test.ts`
- `tests/manager-task-control-feedback.test.ts`
- `tests/manager-task-contract-validation.test.ts`
- `tests/manager-loop-helpers.test.ts`
- `tests/manager-correction-clarify-evidence.test.ts`
- `tests/manager-correction-clarify-replies.test.ts`
- `tests/manager-correction-intent-evidence-followup.test.ts`
- `tests/manager-task-result-closure-pending.test.ts`
- `tests/manager-remember-memory-guard.test.ts`
- `tests/manager-project-profile-guard.test.ts`
- `tests/manager-enqueue-task-guard.test.ts`

## Acceptance

- `test(...)` 总数从约 `460` 降到 `<=322`
- 保留的回归仍覆盖 manager 主线、runtime 主线、worker 主线与 CLI / HTTP 核心闭环
- 测试环境默认禁止外部网络和真实 provider 凭证
- `pnpm run review-code-changes` 通过
