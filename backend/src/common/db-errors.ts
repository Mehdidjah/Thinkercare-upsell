export function isUniqueViolation(error: unknown, constraintPrefix: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current && typeof current === 'object' && depth < 10; depth++) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (e.code === '23505' && typeof e.constraint === 'string' && e.constraint.startsWith(constraintPrefix)) return true;
    current = e.cause;
  }
  return false;
}
