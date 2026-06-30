export function formatValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(item => formatValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => `${humanize(key)}: ${formatValue(item)}`)
      .join('\n');
  }

  return String(value);
}

export function humanize(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').replace(/^./, char => char.toUpperCase());
}
