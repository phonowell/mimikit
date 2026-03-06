# Telegram 渠道接入

## 能力范围

- 入站：使用 long polling 接收 Telegram 文本消息并转为 `POST /api/input` 等价输入。
- 出站：manager 回答后通过 Telegram Bot API `sendMessage` 回发到同一 chat。
- 命令：仅支持 `/mmk help`、`/mmk restart`（仅 Telegram 单聊生效；WebUI 不生效）。
- 当前未实现 webhook；默认使用 polling，适合本地直连运行。

## `/mmk` 命令（Telegram 单聊）

- `/mmk help`：返回命令列表。
- `/mmk restart`：触发运行时重启（等价退出码 `75` 的重启链路）。
- 仅在 Telegram `private` 会话中生效；群聊/频道消息忽略。
- 非 `/mmk` 文本仍按普通用户输入进入 orchestrator。

## 配置项（`config.yaml`）

```yaml
telegram:
  enabled: false
  botToken: ""
  chatId: ""
  apiRoot: https://api.telegram.org
  proxy: ""
```

## 环境变量覆写

- `TELEGRAM_CHANNEL_ENABLED`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_API_ROOT`
- `TELEGRAM_PROXY`

说明：当 `telegram.enabled=true` 时，`telegram.botToken` 与 `telegram.chatId` 必填，缺失会在启动阶段直接报错并退出。
`webui.enabled=true`（默认）与 `telegram.enabled=true` 可同时启用。

## 从 0 跑通

1. 在 Telegram 创建 Bot，拿到 `BOT_TOKEN`。
2. 给机器人发一条消息，获取 chat id（私聊通常为正数，群聊通常为负数）。
3. 配置环境变量后启动：

```bash
export TELEGRAM_CHANNEL_ENABLED=true
export TELEGRAM_BOT_TOKEN=<your_bot_token>
export TELEGRAM_CHAT_ID=<your_chat_id>
export TELEGRAM_PROXY=http://127.0.0.1:7897 # 可选
pnpm start
```

4. 在 Telegram 单聊测试命令：
   - 发送 `/mmk help`，应返回命令列表。
   - 发送 `/mmk restart`，应返回已受理重启。
5. 再发送普通文本，确认 WebUI 会话里出现 `source=telegram` 的用户输入。
