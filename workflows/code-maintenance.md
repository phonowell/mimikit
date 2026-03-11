# 工作流：文件行数收敛

## 目的
- 把“文件 >200 行需拆分”从口号变成可执行门禁
- 先冻结新增超限与存量继续膨胀，再分期拆历史债
- 用最小必要规则约束代码、协议文档与维护文档的概念密度

## 当前最关键的口号-现状反例
- 规则口号：`README.md` 与 `docs/design/architecture/system-architecture.md` 都强调“单 session / 轻量编排 / 最小必要架构”
- 现状反例 1：受管范围内当前仍有 `48` 个 `>200` 行文件，说明“文件 >200 行需拆分”长期未被工具化执行
- 现状反例 2：`src/manager/` 当前共有 `60` 个文件、`7140` 行，其中 `10` 个文件 `>200` 行；`src/manager/action-apply-schema.ts` 已达 `337` 行，`manager` 目录仍在堆主路径复杂度
- 现状反例 3：核心协议/边界文件仍偏大，`src/providers/opencode-sdk-provider.ts` 为 `845` 行，`docs/design/workflow/interfaces-and-state.md` 为 `226` 行，和“轻量编排内核 + 清晰边界”不一致

## 受管范围
- 根文档：`README.md`、`CONTRIBUTING.md`
- 设计/流程文档：`docs/design/**/*.md`、`workflows/**/*.md`
- 代码与脚本：`src/**/*.{ts,tsx,js,jsx}`、`tests/**/*.{ts,tsx,js,jsx}`、`scripts/**/*.{ts,tsx,js,jsx}`、`webui/**/*.{ts,tsx,js,jsx}`
- 默认阈值：`200` 行

## 入口命令
- 定向检查
```bash
pnpm run guard:file-length
```
- 日常 lint（已内置 guard）
```bash
pnpm run lint
```
- 完整门禁
```bash
pnpm run review-code-changes
```

## 收敛机制
1. `pnpm run guard:file-length` 扫描受管范围并统计行数
2. 新增 `>200` 行文件直接失败，不允许再把新债写进主干
3. 历史超限文件通过 `scripts/file-length-guard-exemptions.tsv` 记录基线 `path + maxLines + reason`
4. 已豁免文件只允许“持平或下降”，一旦高于登记的 `maxLines` 立即失败
5. 文件拆回 `<=200` 后，同一改动中删除对应豁免，避免债务台账失真

## 豁免流程
- 只给历史债务或短期不可拆的真实热点文件豁免，不给新文件预留缓冲
- 在 `scripts/file-length-guard-exemptions.tsv` 中添加精确路径、当前真实行数、简短原因
- `maxLines` 必须等于当前文件行数，不允许预留“以后还能再涨”的冗余空间
- 若一次拆分后行数下降，同步下调 `maxLines`；若已降到阈值内，直接删除该条豁免

## 分期消债
- 把豁免表视为债务清单，不要求一次性清零
- 每次改到超限文件时，默认顺手减少该文件行数或缩小豁免上限
- 优先级顺序：`manager` 主链路 > provider 长文件 > 协议/状态文档 > 其他测试与脚本长文件
- 目标不是“今天全部拆完”，而是“从现在开始不新增、旧债只减不增”

## 验证
- `pnpm run guard:file-length`
- `pnpm run lint`
- `pnpm run type-check`
- `pnpm run test`
- `pnpm run review-code-changes`

## 结果记录
- 记录本次新增/删除的豁免项
- 记录已收缩的超限文件与新行数
- 记录未处理历史债的后续拆分入口
