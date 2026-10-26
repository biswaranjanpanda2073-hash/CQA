/**
 * ============================================================================
 * SEED LOCAL EMULATOR DATA
 * Populates local Firestore emulator with initial test users, master roles,
 * stations, and sample devices for isolated development testing.
 * ============================================================================
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

import admin from '../functions/node_modules/firebase-admin/lib/index.js';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'cqa-mes' });
}

const db = admin.firestore();

async function seed() {
  console.log('[Seeder] Seeding initial test data into local Firestore emulator...');

  // 1. Initial Test Users
  const users = [
    {
      id: 'ADMIN',
      name: 'Super Administrator',
      role: 'Super Admin',
      stations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      password: 'password123',
      createdAt: new Date().toISOString()
    },
    {
      id: 'OP001',
      name: 'Line Operator 1',
      role: 'Operator',
      stations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      password: 'password123',
      createdAt: new Date().toISOString()
    },
    {
      id: 'SUPERVISOR',
      name: 'QC Supervisor',
      role: 'Supervisor',
      stations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      password: 'password123',
      createdAt: new Date().toISOString()
    }
  ];

  for (const user of users) {
    await db.collection('users').doc(user.id).set(user, { merge: true });
    console.log(`[Seeder] Seeded user: ${user.id} (${user.role}) / password: ${user.password}`);
  }

  // 2. System Names
  await db.collection('settings').doc('system_names').set({
    1: 'RECEIVING & INWARD',
    2: 'VISUAL INSPECTION',
    3: 'FUNCTIONAL TESTING',
    4: 'REWORK & REPAIR',
    5: 'POST-REPAIR QC',
    6: 'FIRMWARE FLASHING',
    7: 'FINAL QC & CALIBRATION',
    8: 'PACKAGING & LABELING',
    9: 'SCRAP ANALYSIS',
    10: 'FG WAREHOUSE'
  }, { merge: true });

  // 3. Global Settings
  await db.collection('settings').doc('global').set({
    maintenanceMode: false,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // 4. Sample Devices for Testing
  await db.collection('devices').doc('DEV-TEST-001').set({
    id: 'DEV-TEST-001',
    serialNumber: 'DEV-TEST-001',
    project: 'SmartEnergyMeter',
    currentStation: 1,
    stationName: 'RECEIVING & INWARD',
    status: 'Processing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: []
  }, { merge: true });

  await db.collection('devices').doc('CALC-TEST-001').set({
    id: 'CALC-TEST-001',
    serialNumber: 'CALC-TEST-001',
    project: 'Calculator',
    currentStation: 1,
    stationName: 'RECEIVING & INWARD',
    status: 'Processing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: []
  }, { merge: true });

  console.log('[Seeder] Successfully seeded emulator with test users, settings, and sample devices!');
}

seed().catch(err => {
  console.error('[Seeder] Seeding error:', err);
  process.exit(1);
});
