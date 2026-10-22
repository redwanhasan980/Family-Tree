/**
 * The only logging entry point (CLAUDE.md). Pass error codes and IDs, never names, emails,
 * phone numbers or addresses. P8-10 forwards errors to Sentry with PII scrubbing.
 */
type Context = Record<string, string | number | boolean | null | undefined>;

function codeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return error instanceof Error ? error.name : undefined;
}

export const logger = {
  warn(event: string, context: Context = {}): void {
    console.warn(`[শিকড়] ${event}`, context);
  },
  error(event: string, error?: unknown, context: Context = {}): void {
    console.error(`[শিকড়] ${event}`, { ...context, code: codeOf(error) });
  },
};
