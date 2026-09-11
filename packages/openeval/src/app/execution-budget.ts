type Kind = "eval" | "judge";
type Waiting = { kind: Kind; start(): void; cancel(): void };

/** One stage budget. Live monitors reserve one lane so long evals cannot starve checks. */
export class ExecutionBudget {
  private active = 0;
  private evals = 0;
  private monitors = 0;
  private waiting: Waiting[] = [];
  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error("Invalid concurrency limit");
  }
  monitor() {
    if (this.limit < 2)
      throw new Error("Early stopping requires concurrency of at least 2");
    this.monitors++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.monitors--;
      this.pump();
    };
  }
  run<T>(kind: Kind, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const request: Waiting = {
        kind,
        cancel: () => {
          this.waiting = this.waiting.filter((item) => item !== request);
          signal?.removeEventListener("abort", request.cancel);
          reject(signal?.reason);
          this.pump();
        },
        start: () => {
          signal?.removeEventListener("abort", request.cancel);
          this.active++;
          if (kind === "eval") this.evals++;
          Promise.resolve()
            .then(work)
            .then(resolve, reject)
            .finally(() => {
              this.active--;
              if (kind === "eval") this.evals--;
              this.pump();
            });
        },
      };
      this.waiting.push(request);
      signal?.addEventListener("abort", request.cancel, { once: true });
      this.pump();
    });
  }
  private pump() {
    while (this.active < this.limit) {
      let index = this.waiting.findIndex((item) => item.kind === "judge");
      if (index < 0 && this.evals < this.limit - (this.monitors ? 1 : 0))
        index = this.waiting.findIndex((item) => item.kind === "eval");
      if (index < 0) return;
      this.waiting.splice(index, 1)[0].start();
    }
  }
}
