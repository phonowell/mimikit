# Code Index

*Last updated: 2026-03-24 17:20:00 CST*
*Scope: `src/**/*.ts` + `webui/**/*.js` exported capabilities (function/class/const entry points)*

## Quick Reference

| Category | Export Count | Primary Location |
|---|---:|---|
| Manager Orchestration | 126 | `src/policy/manager/*` |
| Orchestrator Runtime | 50 | `src/kernel/orchestrator/*` |
| Prompt Building | 41 | `src/policy/prompts/*` + `src/execution/prompts/*` + `src/foundation/prompting/*` |
| Shared Utilities | 33 | `src/foundation/shared/*` |
| Focus System | 30 | `src/work/focus/*` |
| Worker Execution | 26 | `src/execution/worker/*` |
| Storage | 24 | `src/persistence/storage/*` |
| Providers | 20 | `src/execution/providers/*` |
| HTTP API | 21 | `src/surface/http/*` |
| History | 15 | `src/persistence/history/*` |
| FS Helpers | 13 | `src/persistence/fs/*` |
| Action Protocol | 13 | `src/policy/actions/protocol/*` |
| Memory Refresh | 11 | `src/policy/memory/*` |
| Telegram Channel | 7 | `src/surface/channels/telegram/*` |
| WebUI Messages | 56 | `webui/messages/*` |
| WebUI Panels and Views | 50 | `webui/*` |

---

## Runtime Lifecycle (Orchestrator)

| Function/Class | Location | Does What | Signature |
|---|---|---|---|
| `Orchestrator` | `src/kernel/orchestrator/orchestrator-service.ts:53` | Main runtime façade for start/stop/query | `class Orchestrator` |
| `startRuntimeLifecycle()` | `src/kernel/orchestrator/orchestrator-runtime-lifecycle.ts:23` | Bootstraps runtime lifecycle and channels | `(runtime) => Promise<void>` |
| `prepareRuntimeStop()` | `src/kernel/orchestrator/orchestrator-runtime-lifecycle.ts:37` | Marks runtime as stopping | `(runtime) => void` |
| `persistRuntimeSnapshotOnStop()` | `src/kernel/orchestrator/orchestrator-runtime-lifecycle.ts:55` | Saves final runtime snapshot | `(runtime) => Promise<void>` |
| `hydrateRuntimeState()` | `src/kernel/orchestrator/runtime-persistence.ts:84` | Loads persisted state into memory | `(params) => Promise<RuntimeState>` |
| `persistRuntimeState()` | `src/kernel/orchestrator/runtime-persistence.ts:116` | Persists runtime state and cursors | `(runtime) => Promise<void>` |
| `createTask()` | `src/work/orchestrator/task-lifecycle.ts:33` | Creates new task with canonical fields | `(params) => Task` |
| `enqueueTask()` | `src/work/orchestrator/task-lifecycle.ts:61` | Queues task into runtime pending list | `(runtime, task) => EnqueueTaskResult` |
| `markTaskRunning()/Succeeded()/Failed()/Canceled()` | `src/work/orchestrator/task-lifecycle.ts:100` | Task status transitions | `(runtime, taskId, ...) => void` |
| `requestTaskResumeChoice()/clearTaskResumeChoice()` | `src/work/orchestrator/task-resume-choice.ts:60` | Publishes and clears explicit resume choices for budget-paused tasks | `(params) => Promise<boolean>` / `(runtime, taskId) => boolean` |

## Event Signaling and Read Models

| Function | Location | Does What |
|---|---|---|
| `notifyUiSignal()/waitForUiSignal()` | `src/kernel/orchestrator/signals.ts:69` | UI wake/sleep signaling |
| `notifyManagerLoop()/waitForManagerLoopSignal()` | `src/kernel/orchestrator/signals.ts:112` | Manager loop wake coordination |
| `notifyWorkerLoop()/waitForWorkerLoopSignal()` | `src/kernel/orchestrator/signals.ts:138` | Worker loop wake coordination |
| `selectChatMessages()` | `src/surface/read-model/chat-view.ts:134` | Builds chat view payload |
| `buildTaskViews()` | `src/surface/read-model/task-view.ts:118` | Builds task list view model |
| `deriveTaskGitClosure()` | `src/surface/read-model/task-git-closure.ts:7` | Derives task git closure view from lifecycle state |
| `buildFocusViews()` | `src/surface/read-model/focus-view.ts:72` | Builds focus view model |
| `selectRecentPlans()/selectRecentTasks()` | `src/surface/read-model/plan-select.ts:83` | Windowed selection for UI/prompt |

## Manager Loop and Action Pipeline

| Function | Location | Does What |
|---|---|---|
| `managerLoop()` | `src/policy/manager/loop.ts:12` | Main manager processing loop |
| `processManagerBatch()` | `src/policy/manager/loop-batch.ts:32` | Runs one manager batch cycle |
| `completeSuccessfulManagerBatch()` | `src/policy/manager/batch-success-finalize.ts:10` | Finalizes successful manager/direct-reply batches and runs shared post-commit side effects |
| `runManagerBatch()` | `src/policy/manager/loop-batch-run-manager.ts:55` | Executes manager model call + apply actions |
| `runManagerCorrectionRounds()` | `src/policy/manager/loop-batch-run-rounds.ts:39` | Runs correction rounds when output invalid |
| `runManagerLlmCall()` | `src/policy/manager/manager-llm-call.ts:23` | Calls manager provider with timeout policy |
| `applyTaskActions()` | `src/policy/manager/action-apply.ts:19` | Dispatches parsed actions |
| `validateRunTask()/validateCreatePlan()/validateUpdatePlan()` | `src/policy/manager/action-validation.ts:74` | Per-action validation suite |
| `validatePlanTriggerFields()/validatePlanEffectFields()` | `src/policy/manager/action-plan-trigger-schema.ts:30` + `src/policy/manager/action-plan-effect-schema.ts:72` | Shared plan trigger/effect schema validation |
| `resolveActionFocusId()` | `src/policy/manager/action-focus-id.ts:10` | Resolves explicit/default focus and touches activity before action apply |
| `findRepeatedRejectedAction()/buildCorrectionFallbackReply()/shouldRetrySelfRepairRound()` | `src/policy/manager/loop-batch-correction-reply.ts:28` | Shared correction fallback classification, self-repair gating, and degrade replies |
| `MANAGER_ACTION_REGISTRY` | `src/policy/manager/action-registry-definitions.ts:188` | Runtime action registry |
| `ACTION_DEFINITIONS` | `src/policy/manager/action-registry-definitions.ts:73` | Canonical action definitions |

## Plan Triggers and Scheduling

| Function | Location | Does What |
|---|---|---|
| `checkScheduledPlans()` | `src/policy/manager/loop-trigger-plans.ts:122` | Fires `cron/scheduled_at` plans |
| `triggerOnWorkerSlotFreedPlans()` | `src/policy/manager/loop-trigger-plans.ts:222` | Fires `on_worker_slot_freed` plans |
| `planScheduleTypeSchema()/validatePlanTriggerFields()` | `src/policy/manager/action-plan-trigger-schema.ts:24` | Canonical external plan trigger schema and cross-field validation |
| `matchesCronNow()/hasNextCronRun()/resolveNextCronRunAtMs()` | `src/policy/manager/plan-cron.ts:3` | Shared timezone-aware cron match and next-run helpers |
| `maybeMarkPlanExhausted()/canFireOnWorkerSlotFreed()` | `src/policy/manager/loop-trigger-plan-execution.ts:33` | Plan exhaustion and slot-freed gating helpers |
| `firePlan()` | `src/policy/manager/loop-trigger-plan-execution.ts:52` | Converts a triggered plan into runnable task side effects |

## Worker Execution and Result Finalization

| Function | Location | Does What |
|---|---|---|
| `workerLoop()` | `src/execution/worker/dispatch.ts:153` | Background worker loop |
| `enqueueWorkerTask()` | `src/execution/worker/dispatch.ts:128` | Pushes task into worker queue |
| `runWorker()` | `src/execution/worker/profiled-runner.ts:74` | Executes one worker task end-to-end |
| `runWorkerLoop()` | `src/execution/worker/profiled-runner-loop.ts:100` | Iterative run/continue logic |
| `runTaskWithRetry()` | `src/execution/worker/run-retry.ts:116` | Retry wrapper around provider execution |
| `cancelTask()` | `src/execution/worker/cancel-task.ts:122` | Task cancellation flow |
| `resumeTask()/resumeRecoverableTasks()` | `src/execution/worker/resume-task.ts:31` | Resume one paused task or batch-resume budget recoverable tasks |
| `resolveTaskChangeAt()/resolveSlotStatus()` | `src/execution/worker/task-state-shared.ts:2` | Shared task transition timestamps and slot status payload |
| `finalizeResult()` | `src/execution/worker/result-finalize.ts:66` | Persists/archive result and updates state |
| `buildTaskResultHandoff()` | `src/execution/worker/result-handoff.ts:113` | Builds manager-visible result payload |

## HTTP API and Streaming

| Function | Location | Does What |
|---|---|---|
| `createHttpServer()` | `src/surface/http/index.ts:108` | Fastify server bootstrap |
| `registerApiRoutes()` | `src/surface/http/routes-api.ts:14` | Registers REST endpoints, task mutation routes, and recoverable resume API |
| `registerEventsRoute()` | `src/surface/http/routes-api-events.ts:18` | Registers SSE event stream route |
| `buildDeltaSnapshot()` | `src/surface/http/routes-api-events-shared.ts:81` | Builds SSE delta snapshot |
| `sendSseEvent()` | `src/surface/http/routes-api-events-shared.ts:96` | Writes SSE frame |
| `registerChoiceSelectRoute()` | `src/surface/http/routes-api-choice-select.ts:17` | User choice selection API |
| `registerTaskMutationRoute()` | `src/surface/http/routes-api-task-mutation.ts:25` | Shared route adapter for task mutation responses |
| `registerTaskArchiveRoute()` | `src/surface/http/routes-api-task-archive.ts:72` | Task archive fetch API |

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
| `runWithProvider()` | `src/execution/providers/registry.ts:41` | Provider selection/dispatch wrapper |
| `codexSdkProvider` | `src/execution/providers/codex-sdk-provider.ts:135` | Codex SDK provider implementation |
| `openAiResponsesProvider` | `src/execution/providers/openai-responses-provider.ts:369` | OpenAI Responses provider implementation |
| `runCodexStream()` | `src/execution/providers/codex-stream.ts:32` | Codex stream integration |
| `loadCodexSettings()` | `src/execution/providers/codex-settings.ts:117` | Loads `~/.codex` settings + env merge |
| `ProviderError` | `src/execution/providers/provider-error.ts:18` | Typed provider error model |
| `buildProviderTimeoutError()` | `src/execution/providers/provider-error.ts:47` | Timeout-specific provider error |

## Prompt Construction

| Function | Location | Does What |
|---|---|---|
| `buildManagerPrompt()` | `src/policy/prompts/build-prompts.ts:130` | Builds manager system+context prompt |
| `buildWorkerPrompt()` | `src/execution/prompts/build-worker-prompt.ts:18` | Builds worker runtime prompt |
| `prepareWorkerTaskPrompt()` | `src/execution/prompts/build-worker-task-prompt.ts:118` | Normalizes/externalizes long task prompts |
| `buildActionFeedbackPromptPayload()/formatActionFeedback()` | `src/foundation/prompting/format-action-feedback.ts:41` | Serializes action feedback and structured repair hints into prompt payload |
| `buildQuoteReferenceLookup()/formatInputs()/formatRecentHistory()` | `src/foundation/prompting/format.ts:94` | Input quote lookup and message formatting blocks |
| `buildTasksPromptPayload()/buildResultsPromptPayload()/formatTasksJson()/formatResultsJson()` | `src/foundation/prompting/format.ts:115` | Task/result prompt payload builders and JSON blocks |
| `buildPlansPromptPayload()/formatPlansJson()` | `src/foundation/prompting/format.ts:123` | Plan prompt payload builders and JSON blocks |
| `loadPromptFile()/loadPromptTemplate()/loadPromptSource()` | `src/foundation/prompting/prompt-loader.ts:50` | Prompt template loader from `prompts/` |

## Focus and Memory

| Function | Location | Does What |
|---|---|---|
| `ensureFocus()/setFocusStatus()/updateFocus()` | `src/work/focus/state.ts:53` | Focus entity lifecycle |
| `assignFocusByTargetId()` | `src/work/focus/assign.ts:17` | Maps task/result to focus |
| `enforceActiveFocusLimit()/pruneArchivedFocuses()` | `src/work/focus/capacity.ts:44` | Limits active focuses and prunes stale archived focuses |
| `normalizeFocusDigestText()/validateFocusDigestText()` | `src/work/focus/digest.ts:11` | Focus digest normalization and validation helpers |
| `syncFocusFromTaskResult()` | `src/work/focus/result-feedback.ts:33` | Updates focus digest from task results |
| `requestMemoryRefresh()` | `src/policy/memory/refresh/singleflight.ts:187` | Triggers memory refresh job |
| `runMemoryRefreshSingleCall()` | `src/policy/memory/refresh/single-call.ts:109` | Executes one refresh request |
| `rememberMemoryEntry()` | `src/work/memory/remember-entry.ts:187` | Append/update memory markdown entry |

## Storage, History, FS and Utility

| Function | Location | Does What |
|---|---|---|
| `loadRuntimeSnapshot()/saveRuntimeSnapshot()` | `src/persistence/storage/runtime-snapshot.ts:67` | Runtime snapshot persistence |
| `appendTaskResultArchive()` | `src/persistence/storage/task-results.ts:109` | Stores task result archives |
| `appendTaskProgress()` | `src/persistence/storage/task-progress.ts:35` | Task progress stream append/write |
| `readHistory()/appendHistory()` | `src/persistence/history/store.ts:88` | Chat history persistence |
| `buildPaths()/ensureDir()/ensureFile()` | `src/persistence/fs/paths.ts:23` | State path and file bootstrap |
| `readTextFile()/readTextFileIfExists()` | `src/persistence/fs/read-text.ts:12` | UTF-8 text reads |
| `readJson()/writeJson()` | `src/persistence/fs/json.ts:67` | JSON read/write helpers |
| `logSafeError()/bestEffort()` | `src/persistence/log/safe.ts:49` | Non-fatal error logging wrappers |
| `toErrorInfo()` | `src/foundation/shared/error-info.ts:13` | Shared error message/name/stack normalizer for logging |
| `parseIsoToMs()/compareIsoAsc()` | `src/foundation/shared/time.ts:6` | Shared time parsing/sorting |
| `newId()/shortId()/nowIso()` | `src/foundation/shared/utils.ts:3` | Core ID/time helper utilities |
| `normalizeUsage()` | `src/foundation/shared/utils.ts:67` | Shared provider/API token usage normalizer |
| `clipCompactText()` | `src/foundation/shared/text.ts:23` | Shared compact+truncate text helper |

## Channel Integration (Telegram)

| Function | Location | Does What |
|---|---|---|
| `startTelegramPolling()/stopTelegramPolling()` | `src/surface/channels/telegram/polling.ts:18` | Polling lifecycle |
| `sendTelegramTextMessage()` | `src/surface/channels/telegram/client.ts:25` | Outbound message dispatch |
| `dispatchTelegramPassiveReply()` | `src/surface/channels/telegram/passive-reply.ts:36` | Passive reply behavior |
| `applyTelegramEnvOverrides()` | `src/surface/channels/telegram/config.ts:26` | Env-driven config merge |

## New Shared Dedup Utilities

| Function | Location | Does What |
|---|---|---|
| `resolveTaskChangeAt()` | `src/work/shared/task-state.ts:15` | Cross-module task change timestamp resolver |
| `resolveTaskLabel()` | `src/work/shared/task-state.ts:19` | Shared user-facing task label resolver |
| `isBudgetRecoverableTask()` | `src/work/shared/task-state.ts:26` | Detects resumable budget-paused partial tasks |
| `resolveSlotStatus()` | `src/execution/worker/task-state-shared.ts:4` | Worker slot occupancy status helper |
| `resolveTaskLookupTarget()` | `src/execution/worker/task-action.ts:42` | Canonical task lookup with `invalid/not_found` early outcome |
| `buildTaskMutationMetaFields()` | `src/execution/worker/task-action.ts:58` | Reusable optional `source/reason` payload expander for mutation logs |
| `registerTaskMutationRoute()` | `src/surface/http/routes-api-task-mutation.ts:25` | Shared task mutation route response wrapper |
| `focusIdSchema()/choiceIdSchema()/optionIdSchema()` | `src/foundation/shared/id-schema.ts:9` | Canonical ID schema validators |
| `hasContiguousIndices()` | `src/policy/manager/action-indexed-attrs.ts:1` | Shared contiguous `1..n` index validation for manager attr parsing |
| `buildPlanTriggerPayload()` | `src/work/shared/plan-payload.ts:3` | Canonical plan trigger payload builder |
| `buildPlanProgressPayload()` | `src/work/shared/plan-payload.ts:14` | Canonical plan progress payload builder |
| `asRecord()/asString()` | `src/execution/providers/provider-payload.ts:1` | Shared provider event payload decoders |

---

## Duplicate Audit Baseline (2026-03-07, `src` + `webui`)

- Exact duplicate exported symbol names across files: `0` (scanned 630 exported symbols)
- `jscpd` clones: `3 -> 0` (`duplicatedLines: 67 -> 0`, `duplicatedTokens: 596 -> 0`, threshold `min-lines=8`, `min-tokens=80`)
- `ts-prune`: not rerun in this pass (current scope includes `webui/**/*.js`)
- 2026-03-10 full-scope dedup follow-up: centralized task result summary helpers in `src/work/shared/task-state.ts`, removed an obsolete local provider-thread-id duplicate in favor of `src/execution/providers/thread-id.ts`, and collapsed `webui/restart-tools-menu.js` onto `createAnchoredMenuController()` instead of keeping a second noop controller.
- 2026-03-11 trim follow-up: inlined task mutation route wrappers into `src/surface/http/routes-api.ts`, removed duplicate provider-side `normalizeUsage()` in favor of `src/foundation/shared/utils.ts`, reused shared text truncation in `src/surface/http/session-ingress-log.ts`, and reduced `jscpd` exact clones from `3` to `2` (`duplicatedLines: 104 -> 38`, `duplicatedTokens: 1095 -> 354`).
- 2026-03-11 safe-error follow-up: extracted `toErrorInfo()` into `src/foundation/shared/error-info.ts`, removed duplicate error normalization from `src/persistence/log/safe.ts` and `src/execution/providers/safe.ts`, and reduced `jscpd` exact clones from `2` to `1` (`duplicatedLines: 38 -> 18`, `duplicatedTokens: 354 -> 152`).
- 2026-03-11 prompt/provider trim: collapsed the duplicated manager prompt parameter shape in `src/policy/prompts/build-prompts.ts` into `BuildManagerPromptParams`, centralized provider proxy preflight validation in `src/execution/providers/utils.ts` via `resolveProviderProxyUrl()` for both OpenAI Responses and Opencode, and extracted shared `resolveErrorFallback()` in `src/foundation/shared/utils.ts` so `src/persistence/log/safe.ts` and `src/execution/providers/safe.ts` keep behavior without duplicating fallback resolution; clone metrics not rerun in this pass.
- 2026-03-20 manager-input-clarity follow-up: checked recent manager/prompt helper extractions against existing capabilities, found no semantic duplicate to merge further, and indexed the new shared action-focus, plan-trigger, correction-reply, cron, and action-feedback formatting helpers for future reuse.
- 2026-03-24 non-webui trim follow-up: centralized contiguous manager attr index checks in `src/policy/manager/action-indexed-attrs.ts`, collapsed duplicated `plan effect` field/type shapes into `src/policy/manager/action-plan-effect-schema.ts`, removed provider/storage-local `TokenUsage` type copies in favor of `src/foundation/types/base.ts`, installed project-local `jscpd` plus `pnpm run audit:duplicates`, and extracted shared test fixtures/setup for manager authorization, lifecycle-route, restart-request, capacity-demand, and retry-session coverage; non-webui `jscpd` scan moved `src + tests` clones from `16` to `4` (`duplicatedLines: 293 -> 95`, `duplicatedTokens: 2633 -> 793`).
- Highest-density modules to inspect before adding code:
  - `src/kernel/orchestrator/*` (39 exports)
  - `src/policy/manager/*` action/loop related modules
  - `src/policy/prompts/*` + `src/execution/prompts/*` + `src/foundation/prompting/*`
  - `webui/messages/*` interaction/rendering helpers
- ID creation should continue to follow prefixed object IDs (`task-`, `plan-`, `input-`, `focus-`, `runtime-`, `packet-`, `sys-`, `agent-`) when composing business/runtime IDs.
