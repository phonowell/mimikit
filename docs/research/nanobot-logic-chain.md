# nanobot 实现链路与核心逻辑附录

- 代码仓库：`~/projects/nanobot`
- 产出时间：2026-02-13
- 方法：静态代码追踪（未执行线上请求）

## 1) 真实入口点与启动初始化顺序

### 1.1 CLI 与模块入口
- 命令入口在 `pyproject.toml:41`，将 `nanobot` 绑定到 `nanobot.cli.commands:app`。
- 模块入口在 `nanobot/__main__.py:5`，`python -m nanobot` 直接调用 Typer `app()`。
- 根命令组由 `nanobot/cli/commands.py:12` 创建，子命令含 `gateway`、`agent`、`channels`、`cron`、`status`。

### 1.2 `nanobot gateway` 启动顺序（真实初始化链）
1. 读取配置：`load_config()`，位置 `nanobot/cli/commands.py:176`。
2. 创建总线：`MessageBus()`，位置 `nanobot/cli/commands.py:179`。
3. 解析密钥/API Base：`config.get_api_key/get_api_base`，位置 `nanobot/cli/commands.py:182-183`。
4. 注入 Provider：`LiteLLMProvider(...)`，位置 `nanobot/cli/commands.py:190-194`。
5. 注入 Agent：`AgentLoop(bus, provider, workspace, model, max_iterations, brave_api_key)`，位置 `nanobot/cli/commands.py:197-204`。
6. 注入 Cron：`CronService(store_path, on_job=on_cron_job)`，位置 `nanobot/cli/commands.py:223-224`。
7. 注入 Heartbeat：`HeartbeatService(..., on_heartbeat=...)`，位置 `nanobot/cli/commands.py:231-236`。
8. 注入通道管理器：`ChannelManager(config, bus)`，位置 `nanobot/cli/commands.py:239`。
9. 并发运行：`asyncio.gather(agent.run(), channels.start_all())`，前置先 `cron.start()` 与 `heartbeat.start()`，位置 `nanobot/cli/commands.py:252-259`。

### 1.3 Channel/Bridge（HTTP/worker 相关入口）
- Python 侧没有独立 HTTP API 服务；`gateway --port` 仅用于日志展示（`nanobot/cli/commands.py:157`、`174`），未见绑定监听。
- WhatsApp Bridge 为 Node 侧 WebSocket 服务：`bridge/src/index.ts:32` 创建 `BridgeServer`，`bridge/src/server.ts:28` 监听 `ws://localhost:<port>`。
- Bridge 与 Python 通信协议在 `bridge/src/server.ts:8-17`（`send` 指令与 `message/status/qr/error` 事件）。

### 1.4 worker-like 执行面
- 定时 worker：`CronService`（`nanobot/cron/service.py:42`）。
- 心跳 worker：`HeartbeatService`（`nanobot/heartbeat/service.py:38`）。
- 背景子代理 worker：`SubagentManager.spawn()`（`nanobot/agent/subagent.py:44`）。

## 2) 典型指令全链路（Telegram 文本 + `read_file`）

示例指令：用户在 Telegram 发送“读取 `AGENTS.md` 并总结”。

1. Telegram 收包：`TelegramChannel._on_message()`，`nanobot/channels/telegram.py:193`。
2. 权限过滤与 DTO 构造：`BaseChannel._handle_message()`，`nanobot/channels/base.py:84`。
3. 入队：`MessageBus.publish_inbound()`，`nanobot/bus/queue.py:25`。
4. Agent 消费：`AgentLoop.run()` -> `consume_inbound()`，`nanobot/agent/loop.py:89-100`。
5. 会话定位：`SessionManager.get_or_create(msg.session_key)`，`nanobot/agent/loop.py:141`。
6. Prompt 组装：`ContextBuilder.build_messages()`，`nanobot/agent/loop.py:153` + `nanobot/agent/context.py:115`。
7. LLM 首轮：`provider.chat(messages, tools)`，`nanobot/agent/loop.py:167-171`。
8. LLM 返回 tool-call：`response.has_tool_calls` 分支，`nanobot/agent/loop.py:174`。
9. 工具执行：`ToolRegistry.execute("read_file", args)` -> `ReadFileTool.execute()`，`nanobot/agent/tools/registry.py:38`、`nanobot/agent/tools/filesystem.py:33`。
10. 工具结果回填：`ContextBuilder.add_tool_result()`，`nanobot/agent/loop.py:196-198`。
11. LLM 二轮汇总出最终文本：`final_content=response.content`，`nanobot/agent/loop.py:199-202`。
12. 会话持久化：`sessions.save(session)`，`nanobot/agent/loop.py:207-210` + `nanobot/session/manager.py:136`。
13. 生成出站消息：`OutboundMessage(...)`，`nanobot/agent/loop.py:212-216`。
14. 出队分发：`ChannelManager._dispatch_outbound()` -> `TelegramChannel.send()`，`nanobot/channels/manager.py:95`、`nanobot/channels/telegram.py:153`。

## 3) 核心抽象与数据流

### 3.1 agent/planner
- 主编排器是 `AgentLoop`（`nanobot/agent/loop.py:24`）。
- 当前无独立 Planner 类；“规划”由 LLM 在多轮 tool-calling 迭代中隐式完成（`while iteration < max_iterations`，`nanobot/agent/loop.py:163`）。
- 背景并发任务由 `spawn` 工具触发 `SubagentManager`，结果再回注主链路（`nanobot/agent/subagent.py:168`）。

### 3.2 tool registry/dispatcher
- 工具抽象：`Tool` 协议（name/description/parameters/execute），`nanobot/agent/tools/base.py:7`。
- 注册中心：`ToolRegistry`（注册、schema 暴露、执行），`nanobot/agent/tools/registry.py:8`。
- 默认工具注入点：`AgentLoop._register_default_tools()`，`nanobot/agent/loop.py:66`。
- 出站分发器：`ChannelManager._dispatch_outbound()`，`nanobot/channels/manager.py:95`。

### 3.3 memory/RAG
- 记忆实现：`MemoryStore` 读写 `memory/MEMORY.md` 与日记文件，`nanobot/agent/memory.py:9`。
- 注入方式：`ContextBuilder.build_system_prompt()` 将记忆拼入系统提示词，`nanobot/agent/context.py:27`。
- 结论：当前无向量索引/检索重排/embedding 管道，不是典型 RAG。

### 3.4 prompt 模板
- 系统提示词由 `ContextBuilder` 动态拼接：identity + bootstrap + memory + skills summary，`nanobot/agent/context.py:37-70`。
- identity 模板在 `_get_identity()` 内联生成，`nanobot/agent/context.py:72`。
- 子代理模板在 `_build_subagent_prompt()` 内联生成，`nanobot/agent/subagent.py:200`。

### 3.5 消息协议/DTO
- 聊天 DTO：`InboundMessage` / `OutboundMessage`，`nanobot/bus/events.py:8`、`26`。
- LLM DTO：`ToolCallRequest` / `LLMResponse`，`nanobot/providers/base.py:8`、`16`。
- Bridge 协议：`SendCommand` + `BridgeMessage`，`bridge/src/server.ts:8`、`14`。

### 3.6 状态管理/中间件
- 会话状态：`SessionManager` JSONL 存储，`nanobot/session/manager.py:61`。
- 调度状态：`CronStore` JSON 文件，`nanobot/cron/types.py:56` + `nanobot/cron/service.py:103`。
- 权限中间件：`BaseChannel.is_allowed()` allowlist，`nanobot/channels/base.py:59`。
- 心跳状态：`HeartbeatService` 以 `HEARTBEAT.md` 文件内容作为触发条件，`nanobot/heartbeat/service.py:61`。

## 4) 工具调用与结果汇总机制

### 4.1 参数构造与执行
- Provider 将工具 schema 作为 `tools` 传给模型，`nanobot/providers/litellm_provider.py:117-119`。
- 模型返回的 `function.arguments` 若为 JSON 字符串，会在 provider 侧解析为 dict，`nanobot/providers/litellm_provider.py:139-147`。
- Agent 执行时再次 JSON 序列化用于调试日志，再把 dict 传入 `ToolRegistry.execute`，`nanobot/agent/loop.py:193-196`。

### 4.2 异常处理
- 找不到工具：`ToolRegistry.execute` 返回 `Error: Tool 'x' not found`，`nanobot/agent/tools/registry.py:52-55`。
- 工具内部异常：统一转字符串返回，不抛出上层，`nanobot/agent/tools/registry.py:56-59`。
- Agent 主循环异常：捕获后直接向原通道回包错误文本，`nanobot/agent/loop.py:107-114`。

### 4.3 结果裁剪与格式化
- `exec` 输出超过 10000 字符裁剪，`nanobot/agent/tools/shell.py:77-80`。
- `web_fetch` 按 `maxChars` 截断并返回结构化 JSON（含 `truncated/length`），`nanobot/agent/tools/web.py:120-126`。
- `edit_file` 若 `old_text` 多次出现则返回警告，避免误替换，`nanobot/agent/tools/filesystem.py:133-136`。
- 最终“结果汇总”由 LLM 下一轮根据 tool result 生成自然语言答复（`nanobot/agent/loop.py:199-202`）。

## 5) 扩展点与二次开发路径

### 5.1 新增工具
- 新建工具类：继承 `Tool`，实现 `parameters/execute`，放入 `nanobot/agent/tools/*.py`。
- 注册入口：`AgentLoop._register_default_tools()`（`nanobot/agent/loop.py:66`）。
- 若需子代理可用，同步在 `SubagentManager._run_subagent` 的 `tools.register(...)` 增补，`nanobot/agent/subagent.py:95-101`。

### 5.2 新增模型 provider
- 新增实现：继承 `LLMProvider`（`nanobot/providers/base.py:30`）。
- 配置扩展：`ProvidersConfig` 新增 provider 字段（`nanobot/config/schema.py:48`）。
- 装配入口：`nanobot/cli/commands.py` 中 `gateway` 与 `agent` 当前直接实例化 `LiteLLMProvider`（`190`、`298`）。

### 5.3 新增记忆源
- 数据层：扩展/替换 `MemoryStore`（`nanobot/agent/memory.py:9`）。
- 注入层：在 `ContextBuilder.build_system_prompt` 调整注入顺序与摘要策略（`nanobot/agent/context.py:27`）。
- 若引入检索器，建议在 `build_messages` 前增加检索结果拼装阶段（当前尚无该阶段）。

### 5.4 新增路由策略
- 新通道：实现 `BaseChannel`（`nanobot/channels/base.py:10`）并在 `ChannelManager._init_channels` 注册（`nanobot/channels/manager.py:32`）。
- 路由规则：修改 `_dispatch_outbound`（`nanobot/channels/manager.py:95`）按 `metadata`/策略选择通道。
- 若需协议变更，同步调整 DTO：`nanobot/bus/events.py` 与对应 channel adapter。

## 6) 错误处理与边界条件盘点

### 6.1 超时/重试/并发
- 超时：Agent/Dispatcher 轮询 1s（`nanobot/agent/loop.py:97`、`nanobot/channels/manager.py:101`）。
- 工具超时：`exec` 60s（`nanobot/agent/tools/shell.py:13`、`54-60`），`web_search` 10s、`web_fetch` 30s（`nanobot/agent/tools/web.py:60`、`103`）。
- 重试：WhatsApp Python 通道断连后 5s 重连（`nanobot/channels/whatsapp.py:63-64`）；Node 端 Baileys 也做 5s 重连（`bridge/src/whatsapp.ts:90-97`）。
- 并发：主 Agent 单消息串行；子代理通过 `asyncio.create_task` 并发（`nanobot/agent/subagent.py:72`）。

### 6.2 上下文窗口与会话边界
- 会话裁剪按“条数”非 token：`Session.get_history(max_messages=50)`（`nanobot/session/manager.py:39`）。
- Provider 默认 `max_tokens=4096`（`nanobot/providers/litellm_provider.py:66`），未见基于上下文长度的动态调参。
- 工具迭代上限：`AgentLoop.max_iterations` 默认 20（`nanobot/agent/loop.py:42`）。

### 6.3 权限、密钥注入与安全边界
- 权限：channel allowlist 在 `BaseChannel.is_allowed`（`nanobot/channels/base.py:59`）。
- 密钥：`Config.get_api_key` 按 provider 优先级取值（`nanobot/config/schema.py:93`）；`LiteLLMProvider` 将 key 注入环境变量（`nanobot/providers/litellm_provider.py:39-53`）。
- 安全边界：`read/write/edit/exec` 无 workspace 白名单；`exec` 可执行任意 shell（`nanobot/agent/tools/filesystem.py`、`nanobot/agent/tools/shell.py`）。

### 6.4 本次静态审阅发现的实现缺口
- `gateway --port` 当前未参与任何监听绑定，仅打印日志（`nanobot/cli/commands.py:157`、`174`）。
- Heartbeat “无任务”判定存在 token 比较不一致：把响应去掉 `_` 后，仍与含 `_` 的常量比较（`nanobot/heartbeat/service.py:118`）。

## 7) 结论（实现视角）

- nanobot 的真实控制平面是 `AgentLoop + MessageBus + ChannelManager + Cron/Heartbeat`，而非 HTTP API 网关。
- 规划能力主要依赖 LLM 工具调用循环，框架层负责上下文拼装、工具执行与状态持久化。
- 二次开发成本最低的切入点：`Tool` 扩展、`Provider` 抽象替换、`BaseChannel` 新通道接入。
