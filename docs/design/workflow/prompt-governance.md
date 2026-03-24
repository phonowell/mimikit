# Prompt 治理与门禁

## 目标

阻止在业务关键路径（`src/**`）新增硬编码 prompt 或词表驱动提示规则，统一走 `prompts/**` + 模板注入。

## 自动化门禁

- 门禁脚本：`scripts/prompt-hardcode-guard.ts`
- 执行入口：`pnpm run lint`（本地）与 CI 的 Lint 步骤
- 检测范围：`src/**/*.ts`（排除 `src/foundation/prompting/**`、`src/policy/prompts/**`、`src/execution/prompts/**` 与生成文件）

门禁判定依据（结构化，不依赖关键词词表）：

1. 字面量是否呈现自然语言段落（CJK 或较长英文语句）
2. 长度与形态是否达到 prompt 风险阈值（长文本、多行、模板标记）
3. 是否位于业务关键路径源文件

## 允许位置

- `prompts/**/*.md`：所有面向 LLM 的系统/上下文/提示模板
- `src/foundation/prompting/**`：模板加载、渲染、共享格式化逻辑
- `src/policy/prompts/**`：manager prompt packet 与策略侧 prompt 组合
- `src/execution/prompts/**`：worker prompt 构建
- `tests/**`：测试样例输入（不进入生产执行路径）
- `docs/**`：文档说明（不进入生产执行路径）

## 推荐写法

- 在 `prompts/**/*.md` 中定义模板
- 在 `src/**` 通过 `loadPromptTemplate` / `loadYamlPromptTemplates` 加载
- 通过 `renderPromptTemplate` 或既有 builder 注入参数

## 豁免流程

仅在确有必要且无法迁移时豁免：

1. 在违规字面量前一行或同一行添加注释：`prompt-guard-exempt:{reason}`
2. `reason` 必须可审计（例如协议常量、兼容边界、第三方约束）
3. 在 PR 说明中附豁免原因与后续清理计划

## 快速验证

```bash
pnpm run lint
```
