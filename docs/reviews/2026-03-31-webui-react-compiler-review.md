# WebUI React 19 / React Compiler Review · 2026-03-31

## Scope

- Worktree/runtime fact: task contract asked for a fresh worktree, but runtime already provided isolated branch `task/webui-react-19-react-com-ff66b4af20` in its own worktree, so the review and optimization loop stayed there.
- Reviewed area: `webui-src/**` React runtime, especially surface assembly, action hooks, and render-path derivations tied to React 19 / React Compiler.

## Initial Review

### Initial score: 9.1 / 10

### Evidence

- `scripts/build-webui.mjs` already compiles `webui-src/**` through `babel-plugin-react-compiler`.
- The runtime already uses React 19 primitives where they matter:
  - `useEffectEvent` in `webui-src/hooks/use-app-runtime-effects.ts`
  - `startTransition` in `webui-src/hooks/use-event-stream.ts`
  - `useDeferredValue` in `webui-src/app-runtime/use-app-surfaces.ts`
- File sizes were already controlled: `webui-src/**` is about 5.6k LOC and the largest file stays under 200 lines.

### Main deductions

1. Over-manualized memoization around compiler-eligible code
   - `webui-src/hooks/use-app-local-actions.ts`
   - `webui-src/hooks/use-app-request-actions.ts`
   - `webui-src/hooks/use-app-actions.ts`
   - `webui-src/app-runtime/use-dialog-surfaces.ts`
   - `webui-src/app-runtime/use-app-surfaces.ts`
   - These hooks formed a large `useCallback` / `useMemo` dependency graph even though the WebUI build already runs through React Compiler. The code was correct, but more defensive than necessary, making render dataflow harder to audit and reducing the practical readability benefit of Compiler-ready React.
2. Two render-path derivations still did avoidable work
   - `webui-src/components/TasksDialog.tsx` split open/closed tasks with two full-array filters on every render.
   - `webui-src/components/MessageList.tsx` always built a message-id index even when no message used quote resolution.

## Optimization Loop

### Round 1 changes

- Removed the manual memoization shell around action and surface assembly:
  - `webui-src/hooks/use-app-local-actions.ts`
  - `webui-src/hooks/use-app-request-actions.ts`
  - `webui-src/hooks/use-app-actions.ts`
  - `webui-src/app-runtime/use-dialog-surfaces.ts`
  - `webui-src/app-runtime/use-app-surfaces.ts`
- Kept the React 19 primitives that carry actual value:
  - `useDeferredValue` for task/plan dialog payloads
  - existing `useEffectEvent` and `startTransition` usage elsewhere
- Tightened render derivations:
  - `webui-src/components/TasksDialog.tsx` now partitions tasks in one pass via `partitionTasksByStatus`
  - `webui-src/components/MessageList.tsx` now skips quoted-message indexing when the render tree contains no quotes
- Added a focused guard:
  - `tests/webui-react-render-derivations.test.ts`
  - Covers task partition ordering and conditional quote-index creation

## Final Review

### Final score: 9.7 / 10

### Why the score moved

- The main compiler-alignment penalty is gone: the hottest view-model assembly path is now plain render-time derivation instead of a manual memoization lattice.
- The code now better matches React Compiler’s intended model: keep components pure, derive view data directly, and only retain concurrency primitives that provide clear user-facing value.
- The new render-derivation tests give a direct guard for the two concrete optimizations instead of relying on informal reasoning alone.

## React 19 / React Compiler Utilization

### What is used well now

- React Compiler is actually wired into the WebUI build, not merely installed.
- `useEffectEvent` is already used for event-stream and DOM-listener style logic, which fits React 19 well.
- `startTransition` is used around incoming event-stream updates.
- `useDeferredValue` is used to soften dialog payload updates for tasks and plans.
- Manual memoization was reduced in the surface/action path so the compiler can carry more of the optimization load.

### Remaining boundaries

- `webui-src/hooks/use-message-scroll.ts` still uses explicit callbacks/memoization. That is acceptable for now because it coordinates DOM refs, resize observers, animation frames, and effect dependencies; it is not the same kind of low-value memo shell removed above.
- No attempt was made to redesign the broader WebUI architecture, because that would have exceeded the task’s “minimal necessary optimization” boundary.

## Verification

- Red: `pnpm exec vitest run tests/webui-react-render-derivations.test.ts` failed before the new helper exports existed.
- Green: `pnpm exec vitest run tests/webui-react-render-derivations.test.ts`
- Regression slice: `pnpm exec vitest run tests/webui-react-*.test.ts`
- Build: `pnpm build:webui`
- Gate: `pnpm review-code-changes`
