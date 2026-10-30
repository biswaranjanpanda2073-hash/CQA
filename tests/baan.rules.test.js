/* global process */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';

const PROJECT_ID = 'demo-cqa-baan-rules-test';
const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

describe('BAAN & BOM Security Rules Suite', () => {
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

  // 1. Direct write to baan_batches by Operator denied
  test('Operator cannot write baan_batches directly', async () => {
    const op = testEnv.authenticatedContext('operator1', { role: 'Operator' });
    await assertFails(
      setDoc(doc(op.firestore(), 'baan_batches', 'BAT-001'), {
        partNumber: 'PN-100',
        quantityAvailable: 50,
      })
    );
  });

  // 2. Store Executive can create unlocked batch with non-negative quantity
  test('Store Executive can create unlocked batch', async () => {
    const exec = testEnv.authenticatedContext('exec1', { role: 'Store Executive' });
    await assertSucceeds(
      setDoc(doc(exec.firestore(), 'baan_batches', 'BAT-001'), {
        partNumber: 'PN-100',
        quantityAvailable: 50,
      })
    );
  });

  // 3. Batch write rejected if SKU is locked
  test('Batch write rejected when SKU is actively locked', async () => {
    // Setup active lock
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'baan_inventory_locks', 'PN-LOCKED'), {
        sku: 'PN-LOCKED',
        sessionId: 'OPN-SESS-1',
        ownerUid: 'mgr1',
        fencingToken: 1,
        status: 'ACTIVE',
        expiresAt: Timestamp.fromMillis(Date.now() + 600000), // 10 min in future
      });
    });

    const exec = testEnv.authenticatedContext('exec1', { role: 'Store Executive' });
    await assertFails(
      setDoc(doc(exec.firestore(), 'baan_batches', 'BAT-LOCKED-1'), {
        partNumber: 'PN-LOCKED',
        quantityAvailable: 20,
      })
    );
  });

  // 4. BOM Headers: Signed-in read allowed, Operator write denied, Admin write allowed
  test('BOM headers: signed-in can read, Operator cannot write, Admin can write', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bom_headers', 'CALC_V5'), {
        id: 'CALC_V5',
        name: 'Calculator V5',
      });
    });

    const op = testEnv.authenticatedContext('operator1', { role: 'Operator' });
    await assertSucceeds(getDoc(doc(op.firestore(), 'bom_headers', 'CALC_V5')));
    await assertFails(setDoc(doc(op.firestore(), 'bom_headers', 'CALC_V5'), { name: 'Tampered' }));

    const admin = testEnv.authenticatedContext('admin1', { role: 'Admin' });
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'bom_headers', 'CALC_V5'), {
        id: 'CALC_V5',
        name: 'Calculator V5 Updated',
      })
    );
  });

  // 5. BOM Revisions: Append-only, updates/deletions denied
  test('BOM revisions: Admin can create but cannot update (frozen revision)', async () => {
    const admin = testEnv.authenticatedContext('admin1', { role: 'Admin' });
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'bom_revisions', 'CALC_V5_REV01'), {
        revision: 'REV-01',
        variantId: 'CALC_V5',
      })
    );

    // Update denied (revisions are frozen)
    await assertFails(
      updateDoc(doc(admin.firestore(), 'bom_revisions', 'CALC_V5_REV01'), {
        revision: 'REV-01-MODIFIED',
      })
    );
  });

  // 6. Store Manager can acquire lock on baan_inventory_locks
  test('Store Manager can acquire active SKU lock with fencingToken 1', async () => {
    const mgr = testEnv.authenticatedContext('mgr1', { role: 'Store Manager' });
    await assertSucceeds(
      setDoc(doc(mgr.firestore(), 'baan_inventory_locks', 'PN-200'), {
        sku: 'PN-200',
        ownerUid: 'mgr1',
        sessionId: 'OPN-SESSION-001',
        fencingToken: 1,
        status: 'ACTIVE',
        expiresAt: Timestamp.fromMillis(Date.now() + 900000), // 15 min in future
      })
    );
  });

  // 7. Another user cannot take over an unexpired lock
  test('Another user cannot take over an unexpired lock', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'baan_inventory_locks', 'PN-ACTIVE'), {
        sku: 'PN-ACTIVE',
        ownerUid: 'mgr1',
        sessionId: 'OPN-SESSION-001',
        fencingToken: 1,
        status: 'ACTIVE',
        expiresAt: Timestamp.fromMillis(Date.now() + 900000),
      });
    });

    const mgr2 = testEnv.authenticatedContext('mgr2', { role: 'Store Manager' });
    await assertFails(
      setDoc(doc(mgr2.firestore(), 'baan_inventory_locks', 'PN-ACTIVE'), {
        sku: 'PN-ACTIVE',
        ownerUid: 'mgr2',
        sessionId: 'OPN-SESSION-002',
        fencingToken: 2,
        status: 'ACTIVE',
        expiresAt: Timestamp.fromMillis(Date.now() + 900000),
      })
    );
  });

  // 8. Discrepancy Ticket: Step 1 create, Step 2 Store Manager approve, Step 3 Production Manager approve
  test('Discrepancy ticket: enforces two distinct authenticated approvers', async () => {
    const exec = testEnv.authenticatedContext('exec1', { role: 'Store Executive' });
    const mgr1 = testEnv.authenticatedContext('mgr1', { role: 'Store Manager' });
    const prodMgr = testEnv.authenticatedContext('prod1', { role: 'Production Manager' });

    // Step 1: Create Ticket (Store Executive)
    await assertSucceeds(
      setDoc(doc(exec.firestore(), 'baan_inventory_discrepancies', 'TICK-100'), {
        status: 'PENDING_FIRST_APPROVAL',
        sku: 'PN-300',
        delta: -10,
        firstApproverUid: null,
        secondApproverUid: null,
      })
    );

    // Step 2: First Approval by Store Manager
    await assertSucceeds(
      updateDoc(doc(mgr1.firestore(), 'baan_inventory_discrepancies', 'TICK-100'), {
        status: 'PENDING_SECOND_APPROVAL',
        firstApproverUid: 'mgr1',
        sku: 'PN-300',
        delta: -10,
      })
    );

    // Step 3a: Store Manager attempts second approval (REJECTED: Same user)
    await assertFails(
      updateDoc(doc(mgr1.firestore(), 'baan_inventory_discrepancies', 'TICK-100'), {
        status: 'APPROVED',
        firstApproverUid: 'mgr1',
        secondApproverUid: 'mgr1', // Same user attempting second signature!
      })
    );

    // Step 3b: Production Manager (Distinct user) approves (ALLOWED)
    await assertSucceeds(
      updateDoc(doc(prodMgr.firestore(), 'baan_inventory_discrepancies', 'TICK-100'), {
        status: 'APPROVED',
        firstApproverUid: 'mgr1',
        secondApproverUid: 'prod1',
      })
    );
  });

  // 9. Store Manager can read audit_logs
  test('Store Manager can read audit_logs', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'audit_logs', 'log-baan-01'), {
        action: 'BAAN_INWARD',
        actorId: 'admin1',
      });
    });

    const mgr = testEnv.authenticatedContext('mgr1', { role: 'Store Manager' });
    await assertSucceeds(getDoc(doc(mgr.firestore(), 'audit_logs', 'log-baan-01')));
  });
});
