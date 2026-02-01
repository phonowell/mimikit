# Prompt 检查与优化工作流（teller/planner/worker）

## 目的
- 统一检查三角色 prompt 的结构、约束与可读性，并落地最小优化。

## 适用范围
- prompts/agents/teller/*
- prompts/agents/planner/*
- prompts/agents/worker/*

## 默认输入
- teller（多输入，按顺序传参）：
  1) "我在 Windows 上维护 Mimikit，需要统一三角色 prompt 风格，要求中文 + XML-like 标签。"
  2) "请补一条优先级规则，并把示例改成行内 JSON；不要向我提问。"
- planner（单请求）：
  "把 prompt 检查流程标准化：1) 生成 report；2) 生成 preview；3) 记录结论到 docs/reports/prompt-review.md。要求每天 09:00 自动触发；如需权限或路径信息缺失，返回 needs_input。"
- worker（单任务）：
  "在仓库内创建 docs/reports/prompt-review.md，写入本次检查结论模板（含结论/问题/建议三节），不使用 Markdown 标题。"
- mode: full（如需可改为 minimal/none）

## 执行步骤
1) 严格逐条执行：一次只运行一条命令，立刻分析并记录，不允许先批量执行再集中分析。
2) Teller 检查：
   - pnpm -s prompt:report teller "我在 Windows 上维护 Mimikit，需要统一三角色 prompt 风格，要求中文 + XML-like 标签。" "请补一条优先级规则，并把示例改成行内 JSON；不要向我提问。"
   - 记录 report 数据与观察结论。
   - pnpm -s prompt:preview teller "我在 Windows 上维护 Mimikit，需要统一三角色 prompt 风格，要求中文 + XML-like 标签。" "请补一条优先级规则，并把示例改成行内 JSON；不要向我提问。"
   - 角色代入：扮演 teller，判断是否能快速给出正确工具调用与回复。
3) Planner 检查：
   - pnpm -s prompt:report planner "把 prompt 检查流程标准化：1) 生成 report；2) 生成 preview；3) 记录结论到 docs/reports/prompt-review.md。要求每天 09:00 自动触发；如需权限或路径信息缺失，返回 needs_input。"
   - 记录 report 数据与观察结论。
   - pnpm -s prompt:preview planner "把 prompt 检查流程标准化：1) 生成 report；2) 生成 preview；3) 记录结论到 docs/reports/prompt-review.md。要求每天 09:00 自动触发；如需权限或路径信息缺失，返回 needs_input。"
   - 角色代入：扮演 planner，判断是否能在最少步数生成 tasks/triggers 或 needs_input。
4) Worker 检查：
   - pnpm -s prompt:report worker "在仓库内创建 docs/reports/prompt-review.md，写入本次检查结论模板（含结论/问题/建议三节），不使用 Markdown 标题。"
   - 记录 report 数据与观察结论。
   - pnpm -s prompt:preview worker "在仓库内创建 docs/reports/prompt-review.md，写入本次检查结论模板（含结论/问题/建议三节），不使用 Markdown 标题。"
   - 角色代入：扮演 worker，判断是否能不超范围完成任务并清晰汇报。
3) 检查清单（逐段核对）：
   - identity：安全边界、职责、优先级/分支规则是否明确。
   - tools：仅列出允许工具，示例不诱导输出，大小写敏感提示明确。
   - rules：关键约束覆盖 needs_input/failed/重复派发等边界。
   - output：JSON-only（或纯文本）要求明确；示例“仅参考”。
4) 落地优化：
   - 只改 prompts/agents 下文案；保持 XML-like 标签结构不变。
   - 以最小改动达成更强约束/更少歧义。
5) 复验：重复步骤 2-4，逐条执行并逐条分析。

## 完成标准
- 预览输出结构完整（identity/tools/rules/output），内容为中文。
- output 规则清晰且不自相矛盾（无示例诱导、无前后缀文本）。
- report 记录清晰，可对比优化前后变化。

## 备注
- 执行期间不向用户提问，使用默认输入完成检查与优化。
- 每次只运行一条命令，立刻记录观察与结论，再运行下一条命令。
