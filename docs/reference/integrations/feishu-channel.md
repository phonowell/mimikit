# Feishu 渠道接入

## 能力范围（当前实现）

- 入站：使用飞书官方 SDK 长连接（WebSocket）接收 `im.message.receive_v1` 事件，并转为 `POST /api/input` 等价输入。
- 出站：manager 回答后通过飞书 IM API `im.v1.message.create` 回发到同一 `chat_id`。
- 当前未实现 Webhook 模式；默认使用长连接，适合本地直连运行。
- 图片处理策略：收到飞书 `image` 消息后，会写入一条“当前仅支持纯文本，请改用文字描述”的引导输入，由 manager/LLM 统一回复给用户。

## 配置

```toml
[feishu]
enabled = false
appId = ""
appSecret = ""
chatId = ""
```

环境变量覆写：

- `FEISHU_CHANNEL_ENABLED`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CHAT_ID`

说明：当 `feishu.enabled=true` 时，`feishu.appId` 与 `feishu.appSecret` 必填，缺失会在启动阶段直接报错并退出；`feishu.chatId` 可选，若配置则需以 `oc_` 开头。
`webui.enabled=true`（默认）与 `feishu.enabled=true` 可同时启用。

## 启用步骤（最小）

1. 在飞书开放平台创建机器人应用，拿到 `APP_ID` 与 `APP_SECRET`。
2. 在飞书后台订阅事件 `im.message.receive_v1`。
3. 配置并启动：

```bash
export FEISHU_CHANNEL_ENABLED=true
export FEISHU_APP_ID=<your_app_id>
export FEISHU_APP_SECRET=<your_app_secret>
export FEISHU_CHAT_ID=<your_chat_id> # 可选
pnpm start
```

4. 在飞书发送普通文本，确认 WebUI 会话里出现 `source=feishu` 的用户输入。

## 运行时元数据（入站）

- `source=feishu`
- `platform=feishu`
- `feishuChatId`
- `feishuMessageId`
- `feishuEventId`
- `feishuTimestamp`

## 模块边界

- `src/surface/channels/feishu/config.ts`：Feishu 配置 schema、环境变量覆写、启用态校验
- `src/surface/channels/feishu/polling.ts`：Feishu 长连接入站与生命周期管理
- `src/surface/channels/feishu/client.ts`：Feishu 文本发送
- `src/surface/channels/feishu/passive-reply.ts`：manager 回复后的 Feishu 被动发送
- `src/surface/channels/feishu/index.ts`：对核心层暴露统一集成入口
