/**
 * deleteTestUsers.js
 *
 * Deletes all test/dev documents from the `users` collection, identified by
 * the document ID (prolific_pid) containing "test" (case-insensitive).
 * All nested subcollections (experiments, trials, feedback) are deleted recursively.
 *
 * Usage:
 *   node deleteTestUsers.js
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
  console.log("🔍 Scanning `users` collection for test documents...");
  const snapshot = await db.collection("users").get();

  const testDocs = snapshot.docs.filter((doc) => doc.id.toLowerCase().includes("test"));

  if (testDocs.length === 0) {
    console.log("✅ No test documents found in `users`.");
    return;
  }

  console.log(`  Found ${testDocs.length} test document(s). Deleting...`);
  for (const doc of testDocs) {
    await deleteDocumentAndSubcollections(db.collection("users").doc(doc.id));
  }
  console.log(`✅ Deleted ${testDocs.length} test user(s) from \`users\`.`);
}

main().catch((err) => {
  console.error("❌ Deletion failed:", err);
  process.exit(1);
});
