# CoPaw QQ 渠道调研（用于 Mimikit 对接前）

更新时间：2026-03-02  
范围：仅覆盖 CoPaw 当前 QQ 渠道实现与可复用结论，不扩展到其他渠道。

## 核心结论

1. CoPaw 的 QQ 接入是官方 Bot 路线：WebSocket 收事件，HTTP OpenAPI 发回复。  
2. 鉴权使用 `AppID + AppSecret` 换取 `access_token`，不是单一长期 Token。  
3. 当前可稳定依赖的是文本收发；媒体（图/音/视频/文件）在文档中标记为施工中。  
4. 群场景依赖 `@` 事件触发（`GROUP_AT_MESSAGE_CREATE`），不是全量群消息。  
5. 运行时还依赖 `websocket-client`；缺失时通道线程会直接报错并退出。

## CoPaw 中的实现方式

入口代码：`src/copaw/app/channels/qq/channel.py`

- 接收：连接 QQ gateway（`/gateway`）并处理 WS 事件。
- 发送：按消息类型调用不同接口：
  - C2C：`POST /v2/users/{openid}/messages`
  - Group：`POST /v2/groups/{group_openid}/messages`
  - Channel/Guild：`POST /channels/{channel_id}/messages`
- Token：`POST https://bots.qq.com/app/getAppAccessToken`
- 配置项：
  - `channels.qq.enabled`
  - `channels.qq.bot_prefix`
  - `channels.qq.app_id`
  - `channels.qq.client_secret`
- 可选环境变量：
  - `QQ_CHANNEL_ENABLED`
  - `QQ_APP_ID`
  - `QQ_CLIENT_SECRET`
  - `QQ_BOT_PREFIX`
  - `QQ_API_BASE`（默认 `https://api.sgroup.qq.com`）

## QQ 平台侧最小配置（CoPaw 文档）

文档章节：`website/public/docs/channels.zh.md` 的 `## QQ`

1. 在 QQ 开放平台创建机器人应用。  
2. 在回调配置中勾选：
   - 单聊事件：`C2C消息事件`
   - 群事件：`群消息AT事件`
3. 在沙箱配置里把自己加入消息列表。  
4. 在开发管理中获取 `AppID/AppSecret` 并配置 IP 白名单。  
5. 将 `app_id/client_secret` 填入 CoPaw `config.json`（或 Console）。

## 事件覆盖（对接时可直接映射）

- `C2C_MESSAGE_CREATE`：QQ 单聊
- `GROUP_AT_MESSAGE_CREATE`：QQ群 @机器人
- `AT_MESSAGE_CREATE`：频道 @机器人
- `DIRECT_MESSAGE_CREATE`：私信

## 对 Mimikit 的直接启示

1. 建议先做“文本稳定版”再做媒体；避免一开始就引入附件通道复杂度。  
2. 建议把“事件接收”和“回复发送”分离为两段（WS 入站 + HTTP 出站），便于限流与重试。  
3. 建议显式保留 `message_id/msg_seq` 语义（CoPaw 已做去重序列处理），降低重复回包风险。  
4. 对外配置使用 `app_id/client_secret` 二元凭证模型，避免抽象成单 token。  

## 2026-03-02 决策补充（Mimikit 当前口径）

1. 输入来源按“用户入口”计为两类：`WebUI` 与 `QQ`。  
   - `WebUI`：`POST /api/input` + `GET /api/events`（SSE）。  
   - `QQ`：Webhook 入站（计划 `POST /api/qq/events`），不走 SSE。  
   - 目标运行模式：`WebUI` 与 `QQ` 同时启用，不是二选一。  
2. QQ 单聊输出第一期固定纯文本（`msg_type=0`），不启用 markdown。  
3. QQ 单聊接口技术上支持 markdown（`msg_type=2` + `markdown` 字段），但文档标注需要开通；且“被动 MD”需单独申请。  
4. `ask_user_choice` 在 QQ 链路禁用：当前选择提交仅有 WebUI 路由 `POST /api/choices/:id/select`，QQ 侧无对等回传通道。  

## 已知风险点

1. 仓库仍处于 `0.0.x` 早期，接口与行为可能快速变化。  
2. CoPaw issue 中已有 QQ/模型配置相关问题，落地时需要预留排障流程。  
3. `websocket-client` 未在 `pyproject.toml` 主依赖中显式出现，部署脚本需补齐检查。

## 参考来源

- 仓库主页：https://github.com/agentscope-ai/CoPaw  
- QQ 频道代码：https://github.com/agentscope-ai/CoPaw/blob/main/src/copaw/app/channels/qq/channel.py  
- QQ 频道文档（中文）：https://github.com/agentscope-ai/CoPaw/blob/main/website/public/docs/channels.zh.md  
- 配置模型：https://github.com/agentscope-ai/CoPaw/blob/main/src/copaw/config/config.py  
- QQ 机器人文档（发送消息）：https://github.com/tencent-connect/bot-docs/blob/master/docs/develop/api-v2/server-inter/message/send-receive/send.md  
- QQ 机器人文档（Markdown 消息）：https://github.com/tencent-connect/bot-docs/blob/master/docs/develop/api-v2/server-inter/message/type/markdown.md  
