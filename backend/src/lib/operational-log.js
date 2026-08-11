const REDACTED_KEYS = /authorization|token|secret|password|credential|email|phone|address|customer|payload/i;

export function operationalLog(event, fields = {}) {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key, value]) => (
    !REDACTED_KEYS.test(key) && value !== undefined && value !== null
  )));
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...safe }));
}
