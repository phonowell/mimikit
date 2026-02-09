# Local Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/llm/local-runner.ts`。
- 导出函数：`runLocalRunner`。
- 目标：调用本地兼容 `/chat/completions` 的服务端点。

## 输入与输出
### 输入
- `prompt`、`model`、`baseUrl`、`timeoutMs`。

### 输出
- `{ output, elapsedMs, usage? }`。

## 执行流程
1. 构建 `AbortController + setTimeout` 超时控制。
2. 规范化 `baseUrl`。
3. 发送 `POST {baseUrl}/chat/completions`，载荷：
   - `model`
   - `messages=[{ role:'user', content: prompt }]`
4. 解析响应文本与 usage，返回耗时。
5. 异常时包装为 `[llm] Local request` 错误并抛出。
6. finally 清理 timer。

## 与 API Runner 的差异
- 不读取 `~/.codex` 设置。
- 不处理 OpenAI 鉴权逻辑。
- 必须显式传入 `model` 与 `baseUrl`。

## 当前调用情况
- 目前仓库内未发现运行时调用点（仅导出实现）。
