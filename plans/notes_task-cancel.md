# Notes: task-cancel

## 需求摘录
- 任务需要能够取消
- 入口: WebUI 取消按钮
- 入口: manager 内部工具取消

## 约束/假设
- 任务队列仅内存态
- canceled 为合法任务状态

## 待确认
- running 任务取消必须中断 LLM 调用（Abort）
- canceled 生成 TaskResult 并触发 manager 处理
