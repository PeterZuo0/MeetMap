type QuitEvent = { preventDefault(): void };
type QuitApplication = {
  on(event: "before-quit", listener: (event: QuitEvent) => void): unknown;
  quit(): void;
};

/** Keep Electron alive until native WAV writers have been stopped and closed. */
export function registerAudioShutdown(
  application: QuitApplication,
  shutdown: () => Promise<void>,
  reportError: (error: unknown) => void = () => console.error("Audio cleanup failed during application exit.")
) {
  let complete = false;
  let pending = false;
  application.on("before-quit", (event) => {
    if (complete) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    void Promise.resolve().then(shutdown).catch(reportError).finally(() => {
      complete = true;
      application.quit();
    });
  });
}
