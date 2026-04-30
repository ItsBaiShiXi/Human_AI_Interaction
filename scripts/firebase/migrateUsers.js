/**
 * migrateUsers.js
 *
 * Archives the `users` collection into a new named collection at the end of a
 * study round, so `users` can be cleared for the next cohort.
 *
 * Usage:
 *   node migrateUsers.js <target_collection>
 *
 * Example:
 *   node migrateUsers.js study_round_1_users
 *
 * What it does:
 *   - Copies all docs from `users` → `<target_collection>` (with all subcollections)
 *   - Does NOT delete the source — verify the archive in Firebase Console first,
 *     then manually delete `users` when ready.
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
  console.error("❌ Usage: node migrateUsers.js <target_collection>");
  console.error("   Example: node migrateUsers.js study_round_1_users");
  process.exit(1);
}

async function copyDocumentWithSubcollections(sourceDocRef, targetDocRef) {
  const docSnapshot = await sourceDocRef.get();
  if (!docSnapshot.exists) return;

  await targetDocRef.set(docSnapshot.data());

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
  const sourceRef = db.collection("users");
  const targetRef = db.collection(targetCollection);

  const snapshot = await sourceRef.get();
  if (snapshot.empty) {
    console.log("⚠️  `users` collection is empty. Nothing to migrate.");
    return;
  }

  console.log(`📋 Migrating ${snapshot.size} user(s): \`users\` → \`${targetCollection}\`...`);

  for (const doc of snapshot.docs) {
    await copyDocumentWithSubcollections(sourceRef.doc(doc.id), targetRef.doc(doc.id));
    console.log(`  ✓ Copied: ${doc.id}`);
  }

  console.log(`✅ Users migrated to \`${targetCollection}\`.`);
  console.log(`⚠️  Source \`users\` was NOT deleted.`);
  console.log(`   Verify the archive in Firebase Console, then manually delete \`users\` if ready.`);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
