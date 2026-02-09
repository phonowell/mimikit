# Action 协议与能力层

> 返回 [系统设计总览](./README.md)

## 目标与边界
- `src/actions` 只负责通用 action 能力（协议、定义、校验、调用）。
- `src/actions` 不承载角色逻辑（worker/thinker/teller）。
- 角色侧策略在：`src/worker/*`、`src/orchestrator/*`、`src/teller/*`。

## 全量 Action 名称
来源：`src/actions/model/names.ts`。

- 文件类：`read_file` `search_files` `write_file` `edit_file` `patch_file`
- 进程类：`exec_shell` `run_browser`
- 任务类：`create_task` `cancel_task` `summarize_task_result` `capture_feedback`
- 消息类：`respond` `digest_context` `handoff_context`

说明：
- “可执行 action”（可被 `invokeAction` 直接运行）当前有：`read_file` `search_files` `write_file` `edit_file` `patch_file` `exec_shell` `run_browser`。
- 任务类 action 由 orchestrator 消费；消息类 action 由 worker/teller 解析消费。

## 入参命名规范（强约束）
- 所有 action 入参使用 `snake_case`。
- 每个语义仅一个字段名，不允许别名。
- action schema 不接受未知字段（`z.object(...).strict()`）。

## 目录分层
- `model/*`：核心类型（name/spec/result/parsed）。
- `protocol/*`：`<MIMIKIT:actions>` 提取与 action 行解析。
- `defs/*`：可执行 action 的能力定义（fs/shell/browser）。
- `registry/index.ts`：可执行 action 注册与查询。
- `runtime/invoke.ts`：统一调用入口（name + args）。
- `shared/*`：参数解析、路径处理、shell 拼接、安全包装。

## 协议格式
- Action 块：`<MIMIKIT:actions> ... </MIMIKIT:actions>`。
- 每行一条：`@name key="value" key2="value2"`。
- 参数传输层统一字符串；执行前按 zod schema 解析。
- 不支持 JSON action 负载。

## 参数校验与通用错误
来源：`src/actions/shared/args.ts`。

- `parseArgs`：支持对象输入或 JSON 字符串输入。
- schema：统一 `z.object(...).strict()`，拒绝未知字段。
- 统一错误码：
  - `action_args_invalid_json`
  - `action_args_invalid`
  - `action_arg_invalid:{field}`

## 调用模型（runtime + registry）
来源：`src/actions/registry/index.ts` + `src/actions/runtime/invoke.ts`。

- `registry` 维护可执行 action 映射（name -> spec）。
- `invokeAction(context, name, args)` 执行流程：
  1) 查找 spec；
  2) `parseArgs` 做 schema 校验；
  3) 调用 spec.run；
  4) `safeRun` 捕获异常并返回统一失败结果。
- 未注册 action：返回 `unknown_action:{name}`。

## 可执行 Action 详情（defs）

### `read_file`
来源：`src/actions/defs/fs/read.ts`
- 入参：`path` `start_line?` `line_count?`。
- 默认：`start_line=1`、`line_count=100`。
- 限制：`line_count <= 500`。
- 行为：按起始行与行数返回文本切片。
- 返回：`details.path` `details.total_lines` `details.start_line` `details.line_count` `details.end_line`。
- 失败：`file_not_found`。

### `search_files`
来源：`src/actions/defs/fs/search.ts`
- 入参：`pattern` `path_glob?` `max_results?`。
- 默认：`path_glob=**/*`、`max_results=50`。
- 限制：`max_results <= 200`。
- 行为：文本包含匹配（逐行），输出 `relativePath:line:text`。
- 返回：`details.match_count` `details.scanned_files`。

### `write_file`
来源：`src/actions/defs/fs/write.ts`
- 入参：`path` `content`。
- 行为：UTF-8 写入。
- 返回：`write ok: {path}` + `details.bytes`。

### `edit_file`
来源：`src/actions/defs/fs/edit.ts`
- 入参：`path` `old_text` `new_text` `replace_all`。
- 行为：`replace_all=true` 时全替换；否则替换首个匹配。
- 失败：`file_not_found`、`old_text_not_found`。

### `patch_file`
来源：`src/actions/defs/fs/patch.ts`
- 入参：`path` `patch`（unified diff 文本）。
- 引擎：第三方 `diff` 库（`applyPatch`）。
- 策略：`fuzzFactor=0`、`autoConvertLineEndings=true`。
- 行为：补丁应用成功则写回；失败返回错误。
- 失败：`file_not_found`、`patch_apply_failed`。

### `exec_shell`
来源：`src/actions/defs/shell/exec.ts`
- 入参：`command`。
- 行为：自动 prepend `cd {workDir}`；再执行命令。
- 失败：`exec_exit_{code}`。

### `run_browser`
来源：`src/actions/defs/browser/run.ts`
- 入参：`command`。
- 行为：执行 `npx -y agent-browser {command} --json`。
- 失败：`browser_exit_{code}`。

## 任务类 Action（orchestrator 消费）
来源：`src/orchestrator/roles/thinker/thinker-action-apply.ts`。

### `create_task`
- 入参：`prompt` `title` `profile`。
- 规则：`profile` 只允许 `standard|expert`。
- 去重：`prompt + title + profile` 组成 dedupe key。

### `cancel_task`
- 入参：`task_id`。
- 行为：调用 `cancelTask(..., { source: 'thinker' })`。

### `summarize_task_result`
- 入参：`task_id` `summary`。
- 行为：汇总为 `Map<taskId, summary>` 供历史写入阶段使用。

### `capture_feedback`
- 入参：`message`。
- 行为：写入结构化反馈，`source = thinker_action`。

## 消息类 Action（角色侧消费）

### `respond`
来源：`src/worker/standard-step.ts`
- 入参：`response`。
- 用途：standard worker 结束本任务并返回最终文本。

### `digest_context` / `handoff_context`
来源：`src/teller/digest-summary.ts`
- 入参：`summary`。
- 用途：teller 内部交接给 thinker 的去噪摘要。

## standard worker 解析/执行链路
- 解析：`src/worker/standard-step.ts`。
  - 入口：`parseStandardStep(output)`。
  - 选取：只取最后一条有效 action。
  - 错误：
    - `standard_step_empty`
    - `standard_step_parse_failed:missing_valid_action`
    - `standard_step_unknown_action:{name}`
    - `standard_action_attr_invalid:{field}`
    - `standard_action_args_invalid`
- 执行：`src/worker/standard-step-exec.ts`。
  - 事件：`action_call_start` / `action_call_end`。
  - 输出截断：`output` 超过 20,000 字符会裁剪。

## 扩展规范（新增一个可执行 action）
1. 在 `defs/*` 新增 spec（`name/schema/run`）。
2. 在 `registry/index.ts` 注册。
3. 补充测试（解析、参数校验、执行行为）。
4. 更新本文件与相关 prompt 可用 action 列表。
