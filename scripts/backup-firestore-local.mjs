#!/usr/bin/env node
/**
 * scripts/backup-firestore-local.mjs
 * Zero-Billing Local JSON Backup of Firestore collections from project 'cqa-mes'.
 * Reads all documents (read-only) and persists them locally into backups/pre-hardening-<timestamp>/.
 */
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'cqa-mes';

// Known collections from firestore.rules
const KNOWN_COLLECTIONS = [
  'users',
  'user_secrets',
  'login_attempts',
  'tickets',
  'devices',
  'audit_logs',
  'settings',
  'roles',
  'projects',
  'stations_master',
  'station_checkpoints',
  'project_workflows',
  'project_workflows_versions',
  'admin_movements',
  'baan_parts',
  'baan_batches',
  'baan_part_requests',
  'baan_part_issuance',
  'baan_bulk_uploads',
  'baan_locations',
  'baan_inventory_movements',
  'baan_inward_logs'
];

async function runBackup() {
  console.log(`[Backup] Initializing Firebase Admin for project: ${PROJECT_ID}...`);
  
  let app;
  try {
    app = initializeApp({
      projectId: PROJECT_ID,
      credential: applicationDefault()
    });
  } catch (initErr) {
    console.error(`[Backup] Failed to initialize credentials:`, initErr.message);
    process.exit(1);
  }

  const db = getFirestore(app);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(process.cwd(), 'backups', `pre-hardening-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`[Backup] Discovering root collections in Firestore...`);
  const discovered = await db.listCollections();
  const discoveredIds = discovered.map(c => c.id);

  const allCollectionIds = Array.from(new Set([...KNOWN_COLLECTIONS, ...discoveredIds]));
  console.log(`[Backup] Collections to inspect (${allCollectionIds.length}): ${allCollectionIds.join(', ')}`);

  const summary = {
    projectId: PROJECT_ID,
    timestamp: new Date().toISOString(),
    backupDirectory: backupDir,
    collections: {},
    totalDocuments: 0
  };

  for (const colId of allCollectionIds) {
    try {
      const snap = await db.collection(colId).get();
      const count = snap.size;
      summary.collections[colId] = count;
      summary.totalDocuments += count;

      if (count > 0) {
        const docs = [];
        snap.forEach(doc => {
          docs.push({
            _id: doc.id,
            ...doc.data()
          });
        });

        const filePath = path.join(backupDir, `${colId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
        console.log(`  ✔ [${colId}] ${count} documents -> ${colId}.json`);
      } else {
        console.log(`  - [${colId}] 0 documents (empty)`);
      }
    } catch (err) {
      console.warn(`  ⚠ [${colId}] Error reading collection: ${err.message}`);
      summary.collections[colId] = `ERROR: ${err.message}`;
    }
  }

  const summaryPath = path.join(backupDir, '_backup_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\n========================================`);
  console.log(`✔ Backup completed successfully!`);
  console.log(`  Destination: ${backupDir}`);
  console.log(`  Total Documents Exported: ${summary.totalDocuments}`);
  console.log(`========================================\n`);
}

runBackup().catch(err => {
  console.error('[Backup] Unhandled error during backup:', err);
  process.exit(1);
});
