import {
  MAX_SPEED,
  MIN_SPEED,
  GAME_RADIUS,
  alphaParam,
  betaParam,
} from "../data/constant.js";
import { globalState } from "../data/variable.js";
import { sampleBeta, isAttentionCheck } from "../utils/utils.js";
import educate1Objects from "../data/educate1_objects.json";
import educate2Objects from "../data/educate2_objects.json";
import { BALL_TYPES } from "../data/constant.js";

function pickBallType(rngFn) {
  const random = (typeof rngFn === "function") ? rngFn : Math.random;
  const p = random();
  //if (p < 0.15) return 'blue';
  if (p < 1.0) return 'green_turner';
  // if (p < 0.40) return 'gray_hazard';
  return 'normal';
}

export function initializeObjects(isComprehensionCheck, needRetry) {
  globalState.selectedObjects = []; // Reset selections
  globalState.hoverObjectIndex = -1; // Reset hover index

  if (
    isComprehensionCheck &&
    needRetry &&
    globalState.lastRoundObjects.length > 0
  ) {
    globalState.objects = structuredClone(globalState.lastRoundObjects);
  } else {
    globalState.objects = [];

    // Create objects for easy mode
    if (isComprehensionCheck) {
      if (globalState.curTrial == 1) {
        globalState.objects = educate1Objects.map((obj) =>
          adjustObjectForRefreshRate(obj)
        );
      } else {
        globalState.objects = educate2Objects.map((obj) =>
          adjustObjectForRefreshRate(obj)
        );
      }
      return;
    }

    const numObjects = globalState.NUM_OBJECTS;
    if (isAttentionCheck()) {
      globalState.objects = educate1Objects.map((obj) =>
        adjustObjectForRefreshRate(obj)
      );

      return;
    }

    // Create random objects
    for (let i = 0; i < numObjects; i++) {
      let newObject = generateRandomObject(isComprehensionCheck);
      globalState.objects.push(newObject);
    }
  }
}

function adjustObjectForRefreshRate(obj) {
  const dX = obj.dX / globalState.speedMultiplier;
  const dY = obj.dY / globalState.speedMultiplier;

  return {
    ...obj,
    dX, dY,
    speed: Math.hypot(dX, dY),

    // ensure immutable kinematics exist
    initX0: obj.initX0 ?? obj.x0,
    initY0: obj.initY0 ?? obj.y0,
    initDX: obj.initDX != null ? obj.initDX / globalState.speedMultiplier : dX,
    initDY: obj.initDY != null ? obj.initDY / globalState.speedMultiplier : dY,

    // sensible defaults so solver/animation don’t crash
    type: obj.type ?? 'normal',                // or BALL_TYPES.NORMAL
    turnAfterFrames: obj.turnAfterFrames ?? null,
    turnStrategy: obj.turnStrategy ?? null,
    turnAngle: obj.turnAngle ?? null,

    isHazard: obj.isHazard ?? false,
    penaltyAmount: obj.penaltyAmount ?? 0,
    penaltyCooldownFrames: obj.penaltyCooldownFrames ?? 0,
    penaltyLastAppliedAt: obj.penaltyLastAppliedAt ?? -Infinity,

    colorFill: obj.colorFill ?? 'red',
    colorStroke: obj.colorStroke ?? 'red',
  };
}

/**
 * Generates a random object positioned far from the center.
 */
function generateRandomObject(isEasyMode) {
  let x0, y0, dx, dy, speed;
  let isValid = false;

  do {
    let randomDirection = globalState.randomGenerator() * Math.PI * 2;
    let randomSpeed =
      globalState.randomGenerator() * (MAX_SPEED - MIN_SPEED) + MIN_SPEED;
    let randomRadius =
      globalState.randomGenerator() * (GAME_RADIUS * 0.6) + GAME_RADIUS / 3;
    let randomStartAngle = globalState.randomGenerator() * Math.PI * 2;

    const perFrame = randomSpeed / globalState.refreshRate;

    x0 = globalState.centerX + Math.cos(randomStartAngle) * randomRadius;
    y0 = globalState.centerY + Math.sin(randomStartAngle) * randomRadius;

    dx = perFrame * Math.cos(randomDirection);
    dy = perFrame * Math.sin(randomDirection);

    // make speed reflect the actual per-frame velocity
    speed = Math.hypot(dx, dy);

    // Predict final position to ensure it stays inside bounds
    const finalx = x0 + dx * globalState.OBSERVATION_FRAMES;
    const finaly = y0 + dy * globalState.OBSERVATION_FRAMES;
    const finalRadius = Math.sqrt(
      (finalx - globalState.centerX) ** 2 + (finaly - globalState.centerY) ** 2
    );

    isValid = finalRadius > 100 && finalRadius < GAME_RADIUS - 50;
  } while (!isValid);

  let value = sampleBeta(alphaParam, betaParam); // Random value between 0 and 1
  if (isEasyMode) value *= 0.5; // Ensure value < 0.5 for easy mode

  const type = pickBallType(globalState.randomGenerator);
  let colorFill = 'red';
  let colorStroke = 'red';
  let hasTurned = false;
  let turnAfterFrames = null;
  let turnStrategy = null;
  let turnAngle = null;
  let isHazard = false;
  let penaltyAmount = 0;
  let penaltyCooldownFrames = 0;

  switch (type) {
    case 'blue':
      colorFill = colorStroke = '#2b6fff';
      break;

    case 'green_turner':
      colorFill = colorStroke = '#22aa55';
      const shouldTurn = globalState.randomGenerator() < 0.50; // 50% chance to turn
      if (shouldTurn) {
        turnAfterFrames = Math.round(3.5 * globalState.refreshRate);
        turnStrategy = 'reverse'; // Only 180° turns allowed
      }
      break;

    case 'gray_hazard':
      colorFill = colorStroke = '#888888';
      isHazard = true;
      penaltyAmount = 0.1;
      penaltyCooldownFrames = Math.round(0.5 * globalState.refreshRate); // immune for 0.5s after hit
      break;

    // normal default red
  }

  // If green turner will exit arena BEFORE its turn time, disable the turn
  if (type === 'green_turner' && turnAfterFrames) {
    // Calculate position at turn time
    const posAtTurn_x = x0 + dx * turnAfterFrames;
    const posAtTurn_y = y0 + dy * turnAfterFrames;
    const distAtTurn = Math.sqrt(
      (posAtTurn_x - globalState.centerX) ** 2 + 
      (posAtTurn_y - globalState.centerY) ** 2
    );
    
    // If ball will be outside or very close to edge at turn time, disable turn
    if (distAtTurn >= GAME_RADIUS - 20) {
      turnAfterFrames = null;
      turnStrategy = null;
      turnAngle = null;
      // Ball will just continue straight out of arena
    }
  }

  return {
    x0,
    y0,
    x: x0,
    y: y0,
    radius: 15,
    speed,
    dX: dx,
    dY: dy,
    value,
    isSelected: false,
    selectionIndex: NaN,
    isIntercepted: false,
    index: globalState.objects.length, // Assign index dynamically

    // NEW: immutable initial state used for stateless position calc
    initX0: x0,
    initY0: y0,
    initDX: dx,
    initDY: dy,
    
    // NEW: type and behavior scaffolding
    type,
    birthFrame: 0,              // used by behaviors
    segmentStartFrame: 0,       // used by piecewise motion
    hasTurned,           // for one-shot turners
    turnAfterFrames,      // set below for turners
    turnStrategy,         // always 'reverse' for 180° turns
    turnAngle,            // not used (kept for compatibility)

    // NEW: hazard-specific
    isHazard,            // convenience flag
    penaltyAmount,           // points deducted on contact
    penaltyCooldownFrames,   // to prevent rapid multiple hits
    penaltyLastAppliedAt: -Infinity,

    // NEW: colors
    colorFill,
    colorStroke,
  };
}

// Function to initialize the player
export function initializePlayer() {
  let randomDirection;
  let randomSpeed, randomRadius, randomStartAngle;
  let x0, y0, dx, dy, speed, finalx, finaly;
  x0 = globalState.centerX;
  y0 = globalState.centerY;
  //randomSpeed = randomGenerator() * (MAX_SPEED - MIN_SPEED) + MIN_SPEED; // Speed between 50 and 100
  randomSpeed = MAX_SPEED;
  speed = randomSpeed / globalState.refreshRate;
  dx = 0;
  dy = 0;
  globalState.player = {
    x0: x0,
    y0: y0,
    radius: 15, // Radius of each animated object
    speed: speed,
    dX: dx,
    dY: dy,
    x: x0,
    y: y0,
  };
}
