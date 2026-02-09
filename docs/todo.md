# TODO

- [x] 为所有 JSONP 通道补充 prune 策略（`user-input` / `worker-result` / `teller-digest` / `thinker-decision`），当前仅有实现与测试、未接入运行时调用。
- [x] 调整职责边界：让 `thinker` 直接消费 `worker-result`（决策层直连结果），`teller` 仅保留摘要/最终出话；已完成全量切换并移除兼容代码。
