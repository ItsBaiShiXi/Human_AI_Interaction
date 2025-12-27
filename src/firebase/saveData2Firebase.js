// Import core Firebase services
import { initializeApp } from "firebase/app";

// Import Firestore
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

// Import Authentication
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { User, getCurrentExperimentData } from "../logic/collectData";

import { getCurrentDate } from "../utils/utils";
import { globalState } from "../data/variable";

// Initialize App
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

export var firebaseUserId = "not initialized yet";

signInAnonymously(auth)
  .then(() => {
    console.log("Signed in anonymously");
  })
  .catch((error) => {
    console.error("Authentication error", error);
  });

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in, see docs for a list of available properties
    // https://firebase.google.com/docs/reference/js/firebase.User
    firebaseUserId = user.uid;
  } else {
    // User is signed out
    console.log("User is signed out");
  }
});

/**
 * Main function: Save single trial or just update end_times
 */
export async function saveSingleTrial(experiment, trial) {
  try {
    const endTime = trial?.end_time || getCurrentDate();
    const userDocRef = await saveOrUpdateUser(endTime);

    if (!experiment) {
      console.warn("⚠️ No experiment found. Skipping experiment update.");
      return;
    }

    const expRef = await saveOrUpdateExperiment(
      userDocRef,
      experiment,
      endTime
    );

    if (!trial) {
      console.warn("⚠️ Trial is null or undefined. Skipped saving trial data.");
      return;
    }

    await saveTrialData(expRef, trial);
    console.log(
      `✅ Trial ${trial.trial_id} saved for user ${User.prolific_pid}.`
    );
  } catch (error) {
    console.error("❌ Failed to save trial:", error);
  }
}

/**
 *  Save or update the user document
 */
export async function saveOrUpdateUser(endTime) {
  try {
    const userDocRef = doc(db, "users", User.prolific_pid);

    const payload = {
      prolific_pid: User.prolific_pid,
      firebase_uid: firebaseUserId,
      create_time: User.create_time,
      end_time: endTime,
      is_consent: User.is_consent,
      is_passed_education: User.is_passed_education,
      is_passed_all_experiments: User.is_passed_all_experiments,
    };
    await setDoc(userDocRef, payload, { merge: true });

    console.log(`✅ User prolific_pid: ${User.prolific_pid} updated.`);
    return userDocRef;
  } catch (error) {
    console.error("❌ Failed to save user data:", error);
  }
}

/**
 *  Check if specific user already exists in database
 */
export async function checkIfUserExists(prolific_pid) {
  const userDocRef = doc(db, "users", prolific_pid);
  const userDocSnap = await getDoc(userDocRef);
  return userDocSnap.exists();
}

/**
 *  Save or update the experiment document
 */
async function saveOrUpdateExperiment(userDocRef, experiment, endTime) {
  try {
    const expRef = doc(
      collection(userDocRef, "experiments"),
      `${experiment.experiment_id}`
    );
    const expDocSnap = await getDoc(expRef);

    if (!expDocSnap.exists()) {
      await setDoc(expRef, {
        experiment_id: experiment.experiment_id,
        create_time: experiment.create_time,
        end_time: endTime,
        num_trials: experiment.num_trials,
        failed_attention_check_count: experiment.failed_attention_check_count,
        is_finished: experiment.is_finished,
      });
    } else {
      await updateDoc(expRef, {
        end_time: endTime,
        failed_attention_check_count: experiment.failed_attention_check_count,
        is_finished: experiment.is_finished,
      });
    }
    console.log(
      `✅ Experiment ${experiment.experiment_id} for User ${User.prolific_pid} updated.`
    );
    return expRef;
  } catch (error) {
    console.error("❌ Failed to save experiment data:", error);
  }
}

/**
 * Save the trial data under the experiment
 */
async function saveTrialData(expRef, trial) {
  try {
    let trialRef;
    if (trial.is_comprehension_check) {
      trialRef = doc(
        collection(expRef, "comprehension_trials"),
        `${trial.trial_id}`
      );
    } else {
      trialRef = doc(collection(expRef, "trials"), `${trial.trial_id}`);
    }
    await setDoc(trialRef, {
      trial_id: trial.trial_id,
      is_attention_check: trial.is_attention_check,
      is_comprehension_check: trial.is_comprehension_check,
      create_time: trial.create_time,
      end_time: trial.end_time,
      performance: trial.performance,
      user_score: trial.user_score,
      best_score: trial.best_score,
      replay_num: trial.replay_num,
      reselect_num: trial.reselect_num,
      think_time: trial.think_time,
      think_time_unfocused: trial.think_time_unfocused,
      total_time: trial.total_time,
      total_time_unfocused: trial.total_time_unfocused,
      ai_choice: trial.ai_choice,
      best_choice: trial.best_choice,
      user_choice: trial.user_choice,
      user_hit_bomb: trial.user_hit_bomb,
      best_hit_bomb: trial.best_hit_bomb,
    });
  } catch (error) {
    console.error("❌ Failed to save trial data:", error);
  }
}

/**
 * Save user feedback to Firestore under subcollection `feedback`.
 * @param {Object} feedbackData
 */
export async function saveFeedbackData(feedbackData) {
  try {
    const userRef = doc(db, "users", User.prolific_pid);
    const feedbackRef = doc(collection(userRef, "feedback"), "feedback_main");

    // ✅ Save feedback + update user end_time
    await Promise.all([
      setDoc(feedbackRef, {
        ...feedbackData,
      }),
      updateDoc(userRef, {
        end_time: User.end_time,
      }),
    ]);

    console.log("✅ Feedback saved and end_time updated in Firestore.");
  } catch (error) {
    console.error("❌ Failed to save feedback:", error);
  }
}
