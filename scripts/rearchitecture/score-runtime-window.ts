import { scoreRuntimeWindow } from './score-runtime-window-core.js'
import { requireWindowInput } from './score-runtime-window-model.js'

const main = async (): Promise<void> => {
  const input = requireWindowInput()
  const output = await scoreRuntimeWindow(input)
  console.log(JSON.stringify(output, null, 2))
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[score-runtime-window] ${message}`)
  process.exitCode = 1
})
