/**
 * Trial Generator Script
 *
 * Pre-generates trial data for the experiment to ensure:
 * - Experimental control (all participants see same trials)
 * - Reproducibility (exact replication possible)
 * - Quality control (review trials before deployment)
 *
 * Usage:
 *   node scripts/generateTrials.js [options]
 *
 * Options:
 *   --seed <number>       Base seed for trial generation (default: 12345)
 *   --sets <number>       Number of trial sets to generate (default: 1)
 *   --trials <number>     Number of trials per set (default: 82)
 *   --objects <number>    Number of objects per trial (default: 10)
 *   --selections <number> Number of selections per trial (default: 2)
 *   --output <path>       Output directory (default: src/data/trials)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== CONSTANTS (mirrored from constant.js) ==========
const MIN_SPEED = 60;
const MAX_SPEED = 120;
const alphaParam = 1;
const betaParam = 2;
const GAME_RADIUS = 400;
const REFRESH_RATE = 60; // Default refresh rate for generation
const OBSERVATION_FRAMES = Math.round(3000 * (60 / 1000)); // 3000 ms

// ========== UTILITY FUNCTIONS ==========

function lcg(seed) {
  const a = 1664525;
  const c = 1013904223;
  const m = Math.pow(2, 32);
  let current = seed;
  return function () {
    current = (a * current + c) % m;
    return current / m;
  };
}

function sampleBeta(alpha, beta, rng) {
  function sampleGamma(shape) {
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    let u, v;
    do {
      do {
        u = rng();
        v = rng() * 2 - 1;
      } while (u <= 0);
      const x = Math.pow(1 + c * v, 3);
      if (x > 0 && Math.log(u) < 0.5 * v * v + d * (1 - x + Math.log(x))) {
        return d * x;
      }
    } while (true);
  }

  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

function pickBallType(rng) {
  const p = rng();
  if (p < 0.15) return 'blue';
  if (p < 0.45) return 'green_turner';
  return 'red';
}

// ========== TRIAL GENERATION ==========

function generateRandomObject(rng, centerX, centerY, objectIndex, ballType = null) {
  let x0, y0, dx, dy, speed;
  let isValid = false;

  do {
    let randomDirection = rng() * Math.PI * 2;
    let randomSpeed = rng() * (MAX_SPEED - MIN_SPEED) + MIN_SPEED;
    let randomRadius = rng() * (GAME_RADIUS * 0.6) + GAME_RADIUS / 3;
    let randomStartAngle = rng() * Math.PI * 2;

    const perFrame = randomSpeed / REFRESH_RATE;

    x0 = centerX + Math.cos(randomStartAngle) * randomRadius;
    y0 = centerY + Math.sin(randomStartAngle) * randomRadius;

    dx = perFrame * Math.cos(randomDirection);
    dy = perFrame * Math.sin(randomDirection);

    speed = Math.hypot(dx, dy);

    const finalx = x0 + dx * OBSERVATION_FRAMES;
    const finaly = y0 + dy * OBSERVATION_FRAMES;
    const finalRadius = Math.sqrt(
      (finalx - centerX) ** 2 + (finaly - centerY) ** 2
    );

    isValid = finalRadius > 100 && finalRadius < GAME_RADIUS - 50;
  } while (!isValid);

  let value = sampleBeta(alphaParam, betaParam, rng);

  if (!ballType) {
    ballType = pickBallType(rng);
  }

  let colorFill = 'red';
  let colorStroke = 'red';
  let turnAfterFrames = null;
  let turnStrategy = null;

  switch (ballType) {
    case 'blue':
      colorFill = colorStroke = '#2b6fff';
      value = Math.min(1.0, value * 1.5);
      break;

    case 'green_turner':
      colorFill = colorStroke = '#22aa55';
      const shouldTurn = rng() < 0.50;
      if (shouldTurn) {
        turnAfterFrames = Math.round(3.5 * REFRESH_RATE);
        turnStrategy = 'reverse';

        // Check if ball will exit before turn
        const posAtTurn_x = x0 + dx * turnAfterFrames;
        const posAtTurn_y = y0 + dy * turnAfterFrames;
        const distAtTurn = Math.sqrt(
          (posAtTurn_x - centerX) ** 2 +
          (posAtTurn_y - centerY) ** 2
        );

        if (distAtTurn >= GAME_RADIUS - 20) {
          turnAfterFrames = null;
          turnStrategy = null;
        }
      }
      break;
  }

  return {
    index: objectIndex,
    x0,
    y0,
    initX0: x0,
    initY0: y0,
    dX: dx,
    dY: dy,
    initDX: dx,
    initDY: dy,
    radius: 15,
    speed,
    value,
    initialValue: value,
    type: ballType,
    colorFill,
    colorStroke,
    turnAfterFrames,
    turnStrategy,
    turnAngle: null,
    hasTurned: false,
    isHazard: false,
    penaltyAmount: 0,
    penaltyCooldownFrames: 0,
    penaltyLastAppliedAt: -Infinity,
  };
}

function generateTrial(trialNumber, seed, numObjects = 10, centerX = 405, centerY = 405) {
  const rng = lcg(seed);
  const objects = [];

  // Define ball type distribution
  const ballTypes = [
    'red', 'red',
    'blue', 'blue',
    'green_turner', 'green_turner',
    null, null, null, null
  ];

  // Shuffle using the RNG
  for (let i = ballTypes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ballTypes[i], ballTypes[j]] = [ballTypes[j], ballTypes[i]];
  }

  // Generate objects
  for (let i = 0; i < numObjects; i++) {
    const obj = generateRandomObject(rng, centerX, centerY, i, ballTypes[i]);
    objects.push(obj);
  }

  // Add bomb (50% chance, but forced to 100% for consistency)
  const shouldHaveBomb = rng() < 1; // Always add bomb for now

  if (shouldHaveBomb) {
    let bombObject = generateRandomObject(rng, centerX, centerY, numObjects, 'red');

    bombObject.type = 'gray_hazard';
    bombObject.isHazard = true;
    bombObject.isBomb = true;
    bombObject.canBeSelected = false;
    bombObject.penaltyAmount = 1.0;
    bombObject.penaltyCooldownFrames = 0;
    bombObject.penaltyLastAppliedAt = -Infinity;
    bombObject.radius = 50;
    bombObject.colorFill = '#FF0000';
    bombObject.colorStroke = '#000000';

    objects.push(bombObject);
  }

  return {
    trialNumber,
    seed,
    objects,
    metadata: {
      numObjects,
      hasBomb: shouldHaveBomb,
      centerX,
      centerY,
      refreshRate: REFRESH_RATE,
      observationFrames: OBSERVATION_FRAMES,
    }
  };
}

function generateTrialSet(baseSeed, numTrials = 82, setId = 1, options = {}) {
  const trials = [];
  const numObjects = options.numObjects || 10;

  console.log(`Generating trial set ${setId} with base seed ${baseSeed}...`);

  for (let i = 1; i <= numTrials; i++) {
    // Each trial gets a unique seed derived from base seed and trial number
    const trialSeed = baseSeed + i * 1000;
    const trial = generateTrial(i, trialSeed, numObjects);
    trials.push(trial);

    if (i % 10 === 0) {
      console.log(`  Generated ${i}/${numTrials} trials...`);
    }
  }

  return {
    setId,
    baseSeed,
    numTrials,
    trials,
    metadata: {
      generatedAt: new Date().toISOString(),
      numObjects,
      numSelections: options.numSelections || 2,
      version: '1.0.0',
    }
  };
}

// ========== CLI ==========

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    seed: 12345,
    sets: 1,
    trials: 82,
    objects: 10,
    selections: 2,
    output: path.join(__dirname, '..', 'src', 'data', 'trials'),
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    if (key === 'seed') options.seed = parseInt(value);
    else if (key === 'sets') options.sets = parseInt(value);
    else if (key === 'trials') options.trials = parseInt(value);
    else if (key === 'objects') options.objects = parseInt(value);
    else if (key === 'selections') options.selections = parseInt(value);
    else if (key === 'output') options.output = value;
  }

  return options;
}

function main() {
  const options = parseArgs();

  console.log('Trial Generator');
  console.log('===============');
  console.log(`Base seed: ${options.seed}`);
  console.log(`Trial sets: ${options.sets}`);
  console.log(`Trials per set: ${options.trials}`);
  console.log(`Objects per trial: ${options.objects}`);
  console.log(`Output directory: ${options.output}\n`);

  // Create output directory
  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
  }

  // Generate trial sets
  for (let setNum = 1; setNum <= options.sets; setNum++) {
    const baseSeed = options.seed + (setNum - 1) * 100000;
    const trialSet = generateTrialSet(baseSeed, options.trials, setNum, {
      numObjects: options.objects,
      numSelections: options.selections,
    });

    const filename = `trial_set_${setNum}.json`;
    const filepath = path.join(options.output, filename);

    fs.writeFileSync(filepath, JSON.stringify(trialSet, null, 2));
    console.log(`\n✓ Saved trial set ${setNum} to ${filename}`);
    console.log(`  Total size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);
  }

  console.log('\n✓ Trial generation complete!');
}

main();
