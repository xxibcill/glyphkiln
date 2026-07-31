export type AuthenticationAdmissionResult<T> =
  { accepted: true; value: T } | { accepted: false };

export type AuthenticationWorkAdmission = {
  run<T>(
    partition: string,
    operation: () => Promise<T>,
  ): Promise<AuthenticationAdmissionResult<T>>;
};

export type AuthenticationWorkLimiterOptions = {
  maximumConcurrent?: number;
  globalAttempts?: number;
  globalWindowMilliseconds?: number;
  sourceAttempts?: number;
  sourceWindowMilliseconds?: number;
  maximumSourcePartitions?: number;
  now?: () => number;
};

type AdmissionWindow = {
  count: number;
  startedAt: number;
};

/**
 * Bounds memory-hard password work per web process. The reverse proxy still
 * owns source-IP and global request-rate policy; this prevents one process
 * from starting an unbounded number of concurrent Argon2 operations.
 */
export class AuthenticationWorkLimiter implements AuthenticationWorkAdmission {
  readonly #maximumConcurrent: number;
  readonly #globalAttempts: number;
  readonly #globalWindowMilliseconds: number;
  readonly #sourceAttempts: number;
  readonly #sourceWindowMilliseconds: number;
  readonly #maximumSourcePartitions: number;
  readonly #now: () => number;
  #globalWindow: AdmissionWindow;
  readonly #sourceWindows = new Map<string, AdmissionWindow>();
  #active = 0;

  constructor(options: AuthenticationWorkLimiterOptions = {}) {
    this.#maximumConcurrent = boundedInteger(
      options.maximumConcurrent ?? 2,
      1,
      16,
      "Authentication concurrency",
    );
    this.#globalAttempts = boundedInteger(
      options.globalAttempts ?? 120,
      1,
      10_000,
      "Global authentication attempts",
    );
    this.#globalWindowMilliseconds = boundedInteger(
      options.globalWindowMilliseconds ?? 60_000,
      1_000,
      60 * 60 * 1_000,
      "Global authentication window",
    );
    this.#sourceAttempts = boundedInteger(
      options.sourceAttempts ?? 20,
      1,
      1_000,
      "Source authentication attempts",
    );
    this.#sourceWindowMilliseconds = boundedInteger(
      options.sourceWindowMilliseconds ?? 15 * 60_000,
      1_000,
      24 * 60 * 60 * 1_000,
      "Source authentication window",
    );
    this.#maximumSourcePartitions = boundedInteger(
      options.maximumSourcePartitions ?? 10_000,
      1,
      100_000,
      "Authentication source partitions",
    );
    this.#now = options.now ?? Date.now;
    this.#globalWindow = { count: 0, startedAt: this.#now() };
  }

  async run<T>(
    partition: string,
    operation: () => Promise<T>,
  ): Promise<AuthenticationAdmissionResult<T>> {
    const now = this.#now();
    const normalizedPartition = normalizePartition(partition);
    this.#pruneSourceWindows(now);
    const globalWindow = currentWindow(
      this.#globalWindow,
      now,
      this.#globalWindowMilliseconds,
    );
    const sourceWindow = currentWindow(
      this.#sourceWindows.get(normalizedPartition),
      now,
      this.#sourceWindowMilliseconds,
    );
    if (
      this.#active >= this.#maximumConcurrent ||
      globalWindow.count >= this.#globalAttempts ||
      sourceWindow.count >= this.#sourceAttempts ||
      (!this.#sourceWindows.has(normalizedPartition) &&
        this.#sourceWindows.size >= this.#maximumSourcePartitions)
    ) {
      return { accepted: false };
    }
    globalWindow.count += 1;
    sourceWindow.count += 1;
    this.#globalWindow = globalWindow;
    this.#sourceWindows.delete(normalizedPartition);
    this.#sourceWindows.set(normalizedPartition, sourceWindow);
    this.#active += 1;
    try {
      return { accepted: true, value: await operation() };
    } finally {
      this.#active -= 1;
    }
  }

  #pruneSourceWindows(now: number): void {
    for (const [partition, window] of this.#sourceWindows) {
      if (
        now < window.startedAt ||
        now - window.startedAt >= this.#sourceWindowMilliseconds
      ) {
        this.#sourceWindows.delete(partition);
      }
    }
  }
}

export const appAuthenticationWorkLimiter = new AuthenticationWorkLimiter();

function currentWindow(
  window: AdmissionWindow | undefined,
  now: number,
  duration: number,
): AdmissionWindow {
  if (
    window === undefined ||
    now < window.startedAt ||
    now - window.startedAt >= duration
  ) {
    return { count: 0, startedAt: now };
  }
  return window;
}

function normalizePartition(input: string): string {
  return input.length >= 1 && input.length <= 256 && input.isWellFormed()
    ? input
    : "unknown";
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${label} must be an integer from ${minimum.toString()} through ${maximum.toString()}.`,
    );
  }
  return value;
}
