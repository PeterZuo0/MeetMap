/**
 * Electron wraps a main-process rejection as
 * "Error invoking remote method 'channel': Error: real message"; only the real
 * message means anything to the person reading it.
 */
export function stripIpcErrorPrefix(message: string): string {
  const match = /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?([\s\S]+)$/.exec(
    message.trim()
  );
  return match ? match[1].trim() : message;
}

export function formatError(error: unknown): string {
  return stripIpcErrorPrefix(error instanceof Error ? error.message : String(error));
}
