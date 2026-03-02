# Code Index

*Last updated: 2026-03-02T06:37:35Z*
*Scope: `src/` core capabilities (dedup baseline)*

## Quick Reference

| Category | Count | Primary Location |
|----------|-------|------------------|
| Runtime Orchestration | 11 functions | `src/orchestrator/core/*.ts` |
| Read Models | 7 functions | `src/orchestrator/read-model/*.ts` |
| Retrieval (History/Memory) | 5 functions | `src/history/*.ts`, `src/memory/*.ts`, `src/shared/search-rank.ts` |
| Focus Management | 5 functions | `src/focus/*.ts` |
| Prompt Assembly | 10 functions | `src/prompts/*.ts` |
| Storage/Archive | 3 functions | `src/storage/*.ts` |
| Provider Runtime | 1 function | `src/providers/registry.ts` |
| HTTP API | 2 functions | `src/http/routes-api*.ts` |
| Time Utilities | 5 functions | `src/shared/time.ts` |
| Shared Normalization | 6 functions | `src/shared/{text,query-params,tag-list,json}.ts` |

---

## Runtime Orchestration

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `createTask()` | `src/orchestrator/core/task-lifecycle.ts:33` | Create a new task object with fingerprint/title | `(runtime, input)` |
| `enqueueTask()` | `src/orchestrator/core/task-lifecycle.ts:61` | Push task into runtime queue and emit lifecycle updates | `(runtime, task)` |
| `markTaskRunning()` | `src/orchestrator/core/task-lifecycle.ts:100` | Set task status to running | `(runtime, taskId)` |
| `markTaskSucceeded()` | `src/orchestrator/core/task-lifecycle.ts:110` | Set task status to succeeded | `(runtime, taskId)` |
| `markTaskFailed()` | `src/orchestrator/core/task-lifecycle.ts:116` | Set task status to failed | `(runtime, taskId)` |
| `markTaskCanceled()` | `src/orchestrator/core/task-lifecycle.ts:122` | Set task status to canceled | `(runtime, taskId)` |
| `notifyUiSignal()` | `src/orchestrator/core/signals.ts:67` | Fan out runtime signal to UI waiters | `(runtime, signal)` |
| `notifyManagerLoop()` | `src/orchestrator/core/signals.ts:111` | Wake manager loop | `(runtime)` |
| `notifyWorkerLoop()` | `src/orchestrator/core/signals.ts:137` | Wake worker loop | `(runtime)` |
| `waitForWorkerLoopSignal()` | `src/orchestrator/core/signals.ts:144` | Await next worker signal with abort support | `(runtime, abortSignal?)` |
| `runWithProvider()` | `src/providers/registry.ts:41` | Execute request with selected provider implementation | `(providerId, call)` |

## Read Models

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `mergeChatMessages()` | `src/orchestrator/read-model/chat-view.ts:83` | Merge persisted and inflight chat messages | `(params)` |
| `selectChatMessages()` | `src/orchestrator/read-model/chat-view.ts:92` | Build UI-facing chat feed | `(params)` |
| `buildTaskViews()` | `src/orchestrator/read-model/task-view.ts:58` | Build sorted task cards with counters | `(tasks)` |
| `buildFocusViews()` | `src/orchestrator/read-model/focus-view.ts:35` | Build focus list with context summary/open items | `(focuses, contexts, activeIds, limit?)` |
| `sortTaskPlans()` | `src/orchestrator/read-model/plan-select.ts:69` | Sort plans by status + priority/FIFO | `(plans)` |
| `selectRecentPlans()` | `src/orchestrator/read-model/plan-select.ts:77` | Window-select recent plans by count/bytes | `(plans, params)` |
| `selectOnIdlePlansForTrigger()` | `src/orchestrator/read-model/plan-select.ts:88` | Select active on-idle plans ready to run | `(plans, nowMs?)` |

## Retrieval (History/Memory)

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `queryHistory()` | `src/history/query.ts:126` | Retrieve ranked history snippets from past messages | `(history, request)` |
| `collectDocs()` | `src/history/query-score.ts:44` | Filter and normalize history docs for ranking | `(history, request)` |
| `scoreAndRankDocs()` | `src/history/query-score.ts:76` | Score/sort history lookup messages | `(docs, rankedIds, limit)` |
| `queryMemoryRecords()` | `src/memory/query-score.ts:108` | Retrieve ranked memory snippets with source/tag/score filters | `(records, request)` |
| `rankLookupResults()` | `src/shared/search-rank.ts:14` | Shared ranked-id scoring/sorting pipeline (dedup target) | `(docs, rankedIds, limit, build)` |

## Focus Management

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `enforceFocusCapacity()` | `src/focus/capacity.ts:30` | Keep active/archived focus counts inside configured limits | `(runtime)` |
| `upsertFocusContext()` | `src/focus/state.ts:88` | Create/update/remove focus summary/open-items context | `(runtime, params)` |
| `buildFocusPromptPayload()` | `src/focus/prompt.ts:98` | Build focus prompt context from history/runtime | `(params)` |
| `parseFocusOpenItems()` | `src/focus/parse.ts:3` | Parse open-items string/JSON input into normalized list | `(value?)` |
| `normalizeFocusOpenItems()` | `src/focus/open-items.ts:9` | Normalize/trim focus open-items with optional max bound | `(value, options?)` |

## Prompt Assembly

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `loadPromptFile()` | `src/prompts/prompt-loader.ts:48` | Load role prompt file from `prompts/` with include support | `(role, name)` |
| `renderPromptTemplate()` | `src/prompts/format.ts:25` | Render nunjucks prompt template | `(template, context)` |
| `formatEnvironment()` | `src/prompts/format.ts:32` | Render runtime environment block | `(params?)` |
| `formatInputs()` | `src/prompts/format-messages.ts:47` | Serialize manager inputs into prompt text | `(inputs)` |
| `formatHistoryLookup()` | `src/prompts/format-messages.ts:91` | Serialize history lookup snippets | `(lookup)` |
| `formatMemoryLookup()` | `src/prompts/format-messages.ts:147` | Serialize memory lookup snippets | `(lookup)` |
| `formatActionFeedback()` | `src/prompts/format-messages.ts:172` | Serialize action feedback diagnostics | `(feedback)` |
| `formatTasksYaml()` | `src/prompts/format-content.ts:89` | Serialize tasks into YAML block | `(tasks)` |
| `formatResultsYaml()` | `src/prompts/format-content.ts:111` | Serialize task results into YAML block | `(results, tasks)` |
| `formatPlansYaml()` | `src/prompts/format-content.ts:180` | Serialize task plans into YAML block | `(plans)` |

## Storage/Archive

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `appendTaskResultArchive()` | `src/storage/task-results.ts:93` | Persist task results in append-only archive files | `(stateDir, entry)` |
| `readTaskResultArchive()` | `src/storage/task-results-read.ts:70` | Query archived task results by filters/limits | `(stateDir, request)` |
| `appendTraceArchiveResult()` | `src/storage/traces-archive.ts:98` | Persist trace-level manager/worker exchange archives | `(stateDir, entry)` |

## HTTP API

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `registerApiRoutes()` | `src/http/routes-api.ts:12` | Register REST routes for runtime/task operations | `(app, orchestrator)` |
| `registerEventsRoute()` | `src/http/routes-api-events.ts:76` | Register SSE event stream with snapshot + patches | `(app, orchestrator)` |

## Time Utilities

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `parseIsoMs()` | `src/shared/time.ts:1` | Parse ISO string to timestamp or `undefined` | `(value)` |
| `parseIsoToMs()` | `src/shared/time.ts:6` | Parse ISO string to timestamp with zero fallback | `(value)` |
| `parseIsoToMsOrZero()` | `src/shared/time.ts:11` | Parse optional ISO string to timestamp with zero fallback | `(value?)` |
| `compareIsoAsc()` | `src/shared/time.ts:16` | Compare ISO strings in ascending timestamp order | `(a?, b?)` |
| `compareIsoDesc()` | `src/shared/time.ts:19` | Compare ISO strings in descending timestamp order | `(a?, b?)` |

## Shared Normalization

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `truncateText()` | `src/shared/text.ts:9` | Truncate text with suffix and optional whitespace normalization | `(value, maxChars, options?)` |
| `normalizeInlineWhitespace()` | `src/shared/text.ts:6` | Collapse and trim inline whitespace for prompt-safe text | `(value)` |
| `parseOptionalNumber()` | `src/shared/query-params.ts:1` | Parse optional number-like string with fallback | `(raw, fallback)` |
| `normalizeMsRange()` | `src/shared/query-params.ts:6` | Normalize optional `from/to` ms range into ordered bounds | `(fromMs?, toMs?)` |
| `parseCommaTagList()` | `src/shared/tag-list.ts:5` | Parse comma-delimited tags with trim/dedupe/lowercase option | `(raw, options?)` |
| `toPrettyJsonText()` | `src/shared/json.ts:1` | Render pretty JSON text with trailing newline | `(value)` |
