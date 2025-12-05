/**
 * Calculates the current value of a blue ball based on time decay.
 * Blue balls maintain full value during observation, then decay linearly during interception.
 *
 * @param {Object} obj - The ball object
 * @param {number} currentFrame - Current frame number
 * @param {number} observationFrames - Total frames in observation phase
 * @param {number} interceptionFrames - Total frames in interception phase
 * @returns {number} - The current value of the ball (accounting for decay if blue)
 */
export function getBlueBallValue(obj, currentFrame, observationFrames, interceptionFrames) {
  // Only blue balls decay
  if (obj.type !== 'blue' || obj.initialValue === undefined) {
    return obj.value;
  }

  // During observation phase: keep at full initial value
  if (currentFrame <= observationFrames) {
    return obj.initialValue;
  }

  // During interception phase: decay linearly over 6 seconds (3x interceptionFrames)
  const interceptionFrame = currentFrame - observationFrames;
  const decayRate = obj.initialValue / (interceptionFrames * 3);
  const currentValue = obj.initialValue - (interceptionFrame * decayRate);

  // Floor at 0 (never negative)
  return Math.max(0, currentValue);
}
