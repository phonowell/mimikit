# 项目对比分析：Mimikit vs OpenClaw vs Nanobot

## 1. 项目概况

| 维度 | Mimikit | OpenClaw | Nanobot |
| --- | --- | --- | --- |
| 代码规模 | ~7,196 行（TypeScript） | ~430,000 行 | ~4,000 行（Python/TS） |
| GitHub Stars | 未开源 | ~193,000 | ~1,900 |
| 定位 | 轻量 AI 助手 | 个人 AI 助手 | 超轻量替代方案 |
| 架构 | Manager-Worker-Evolver | 单体/插件式 | 微内核/模块化 |
| 开源状态 | 私有 | MIT | MIT |

## 2. 关键差距

### 集成生态

- OpenClaw：700+ skills，平台接入面广。
- Nanobot：覆盖主流 IM 平台，多 provider。
- Mimikit：CLI + WebUI 为主，平台接入不足。

### 记忆能力

- OpenClaw：知识图谱 + 混合检索。
- Nanobot：轻量但可扩展。
- Mimikit：JSONL 增量消费稳定，但长期记忆检索能力偏弱。

### 安全与可控性

- OpenClaw：生态繁荣但扩展安全治理成本高。
- Nanobot：代码短小，审计成本低。
- Mimikit：私有闭环，可控性高，但扩展治理机制待补。

### 部署体验

- OpenClaw：安装与分发链路成熟。
- Nanobot：资源要求低，部署模板较完整。
- Mimikit：需手动准备 Node.js + pnpm，部署门槛偏高。

### 架构质量

- Mimikit：严格类型、角色解耦、代码与测试上限约束清晰。
- Nanobot：极简、研究友好。
- OpenClaw：体量大，复杂度高。

## 3. 技术栈快照

| 维度 | Mimikit | OpenClaw | Nanobot |
| --- | --- | --- | --- |
| 主要语言 | TypeScript (ESM) | TypeScript/Swift/Kotlin | Python/TypeScript |
| LLM SDK | codex-sdk + opencode-sdk | 多 provider | LiteLLM + 多 provider |
| 存储 | JSONL + Markdown | Markdown + 向量 DB | 内存 + 文件 |
| 队列 | `p-queue` | 内置 | 自研 |
| 类型安全 | Zod + 严格 TS | 未知 | Pydantic |

## 4. 改进优先级

### P0

1. 长期记忆检索：向量检索 + 现有检索融合。
2. 部署简化：一键脚本 + Docker。
3. 平台接入：先 Telegram/Discord，再扩展 webhook。

### P1

1. 扩展生态：skills 注册、发现与安全隔离。
2. 多 provider 路由：按成本/能力/稳定性分流。
3. 主动能力：定时任务与事件触发补强。

### P2

1. 社区化准备：文档与示例工程。
2. 可视化增强：任务面板、记忆浏览能力。

## 5. 结论

- Mimikit 现阶段优势是工程约束清晰、实现成本可控、可维护性高。
- 体验短板集中在“生态接入、部署便利、长期记忆”。
- 优先打通 P0 后，再扩展生态层能力。
