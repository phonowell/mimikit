# 运行反馈与演进闭环（当前实现）

> 返回 [系统设计总览](./README.md)

## 信号来源
- 结构化事件流：`reporting/events.jsonl`
  - 来源：worker 失败/重试/高时延/高开销、worker loop 错误
- 演进文档：
  - `feedback.md`
  - `user_profile.md`
  - `agent_persona.md`
  - `agent_persona_versions/*.md`

## 在线链路（不阻塞）
1. worker/runtime 写 reporting 事件。
2. `workerLoop` 补齐缺失日期日报到 `reports/daily/*.md`。
3. manager 正常处理输入与任务，不等待日报生成。

## 空闲链路（evolver）
1. 判断空闲窗口。
2. 汇总 `history/tasks`。
3. 追加 `feedback/user_profile/agent_persona`。
4. 生成 persona 版本快照。

## 边界
- 报告与演进信息用于观测与后续优化，不直接改写在线任务结果。
- 异常优先记录，不吞错、不静默忽略。
