/**
 * migrateDifficultyCheckSets.js
 *
 * Archives the `difficulty_check_sets` collection into a new named collection
 * at the end of a study round.
 *
 * Usage:
 *   node migrateDifficultyCheckSets.js <target_collection>
 *
 * Example:
 *   node migrateDifficultyCheckSets.js study_round_1_difficulty_check_sets
 *
 * What it does:
 *   - Copies all docs from `difficulty_check_sets` → `<target_collection>`
 *     (with all subcollections: users, trials, education_trials)
 *   - Does NOT delete the source — verify the archive in Firebase Console first,
 *     then manually delete `difficulty_check_sets` when ready.
 *
 * Requirements:
 *   - Place your Firebase service account key at: scripts/firebase/service-account-key.json
 *   - Run `npm install` in this directory first
 */

const admin = require("firebase-admin");
const serviceAccount = require("./service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const targetCollection = process.argv[2];

if (!targetCollection) {
  console.error("❌ Usage: node migrateDifficultyCheckSets.js <target_collection>");
  console.error("   Example: node migrateDifficultyCheckSets.js study_round_1_difficulty_check_sets");
  process.exit(1);
}

async function copyDocumentWithSubcollections(sourceDocRef, targetDocRef) {
  const docSnapshot = await sourceDocRef.get();

  // Only write document data if it actually exists; implicit (data-less) parent
  // documents should still have their subcollections copied.
  if (docSnapshot.exists) {
    await targetDocRef.set(docSnapshot.data());
  }

  const subcollections = await sourceDocRef.listCollections();
  for (const subCol of subcollections) {
    const subDocs = await subCol.get();
    for (const subDoc of subDocs.docs) {
      await copyDocumentWithSubcollections(
        subCol.doc(subDoc.id),
        targetDocRef.collection(subCol.id).doc(subDoc.id)
      );
    }
  }
}

async function main() {
  const sourceRef = db.collection("difficulty_check_sets");
  const targetRef = db.collection(targetCollection);

  // listDocuments() includes implicit (data-less) parent docs that .get() skips
  const docRefs = await sourceRef.listDocuments();
  if (docRefs.length === 0) {
    console.log("⚠️  `difficulty_check_sets` collection is empty. Nothing to migrate.");
    return;
  }

  console.log(`📋 Migrating ${docRefs.length} set(s): \`difficulty_check_sets\` → \`${targetCollection}\`...`);

  for (const docRef of docRefs) {
    await copyDocumentWithSubcollections(docRef, targetRef.doc(docRef.id));
    console.log(`  ✓ Copied set: ${docRef.id}`);
  }

  console.log(`✅ Difficulty check sets migrated to \`${targetCollection}\`.`);
  console.log(`⚠️  Source \`difficulty_check_sets\` was NOT deleted.`);
  console.log(`   Verify the archive in Firebase Console, then manually delete if ready.`);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
