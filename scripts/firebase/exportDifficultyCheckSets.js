/**
 * exportDifficultyCheckSets.js
 *
 * Exports the `difficulty_check_sets` collection from Firestore to a local JSON file.
 * All nested subcollections (users, trials, education_trials) are included.
 *
 * Usage:
 *   node exportDifficultyCheckSets.js
 *
 * Output:
 *   data/difficulty_check_sets_YYYY-MM-DD.json
 *
 * Requirements:
 *   - Place your Firebase service account key at: scripts/firebase/service-account-key.json
 *   - Run `npm install` in this directory first
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require("./service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const DATA_DIR = path.resolve(__dirname, "data");

function getDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function recursiveExport(collectionRef) {
  const snapshot = await collectionRef.get();
  const result = {};

  for (const doc of snapshot.docs) {
    const docData = doc.data();
    const subcollections = await doc.ref.listCollections();

    if (subcollections.length > 0) {
      docData["_subcollections"] = {};
      for (const subCol of subcollections) {
        docData["_subcollections"][subCol.id] = await recursiveExport(subCol);
      }
    }

    result[doc.id] = docData;
  }

  return result;
}

// Like recursiveExport but uses listDocuments() so implicit (data-less) parent
// documents are included — Firestore's .get() skips documents with no data.
async function recursiveExportByRefs(collectionRef) {
  const docRefs = await collectionRef.listDocuments();
  const result = {};

  for (const docRef of docRefs) {
    const docSnap = await docRef.get();
    const docData = docSnap.exists ? docSnap.data() : {};
    const subcollections = await docRef.listCollections();

    if (subcollections.length > 0) {
      docData["_subcollections"] = {};
      for (const subCol of subcollections) {
        docData["_subcollections"][subCol.id] = await recursiveExport(subCol);
      }
    }

    result[docRef.id] = docData;
  }

  return result;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log("📦 Exporting `difficulty_check_sets` collection...");
  const data = await recursiveExportByRefs(db.collection("difficulty_check_sets"));
  const count = Object.keys(data).length;

  const outPath = path.join(DATA_DIR, `difficulty_check_sets_${getDateStamp()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`✅ Exported ${count} sets → ${outPath}`);
}

main().catch((err) => {
  console.error("❌ Export failed:", err);
  process.exit(1);
});
