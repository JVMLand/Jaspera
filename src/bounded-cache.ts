/** Estimated retained payload size, not a measurement of process memory. */
export class BoundedCache<K, V> {
  private entries = new Map<K, { value: V; bytes: number }>();
  private bytes = 0;

  constructor(
    private budget: number,
    private capacity = 128,
    private evicted?: (key: K, value: V) => void,
  ) {}

  get(key: K) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, bytes: number) {
    this.delete(key);
    if (bytes > this.budget) return;
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.bytes > this.budget || this.entries.size > this.capacity) {
      this.delete(this.entries.keys().next().value!);
    }
  }

  delete(key: K) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.entries.delete(key);
    this.evicted?.(key, entry.value);
  }
}

/** Unknown capacity uses the smaller budget; deviceMemory does not report free RAM. */
export function cacheBudget(deviceMemory?: number) {
  return deviceMemory !== undefined && deviceMemory > 4 ? 16 * 1024 * 1024 : 4 * 1024 * 1024;
}

export const defaultCacheBudget = cacheBudget(
  typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
);
