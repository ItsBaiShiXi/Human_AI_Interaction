import { globalState } from "../data/variable";

// Utility Functions
export function getUrlParameters() {
  const searchParams = new URLSearchParams(window.location.search);
  const params = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

export function lcg(seed) {
  const a = 1664525;
  const c = 1013904223;
  const m = Math.pow(2, 32);
  let current = seed;
  return function () {
    current = (a * current + c) % m;
    return current / m; // normalize to [0,1]
  };
}

export function sampleBeta(alpha, beta) {
  function sampleGamma(shape) {
    // Marsaglia and Tsang method for sampling Gamma(shape, 1)
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    let u, v;
    do {
      do {
        u = globalState.randomGenerator();
        v = globalState.randomGenerator() * 2 - 1; // Uniformly distributed in (-1, 1)
      } while (u <= 0);
      const x = Math.pow(1 + c * v, 3);
      if (x > 0 && Math.log(u) < 0.5 * v * v + d * (1 - x + Math.log(x))) {
        return d * x;
      }
    } while (true);
  }

  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y); // Transform Gamma samples to Beta
}

export function generateUID(length = 16) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let uid = "";
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);

  for (let i = 0; i < length; i++) {
    uid += chars[array[i] % chars.length];
  }

  return "test_" + uid;
}

export function getCurrentDate() {
  return new Date();
}

export function getOrdinalSuffix(n) {
  if (n >= 11 && n <= 13) {
    return `${n}th`; // Special case for 11th, 12th, 13th
  }
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// Function to measure the refresh rate
export function measureRefreshRate() {
  let lastTimestamp = null;
  let frameTimestamps = [];
  const measureDuration = 1500; // Measure over 1.5 second
  const warmupFrames = 5;
  const expectedFrameTime = 1000 / 60;

  return new Promise((resolve) => {
    function measureFrame(timestamp) {
      if (lastTimestamp !== null) {
        const frameDuration = timestamp - lastTimestamp;
        frameTimestamps.push(frameDuration);
      }
      lastTimestamp = timestamp;

      if (
        frameTimestamps.length <
        measureDuration / expectedFrameTime + warmupFrames
      ) {
        requestAnimationFrame(measureFrame);
      } else {
        const trimmed = frameTimestamps.slice(warmupFrames);
        const filtered = trimmed.filter((t) => t > 2 && t < 100);
        const avgFrameDuration =
          filtered.reduce((sum, t) => sum + t, 0) / filtered.length;
        const refreshRate = Math.round(1000 / avgFrameDuration) || 60;
        const speedMultiplier = refreshRate / 60;
        resolve({ refreshRate, speedMultiplier });
      }
    }

    requestAnimationFrame(measureFrame);
  });
}

export function getAttentionCheckTrialCount() {
  return Object.keys(globalState.ATTENTION_CHECK_TRIALS).length;
}

export function isAttentionCheck() {
  const isAttentionCheck =
    !globalState.isComprehensionCheck &&
    globalState.curTrial in globalState.ATTENTION_CHECK_TRIALS;
  return isAttentionCheck;
}

export function isPassedAllAttentionCheck() {
  const isPassedAllAttentionCheck = Object.values(
    globalState.ATTENTION_CHECK_TRIALS
  ).every(Boolean);
  return isPassedAllAttentionCheck;
}

/***
 * The number of attention check trials the user has completed and failed
 * up to the current point in the experiment.
 * Only includes trials that have already been attempted,
 * ignores any attention checks that have not yet occurred.
 */
export function countFailedAttentionCheck() {
  const failedCount = Object.entries(globalState.ATTENTION_CHECK_TRIALS).filter(
    ([trialIdStr, passed]) => {
      const trialId = Number(trialIdStr);
      return trialId <= globalState.curTrial && passed === false;
    }
  ).length;

  return failedCount;
}

export function redirectProlificCompleted() {
  setTimeout(() => {
    window.location.replace(
      "https://app.prolific.com/submissions/complete?cc=C69WH2EZ"
    );
  }, 3000);
}


export function redirectProlificFailedAllAttentionCheck() {
  setTimeout(() => {
    window.location.replace(
      "https://app.prolific.com/submissions/complete?cc=C16Y6VT3"
    );
  }, 3000);
}
