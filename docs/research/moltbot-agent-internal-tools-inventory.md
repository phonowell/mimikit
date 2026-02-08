# Moltbot Agent 内部工具清单研究（2026-02-07）

## 范围与统计口径
- 本文统计的是“可被 Agent 调用的内部工具名”（不含业务代码里的普通函数）。
- 统计入口以 `src/agents/pi-tools.ts` 的 `createMoltbotCodingTools()` 为主装配点。
- 工具来源分三层：`codingTools`（上游 SDK）、Moltbot 原生工具、频道/插件注入工具。
- 结论：当前仓库可定位到 **26 个**工具名（含条件工具）。

## 主装配位置
- 统一装配入口：`src/agents/pi-tools.ts`（组装 coding + exec/process + Moltbot tools + channel tools）。
- Moltbot 原生工具集合：`src/agents/moltbot-tools.ts`。
- 工具分组与策略别名：`src/agents/tool-policy.ts`。
- 网关直调工具入口（HTTP）：`src/gateway/tools-invoke-http.ts`。

## A. Read/Write 同类（文件与执行）共 7 个

| 工具名 | 主要作用 | 定义/来源位置 | 进入 Agent 的位置 |
|---|---|---|---|
| `read` | 读取工作区文件（含参数兼容/结果规范化） | 上游 `@mariozechner/pi-coding-agent`，在 `src/agents/pi-tools.read.ts` 包装 | `src/agents/pi-tools.ts` |
| `write` | 写入文件 | 上游 SDK，沙箱包装在 `src/agents/pi-tools.read.ts` | `src/agents/pi-tools.ts` |
| `edit` | 按 patch/替换方式编辑文件 | 上游 SDK，沙箱包装在 `src/agents/pi-tools.read.ts` | `src/agents/pi-tools.ts` |
| `apply_patch` | 结构化多文件补丁编辑 | `src/agents/apply-patch.ts` | `src/agents/pi-tools.ts` |
| `exec` | 执行 shell 命令 | `src/agents/bash-tools.exec.ts` | `src/agents/pi-tools.ts` |
| `process` | 管理后台进程（清理/状态） | `src/agents/bash-tools.process.ts` | `src/agents/pi-tools.ts` |
| `attach` | 附件挂载能力（显示层保留） | `src/agents/tool-display.json`（本仓库无单独实现文件） | 由上游 `codingTools` 体系提供 |

补充：`bash` 在策略层是 `exec` 别名（`src/agents/tool-policy.ts`）。

## B. Moltbot 原生工具共 18 个

| 工具名 | 主要作用 | 定义位置 |
|---|---|---|
| `browser` | 浏览器自动化（tab/snapshot/act/screenshot） | `src/agents/tools/browser-tool.ts` |
| `canvas` | 控制远端 Canvas 呈现与快照 | `src/agents/tools/canvas-tool.ts` |
| `nodes` | 设备节点状态、通知、相机/录屏等 | `src/agents/tools/nodes-tool.ts` |
| `cron` | 定时任务管理（list/add/update/run） | `src/agents/tools/cron-tool.ts` |
| `message` | 多渠道消息动作（send/read/react/edit/delete 等） | `src/agents/tools/message-tool.ts` |
| `tts` | 文本转语音并返回 `MEDIA:` 路径 | `src/agents/tools/tts-tool.ts` |
| `gateway` | Gateway 重启/配置/更新动作 | `src/agents/tools/gateway-tool.ts` |
| `agents_list` | 列出可用于 `sessions_spawn` 的 agent | `src/agents/tools/agents-list-tool.ts` |
| `sessions_list` | 列出会话 | `src/agents/tools/sessions-list-tool.ts` |
| `sessions_history` | 查看会话历史 | `src/agents/tools/sessions-history-tool.ts` |
| `sessions_send` | 向目标会话发送消息 | `src/agents/tools/sessions-send-tool.ts` |
| `sessions_spawn` | 启动子代理会话 | `src/agents/tools/sessions-spawn-tool.ts` |
| `session_status` | 查询/设置会话模型状态 | `src/agents/tools/session-status-tool.ts` |
| `web_search` | 联网搜索（provider 可配置） | `src/agents/tools/web-search.ts` |
| `web_fetch` | 抓取网页内容并抽取可读文本 | `src/agents/tools/web-fetch.ts` |
| `image` | 生成/处理图像能力 | `src/agents/tools/image-tool.ts` |
| `memory_search` | 语义检索 MEMORY 与记忆文件 | `src/agents/tools/memory-tool.ts` |
| `memory_get` | 按路径/行范围读取记忆片段 | `src/agents/tools/memory-tool.ts` |

这些工具统一在 `src/agents/moltbot-tools.ts` 中组装，再由 `src/agents/pi-tools.ts` 合并到最终工具集。

## C. 频道注入工具（当前可见）共 1 个

| 工具名 | 主要作用 | 定义位置 | 注入位置 |
|---|---|---|---|
| `whatsapp_login` | 生成 WhatsApp 登录二维码并等待绑定完成 | `src/channels/plugins/agent-tools/whatsapp-login.ts` | `src/agents/channel-tools.ts` -> `src/agents/pi-tools.ts` |

## 条件启用说明（为什么“总数”与“当前会话可见数”会不同）
- `apply_patch`：需 `tools.exec.applyPatch.enabled=true` 且模型/provider 满足条件（OpenAI 路径）。
- `image`：`agentDir` 可用时才会注入（见 `src/agents/moltbot-tools.ts`）。
- `web_search`/`web_fetch`：受 `tools.web` 配置、沙箱与 provider 能力影响。
- `memory_search`/`memory_get`：由插件运行时能力暴露，受 memory slot 与配置影响（`src/plugins/runtime/index.ts`）。
- `whatsapp_login`：属于频道插件工具，仅在相应频道插件可用时出现。

## 与 docs/tools 的差异
- `docs/tools/index.md` 当前主要覆盖 18 个核心工具（偏用户文档口径）。
- 但运行时工具面还包含：`read`、`write`、`edit`、`attach`、`tts`、`memory_search`、`memory_get`、`whatsapp_login` 等。
- 所以“供 Agent 使用的内部工具”总量会高于 docs/tools 页面里的核心清单。
