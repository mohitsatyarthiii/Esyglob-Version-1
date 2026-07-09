type PerfFields = Record<string, string | number | boolean | null | undefined>;

export function perfNow() {
  const host = globalThis as typeof globalThis & { performance?: { now?: () => number } };

  return typeof host.performance?.now === 'function'
    ? host.performance.now()
    : Date.now();
}

export function logPerf(event: string, fields: PerfFields = {}) {
  const payload = {
    event,
    t: Math.round(perfNow()),
    ...fields,
  };

  console.log(`ESYGLOB_PERF ${JSON.stringify(payload)}`);
}
