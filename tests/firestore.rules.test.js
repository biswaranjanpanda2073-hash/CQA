/* global process */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-cqa-rules-test';
const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

describe('Firestore Security Rules', () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // 1. Unauthenticated read of users denied
  test('unauthenticated read of users is denied', async () => {
    const unauth = testEnv.unauthenticatedContext();
    const db = unauth.firestore();
    await assertFails(getDoc(doc(db, 'users', 'user123')));
  });

  // 2. Unauthenticated write to settings/global denied
  test('unauthenticated write to settings/global is denied', async () => {
    const unauth = testEnv.unauthenticatedContext();
    const db = unauth.firestore();
    await assertFails(setDoc(doc(db, 'settings', 'global'), { maintenance: true }));
  });

  // 3. Operator write to settings/global denied
  test('Operator write to settings/global is denied', async () => {
    const op = testEnv.authenticatedContext('operator1', { role: 'Operator' });
    const db = op.firestore();
    await assertFails(setDoc(doc(db, 'settings', 'global'), { maintenance: true }));
  });

  // 4. Admin write allowed
  test('Admin write to settings/global is allowed', async () => {
    const admin = testEnv.authenticatedContext('admin1', { role: 'Admin' });
    const db = admin.firestore();
    await assertSucceeds(setDoc(doc(db, 'settings', 'global'), { maintenance: true }));
  });

  // 5. Client delete of devices denied for everyone
  test('client delete of devices is denied for everyone', async () => {
    // Setup initial device using admin withFunctionTriggersDisabled or testEnv.withSecurityRulesDisabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'devices', 'dev1'), { project: 'NonCalc' });
    });

    const op = testEnv.authenticatedContext('op1', { role: 'Operator' });
    await assertFails(deleteDoc(doc(op.firestore(), 'devices', 'dev1')));

    const admin = testEnv.authenticatedContext('admin1', { role: 'Admin' });
    await assertFails(deleteDoc(doc(admin.firestore(), 'devices', 'dev1')));

    const superAdmin = testEnv.authenticatedContext('super1', { role: 'Super Admin' });
    await assertFails(deleteDoc(doc(superAdmin.firestore(), 'devices', 'dev1')));
  });

  // 6. Client create of a Calculator device denied
  test('client create of a Calculator device is denied', async () => {
    const op = testEnv.authenticatedContext('op1', { role: 'Operator' });
    await assertFails(
      setDoc(doc(op.firestore(), 'devices', 'calc-device-1'), {
        project: 'Calculator',
        serialNumber: 'CALC-001',
      })
    );
  });

  // 7. Non-Calculator device create by signed-in allowed
  test('non-Calculator device create by signed-in is allowed', async () => {
    const op = testEnv.authenticatedContext('op1', { role: 'Operator' });
    await assertSucceeds(
      setDoc(doc(op.firestore(), 'devices', 'device-001'), {
        project: 'SmartEnergyMeter',
        serialNumber: 'SEM-001',
      })
    );
  });

  // 8. audit_logs create with mismatched actorId denied
  test('audit_logs create with mismatched actorId is denied', async () => {
    const op = testEnv.authenticatedContext('operator1', { role: 'Operator' });
    await assertFails(
      setDoc(doc(op.firestore(), 'audit_logs', 'log-1'), {
        action: 'UNIT_PROCESSED',
        actorId: 'different_user', // mismatch
      })
    );
  });

  // 8b. audit_logs create with matching actorId succeeds
  test('audit_logs create with matching actorId is allowed', async () => {
    const op = testEnv.authenticatedContext('operator1', { role: 'Operator' });
    await assertSucceeds(
      setDoc(doc(op.firestore(), 'audit_logs', 'log-1'), {
        action: 'UNIT_PROCESSED',
        actorId: 'operator1',
      })
    );
  });

  // 9. audit_logs update/delete denied
  test('audit_logs update and delete are denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'audit_logs', 'log-immutable'), {
        action: 'CREATED',
        actorId: 'operator1',
      });
    });

    const admin = testEnv.authenticatedContext('admin1', { role: 'Admin' });
    await assertFails(
      updateDoc(doc(admin.firestore(), 'audit_logs', 'log-immutable'), {
        action: 'TAMPERED',
      })
    );
    await assertFails(deleteDoc(doc(admin.firestore(), 'audit_logs', 'log-immutable')));
  });

  // 10. user_secrets denied for everyone including Super Admin
  test('user_secrets read/write denied for everyone including Super Admin', async () => {
    const superAdmin = testEnv.authenticatedContext('super1', { role: 'Super Admin' });
    const db = superAdmin.firestore();
    await assertFails(getDoc(doc(db, 'user_secrets', 'user1')));
    await assertFails(setDoc(doc(db, 'user_secrets', 'user1'), { hash: 'secret' }));
  });

  // 11. unknown collection denied
  test('unknown collection read/write is denied', async () => {
    const admin = testEnv.authenticatedContext('admin1', { role: 'Admin' });
    const db = admin.firestore();
    await assertFails(getDoc(doc(db, 'secret_passwords', 'item1')));
    await assertFails(setDoc(doc(db, 'random_data', 'item1'), { foo: 'bar' }));
  });
});
