# Thinker 命令协议

> 返回 [系统设计总览](./README.md)

## 命令块
- thinker 输出文本中可包含：`<MIMIKIT:commands> ... </MIMIKIT:commands>`。
- 每行一条命令，示例：
  - `@add_task prompt="..." title="..." profile="economy|expert"`
  - `@cancel_task id="..."`
  - `@summarize_result taskId="..." summary="..."`
  - `@capture_feedback {...json...}`

## 解析与执行
- 解析：`src/orchestrator/command-parser.ts`
- 执行：`src/orchestrator/thinker-commands.ts`

## 约束
- thinker 不直接输出给用户。
- 用户可见文案由 teller egress 统一生成。
