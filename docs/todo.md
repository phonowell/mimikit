# 重构方案（一次性全量版）

## 决策声明（硬约束）
- 本次重构采用一次性全量实现（Big Bang）。
- 不考虑旧代码兼容：不保留旧多角色链路与旧队列字段兼容层。
- 不做双写、不做迁移开关、不做灰度分流。
- 目标是一次到位交付最终形态：`manager / evolver / worker`。

## 目标角色
- `manager`：直接面向用户，负责意图理解、任务编排、结果复述。
- `evolver`：仅在空闲时运行，负责用户画像与人格演进更新。
- `worker`：执行任务。

## worker 层级

### standard
- 使用 `runWithProvider(provider='openai-chat')`。
- 低成本，多轮工具交互。

### specialist
- 使用 `runWithProvider(provider='codex-sdk')`。
- 高能力，处理复杂任务。

## 目标文件系统（最终态）
- `inputs`：待消费用户输入队列；消费后写入 `history`。
- `history`：对话历史（用户与 assistant）。
- `results`：待消费任务结果队列；消费后写入 `tasks`。
- `tasks`：任务记录（含状态流与归档）。
- `user_profile.md`：用户画像。
- `agent_persona.md`：人格配置与版本。

## 数据流（最终态）
1. 用户输入进入 `inputs`。
2. `manager` 消费 `inputs`，结合 `history` 判断意图。
3. `manager` 派发/取消任务给 `worker`。
4. `worker` 执行后把结果写入 `results`。
5. `manager` 消费 `results`，更新 `tasks` 并对用户回复。
6. `evolver` 在空闲窗口消费 `history/tasks`，更新 `agent_persona.md/user_profile.md`。

## manager 工作流
- 监听 `inputs/results`，有新数据即唤醒。
- 先读 `inputs/history`，再读 `results/tasks`。
- 规则：
  - 需要新任务：`@create_task`
  - 意图改变且旧任务失效：`@cancel_task`
  - 任务进行中：等待并保持上下文
  - 任务完成：复述结果并决策下一步

## evolver 工作流
- 仅在 `manager` 空闲阈值满足时触发。
- 从 `history` 提取用户偏好与近期主题，更新 `user_profile.md`。
- 从 `tasks` 与交互结果提炼策略，更新 `agent_persona.md`（版本化 + 可审计）。
- 使用 `prompts/evolver/system.md` + `prompts/evolver/injection.md` 作为唯一模板入口。

## 实施要求（一次发布内完成）
- 同一版本中完成重构并替换旧架构入口。
- 同一版本中完成数据结构迁移与文档更新。
- 验收标准：输入 → 派单 → 执行 → 结果消费 → 用户回复 全链路通过。
- 最低验证：`pnpm -s type-check`。
