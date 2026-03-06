# wt-2 Manager Prompt 优化说明（2026-02-28）

## 1. 链路核对结果
- 运行入口：`src/manager/runner.ts` 调用 `buildManagerPrompt`。
- 提示词构建：`src/prompts/build-prompts.ts` 通过 `loadPromptSource('manager/system.md')` 加载系统提示词。
- 实际生效文件：`prompts/manager/system.md`。

## 2. 本次优化内容
- 修复了示例与约束冲突：
  - `schedule_task.scheduled_at` 示例改为未来时间（`2030-01-02T09:00:00+08:00`）。
  - `query_context.limit_history` 示例由 `5` 调整为与运行时默认一致的 `6`。
- 补齐可执行枚举与格式：
  - `priority`: `high|normal|low`
  - `intent.status`: `pending|blocked|done`
  - `trigger_mode`: `one_shot|on_idle`
  - `focus.status`: `active|idle|done|archived`
  - `query_context.scopes`: 支持 `history|tasks|focus|plans|memory|task_archives`
  - `cron`: 明确为 5/6/7 段（建议 6 段）
- 明确 `summary/open_items` 可空规则：
  - `summary` 可传空字符串用于清空。
  - `open_items` 空字符串视为“不更新”；要清空请传 `[]`。
- 补齐 `update_intent` 最小更新要求：
  - 必须 `id` + 至少一个可编辑字段。
- 强化输出协议与决策顺序：
  - 明确 action 只能出现在回复尾部、逐行输出、尾部不得再跟解释文本。
  - 新增“已注册 Action 白名单”段，避免引入未注册 action。

## 3. 最小验证
- `pnpm -s prompt:preview manager "请给我今天计划"`
  - 结果：成功渲染并输出更新后的 `manager/system.md` 内容。
- `node -e` 抽查 `prompts/manager/system.md` 中示例 action 名称与注册表一致性。
  - 结果：无未注册 action。
- `pnpm -s type-check`
  - 结果：失败（仓库现存问题，非本次改动引入）：
  - `src/manager/action-registry.ts(205,20): error TS2322: Type 'string' is not assignable to type 'Promise<ApplyResult>'.`

## 4. 涉及文件
- `prompts/manager/system.md`
- `generated/wt-2-manager-prompt-optimization-20260228.md`
