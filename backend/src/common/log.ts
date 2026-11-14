/** Safe one-line description of an error: never includes anything after the first newline (drizzle appends bound params there). */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Error';
  const cause = error.cause as { code?: unknown; name?: unknown } | undefined;
  const tag = cause && typeof cause === 'object' ? (cause.code ?? cause.name) : undefined;
  const causeTag = typeof tag === 'string' ? tag : '';
  const firstLine = error.message.split(/\r?\n/, 1)[0] ?? '';
  return `${error.name}${causeTag ? ` (cause ${causeTag})` : ''}: ${firstLine}`;
}
