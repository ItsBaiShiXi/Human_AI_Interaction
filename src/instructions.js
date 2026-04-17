import {
  instructionsContainer,
  modalContainer,
  experimentContainer,
} from "./data/domElements";
import { globalState } from "./data/variable";
import { startGame } from ".";
import { getCurrentDate, countFailedAttentionCheck } from "./utils/utils.js";

/*
--------------------------------------------------------------------------------------

    Instructions page (videos and images)

--------------------------------------------------------------------------------------
*/

export function showInstructions() {
  fetch("instructions.html")
    .then((response) => response.text())
    .then((html) => {
      loadInstructionsHTML(html);
      initializeInstructionState();
      setupInstructionNavigation();
      showInstructionPage(currentPage);
    });
}

let currentPage = 1;
const totalPages = 10;
const unlockedPages = new Set();
let timer = null;
let countdownInterval = null;
let originalNextText = "Next";

function loadInstructionsHTML(html) {
  instructionsContainer.innerHTML = html;
  instructionsContainer.style.display = "block";
}

function initializeInstructionState() {
  currentPage = 1;
  unlockedPages.clear();
}

function setupInstructionNavigation() {
  const prevButton = document.getElementById("prevInstructionBtn");
  const nextButton = document.getElementById("nextInstructionBtn");

  prevButton.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      showInstructionPage(currentPage);
    }
  });

  nextButton.addEventListener("click", () => {
    const page = document.getElementById(`instructionPage-${currentPage}`);
    const video = page?.querySelector("video");

    if (nextButton.dataset.locked === "true") {
      if (video) {
        showNextTooltip("Please watch full video to continue");
      }
      return;
    }
    if (currentPage < totalPages) {
      currentPage++;
      showInstructionPage(currentPage);
    } else {
      instructionsContainer.style.display = "none";
      experimentContainer.style.display = "block";

      globalState.isComprehensionCheck = true;
      showEnterEducationTrials();

      startGame();
      // update user data before enter trials
      import("./firebase/saveData2Firebase.js").then((module) => {
        module.saveOrUpdateUser(getCurrentDate());
      });
    }
  });
}

function showNextTooltip(message) {
  const tooltip = document.getElementById("nextTooltip");
  tooltip.textContent = message;
  tooltip.style.display = "block";
  tooltip.style.opacity = "1";

  setTimeout(() => {
    tooltip.style.opacity = "0";
    setTimeout(() => {
      tooltip.style.display = "none";
    }, 300);
  }, 3000);
}

function showInstructionPage(index) {
  if (timer) clearTimeout(timer);
  if (countdownInterval) clearInterval(countdownInterval);

  for (let i = 1; i <= totalPages; i++) {
    document.getElementById(`instructionPage-${i}`)?.classList.remove("active");
  }
  document.getElementById(`instructionPage-${index}`)?.classList.add("active");

  const prevButton = document.getElementById("prevInstructionBtn");
  const nextButton = document.getElementById("nextInstructionBtn");

  prevButton.hidden = index === 1;
  nextButton.textContent = index === totalPages ? "Start" : originalNextText;

  handleInstructionUnlock(index);
}

function handleInstructionUnlock(pageIndex) {
  const nextButton = document.getElementById("nextInstructionBtn");
  if (unlockedPages.has(pageIndex)) {
    nextButton.classList.remove("disabled-visual");
    nextButton.dataset.locked = "false";
    nextButton.textContent =
      currentPage === totalPages ? "Start" : originalNextText;
    return;
  }

  const page = document.getElementById(`instructionPage-${pageIndex}`);
  const video = page?.querySelector("video");
  nextButton.classList.add("disabled-visual");
  nextButton.dataset.locked = "true";

  if (video) {
    const onEnded = () => {
      nextButton.classList.remove("disabled-visual");
      nextButton.dataset.locked = "false";
      nextButton.textContent =
        currentPage === totalPages ? "Start" : originalNextText;
      unlockedPages.add(pageIndex);
      video.removeEventListener("ended", onEnded);
    };
    video.addEventListener("ended", onEnded);
  } else {
    if (timer) clearTimeout(timer);
    if (countdownInterval) clearInterval(countdownInterval);
    let remaining = 3;
    nextButton.textContent = `${originalNextText} (${remaining})`;

    countdownInterval = setInterval(() => {
      remaining--;
      nextButton.textContent = `${originalNextText} (${remaining})`;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        nextButton.classList.remove("disabled-visual");
        nextButton.dataset.locked = "false";
        nextButton.textContent =
          currentPage === totalPages ? "Start" : originalNextText;
        unlockedPages.add(pageIndex);
      }
    }, 1000);
  }
}
/*
--------------------------------------------------------------------------------------

    Education trials

--------------------------------------------------------------------------------------
*/
export function showEnterEducationTrials() {
  modalContainer.style.display = "block";
  const modalInfo = document.getElementById("modalInfo");
  modalInfo.innerHTML = `<p>
      Now, you will play ${globalState.NUM_EDUCATION_TRIALS} comprehension check problems. Please carefully read the
      instructions and make your choices.
      </p>`;
  document.getElementById("modalOverlay").style.display = "flex";
}

export function showEnterRetryTrials() {
  modalContainer.style.display = "block";
  const modalInfo = document.getElementById("modalInfo");
  modalInfo.innerHTML = `<p>
            You did not select the best answers. <br/>
            <strong>The best answers will be shown in blue. </strong>
            Please try again.<br/>
            Note: Your can earn partial score for missed interceptions.
          </p>`;
  document.getElementById("modalOverlay").style.display = "flex";
}

export function showEndGameFailedComprehensionCheck() {
  modalContainer.style.display = "block";
  const modalInfo = document.getElementById("modalInfo");
  modalInfo.innerHTML = `<p>
             You did not pass this comprehension check problem after two attempts, 
             so the study has ended, and <strong> no compensation will be provided. </strong> <br/>
             Please <strong> return </strong>  your submission by closing this study and clicking ‘Stop Without Completing’ on Prolific. 
            </p>`;
  document.getElementById("modalOverlay").style.display = "flex";
}

export function showEndGameFailedAllAttentionCheck() {
  modalContainer.style.display = "block";
  const modalInfo = document.getElementById("modalInfo");
  modalInfo.innerHTML = `<p>
            Unfortunately, you did not pass the attention check problems, now the game is over 
            and you will be redirected back to Prolific.
            </p>`;
  document.getElementById("modalOverlay").style.display = "flex";
}

export function showFailedAttentionCheck() {
  modalContainer.style.display = "block";
  const modalInfo = document.getElementById("modalInfo");

  const failedCount = countFailedAttentionCheck();

  if (failedCount === 1) {
    modalInfo.innerHTML = `<p>
            You just failed an attention check.<br/>
            If you fail another attention check, you won’t get compensated. 
            </p>`;
  } else if (failedCount === 2) {
    modalInfo.innerHTML = `<p>
            You’ve failed another attention check.<br/>
            Since this is your second failure, you may continue the experiment, 
            but <strong>you will not be compensated</strong>.
            </p>`;
  }

  document.getElementById("modalOverlay").style.display = "flex";
}

export function showMultipleAttempts() {
  modalContainer.style.display = "block";
  const modalInfo = document.getElementById("modalInfo");
  modalInfo.innerHTML = `<p>
            You have already participated in this study. Participation is limited to one time only. <br/>
            Please <strong> return </strong> your submission by closing this study and clicking ‘Stop Without Completing’ on Prolific. 
            </p>`;
  document.getElementById("modalOverlay").style.display = "flex";
}

export function showEnterMainGame() {
  console.log("show enter main game");
  modalContainer.style.display = "block";
  const modalInfo = document.getElementById("modalInfo");
  modalInfo.innerHTML = `<p>
            Congratulations! You have completed all the comprehension check problems. <br/>
            Now, proceed to the main game.
          </p>`;
  document.getElementById("modalOverlay").style.display = "flex";
}

export function showEnterDifficultyCheck() {
  modalContainer.style.display = "block";
  const modalInfo = document.getElementById("modalInfo");
  modalInfo.innerHTML = `<p>
            You will now play ${globalState.NUM_DIFFICULTY_CHECK_TRIALS} difficulty check problems. <br/>
            Please make your best effort to maximize your score.
          </p>`;
  document.getElementById("modalOverlay").style.display = "flex";
}
