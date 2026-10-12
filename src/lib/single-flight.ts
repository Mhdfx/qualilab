/**
 * At most one run per key at a time, in this process. A second call while
 * the first is under way does not run: it is told so (`ran: false`) and the
 * caller answers « déjà en cours ». The laboratory runs one application
 * process (DEPLOY.md), so this is enough to stop two simultaneous clicks
 * from doing a non-repeatable thing twice — such as e-mailing a report
 * (full-db recette 12/10: two « Renvoyer au client » at once sent two
 * e-mails). It is not a lock across processes, nor a rate limit: a call
 * after the first one finished runs normally.
 */
export class SingleFlight {
  private readonly running = new Set<string>();

  async run<T>(key: string, task: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
    if (this.running.has(key)) return { ran: false };
    this.running.add(key);
    try {
      return { ran: true, value: await task() };
    } finally {
      this.running.delete(key);
    }
  }

  /** Whether a run for this key is under way (for tests and diagnostics). */
  isRunning(key: string): boolean {
    return this.running.has(key);
  }
}
