/** Progress notifications must not outlive their renderer or interrupt processing. */
export function sendIfAlive(sender: unknown, channel: string, payload?: unknown): boolean {
  if (!sender || typeof sender !== "object") return false;
  const target = sender as { isDestroyed?: () => boolean; send?: (channel: string, payload?: unknown) => void };
  try {
    if (target.isDestroyed?.() || typeof target.send !== "function") return false;
    target.send(channel, payload);
    return true;
  } catch {
    // The window may be destroyed between the check and the send.
    return false;
  }
}
