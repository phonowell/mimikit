# Mimikit 架构说明

## 关联文档
- Codex exec 备忘：docs/codex-exec-reference.md

## 设计目标
可自迭代、自演化的虚拟助理。7x24 稳定运行，简洁最小化。

## 组件
- **Supervisor**: 极简常驻进程，每 1s 检查一次，驱动 Agent 和 Task。
- **Agent**: 主智能体（codex exec），处理用户输入、自驱动改进、派发子任务。
- **Task**: 子任务进程（codex exec），由 Agent 派发，并行执行。
- **Protocol**: 文件协议层，所有进程间通信通过 JSON 文件。
- **Memory**: 关键词检索 workspace root（workDir）下的 MEMORY.md + memory/ + memory/summary/ + docs/（`rg` 兜底），不在 `.mimikit/`。
- **WebUI**: 单窗口对话界面。

## 代码布局
```
src/
├── cli.ts          # 入口
├── supervisor.ts   # 常驻主循环
├── agent.ts        # 主 Agent 逻辑
├── task.ts         # 子任务执行
├── codex.ts        # codex exec 封装
├── protocol.ts     # 文件协议（状态/队列/历史）
├── memory.ts       # 记忆检索
├── prompt.ts       # prompt 装配/加载
├── http.ts         # HTTP 服务
└── webui/          # 前端静态文件

prompts/
├── agent/          # 主 Agent prompt 模板
└── task/           # 子任务 prompt 模板
```

## 核心流程

### Supervisor 主循环（每 1s）
1. Agent 运行中？→ 跳过
2. 派发 pending_tasks/ 目录中的子任务
3. 有未处理事务（用户输入/任务结果）？→ 唤醒 Agent
4. 无事务 + 距上次唤醒 ≥5min？→ 自唤醒 Agent

### Agent 唤醒流程
1. 加载：对话历史 + 记忆检索 + 用户输入 + 任务结果
2. 构建 prompt（系统指令 + 上下文）
3. 执行 codex exec（可 resume）
4. 记录输出到对话历史
5. 清理已处理的输入和结果

### 自唤醒流程（无输入/结果）
1. git stash push 保护工作区（记录 self_awake.json）
2. 按 prompts/agent/self-awake.md 清单检查，最多委派 1 个子任务
3. 子任务完成后审查变更；通过则建分支+提交，不通过则回滚
4. 审计写入 audit.jsonl

### Memory 机制
- 检索范围（workDir 下）：`MEMORY.md` + `memory/`(≤5d) + `memory/summary/`(5-90d 日摘要，>90d 月摘要) + `docs/`（不在 `.mimikit/`）
- 检索策略：规则扩展关键词 + BM25；失败时 `rg` 兜底
- 自动托管：6h 无消息或 100 条对话触发，写 `memory/YYYY-MM-DD-slug.md`，保留 chat_history
- Flush：对话记录 ≥800 且距上次 ≥1h，追加到 `memory/YYYY-MM-DD.md`
- Rollup：仅自唤醒触发，生成 `memory/summary/YYYY-MM-DD.md` 与 `memory/summary/YYYY-MM.md`

### 子任务流程
1. Agent 写入 pending_tasks/{id}.json
2. Supervisor 检测并派发（受 maxConcurrentTasks 限制）
3. 子任务独立执行 codex exec
4. 结果写入 task_results/{id}.json
5. 下次 Agent 唤醒时读取结果

### 委派协议（主 Agent 输出）
- 需要委派时，主 Agent 在回复末尾输出（代码块标记为 delegations）：
````markdown
```delegations
[
  { "prompt": "task description" }
]
```
````
- Host 解析该块并写入 pending_tasks/；每轮最多 3 条（自唤醒 1 条）
- 若不委派，需给出简短理由（在正常回复中）

## 文件协议
```
.mimikit/
├── agent_state.json      # Agent 状态（running/idle）
├── pending_tasks/        # 待派发的子任务（每任务一文件）
│   └── {taskId}.json
├── inflight_tasks/       # 正在执行的子任务
│   └── {taskId}.json
├── user_input.json       # 用户输入队列
├── chat_history.json     # 对话历史
├── task_results/         # 子任务结果
│   └── {taskId}.json
├── task_history.json     # 任务历史
├── self_awake.json       # 自唤醒运行状态
├── audit.jsonl           # 审计日志
└── tasks.md              # 任务日志
```

## 恢复机制
- 启动时检查 agent_state.json：若 status=running 则重置为 idle
- pending_tasks/ 目录中的任务自动在下次检查时派发
- task_results/ 中的结果自动在下次 Agent 唤醒时处理

## HTTP 接口
- `GET /` WebUI
- `GET /api/status` 系统状态
- `POST /api/input` 提交用户输入
- `GET /api/messages` 对话历史

## 核心命令
- `tsx src/cli.ts` 或 `tsx src/cli.ts --port 8787`
- `tsx src/cli.ts memory status|index|search`

## 依赖
- Node.js 22+ / tsx
- Codex CLI
- ripgrep (rg)
- git
