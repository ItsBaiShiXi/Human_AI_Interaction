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

/**
 * Initialize trial loader by importing available trial sets
 */
export async function initializeTrialLoader() {
  try {
    // Import trial set 1 (default)
    const set1 = await import('./trials/trial_set_1.json');
    trialSets[1] = set1.default || set1;

    // You can add more sets here as needed
    // const set2 = await import('./trials/trial_set_2.json');
    // trialSets[2] = set2.default || set2;

    console.log(`Loaded ${Object.keys(trialSets).length} trial set(s)`);
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
 * @returns {Promise<Object>} Trial data
 */
export async function loadTrial(trialNumber, options = {}) {
  const setId = options.setId || getTrialSetFromURL() || 1;

  // Option 1: Load from Firebase (if enabled)
  if (options.firebase) {
    return await loadTrialFromFirebase(trialNumber, options.userId, setId);
  }

  // Option 2: Load from bundled JSON (default)
  return loadTrialFromJSON(trialNumber, setId);
}

/**
 * Load trial from bundled JSON file
 */
function loadTrialFromJSON(trialNumber, setId) {
  const trialSet = trialSets[setId];

  if (!trialSet) {
    throw new Error(`Trial set ${setId} not found. Available sets: ${Object.keys(trialSets).join(', ')}`);
  }

  const trial = trialSet.trials.find(t => t.trialNumber === trialNumber);

  if (!trial) {
    throw new Error(`Trial ${trialNumber} not found in set ${setId}`);
  }

  console.log(`Loaded trial ${trialNumber} from set ${setId} (JSON)`);
  return trial;
}

/**
 * Load trial from Firebase (for dynamic trial assignment)
 *
 * Firebase structure:
 *   trial_sets/{setId}/trials/{trialNumber}
 */
async function loadTrialFromFirebase(trialNumber, userId, setId) {
  try {
    const { getDatabase, ref, get } = await import('firebase/database');
    const db = getDatabase();

    const trialRef = ref(db, `trial_sets/${setId}/trials/${trialNumber}`);
    const snapshot = await get(trialRef);

    if (!snapshot.exists()) {
      console.warn(`Trial ${trialNumber} not found in Firebase, falling back to JSON`);
      return loadTrialFromJSON(trialNumber, setId);
    }

    console.log(`Loaded trial ${trialNumber} from set ${setId} (Firebase)`);
    return snapshot.val();
  } catch (error) {
    console.error('Firebase load failed, falling back to JSON:', error);
    return loadTrialFromJSON(trialNumber, setId);
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
export function getTrialSetMetadata(setId = 1) {
  const trialSet = trialSets[setId];

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
export function getAvailableTrialSets() {
  return Object.keys(trialSets).map(Number);
}
