# Thinker 命令协议

> 返回 [系统设计总览](./README.md)

## 命令块
- thinker 输出文本中可包含：`<MIMIKIT:commands> ... </MIMIKIT:commands>`。
- 每行一条命令，示例：
  - `@add_task prompt="..." title="..." profile="standard|expert"`
  - `@cancel_task id="..."`
  - `@summarize_result taskId="..." summary="..."`
  - `@capture_feedback message="..."`

## 语法约束
- 统一使用 `@command key="value"`。
- 所有参数均为字符串；数值/布尔值由执行层按字段再解析。
- 不支持 JSON 命令负载。

## worker-standard 的 @browser
- `@browser command="..."` 会执行：`agent-browser <command> --json`。
- 常用子命令：`open`、`click`、`type`、`fill`、`wait`、`snapshot`、`screenshot`、`get`、`find`、`tab`、`back`、`forward`、`reload`。
- 完整能力以 `agent-browser --help` 为准（会随全局安装版本变化）。

## 解析与执行
- 解析：`src/orchestrator/command-parser.ts`
- 执行：`src/orchestrator/thinker-commands.ts`

## 约束
- thinker 不直接输出给用户。
- 用户可见文案由 teller egress 统一生成。
