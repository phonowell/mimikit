# Provider 拆仓前一阶段隔离设计

> 返回 [系统设计总览](../README.md)

## 目标

- 为后续 provider 拆仓做准备，不改变当前行为与外部接口。
- 将 provider 层收敛为可独立迁移的边界，降低主仓复杂度。
- 保持 manager/worker 仅依赖 provider 公共契约，不感知 provider 内部实现细节。

## 阶段边界

本阶段只做隔离与设计，不做仓库拆分与发布：

- 保留当前注册的 provider：`codex-sdk`、`openai-responses`。
- 保留调用入口：`runWithProvider()`。
- 保留现有 request/result/error 契约，不引入兼容层。

## 目标结构

provider 层内聚到 `src/execution/providers`，形成可迁移最小闭环：

- provider 契约：`types.ts`、`token-usage.ts`
- provider 运行时：`registry.ts`、`provider-runtime.ts`、`provider-error.ts`
- provider 基础工具：`utils.ts`、`thread-id.ts`、`safe.ts`、`fs.ts`、`log.ts`
- provider 实现：`codex-sdk-provider.ts`、`openai-responses-provider.ts`

## 已完成的隔离动作（phase1）

1. 将 provider 对 `shared` 的直接依赖收敛到 provider 内部模块：
   - thread id 能力迁入 `src/execution/providers/thread-id.ts`
   - usage normalize 与 id/stripUndefined 能力迁入 `src/execution/providers/utils.ts`
2. 将 provider 对 `types` 的耦合收敛：
   - provider 层 token usage 类型独立为 `src/execution/providers/token-usage.ts`
3. 将 provider 配置读取与日志写入所需的最小能力收敛到 provider 内：
   - `src/execution/providers/fs.ts`
   - `src/execution/providers/log.ts`
   - `src/execution/providers/safe.ts`
4. 更新调用侧引用：
   - `worker` / `manager` 的 provider-thread-id 读取统一改为 `src/execution/providers/thread-id.ts`

## 非目标（本阶段不做）

- 不拆分 npm 包与发布流程。
- 不改造 manager/worker 的业务流程。
- 不新增 provider 路由策略。

## 验证基线

- `pnpm lint`
- provider 相关回归测试（含 `openai-responses`、`worker loop`、`manager provider call`）

## 下一阶段（拆仓）输入条件

满足以下条件即可进入拆仓阶段：

1. `src/execution/providers` 不再反向依赖 `src/foundation/shared` 与 `src/foundation/types`。
2. provider 契约具备独立版本化基础（`types/request/result/error` 稳定）。
3. 主仓仅通过 provider 公共入口交互（而非依赖 provider 内部细节）。
