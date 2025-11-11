import { GAME_RADIUS } from "../data/constant.js";
import { globalState } from "../data/variable.js";
import { redrawAll } from "./drawing.js";
import { endDemo } from "./gameEvents.js";

import { finishInterception } from "./gameEvents.js";

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
  // Update positions and redraw
  updateObjectPositions(globalState.totalFrames);
  let status = updatePlayerPosition();
  
  // Apply penalties for hazard collisions (gray balls) during interception
  applyHazardPenalties(globalState.totalFrames);

  redrawAll();

  // Increment frame counter
  globalState.totalFrames++;

  // Is the player still within the game area?
  let isInCircle =
    Math.sqrt(
      (globalState.player.x - globalState.centerX) ** 2 +
        (globalState.player.y - globalState.centerY) ** 2
    ) <= GAME_RADIUS;

  // Continue animation or end interception sequence
  if (isInCircle && status == "in progress") {
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
  switch (strategy) {
    case 'reverse':   return { dX: -dX, dY: -dY }; // 180°
    case 'rotate90':  return { dX: -dY, dY:  dX }; // +90°
    case 'random': {
      const speed = Math.hypot(dX, dY);
      const angle = Math.atan2(dY, dX) + Math.PI * 0.73;  // fake random
      return { dX: speed * Math.cos(angle), dY: speed * Math.sin(angle) };
    }
    default:          return { dX, dY };
  }
}

function updatePlayerPosition() {
  let currentMove =
    globalState.userSolution.moves[globalState.interceptionCounter]; // object that contains all information for intercepting the current object
  let currentObject =
    globalState.userSolution.sequence[globalState.interceptionCounter];
  globalState.interceptionFrame += 1;

  let status = "in progress";
  if (globalState.interceptionFrame == currentMove.timeToIntercept) {
    globalState.objects[currentObject].isIntercepted = currentMove.success;
    globalState.interceptionFrame = 0; // reset counter for the next object
    globalState.interceptionCounter += 1;

    if (
      globalState.interceptionCounter < globalState.userSolution.moves.length
    ) {
      currentMove =
        globalState.userSolution.moves[globalState.interceptionCounter];
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
    if (!obj.isHazard) continue;

    const dx = obj.x - px;
    const dy = obj.y - py;
    const dist = Math.hypot(dx, dy);
    const or = obj.radius || 15;

    // basic circle overlap
    if (dist <= pr + or) {
      const cooldownOk = (frame - obj.penaltyLastAppliedAt) >= (obj.penaltyCooldownFrames || 0);
      if (cooldownOk) {
        // add penalty
        if (typeof globalState.penaltyPoints !== 'number') globalState.penaltyPoints = 0;
        globalState.penaltyPoints += (obj.penaltyAmount || 0);
        obj.penaltyLastAppliedAt = frame;
        // optional: brief visual feedback could be set here (e.g., flash color)
      }
    }
  }
}
