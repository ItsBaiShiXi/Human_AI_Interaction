/**
 * deleteTestDifficultyUsers.js
 *
 * Deletes all test/dev documents from every `difficulty_check_sets/{setId}/users`
 * subcollection, identified by the document ID (prolific_pid) containing "test"
 * (case-insensitive). All nested subcollections (trials, education_trials) are
 * deleted recursively.
 *
 * Usage:
 *   node deleteTestDifficultyUsers.js
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

async function deleteDocumentAndSubcollections(docRef) {
  const subcollections = await docRef.listCollections();
  for (const subCol of subcollections) {
    const subDocs = await subCol.get();
    for (const subDoc of subDocs.docs) {
      await deleteDocumentAndSubcollections(subCol.doc(subDoc.id));
    }
  }
  await docRef.delete();
  console.log(`  🗑️  Deleted: ${docRef.path}`);
}

async function main() {
  console.log("🔍 Scanning `difficulty_check_sets` for test users...");
  // listDocuments() returns refs for all set documents including those with no
  // data (implicit parents), which .get() would skip.
  const setRefs = await db.collection("difficulty_check_sets").listDocuments();

  if (setRefs.length === 0) {
    console.log("✅ No difficulty check sets found.");
    return;
  }

  let totalDeleted = 0;

  for (const setRef of setRefs) {
    const setId = setRef.id;
    const usersRef = db.collection("difficulty_check_sets").doc(setId).collection("users");
    const usersSnapshot = await usersRef.get();

    const testUsers = usersSnapshot.docs.filter((doc) => doc.id.toLowerCase().includes("test"));

    if (testUsers.length === 0) continue;

    console.log(`  Set ${setId}: found ${testUsers.length} test user(s). Deleting...`);
    for (const userDoc of testUsers) {
      await deleteDocumentAndSubcollections(usersRef.doc(userDoc.id));
    }
    totalDeleted += testUsers.length;
  }

  if (totalDeleted === 0) {
    console.log("✅ No test users found in any difficulty check set.");
  } else {
    console.log(`✅ Deleted ${totalDeleted} test user(s) from \`difficulty_check_sets\`.`);
  }
}

main().catch((err) => {
  console.error("❌ Deletion failed:", err);
  process.exit(1);
});
