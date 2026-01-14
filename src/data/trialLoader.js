/**
 * Trial Loader Module
 *
 * Provides hybrid trial loading system:
 * 1. Loads pre-generated trials from JSON (bundled, reliable)
 * 2. Supports Firebase override for dynamic trial assignment
 * 3. Enables counterbalancing via URL parameter
 *
 * Usage:
 *   const trial = await loadTrial(trialNumber);
 *   const trial = await loadTrial(trialNumber, { setId: 2 });
 *   const trial = await loadTrial(trialNumber, { firebase: true });
 */

import { globalState } from './variable.js';

// Import trial sets (bundled JSON)
// Note: Webpack will handle these imports
let trialSets = {};
let difficultyCheckSets = {};

/**
 * Initialize trial loader by importing available trial sets
 */
export async function initializeTrialLoader() {
  try {
    // Import main trial set 1 (default)
    const set1 = await import('./trials/trial_set_1.json');
    trialSets[1] = set1.default || set1;

    // You can add more sets here as needed
    // const set2 = await import('./trials/trial_set_2.json');
    // trialSets[2] = set2.default || set2;

    console.log(`Loaded ${Object.keys(trialSets).length} main trial set(s)`);

    // Import difficulty check trial sets (1-6)
    const difficultySetImports = [
      import('./trials/difficulty_check_set_1.json').catch(() => null),
      import('./trials/difficulty_check_set_2.json').catch(() => null),
      import('./trials/difficulty_check_set_3.json').catch(() => null),
      import('./trials/difficulty_check_set_4.json').catch(() => null),
      import('./trials/difficulty_check_set_5.json').catch(() => null),
      import('./trials/difficulty_check_set_6.json').catch(() => null),
    ];

    const diffResults = await Promise.all(difficultySetImports);
    diffResults.forEach((result, idx) => {
      if (result) {
        difficultyCheckSets[idx + 1] = result.default || result;
      }
    });

    if (Object.keys(difficultyCheckSets).length > 0) {
      console.log(`Loaded ${Object.keys(difficultyCheckSets).length} difficulty check trial set(s)`);
    } else {
      console.warn('No difficulty check trial sets found (this is ok if not using difficulty check mode)');
    }

    return true;
  } catch (error) {
    console.error('Failed to load trial sets:', error);
    return false;
  }
}

/**
 * Load a specific trial from JSON or Firebase
 *
 * @param {number} trialNumber - Trial number (1-indexed)
 * @param {Object} options - Loading options
 * @param {number} options.setId - Trial set ID to use (default: from URL param or 1)
 * @param {boolean} options.firebase - Load from Firebase instead of JSON
 * @param {string} options.userId - User ID for Firebase lookup
 * @param {boolean} options.isDifficultyCheck - Load difficulty check trials
 * @returns {Promise<Object>} Trial data
 */
export async function loadTrial(trialNumber, options = {}) {
  const setId = options.setId || getTrialSetFromURL() || 1;
  const isDifficultyCheck = options.isDifficultyCheck || false;

  // Option 1: Load from Firebase (if enabled)
  if (options.firebase) {
    return await loadTrialFromFirebase(trialNumber, options.userId, setId, isDifficultyCheck);
  }

  // Option 2: Load from bundled JSON (default)
  return loadTrialFromJSON(trialNumber, setId, isDifficultyCheck);
}

/**
 * Load trial from bundled JSON file
 */
function loadTrialFromJSON(trialNumber, setId, isDifficultyCheck = false) {
  const trialSet = isDifficultyCheck ? difficultyCheckSets[setId] : trialSets[setId];
  const trialType = isDifficultyCheck ? 'difficulty check' : 'main';

  if (!trialSet) {
    const availableSets = isDifficultyCheck
      ? Object.keys(difficultyCheckSets).join(', ')
      : Object.keys(trialSets).join(', ');
    throw new Error(`${trialType} trial set ${setId} not found. Available sets: ${availableSets}`);
  }

  const trial = trialSet.trials.find(t => t.trialNumber === trialNumber);

  if (!trial) {
    throw new Error(`Trial ${trialNumber} not found in ${trialType} set ${setId}`);
  }

  console.log(`Loaded trial ${trialNumber} from ${trialType} set ${setId} (JSON)`);
  return trial;
}

/**
 * Load trial from Firebase (for dynamic trial assignment)
 *
 * Firebase structure:
 *   trial_sets/{setId}/trials/{trialNumber}
 *   difficulty_check_sets/{setId}/trials/{trialNumber}
 */
async function loadTrialFromFirebase(trialNumber, userId, setId, isDifficultyCheck = false) {
  try {
    const { getDatabase, ref, get } = await import('firebase/database');
    const db = getDatabase();

    const collection = isDifficultyCheck ? 'difficulty_check_sets' : 'trial_sets';
    const trialRef = ref(db, `${collection}/${setId}/trials/${trialNumber}`);
    const snapshot = await get(trialRef);

    if (!snapshot.exists()) {
      console.warn(`Trial ${trialNumber} not found in Firebase, falling back to JSON`);
      return loadTrialFromJSON(trialNumber, setId, isDifficultyCheck);
    }

    const trialType = isDifficultyCheck ? 'difficulty check' : 'main';
    console.log(`Loaded trial ${trialNumber} from ${trialType} set ${setId} (Firebase)`);
    return snapshot.val();
  } catch (error) {
    console.error('Firebase load failed, falling back to JSON:', error);
    return loadTrialFromJSON(trialNumber, setId, isDifficultyCheck);
  }
}

/**
 * Get trial set ID from URL parameters
 * Supports: ?TRIAL_SET=1 or ?trial_set=1
 */
function getTrialSetFromURL() {
  const params = new URLSearchParams(window.location.search);
  const setId = params.get('TRIAL_SET') || params.get('trial_set');
  return setId ? parseInt(setId) : null;
}

/**
 * Upload a trial set to Firebase (admin function)
 *
 * @param {number} setId - Trial set ID to upload
 * @returns {Promise<void>}
 */
export async function uploadTrialSetToFirebase(setId) {
  const trialSet = trialSets[setId];

  if (!trialSet) {
    throw new Error(`Trial set ${setId} not found`);
  }

  try {
    const { getDatabase, ref, set } = await import('firebase/database');
    const db = getDatabase();

    const setRef = ref(db, `trial_sets/${setId}`);
    await set(setRef, trialSet);

    console.log(`✓ Uploaded trial set ${setId} to Firebase`);
  } catch (error) {
    console.error('Failed to upload trial set to Firebase:', error);
    throw error;
  }
}

/**
 * Get metadata for current trial set
 */
export function getTrialSetMetadata(setId = 1, isDifficultyCheck = false) {
  const trialSet = isDifficultyCheck ? difficultyCheckSets[setId] : trialSets[setId];

  if (!trialSet) {
    return null;
  }

  return {
    setId: trialSet.setId,
    baseSeed: trialSet.baseSeed,
    numTrials: trialSet.numTrials,
    metadata: trialSet.metadata,
  };
}

/**
 * Get available trial set IDs
 */
export function getAvailableTrialSets(isDifficultyCheck = false) {
  const sets = isDifficultyCheck ? difficultyCheckSets : trialSets;
  return Object.keys(sets).map(Number);
}
