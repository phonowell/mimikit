# Evolver 工作流（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/evolver/loop.ts`

## 触发条件
- 必须满足“系统空闲”：
  - `managerRunning=false`
  - 无运行中任务
  - 无 pending 任务
  - `inflightInputs` 为空
- 空闲时长达到 `evolver.idleThresholdMs`。
- 与上次执行间隔达到 `evolver.minIntervalMs`。

## 每轮动作
1. 追加 `feedback.md`：任务状态统计与高时延/高 usage 汇总。
2. 追加 `user_profile.md`：近期用户消息摘要。
3. 追加 `agent_persona.md`：当前人格策略更新块。
4. 写入 `agent_persona_versions/{timestamp}.md` 快照。
5. 记录 `evolver_end` 日志。

## 失败语义
- 任一写入失败不会中断主系统。
- 失败会写 `evolver_end` error 日志。

## 默认参数（evolver）
- `pollMs=2000`
- `idleThresholdMs=60000`
- `minIntervalMs=300000`
