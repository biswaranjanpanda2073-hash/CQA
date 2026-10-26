/**
 * ============================================================================
 * READ-ONLY MIGRATION VERIFICATION SCRIPT
 * Checks whether all users have been migrated from plaintext passwords in `users`
 * to scrypt password hashes in `user_secrets`.
 *
 * SAFETY: READ-ONLY. Makes NO writes or modifications to Firestore.
 * USAGE: GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node scripts/verify-migration-status.mjs
 * ============================================================================
 */

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function verifyMigration() {
  console.log('Fetching users from Firestore...');
  const usersSnap = await db.collection('users').get();
  const secretsSnap = await db.collection('user_secrets').get();

  const secretUids = new Set(secretsSnap.docs.map(d => d.id));
  
  console.log(`Found ${usersSnap.size} user documents and ${secretsSnap.size} user_secrets documents.\n`);

  let unmigratedCount = 0;
  let missingSecretCount = 0;
  const report = [];

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const uid = userDoc.id;
    const hasPlaintextPassword = Object.prototype.hasOwnProperty.call(data, 'password') && Boolean(data.password);
    const hasSecret = secretUids.has(uid);

    let status = 'MIGRATED';
    if (hasPlaintextPassword) {
      status = 'UNMIGRATED (Plaintext password field present)';
      unmigratedCount++;
    } else if (!hasSecret) {
      status = 'WARNING (No password secret found - password reset required)';
      missingSecretCount++;
    }

    report.push({
      UID: uid,
      Name: data.name || 'N/A',
      Role: data.role || 'N/A',
      Status: status,
      HasSecret: hasSecret ? 'YES' : 'NO'
    });
  }

  console.table(report);

  console.log('\n--- MIGRATION SUMMARY ---');
  console.log(`Total Users: ${usersSnap.size}`);
  console.log(`Unmigrated Plaintext Passwords: ${unmigratedCount}`);
  console.log(`Users with Secrets: ${secretsSnap.size}`);
  console.log(`Users needing reset: ${missingSecretCount}`);

  if (unmigratedCount > 0) {
    console.error(`\n[ACTION REQUIRED] ${unmigratedCount} user(s) still contain plaintext password fields.`);
    console.error('DO NOT deploy firestore.rules until all users have logged in or had passwords reset.');
    process.exit(1);
  } else {
    console.log('\n[SUCCESS] No plaintext password fields found in users collection.');
    console.log('Safe to proceed with firestore.rules deployment.');
    process.exit(0);
  }
}

verifyMigration().catch(err => {
  console.error('Migration verification check failed:', err);
  process.exit(2);
});
