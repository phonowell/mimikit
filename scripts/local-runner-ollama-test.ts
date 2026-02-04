import { parseArgs } from 'node:util'
import { defaultConfig } from '../src/config.js'
import { buildLocalPrompt } from '../src/roles/prompt.js'
import { runLocalRunner } from '../src/llm/local-runner.js'

type TestCase = {
  input: string
}

const cases: TestCase[] = [
  { input: '你好，在吗？' },
  { input: '晚上好？' },
  { input: '早上好，今天安排得很满，有点焦虑。' },
  {
    input:
      '我真的很生气，刚刚被无缘无故指责了，我该怎么回复比较好？',
  },
  { input: '你为什么一直不回我消息？是不是故意的？' },
  {
    input:
      '帮我分配一下今天的工作：代码评审 2 小时，修复 bug 1 小时，写周报 1 小时。',
  },
  {
    input:
      '给同事发一条简短消息，让他明天上午 10 点开会，语气礼貌一点。',
  },
  {
    input:
      '你到底有没有脑子？',
  },
  {
    input: `请根据下面的任务描述给出执行步骤和注意事项：
项目背景：我们要在本周内完成一个内部工具的重构，现有问题是页面加载慢、接口重复请求、日志记录不统一。目标是提升首屏速度、减少不必要的请求、统一错误处理。
要求：
1. 首屏加载控制在 2 秒以内；
2. 将相同接口的重复请求合并为一次；
3. 所有错误必须统一记录到日志服务；
4. 不允许引入新的大型依赖；
5. 保持现有功能行为一致；
6. 需要提供上线回滚方案；
7. 需要同步更新简要文档；
8. 需要与 QA 对齐验收标准；
9. 需要给出风险点和缓解措施；
10. 周五下班前完成上线。`,
  },
]

const parseOnly = (value: string | undefined): Set<number> | undefined => {
  if (!value) return undefined
  const set = new Set<number>()
  for (const part of value.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const num = Number(trimmed)
    if (Number.isInteger(num) && num > 0) set.add(num)
  }
  return set.size > 0 ? set : undefined
}

const parseTimeout = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.trunc(num))
}

const usage = () => {
  console.log(
    'Usage: tsx scripts/local-runner-ollama-test.ts [--model name] [--only 1,3,5] [--timeout ms]',
  )
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      model: { type: 'string' },
      only: { type: 'string' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    usage()
    return
  }

  const config = defaultConfig({ stateDir: '.', workDir: '.' })
  const model = values.model?.trim() || config.local.model
  const timeoutMs = parseTimeout(values.timeout, config.local.timeoutMs)
  const baseUrl = config.local.baseUrl
  const onlySet = parseOnly(values.only)
  const selected = onlySet
    ? cases.filter((_, index) => onlySet.has(index + 1))
    : cases
  if (selected.length === 0) {
    console.error('[local-test] no cases selected')
    process.exit(1)
  }

  const errors: Error[] = []
  for (const testCase of selected) {
    const prompt = await buildLocalPrompt({
      workDir: config.workDir,
      input: testCase.input,
      history: [],
    })
    const finalPrompt = prompt
    console.log('---')
    console.log(`输入：${finalPrompt}`)
    const startedAt = process.hrtime.bigint()
    try {
      const { output } = await runLocalRunner({
        model,
        prompt: finalPrompt,
        timeoutMs,
        baseUrl,
      })
      const text = output.trim()
      const elapsedMs = Number(
        (process.hrtime.bigint() - startedAt) / 1_000_000n,
      )
      console.log(`输出：${text || '<empty>'}`)
      console.log(`耗时：${elapsedMs}ms`)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      errors.push(err)
      const elapsedMs = Number(
        (process.hrtime.bigint() - startedAt) / 1_000_000n,
      )
      console.log(`输出：[error] ${err.message}`)
      console.log(`耗时：${elapsedMs}ms`)
    }
    console.log('---')
  }

  if (errors.length > 0) {
    throw new Error(
      `local-runner-ollama-test failed: ${errors.length} case(s)`,
    )
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error),
  )
  process.exit(1)
})
