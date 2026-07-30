import pLimit, { type LimitFunction } from "p-limit";

/**
 * Per-connection bulkhead for best-effort SSH work.
 *
 * Agent RPC, terminals, SFTP, and explicit user actions intentionally bypass this scheduler. Only
 * periodic collectors enter it, so a metrics sample and a tmux scan cannot consume two channels on
 * the same SSH transport at once. ssh2 does not expose channel priority or bandwidth QoS; limiting
 * background concurrency is the dependable isolation mechanism.
 */
export class SshBackgroundTaskScheduler {
  private readonly limits = new Map<string, LimitFunction>();

  async run<Result>(connectionKey: string, task: () => Promise<Result>) {
    const limit = this.limitFor(connectionKey);
    try {
      return await limit(task);
    } finally {
      queueMicrotask(() => {
        if (
          this.limits.get(connectionKey) === limit &&
          limit.activeCount === 0 &&
          limit.pendingCount === 0
        ) {
          this.limits.delete(connectionKey);
        }
      });
    }
  }

  private limitFor(connectionKey: string) {
    const existing = this.limits.get(connectionKey);
    if (existing !== undefined) return existing;
    const limit = pLimit(1);
    this.limits.set(connectionKey, limit);
    return limit;
  }
}
