// A small in-process scheduler: one setInterval per job, with an overlap guard.
//
// Overlap guard: the scheduler remembers which jobs are running. When a job's timer fires
// while its previous run is still going, that tick is skipped (and logged) instead of
// starting a second copy. `exclusive` uses the same guard, so the nightly re-sync never runs
// e.g. "calls" at the same time as the normal calls job.
import type { Logger } from "./log";

export type ScheduledJob = {
  /** Also the guard key: two jobs with the same name never run at the same time. */
  name: string;
  everyMs: number;
  /** Run once right away when the scheduler starts. */
  runAtStart: boolean;
  tick: () => Promise<unknown>;
};

export type StopResult = { timedOut: boolean; stillRunning: string[] };

export function createScheduler(log: Logger) {
  const running = new Map<string, Promise<void>>();
  const timers: NodeJS.Timeout[] = [];
  let stopping = false;

  /** Runs `work` under the guard `name`, waiting for a running copy to finish first. */
  async function exclusive<T>(name: string, work: () => Promise<T>): Promise<T | undefined> {
    while (running.has(name)) await running.get(name);
    if (stopping) return undefined;
    const promise = work();
    const settled = promise.then(
      () => undefined,
      () => undefined,
    );
    running.set(name, settled);
    try {
      return await promise;
    } finally {
      running.delete(name);
    }
  }

  function fire(job: ScheduledJob): void {
    if (stopping) return;
    if (running.has(job.name)) {
      log.info({ job: job.name }, "previous run still going, tick skipped");
      return;
    }
    exclusive(job.name, job.tick).catch((error: unknown) => {
      // run-job already catches job errors; this is only a last safety net.
      log.error({ job: job.name, error: error instanceof Error ? error.message : String(error) }, "tick crashed");
    });
  }

  return {
    exclusive,

    isRunning: (name: string) => running.has(name),

    start(jobs: readonly ScheduledJob[]): void {
      for (const job of jobs) {
        if (job.runAtStart) fire(job);
        timers.push(setInterval(() => fire(job), job.everyMs));
      }
    },

    /** Starts no new runs, then waits up to `timeoutMs` for the running ones. */
    async stop(timeoutMs: number): Promise<StopResult> {
      stopping = true;
      for (const timer of timers) clearInterval(timer);

      let timer: NodeJS.Timeout | undefined;
      const timedOut = await Promise.race([
        (async () => {
          while (running.size > 0) await Promise.all(running.values());
          return false;
        })(),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(true), timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      return { timedOut, stillRunning: [...running.keys()] };
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
