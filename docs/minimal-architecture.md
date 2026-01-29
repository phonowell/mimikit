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
- **Memory**: `rg` 全文检索 markdown 文件。
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
├── prompt.ts       # 系统 prompt
├── http.ts         # HTTP 服务
└── webui/          # 前端静态文件
```

## 核心流程

### Supervisor 主循环（每 1s）
1. Agent 运行中？→ 跳过
2. 派发 pending_tasks/ 目录中的子任务
3. 有未处理事务（用户输入/任务结果）？→ 唤醒 Agent
4. 无事务 + 距上次唤醒 ≥15min？→ 自唤醒 Agent

### Agent 唤醒流程
1. 加载：对话历史 + 记忆检索 + 用户输入 + 任务结果
2. 构建 prompt（系统指令 + 上下文）
3. 执行 codex exec（可 resume）
4. 记录输出到对话历史
5. 清理已处理的输入和结果

### 子任务流程
1. Agent 写入 pending_tasks/{id}.json
2. Supervisor 检测并派发（受 maxConcurrentTasks 限制）
3. 子任务独立执行 codex exec
4. 结果写入 task_results/{id}.json
5. 下次 Agent 唤醒时读取结果

## 文件协议
```
.mimikit/
├── agent_state.json      # Agent 状态（running/idle + sessionId）
├── pending_tasks/        # 待派发的子任务（每任务一文件）
│   └── {taskId}.json
├── user_input.json       # 用户输入队列
├── chat_history.json     # 对话历史
├── task_results/         # 子任务结果
│   └── {taskId}.json
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

## 依赖
- Node.js 22+ / tsx
- Codex CLI
- ripgrep (rg)
