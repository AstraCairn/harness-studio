import { describe, expect, it } from "vitest"
import { AgentCheckQueue } from "./agent-check-queue"
import type { AgentType } from "./types"

function harness() {
  const started: AgentType[] = []
  const jobs: Array<{ finish: () => void; current: () => boolean }> = []
  const queue = new AgentCheckQueue(async (agent, _force, current) => {
    started.push(agent)
    await new Promise<void>((finish) => jobs.push({ finish, current }))
  })
  return { queue, started, jobs }
}

describe("AgentCheckQueue", () => {
  it("limits concurrency to two and promotes the selected pending agent", async () => {
    const { queue, started, jobs } = harness()
    const a = queue.enqueue("claude_code")
    const b = queue.enqueue("codex")
    queue.enqueue("gemini")
    queue.enqueue("grok")
    queue.prioritize("grok")
    expect(started).toEqual(["claude_code", "codex"])
    jobs[0].finish()
    await a
    expect(started).toEqual(["claude_code", "codex", "grok"])
    jobs[1].finish()
    await b
    expect(started[started.length - 1]).toBe("gemini")
    queue.stop()
    jobs.slice(2).forEach((job) => job.finish())
  })

  it("deduplicates work and rejects obsolete results after forced refresh", async () => {
    const { queue, started, jobs } = harness()
    const first = queue.enqueue("codex")
    expect(queue.enqueue("codex")).toBe(first)
    const refresh = queue.enqueue("codex", true)
    expect(jobs[0].current()).toBe(false)
    expect(started).toHaveLength(1)
    jobs[0].finish()
    await first
    expect(started).toEqual(["codex", "codex"])
    expect(jobs[1].current()).toBe(true)
    jobs[1].finish()
    await refresh
  })

  it("stops queued work and ignores active results on unmount", async () => {
    const { queue, started, jobs } = harness()
    const a = queue.enqueue("codex")
    const b = queue.enqueue("grok")
    const pending = queue.enqueue("gemini")
    queue.stop()
    await pending
    expect(jobs.every((job) => !job.current())).toBe(true)
    jobs.forEach((job) => job.finish())
    await Promise.all([a, b])
    expect(started).toEqual(["codex", "grok"])
  })

  it("invalidates a deleted agent without dispatching its pending refresh", async () => {
    const { queue, jobs, started } = harness()
    const first = queue.enqueue("codex")
    const pending = queue.enqueue("codex", true)
    queue.remove("codex")
    expect(jobs[0].current()).toBe(false)
    await pending
    jobs[0].finish()
    await first
    expect(started).toEqual(["codex"])
  })
})
