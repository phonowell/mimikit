# 运行日报闭环

> 返回 [系统设计总览](./README.md)

## 信号来源
- thinker action：`@capture_feedback`。
- 运行信号：失败、重试、高延迟、高 token。

## 处理流程
1. 统一记录结构化事件（`reporting/events.jsonl`）。
2. worker loop 在后台补齐缺失日期日报。
3. 日报落盘到 `reports/daily/YYYY-MM-DD.md`。

## 日报目标
- 每日可见：稳定性、时延、成本异常。
- 不做自动代码演进，不做 ROI 队列调度。
