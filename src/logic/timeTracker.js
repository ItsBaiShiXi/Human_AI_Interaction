const activeTimers = {
  trial: { startTime: null, pausedTime: 0, isPaused: false, lastPauseTime: null, unfocusedTime: 0 },
  think: { startTime: null, pausedTime: 0, isPaused: false, lastPauseTime: null, unfocusedTime: 0 },
};

// Track visibility changes to pause timers and track unfocused time
document.addEventListener("visibilitychange", () => {
  const isVisible = document.visibilityState === "visible";

  Object.keys(activeTimers).forEach((mode) => {
    const timer = activeTimers[mode];
    if (!timer.startTime) return; // Timer not started

    if (!isVisible && !timer.isPaused) {
      // Tab became hidden - pause timer and start tracking unfocused time
      timer.isPaused = true;
      timer.lastPauseTime = performance.now();
    } else if (isVisible && timer.isPaused) {
      // Tab became visible - resume timer and record unfocused time
      const unfocusedDuration = performance.now() - timer.lastPauseTime;
      timer.pausedTime += unfocusedDuration;
      timer.unfocusedTime += unfocusedDuration;
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
  timer.unfocusedTime = 0;
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
 * Gets current recorded value in milliseconds (total elapsed time, including unfocused time)
 * @param {"trial" | "think"} mode
 * @returns {number} Total time elapsed in milliseconds
 */
export function getTimerValue(mode) {
  const timer = activeTimers[mode];
  if (!timer?.startTime) return 0;

  const now = performance.now();
  const elapsed = now - timer.startTime;

  return Math.round(Math.max(0, elapsed));
}

/**
 * Gets unfocused time in milliseconds (time when window was not focused)
 * @param {"trial" | "think"} mode
 * @returns {number} Unfocused time in milliseconds
 */
export function getUnfocusedTime(mode) {
  const timer = activeTimers[mode];
  if (!timer?.startTime) return 0;

  let totalUnfocusedTime = timer.unfocusedTime;

  // If currently unfocused, add the current unfocused duration
  if (timer.isPaused && timer.lastPauseTime) {
    totalUnfocusedTime += performance.now() - timer.lastPauseTime;
  }

  return Math.round(Math.max(0, totalUnfocusedTime));
}

/**
 * Resets timer value for the given mode
 * @param {"trial" | "think"} mode
 */
export function resetTimerValue(mode) {
  if (activeTimers[mode]) {
    activeTimers[mode].startTime = null;
    activeTimers[mode].pausedTime = 0;
    activeTimers[mode].unfocusedTime = 0;
    activeTimers[mode].isPaused = false;
    activeTimers[mode].lastPauseTime = null;
  }
}
