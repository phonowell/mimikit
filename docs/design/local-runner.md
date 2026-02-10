# Local Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/llm/local-runner.ts`
- 导出函数：`runLocalRunner`
- 目标：调用本地兼容 `/chat/completions` 服务

## 输入与输出
### 输入
- `prompt`、`model`、`baseUrl`、`timeoutMs`

### 输出
- `{ output, elapsedMs, usage? }`

## 执行流程
1. 构建超时控制。
2. 请求本地 `/chat/completions`。
3. 解析输出文本与 usage。
4. 失败抛错并清理 timer。

## 当前调用情况
- 当前仓库未作为运行时主链路调用。
