/**
 * ⚠️  BAAN DATA DELETION SCRIPT
 * ───────────────────────────────────────────────────────────
 * This script permanently deletes ALL data from the BAAN
 * module collections in Firestore.
 *
 * Collections that will be WIPED:
 *   ✗  baan_parts
 *   ✗  baan_batches
 *   ✗  baan_inward_logs
 *   ✗  baan_inventory_movements
 *   ✗  baan_part_requests
 *   ✗  baan_part_issuance
 *
 * Collections that will be KEPT:
 *   ✓  baan_locations  (physical rack/location config)
 *   ✓  All other app data (devices, tickets, users, etc.)
 *
 * Run with:  node delete-baan-data.mjs
 * ───────────────────────────────────────────────────────────
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";

// ─── Firebase Config (same as your app) ────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyD53509zOsLXne2Hb9mEWjBEpvYyRl-VNw",
    authDomain: "cqa-mes.firebaseapp.com",
    projectId: "cqa-mes",
    storageBucket: "cqa-mes.appspot.com",
    messagingSenderId: "500138644479",
    appId: "1:500138644479:web:1624bbe2d7459b27a6cdca",
};

// ─── Collections to DELETE ──────────────────────────────────
const BAAN_COLLECTIONS_TO_DELETE = [
    "baan_parts",
    "baan_batches",
    "baan_inward_logs",
    "baan_inventory_movements",
    "baan_part_requests",
    "baan_part_issuance",
];

// ─── Helper: Delete all docs in a collection in batches ────
async function deleteCollection(db, collectionName) {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
        console.log(`   ℹ️  ${collectionName} — already empty, skipping.`);
        return 0;
    }

    let totalDeleted = 0;
    // Firestore batch limit is 500 operations
    const BATCH_SIZE = 400;
    let batchDocs = [];

    for (const docSnap of snapshot.docs) {
        batchDocs.push(docSnap);
        if (batchDocs.length >= BATCH_SIZE) {
            const batch = writeBatch(db);
            batchDocs.forEach(d => batch.delete(doc(db, collectionName, d.id)));
            await batch.commit();
            totalDeleted += batchDocs.length;
            batchDocs = [];
        }
    }

    // Commit any remaining docs
    if (batchDocs.length > 0) {
        const batch = writeBatch(db);
        batchDocs.forEach(d => batch.delete(doc(db, collectionName, d.id)));
        await batch.commit();
        totalDeleted += batchDocs.length;
    }

    return totalDeleted;
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║       BAAN Module — Data Deletion Script     ║");
    console.log("╚══════════════════════════════════════════════╝\n");
    console.log("🔌 Connecting to Firebase project: cqa-mes ...\n");

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    let grandTotal = 0;

    for (const colName of BAAN_COLLECTIONS_TO_DELETE) {
        process.stdout.write(`   🗑️  Deleting ${colName} ... `);
        try {
            const count = await deleteCollection(db, colName);
            console.log(`✅  ${count} document(s) deleted.`);
            grandTotal += count;
        } catch (err) {
            console.log(`❌  ERROR: ${err.message}`);
        }
    }

    console.log("\n──────────────────────────────────────────────");
    console.log(`✅  Done! Total documents deleted: ${grandTotal}`);
    console.log("──────────────────────────────────────────────\n");
    console.log("ℹ️  baan_locations was NOT touched (kept intact).");
    console.log("🚀  You can now start inwarding parts fresh!\n");

    process.exit(0);
}

main().catch(err => {
    console.error("\n❌ Fatal error:", err);
    process.exit(1);
});
