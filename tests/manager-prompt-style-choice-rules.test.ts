import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { buildManagerPrompt } from "../src/prompts/build-prompts.js";
import type { PromptSectionLimits } from "../src/config.js";

const promptSectionLimits: PromptSectionLimits = {
  actionFeedbackMaxBytes: 8192,
  batchResultsMaxBytes: 20480,
  environmentMaxBytes: 4096,
  fileLookupMaxBytes: 20480,
  focusContextsMaxBytes: 20480,
  focusListMaxBytes: 8192,
  historyLookupMaxBytes: 20480,
  inputsMaxBytes: 8192,
  memoryMaxBytes: 8192,
  packetSummaryMaxBytes: 6144,
  plansMaxBytes: 16384,
  queryLookupMaxBytes: 20480,
  recentHistoryMaxBytes: 8192,
  tasksMaxBytes: 24576,
};

test("manager prompt enforces concise reply and choice routing rules", async () => {
  const stateDir = await mkdtemp(
    join(tmpdir(), "mimikit-manager-prompt-rules-"),
  );
  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: "input-style-rule-1",
        role: "user",
        text: "给我两个可选方案并让我选一个",
        createdAt: "2026-03-03T00:00:00.000Z",
        focusId: "focus-global",
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits,
    wakeProfile: "user_input",
  });

  expect(prompt).toContain("默认不寒暄、不复述用户已给出的任务、不做无效确认");
  expect(prompt).toContain(
    "只要答复中涉及任务结果，必须附上该任务归档链接：`[任务归档](<archive_path>)`",
  );
  expect(prompt).toContain(
    "若上下文未提供 `archive_path`，必须明确写：`任务归档: 未生成`",
  );
  expect(prompt).toContain(
    "仅当确实需要用户在有限候选中二选一/多选一，且该决定适合留待用户返回后处理时，才使用 `M:ask_user_choice`",
  );
  expect(prompt).toContain(
    "若输入来源包含 `telegram` 或 `feishu`：禁止 `M:ask_user_choice`",
  );
  expect(prompt).toContain(
    "不要把 `M:ask_user_choice` 当作默认澄清方式",
  );
  expect(prompt).toContain(
    "若收到 `trigger_fire` 且本轮同时有用户输入（`wake_profile=mixed`）：先响应用户最新目标；仅当不冲突时再执行该 trigger。",
  );
  expect(prompt).toContain(
    "语义分离：用户要求“收敛范围/只改 worker 层/不要扩散/先做 A”时",
  );
  expect(prompt).toContain("默认使用粗粒度派发：同一目标优先让单个 worker 承接更完整、更宏观、端到端的长链路闭环");
  expect(prompt).toContain(
    "仅在满足明确前后依赖、强边界隔离（模块/权限/focus）、或验收必须分段提交时，才将目标细分为多个任务",
  );
  expect(prompt).toContain(
    "任务拆分门槛：默认一个目标只创建一个 `M:enqueue_task`；若要拆成多个任务，先确认存在“明确依赖/强边界/验收拆分必要”之一",
  );
  expect(prompt).toContain(
    "默认并行：用户未要求串行且不存在硬依赖时，新目标应并行推进",
  );
  expect(prompt).toContain("任务控制门禁：仅在用户显式要求暂停/恢复/取消");
  expect(prompt).toContain(
    "不要通过反复改写同目标 `enqueue_task` 间接触发 deferred cancel",
  );
  expect(prompt).toContain(
    "仅从 `M:event_packet.environment` 中已注入的 `provider_candidates` 选 `enqueue_task.provider`",
  );
  expect(prompt).toContain(
    "当前 wake_profile=`user_input`；未列出的 action 视为本轮不可用。",
  );
  expect(prompt).toContain(
    "`M:enqueue_task`：派发一个 worker 任务",
  );
  expect(prompt).toContain(
    "### 用户交互",
  );
  expect(prompt).toContain(
    "`M:ask_user_choice`：生成一个待用户返回后处理的有限选择",
  );
  expect(prompt).toContain(
    "### 长期记忆",
  );
  expect(prompt).toContain(
    "`M:remember_memory`：写入长期记忆",
  );
  expect(prompt).not.toContain("docs/design/workflow/plan.md");
});
