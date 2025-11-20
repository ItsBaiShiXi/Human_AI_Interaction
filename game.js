import { infoContent, resultInfoContent } from "./src/data/domElements";

// Get references to the canvas, context, info div, and start buttons
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const info = document.getElementById("info");
const startButton = document.getElementById("startButton");
const replayButton = document.getElementById("replayButton");
const reselectButton = document.getElementById("reselectButton");
const interceptionButton = document.getElementById("interceptionButton"); // Reference to interception button
const aiRequest = document.getElementById("aiRequest");

let urlParams = getUrlParameters();
let NUM_SELECTIONS = 2; // Maximum number of objects to select
let NUM_OBJECTS = 3; // Number of animated objects
let AI_HELP = 0;
if (urlParams.NUM_SELECTIONS !== undefined) {
  NUM_SELECTIONS = Number(urlParams.NUM_SELECTIONS);
}
if (urlParams.NUM_OBJECTS !== undefined) {
  NUM_OBJECTS = Number(urlParams.NUM_OBJECTS);
}
if (urlParams.AI_HELP !== undefined) {
  AI_HELP = Number(urlParams.AI_HELP);
}

// Global variables for random generator (implements deterministic sequence that can be recreated in other languages)
let randomGenerator;

// Global settings
// Calculate frame-based durations
const refreshRate = 60; // assumed refresh rate
const OBSERVATION_FRAMES = Math.round(3000 * (refreshRate / 1000)); // 3000 ms for demo
const INTERCEPTION_FRAMES = Math.round(2000 * (refreshRate / 1000)); // 2000 ms for interception

const MIN_SPEED = 60;
const MAX_SPEED = 120;
const alphaParam = 1;
const betaParam = 2;
const GAME_RADIUS = 400; // Radius of game circle
const ARROW_FACTOR = 30;
let centerX, centerY;

const randSeed = 12345; // seed for random number generator

let totalFrames;
let animationFrameId;
let animationStartTime;
let player; // hold player properties
let objects = []; // Array to hold object properties
let selectedObjects = []; // Tracks selected objects for interception sequence
let hoverObjectIndex = -1; // Tracks which object is being hovered over
let speedMultiplier = 1; // Multiplier to adjust speed based on refresh rate

let permutations;
let allSolutions, bestSolution;
let playerSolution;
let interceptionCounter, interceptionFrame;
let canshowRequestAI;

/*
--------------------------------------------------------------------------------------

    Code for game mechanics

--------------------------------------------------------------------------------------
*/

// Function to initialize the animated objects
function initializeObjects() {
  objects = [];
  selectedObjects = []; // Reset selections
  hoverObjectIndex = -1; // Reset hover index
  for (let i = 0; i < NUM_OBJECTS; i++) {
    let randomDirection;
    let randomSpeed, randomRadius, randomStartAngle;
    let x0, y0, dx, dy, speed, finalx, finaly;
    let ok = false;
    do {
      randomDirection = randomGenerator() * Math.PI * 2;
      randomSpeed = randomGenerator() * (MAX_SPEED - MIN_SPEED) + MIN_SPEED; // Speed between 50 and 100
      randomRadius = randomGenerator() * GAME_RADIUS * 0.6 + GAME_RADIUS / 3;
      randomStartAngle = randomGenerator() * Math.PI * 2;
      speed = (randomSpeed * speedMultiplier) / refreshRate;

      x0 = centerX + Math.cos(randomStartAngle) * randomRadius; // Random starting position within the circle
      y0 = centerY + Math.sin(randomStartAngle) * randomRadius;

      dx = speed * Math.cos(randomDirection);
      dy = speed * Math.sin(randomDirection);

      finalx = x0 + dx * OBSERVATION_FRAMES;
      finaly = y0 + dy * OBSERVATION_FRAMES;
      const finalradius = Math.sqrt(
        (finalx - centerX) ** 2 + (finaly - centerY) ** 2
      );
      if (finalradius > 100 && finalradius < GAME_RADIUS - 50) ok = true;
    } while (!ok);

    //const value = randomGenerator(); // Random value between 0 and 1
    const value = sampleBeta(alphaParam, betaParam);

    objects.push({
      x0: x0,
      y0: y0,
      radius: 15, // Radius of each animated object
      speed: speed,
      dX: dx,
      dY: dy,
      value: value, // Determines the fraction of the object to fill
      isSelected: false, // Tracks if this object has been selected
      selectionIndex: NaN,
      isIntercepted: false,
      index: i,
    });
  }
}

// Function to initialize the player
function initializePlayer() {
  let randomDirection;
  let randomSpeed, randomRadius, randomStartAngle;
  let x0, y0, dx, dy, speed, finalx, finaly;
  x0 = centerX;
  y0 = centerY;
  //randomSpeed = randomGenerator() * (MAX_SPEED - MIN_SPEED) + MIN_SPEED; // Speed between 50 and 100
  randomSpeed = MAX_SPEED;
  speed = (randomSpeed * speedMultiplier) / refreshRate;
  dx = 0;
  dy = 0;
  player = {
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

function animateObjects() {
  // Update positions and redraw
  updateObjectPositions(totalFrames);
  clearCanvas();
  drawGameCircle();
  drawObjects();
  drawPlayer();

  // Increment frame counter
  totalFrames++;

  // Continue animation or end demo
  if (totalFrames < OBSERVATION_FRAMES) {
    animationFrameId = requestAnimationFrame(animateObjects);
  } else {
    endDemo();
  }
}

function animateInterception() {
  // Update positions and redraw
  updateObjectPositions(totalFrames);
  let status = updatePlayerPosition();
  clearCanvas();
  drawGameCircle();
  drawObjects();
  drawPlayer(); // temp

  // Increment frame counter
  totalFrames++;

  // Is the player still within the game area?
  let isInCircle =
    Math.sqrt((player.x - centerX) ** 2 + (player.y - centerY) ** 2) <=
    GAME_RADIUS;

  // Continue animation or end interception sequence
  if (isInCircle && status == "in progress") {
    animationFrameId = requestAnimationFrame(animateInterception);
  } else {
    console.log(`Finished interception sequence`);
    cancelAnimationFrame(animationFrameId);
    startButton.style.display = "block";
    valNow = Math.round(playerSolution.totalValueProp * 100);
    if (!isInCircle) {
      infoContent.innerHTML = `<p>Reached outside of the circle</p><p>Point value achieved: ${valNow}% of the best AI solution.</p>`;
    } else {
      infoContent.innerHTML = `<p>Finished interception sequence</p><p>Point value achieved: ${valNow}% of the best AI solution.</p>`;
    }
  }
}

// Function to update object positions
function updateObjectPositions(frame) {
  objects.forEach((object) => {
    // Update object's position based on its speed
    object.x = object.x0 + frame * object.dX;
    object.y = object.y0 + frame * object.dY;
  });
}

function updatePlayerPosition() {
  const moves = playerSolution?.moves || [];
  if (moveCounter >= moves.length) return "finished";

  const currentMove = moves[moveCounter];
  interceptionFrame += 1;

  // step the player one frame along this move
  player.x += currentMove.dX;
  player.y += currentMove.dY;

  // finished this move segment?
  if (interceptionFrame >= currentMove.timeToIntercept) {
    // Only mark the object if this was the final segment for that target
    if (currentMove.isFinalForTarget) {
      const objIdx = currentMove.targetObjectId;
      if (Number.isInteger(objIdx) && objects[objIdx]) {
        objects[objIdx].isIntercepted = currentMove.success;
      }
    }

    // advance to next move
    moveCounter += 1;
    interceptionFrame = 0;

    if (moveCounter >= moves.length) {
      return "finished";
    }
  }

  return "in progress";
}

function startDemo() {
  // Hide the start round button
  startButton.style.display = "none";
  startButton.blur();
  aiRequest.disabled = true;

  // Update the info div
  infoContent.innerHTML = "<p>Example sequence in progress...</p>";
  resultInfoContent.innerHTML = `<p>Your score: (Range: 0-100)</p><p>Your choice:</p>`;
  canshowRequestAI = false;

  // Initialize the objects and the player positions, direction and speed
  initializeObjects();
  initializePlayer();

  // Reset frame counter for the demo
  totalFrames = 0;

  // Start the animation
  animationFrameId = requestAnimationFrame(animateObjects);
}

function reselectObjects() {
  for (let index of selectedObjects) {
    let object = objects.find((obj) => obj.index === index);
    if (object) {
      object.isSelected = false;
      delete object.selectionIndex;
    }
  }

  hoverObjectIndex = -1;
  selectedObjects = [];

  canvas.addEventListener("click", handleObjectSelection);
  canvas.addEventListener("mousemove", handleMouseHover);

  clearCanvas();
  drawGameCircle();
  drawObjects();
  drawPlayer();

  interceptionButton.style.display = "none";
  reselectButton.disabled = true;
  replayButton.disabled = false;
  interceptionButton.disabled = true;
}

function startInterceptionSequence() {
  reselectButton.style.display = "none";
  interceptionButton.style.display = "none"; // Hide the interception button
  replayButton.style.display = "none";
  aiRequest.style.display = "none";
  //aiRequest.disabled = true; // Disables the button

  playerSolution = lookupInterceptionPaths();
  moveCounter = 0;       // start at the first move
  interceptionFrame = 0; // frame within current move

  infoContent.innerHTML = "<p>Interception sequence in progress...</p>";
  canshowRequestAI = false;

  // Start the interception animation
  animationFrameId = requestAnimationFrame(animateInterception);
}

function endDemo() {
  cancelAnimationFrame(animationFrameId);
  infoContent.innerHTML = `<p><center>OR</center></p><p>When ready, click on ${NUM_SELECTIONS} objects to determine the order of interception. The goal is to maximize the point value across successfully intercepted objects</p>`;
  if (AI_HELP == 1) {
    infoContent.innerHTML += `<p>The suggested AI solution is shown in blue </p>`;
  }
  canvas.addEventListener("click", handleObjectSelection);
  canvas.addEventListener("mousemove", handleMouseHover);

  // Show the replay button
  replayButton.disabled = false; // enables the button
  replayButton.style.display = "block";
  replayButton.addEventListener("click", replayDemo);

  [allSolutions, bestSolution] = enumerateAllSolutions();

  if (AI_HELP == 2) {
    aiRequest.style.display = "block";
    aiRequest.disabled = false;
  }

  if (AI_HELP == 1) {
    canshowRequestAI = true;
  }

  clearCanvas();
  drawGameCircle();
  drawObjects();
  drawPlayer();
}

function replayDemo() {
  canshowRequestAI = false;
  replayButton.disabled = true; // Disables the button
  //replayButton.style.display = 'none'; // Hide the button during replay
  //initializeObjects(); // Reinitialize objects for replay
  //initializePlayer();  // Reinitialize player for replay
  totalFrames = 0; // Reset frame counter
  animationFrameId = requestAnimationFrame(animateObjects);
}

function revealAISolution() {
  if (AI_HELP == 2) {
    canshowRequestAI = true;

    clearCanvas();
    drawGameCircle();
    drawObjects();
    drawPlayer();
  }
}

// Initial setup
function initGame(seed) {
  //
  if (AI_HELP == 0) {
    aiInfoContent.innerHTML = `<p>AI assistance will not be available in this session. </p>`;
  } else if (AI_HELP == 1) {
    aiInfoContent.innerHTML = `<p>AI assistance will be available in this session. </p>`;
  } else if (AI_HELP == 2) {
    aiInfoContent.innerHTML = `<p>AI assistance is available on request in this session. </p>`;
  }

  // Enumerate all possible interception sequences of length NUM_SELECTIONS
  const indices = Array.from({ length: NUM_OBJECTS }, (_, i) => i); // [0, 1, ..., N-1]
  permutations = generatePermutations(indices, NUM_SELECTIONS);

  randomGenerator = lcg(seed); // Initialize random generator with the provided seed
  //infoContent.innerHTML = '<p>Measuring display refresh rate...</p>';
  //infoContent.innerHTML = `<p>Refresh rate detected: ${refreshRate} Hz. Press the button to start the game.</p>`;
  infoContent.innerHTML = `<p>Press the button to start. Please observe the sequence carefully.</p>`;
  clearCanvas();
  drawGameCircle();
  startButton.style.display = "block";
  //startButton.blur();
}

/*
--------------------------------------------------------------------------------------

    Starting the game

--------------------------------------------------------------------------------------
*/

// Start initialization on page load with a seed
initGame(randSeed); // Replace 12345 with any desired seed

// Add event listeners to buttons
startButton.addEventListener("click", startDemo);
reselectButton.addEventListener("click", reselectObjects);
interceptionButton.addEventListener("click", startInterceptionSequence);
aiRequest.addEventListener("click", revealAISolution);

/*
--------------------------------------------------------------------------------------

    Drawing functions 

--------------------------------------------------------------------------------------
*/

// Function to handle mouse hover
function handleMouseHover(event) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  hoverObjectIndex = objects.findIndex(
    (object) =>
      Math.hypot(mouseX - object.x, mouseY - object.y) <= object.radius
  );

  clearCanvas();
  drawGameCircle();
  drawObjects();
  drawPlayer();
}

// Function to handle object selection
function handleObjectSelection(event) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  for (let object of objects) {
    const distance = Math.hypot(mouseX - object.x, mouseY - object.y);
    if (
      distance <= object.radius &&
      !object.isSelected &&
      selectedObjects.length < NUM_SELECTIONS
    ) {
      object.isSelected = true;
      object.selectionIndex = selectedObjects.length;
      selectedObjects.push(object.index); // store the index of the object
      drawObjects();

      replayButton.disabled = true; // Disables the button

      reselectButton.style.display = "block";
      reselectButton.disabled = false;

      if (selectedObjects.length === NUM_SELECTIONS) {
        canvas.removeEventListener("click", handleObjectSelection);
        canvas.removeEventListener("mousemove", handleMouseHover);
        interceptionButton.style.display = "block";
      }
      break;
    }
  }
}

// Function to draw arrows indicating direction and speed
function drawArrows() {
  objects.forEach((object) => {
    if (!object.isIntercepted) {
      const arrowLength = Math.hypot(object.dX, object.dY) * ARROW_FACTOR; // Scale speed for arrow length
      const angle = Math.atan2(object.dY, object.dX);

      const startX = object.x;
      const startY = object.y;
      const endX = startX + arrowLength * Math.cos(angle);
      const endY = startY + arrowLength * Math.sin(angle);

      // Draw the main arrow line
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "gray";
      ctx.stroke();

      // Draw the arrowhead
      const arrowheadLength = 12;
      const arrowheadAngle = Math.PI / 6;

      const leftX = endX - arrowheadLength * Math.cos(angle - arrowheadAngle);
      const leftY = endY - arrowheadLength * Math.sin(angle - arrowheadAngle);

      const rightX = endX - arrowheadLength * Math.cos(angle + arrowheadAngle);
      const rightY = endY - arrowheadLength * Math.sin(angle + arrowheadAngle);

      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fillStyle = "gray";
      ctx.fill();
    }
  });
}

function drawPlayerArrow() {
  // Draw the player arrow
  const arrowLength = Math.hypot(player.dX, player.dY) * ARROW_FACTOR;
  const angle = Math.atan2(player.dY, player.dX);

  const startX = player.x;
  const startY = player.y;
  const endX = startX + arrowLength * Math.cos(angle);
  const endY = startY + arrowLength * Math.sin(angle);

  // Draw the main arrow line
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "gray";
  ctx.stroke();

  // Draw the arrowhead
  const arrowheadLength = 12;
  const arrowheadAngle = Math.PI / 6;

  const leftX = endX - arrowheadLength * Math.cos(angle - arrowheadAngle);
  const leftY = endY - arrowheadLength * Math.sin(angle - arrowheadAngle);

  const rightX = endX - arrowheadLength * Math.cos(angle + arrowheadAngle);
  const rightY = endY - arrowheadLength * Math.sin(angle + arrowheadAngle);

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fillStyle = "gray";
  ctx.fill();
}

// Function to draw all animated objects
function drawObjects() {
  objects.forEach((object, index) => {
    if (!object.isIntercepted) {
      // Highlight object if hovered
      if (index === hoverObjectIndex) {
        ctx.beginPath();
        ctx.arc(object.x, object.y, object.radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 0, 0, 0.3)"; // Glow effect
        ctx.fill();
      }

      // Draw the object's filled area
      ctx.beginPath();
      ctx.arc(object.x, object.y, object.radius * object.value, 0, Math.PI * 2);
      ctx.fillStyle = "red";
      ctx.fill();

      /*
            // Set text alignment and baseline for centering
            ctx.textAlign = 'center';    // Aligns text horizontally to the center
            ctx.textBaseline = 'middle'; // Aligns text vertically to the center

            ctx.fillStyle = 'rgba(87, 67, 13, 0.3)';
            let fontSize = Math.round( object.value * 80 );
            ctx.font = `${fontSize}px Arial`;
            ctx.fillText( '$', object.x, object.y);
            */
      ctx.textAlign = "center"; // Aligns text horizontally to the center
      ctx.textBaseline = "middle"; // Aligns text vertically to the center
      ctx.fillStyle = "rgb(0, 0, 0)";
      let fontSize = 20;
      ctx.font = `${fontSize}px Arial`;
      ctx.fillText(index, object.x, object.y);

      // Draw the object's border
      ctx.beginPath();
      ctx.arc(object.x, object.y, object.radius, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      //ctx.fillStyle = 'rgba(14, 13, 13, 0.3)'; // Glow effect
      ctx.strokeStyle = "red";
      ctx.stroke();
      //ctx.fill();

      // Draw selection number if selected
      if (object.isSelected) {
        const selectionIndex = object.selectionIndex;
        ctx.fillStyle = "black";
        ctx.font = "24px Arial";
        ctx.fillText(
          selectionIndex + 1,
          object.x + object.radius + 14,
          object.y + 8
        );
      }

      if (canshowRequestAI) {
        let AISelectionIndex = bestSolution.sequence.indexOf(index);
        if (AISelectionIndex !== -1) {
          ctx.fillStyle = "blue";
          ctx.font = "24px Arial";
          ctx.fillText(
            AISelectionIndex + 1,
            object.x - object.radius - 20,
            object.y + 8
          );
        }
      }

      // For debugging
      if (!true) {
        ctx.fillStyle = "red";
        ctx.font = "24px Arial";
        ctx.fillText(index, object.x + object.radius + 10, object.y + 14);
      }
    }
  });

  // Draw arrows for all objects
  drawArrows();
}

const playerImage = new Image();
playerImage.src = "./assets/player.png"; // Ensure this path matches your file structure

function drawPlayer() {
  // Draw the player image
  if (playerImage.complete) {
    // Ensure the image is loaded before drawing
    const imageWidth = 60; // Adjust the size of the image
    const imageHeight = 60;
    ctx.drawImage(
      playerImage,
      player.x - imageWidth / 2,
      player.y - imageHeight / 2,
      imageWidth,
      imageHeight
    );
  } else {
    // Fallback in case the image hasn't loaded yet
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = "blue";
    ctx.fill();
  }

  // Draw arrows for player
  //drawPlayerArrow();

  // Visualize interception position (for debugging)
  if (!true) {
    if (playerSolution) {
      const currentMove = playerSolution.moves[moveCounter];
      ctx.beginPath();
      ctx.arc(
        currentMove.interceptPosX,
        currentMove.interceptPosY,
        15,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "blue";
      ctx.fill();
    }
  }
}

// Function to draw the main circle
function drawGameCircle() {
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;

  ctx.save(); // Save the current canvas state
  ctx.beginPath();
  ctx.arc(centerX, centerY, GAME_RADIUS, 0, Math.PI * 2); // Define the clipping path
  ctx.clip(); // Apply clipping to restrict drawings to this area

  // Draw the main circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, GAME_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "black";
  ctx.stroke();
}

// Function to clear the canvas
function clearCanvas() {
  ctx.restore(); // Restore to the original canvas state
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/*
--------------------------------------------------------------------------------------

    Various utility functions 

--------------------------------------------------------------------------------------
*/

function getUrlParameters() {
  const searchParams = new URLSearchParams(window.location.search);
  const params = {};

  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  return params;
}

// MS: Adding a random number generator
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

// Helper function for generating random integers
function generateRandomInt(min, max) {
  return Math.floor(randomGenerator() * (max - min + 1)) + min;
}

// Function to measure the refresh rate
function measureRefreshRate() {
  let lastTimestamp = null;
  let frameTimestamps = [];
  const measureDuration = 1000; // Measure over 1 second

  return new Promise((resolve) => {
    function measureFrame(timestamp) {
      if (lastTimestamp !== null) {
        const frameDuration = timestamp - lastTimestamp;
        frameTimestamps.push(frameDuration);
      }
      lastTimestamp = timestamp;

      if (frameTimestamps.length < measureDuration / 16.67) {
        // Approximately 60 frames
        requestAnimationFrame(measureFrame);
      } else {
        const avgFrameDuration =
          frameTimestamps.reduce((sum, time) => sum + time, 0) /
          frameTimestamps.length;
        refreshRate = Math.round(1000 / avgFrameDuration) || 60;
        speedMultiplier = refreshRate / 60;
        resolve(refreshRate);
      }
    }
    requestAnimationFrame(measureFrame);
  });
}

function sampleBeta(alpha, beta) {
  function sampleGamma(shape) {
    // Marsaglia and Tsang method for sampling Gamma(shape, 1)
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    let u, v;
    do {
      do {
        u = randomGenerator();
        v = randomGenerator() * 2 - 1; // Uniformly distributed in (-1, 1)
      } while (u <= 0);
      const x = Math.pow(1 + c * v, 3);
      if (x > 0 && Math.log(u) < 0.5 * v * v + d * (1 - x + Math.log(x))) {
        return d * x;
      }
    } while (true);
  }

  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y); // Transform Gamma samples to Beta
}

// Function to find the index of a matching permutation
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

function lookupInterceptionPaths() {
  for (i = 0; i < NUM_SELECTIONS; i++) {
    console.log(`Object selected ${i} = ${selectedObjects[i]}`);
  }

  // Find the index of the matching permutation
  const matchingIndex = findMatchingPermutationIndex(
    permutations,
    selectedObjects
  );
  let playerSolution;

  console.log(`Matching index: ${matchingIndex}`);
  if (matchingIndex !== -1) {
    console.log(`Matching permutation:`, permutations[matchingIndex]);
    playerSolution = allSolutions[matchingIndex];
  } else {
    console.log(`No matching permutation found.`);
  }

  return playerSolution;
}

function enumerateAllSolutions() {
  const numSequences = permutations.length;
  let allSolutions = [];
  let bestSol;
  let maxValue = -Infinity;

  for (i = 0; i < numSequences; i++) {
    let sequence = permutations[i];
    //console.log(`Sequence ${i} = ${sequence}`);

    // create a copy of all the objects so we can simulate the movements during the interception sequence
    // without affecting the original values in objects
    copyObjects = structuredClone(objects);
    copyPlayer = structuredClone(player);

    let totalValue = 0;
    let moves = [];

    for (j = 0; j < NUM_SELECTIONS; j++) {
      const id = sequence[j];
      const objectNow = copyObjects[id];

      let [
        success,
        withinCircle,
        timeToIntercept,
        interceptPosX,
        interceptPosY,
        distance,
      ] = attemptIntercept(
        copyPlayer.x,
        copyPlayer.y,
        copyPlayer.speed,
        objectNow.x,
        objectNow.y,
        objectNow.dX,
        objectNow.dY
      );

      const move = { 
        success: success, 
        withinCircle: withinCircle, 
        value: 0,
        timeToIntercept,
        dX: (interceptPosX - copyPlayer.x) / timeToIntercept,
        dY: (interceptPosY - copyPlayer.y) / timeToIntercept,
        interceptPosX: copyPlayer.x + timeToIntercept * ((interceptPosX - copyPlayer.x) / timeToIntercept),
        interceptPosY: copyPlayer.y + timeToIntercept * ((interceptPosY - copyPlayer.y) / timeToIntercept),

        // NEW — the important bits:
        targetObjectId: id,         // which object this move is chasing
        isFinalForTarget: true,  
      };

      if (success) {
        // interception is possible (within or outside the circle)
        if (withinCircle) {
          let valueNow = objectNow.value;
          move.value = valueNow;
          totalValue += valueNow;
        }

        // Round the number of frames needed to intercept to nearest integer
        timeToIntercept = Math.round(timeToIntercept);

        // Determine new path of player
        move.timeToIntercept = timeToIntercept;
        move.dX = (interceptPosX - copyPlayer.x) / timeToIntercept;
        move.dY = (interceptPosY - copyPlayer.y) / timeToIntercept;

        // Advance player
        copyPlayer.x += timeToIntercept * move.dX;
        copyPlayer.y += timeToIntercept * move.dY;

        move.interceptPosX = copyPlayer.x;
        move.interceptPosY = copyPlayer.y;

        // Advance objects
        for (k = 0; k < copyObjects.length; k++) {
          copyObjects[k].x += timeToIntercept * copyObjects[k].dX;
          copyObjects[k].y += timeToIntercept * copyObjects[k].dY;
        }

        moves.push(move);
      } else {
        moves.push(move);

        break;
      }
    }

    let solution = { sequence: sequence, totalValue: totalValue, moves: moves };
    allSolutions.push(solution);

    if (totalValue > maxValue) {
      bestSol = i;
      maxValue = totalValue;
    }
  }

  // Now add a value score proportional to the max value
  console.log(`maxValue = ${maxValue}`);

  for (i = 0; i < numSequences; i++) {
    allSolutions[i].totalValueProp = allSolutions[i].totalValue / maxValue;
    console.log(
      `${i}:  ${allSolutions[i].sequence}, ${allSolutions[i].totalValue}`
    );
  }

  console.log(`Best solution = ${permutations[bestSol]}`);

  let bestSolution = allSolutions[bestSol];
  return [allSolutions, bestSolution];
}

function attemptIntercept(
  playerPosX,
  playerPosY,
  playerSpeed,
  objectPosX,
  objectPosY,
  objectVelX,
  objectVelY
) {
  let success = false;
  let withinCircle = false;
  let travelTime = Infinity;
  let interceptPosX = NaN;
  let interceptPosY = NaN;
  let totalDistanceTraveled = Infinity;

  // Check if the object is within the circle initially
  //if (Math.sqrt((objectPosX-centerX) ** 2 + (objectPosY-centerY) ** 2) > GAME_RADIUS) {
  //    return [ success, withinCircle, travelTime, interceptPosX, interceptPosY, totalDistanceTraveled ];
  //}

  // Initial relative position from the player to the object
  let relativePosX = objectPosX - playerPosX;
  let relativePosY = objectPosY - playerPosY;

  // Solving quadratic equation
  let A = objectVelX ** 2 + objectVelY ** 2 - playerSpeed ** 2;
  let B = 2 * (relativePosX * objectVelX + relativePosY * objectVelY);
  let C = relativePosX ** 2 + relativePosY ** 2;

  let discriminant = B ** 2 - 4 * A * C;

  if (discriminant < 0) {
    // No real solutions, interception not possible
    return [
      success,
      withinCircle,
      travelTime,
      interceptPosX,
      interceptPosY,
      totalDistanceTraveled,
    ];
  }

  // Calculate potential times for interception
  let t1 = (-B + Math.sqrt(discriminant)) / (2 * A);
  let t2 = (-B - Math.sqrt(discriminant)) / (2 * A);

  // Determine the valid and earliest interception time
  if (t1 >= 0 && (t1 < t2 || t2 < 0)) {
    travelTime = t1;
  } else if (t2 >= 0) {
    travelTime = t2;
  } else {
    // No valid interception time found
    return [
      success,
      withinCircle,
      travelTime,
      interceptPosX,
      interceptPosY,
      totalDistanceTraveled,
    ];
  }

  success = true;
  interceptPosX = objectPosX + travelTime * objectVelX;
  interceptPosY = objectPosY + travelTime * objectVelY;
  totalDistanceTraveled = travelTime * playerSpeed;

  // Check if the intercept position is within the circle
  if (
    Math.sqrt(
      (interceptPosX - centerX) ** 2 + (interceptPosY - centerY) ** 2
    ) <= GAME_RADIUS
  ) {
    withinCircle = true;
  }

  if (
    (travelTime == null) |
    (interceptPosX == null) |
    (interceptPosX == null) |
    (totalDistanceTraveled == null) |
    (success == null)
  ) {
    console.log("Null values");
  }

  return [
    success,
    withinCircle,
    travelTime,
    interceptPosX,
    interceptPosY,
    totalDistanceTraveled,
  ];
}

// Function to generate permutations
function generatePermutations(arr, k) {
  /* Example usage
    const N = 5; // Total objects
    const K = 3; // Number of objects to pick
    const testobjects = Array.from({ length: N }, (_, i) => i); // [0, 1, ..., N-1]

    const permutations = generatePermutations(testobjects, K);
    console.log(permutations);
    */

  const result = [];

  function helper(currentPermutation, used) {
    // If the current permutation is of length k, add it to the result
    if (currentPermutation.length === k) {
      result.push([...currentPermutation]);
      return;
    }

    // Loop through the array and recursively build permutations
    for (let i = 0; i < arr.length; i++) {
      if (used[i]) continue; // Skip already used elements
      used[i] = true; // Mark element as used
      currentPermutation.push(arr[i]);
      helper(currentPermutation, used); // Recursive call
      currentPermutation.pop(); // Backtrack
      used[i] = false; // Unmark element as used
    }
  }

  helper([], Array(arr.length).fill(false));
  return result;
}
