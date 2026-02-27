# manager ROI 重聚焦执行记录（2026-02-27）

## 目标范围

- 仅执行：`A1/A2/A3/B1/B3/C`
- 明确排除：`B2`（多 provider fallback）
- 策略：全量替换，不保留兼容层

## 已落地变更

### A1. Action Registry 单源化

- 新增：`src/manager/action-registry.ts`
- 新增：`src/manager/action-validation.ts`
- 替换：
  - `src/manager/action-apply.ts` 改为从 registry 分发
  - `src/manager/action-feedback-collect.ts` 直接从 registry 读取注册与校验
- 效果：action 名称、validate、apply 不再分散三处维护

### A2. 删除 runManagerBatchOnce 中间层

- 删除：`src/manager/loop-batch-run-once.ts`
- 变更：`src/manager/loop-batch-run-manager.ts` 直接调用 manager runner

### A3. manager LLM 调用入口统一

- 新增：`src/manager/manager-llm-call.ts`
- 复用：`runManager` 与 `compress_context` 共用预算+超时+调用入口

### B1. manager 修正轮次硬上限

- 配置新增：`manager.maxCorrectionRounds`
- 文件：
  - `config/default.yaml`
  - `src/config-default-loader.ts`
  - `src/config.ts`
- 运行时行为：超过轮次上限后返回 best-effort 文本，并写入系统事件 `manager_round_limit`

### B3. 上下文超限自动压缩重试

- 新增能力：`runManagerRoundWithRecovery` 在 context/token 类错误时自动触发一次 `compressManagerContext` 后重试
- 文件：
  - `src/manager/loop-batch-manager-call.ts`
  - `src/manager/action-apply-runtime.ts`

### C. wake profile 轻量注入

- 新增字段：`ManagerEnv.wakeProfile`
- 生成位置：`src/manager/loop-batch-manager-call.ts`
- 注入位置：`src/prompts/format.ts`（`wake_profile`）
- Prompt 规则：`prompts/manager/system.md` 增加 wake 策略段

## 同步文档

- `docs/design/architecture/system-architecture.md`
- `docs/design/workflow/task-and-action.md`
- `docs/todo/engineering-roi-backlog.md`

## 当前状态

- `B2` 未做（按需求排除）
- 其余目标已全部执行
- 验证结果：`pnpm run type-check` ✓，`pnpm run test` ✓
