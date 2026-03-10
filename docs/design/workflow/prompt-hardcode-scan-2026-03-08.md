# 硬编码 Prompt / 词表驱动扫描归档（2026-03-08）

## 扫描范围

- 目录：`src/`、`tests/`、`docs/`、`scripts/`、`prompts/`
- 目标：识别
  - 业务关键路径中的硬编码 prompt
  - 词表驱动判定规则
  - 协议常量 / 文档 / 测试中的可豁免项

## 命中清单（逐条归档）

1. `src/manager/action-feedback-contract-hint.ts:5-9,29,54`
- 片段：内联默认文案（`请在此填写任务目标` 等）+ 内联 `<M:enqueue_task ... />` 模板拼接
- 分类：业务路径硬编码 prompt（必须处理）
- 处理决策：已处理
- 处理方式：移除硬编码，统一走 `prompts/manager/action-feedback-hints.md` + `formatEnqueueTaskContractMissingHint`
- 理由：符合“prompt 统一放 prompts/”规则，避免业务代码埋提示词

2. `src/manager/action-feedback-hints.ts:122-126`（历史状态）
- 片段：`TODO_PROMPT/TODO_TITLE/...` 兜底占位
- 分类：业务路径 prompt 兜底字面量（必须处理）
- 处理决策：已处理
- 处理方式：改为从 `prompts/manager/action-feedback-hints.md` 读取默认值字段
- 理由：默认提示值也应模板化，不在 TS 里硬编码

3. `src/channels/shared/source.ts:1`
- 片段：`['telegram', 'feishu']`
- 分类：渠道能力白名单（可豁免）
- 处理决策：豁免
- 理由：这是结构化渠道枚举，不是 prompt 或词表驱动业务意图判定

4. `src/cli/env.ts:10-16`
- 片段：`ALLOWED_REASONING_EFFORT = ['minimal','low','medium','high','xhigh']`
- 分类：配置 schema 枚举（可豁免）
- 处理决策：豁免
- 理由：SDK 参数合法值集合，不涉及 prompt 语义判定

5. `src/manager/action-apply-schema.ts:37-45`
- 片段：`runTaskSchema` 字段枚举（`acceptance_1..5` 等）
- 分类：协议 schema（可豁免）
- 处理决策：豁免
- 理由：结构化参数校验，不是词表驱动逻辑

6. `src/shared/system-event.ts:48`
- 片段：`<M:system_event ...>` 协议标签拼接
- 分类：协议常量（可豁免）
- 处理决策：豁免并添加注释 `prompt-guard-exempt`
- 理由：协议标签必须在代码层生成；非 LLM prompt
- 后续状态：已于 2026-03-10 移除；system event 改为 `text(summary) + systemEventName + systemEventPayload`

7. `src/worker/profiled-runner-loop.ts:18`
- 片段：`<M:skill_usage status="done">...` 完成标签模式
- 分类：协议常量（可豁免）
- 处理决策：豁免并添加注释 `prompt-guard-exempt`
- 理由：worker 回合结束判定契约，非提示词模板

8. `prompts/**/*.md`
- 片段：系统提示、动作模板、上下文模板
- 分类：允许位置（不处理）
- 处理决策：保留
- 理由：仓库规范要求 prompt 统一放在该目录

9. `tests/**/*.test.ts`
- 片段：`<M:...>`、样例 prompt 文本
- 分类：测试夹具（可豁免）
- 处理决策：保留
- 理由：仅用于测试输入/断言，不进入生产执行路径

10. `docs/**/*.md`
- 片段：动作示例、策略文案、规范描述
- 分类：文档文本（可豁免）
- 处理决策：保留
- 理由：文档说明，不参与运行时 prompt 注入

## 词表驱动检查结论

- 未发现以“关键词列表”直接驱动核心能力决策的新实现。
- 现有数组命中均为协议/枚举/schema（如渠道、状态、配置项），不属于禁用模式。

## 门禁结论

- 已新增 `scripts/prompt-hardcode-guard.ts` 并接入 `pnpm run lint`。
- 门禁默认拦截 `src/**` 中“疑似 prompt 形态的长自然语言字面量”（多行/模板标记）。
- 合法协议常量可用 `prompt-guard-exempt:{reason}` 显式豁免并审计。
