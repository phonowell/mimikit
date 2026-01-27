# task_plan_subprocess-concurrency

## 目标
- 将 `maxWorkers` 默认值调整为 5（仍可通过配置/环境变量覆盖）。

## 阶段
1. 创建新 worktree（按新功能规则执行）。
2. `src/config.ts`：将 `maxWorkers` 默认值从 2 调整为 5。
3. `tests/config-max-workers.test.ts` + `package.json`：新增最小测试验证默认值与 env 覆盖。
4. `docs/minimal-architecture.md`：如需，补充默认值说明。

## 决策
- 采用仅默认值=5，不做硬上限。

## 错误
- 无

## 状态
- 进度 4/4
- 备注：第 4 步确认无需执行（现有文档未描述默认值）。
