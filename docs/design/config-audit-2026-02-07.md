# 配置审计（2026-02-07）

本轮重构后，配置主干统一为：

- `teller.*`
- `thinker.*`
- `worker.economy.*`
- `worker.expert.*`

关键变化：
- thinker 引入 `minIntervalMs` 作为节流阈值。
- worker 采用 profile 路由，不再单一配置。
- 运行状态增加通道 cursor 持久化字段。
