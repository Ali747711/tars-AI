/**
 * Security helpers for safely embedding untrusted values into AppleScript.
 *
 * Tool arguments originate from an LLM/agent and may ultimately derive from
 * untrusted content (emails, messages, web pages). Interpolating them raw into
 * an AppleScript string literal allows the value to "break out" of the quotes
 * and inject arbitrary AppleScript — which can call `do shell script` and run
 * arbitrary commands. Always wrap interpolated values with `asString` (or, for
 * bare interpolation not already inside quotes, `asQuoted`).
 */

/**
 * Escape a value for safe use INSIDE an existing AppleScript double-quoted
 * string literal (i.e. the surrounding `"` are already in the template).
 *
 * Escapes backslashes and double quotes, and neutralises newlines/carriage
 * returns which would otherwise terminate the literal.
 *
 * @example
 *   `tell application "${asString(args.name)}"`
 */
export function asString(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/**
 * Produce a fully-quoted AppleScript string literal from an untrusted value,
 * including the surrounding double quotes. Use when the template does NOT
 * already wrap the interpolation in quotes.
 *
 * @example
 *   `set theName to ${asQuoted(args.name)}`
 */
export function asQuoted(value: unknown): string {
  return `"${asString(value)}"`;
}

/**
 * Escape a value for safe use inside a single-quoted SQL string literal
 * (SQLite), as used by the Messages category. Doubles single quotes.
 */
export function asSqlLiteral(value: unknown): string {
  return String(value ?? '').replace(/'/g, "''");
}

/**
 * Coerce a value to a bounded integer for interpolation where a number is
 * expected (e.g. LIMIT clauses, day counts). Prevents non-numeric injection.
 */
export function asInt(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
