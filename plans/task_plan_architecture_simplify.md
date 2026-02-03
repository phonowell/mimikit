# 架构简化重构计划

## 背景

当前 mimikit 采用 Teller + Thinker + Worker 三角色架构，通过 jsonl 文件通信。由于 Teller 已改用 API 调用而非本地小模型，双层设计带来的复杂度不再值得。参考 nanobot 的单体设计，进行架构简化。

## 目标

- 将 Teller + Thinker 合并为 **Manager**
- 简化任务系统，去除未使用的复杂调度功能
- 用内存队列替代文件通信
- 精简代码量：~3500 行 → ~2000 行

## 执行进度

- [x] 阶段一：架构合并
- [x] 阶段二：任务系统简化
- [x] 阶段三：依赖与工具简化
- [x] 阶段四：WebUI 简化
- [x] 阶段五：文档与配置更新

---

## 阶段一：架构合并

### 1.1 角色合并：Teller + Thinker → Manager

**原则**：Manager 直接面向用户，负责回复 + 理解意图 + 派发任务

**删除**：
- `src/supervisor/teller.ts`
- `src/supervisor/thinker.ts`
- `prompts/agents/teller/`
- `prompts/agents/thinker/`

**新增**：
- `src/supervisor/manager.ts` — 合并两者逻辑
- `prompts/agents/manager/system.md` — 统一 prompt

**修改**：
- `src/supervisor/supervisor.ts` — 从三循环改为双循环（Manager + Worker）

### 1.2 删除角色间通信层

**删除文件**：
- `src/storage/user-inputs.ts`
- `src/storage/teller-notices.ts`
- `src/storage/thinker-state.ts`
- `src/types/user-input.ts`
- `src/types/teller-notice.ts`
- `src/types/thinker-state.ts`

**删除状态目录结构**：
- `.mimikit/user-inputs.jsonl`
- `.mimikit/teller-notices.jsonl`
- `.mimikit/thinker-state.json`

### 1.3 删除 MIMIKIT 命令协议（大部分）

**删除命令**：
- `record_input` — 不再需要 Teller 记录输入
- `notify_teller` — 不再需要跨角色通知
- `update_state` — 不再需要 Thinker 状态
- `cancel_task` / `update_task` — 简化后不需要

**保留或简化**：
- `dispatch_worker` — 可改为内部函数调用，或用 OpenAI function calling

**修改**：
- `src/commands/parser.ts` — 大幅简化或删除
- `src/commands/executor.ts` — 大幅简化或删除

---

## 阶段二：任务系统简化

### 2.1 简化任务结构

**删除字段**：
- `priority` — 改为 FIFO
- `blockedBy` — 不再支持依赖
- `scheduledAt` — 不再支持定时

**简化状态**：
- 从 6 种 (`queued`/`running`/`done`/`failed`/`cancelled`/`timeout`)
- 简化为 2 种：`pending` / `done`

**新结构**：
```typescript
type Task = {
  id: string
  prompt: string
  status: 'pending' | 'done'
  createdAt: string
}
```

### 2.2 文件队列 → 内存队列

**删除**：
- `agent-queue/` 目录机制
- `agent-results/` 目录机制
- `src/storage/tasks.ts` 的文件操作
- `src/storage/task-results.ts`

**新增**：
- 内存任务队列（数组或 Map）
- 任务完成回调机制

**原则**：
- Manager 派发任务后不阻塞
- Worker 执行完通过回调通知 Manager
- 崩溃丢失未完成任务是可接受的

### 2.3 简化调度逻辑

**删除**：
- `src/tasks/pick.ts` — 复杂调度逻辑

**替换为**：简单的 FIFO 取任务

---

## 阶段三：依赖与工具简化

### 3.1 LLM 调用简化

**修改** `src/llm/api-runner.ts`：
- 删除 responses API 路径
- 删除 schema/structured output 支持
- 删除 reasoning effort 回退逻辑
- 只保留 `chat/completions` 调用

**目标**：270 行 → ~60 行

### 3.2 日志系统（可选）

**方案 A**：用 `pino` + `pino-roll` 替代
- 删除 `src/log/append.ts`（154 行）

**方案 B**：保留现有实现
- 代码量不大，无外部依赖

**建议**：方案 B，保持简单

### 3.3 删除文件锁

**删除**：
- `src/storage/store-lock.ts`
- `src/storage/instance-lock.ts`

**原因**：内存队列 + 单进程不需要文件锁

### 3.4 Prompt 构建简化

**修改** `src/roles/prompt.ts`：
- 删除 `buildTellerPrompt`
- 删除 `buildThinkerPrompt`
- 删除 `formatInputs`、`formatNotices`、`formatQueueStatus`
- 新增 `buildManagerPrompt`
- 保留 `buildWorkerPrompt`

---

## 阶段四：WebUI 简化

### 4.1 删除 Thinker 状态显示

**修改** `src/webui/index.html`：
- 删除 `data-thinker-status` 相关元素

**修改** 相关 JS：
- 删除 Thinker 状态轮询和渲染

### 4.2 简化任务面板

**修改** `src/webui/tasks.js`：
- 删除 `priority` 显示
- 删除 `scheduledAt` 显示
- 删除 `blockedBy` 显示
- 简化状态计数为 pending / done

**修改** `src/webui/components.css`：
- 删除相关样式

---

## 阶段五：文档与配置更新

### 5.1 更新设计文档

**修改**：
- `docs/design/README.md` — 更新为双角色架构
- `docs/design/overview.md` — 更新组件和流程
- `docs/design/supervisor.md` — 更新为双循环
- `docs/design/task-system.md` — 简化任务描述
- `docs/design/task-data.md` — 更新数据结构
- `docs/design/commands.md` — 删除或大幅简化
- `docs/design/state-directory.md` — 更新目录结构

### 5.2 更新 CLAUDE.md

**修改**：
- 删除 `src/memory/` 引用（从未实现）
- 更新目录结构说明
- 更新角色说明

### 5.3 更新配置

**修改** `src/config.ts`：
- `teller` 配置 → `manager` 配置
- 删除 Thinker 相关配置

**修改** CLI 环境变量：
- `MIMIKIT_TELLER_MODEL` → `MIMIKIT_MODEL`

---

## 简化后的状态目录

```
.mimikit/
├── history.jsonl    # 会话历史
└── log.jsonl        # 日志
```

---

## 简化后的代码结构

```
src/
├── cli.ts
├── config.ts
├── supervisor/
│   ├── supervisor.ts    # 双循环：Manager + Worker
│   ├── manager.ts       # 合并后的角色
│   └── worker.ts
├── roles/
│   ├── runner.ts
│   └── prompt.ts        # buildManagerPrompt + buildWorkerPrompt
├── llm/
│   ├── openai.ts
│   └── api-runner.ts    # 精简版
├── storage/
│   ├── dir.ts
│   ├── jsonl.ts
│   └── history.ts
├── http/
│   └── ...              # 基本保持不变
├── webui/
│   └── ...              # 简化版
└── ...
```

---

## 执行顺序建议

1. **阶段一** 优先 — 架构合并是核心变更
2. **阶段二** 紧随 — 任务系统与架构强相关
3. **阶段三** 可并行 — 各项独立
4. **阶段四** 依赖阶段一二 — UI 跟随后端变化
5. **阶段五** 最后 — 文档收尾

---

## 验收标准

- [ ] 只有 Manager + Worker 两个角色
- [ ] 无 jsonl 文件通信，使用内存队列
- [ ] 任务只有 pending / done 两种状态
- [ ] WebUI 正常显示对话和简化版任务列表
- [ ] 代码量降至 ~2000 行
- [ ] 所有现有功能正常工作（对话、任务执行）
