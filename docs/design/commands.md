# MIMIKIT 命令协议

> 返回 [系统设计总览](./README.md)

## 何时使用
- Manager 需要触发系统动作时输出。
- 由 Manager 解析并执行。

## 格式
- 命令块：`<MIMIKIT:commands> ... </MIMIKIT:commands>`
- 行内命令：`@add_task prompt="..." title="..."`
- 每行一个命令，行首 `@` + 命令名；属性仅支持双引号；属性名为字母/数字/下划线。

## 命令列表
- `add_task`：派发任务到内存队列。
  - attrs：`prompt`(必填)，`title`(可选，任务短标题)
  - 示例：`@add_task prompt="整理接口文档" title="整理文档"`（放在 `<MIMIKIT:commands>` 块内）
- `cancel_task`：取消任务。
  - attrs：`id`(必填)
  - 示例：`@cancel_task id="task_123"`（放在 `<MIMIKIT:commands>` 块内）
- `read_file`：同步读取 UTF-8 文本文件（manager 内部工具，不创建任务）。
  - attrs：`path`(必填), `start`(可选, 1-based), `limit`(可选)
  - 仅允许白名单后缀：`.ts,.tsx,.js,.jsx,.mjs,.cjs,.json,.jsonc,.md,.mdx,.yml,.yaml,.toml,.ini,.txt,.sh,.bash,.zsh,.ps1,.py,.rb,.go,.rs,.java,.kt,.swift,.css,.scss,.less,.html,.xml,.env,.gitignore,.gitattributes,.npmrc,.pnpmfile.cjs`
  - 示例：`@read_file path="src/cli.ts" start="1" limit="120"`（放在 `<MIMIKIT:commands>` 块内）
  - 结果注入：写入下一轮 prompt 的 `results` 区块（`tools` 子字段），不单独暴露新注入块

## 解析与执行
- 解析器：`src/supervisor/command-parser.ts`
- 命令会从输出中剥离，剩余文本作为自然回复。
