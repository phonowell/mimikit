# 迁移计划：将 Manager 层迁移至 OpenCode

## 背景与动机

当前架构中，mimikit 自行实现了完整的 manager 层，负责对话轮询、prompt 构建、动作解析等通用能力。这些功能与 OpenCode 的核心能力高度重叠。为践行"开箱即用、不造轮子"的设计理念，应将 manager 层迁移至 OpenCode，让 mimikit 专注于其独特的任务执行和调度能力。

## 核心理念

### 1. 能力边界重新划分

**OpenCode 负责（上层）：**

- 对话生命周期管理
- 上下文窗口维护
- 意图理解与工具调用决策
- 流式响应输出
- 错误恢复与降级

**mimikit 负责（下层）：**

- 任务队列持久化与状态管理
- Worker 执行调度（standard/specialist 双档）
- 定时任务（Cron）管理
- WebUI 服务与状态可视化

### 2. 单一主 Session 的贯彻

迁移后，OpenCode 的 session 即等同于 mimikit 的 session，无需再维护独立的对话状态。所有用户交互通过 OpenCode 的 session 进行，mimikit 作为工具提供方被调用。

### 3. 渐进式迁移策略

不一次性重写，而是逐步替换：

1. 先定义工具接口契约
2. 并行运行验证稳定性
3. 最后移除冗余代码

## 架构变化

### 当前架构

```
用户输入 → Manager Loop → 构建 Prompt → LLM → 解析动作 → 创建任务
                                                    ↓
                                              Worker 执行
```

### 目标架构

```
用户输入 → OpenCode Session → 工具调用决策 → mimikit 工具层
                                                  ↓
                                           任务队列/Worker/Cron
```

关键变化：manager 的"轮询-构建-调用-解析"循环被 OpenCode 的内置机制替代，mimikit 退化为纯执行层。

## 保留的核心能力

以下能力 OpenCode 不具备，必须在 mimikit 层保留：

1. **任务队列系统**
   - 持久化存储（queues.jsonl）
   - 任务生命周期管理（pending/running/completed/failed）
   - Worker 并发控制

2. **Worker 调度**
   - standard/specialist 双档区分
   - 超时控制
   - 重试机制

3. **Cron 定时调度**
   - 定时任务触发
   - 任务依赖管理

4. **WebUI**
   - 任务状态可视化
   - 实时流输出展示
   - 手动任务干预

## 移除的冗余能力

以下能力 OpenCode 已提供，mimikit 无需再维护：

- 对话轮询与输入消费
- Prompt 上下文构建
- LLM 调用与 fallback 逻辑
- 动作解析与路由
- Session 状态管理

## 预期收益

1. **代码规模缩减**：预计减少约 1000 行自研代码，更接近万行上限目标
2. **维护成本降低**：通用对话逻辑由 OpenCode 维护
3. **能力对齐**：自动获得 OpenCode 的模型切换、流式输出、错误处理等能力
4. **架构更清晰**：单一职责，mimikit 专注"执行"，OpenCode 专注"编排"

## 风险提示

1. **时序依赖**：当前 manager 对任务完成的时机有精细控制，迁移后需确保 OpenCode 的工具调用等待机制能满足需求
2. **状态一致性**：需确保 OpenCode session 状态与 mimikit 任务队列状态同步
3. **WebUI 集成**：流式输出需适配 OpenCode 的 WebSocket 格式

## 下一步行动

1. 详细定义 mimikit 作为 OpenCode agent 的接口契约
2. 设计工具（tool）的定义和实现策略
3. 制定并行运行和回滚方案
4. 规划代码删除范围

---

_更新时间：2026-02-14_
