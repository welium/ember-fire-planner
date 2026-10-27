import { analyze, simulate } from './simulation'
import type { Plan } from './simulation'
self.onmessage = (event: MessageEvent<{ plan: Plan; seed: number; analysis?: boolean }>) => {
  try { self.postMessage({ result: (event.data.analysis ? analyze : simulate)(event.data.plan, event.data.seed) }) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Simulation failed.' }) }
}
