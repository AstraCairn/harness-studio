import type { AgentType } from "@/lib/types"

type Job = {
  agent: AgentType
  force: boolean
  generation: number
  promise: Promise<void>
  resolve: () => void
}

/** Two bounded lanes; changing selection promotes pending work. */
export class AgentCheckQueue {
  private pending = new Map<AgentType, Job>()
  private active = new Map<AgentType, Job>()
  private generations = new Map<AgentType, number>()
  private preferred: AgentType | null = null
  private stopped = false

  constructor(
    private run: (
      agent: AgentType,
      force: boolean,
      isCurrent: () => boolean
    ) => Promise<void>
  ) {}

  prioritize(agent: AgentType) {
    this.preferred = agent
    this.pump()
  }

  enqueue(agent: AgentType, force = false): Promise<void> {
    if (this.stopped) return Promise.resolve()
    const pending = this.pending.get(agent)
    if (pending && (!force || pending.force)) return pending.promise
    const active = this.active.get(agent)
    if (active && !force && active.generation === this.generations.get(agent)) {
      return active.promise
    }
    pending?.resolve()
    let resolve!: () => void
    const promise = new Promise<void>((done) => (resolve = done))
    const generation = (this.generations.get(agent) ?? 0) + 1
    this.generations.set(agent, generation)
    this.pending.set(agent, { agent, force, generation, promise, resolve })
    this.pump()
    return promise
  }

  remove(agent: AgentType) {
    this.generations.set(agent, (this.generations.get(agent) ?? 0) + 1)
    this.pending.get(agent)?.resolve()
    this.pending.delete(agent)
  }

  stop() {
    this.stopped = true
    for (const job of this.pending.values()) job.resolve()
    this.pending.clear()
  }

  private pump() {
    while (!this.stopped && this.active.size < 2) {
      const job =
        (this.preferred && !this.active.has(this.preferred)
          ? this.pending.get(this.preferred)
          : undefined) ??
        [...this.pending.values()].find((item) => !this.active.has(item.agent))
      if (!job) return
      this.pending.delete(job.agent)
      this.active.set(job.agent, job)
      const isCurrent = () =>
        !this.stopped && this.generations.get(job.agent) === job.generation
      void this.run(job.agent, job.force, isCurrent)
        .catch(() => {})
        .finally(() => {
          this.active.delete(job.agent)
          job.resolve()
          this.pump()
        })
    }
  }
}
