# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Human-AI Interaction experimental web application built with vanilla JavaScript and Webpack. The application is an interactive game that studies how users make decisions in an object interception task, with optional AI assistance. The game involves observing moving objects and selecting an optimal interception sequence to maximize score.

## Development Commands

### Setup
```bash
nvm use 22
npm install
```

### Development
```bash
npm run start  # Starts webpack-dev-server on port 3000 with hot reload
```

### Build & Deploy
```bash
npm run build   # Production build to dist/ directory
npm run deploy  # Builds and deploys to gh-pages
```

### Trial Generation
```bash
npm run generate-trials                    # Generate default trial set (82 trials, seed 12345)
npm run generate-trials -- --seed 54321    # Generate with custom seed
npm run generate-trials -- --sets 3        # Generate 3 different trial sets
npm run generate-trials -- --trials 50     # Generate 50 trials per set
```

## Architecture Overview

### Entry Point & Flow
- **Entry**: `src/index.js` is the main entry point bundled by webpack
- **HTML Template**: `pages/index.html` serves as the base template
- **Flow**: Consent → Instructions → Education Trials → Main Experiment → Feedback
- **State Management**: Centralized in `src/data/variable.js` via `globalState` object

### Core Game Loop
1. **Initialization** (`src/logic/initialize.js`): Sets up objects and player state
2. **Animation** (`src/logic/animation.js`):
   - `animateObjects()`: Handles observation phase where objects move
   - `animateInterception()`: Handles player movement during interception
   - Frame-based updates using `requestAnimationFrame`
3. **Game Events** (`src/logic/gameEvents.js`): Main event handlers
   - `startTrial()`: Begins a new trial
   - `endDemo()`: Called after observation phase
   - `startInterception()`: Begins interception sequence
   - `finishInterception()`: Handles trial completion

### Object System
Objects are stored in `globalState.objects` array with properties:
- `initX0, initY0`: Initial position
- `initDX, initDY`: Initial velocity (pixels per frame)
- `type`: Object type from `BALL_TYPES` (normal, blue, green_turner, gray_hazard)
- `value`: Score value of the object (sampled from Beta distribution)
- `initialValue`: Original value (for blue balls to track decay)

#### Ball Types

**Normal (Red) Ball**
- Default ball type (~55% spawn rate)
- Static value throughout trial
- Standard interception physics

**Blue Ball**
- Bonus ball with time-decay mechanic (~15% spawn rate)
- **Initial value**: 1.5x normal balls (boosted, capped at 1.0)
- **Decay behavior**:
  - Observation phase (0-3s): Maintains full initial value
  - Interception phase (3-9s): Decays linearly over 6 seconds to 0
  - Value never goes negative
- **Visual feedback**: Color fades from bright blue (#2b6fff) to gray (#d0d0d0) as value decreases
- **Utility**: `src/utils/blueballDecay.js` - shared decay calculation for animation and AI solver
- **Strategic**: High value if caught early, loses value over time

**Green Turner Ball**
- Direction-changing ball (~30% spawn rate)
- **Turn behavior**:
  - 50% chance to turn mid-flight at ~3.5 seconds
  - Always reverses direction (180° turn)
  - Turn disabled if ball would exit arena before turn time
- **Interception handling**:
  - Two-phase interception if turn occurs during pursuit
  - Phase 1: Move toward pre-turn trajectory
  - Phase 2: Adjust to post-turn trajectory
- **State tracking**: `hasTurned`, `turnAfterFrames`, `turnStrategy`

**Gray Hazard (Bomb) Ball**
- Hazard ball that freezes game on contact (~50% chance to spawn as 11th ball)
- **Size**: Larger radius (50px vs normal 15px)
- **Collision**: Game freezes immediately when player touches it
- **Scoring**: All remaining targets scored from frozen position (proximity-based)
- **Properties**:
  - `isHazard: true`
  - `penaltyAmount: 1.0` (not subtracted from score, just indicates bomb)
  - `canBeSelected: false`
- **Animation freeze**: `animateInterception()` stops when `applyHazardPenalties()` returns `"bomb_hit"`

### Solution Evaluation
- **Permutations**: All possible selection sequences generated in `src/logic/computation/solutionEvaluator.js`
- **Interception Physics**: `src/logic/computation/interceptionSimulator.js` uses quadratic equations to compute if/when player can reach an object
- **AI Optimization**: Solution evaluator accounts for blue ball decay when ranking sequences
- **Scoring**: Based on successfully intercepted object values and proximity (see Score Calculation below)

### Score Calculation

Scoring is handled by `computeObjectValue()` in `src/logic/computation/solutionEvaluator.js`.

#### Successful Interception
```
score = currentValue
```
- For normal/green/gray balls: `currentValue = object.value` (static)
- For blue balls: `currentValue = getBlueBallValue(object, frame, ...)` (time-adjusted)

#### Failed Interception (Proximity Scoring)
```
weight = isFirstMiss ? 0.75 : 0.25
proximityRatio = (GAME_RADIUS * 2 - finalDistance) / (GAME_RADIUS * 2)
score = proximityRatio * currentValue * weight
```

**Parameters:**
- `finalDistance`: Distance between player and ball when ball exits arena
- `isFirstMiss`: True if this is the first failed interception in the sequence
- `currentValue`: Time-adjusted value (accounts for blue ball decay)

**Examples:**
- **Ball 1 (value=1.0), caught**: Score = 1.0
- **Ball 1 (value=1.0), missed at 50% distance**: Score = 0.5 × 1.0 × 0.75 = 0.375
- **Ball 2 (value=0.8), missed at 50% distance (after Ball 1 failed)**: Score = 0.5 × 0.8 × 0.25 = 0.1
- **Blue ball (initial=1.0, decayed to 0.6), caught**: Score = 0.6

#### Bomb Hit Behavior
When player touches a bomb during interception:
1. **Game freezes** at exact collision frame
2. **Current target** scored based on interception status at freeze
3. **Remaining targets** scored using proximity from frozen position
4. **Animation stops** immediately (`animation.js:41` checks `hazardStatus !== "bomb_hit"`)
5. **Solution evaluator** continues loop after setting `isInProgress = false`

**Example sequence [Ball A, Ball B] with bomb hit:**
- Player intercepts Ball A successfully → Score = Ball A value
- Player touches bomb while moving toward Ball B → Game freezes
- Ball B scored based on distance from frozen position → Score = proximityRatio × Ball B value × 0.25
- Total = Ball A score + Ball B proximity score

#### Key Implementation Details
- **No penalty deduction**: Bomb contact doesn't subtract points, only freezes game
- **All targets scored**: Even after first failure or bomb hit, all selected targets contribute to score
- **Frame-accurate**: Blue ball decay calculated at exact interception/freeze frame
- **Consistent calculation**: Both animation and AI solver use `getBlueBallValue()` from `src/utils/blueballDecay.js`

### Firebase Integration
- **Authentication**: Anonymous auth on page load
- **Data Structure**: `users/{prolific_pid}/experiments/{experiment_id}/trials/{trial_id}`
- **Save Points**:
  - User created on experiment start
  - Trial data saved when clicking "Start Next Sequence"
  - Feedback saved at completion
- **Module**: `src/firebase/saveData2Firebase.js`

### Experimental Conditions
Controlled via URL parameters:
- `PROLIFIC_PID`: User identifier
- `AI_HELP`: Type of AI assistance (0=none, 1=optimal before, 2=optimal after, 3=suboptimal after, 4=on request)
- `NUM_TRIALS`: Number of main trials (default: 82)
- `NUM_SELECTIONS`: Objects to select (default: 2)
- `NUM_OBJECTS`: Total objects per trial (default: 10)
- `DEBUG`: Skip consent and education trials
- `USE_STATIC_TRIALS`: Use pre-generated trials (true/false, default: false)
- `TRIAL_SET`: Which trial set to use when using static trials (default: 1)

### Data Collection
`src/logic/collectData.js` tracks:
- **Trial metrics**: think_time, replay_num, reselect_num, user_choice, user_score
- **Experiment metrics**: failed_attention_check_count, is_finished
- **User progress**: is_passed_education, is_passed_all_experiments

#### Understanding Recorded Values: total_value vs user_score

The Firebase data stores values at both the **per-object** and **trial** levels:

**Per-Object Values** (in `user_choice[].selected_objects[]`):
- `total_value`: The object's **static/initial value** (what it would be worth if intercepted perfectly without decay)
  - For normal/green/gray balls: The static `object.value`
  - For blue balls: The initial boosted value before any time decay
- `final_value`: The **actual value obtained** after accounting for:
  - Interception success/failure
  - Blue ball time decay
  - Proximity penalties for missed interceptions
- `is_intercepted`: Whether the player successfully caught the object
- `final_distance`: Distance between player and ball when ball exits arena (for misses)

**Trial-Level Score**:
- `user_score`: Sum of all `final_value`s for the user's selected sequence
- Represents the total points earned in the trial

**Performance Analysis**:
```
Per-object efficiency = final_value / total_value
Trial efficiency = user_score / sum(optimal_sequence.total_values)
Value lost = total_value - final_value (per object)
```

**Example from Firebase**:
```javascript
// Object 5 (green_turner): Missed interception
{
  total_value: 0.1739,      // Worth 0.1739 if caught perfectly
  final_value: 0.1177,      // Got 67.7% via proximity scoring
  is_intercepted: false,
  final_distance: 77.78
}

// Object 9 (blue): Missed + heavily decayed
{
  total_value: 0.2792,      // Initial blue ball value
  final_value: 0.0240,      // Got only 8.6% (decay + miss)
  is_intercepted: false,
  final_distance: 180.26
}

// Trial score
user_score: 0.1417          // Sum: 0.1177 + 0.0240
```

**Key Insights**:
- `total_value` shows the **potential** value of each object
- `final_value` shows the **realized** value after execution
- The gap between them reveals losses from timing (decay) and execution (misses)
- Blue balls show the largest gaps when caught late due to time decay

### Trial System: Pre-Generated vs Random

The application supports two trial generation modes for experimental control:

#### Mode 1: Random Generation (Default)
- Trials generated on-the-fly using seeded random number generator
- Each participant gets unique trials based on their session seed
- Useful for development and testing
- **Enable**: Default behavior (no URL params needed)

#### Mode 2: Pre-Generated Trials (Recommended for Experiments)
- Trials loaded from static JSON files
- All participants see identical trials (experimental control)
- Reproducible and reviewable before deployment
- Supports counterbalancing via multiple trial sets
- **Enable**: Add `?USE_STATIC_TRIALS=true` to URL

**Trial Generation Workflow:**
```bash
# Step 1: Generate trial sets
npm run generate-trials -- --sets 3 --seed 12345

# Step 2: Review generated trials in src/data/trials/

# Step 3: Deploy with static trials enabled
# URL: https://your-domain.com?USE_STATIC_TRIALS=true&TRIAL_SET=1
```

**Counterbalancing:**
- Generate multiple trial sets with different seeds
- Assign participants to different sets via `TRIAL_SET` parameter
- Example: Set 1 (seed 12345), Set 2 (seed 54321), Set 3 (seed 99999)

**Firebase Override (Optional):**
- Static trials can be overridden from Firebase for dynamic assignment
- Useful for A/B testing or mid-study adjustments
- Automatic fallback to bundled JSON if Firebase unavailable
- See `src/data/trialLoader.js` for implementation

**File Structure:**
```
src/data/trials/
  ├── trial_set_1.json    # Default trial set (82 trials)
  ├── trial_set_2.json    # Alternative set for counterbalancing
  └── ...
```

**Trial Data Format:**
Each trial JSON contains:
- `trialNumber`: Trial index (1-82)
- `seed`: Seed used to generate this trial
- `objects[]`: Array of object definitions with positions, velocities, types, values
- `metadata`: Trial configuration (numObjects, hasBomb, etc.)

#### Trial JSON Structure and Logic

**Top-Level Structure:**
```javascript
{
  "setId": 1,                    // Trial set identifier
  "baseSeed": 12345,             // Base seed for this set
  "numTrials": 82,               // Total number of trials
  "trials": [...],               // Array of trial objects
  "metadata": {                  // Set-level metadata
    "generatedAt": "2025-01-11T...",
    "numObjects": 10,
    "numSelections": 2,
    "version": "1.0.0"
  }
}
```

**Individual Trial Structure:**
```javascript
{
  "trialNumber": 1,              // Trial index (1-indexed)
  "seed": 13345,                 // Unique seed for this trial
  "objects": [                   // Array of 10-11 objects (10 selectable + optional bomb)
    {
      // Position & Kinematics (all relative to 60Hz refresh rate)
      "index": 0,                      // Object index (0-9 for selectable, 10 for bomb)
      "x0": 529.15,                    // Initial X position (pixels)
      "y0": 168.88,                    // Initial Y position (pixels)
      "initX0": 529.15,                // Immutable initial X (for stateless calculation)
      "initY0": 168.88,                // Immutable initial Y (for stateless calculation)
      "dX": 0.199,                     // X velocity per frame (pixels/frame)
      "dY": 1.754,                     // Y velocity per frame (pixels/frame)
      "initDX": 0.199,                 // Immutable initial dX (for stateless calculation)
      "initDY": 1.754,                 // Immutable initial dY (for stateless calculation)
      "speed": 1.765,                  // Total speed (pixels/frame)
      "radius": 15,                    // Object radius (pixels, 50 for bombs)

      // Value & Scoring
      "value": 0.0786,                 // Object value (0-1, from Beta distribution)
      "initialValue": 0.0786,          // Initial value (preserved for blue ball decay)

      // Ball Type & Behavior
      "type": "normal",                // Ball type: 'normal', 'blue', 'green_turner', 'gray_hazard'
      "colorFill": "red",              // Fill color
      "colorStroke": "red",            // Stroke color

      // Green Turner Properties
      "turnAfterFrames": null,         // Frame count when turn occurs (null if no turn)
      "turnStrategy": null,            // Turn type: 'reverse' for 180° (null if no turn)
      "turnAngle": null,               // Reserved for future (currently unused)
      "hasTurned": false,              // Runtime flag tracking turn state

      // Hazard Properties (bombs only)
      "isHazard": false,               // True for hazard objects
      "penaltyAmount": 0,              // Penalty value (1.0 for bombs)
      "penaltyCooldownFrames": 0,      // Immunity duration after hit
      "penaltyLastAppliedAt": null     // Runtime tracking of last penalty
    }
  ],
  "metadata": {
    "numObjects": 10,            // Number of selectable objects
    "hasBomb": true,             // Whether this trial includes a bomb
    "centerX": 405,              // Arena center X (canvas 810x810)
    "centerY": 405,              // Arena center Y
    "refreshRate": 60,           // Target refresh rate (Hz)
    "observationFrames": 180     // Observation phase duration (frames)
  }
}
```

**Ball Type Distribution (per trial):**
- 2 × Normal (red) balls - Static value
- 2 × Blue balls - Time-decaying value (1.5× initial boost)
- 2 × Green turner balls - 50% chance to reverse direction at ~3.5s
- 4 × Random balls - Randomly assigned from above types
- 1 × Bomb (50% chance) - Gray hazard, freezes game on contact

**Key Logic Details:**

1. **Stateless Position Calculation:**
   - `initX0/initY0/initDX/initDY` enable frame-accurate position recalculation
   - Position at frame N: `x = initX0 + initDX × N`
   - Critical for replay, pause/resume, and blue ball decay

2. **Refresh Rate Adjustment:**
   - Trial data assumes 60Hz refresh rate
   - `adjustObjectForRefreshRate()` scales velocities: `dX = dX / speedMultiplier`
   - Ensures consistent physics across different displays

3. **Green Turner Turn Logic:**
   - `turnAfterFrames` set to ~210 frames (3.5s × 60Hz)
   - Turn only enabled if ball won't exit arena before turn time
   - During turn: velocities reversed (`dX = -dX`, `dY = -dY`)

4. **Blue Ball Decay:**
   - `initialValue` preserved throughout trial
   - Current value calculated via `getBlueBallValue(object, currentFrame, ...)`
   - Observation phase (0-3s): Full value maintained
   - Interception phase (3-9s): Linear decay to 0 over 6 seconds

5. **Bomb Properties:**
   - `index: 10` (11th object, non-selectable)
   - `radius: 50` (larger than normal 15px)
   - `canBeSelected: false` (UI prevents selection)
   - Contact freezes game; remaining targets scored from frozen position

**Module Reference:**
- **Generator**: `scripts/generateTrials.mjs` - Pre-generates trial sets
- **Loader**: `src/data/trialLoader.js` - Loads trials from JSON or Firebase
- **Initialization**: `src/logic/initialize.js` - Initializes objects from trial data
- **Refresh Rate Adjustment**: `initialize.js:adjustObjectForRefreshRate()` - Scales velocities for display
- **Blue Ball Decay**: `src/utils/blueballDecay.js` - Shared decay calculation

### UI Components
- **Pages**: Separate HTML files in `pages/` (consent, instructions, modal, feedback)
- **Styles**: CSS files in `styles/` for different instruction pages
- **Canvas**: 810x810px game area drawn in `src/logic/drawing.js`
- **Info Panels**: Instructions, AI info, and results displayed to the right of canvas

## Key Constants
Defined in `src/data/constant.js`:
- `GAME_RADIUS`: 400px (circular play area)
- `MIN_SPEED/MAX_SPEED`: 60-120 pixels/sec for object movement
- Refresh rate: Dynamically measured, defaults to 60Hz
- `OBSERVATION_FRAMES`: ~180 frames (3 seconds)
- `INTERCEPTION_FRAMES`: ~120 frames (2 seconds)

## Webpack Configuration
- **Dev server**: Port 3000 with hot reload
- **Output**: `dist/` directory
- **Loaders**: Babel (ES6+), CSS, images, videos
- **Plugins**: Copies HTML pages, CSS files, and assets to dist
- **Entry point**: `src/index.js`

## Important Notes
- All object positions and velocities are computed per-frame using stateless calculations
- Physics calculations use player speed and object trajectories to compute optimal interception points
- The game supports comprehension checks (education trials with retry logic) and attention checks
- Solutions are pre-computed for all permutations and ranked by total value
- Player movement is deterministic based on computed interception paths
- **Blue ball decay**: Shared utility (`src/utils/blueballDecay.js`) ensures animation and AI use identical decay logic
- **Bomb freeze**: Game state freezes on bomb contact; remaining targets scored from frozen position
- **Proximity scoring**: Failed interceptions still contribute partial score based on final distance
- **Green turner splits**: Two-phase interception handling when turn occurs during pursuit
- **Frame synchronization**: All calculations (decay, scoring, collision) use frame-accurate timing
