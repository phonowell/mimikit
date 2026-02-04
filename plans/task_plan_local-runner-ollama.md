# 任务计划: local-runner-ollama

## 目标
- 集成 ollama + qwen3 0.6b 作为 local-runner
- 当用户输入与上次用户输入间隔超过 5 分钟时，local-runner 先行快速回复，api-runner 同时继续处理

## 阶段
1. 明确行为与配置（已确认）
   - 触发条件：仅内存态 lastUserInputAt；> 5 分钟
   - 输出呈现：不区分本地/远端；直接展示
   - 模型与 baseUrl：ollama + qwen3:0.6b，默认 localhost:11434
   - 超时：10s
   - prompt：新增 local prompt（无命令、短回复）
2. 实现 local-runner 与并行触发（已完成）
   - src/llm/local-runner.ts
   - src/roles/runner.ts
   - src/supervisor/runtime.ts
   - src/supervisor/manager.ts 或 src/supervisor/supervisor.ts
   - src/config.ts
   - src/cli.ts
   - src/types/history.ts（如需新增角色）
   - src/webui/messages/render.js（如需新增角色）
   - src/webui/components.css（如需新增样式）
3. 手动验证（已完成）
   - 本地模型可正常响应（冷/热启动）
   - local-runner 端到端可用
   - 失败时记录日志不影响主流程

## 决策
- 历史角色：沿用 manager（不区分本地/远端）
- prompt：新增 local prompt
- 空窗判断：仅进程内
- 超时：10s

## 风险
- 本地快速回复与 api 回复顺序可能反转
- 小模型误触发内部命令格式（若复用 manager prompt）
- 历史角色变更影响 WebUI 渲染

## 状态
- 进度: 3/3
- 阻塞: 无
