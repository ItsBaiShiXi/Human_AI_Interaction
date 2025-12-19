const activeTimers = {
  trial: { startTime: null, pausedTime: 0, isPaused: false, lastPauseTime: null },
  think: { startTime: null, pausedTime: 0, isPaused: false, lastPauseTime: null },
};

// Track visibility changes to pause timers
document.addEventListener("visibilitychange", () => {
  const isVisible = document.visibilityState === "visible";

  Object.keys(activeTimers).forEach((mode) => {
    const timer = activeTimers[mode];
    if (!timer.startTime) return; // Timer not started

    if (!isVisible && !timer.isPaused) {
      // Tab became hidden - pause timer
      timer.isPaused = true;
      timer.lastPauseTime = performance.now();
    } else if (isVisible && timer.isPaused) {
      // Tab became visible - resume timer
      timer.pausedTime += performance.now() - timer.lastPauseTime;
      timer.isPaused = false;
      timer.lastPauseTime = null;
    }
  });
});

/**
 * Starts a timer for a given mode
 * @param {"trial" | "think"} mode
 */
export function startTimer(mode) {
  const timer = activeTimers[mode];
  if (!timer || timer.startTime) return; // already running

  timer.startTime = performance.now();
  timer.pausedTime = 0;
  timer.isPaused = false;
  timer.lastPauseTime = null;
}

/**
 * Stops a timer for the given mode
 * @param {"trial" | "think"} mode
 */
export function stopTimer(mode) {
  const timer = activeTimers[mode];
  if (timer?.startTime) {
    timer.startTime = null;
    timer.isPaused = false;
    timer.lastPauseTime = null;
  }
}

/**
 * Gets current recorded value in milliseconds
 * @param {"trial" | "think"} mode
 * @returns {number} Time elapsed in milliseconds
 */
export function getTimerValue(mode) {
  const timer = activeTimers[mode];
  if (!timer?.startTime) return 0;

  const now = performance.now();
  const elapsed = now - timer.startTime;

  // Subtract paused time
  let totalPausedTime = timer.pausedTime;
  if (timer.isPaused && timer.lastPauseTime) {
    totalPausedTime += now - timer.lastPauseTime;
  }

  return Math.max(0, elapsed - totalPausedTime);
}

/**
 * Resets timer value for the given mode
 * @param {"trial" | "think"} mode
 */
export function resetTimerValue(mode) {
  if (activeTimers[mode]) {
    activeTimers[mode].startTime = null;
    activeTimers[mode].pausedTime = 0;
    activeTimers[mode].isPaused = false;
    activeTimers[mode].lastPauseTime = null;
  }
}
