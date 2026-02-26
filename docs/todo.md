# 代码删减清单

> 当前 `src/` 总行数：**10520**（超限 520 行）
> 目标：≤10000 行，同时消除冗余/矛盾/低 ROI 代码

---

## 一、硬约束违规

| 项 | 现状 | 限制 |
|----|------|------|
| `src/` 行数 | 10520 | ≤10000 |
| 测试用例数 | 50 | ≤50（已满，无法新增） |

---

## 二、CLAUDE.md 与实际代码矛盾（必须修正）

1. **不存在的目录引用** — `CLAUDE.md:59`
   - `src/teller/` ✗ 不存在
   - `src/thinker/` ✗ 不存在
   - `src/tasks/` ✗ 不存在
   - 实际结构：`src/{cli,actions,config*,fs,http,log,manager,orchestrator,prompts,providers,shared,storage,streams,types,worker}`

2. **不存在的文件引用** — `CLAUDE.md:60`
   - `src/llm/sdk-runner.ts` ✗ 不存在
   - 实际 LLM 集成位于 `src/providers/`

3. **行动**：更新 CLAUDE.md 目录结构描述，使其与代码一致

---

## 三、重复代码（合并可削减行数）

### 3.1 时间解析函数重复

- `src/shared/time.ts:1-4` → `parseIsoMs()` 返回 `number | undefined`
- `src/prompts/format-base.ts:8-11` → `parseIsoToMs()` 返回 `number`（无效时返回 0）
- 功能相同，仅错误处理不同
- **行动**：统一为 `src/shared/time.ts` 中单一函数，删除 `format-base.ts` 中的副本

### 3.2 Provider 日志上下文构造重复

- `src/providers/codex-sdk-provider.ts:52-73` → `toLogContext()`
- `src/providers/openai-chat-provider-helpers.ts:10-28` → `appendOpenAiChatLog()`
- 两者构造相同的 `{ role, timeoutMs, promptChars, promptLines, workingDirectory }` 结构
- **行动**：提取共享日志上下文构造器到 `src/providers/` 共享模块

### 3.3 Provider 超时/中断处理重复

- `src/providers/codex-sdk-provider.ts:132-150`
- `src/providers/openai-chat-provider.ts:33-51`
- 两者均创建 `AbortController` + `bindExternalAbort()` + `createTimeoutGuard()` + `resetIdle()`，模式完全一致
- **行动**：提取到共享 provider 工具函数

### 3.4 WebUI `isRecord()` 重复

- `webui/messages/controller.js:29`
- `webui/restart.js:10`
- 完全相同的实现
- **行动**：移至共享工具模块

### 3.5 WebUI 对话框样板代码重复

- `webui/tasks.js:170-205`、`webui/todos.js:49-56`、`webui/restart.js:55-66`
- 三处重复 dialog open/close/click/cancel 事件绑定（各 ~15 行）
- **行动**：抽象为 dialog 工厂函数

### 3.6 WebUI 空状态渲染重复

- `webui/tasks.js:59-63`、`webui/todos.js:38-45`、`webui/tasks-view.js:120-125`、`webui/todos-view.js:34-40`
- 四处相同的"创建空列表项"DOM 结构
- **行动**：提取为共享渲染辅助函数

### 3.7 WebUI HTTP 错误处理重复

- `webui/send.js:44-51`、`webui/tasks.js:91-98` — 相同的 `try { res.json() } catch {}` 错误提取
- `webui/restart.js:157-158` — 不同的简化变体
- **行动**：统一为共享 fetch 错误处理函数

---

## 四、低 ROI / 可精简模块

### 4.1 超大文件（>200 行，应拆分）

| 文件 | 行数 | 问题 |
|------|------|------|
| `src/manager/loop-batch-run-manager.ts` | 287 | 混合管理器调用、反馈验证、UI 流、历史查询 |
| `src/manager/action-feedback-validate.ts` | 267 | 20+ 验证函数堆在一个文件 |
| `src/http/routes-api.ts` | 248 | API 路由 + 快照构建 + ETag 逻辑混合 |
| `src/http/routes-api-task-routes.ts` | 242 | 归档/取消/进度路由合并 |
| `src/providers/codex-sdk-provider.ts` | 237 | Provider 包装器过大 |
| `src/orchestrator/core/orchestrator-service.ts` | 219 | 11 项职责集中 |
| `src/history/manager-events.ts` | 207 | 历史管理 + 系统消息 + 模板加载混合 |

### 4.2 WebUI 过大文件

| 文件 | 行数 | 问题 |
|------|------|------|
| `webui/messages/controller.js` | 454 | EventSource 管理 + 流修补 + 消息状态 + 渲染协调 + 重连逻辑 |
| `webui/tasks-view.js` | 281 | 渲染 + 计时器 + 日期格式化 + DOM 工具混合 |

### 4.3 `tasks-view.js` 死代码

- `resolveProfileText()` (line 33) 始终返回硬编码字符串 `'worker'`，应替换为常量

### 4.4 WebUI 配置分散

- 7+ API 端点硬编码在各文件中（`/api/events`, `/api/input`, `/api/status` 等）
- 6 个超时常量散落在 5 个文件中
- `tasks.js:87` 使用原始 `fetch()` 而非 `fetchWithTimeout()`（不一致）
- **行动**：集中到 `webui/config.js`

---

## 五、文档与代码不一致

### 5.1 设计文档过时

1. **启动顺序遗漏** — `docs/design/architecture/system-architecture.md:22-31`
   - 文档缺少 `notifyWorkerLoop()` 步骤（实际在 `orchestrator-service.ts:107`）

2. **Action 实现位置描述不准确** — `docs/design/workflow/task-and-action.md:56`
   - 文档称实现在 `action-apply.ts`
   - 实际 `query_history` 在 `loop-batch-run-manager.ts:209` 处理
   - 实际 `summarize_task_result` 在 `action-apply-schema.ts:101` 收集、`loop-batch.ts:87` 消费
   - 两者均不经过 `applyTaskActions()` 主分发

### 5.2 参考文档 ROI 评估

| 文件 | 行数 | 评估 |
|------|------|------|
| `docs/reference/sdk/codex-sdk-api.md` | 125 | SDK API 参考，保留 |
| `docs/reference/sdk/codex-sdk-integration.md` | 117 | 集成指南，保留 |
| `docs/reference/comparisons/known.md` | 78 | 竞品对比，低 ROI，考虑精简 |
| `docs/reference/comparisons/manager-rewrite-options-2026-02-25.md` | 48 | 一次性重构方案分析，完成后应归档或删除 |

---

## 六、架构级问题

### 6.1 `RuntimeState` 耦合过重

- 被 19 个文件导入，形成中心辐射式依赖
- 建议：提取只读接口 / facade，降低耦合

### 6.2 `types/index.ts` 单体类型文件

- 174 行，被几乎所有模块导入
- 建议：按领域拆分（task types、message types、config types）

### 6.3 Manager 模块占比过高

- 2357 行，占 `src/` 的 22%
- 建议：审查 `action-feedback-validate.ts`（267 行）是否可简化验证逻辑

---

## 七、优先级排序

### P0 — 必须修复（约束违规）

- [ ] 修正 CLAUDE.md 中不存在的目录/文件引用
- [ ] `src/` 削减至 ≤10000 行

### P1 — 高 ROI 删减（预计可削减 200+ 行）

- [ ] 合并重复时间解析函数（~10 行）
- [ ] 提取 Provider 共享逻辑（日志上下文 + 超时处理，~60 行）
- [ ] 拆分超大文件，在过程中精简冗余逻辑

### P2 — 中 ROI 改进

- [ ] WebUI 重复代码合并（isRecord / dialog 样板 / 空状态渲染 / HTTP 错误处理，~80 行）
- [ ] WebUI 配置集中化（端点 + 超时常量）
- [ ] 更新过时设计文档（启动顺序、Action 处理位置）
- [ ] 清理 `tasks-view.js` 死代码

### P3 — 低 ROI / 长期

- [ ] `RuntimeState` 解耦（提取只读接口）
- [ ] `types/index.ts` 按领域拆分
- [ ] 归档一次性参考文档 `manager-rewrite-options-2026-02-25.md`
