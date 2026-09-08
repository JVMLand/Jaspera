/** Conservative retained-size estimate; never allocates a serialized copy of the payload. */
export function estimatedSize(value: unknown, limit = Infinity): number {
  const seen = new WeakSet<object>();
  let bytes = 0;
  const visit = (item: unknown) => {
    if (bytes > limit || item == null) return;
    if (typeof item === 'string') {
      bytes += 16 + item.length * 2;
      return;
    }
    if (typeof item !== 'object') {
      bytes += 8;
      return;
    }
    if (seen.has(item)) return;
    seen.add(item);
    bytes += 32;
    if (ArrayBuffer.isView(item)) {
      bytes += item.byteLength;
      return;
    }
    if (item instanceof ArrayBuffer) {
      bytes += item.byteLength;
      return;
    }
    if (Array.isArray(item)) {
      bytes += item.length * 8;
      for (const child of item) {
        visit(child);
        if (bytes > limit) break;
      }
    } else {
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        bytes += 16 + key.length * 2;
        visit((item as Record<string, unknown>)[key]);
        if (bytes > limit) break;
      }
    }
  };
  visit(value);
  return bytes;
}
