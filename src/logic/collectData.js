/**
 * Data Structures:
 *   - https://docs.google.com/document/d/1bmtTgm39KQYB385JB6DSbq2pWNm6omMeQpxw29AaBP0/edit?tab=t.twrrqelzi8cm
 */

import { globalState } from "../data/variable.js";
import {
  getCurrentDate,
  isAttentionCheck,
  countFailedAttentionCheck,
  getAttentionCheckTrialCount,
  isPassedAllAttentionCheck,
} from "../utils/utils.js";

/**
 * @typedef {Object} User
 * @property {string} prolific_pid
 * @property {Date} create_time
 * @property {Date} end_time
 * @property {Feedback} feedback
 * @property {Experiment[]} experiments
 * @property {boolean} is_consent
 * @property {boolean} is_passed_education
 * @property {boolean} is_passed_all_experiments
 */
export const User = {
  prolific_pid: "",
  create_time: new Date(),
  end_time: new Date(),
  experiments: [], // Experiment
  is_consent: false,
  is_passed_education: false,
  is_passed_all_experiments: false,
};

/**
 * @typedef {Object} Experiment
 * @property {number} experiment_id
 * @property {Date} create_time
 * @property {Date} end_time
 * @property {number} failed_attention_check_count
 * @property {boolean} is_finished
 * @property {number} num_trials
 * @property {Trial[]} trials
 * @property {Trial[]} comprehension_trials
 */
export function createNewExperimentData(experiment_id, num_trials) {
  return {
    experiment_id,
    create_time: getCurrentDate(),
    end_time: getCurrentDate(), // will be updated at the end
    failed_attention_check_count: 0,
    is_finished: false,
    num_trials,
    trials: [], // will be populated with Trial objects
    comprehension_trials: [],
  };
}

/**
 * Returns the current Experiment object from User based on globalState.
 * @returns {Experiment}
 */
export function getCurrentExperimentData() {
  if (User.experiments.length === 0) {
    return null;
  }
  return User.experiments[globalState.curExperiment];
}

/**
 * @typedef {Object} Trial
 * @property {number} trial_id
 * @property {Date} create_time
 * @property {Date} end_time
 * @property {number} performance  // (user score / best score) * 100
 * @property {number} user_score
 * @property {number} best_score
 * @property {Choice[]} ai_choice
 * @property {Choice[]} best_choice
 * @property {Choice[]} user_choice
 * @property {CustomCount} replay_num
 * @property {CustomCount} reselect_num
 * @property {CustomCount} think_time // milliseconds, time from first observation end to interception start
 * @property {CustomCount} total_time // milliseconds, total time per trial
 * @property {boolean} is_attention_check
 * @property {boolean} is_comprehension_check
 * @property {boolean} user_hit_bomb // whether user hit the bomb (freeze trap)
 * @property {boolean} best_hit_bomb // whether best solution hits bomb
 */
/**
 * Creates a new Trial object with default values
 * @param {number} trial_id
 * @returns {Trial}
 */
export function createNewTrialData(
  trial_id,
  is_comprehension_check,
  is_attention_check
) {
  return {
    trial_id,
    create_time: getCurrentDate(),
    end_time: getCurrentDate(),
    performance: 0,
    user_score: 0,
    best_score: 0,
    ai_choice: [], // []Choice
    best_choice: [], // []Choice
    user_choice: [], // []Choice
    replay_num: { before_ai_show: 0, after_ai_show: 0, total: 0 }, // CustomCount
    reselect_num: { before_ai_show: 0, after_ai_show: 0, total: 0 }, // CustomCount
    think_time: { before_ai_show: 0, after_ai_show: 0, total: 0 }, // CustomCount
    total_time: { before_ai_show: 0, after_ai_show: 0, total: 0 }, // CustomCount
    is_comprehension_check: is_comprehension_check,
    is_attention_check: is_attention_check,
    user_hit_bomb: false,
    best_hit_bomb: false,
  };
}

/**
 * Updates experiment-level and user-level status after each trial.
 * Handles attention check results and final trial checks.
 *
 * @param {number} experiment
 * @param {number} curTrial
 * @param {string} userSolution - The user's selected solution.
 * @param {string} bestSolution - The correct or optimal solution.
 */
export function updateExperimentData(
  experiment,
  isComprehensionCheck,
  curTrial,
  userSolution
) {
  if (isComprehensionCheck) {
    return;
  }
  // Check if current trial is an attention check trial
  if (isAttentionCheck()) {
    const passed = userSolution.totalValueProp * 100 === 100;
    globalState.ATTENTION_CHECK_TRIALS[curTrial.trial_id] = passed;
    experiment.failed_attention_check_count = countFailedAttentionCheck();
  }

  // Check if this is the last trial of the main experiment
  const isLastTrial = curTrial.trial_id === globalState.NUM_MAIN_TRIALS;
  if (isLastTrial) {
    experiment.is_finished = true;

    // Mark the user's overall experiment pass status
    User.is_passed_all_experiments =
      experiment.is_finished &&
      experiment.failed_attention_check_count < getAttentionCheckTrialCount();
  }
}

/**
 * Updates the end info for the current trial
 * @param {Trial} trial - the current trial object
 * @param {Object} scores - { userScore: number, bestScore: number }
 */
export function updateTrialData(
  trial,
  userSolution,
  bestSolution,
  trialSec,
  isAfterAI
) {
  trial.end_time = getCurrentDate();
  trial.user_score = userSolution.totalValue;
  trial.best_score = bestSolution.totalValue;
  trial.performance = userSolution.totalValueProp * 100;

  // Track bomb hit status
  trial.user_hit_bomb = userSolution.bombHit ?? false;
  trial.best_hit_bomb = bestSolution.bombHit ?? false;

  recordBestChoiceData(trial, bestSolution);
  addToCustomCount(trial.total_time, trialSec, isAfterAI); // trialSec is in milliseconds
}

/**
 * Returns the current Trial object from User based on globalState.
 * @returns {Trial}
 */
export function getCurrentTrialData(isComprehensionCheck) {
  const currentExperiment = getCurrentExperimentData();
  if (!currentExperiment) {
    return null;
  }
  if (isComprehensionCheck) {
    // comprehension trials
    if (currentExperiment.comprehension_trials.length > 0) {
      return currentExperiment?.comprehension_trials[globalState.curTrial - 1];
    }
  } else {
    // regular trials
    if (currentExperiment.trials.length > 0) {
      return currentExperiment?.trials[globalState.curTrial - 1];
    }
  }
  return null;
}

/**
 * @typedef {CustomCount}
 * @property {number} before_ai_show
 * @property {number} after_ai_show
 * @property {number} total
 */
/**
 * Adds a numeric value to a CustomCount field.
 * @param {CustomCount} countObj
 * @param {number} value - Value to add (in milliseconds for time, count for replay/reselect)
 * @param {boolean} isAfterAI
 */
export function addToCustomCount(countObj, value, isAfterAI) {
  if (!countObj || typeof value !== "number") return;

  if (isAfterAI) {
    countObj.after_ai_show += value;
  } else {
    countObj.before_ai_show += value;
  }
  countObj.total += value;
}

/**
 * @typedef {Object} Choice
 * @property {ExperimentObject[]} selected_objects
 * @property {number} score
 * @property {'no_ai' | 'before_ai_show' | 'after_ai_show'} ai_assisted_flag
 * @property {number} rank
 */

/**
 * Creates a Choice object from a given solution.
 * @param {Object} solution - userSolution or bestSolution
 * @param {'no_ai' | 'before_ai_show' | 'after_ai_show'} ai_assisted_flag
 * @returns {Choice}
 */
export function createChoiceFromSolution(solution, ai_assisted_flag = "no_ai") {
  const selected_objects = solution.objDetails.map((obj) => {
    // Get ball type from globalState.objects using objIndex
    const ballObj = globalState.objects[obj.objIndex];
    const ball_type = ballObj?.type ?? 'red';

    return {
      object_index: obj.objIndex,
      final_distance: obj.finalDistance ?? 0,
      is_intercepted: obj.isIntercepted ?? false,
      final_value: obj.finalValue ?? 0,
      total_value: obj.totalValue ?? 0,
      ball_type: ball_type,
    };
  });

  return {
    selected_objects,
    performance: solution.totalValueProp ? solution.totalValueProp * 100 : 0,
    ai_assisted_flag,
    rank: solution.rank ?? -1,
  };
}

export function recordUserChoiceData(trial, userSolution) {
  let ai_assisted_flag = "no_ai";
  if (globalState.AI_HELP > 0) {
    ai_assisted_flag = globalState.canShowAIAnswer
      ? "after_ai_show"
      : "before_ai_show";
  }

  const userChoice = createChoiceFromSolution(userSolution, ai_assisted_flag);
  trial.user_choice.push(userChoice);
}

export function recordBestChoiceData(trial, bestSolution) {
  const bestChoice = createChoiceFromSolution(bestSolution);
  trial.best_choice[0] = bestChoice;
}

/**
 * @typedef {Object} ExperimentObject
 * @property {number} object_index
 * @property {number} final_distance // final distance between user and player
 * @property {boolean} is_intercepted
 * @property {number} final_value
 * @property {number} total_value
 * @property {string} ball_type // 'red', 'blue', 'green_turner', 'bomb'
 */
