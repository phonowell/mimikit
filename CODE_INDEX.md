# Code Index

*Last updated: 2026-03-10 13:46:28 CST*
*Scope: `src/**/*.ts` + `webui/**/*.js` exported capabilities (function/class/const entry points)*

## Quick Reference

| Category | Export Count | Primary Location |
|---|---:|---|
| Manager Orchestration | 125 | `src/manager/*` |
| Orchestrator Runtime | 50 | `src/orchestrator/core/*` |
| Prompt Building | 41 | `src/prompts/*` |
| Shared Utilities | 33 | `src/shared/*` |
| Focus System | 30 | `src/focus/*` |
| Worker Execution | 26 | `src/worker/*` |
| Storage | 24 | `src/storage/*` |
| Providers | 20 | `src/providers/*` |
| HTTP API | 21 | `src/http/*` |
| History | 15 | `src/history/*` |
| FS Helpers | 13 | `src/fs/*` |
| Action Protocol | 13 | `src/actions/protocol/*` |
| Memory Refresh | 11 | `src/memory/*` |
| Telegram Channel | 7 | `src/channels/telegram/*` |
| WebUI Messages | 56 | `webui/messages/*` |
| WebUI Panels and Views | 50 | `webui/*` |

---

## Runtime Lifecycle (Orchestrator)

| Function/Class | Location | Does What | Signature |
|---|---|---|---|
| `Orchestrator` | `src/orchestrator/core/orchestrator-service.ts:53` | Main runtime façade for start/stop/query | `class Orchestrator` |
| `startOrchestratorRuntime()` | `src/orchestrator/core/orchestrator-runtime-ops.ts:180` | Bootstraps runtime state and loops | `(params) => Promise<void>` |
| `prepareStop()` | `src/orchestrator/core/orchestrator-runtime-ops.ts:218` | Marks runtime as stopping | `(runtime) => void` |
| `persistStopSnapshot()` | `src/orchestrator/core/orchestrator-runtime-ops.ts:232` | Saves final runtime snapshot | `(runtime) => Promise<void>` |
| `hydrateRuntimeState()` | `src/orchestrator/core/runtime-persistence.ts:84` | Loads persisted state into memory | `(params) => Promise<RuntimeState>` |
| `persistRuntimeState()` | `src/orchestrator/core/runtime-persistence.ts:116` | Persists runtime state and cursors | `(runtime) => Promise<void>` |
| `createTask()` | `src/orchestrator/core/task-lifecycle.ts:33` | Creates new task with canonical fields | `(params) => Task` |
| `enqueueTask()` | `src/orchestrator/core/task-lifecycle.ts:61` | Queues task into runtime pending list | `(runtime, task) => EnqueueTaskResult` |
| `markTaskRunning()/Succeeded()/Failed()/Canceled()` | `src/orchestrator/core/task-lifecycle.ts:100` | Task status transitions | `(runtime, taskId, ...) => void` |
| `requestTaskResumeChoice()/clearTaskResumeChoice()` | `src/orchestrator/core/task-resume-choice.ts:60` | Publishes and clears explicit resume choices for budget-paused tasks | `(params) => Promise<boolean>` / `(runtime, taskId) => boolean` |

## Event Signaling and Read Models

| Function | Location | Does What |
|---|---|---|
| `notifyUiSignal()/waitForUiSignal()` | `src/orchestrator/core/signals.ts:69` | UI wake/sleep signaling |
| `notifyManagerLoop()/waitForManagerLoopSignal()` | `src/orchestrator/core/signals.ts:112` | Manager loop wake coordination |
| `notifyWorkerLoop()/waitForWorkerLoopSignal()` | `src/orchestrator/core/signals.ts:138` | Worker loop wake coordination |
| `selectChatMessages()` | `src/orchestrator/read-model/chat-view.ts:134` | Builds chat view payload |
| `buildTaskViews()` | `src/orchestrator/read-model/task-view.ts:118` | Builds task list view model |
| `buildReviewStatusView()` | `src/orchestrator/read-model/review-status-view.ts:73` | Builds async review board cards and highlights |
| `buildFocusViews()` | `src/orchestrator/read-model/focus-view.ts:72` | Builds focus view model |
| `selectRecentPlans()/selectRecentTasks()` | `src/orchestrator/read-model/plan-select.ts:83` | Windowed selection for UI/prompt |

## Manager Loop and Action Pipeline

| Function | Location | Does What |
|---|---|---|
| `managerLoop()` | `src/manager/loop.ts:12` | Main manager processing loop |
| `processManagerBatch()` | `src/manager/loop-batch.ts:32` | Runs one manager batch cycle |
| `runManagerBatch()` | `src/manager/loop-batch-run-manager.ts:55` | Executes manager model call + apply actions |
| `runManagerCorrectionRounds()` | `src/manager/loop-batch-run-rounds.ts:23` | Runs correction rounds when output invalid |
| `runManagerLlmCall()` | `src/manager/manager-llm-call.ts:23` | Calls manager provider with timeout policy |
| `applyTaskActions()` | `src/manager/action-apply.ts:19` | Dispatches parsed actions |
| `validateRunTask()/validateCreatePlan()/validateUpdatePlan()` | `src/manager/action-validation.ts:69` | Per-action validation suite |
| `MANAGER_ACTION_REGISTRY` | `src/manager/action-registrations.ts:19` | Runtime action registry |
| `ACTION_DEFINITIONS` | `src/manager/action-registry-definitions.ts:73` | Canonical action definitions |

## Plan Triggers and Scheduling

| Function | Location | Does What |
|---|---|---|
| `triggerWakeLoop()` | `src/manager/loop-trigger.ts:28` | Checks and fires trigger policies |
| `checkScheduledPlans()` | `src/manager/loop-trigger-plans.ts:22` | Fires `cron/scheduled_at` plans |
| `triggerOnWorkerSlotFreedPlans()` | `src/manager/loop-trigger-plans.ts:142` | Fires `on_worker_slot_freed` plans |
| `resolveWorkerSlotCapacity()` | `src/manager/loop-trigger-shared.ts:24` | Computes current worker slot capacity |
| `firePlan()` | `src/manager/loop-trigger-shared.ts:99` | Converts plan into runnable task |

## Worker Execution and Result Finalization

| Function | Location | Does What |
|---|---|---|
| `workerLoop()` | `src/worker/dispatch.ts:153` | Background worker loop |
| `enqueueWorkerTask()` | `src/worker/dispatch.ts:128` | Pushes task into worker queue |
| `runWorker()` | `src/worker/profiled-runner.ts:74` | Executes one worker task end-to-end |
| `runWorkerLoop()` | `src/worker/profiled-runner-loop.ts:100` | Iterative run/continue logic |
| `runTaskWithRetry()` | `src/worker/run-retry.ts:116` | Retry wrapper around provider execution |
| `cancelTask()` | `src/worker/cancel-task.ts:122` | Task cancellation flow |
| `resumeTask()/resumeRecoverableTasks()` | `src/worker/resume-task.ts:31` | Resume one paused task or batch-resume budget recoverable tasks |
| `resolveTaskChangeAt()/resolveSlotStatus()` | `src/worker/task-state-shared.ts:2` | Shared task transition timestamps and slot status payload |
| `finalizeResult()` | `src/worker/result-finalize.ts:66` | Persists/archive result and updates state |
| `buildTaskResultHandoff()` | `src/worker/result-handoff.ts:113` | Builds manager-visible result payload |

## HTTP API and Streaming

| Function | Location | Does What |
|---|---|---|
| `createHttpServer()` | `src/http/index.ts:108` | Fastify server bootstrap |
| `registerApiRoutes()` | `src/http/routes-api.ts:15` | Registers REST endpoints |
| `registerEventsRoute()` | `src/http/routes-api-events.ts:18` | Registers SSE event stream route |
| `buildDeltaSnapshot()` | `src/http/routes-api-events-shared.ts:81` | Builds SSE delta snapshot |
| `sendSseEvent()` | `src/http/routes-api-events-shared.ts:96` | Writes SSE frame |
| `registerChoiceSelectRoute()` | `src/http/routes-api-choice-select.ts:17` | User choice selection API |
| `registerTaskMutationRoute()` | `src/http/routes-api-task-mutation.ts:25` | Shared route adapter for pause/resume/cancel responses |
| `registerTaskResumeRoute()` | `src/http/routes-api-task-resume.ts:6` | Single-task resume and batch recoverable-resume APIs |
| `registerTaskCancelRoute()` | `src/http/routes-api-task-cancel.ts:6` | Task cancel API |
| `registerTaskArchiveRoute()` | `src/http/routes-api-task-archive.ts:72` | Task archive fetch API |

## WebUI Messaging and Rendering

| Function | Location | Does What |
|---|---|---|
| `createMessagesController()` | `webui/messages/controller.js:28` | Main WebUI message runtime orchestration |
| `createSseController()` | `webui/messages/controller-sse.js:1` | SSE connect/reconnect and event dispatch |
| `renderMessages()` | `webui/messages/render-list.js:22` | Main message list renderer and scroll stabilization |
| `bindChoicePanel()` | `webui/choice.js:70` | User-choice panel rendering and submit flow |
| `bindTasksPanel()` | `webui/tasks.js:19` | Task panel state binding and ticker lifecycle |
| `bindReviewStatusPanel()` | `webui/review-board.js:73` | Async review board rendering and disconnect state |
| `renderTasks()` | `webui/tasks-view-render.js:70` | Task row rendering with timing/usage metadata |
| `renderPlans()` | `webui/plans-view.js:34` | Plan list rendering |
| `renderFocuses()` | `webui/focus-view.js:48` | Focus list rendering and summary formatting |
| `bindRestart()` | `webui/restart.js:118` | Restart/reset dialog and idle-gate control flow |
| `renderMarkdown()` | `webui/markdown.js:89` | Markdown sanitize and render |
| `normalizeMarkdownForRender()` | `webui/markdown-normalize.js:65` | Markdown pre-normalization before render |

## Provider Layer

| Function/Class | Location | Does What |
|---|---|---|
| `runWithProvider()` | `src/providers/registry.ts:41` | Provider selection/dispatch wrapper |
| `codexSdkProvider` | `src/providers/codex-sdk-provider.ts:135` | Codex SDK provider implementation |
| `openAiResponsesProvider` | `src/providers/openai-responses-provider.ts:369` | OpenAI Responses provider implementation |
| `runCodexStream()` | `src/providers/codex-stream.ts:32` | Codex stream integration |
| `loadCodexSettings()` | `src/providers/codex-settings.ts:117` | Loads `~/.codex` settings + env merge |
| `ProviderError` | `src/providers/provider-error.ts:18` | Typed provider error model |
| `buildProviderTimeoutError()` | `src/providers/provider-error.ts:47` | Timeout-specific provider error |

## Prompt Construction

| Function | Location | Does What |
|---|---|---|
| `buildManagerPrompt()` | `src/prompts/build-prompts.ts:59` | Builds manager system+context prompt |
| `buildWorkerPrompt()` | `src/prompts/build-prompts.ts:180` | Builds worker runtime prompt |
| `prepareWorkerTaskPrompt()` | `src/prompts/build-worker-task-prompt.ts:118` | Normalizes/externalizes long task prompts |
| `formatInputs()/formatRecentHistory()` | `src/prompts/format-messages.ts:140` | Message formatting blocks |
| `formatTasksJson()/formatResultsJson()/formatPlansJson()` | `src/prompts/format-content.ts:201` | JSON blocks for prompt sections |
| `loadSystemPrompt()/loadPromptTemplate()` | `src/prompts/prompt-loader.ts:51` | Prompt template loader from `prompts/` |

## Focus and Memory

| Function | Location | Does What |
|---|---|---|
| `ensureFocus()/setFocusStatus()/updateFocus()` | `src/focus/state.ts:53` | Focus entity lifecycle |
| `assignFocusByTargetId()` | `src/focus/assign.ts:17` | Maps task/result to focus |
| `enforceFocusCapacity()` | `src/focus/capacity.ts:61` | Limits active working focuses |
| `upsertFocusDigest()` | `src/focus/state-digest.ts:16` | Maintains focus digest state |
| `syncFocusDigestFromTaskResult()` | `src/focus/result-feedback.ts:153` | Updates focus digest from task results |
| `requestMemoryRefresh()` | `src/memory/refresh/singleflight.ts:187` | Triggers memory refresh job |
| `runMemoryRefreshSingleCall()` | `src/memory/refresh/single-call.ts:109` | Executes one refresh request |
| `rememberMemoryEntry()` | `src/memory/remember-entry.ts:187` | Append/update memory markdown entry |

## Storage, History, FS and Utility

| Function | Location | Does What |
|---|---|---|
| `loadRuntimeSnapshot()/saveRuntimeSnapshot()` | `src/storage/runtime-snapshot.ts:67` | Runtime snapshot persistence |
| `appendTaskResultArchive()` | `src/storage/task-results.ts:109` | Stores task result archives |
| `queryTaskResultArchives()` | `src/storage/task-results-read.ts:361` | Query archived task results |
| `appendTaskProgress()` | `src/storage/task-progress.ts:35` | Task progress stream append/write |
| `readHistory()/appendHistory()` | `src/history/store.ts:88` | Chat history persistence |
| `queryHistory()` | `src/history/query.ts:27` | History lookup query |
| `buildPaths()/ensureDir()/ensureFile()` | `src/fs/paths.ts:23` | State path and file bootstrap |
| `readTextFile()/readTextFileIfExists()` | `src/fs/read-text.ts:12` | UTF-8 text reads |
| `readJson()/writeJson()` | `src/fs/json.ts:67` | JSON read/write helpers |
| `logSafeError()/bestEffort()` | `src/log/safe.ts:49` | Non-fatal error logging wrappers |
| `parseIsoToMs()/compareIsoAsc()` | `src/shared/time.ts:6` | Shared time parsing/sorting |
| `newId()/shortId()/nowIso()` | `src/shared/utils.ts:3` | Core ID/time helper utilities |
| `clipCompactText()` | `src/shared/text.ts:23` | Shared compact+truncate text helper |

## Channel Integration (Telegram)

| Function | Location | Does What |
|---|---|---|
| `startTelegramPolling()/stopTelegramPolling()` | `src/channels/telegram/polling.ts:18` | Polling lifecycle |
| `sendTelegramTextMessage()` | `src/channels/telegram/client.ts:25` | Outbound message dispatch |
| `dispatchTelegramPassiveReply()` | `src/channels/telegram/passive-reply.ts:36` | Passive reply behavior |
| `applyTelegramEnvOverrides()` | `src/channels/telegram/config.ts:26` | Env-driven config merge |

## New Shared Dedup Utilities

| Function | Location | Does What |
|---|---|---|
| `resolveTaskChangeAt()` | `src/shared/task-state.ts:15` | Cross-module task change timestamp resolver |
| `resolveTaskLabel()` | `src/shared/task-state.ts:19` | Shared user-facing task label resolver |
| `isBudgetRecoverableTask()` | `src/shared/task-state.ts:26` | Detects resumable budget-paused partial tasks |
| `resolveSlotStatus()` | `src/worker/task-state-shared.ts:4` | Worker slot occupancy status helper |
| `resolveTaskLookupTarget()` | `src/worker/task-action.ts:42` | Canonical task lookup with `invalid/not_found` early outcome |
| `buildTaskMutationMetaFields()` | `src/worker/task-action.ts:58` | Reusable optional `source/reason` payload expander for mutation logs |
| `registerTaskMutationRoute()` | `src/http/routes-api-task-mutation.ts:25` | Shared pause/resume/cancel route response wrapper |
| `focusIdSchema()/choiceIdSchema()/optionIdSchema()` | `src/shared/id-schema.ts:9` | Canonical ID schema validators |
| `buildPlanTriggerPayload()` | `src/shared/plan-payload.ts:3` | Canonical plan trigger payload builder |
| `buildPlanProgressPayload()` | `src/shared/plan-payload.ts:14` | Canonical plan progress payload builder |
| `asRecord()/asString()` | `src/providers/provider-payload.ts:1` | Shared provider event payload decoders |

---

## Duplicate Audit Baseline (2026-03-07, `src` + `webui`)

- Exact duplicate exported symbol names across files: `0` (scanned 630 exported symbols)
- `jscpd` clones: `3 -> 0` (`duplicatedLines: 67 -> 0`, `duplicatedTokens: 596 -> 0`, threshold `min-lines=8`, `min-tokens=80`)
- `ts-prune`: not rerun in this pass (current scope includes `webui/**/*.js`)
- 2026-03-10 full-scope dedup follow-up: centralized task result summary helpers in `src/shared/task-state.ts`, removed unused local `src/shared/provider-thread-id.ts` duplicate in favor of `src/providers/thread-id.ts`, and collapsed `webui/restart-tools-menu.js` onto `createAnchoredMenuController()` instead of keeping a second noop controller.
- Highest-density modules to inspect before adding code:
  - `src/orchestrator/core/*` (39 exports)
  - `src/manager/*` action/loop related modules
  - `src/prompts/*` formatting/build helpers
  - `webui/messages/*` interaction/rendering helpers
- ID creation should continue to follow prefixed object IDs (`task-`, `plan-`, `input-`, `focus-`, `runtime-`, `packet-`, `sys-`, `agent-`) when composing business/runtime IDs.
