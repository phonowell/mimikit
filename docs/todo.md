# TODO

- [ ] 为所有 JSONP 通道补充 prune 策略（`user-input` / `worker-result` / `teller-digest` / `thinker-decision`），当前仅有实现与测试、未接入运行时调用。
- [ ] 调整职责边界：让 `thinker` 直接消费 `worker-result`（决策层直连结果），`teller` 仅保留摘要/最终出话；采用兼容迁移（双消费过渡 → 切换单消费 → 清理旧 cursor/通道依赖）。
