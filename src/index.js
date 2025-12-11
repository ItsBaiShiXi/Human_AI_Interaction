import {
  aiInfo,
  aiInfoContent,
  startButton,
  infoContent,
  reselectButton,
  interceptionButton,
  aiRequest,
  finishButton,
  experimentContainer,
  modalContainer,
} from "./data/domElements";
import { randSeed } from "./data/constant";
import { AI_HELP_TYPE, globalState } from "./data/variable";
import { User } from "./logic/collectData";
import {
  getUrlParameters,
  lcg,
  generateUID,
  getCurrentDate,
  measureRefreshRate,
} from "./utils/utils";
import { generatePermutations } from "./logic/computation/solutionEvaluator";
import {
  startTrial,
  reselectObjects,
  startInterception,
  revealAISolution,
  finishGame,
} from "./logic/gameEvents";
import { clearCanvas, drawGameCircle } from "./logic/drawing";
import { showConsent } from "./consent";
import { showEnterEducationTrials, showMultipleAttempts } from "./instructions";
import { redrawAll } from "./logic/drawing";
import { initializeObjects, initializePlayer } from "./logic/initialize";
import { checkIfUserExists } from "./firebase/saveData2Firebase.js";
import { initializeTrialLoader } from "./data/trialLoader.js";

if (window.location.hostname === "localhost") {
  const url = new URL(window.location.href);
  url.searchParams.set("DEBUG", "true");
  //url.searchParams.set("AI_HELP", AI_HELP_TYPE.OPTIMAL_AI_BEFORE);
  window.history.replaceState({}, "", url);
}

let urlParams = getUrlParameters();

if (urlParams.NUM_SELECTIONS !== undefined) {
  globalState.NUM_SELECTIONS = Number(urlParams.NUM_SELECTIONS);
}
if (urlParams.NUM_TRIALS !== undefined) {
  globalState.NUM_MAIN_TRIALS = Number(urlParams.NUM_TRIALS);
}
if (urlParams.NUM_OBJECTS !== undefined) {
  globalState.NUM_OBJECTS = Number(urlParams.NUM_OBJECTS);
}
if (urlParams.AI_HELP !== undefined) {
  globalState.AI_HELP = Number(urlParams.AI_HELP);
}
if (urlParams.DEBUG !== undefined) {
  globalState.isDebugMode = urlParams.DEBUG;
}
if (urlParams.USE_STATIC_TRIALS !== undefined) {
  globalState.USE_STATIC_TRIALS = urlParams.USE_STATIC_TRIALS === 'true';
}

User.prolific_pid = generateUID();
if (urlParams.PROLIFIC_PID !== undefined) {
  User.prolific_pid = urlParams.PROLIFIC_PID;
}

// Initial setup
function initGame(seed) {
  //
  if (globalState.AI_HELP == AI_HELP_TYPE.NO_AI) {
    aiInfo.style.display = "none";
    aiInfoContent.innerHTML = `<p>AI assistance will not be available in this session. </p>`;
  } else if (
    [
      AI_HELP_TYPE.OPTIMAL_AI_BEFORE,
      AI_HELP_TYPE.OPTIMAL_AI_AFTER,
      AI_HELP_TYPE.SUB_AI_AFTER,
    ].includes(globalState.AI_HELP)
  ) {
    aiInfoContent.innerHTML = `<p>AI assistance will be available in this session. </p>`;
  } else if (globalState.AI_HELP == AI_HELP_TYPE.SUBAI_REQUEST) {
    aiInfoContent.innerHTML = `<p>AI assistance is available on request in this session. </p>`;
  }

  // Enumerate all possible interception sequences of length NUM_SELECTIONS
  const indices = Array.from({ length: globalState.NUM_OBJECTS }, (_, i) => i); // [0, 1, ..., N-1]
  globalState.permutations = generatePermutations(
    indices,
    globalState.NUM_SELECTIONS
  );

  globalState.randomGenerator = lcg(seed); // Initialize random generator with the provided seed
  //infoContent.innerHTML = '<p>Measuring display refresh rate...</p>';
  //infoContent.innerHTML = `<p>Refresh rate detected: ${refreshRate} Hz. Press the button to start the game.</p>`;
  infoContent.innerHTML = `<p>Press the button to start. Please observe the sequence carefully.</p>`;
  clearCanvas();
  drawGameCircle();
  startButton.style.display = "block";
  //startButton.blur();
}

// Load Modal
async function loadModal() {
  const response = await fetch("modal.html");
  const html = await response.text();
  modalContainer.innerHTML = html;

  document.getElementById("closeModal").addEventListener("click", () => {
    document.getElementById("modalOverlay").style.display = "none";
    if (globalState.needRetry) {
      globalState.canShowAIAnswer = true;
      initializeObjects(
        globalState.isComprehensionCheck,
        globalState.needRetry
      );
      initializePlayer();
      redrawAll();
      infoContent.innerHTML = `
        <p>You did not select the best answers.<br/>
        The best answers are displayed as blue numbers.<br/>
        Please carefully try again in the second attempt.</p>`;
    }
  });
}

/*
--------------------------------------------------------------------------------------

    Start the Experiment

--------------------------------------------------------------------------------------
*/
initExperimentEnvironment();

async function initExperimentEnvironment() {
  try {
    const { refreshRate, speedMultiplier } = await measureRefreshRate();
    globalState.refreshRate = refreshRate;
    globalState.speedMultiplier = speedMultiplier;
    globalState.OBSERVATION_FRAMES = Math.round(3000 * (refreshRate / 1000));
    globalState.INTERCEPTION_FRAMES = Math.round(2000 * (refreshRate / 1000));
    console.log(
      "refreshRate:",
      refreshRate,
      ", speedMultiplier:",
      speedMultiplier
    );
    await startExperiment(false, false);
  } catch (error) {
    console.error("❌ Failed to initialize environment:", error);
  }
}

async function startExperiment(skipConsent = false, skipEducation = false) {
  try {
    // Initialize trial loader if using static trials
    if (globalState.USE_STATIC_TRIALS) {
      console.log('🎲 Loading pre-generated trials...');
      const loaded = await initializeTrialLoader();
      if (loaded) {
        console.log('✓ Pre-generated trials loaded successfully');
      } else {
        console.warn('⚠ Failed to load pre-generated trials, falling back to random generation');
        globalState.USE_STATIC_TRIALS = false;
      }
    }

    await loadModal();

    const userExists = await checkIfUserExists(User.prolific_pid);
    if (userExists) {
      // multiple attempts, not allowed
      showMultipleAttempts();
      return;
    }

    User.create_time = getCurrentDate();
    const { saveOrUpdateUser } = await import(
      "./firebase/saveData2Firebase.js"
    );
    await saveOrUpdateUser(getCurrentDate());

if (globalState.isDebugMode) {
  console.log("Debug mode enabled: Skipping consent and education trials.");
      skipConsent = true;
      skipEducation = true;
    }


    if (!skipConsent) {
      showConsent();
      return;
    }

    if (!skipEducation) {
      globalState.isComprehensionCheck = true;
      showEnterEducationTrials();
    }
    experimentContainer.style.display = "block";
    startGame();
  } catch (error) {
    console.error("❌ Failed to start experiment:", error);
  }
}

/*
--------------------------------------------------------------------------------------

    Starting the game

--------------------------------------------------------------------------------------
*/

// Start initialization on page load with a seed
export function startGame() {
  initGame(randSeed); // Replace 12345 with any desired seed

  // Add event listeners to buttons
  startButton.addEventListener("click", startTrial);
  reselectButton.addEventListener("click", reselectObjects);
  interceptionButton.addEventListener("click", startInterception);
  aiRequest.addEventListener("click", revealAISolution);
  finishButton.addEventListener("click", () => {
    finishGame();
  });
}
