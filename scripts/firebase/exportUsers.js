/**
 * exportUsers.js
 *
 * Exports the `users` collection from Firestore to a local JSON file.
 * All nested subcollections (experiments, trials, feedback) are included.
 *
 * Usage:
 *   node exportUsers.js
 *
 * Output:
 *   data/users_YYYY-MM-DD.json
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

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log("📦 Exporting `users` collection...");
  const data = await recursiveExport(db.collection("users"));
  const count = Object.keys(data).length;

  const outPath = path.join(DATA_DIR, `users_${getDateStamp()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`✅ Exported ${count} users → ${outPath}`);
}

main().catch((err) => {
  console.error("❌ Export failed:", err);
  process.exit(1);
});
