# notes_webui_quote_style_loss_20260325

- 任务目标：修复 WebUI quote 按钮后 composer quoted preview 样式丢失。
- 当前判断：高概率根因是 `Composer` 组件未把 `hasQuote` 映射为 `.is-visible`，导致 CSS 的展开态永远不生效。
- 待确认：quoted preview 是否还需要显式透传 `quote.role` 以维持用户/系统配色分支。
- 预期修复面：`webui-src/components/Composer.tsx`，必要时补 `webui-src/app-runtime/AppSurfaceRoots.tsx`。

- 结论：根因已确认，quote preview 只补数据没进展示态；已改为显式 `is-visible` + `data-role`。
- 验证：`pnpm exec vitest run tests/webui-react-composer-quote-preview.test.ts`、`pnpm type-check`、`pnpm exec eslint webui-src/components/Composer.tsx webui-src/app-runtime/AppSurfaceRoots.tsx tests/webui-react-composer-quote-preview.test.ts`、`pnpm build:webui` 均通过。
