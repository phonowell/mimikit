# 反馈→提高链路

> 返回 [系统设计总览](./README.md)

## 目标
- 明确反馈如何进入系统，并如何转化为可执行的提高动作。
- 统一“反馈采集 / 归档 / 问题队列 / 执行状态”的术语与边界。

## 当前状态（v4）
- 已实现：反馈采集、结构化归档、问题去重与排序。
- 未启用：自动代码提升执行通道。
- 结论：当前闭环到“可行动问题队列”结束，提高动作需要由调度策略或人工触发。

## 链路总览
```
反馈信号
  → 结构化反馈事件（feedback.jsonl）
  → 问题归一化（fingerprint/category/ROI/confidence/action）
  → 问题队列（issue-queue.json）
  → 可行动问题筛选（open + ROI阈值 + 置信度阈值）
  → （当前默认）人工/策略触发改进任务
  → 验证与回写状态
```

## 反馈入口
- Manager 命令：`@capture_feedback`。
- 空闲回顾：idle review 可写入反馈信号。
- 运行时信号：失败、延迟、成本等运行事件可写入反馈。

## 数据落盘
- `evolve/feedback.jsonl`：反馈事件主流水。
- `evolve/feedback-archive.md`：可读审计轨迹。
- `evolve/issue-queue.json`：按 fingerprint 聚合后的问题队列。

## 问题聚合与筛选
- 聚合键：`issue.fingerprint`（归一化后去重）。
- 队列排序：优先按 `roiScore`，再按出现次数与最近时间。
- 可行动条件：`status=open` 且 `roiScore` 达阈值，且 `confidence >= 0.4`。
- 状态语义：`open / deferred / ignored / resolved`。

## 提高动作与责任边界
- Manager：负责采集反馈、下发命令与对用户沟通。
- Worker：负责执行任务，不直接与用户对话。
- Supervisor：负责调度、快照恢复与成本闸门。
- Evolve 子系统：负责反馈归档、问题聚合与可行动筛选。

## 当前缺口与约束
- 自动“问题→代码改进→验证→上线”流水线已移除。
- 文档中的“提高”默认指“产出可执行改进候选”，而非“自动完成代码变更”。

## 恢复自动闭环时的最小要求
- 触发：仅消费可行动问题子集，限制每轮最大问题数。
- 执行：改进任务走统一 worker 系统任务通道，不阻塞在线请求。
- 验证：必须有可复现验证步骤，失败可回滚。
- 回写：将结果写回问题状态（`resolved/deferred/open`）并记录证据。

## 相关文档
- 命令协议：`docs/design/commands.md`
- Supervisor 双循环：`docs/design/supervisor.md`
- 状态目录：`docs/design/state-directory.md`
- 任务系统：`docs/design/task-system.md`
- 运行接口：`docs/design/interfaces.md`
