# MIMIKIT 命令协议

> 返回 [系统设计总览](./README.md)

## 何时使用
- Manager 需要触发系统动作时输出。
- 由 Manager 解析并执行。

## 格式
- 自闭合标签：`<MIMIKIT:command attr="value" />`
- 带内容标签：`<MIMIKIT:command>内容</MIMIKIT:command>`
- 属性仅支持双引号；属性名为字母/数字/下划线。

## 命令列表
- `dispatch_worker`：派发任务到内存队列。
  - attrs：`prompt`(必填)
  - 示例：`<MIMIKIT:dispatch_worker prompt="整理接口文档" />`
  - 也可使用内容体：`<MIMIKIT:dispatch_worker>整理接口文档</MIMIKIT:dispatch_worker>`

## 解析与执行
- 解析器：内联于 `src/supervisor/manager.ts`
- 命令会从输出中剥离，剩余文本作为自然回复。
