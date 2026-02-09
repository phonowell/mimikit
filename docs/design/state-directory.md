# 状态目录

> 返回 [系统设计总览](./README.md)

默认目录：`./.mimikit/`

## 关键文件
- `history.jsonl`：用户与 assistant/system 历史消息。
- `log.jsonl`：运行日志事件。
- `runtime-state.json`：任务快照 + evolve + 通道 cursor（2026-02-09 起使用 strict schema 校验）。
- `task-progress/{taskId}.jsonl`：standard worker 分步执行进度（2026-02-09 起按 schema 逐行校验，坏行忽略）。
- `task-checkpoints/{taskId}.json`：standard worker 断点状态快照（2026-02-09 起按 schema strict 校验）。

## runtime-state 结构约束（2026-02-09）
- 仅接受 `channels.teller.userInputCursor` / `workerResultCursor` / `thinkerDecisionCursor`。
- 仅接受 `channels.thinker.tellerDigestCursor`。
- 不再兼容历史平铺字段：`tellerUserInputCursor`、`tellerWorkerResultCursor`、`tellerThinkerDecisionCursor`、`thinkerTellerDigestCursor`。

## task-progress 结构约束（2026-02-09）
- 每行必须是合法 JSON 且满足：`taskId`/`type`/`createdAt` 为非空字符串，`payload` 为对象。
- 含未知字段或结构不符的事件行在读取时会被忽略。

## task-checkpoint 结构约束（2026-02-09）
- checkpoint 必须满足：`taskId`/`stage`/`updatedAt` 为非空字符串，`state` 为对象。
- 含未知字段或结构不符的 checkpoint 在加载时返回 `null`。

## 通道目录
- `channels/user-input.jsonp`
- `channels/worker-result.jsonp`
- `channels/teller-digest.jsonp`
- `channels/thinker-decision.jsonp`

## 归档目录
- `tasks/YYYY-MM-DD/*.md`
- `llm/YYYY-MM-DD/*.txt`
