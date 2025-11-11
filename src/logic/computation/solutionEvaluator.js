import { globalState } from "../../data/variable";
import { GAME_RADIUS } from "../../data/constant";
import { attemptIntercept } from "./interceptionSimulator";

/*
--------------------------------------------------------------------------------------

    Generate all possible permutations

--------------------------------------------------------------------------------------
*/
export function generatePermutations(arr, k) {
  const result = [];

  function helper(currentPermutation) {
    // If the current permutation is of length k, add it to the result
    if (currentPermutation.length === k) {
      result.push([...currentPermutation]);
      return;
    }

    for (let i = 0; i < arr.length; i++) {
      if (currentPermutation.includes(arr[i])) continue; // Skip duplicates
      helper([...currentPermutation, arr[i]]); // Recursive call with new element added
    }
  }

  helper([]); // Start recursion with an empty permutation
  return result;
}

export function lookupInterceptionPaths() {
  // Find the index of the matching permutation
  const matchingIndex = findMatchingPermutationIndex(
    globalState.permutations,
    globalState.selectedObjects
  );
  let userSolution;

  // console.log(`Matching index: ${matchingIndex}`);
  if (matchingIndex !== -1) {
    // console.log(
    //   `Matching permutation:`,
    //   globalState.permutations[matchingIndex]
    // );
    userSolution = globalState.allSolutions[matchingIndex];
  } else {
    // console.log(`No matching permutation found.`);
  }

  return userSolution;
}

function findMatchingPermutationIndex(permutations, selectedObjects) {
  return permutations.findIndex(
    (permutation) =>
      permutation.length === selectedObjects.length &&
      permutation.every((value, index) => value === selectedObjects[index])
  );
}

/*
--------------------------------------------------------------------------------------

    Computing the Optimal Interception Paths

--------------------------------------------------------------------------------------
*/

function snapshotForSolver(objs, nowFrame) {
  return objs.map((o) => {
    // current velocity: if animation sets currDX/currDY use them, else dX/dY
    const vx = (o.currDX ?? o.dX);
    const vy = (o.currDY ?? o.dY);

    // Turn timing: if it already turned before now, no future turn
    let turnAfter = null;
    if (o.type === 'green_turner' && Number.isFinite(o.turnAfterFrames)) {
      // If the green ball already turned during the demo, your animation should
      // have set o.hasTurned = true and updated o.dX/o.dY to post-turn.
      // In that case, there’s no future turn for the solver.
      if (!o.hasTurned) {
        // convert absolute turn frame to "frames from now"
        turnAfter = Math.max(0, Math.round(o.turnAfterFrames - nowFrame));
      }
    }

    return {
      ...o,

      // Freeze the solver’s t=0 to the *current* world snapshot:
      initX0: o.x,
      initY0: o.y,
      initDX: vx,
      initDY: vy,

      // Green-turn one-shot timing — from *now*, not from game zero.
      turnAfterFrames: (o.type === 'green_turner') ? turnAfter : null,

      // (keep any stored turnAngle/strategy as-is)
    };
  });
}


export function enumerateAllSolutions() {
  const numSequences = globalState.permutations.length;
  let allSolutions = [];

  for (let i = 0; i < numSequences; i++) {
    const sequence = globalState.permutations[i];

    const copyObjects = snapshotForSolver(globalState.objects, globalState.totalFrames);
    const copyPlayer = structuredClone(globalState.player);

    let simFrame = 0;                 // absolute time for this sequence
    let totalValue = 0;
    let penaltySum = 0;
    let penaltyHitSum = 0;
    let moves = [];
    let objDetails = [];
    let isInProgress = true;
    let interceptedCnt = 0;

    for (let j = 0; j < globalState.NUM_SELECTIONS; j++) {
      const id = sequence[j];
      const objectNow = copyObjects[id];

      // 1) compute intercept from STATE AT simFrame (stateless)
      const stateNow = getObjectStateAtFrame(objectNow, simFrame);
      let [success, timeToIntercept, ix, iy, finalDist] = attemptIntercept(
        isInProgress,
        copyPlayer.x, copyPlayer.y, copyPlayer.speed,
        stateNow.x, stateNow.y,
        stateNow.vx, stateNow.vy
      );

      if (success) interceptedCnt++;

      // 2) If the object will TURN before this intercept completes, split the chase
      let didSplit = false;
      if (isInProgress &&
        objectNow.type === 'green_turner' &&
        Number.isFinite(objectNow.turnAfterFrames)) {

        const framesUntilTurn = objectNow.turnAfterFrames - simFrame;
        if (framesUntilTurn > 0 && Math.round(timeToIntercept) > framesUntilTurn) {
          // ---- Phase 1: move until turn moment (toward the initial intercept)
          // ---- Phase 1: move until turn moment using original intercept velocity ----
          const Ttot = Math.max(1, Math.round(timeToIntercept));      // original total time
          const Tseg = Math.max(0, Math.round(framesUntilTurn));      // we only step this many

          // per-frame velocity that would arrive at (ix, iy) in timeToIntercept frames
          const vx1 = (ix - copyPlayer.x) / Ttot;
          const vy1 = (iy - copyPlayer.y) / Ttot;

          // advance player & accumulate hazard penalties for Tseg frames
          const phase1 = stepPhaseConstant(
            copyPlayer, copyObjects, vx1, vy1, Tseg, simFrame
          );

          // record a synthetic move segment for UI/debug
          moves.push({
            success: false,
            timeToIntercept: Tseg,
            dX: vx1,
            dY: vy1,
            penaltyPoints: phase1.penaltyPoints,
            penaltyHits: phase1.penaltyHits,
            interceptPosX: copyPlayer.x, // pos after phase-1
            interceptPosY: copyPlayer.y,
          });

          // advance absolute time to the turn moment
          simFrame += Tseg;
          penaltySum += (phase1.penaltyPoints || 0);
          penaltyHitSum += (phase1.penaltyHits || 0);

          // ---- Phase 2: recompute from turned state at new simFrame
          const turnedNow = getObjectStateAtFrame(objectNow, simFrame);
          const [s2, t2, ix2, iy2, fd2] = attemptIntercept(
            true,
            copyPlayer.x, copyPlayer.y, copyPlayer.speed,
            turnedNow.x, turnedNow.y,
            turnedNow.vx, turnedNow.vy
          );

          const m2 = processMove(s2, t2, copyPlayer, ix2, iy2, copyObjects, simFrame);
          moves.push(m2);
          penaltySum += (m2.penaltyPoints || 0);
          penaltyHitSum += (m2.penaltyHits || 0);
          simFrame += Math.max(0, Math.round(t2));

          // use phase-2 results for scoring/bookkeeping
          success = s2;
          timeToIntercept = t2;
          ix = ix2; iy = iy2;
          finalDist = fd2;

          didSplit = true;
        }
      }

      // 3) If not split, do the normal one-segment move
      if (isInProgress && !didSplit) {
        const m = processMove(success, timeToIntercept, copyPlayer, ix, iy, copyObjects, simFrame);
        moves.push(m);
        penaltySum += (m.penaltyPoints || 0);
        penaltyHitSum += (m.penaltyHits || 0);
        simFrame += Math.max(0, Math.round(timeToIntercept));
      }

      // 4) Score this object
      const valNow = computeObjectValue(objectNow, success, finalDist, j, interceptedCnt);
      totalValue += valNow;

      if (!success && isInProgress) isInProgress = false;

      objDetails.push({
        objIndex: id,
        finalDistance: finalDist,
        isIntercepted: success,
        finalValue: valNow,
        totalValue: objectNow.value,
      });
    }

    // 5) Apply per-sequence penalty
    totalValue -= penaltySum;

    allSolutions.push({
      sequence,
      totalValue,
      moves,
      rank: 0,
      interceptedCnt,
      totalValueProp: 0,
      objDetails,
      penaltyPoints: penaltySum,
      penaltyHits: penaltyHitSum,
    });
  }

  sortAndNormalizeSolutionValues(allSolutions);

  if (globalState.isDebugMode) {
    logSolutions(allSolutions);
  }

  return [allSolutions, allSolutions[0], allSolutions[1]]; // all, best, sub optimal
}

/**
 * Processes a move when interception is successful.
 */
function processMove(
  success,
  timeToIntercept,
  player,
  interceptPosX,
  interceptPosY,
  objects,
  simFrameStart
) {
  const move = { success };
  const T = Math.max(0, Math.round(timeToIntercept));
  move.timeToIntercept = T;

  const dX = T > 0 ? (interceptPosX - player.x) / T : 0;
  const dY = T > 0 ? (interceptPosY - player.y) / T : 0;
  move.dX = dX;
  move.dY = dY;

  // stateless stepping (does not mutate objects)
  const { penaltyPoints, penaltyHits } = stepPhaseConstant(
    player, objects, dX, dY, T, simFrameStart
  );
  move.penaltyPoints = penaltyPoints;
  move.penaltyHits = penaltyHits;

  move.interceptPosX = player.x;
  move.interceptPosY = player.y;

  return move;
}


/**
 * Computes the value of the object based on whether interception was successful.
 */
function computeObjectValue(
  object,
  success,
  finalDistanceAtCircle,
  selectionIndex,
  interceptedCnt
) {
  if (success) return object.value;

  // Apply weight-based scoring for missed interceptions
  let weight = selectionIndex - interceptedCnt == 0 ? 0.75 : 0.25;
  let scaledValue =
    ((GAME_RADIUS * 2 - finalDistanceAtCircle) / (GAME_RADIUS * 2)) *
    object.value *
    weight;

  return scaledValue;
}

/**
 * Sorts the solutions by totalValue in descending order and assigns ranks.
 * Normalizes totalValue relative to maxValue to get totalValueProp.
 *
 * @param {Array} solutions - An array of solution objects, each containing totalValue.
 * @param {number} maxValue - The maximum totalValue among all solutions, used for normalization.
 */
function sortAndNormalizeSolutionValues(solutions) {
  // Step 1: Attach index references for tracking original order
  solutions.forEach((solution, index) => (solution.originalIndex = index));

  // Step 2: Sort solutions by totalValue in descending order
  solutions.sort((a, b) => b.totalValue - a.totalValue);

  let maxValue = solutions[0].totalValue;
  let rank = 1;
  for (let i = 0; i < solutions.length; i++) {
    solutions[i].totalValueProp = solutions[i].totalValue / maxValue;

    // Assign rank, ensuring tied values share the same rank
    if (i > 0 && solutions[i].totalValue === solutions[i - 1].totalValue) {
      solutions[i].rank = solutions[i - 1].rank;
    } else {
      solutions[i].rank = rank;
    }
    rank++;
  }

  // Step 3: Reorder globalState.permutations based on the new order
  globalState.permutations = solutions.map(
    (solution) => globalState.permutations[solution.originalIndex]
  );

  // Step 4: Remove originalIndex as it's no longer needed
  solutions.forEach((solution) => delete solution.originalIndex);
}

/**
 * Logs all solutions and the best one.
 */
function logSolutions(solutions) {
  console.log(`\n🔹 All Solutions Summary:`);

  let maxValue = solutions[0].totalValue;
  solutions.forEach((sol, i) => {
    console.log(
      `${i}: Sequence ${sol.sequence}, Score: ${sol.totalValue.toFixed(
        3
      )}, Rank:${sol.rank}, Intercepted Cnt:${sol.interceptedCnt}`
    );
    // sol.moves.forEach((move, index) => {
    //   console.log(`   ↳ Move ${index}: success=${move.success}`);
    // });
  });

  console.log(
    `\n🏆 Best solution = ${solutions[0].sequence
    }, maxValue = ${maxValue.toFixed(3)}`
  );
}
/*
--------------------------------------------------------------------------------------

    helpers for turn strategies and hazard detection

--------------------------------------------------------------------------------------
*/

// Rotate velocity for green-turner
function applyTurnStrategy(dX, dY, strategy, angle) {
  switch (strategy) {
    case 'reverse': return { dX: -dX, dY: -dY };
    case 'rotate90': return { dX: -dY, dY: dX };
    case 'random': {
      const speed = Math.hypot(dX, dY);
      const a = angle ?? 0
      return { dX: speed * Math.cos(a), dY: speed * Math.sin(a) };
    }
    default: return { dX, dY };
  }
}

function circlesOverlap(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2, dy = y1 - y2;
  return (dx * dx + dy * dy) <= (r1 + r2) * (r1 + r2);
}

function isHazard(obj) {
  return !!obj.isHazard && !obj.isIntercepted;
}

/**
 * Accumulates hazard penalties with per-hazard cooldown.
 * Returns { penaltyPoints, penaltyHits }.
 */
function stepPhaseConstant(player, objects, dX, dY, frames, simFrameStart) {
  let penaltyPoints = 0;
  let penaltyHits = 0;
  const lastHitAt = new Map();

  for (let t = 0; t < frames; t++) {
    // advance player one frame
    player.x += dX;
    player.y += dY;

    const F = simFrameStart + t + 1; // absolute frame after this step

    // hazard overlap checks using stateless positions
    for (const obj of objects) {
      if (!obj.isHazard || obj.isIntercepted) continue;

      const { x, y } = getObjectStateAtFrame(obj, F);
      const hit = ((player.x - x) ** 2 + (player.y - y) ** 2) <=
        ((player.radius || 15) + (obj.radius || 15)) ** 2;

      if (hit) {
        const cooldown = obj.penaltyCooldownFrames || 0;
        const last = lastHitAt.get(obj) ?? -Infinity;
        if ((t - last) >= cooldown) {
          penaltyPoints += (obj.penaltyAmount || 0);
          penaltyHits += 1;
          lastHitAt.set(obj, t);
        }
      }
    }
  }

  return { penaltyPoints, penaltyHits };
}


// Return position and current velocity at absolute frame `F`
// Mirrors the animation stateless logic.
function getObjectStateAtFrame(obj, F) {
  if (obj.type === 'green_turner' &&
    Number.isFinite(obj.turnAfterFrames) &&
    obj.turnAfterFrames >= 0) {
    const T = obj.turnAfterFrames;

    if (F < T) {
      return {
        x: obj.initX0 + F * obj.initDX,
        y: obj.initY0 + F * obj.initDY,
        vx: obj.initDX,
        vy: obj.initDY,
      };
    } else {
      // Use same applyTurnStrategy + stored turnAngle as animation
      const turned = applyTurnStrategy(obj.initDX, obj.initDY, obj.turnStrategy, obj.turnAngle);
      const turnX = obj.initX0 + T * obj.initDX;
      const turnY = obj.initY0 + T * obj.initDY;
      return {
        x: turnX + (F - T) * turned.dX,
        y: turnY + (F - T) * turned.dY,
        vx: turned.dX,
        vy: turned.dY,
      };
    }
  }

  // normal ball
  return {
    x: obj.initX0 + F * obj.initDX,
    y: obj.initY0 + F * obj.initDY,
    vx: obj.initDX,
    vy: obj.initDY,
  };
}

// Move toward (targetX, targetY) as if arriving in totalT frames,
// but only advance for stepFrames frames. Returns { penaltyPoints, penaltyHits }.
function stepTowardForFrames(player, objects, targetX, targetY, totalT, stepFrames, simFrameStart) {
  const Ttot = Math.max(1, Math.round(totalT));     // avoid divide-by-zero
  const Tstep = Math.max(0, Math.round(stepFrames));
  const dX = (targetX - player.x) / Ttot;
  const dY = (targetY - player.y) / Ttot;

  return stepPhaseConstant(player, objects, dX, dY, Tstep, simFrameStart);
}