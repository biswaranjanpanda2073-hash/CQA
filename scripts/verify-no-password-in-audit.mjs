/**
 * ============================================================================
 * READ-ONLY AUDIT LOG CREDENTIAL SCANNER
 * Scans `audit_logs` documents to verify that no plaintext passwords, hashes,
 * salts, or secrets leaked into `previousValue` or `newValue`.
 *
 * SAFETY: READ-ONLY. Makes NO writes or modifications to Firestore.
 * USAGE: GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node scripts/verify-no-password-in-audit.mjs
 * ============================================================================
 */

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const SENSITIVE_KEYS = new Set(['password', 'hash', 'salt', 'secret', 'token']);

function findSensitiveKeys(obj, path = '') {
  const leaks = [];
  if (!obj || typeof obj !== 'object') return leaks;

  for (const [key, val] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      leaks.push({ path: currentPath, valuePreview: typeof val === 'string' ? `[STRING len=${val.length}]` : typeof val });
    }
    if (val && typeof val === 'object') {
      leaks.push(...findSensitiveKeys(val, currentPath));
    }
  }
  return leaks;
}

async function verifyAuditLogs() {
  console.log('Fetching audit_logs from Firestore...');
  const auditSnap = await db.collection('audit_logs').get();
  console.log(`Found ${auditSnap.size} total audit log entries.\n`);

  let violationCount = 0;
  const violations = [];

  for (const docSnap of auditSnap.docs) {
    const data = docSnap.data();
    const docId = docSnap.id;

    const prevLeaks = findSensitiveKeys(data.previousValue, 'previousValue');
    const newLeaks = findSensitiveKeys(data.newValue, 'newValue');
    const allLeaks = [...prevLeaks, ...newLeaks];

    if (allLeaks.length > 0) {
      violationCount++;
      violations.push({
        AuditID: docId,
        Timestamp: data.timestamp || 'N/A',
        Action: data.action || 'N/A',
        ActorId: data.actorId || 'N/A',
        Entity: data.entity || 'N/A',
        LeakedKeys: allLeaks.map(l => l.path).join(', ')
      });
    }
  }

  if (violations.length > 0) {
    console.table(violations);
    console.error(`\n[CRITICAL WARNING] Found ${violationCount} audit log document(s) with credential leaks!`);
    console.error('Audit logs are immutable. Ensure sanitation logic is deployed immediately to stop new leaks.');
    process.exit(1);
  } else {
    console.log(`\n[SUCCESS] Scanned ${auditSnap.size} audit log entries. Zero sensitive keys found in previousValue/newValue.`);
    process.exit(0);
  }
}

verifyAuditLogs().catch(err => {
  console.error('Audit verification check failed:', err);
  process.exit(2);
});
