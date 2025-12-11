import { globalState, AI_HELP_TYPE } from "../data/variable.js";
import {
  canvas,
  startButton,
  replayButton,
  interceptionButton,
  reselectButton,
  aiRequest,
  infoContent,
  experimentContainer,
  resultInfoContent,
  finishButton,
} from "../data/domElements.js";
import {
  showEndGameFailedComprehensionCheck,
  showEnterMainGame,
  showEnterRetryTrials,
  showFailedAttentionCheck,
} from "../instructions.js";
import { redrawAll } from "./drawing.js";
import { animateObjects, animateInterception } from "./animation.js";
import { initializeObjects, initializeObjectsFromTrialData, initializePlayer } from "./initialize.js";
import { handleObjectSelection, handleMouseHover } from "./mouseEvents.js";
import { lookupInterceptionPaths } from "./computation/solutionEvaluator.js";
import { showFeedback } from "../feedback.js";
import { startTimer, stopTimer, getTimerValue } from "./timeTracker.js";
import {
  getCurrentTrialData,
  getCurrentExperimentData,
  updateTrialData,
  updateExperimentData,
  User,
} from "./collectData.js";
import {
  createNewExperimentData,
  createNewTrialData,
  addToCustomCount,
  recordUserChoiceData,
} from "./collectData.js";
import {
  getCurrentDate,
  getOrdinalSuffix,
  isAttentionCheck,
} from "../utils/utils.js";

/*
--------------------------------------------------------------------------------------

    Start the trial

--------------------------------------------------------------------------------------
*/
export async function startTrial() {
  recordPreviousTrialData();
  prepareNewTrial();

  console.log(`------curTrial: ${globalState.curTrial}---------`);

  initializeTrialData();

  prepareUIForTrial();
  await initializeGameState();
  startTrialAnimation();
}

function recordPreviousTrialData() {
  const curExperiment = getCurrentExperimentData();
  const lastTrial = getCurrentTrialData(globalState.isComprehensionCheck);

  if (lastTrial) {
    const trialSec = getTimerValue("trial");
    updateTrialData(
      lastTrial,
      globalState.userSolution,
      globalState.bestSolution,
      trialSec,
      globalState.canShowAIAnswer || globalState.retryCnt > 0
    );

    // Update experiment status based on attention checks and progress
    updateExperimentData(
      curExperiment,
      globalState.isComprehensionCheck,
      lastTrial,
      globalState.userSolution
    );
  }

  import("../firebase/saveData2Firebase.js").then((module) => {
    module.saveSingleTrial(curExperiment, lastTrial); // save the last trial data
    // (when click 'start next interception', last trial finishes)
    // if trial doesn't exist, only update user / experiment data
  });

  stopTimer("trial");
}

function prepareNewTrial() {
  if (
    globalState.isComprehensionCheck &&
    !globalState.needRetry &&
    globalState.curTrial === globalState.NUM_EDUCATION_TRIALS
  ) {
    globalState.isComprehensionCheck = false;
    globalState.curTrial = 0;
    globalState.retryCnt = 0;
  }

  if (globalState.needRetry) {
    globalState.retryCnt++;
  } else {
    globalState.curTrial++;
  }
  globalState.canShowAIAnswer = false;
  globalState.demoPlayTimes = 0;

  startTimer("trial");
}

export function initializeExperimentData() {
  const newExperiment = createNewExperimentData(
    globalState.curExperiment,
    globalState.NUM_MAIN_TRIALS
  );
  User.experiments.push(newExperiment);
}

function initializeTrialData() {
  if (User.experiments.length === 0) {
    // Initialize experiment if it doesn't exist
    initializeExperimentData();
  }

  const trialId = globalState.curTrial;
  const isComprehension = globalState.isComprehensionCheck;
  const isAttention = isAttentionCheck();
  const curExp = User.experiments[globalState.curExperiment];

  // Check if trial already exists (for comprehension trials only)
  if (
    isComprehension &&
    curExp.comprehension_trials.some((t) => t.trial_id === trialId)
  ) {
    return; // Trial already exists, do not re-add
  }

  const newTrial = createNewTrialData(trialId, isComprehension, isAttention);

  if (isComprehension) {
    curExp.comprehension_trials.push(newTrial);
  } else {
    curExp.trials.push(newTrial);
  }
}

function prepareUIForTrial() {
  startButton.style.display = "none";
  startButton.blur();
  aiRequest.disabled = true;

  infoContent.innerHTML =
    "<p>Please observe object values and movements carefully.</p>";
  resultInfoContent.innerHTML = ``;
}

async function initializeGameState() {
  // Use pre-generated trials if enabled, otherwise use random generation
  if (globalState.USE_STATIC_TRIALS) {
    await initializeObjectsFromTrialData(globalState.isComprehensionCheck, globalState.needRetry);
  } else {
    initializeObjects(globalState.isComprehensionCheck, globalState.needRetry);
  }
  initializePlayer();
  globalState.totalFrames = 0;
}

function startTrialAnimation() {
  globalState.animationFrameId = requestAnimationFrame(animateObjects);
}

/*
--------------------------------------------------------------------------------------

    End Demo

--------------------------------------------------------------------------------------
*/
export async function endDemo() {
  cancelAnimationFrame(globalState.animationFrameId);

  updateInfoPanel();
  showReplayButton();
  updateAIState();

  globalState.lastRoundObjects = structuredClone(globalState.objects); // save object state for retry
  globalState.demoPlayTimes++;

  loadBestSolutions(() => {
    // wait until caculation ends
    redrawAll();
    startThinkTimerIfFirstDemo();
  });
}

function updateInfoPanel() {
  let info = `
    <p><center>OR</center></p>
    <p>Click on ${globalState.NUM_SELECTIONS} objects to set the interception order.</p>
    <p>Maximize scores by intercepting objects.</p>
  `;

  let attentionCheckInfo = `
    <p>This is an attention check.</p>
    <p>To pass the attention check, click the ${globalState.NUM_SELECTIONS} objects
     with the highest color intensity on the screen — order doesn’t matter.</p>
   `;

  if (globalState.isComprehensionCheck) {
    info += `<p>Scores are awarded based on how close you are to the selected objects and their values.</p>`;
    if (globalState.needRetry) {
      info += `<p>You have one remaining attempt to pass this comprehension check.</p>`;
    } else {
      info += `<p>You have two attempts to pass this comprehension check trial.</p>`;
    }
  }

  if ([AI_HELP_TYPE.OPTIMAL_AI_BEFORE].includes(globalState.AI_HELP)) {
    info += `<p>The suggested AI solution is shown in blue</p>`;
  }

  if (isAttentionCheck()) {
    info = attentionCheckInfo;
  }

  infoContent.innerHTML = info;

  canvas.addEventListener("click", handleObjectSelection);
  canvas.addEventListener("mousemove", handleMouseHover);
}

function showReplayButton() {
  replayButton.disabled = false;
  replayButton.style.display = "block";
  replayButton.addEventListener("click", replayDemo);
}

function loadBestSolutions(callback) {
  // ========== ADD THIS: Generate permutations for selectable balls only ==========
  // Filter to get only selectable ball indices (excludes bomb)
  const selectableIndices = globalState.objects
    .filter(obj => !obj.isBomb && obj.canBeSelected !== false)
    .map(obj => obj.index);
  
  globalState.permutations = import("./computation/solutionEvaluator.js")
    .then((module) => {
      globalState.permutations = module.generatePermutations(
        selectableIndices, 
        globalState.NUM_SELECTIONS
      );
      return module.enumerateAllSolutions();
    })
    // ===============================================================================
    .then(([allSolutions, bestSolution, subOptimalSolution]) => {
      globalState.allSolutions = allSolutions;
      globalState.bestSolution = bestSolution;
      globalState.subOptimalSolution = subOptimalSolution;

      if (callback) callback();
    })
    .catch((error) => console.error("Error loading solutions:", error));
}

function updateAIState() {
  // whether to show request ai button
  if (globalState.AI_HELP === AI_HELP_TYPE.SUBAI_REQUEST) {
    aiRequest.style.display = "block";
    aiRequest.disabled = false;
  }

  // whether to show ai answer
  if ([AI_HELP_TYPE.OPTIMAL_AI_BEFORE].includes(globalState.AI_HELP)) {
    globalState.canShowAIAnswer = true;
  }

  // todo fsy: ai after
}

function startThinkTimerIfFirstDemo() {
  if (globalState.demoPlayTimes === 1) {
    startTimer("think");
  }
}

/*
--------------------------------------------------------------------------------------

    Replay Demo

--------------------------------------------------------------------------------------
*/
export function replayDemo() {
  globalState.canShowAIAnswer = false;
  replayButton.disabled = true; // Disables the button
  globalState.totalFrames = 0; // Reset frame counter
  globalState.animationFrameId = requestAnimationFrame(animateObjects);

  // record replay num
  const currentTrial = getCurrentTrialData(globalState.isComprehensionCheck);
  addToCustomCount(
    currentTrial.replay_num,
    1,
    globalState.canShowAIAnswer || globalState.retryCnt > 0
  );
}

/*
--------------------------------------------------------------------------------------

    Reselect Objects

--------------------------------------------------------------------------------------
*/
export function reselectObjects() {
  resetSelections();
  enableInteraction();
  restoreReplayUI();

  // record reselect num
  const currentTrial = getCurrentTrialData(globalState.isComprehensionCheck);
  addToCustomCount(
    currentTrial.reselect_num,
    1,
    globalState.canShowAIAnswer || globalState.retryCnt > 0
  );
}

function resetSelections() {
  for (let index of globalState.selectedObjects) {
    const object = globalState.objects.find((obj) => obj.index === index);
    if (object) {
      object.isSelected = false;
      delete object.selectionIndex;
    }
  }

  globalState.selectedObjects = [];
  globalState.hoverObjectIndex = -1;
}

function enableInteraction() {
  canvas.addEventListener("click", handleObjectSelection);
  canvas.addEventListener("mousemove", handleMouseHover);

  redrawAll();
}

function restoreReplayUI() {
  interceptionButton.style.display = "none";
  reselectButton.disabled = true;
  replayButton.disabled = false;
}

export function setBallColorByIndex(ballIndex, fill = "blue", stroke = fill) {
  const obj = globalState.objects.find(o => o.index === ballIndex);
  if (!obj) return;

  obj.colorFill = fill;
  obj.colorStroke = stroke;

  // If you don't have a continuous animation loop running, force a redraw:
  redrawAll();
}

/*
--------------------------------------------------------------------------------------

    Start Interception

--------------------------------------------------------------------------------------
*/
export function startInterception() {
  hideInterceptionControls();
  // Reset per-run penalty counter
  globalState.penaltyPoints = 0;
  
  computeUserSolution();
  resetInterceptionState();
  updateInterceptionInfo();
  startInterceptionAnimation();

  recordTrialDataStartIntercept();

  stopTimer("think");
}

function hideInterceptionControls() {
  reselectButton.style.display = "none";
  interceptionButton.style.display = "none";
  replayButton.style.display = "none";
  aiRequest.style.display = "none";
}

function computeUserSolution() {
  globalState.userSolution = lookupInterceptionPaths();
}

function resetInterceptionState() {
  globalState.interceptionCounter = 0;
  globalState.interceptionFrame = 0;
}

function updateInterceptionInfo() {
  infoContent.innerHTML = "<p>Interception sequence in progress...</p>";
  globalState.canShowAIAnswer = false;
}

function startInterceptionAnimation() {
  globalState.animationFrameId = requestAnimationFrame(animateInterception);
}

function recordTrialDataStartIntercept() {
  const currentTrial = getCurrentTrialData(globalState.isComprehensionCheck);
  recordUserChoiceData(currentTrial, globalState.userSolution);

  const thinkTimeSec = getTimerValue("think");
  addToCustomCount(
    currentTrial.think_time,
    thinkTimeSec,
    globalState.canShowAIAnswer || globalState.retryCnt > 0
  );
}

/*
--------------------------------------------------------------------------------------

    Finish the interception

--------------------------------------------------------------------------------------
*/
export function finishInterception() {
  console.log(`Finished interception sequence`);
  cancelAnimationFrame(globalState.animationFrameId);

  // Display final trial info
  displayTrialResults();

  if (globalState.isComprehensionCheck) {
    handleComprehensionMode();
  } else {
    handleMainMode();
  }
}

function updateButtonVisibility(isFinished) {
  if (isFinished) {
    finishButton.style.display = "block";
    startButton.style.display = "none";
  } else {
    startButton.style.display = "block";
    finishButton.style.display = "none";
  }
}

function displayTrialResults() {
  infoContent.innerHTML = `<p>Interception Complete</p>`;

  const { totalValueProp, rank, interceptedCnt } = globalState.userSolution;

  const valNow = Math.round(totalValueProp * 100);
  const rankNow = Math.round(rank);
  const intercepted = Math.round(interceptedCnt);

  let scoreText = `<p>Your score: ${valNow} (Range: 0-100)</p>
                   <p>Your choice: ${getOrdinalSuffix(
                     rankNow
                   )} best solution</p>`;

  if (intercepted === globalState.NUM_SELECTIONS) {
    scoreText =
      `<p>Successfully intercept both selected objects</p>` + scoreText;
  } else if (intercepted === 1) {
    scoreText = `<p>Miss Object 2: out of range</p>` + scoreText;
  } else {
    scoreText = `<p>Fail to intercept either selected object</p>` + scoreText;
  }

  resultInfoContent.innerHTML = scoreText;
}

function handleComprehensionMode() {
  updateButtonVisibility(false);
  if (globalState.userSolution.totalValueProp * 100 === 100) {
    globalState.needRetry = false;
    globalState.retryCnt = 0;

    if (globalState.curTrial === globalState.NUM_EDUCATION_TRIALS) {
      showEnterMainGame();
      initializeExperimentData();

      User.is_passed_education = true;
      import("../firebase/saveData2Firebase.js").then((module) => {
        module.saveOrUpdateUser(getCurrentDate());
      });
    }
  } else {
    if (globalState.retryCnt < 1) {
      globalState.needRetry = true;
      recordPreviousTrialData();
      showEnterRetryTrials();
    } else {
      globalState.needRetry = false;
      // Show correct button
      updateButtonVisibility(true);
      showEndGameFailedComprehensionCheck();
      finishGame();
    }
  }
}

function handleMainMode() {
  // Show correct button
  updateButtonVisibility(globalState.curTrial === globalState.NUM_MAIN_TRIALS);

  // Check if current trial is an attention check trial
  if (isAttentionCheck()) {
    const passed = globalState.userSolution.totalValueProp * 100 === 100;
    if (!passed) {
      showFailedAttentionCheck();
    }
  }
}

/*
--------------------------------------------------------------------------------------

    Other Events

--------------------------------------------------------------------------------------
*/
export function revealAISolution() {
  if (globalState.AI_HELP == AI_HELP_TYPE.SUBAI_REQUEST) {
    // todo fsy: record current user choice
    globalState.canShowAIAnswer = true;

    redrawAll();
  }
}

export function finishGame() {
  console.log("Game finished");

  cancelAnimationFrame(globalState.animationFrameId);

  // Record data
  recordPreviousTrialData();

  stopTimer("think");
  stopTimer("trial");

  if (globalState.curTrial == globalState.NUM_MAIN_TRIALS) {
    // finish all trials
    // Hide the main game container
    experimentContainer.style.display = "none";
    showFeedback();
  } else {
    // failed education(comprehension) trials
    showEndGameFailedComprehensionCheck();
    return;
  }
}
