// One request at a time; stopping a source invalidates every pending result.
// Visibility changes respect the existing deadline (including Retry-After).
export function createPoller({ run, onError, interval = 3000, errorDelay = 10000 }) {
  let timer = 0, active = false, request = null, nextAt = 0;
  function schedule() {
    clearTimeout(timer);
    if (active && !request && document.visibilityState === "visible") {
      timer = setTimeout(poll, Math.max(0, nextAt - Date.now()));
    }
  }
  async function poll() {
    if (!active || request || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(new Error("De aanvraag duurde te lang")), 20000);
    let wait = interval;
    try { wait = await run(controller.signal) ?? interval; }
    catch (e) { if (active && request === controller) { onError(e); wait = errorDelay; } }
    finally {
      clearTimeout(timeout);
      if (request === controller) {
        request = null;
        nextAt = Date.now() + Math.max(250, wait);
        schedule();
      }
    }
  }
  return {
    start() {
      if (active) return;
      active = true; nextAt = 0;
      document.addEventListener("visibilitychange", schedule);
      schedule();
    },
    stop() {
      active = false; clearTimeout(timer);
      const pending = request; request = null;
      pending?.abort();
      document.removeEventListener("visibilitychange", schedule);
    },
  };
}
