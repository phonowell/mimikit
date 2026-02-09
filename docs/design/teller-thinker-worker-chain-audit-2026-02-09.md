# teller-thinker-worker 链路审计（2026-02-09）

## 结论
- 主链路为 `teller -> thinker -> worker`，执行调用路径已统一。
- `worker-run-retry` 显式调用 `runExpertWorker`（expert profile）。
- 历史 `evolve/code-evolve` 相关链路已下线，系统改为 reporting 每日报告模式。

## 关注点
- thinker 只产出 action/decision，不直接执行任务。
- worker 负责执行与结果回写，reporting 负责事件归档与日报。
