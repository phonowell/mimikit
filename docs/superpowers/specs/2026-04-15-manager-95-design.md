# Manager 9.5 Design

## Goal

把 manager 从“主线已基本收敛，但默认智能度偏弱、测试 ROI 偏低、实现复杂度仍偏厚”的状态，推进到五个维度都可稳定评为 `>=9.5`。

## Current Gaps

- 默认 manager 模型仍是 `gpt-5.2` + `medium`，与当前产品目标下的“主脑足够智能”不匹配。
- manager 测试中仍残留一批围绕 prompt/reply 文案措辞的低 ROI 断言，维护成本高于收益。
- manager 主链还有少量重复语义和薄封装，虽然已在 200 行边界内，但整体复杂度仍偏厚。

## Decision

本轮只做三刀，不扩范围：

1. 把 manager 默认模型直接升级到 `gpt-5.4` + `high`
2. 收缩低 ROI manager 测试，优先删除或改写纯文案字面断言
3. 再做一轮 manager 主链减法，优先消除重复语义拼装或低价值中间层

## Non-Goals

- 不新增第二套自治调度层
- 不改产品目标、验收边界或 memory/focus/task/plan 分层
- 不为了“更智能”新增 prompt 魔法、关键词表或隐藏协议位
- 不追求一次把 `src` 压到 `<20k LOC`；只做高 ROI 缩减

## Acceptance

- manager 默认配置链路、透传链路和相关测试都切到 `gpt-5.4` + `high`
- manager 低 ROI 文案测试显著下降，保留下来的断言以结构契约、泄漏边界、状态变化为主
- manager 主链代码有明确删减或去重，不引入兼容层
- `pnpm run review-code-changes` 通过
- 复盘时五个维度都可 defensible 地评为 `>=9.5`

## Execution Order

先升默认模型，因为它直接决定智能度上限；再清理低 ROI 测试，降低后续改动噪声；最后做主链减法，确保改完后的复杂度和 ROI 一起上升。
