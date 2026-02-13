# nanobot 本地仓库调研报告

- 调研对象：`~/projects/nanobot`
- 调研时间：2026-02-13
- 结论形态：基于本机代码与文档的静态审阅（未执行联网操作）

## 1) 项目目标、使用场景与主要能力

### 项目目标
- 定位为“超轻量个人 AI 助手”，强调代码体量小、可读性强、研究与二次开发友好。
- 通过统一 Agent 循环整合 LLM 调用、工具执行、会话记忆、消息通道、定时任务与心跳任务。

### 典型使用场景
- 命令行对话：`nanobot agent -m "..."` 或交互模式。
- 网关模式：`nanobot gateway` 挂载 Telegram / WhatsApp 通道，作为长期在线助手。
- 计划任务：`nanobot cron ...` 创建周期/一次性提醒与自动 Agent 执行。
- 个人知识管理：基于 `workspace/memory/` 的长期与当日记忆。

### 主要能力
- 多提供商 LLM 统一接入（OpenRouter / Anthropic / OpenAI / Gemini / Zhipu / vLLM 兼容端点）。
- 内置工具：文件读写编辑、目录浏览、Shell 执行、Web 搜索/抓取、消息发送、子代理并发。
- 双通道消息接入：Telegram（Python）+ WhatsApp（Node.js Bridge）。
- 心跳机制（每 30 分钟）驱动“空闲轮次”任务检查。

## 2) 技术栈、运行时要求、依赖与锁文件

### 语言与框架
- Python 3.11+（核心服务）：Typer CLI、Pydantic/Pydantic-Settings、LiteLLM、Loguru、HTTPX。
- TypeScript/Node.js（WhatsApp Bridge）：`ws` + `@whiskeysockets/baileys`。

### 运行时组件
- 数据存储：本地文件存储（JSON/JSONL/Markdown），无数据库。
- 消息队列：进程内 `asyncio.Queue`（`MessageBus`），无外部 MQ。
- 第三方服务：
  - LLM 提供商 API（默认 OpenRouter）
  - Brave Search API（可选，Web 搜索工具）
  - Telegram Bot API（可选）
  - WhatsApp Web（通过 Baileys）

### 依赖管理
- Python：`pyproject.toml`（Hatchling 构建），无 `poetry.lock` / `uv.lock` / `requirements.lock`。
- Node：`bridge/package.json`，无 `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`。
- 影响：当前依赖解析不可完全复现，跨机器安装结果可能漂移。

### 运行时要求（代码与文档交叉）
- Python：`>=3.11`。
- Node：存在不一致信号：README 写 `>=18`，`bridge/package.json` engines 写 `>=20.0.0`。
- CLI 启动入口：`nanobot`（映射到 `nanobot.cli.commands:app`）。

## 3) 顶层与关键目录结构（核心模块/入口/数据流）

### 顶层结构概览
- `README.md` / `COMMUNICATION.md`：项目说明与社区信息。
- `pyproject.toml`：Python 依赖、脚本入口、ruff/pytest 基础配置。
- `nanobot/`：核心 Python 包（Agent、通道、配置、调度、Provider）。
- `bridge/`：WhatsApp Node 桥接服务源码与构建脚本。
- `workspace/`：默认工作区模板（AGENTS/SOUL/USER/TOOLS/HEARTBEAT/MEMORY）。

### 核心代码路径与职责
- 入口与命令：`nanobot/__main__.py`、`nanobot/cli/commands.py`
- Agent 主循环：`nanobot/agent/loop.py`
- Prompt/上下文：`nanobot/agent/context.py`
- 工具系统：`nanobot/agent/tools/*.py`
- 会话存储：`nanobot/session/manager.py`
- 通道管理：`nanobot/channels/manager.py`、`telegram.py`、`whatsapp.py`
- 消息总线：`nanobot/bus/queue.py`、`events.py`
- 配置系统：`nanobot/config/schema.py`、`loader.py`
- LLM Provider：`nanobot/providers/litellm_provider.py`
- 定时任务：`nanobot/cron/service.py`
- 心跳任务：`nanobot/heartbeat/service.py`

### 关键数据流（简化）
1. Channel（Telegram/WhatsApp）接收消息 -> `InboundMessage` 入总线
2. `AgentLoop` 消费消息，加载 session/history + workspace + skills + memory
3. 调用 LLM（可触发工具调用迭代）
4. 结果写回会话（`~/.nanobot/sessions/*.jsonl`）
5. 生成 `OutboundMessage` -> ChannelManager 分发至对应通道
6. Cron/Heartbeat 可触发“系统消息”进入同一 Agent 流程

## 4) 本地开发与生产运行方式

### 安装与初始化
- 基础安装：`pip install nanobot-ai` 或源码 `pip install -e .`
- 初始化：`nanobot onboard`（生成 `~/.nanobot/config.json` 与 workspace 模板）

### 环境变量与配置
- 主配置文件：`~/.nanobot/config.json`
- 配置模型支持 `NANOBOT_` 前缀（`env_nested_delimiter=__`）
- 关键键：
  - `providers.*.apiKey/apiBase`
  - `agents.defaults.model/maxToolIterations`
  - `channels.telegram.token/allowFrom`
  - `channels.whatsapp.bridgeUrl/allowFrom`
  - `tools.web.search.apiKey`

### 常用启动命令
- `nanobot agent -m "..."`：单次对话
- `nanobot agent`：交互模式
- `nanobot gateway`：网关（消息通道 + cron + heartbeat + agent）
- `nanobot channels login`：启动 WhatsApp Bridge 并扫码登录
- `nanobot cron add/list/remove/enable/run`：任务调度
- `nanobot status`：配置与 Provider 状态检查

### 脚本与构建线索
- Python 打包：Hatchling（`pyproject.toml`）
- Node Bridge：`npm run build`、`npm start`、`npm run dev`
- 未发现：`Makefile` / `Taskfile` / `Dockerfile` / `docker-compose.*` / `.github/workflows/*`

### 生产运行线索（代码层）
- 网关默认端口 `18790`（CLI 参数可改）。
- WhatsApp Bridge 默认 `ws://localhost:3001`，Bridge 可用 `BRIDGE_PORT` 与 `AUTH_DIR` 覆盖。
- 主要状态目录位于 `~/.nanobot/`（config、sessions、cron、media、bridge、whatsapp-auth）。

## 5) 测试与质量保障盘点

- 依赖声明包含 `pytest`、`pytest-asyncio`、`ruff`（dev extra）。
- `pyproject.toml` 含 `tool.pytest.ini_options` 与 `tool.ruff` 基础配置。
- 但仓库中未发现 `tests/` 或 `test_*.py`，也未发现 CI 工作流。
- 结论：当前质量保障主要依赖人工验证，自动化回归保障不足。

## 6) 风险与建议（安全/可维护性/性能/可观测性/文档）

### 主要风险
1. **安全边界宽松**：`exec` 工具可执行任意 shell；文件工具无 workspace 沙箱限制，可访问任意路径。
2. **密钥管理风险**：API Key 主要以明文写入 `~/.nanobot/config.json`；未见加密或密钥托管策略。
3. **可复现性风险**：Python/Node 均无锁文件；依赖解析漂移概率高。
4. **质量风险**：缺测试与 CI，回归成本高。
5. **配置/文档一致性风险**：
   - Node 版本要求（README `>=18` vs bridge engines `>=20`）
   - 版本号（`nanobot/__init__.py` 为 `0.1.0`，`pyproject.toml` 为 `0.1.3.post3`）
6. **逻辑正确性风险**：Heartbeat “无任务”判定中，`HEARTBEAT_OK` 比较逻辑存在 token 处理不一致，可能误判。
7. **可观测性不足**：无统一 metrics/trace；仅日志输出，难以量化性能与失败率。

### 建议（按 ROI 优先）
1. 先补最小自动化质量门：`ruff + pytest` 的本地/CI 基线。
2. 增加依赖锁文件（Python 与 Node 各一），保障可复现部署。
3. 为 `exec` 与文件工具增加路径白名单/开关，默认限制在 workspace。
4. 统一版本与运行时文档，消除 README/代码偏差。
5. 增加最小可观测性：关键路径耗时、工具错误率、LLM token 使用统计。
6. 修复 Heartbeat token 判定与其他易错边界（并补对应测试）。

## 7) 交付物

- 主报告：`~/projects/mimikit/docs/research/nanobot-research.md`
- 附录（实现链路与核心逻辑）：`~/projects/mimikit/docs/research/nanobot-logic-chain.md`

## 8) 实现链路补充摘要（本次新增）

- 已补充真实入口点与启动顺序：覆盖 `CLI -> gateway -> agent/channels/cron/heartbeat`，并单列 WhatsApp Bridge（Node）入口。
- 已补充典型指令全链路：以 Telegram 文本指令触发 `read_file` 为例，从 `InboundMessage` 入队到 `OutboundMessage` 回发逐层标注。
- 已补充核心抽象与数据流：
  - agent/planner：当前无独立 Planner 类，规划由 `AgentLoop` + LLM tool-calling 迭代隐式完成。
  - tool registry/dispatcher：`Tool` 抽象 + `ToolRegistry.execute()` + `ChannelManager._dispatch_outbound()`。
  - memory/RAG：`MemoryStore` 仅基于 Markdown 文件读写，未实现向量检索式 RAG。
  - prompt 模板：`ContextBuilder` 动态拼装 identity/bootstrap/memory/skills；子代理提示词在 `SubagentManager` 内构造。
  - 消息协议/DTO：`InboundMessage` / `OutboundMessage` / `LLMResponse` / `ToolCallRequest`。
  - 状态管理：`SessionManager`（JSONL）、`CronStore`（JSON）、`HeartbeatService`（文件触发）。
- 已补充工具调用细节：参数组装、异常处理、输出裁剪（`exec` 10k、`web_fetch` maxChars）与二次汇总机制。
- 已补充扩展路径：新增工具、模型 provider、记忆源、路由策略分别对应文件与接口。
- 已补充边界条件：超时、重试、并发、上下文窗口、权限 allowlist、密钥注入及安全边界。
- 详细实现证据与逐文件职责见附录：`docs/research/nanobot-logic-chain.md`。
