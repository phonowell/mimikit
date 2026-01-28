# notes_core-goal-20260128

## 差距评估
- 7x24 稳定运行：缺少运行心跳/状态落盘（仅依赖外部守护）
- 质量评估：仅 verifyCommand 重试，无内建自评估闭环
- 自我改进/自演化：无“经验/教训”写入与跟随触发
- 成本控制：需要启发式优先、LLM 可选

## 设计要点
- 启发式自评估默认启用，LLM 评估可选配置
- 评估结果写入 tasks.md + memory/LESSONS.md
- 评估问题可选触发 follow-up（独立 prompt）
- Heartbeat JSON 周期写入 stateDir

## 完成情况
- gap: 0
- 7x24: heartbeat + /health stats
- 质量评估: heuristic + optional LLM
- 自驱改进: issue follow-up + lessons
