# 状态目录

> 返回 [系统设计总览](./README.md)

默认目录：`./.mimikit/`

## 关键文件
- `history.jsonl`：用户与 assistant/system 历史消息。
- `log.jsonl`：运行日志事件。
- `runtime-state.json`：任务快照 + evolve + 通道 cursor。

## 通道目录
- `channels/user-input.jsonp`
- `channels/worker-result.jsonp`
- `channels/teller-digest.jsonp`
- `channels/thinker-decision.jsonp`

## 归档目录
- `task-results/YYYY-MM-DD/*.txt`
- `llm/YYYY-MM-DD/*.txt`

