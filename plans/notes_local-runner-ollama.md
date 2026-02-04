# Notes: local-runner-ollama

## 需求摘录
- 集成 ollama + qwen3 0.6b
- 新增 local-runner（独立于 api-runner / sdk-runner）
- 用户输入距离上次用户输入 > 5 分钟时，local-runner 快速响应，api-runner 同时运行

## 已确认
- 模型 tag: qwen3:0.6b
- baseUrl: http://localhost:11434
- 输出呈现: 不区分本地/远端
- prompt: 新增 local prompt（无命令、短回复）
- 空窗判断: 仅内存
- 超时: 10s

## 已完成
- 本机已安装 ollama（brew）
- 已拉取模型 qwen3:0.6b
