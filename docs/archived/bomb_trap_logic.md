# Archived: Bomb / Trap Object Logic

This document preserves the complete bomb (trap) mechanic as it existed before being replaced by the star (award) object. All code excerpts are verbatim from the codebase at the time of archival.

> **Restoration guide**: Sections marked **[SKIP — dead code]** were confirmed unused before replacement and were already removed in Phase 2 cleanup. Do not restore those parts — only restore the sections without that marker.

---

## Overview

The bomb is an optional 11th object added to each trial with a 50% probability. It is visually larger than normal balls and uses a trap image. The player **cannot select** it. If the player touches the bomb during the interception phase, **the game immediately freezes** and no further movement or scoring occurs.

---

## 1. Object Properties

**`src/data/constant.js`** — trap image asset and ball type constant:
```js
export const trapImage = new Image();
trapImage.src = new URL("../../assets/trap_img.png", import.meta.url).href;

export const BALL_TYPES = {
  NORMAL: 'red',
  BLUE: 'blue',
  GREEN_TURNER: 'green_turner',
  BOMB: 'bomb',        // ← bomb type
};
```

**`src/logic/initialize.js`** — runtime creation:
```js
const shouldHaveBomb = globalState.randomGenerator() < 0.5;  // 50% chance

if (shouldHaveBomb) {
  let bombObject = generateRandomObject(false, 'red');

  bombObject.type = 'bomb';
  bombObject.isBomb = true;
  bombObject.canBeSelected = false;
  bombObject.penaltyAmount = 1.0;        // read by collision code
  bombObject.penaltyCooldownFrames = 0;  // read by collision code
  bombObject.penaltyLastAppliedAt = -Infinity;  // read by collision code

  bombObject.radius = 50;                // 2.5× normal (15px)
  bombObject.colorFill = '#FF0000';
  bombObject.colorStroke = '#000000';
  bombObject.index = numObjects;         // index 10 when NUM_OBJECTS=10

  globalState.objects.push(bombObject);
}
```

**[SKIP — dead code]** The following 3 properties were set as defaults on every **normal** (non-bomb) ball inside `generateRandomObject`. They were never checked for non-bomb objects (collision code guards with `!obj.isBomb`). Do not restore these defaults:
```js
// In generateRandomObject() return value — removed in Phase 2:
isBomb: false,
penaltyAmount: 0,           // dead on normal balls — collision code skips non-bombs
penaltyCooldownFrames: 0,   // dead on normal balls
penaltyLastAppliedAt: -Infinity,  // dead on normal balls
```
Note: `isBomb: false` default was kept (it's still needed). Only the 3 penalty defaults were removed.

**`scripts/generateTrials.mjs`** — pre-generated trials (mirrors initialize.js):
```js
const shouldHaveBomb = rng() < 0.5;

if (shouldHaveBomb) {
  let bombObject = generateRandomObject(rng, centerX, centerY, numObjects, 'red');

  bombObject.type = 'bomb';
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
// metadata.hasBomb = shouldHaveBomb
```

---

## 2. Global State Fields

**`src/data/variable.js`** — only `bombHit` is needed:
```js
bombHit: false,            // set true when bomb is touched during interception
```

Reset before each interception in `src/logic/gameEvents.js`:
```js
globalState.bombHit = false;
```

**[SKIP — dead code]** The following fields existed in `globalState` but were never read for scoring, UI, or Firebase. Do not restore them:
```js
// These were removed in Phase 2 — confirmed unused:
penaltyPoints: 0,          // written to but never read; reset also not needed
penaltyHits: 0,            // only used as local vars in solutionEvaluator, never on globalState
lastPenaltyAtFrame: -1,    // per-object obj.penaltyLastAppliedAt was used instead
penaltyFlashFrames: 12,    // flash effect was never implemented
penalties: [],             // penalty history was never populated
```

Also **[SKIP — dead code]**: `globalState.penaltyPoints = 0` reset in `gameEvents.js` — not needed since `penaltyPoints` itself is removed.

---

## 3. Rendering

**`src/logic/drawing.js` (lines 106–144)**:
```js
if (object.isBomb) {
  if (trapImage.complete && trapImage.naturalWidth !== 0) {
    const imageSize = object.radius * 2;
    const imageX = object.x - imageSize / 2;
    const imageY = object.y - imageSize / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(object.x, object.y, object.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(trapImage, imageX, imageY, imageSize, imageSize);
    ctx.restore();

    // Black circular border
    ctx.beginPath();
    ctx.arc(object.x, object.y, object.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.stroke();
  } else {
    // Fallback: red circle
    ctx.beginPath();
    ctx.arc(object.x, object.y, object.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FF0000';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
```

Arrows and selection numbers are skipped for bombs:
- `src/logic/drawing.js` line ~10: condition `!object.isBomb` guards arrow drawing
- No `selectionIndex` is ever assigned to the bomb

---

## 4. Selection Prevention

**`src/logic/mouseEvents.js` (lines 33–36)**:
```js
if (object.isBomb || object.canBeSelected === false) {
  continue;
}
```

**`src/logic/gameEvents.js` (lines 266–269)** — excluded from permutations:
```js
const selectableIndices = globalState.objects
  .filter(obj => !obj.isBomb && obj.canBeSelected !== false)
  .map(obj => obj.index);
```

---

## 5. Collision Detection & Game Freeze (Animation)

**`src/logic/animation.js` (lines 137–174)** — `applyHazardPenalties(frame)`:
```js
function applyHazardPenalties(frame) {
  const px = globalState.player.x;
  const py = globalState.player.y;
  const pr = globalState.player.radius || 15;

  for (const obj of globalState.objects) {
    if (obj.isIntercepted) continue;
    if (!obj.isBomb) continue;

    const dx = obj.x - px;
    const dy = obj.y - py;
    const dist = Math.hypot(dx, dy);
    const or = obj.radius || 15;
    const collisionThreshold = pr + or + 10;  // 10px buffer

    if (dist <= collisionThreshold) {
      const cooldownOk = (frame - obj.penaltyLastAppliedAt) >= (obj.penaltyCooldownFrames || 0);
      if (cooldownOk) {
        // [SKIP — dead code] globalState.penaltyPoints += (obj.penaltyAmount || 0);
        obj.penaltyLastAppliedAt = frame;
        globalState.bombHit = true;
        return "bomb_hit";  // ← stops animation loop
      }
    }
  }
  return "continue";
}
```

**`src/logic/animation.js` (lines 40–45)** — animation loop check:
```js
if (isInCircle && status == "in progress" && hazardStatus !== "bomb_hit") {
  globalState.animationFrameId = requestAnimationFrame(animateInterception);
} else {
  finishInterception();  // ← called immediately on bomb hit
}
```

---

## 6. Collision Detection & Freeze (Solution Evaluator / AI)

**`src/logic/computation/solutionEvaluator.js`** — `stepPhaseConstant()`:
```js
function stepPhaseConstant(player, objects, dX, dY, frames, simFrameStart) {
  // [SKIP — dead code] let penaltyPoints = 0;
  // [SKIP — dead code] let penaltyHits = 0;
  const lastHitAt = new Map();

  for (let t = 0; t < frames; t++) {
    player.x += dX;
    player.y += dY;
    const F = simFrameStart + t + 1;

    for (const obj of objects) {
      if (!obj.isBomb || obj.isIntercepted) continue;

      const { x, y } = getObjectStateAtFrame(obj, F);
      const hit = ((player.x - x) ** 2 + (player.y - y) ** 2) <=
        ((player.radius || 15) + obj.radius) ** 2;

      if (hit) {
        const cooldown = obj.penaltyCooldownFrames || 0;
        const last = lastHitAt.get(obj) ?? -Infinity;
        if ((t - last) >= cooldown) {
          // [SKIP — dead code] penaltyPoints += (obj.penaltyAmount || 0);
          // [SKIP — dead code] penaltyHits += 1;
          lastHitAt.set(obj, t);
          return { stoppedAtFrame: t, bombHit: true };  // ← freeze
        }
      }
    }
  }
  return { stoppedAtFrame: frames, bombHit: false };
}
// Note: penaltyPoints/penaltyHits were tracked locally and propagated into
// penaltySum/penaltyHitSum in enumerateAllSolutions(), stored on solution objects,
// but the subtraction from totalValue was commented out. Entire penalty tracking
// chain in solutionEvaluator is dead code — do not restore.
```

**`src/logic/computation/solutionEvaluator.js` (lines 125, 174–235, 279)** — `enumerateAllSolutions()` tracking:
```js
let bombHitDuringSequence = false;

// Phase 1 of green_turner split:
if (phase1.bombHit) {
  bombHitDuringSequence = true;
  simFrame += phase1.stoppedAtFrame + 1;
  isInProgress = false;
  success = false;
  finalDist = Infinity;
  didSplit = true;
}

// Phase 2 of green_turner split:
if (m2.bombHit) {
  bombHitDuringSequence = true;
  simFrame += m2.timeToIntercept;
  isInProgress = false;
}

// Normal one-segment move:
if (m.bombHit) {
  bombHitDuringSequence = true;
  simFrame += m.timeToIntercept;
  isInProgress = false;
}

// Stored on each solution:
allSolutions.push({
  ...
  bombHit: bombHitDuringSequence,
});
```

> Note: Penalty is **not subtracted** from `totalValue`. The bomb naturally degrades a solution's score by freezing the simulation before remaining objects can be intercepted.

---

## 7. UI Feedback

**`src/logic/gameEvents.js` (lines 504–506)**:
```js
if (globalState.bombHit) {
  scoreText = `<p style="color: red; font-weight: bold;">You are trapped!</p>` + scoreText;
}
```

---

## 8. Data Collection & Firebase

**`src/logic/collectData.js` (lines 91–92, 123–124, 190–192)**:
```js
// JSDoc typedef:
// @property {boolean} user_hit_bomb  // whether user hit the bomb (freeze trap)
// @property {boolean} best_hit_bomb  // whether best solution hits bomb

// createNewTrialData():
user_hit_bomb: false,
best_hit_bomb: false,

// recordTrialDataFinishIntercept():
trial.user_hit_bomb = userSolution.bombHit ?? false;
trial.best_hit_bomb = bestSolution.bombHit ?? false;
```

**`src/firebase/saveData2Firebase.js` (lines 189–190)**:
```js
user_hit_bomb: trial.user_hit_bomb,
best_hit_bomb: trial.best_hit_bomb,
```

---

## 9. Behavior Summary

| Aspect | Behavior |
|--------|----------|
| Spawn rate | 50% per trial |
| Object index | `numObjects` (10 when NUM_OBJECTS=10) |
| Radius | 50px (vs 15px for normal balls) |
| Selectable | No (`canBeSelected: false`) |
| Visual | Trap image clipped to circle, black border |
| On contact | Game freezes immediately |
| Scoring after contact | Remaining targets scored from frozen position via proximity |
| Penalty deduction | None — score naturally lower due to freeze |
| Firebase fields | `user_hit_bomb`, `best_hit_bomb` |

---

## Asset

- `assets/trap_img.png` — trap image displayed inside bomb circle
