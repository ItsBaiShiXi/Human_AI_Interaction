import { GAME_RADIUS } from "../data/constant.js";
import { globalState } from "../data/variable.js";
import { redrawAll } from "./drawing.js";
import { endDemo } from "./gameEvents.js";
import { finishInterception } from "./gameEvents.js";
import { getBlueBallValue } from "../utils/blueballDecay.js";

export function animateObjects() {
  // Update positions and redraw
  updateObjectPositions(globalState.totalFrames);
  redrawAll();

  // Increment frame counter
  globalState.totalFrames++;

  // Continue animation or end demo
  if (globalState.totalFrames < globalState.OBSERVATION_FRAMES) {
    globalState.animationFrameId = requestAnimationFrame(animateObjects);
  } else {
    endDemo();
  }
}

export function animateInterception() {
  updateObjectPositions(globalState.totalFrames);
  let status = updatePlayerPosition();

  // Apply penalties for hazard collisions (gray balls) during interception
  let hazardStatus = applyHazardPenalties(globalState.totalFrames);

  redrawAll();
  globalState.totalFrames++;

  let isInCircle =
    Math.sqrt(
      (globalState.player.x - globalState.centerX) ** 2 +
        (globalState.player.y - globalState.centerY) ** 2
    ) <= GAME_RADIUS;

  // Stop animation if bomb hit or player exits circle or sequence finished
  if (isInCircle && status == "in progress" && hazardStatus !== "bomb_hit") {
    globalState.animationFrameId = requestAnimationFrame(animateInterception);
  } else {
    finishInterception();
  }
}

// Function to update object positions
function updateObjectPositions(frame) {
  globalState.objects.forEach(obj => {
    // Default: straight, from initial state
    let x, y, currDX = obj.initDX, currDY = obj.initDY;

    if (obj.type === 'green_turner' && Number.isFinite(obj.turnAfterFrames)) {
      const T = obj.turnAfterFrames;
      if (frame < T) {
        // Phase 1 — before turn
        x = obj.initX0 + frame * obj.initDX;
        y = obj.initY0 + frame * obj.initDY;
        currDX = obj.initDX; currDY = obj.initDY;
      } else {
        // Phase 2 — after turn: start from the turn point with turned velocity
        const turnVel = applyTurnStrategy(obj.initDX, obj.initDY, obj.turnStrategy || 'reverse');
        const turnX = obj.initX0 + T * obj.initDX;
        const turnY = obj.initY0 + T * obj.initDY;
        x = turnX + (frame - T) * turnVel.dX;
        y = turnY + (frame - T) * turnVel.dY;
        currDX = turnVel.dX; currDY = turnVel.dY;
      }
      // (Optional) mark for UI, without driving logic
      obj.hasTurned = frame >= obj.turnAfterFrames;
    } else {
      // Normal / non-turning types
      x = obj.initX0 + frame * obj.initDX;
      y = obj.initY0 + frame * obj.initDY;
    }

    // Update blue ball value based on time decay
    obj.value = getBlueBallValue(
      obj,
      frame,
      globalState.OBSERVATION_FRAMES,
      globalState.INTERCEPTION_FRAMES
    );

    // Commit only the *derived* values for this frame
    obj.x = x;
    obj.y = y;
    // (Optional) expose current velocity so arrows match the post-turn direction
    obj.currDX = currDX;
    obj.currDY = currDY;
  });
}


// helper
function applyTurnStrategy(dX, dY, strategy) {
  // Only 'reverse' (180°) turns are used in the experiment
  if (strategy === 'reverse') {
    return { dX: -dX, dY: -dY };
  }
  // Default: no turn (shouldn't happen, but safe fallback)
  return { dX, dY };
}

function updatePlayerPosition() {
  // object that contains all information for intercepting the current object
  let currentMove = globalState.userSolution.moves[globalState.interceptionCounter]; 
  globalState.interceptionFrame += 1;

  let status = "in progress";
  if (globalState.interceptionFrame == currentMove.timeToIntercept) {
    if (currentMove.isFinalForTarget) {
      const objIdx = currentMove.targetObjectId;
      if (Number.isInteger(objIdx) && globalState.objects[objIdx]) {
        globalState.objects[objIdx].isIntercepted = currentMove.success;
      }
    }

    globalState.interceptionFrame = 0;
    globalState.interceptionCounter += 1;
  
    if (globalState.interceptionCounter < globalState.userSolution.moves.length) {
      currentMove = globalState.userSolution.moves[globalState.interceptionCounter];
    } else {
      status = "finished";
      return status;
    }
  }

  globalState.player.x += currentMove.dX;
  globalState.player.y += currentMove.dY;

  return status;
}

function applyHazardPenalties(frame) {
  const px = globalState.player.x;
  const py = globalState.player.y;
  const pr = globalState.player.radius || 15;

  for (const obj of globalState.objects) {
    if (obj.isIntercepted) continue;
    if (!obj.isBomb) continue;  // Only check for bombs (traps)

    const dx = obj.x - px;
    const dy = obj.y - py;
    const dist = Math.hypot(dx, dy);
    const or = obj.radius || 15;

    // Add a small buffer (10px) to collision threshold for better detection
    const collisionThreshold = pr + or + 10;

    // basic circle overlap with buffer
    if (dist <= collisionThreshold) {
      // Check cooldown, if any (currently 0 cold down)
      const cooldownOk = (frame - obj.penaltyLastAppliedAt) >= (obj.penaltyCooldownFrames || 0);
      if (cooldownOk) {
        // Add penalty
        if (typeof globalState.penaltyPoints !== 'number') globalState.penaltyPoints = 0;
        globalState.penaltyPoints += (obj.penaltyAmount || 0);
        obj.penaltyLastAppliedAt = frame;

        // Mark that bomb was hit this round
        globalState.bombHit = true;

        // RETURN STATUS TO STOP GAME
        return "bomb_hit";
      }
    }
  }

  return "continue";  // No bomb hit
}
