# CQA MES Application — Security Hardening Deployment Runbook

**Project:** `cqa-mes` (React 19 + Vite + Firebase)  
**Author:** Antigravity AI Security Hardening Task  
**Date:** October 2026  
**Audience:** System Owner & Firebase Project Administrators

---

## ⚠️ Critical Ground Rules & Notice

1. **Strict Deployment Order**: Order matters critically. Deploying Firestore Rules before Cloud Functions or before accounts have logged in once will permanently lock out users and break live workflows.
2. **Credential Compromise Remediation**: Because legacy plaintext passwords in `/users` were previously readable without authentication on the public internet, **all accounts must be treated as compromised**.
   - After migration, all 10 user accounts **must** have their passwords changed.
   - Operators and administrators who reuse these credentials across other corporate services (ERP, Google Workspace, Slack, VPN) must immediately update those credentials as well.
3. **Zero Production Writes from Scripts**: Never execute legacy migration or test scripts directly against production. Only use the provided read-only verification tool.

---

## Pre-Deployment Baseline Reference

Before beginning the migration, record current document counts:
- `devices`: **~6,599 documents**
- `audit_logs`: **~2,642 documents**
- `users`: **~10 user documents**

---

## Step-by-Step Deployment Order

### Step 1: Database & Storage Backup
Prior to modifying cloud infrastructure or deploying code, create a full Firestore export backup.

```bash
# 1. Ensure active gcloud authentication
gcloud auth login
gcloud config set project cqa-mes

# 2. Export Firestore database to Cloud Storage bucket
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
gcloud firestore export gs://cqa-mes-backups/firestore-pre-hardening-${TIMESTAMP}

# 3. Verify export operation status
gcloud firestore operations list
```

---

### Step 2: Deploy Cloud Functions (Phase 1)
Deploy the hardened Node 20 Cloud Functions containing the new `crypto.scrypt` password verification, brute-force lockout, server-side audit logging, and admin user management functions.

```bash
# From repository root
firebase deploy --only functions
```

**Post-deployment verification:**
- Check Firebase Console > Functions: confirm `loginAndGetToken`, `adminUpsertUser`, `adminDeleteUser`, `adminResetPassword`, `changeOwnPassword`, `purgeDevices`, and `processCalculatorStation` are active on Node 20.
- Check Cloud Functions logs for any initialization errors.

---

### Step 3: Deploy Client Application to Firebase Hosting (Phase 2 & Phase 5)
Deploy the new React client build. The new build:
- Uses Firebase Auth as the sole source of truth for sessions.
- Removes direct plaintext password Firestore reads and `localStorage` password storage.
- Gates all real-time Firestore listeners on successful authentication.
- Bundles Chart.js locally (removing external CDN script tags).
- Serves HTTP security headers and CSP in `Content-Security-Policy-Report-Only` mode.

```bash
# 1. Build application
npm run build

# 2. Deploy hosting only
firebase deploy --only hosting
```
*(Alternatively, merge to `main` to trigger the GitHub Actions workflow)*.

---

### Step 4: Lazy Migration Execution & Verification
Once the new client and functions are live:

1. **Request all 10 users to log into the application once.**
   - When a user logs in with their credentials, `loginAndGetToken` executes the lazy migration:
     - Verifies the legacy password using timing-safe comparison.
     - Derives a salted `crypto.scrypt` hash with secure parameters.
     - Saves the hash and metadata into the server-only `user_secrets/{uid}` collection.
     - Deletes the `password` field from the `users/{uid}` document in an atomic batch.
     - Sets custom role claims in the generated Firebase Auth token.
2. **Run the Read-Only Migration Verification Script:**
   ```bash
   # Set your service account or ADC
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
   node scripts/verify-migration-status.mjs
   ```
3. **Verify:** Confirm that `Unmigrated Plaintext Passwords: 0` is reported.
   **DO NOT PROCEED TO STEP 5 UNTIL THIS REPORT SUCCEEDS.**

---

### Step 5: Deploy Hardened Firestore & Storage Rules (Phase 3 & Phase 4)
Now that users have been migrated and are authenticated via Firebase Auth custom tokens:

```bash
# 1. Verify rules unit tests pass locally first
npm run test:rules

# 2. Deploy Firestore & Storage rules
firebase deploy --only firestore:rules,storage
```

**Security enforcement achieved:**
- Default deny across all database documents and storage objects.
- `user_secrets` completely denied to all client SDKs (including Admins).
- Users can only read their own user record (or Admins can read all).
- Client write to `users` is completely forbidden (writes must go through Cloud Functions).
- Calculator devices are function-only; non-Calculator devices require authentication.
- Audit logs are append-only with strict caller UID matching (`actorId == auth.uid`).
- Storage proofs upload restricted to `checkpoint_proofs/{unitId}/{stationId}/{fileName}` with 5MB size limit and image mime-types only.

---

### Step 6: CSP Transition to Enforcing (Phase 5)
1. Monitor browser console logs and hosting metrics for 3–5 operational days under `Content-Security-Policy-Report-Only`.
2. Inspect if any valid external domains report violations.
3. Once zero unexpected reports occur, edit `firebase.json`:
   - Change key `"Content-Security-Policy-Report-Only"` to `"Content-Security-Policy"`.
4. Redeploy hosting:
   ```bash
   firebase deploy --only hosting
   ```

---

### Step 7: Mandatory Post-Migration Password Reset
1. Instruct each operator and administrator to use the new **Change Password** feature in their Profile / User Control view (`changeOwnPassword`).
2. For any dormant or unattended accounts, an Admin should trigger a password reset via the Admin Users panel (`adminResetPassword`).
3. Explicitly notify all team members:
   > *"Because legacy passwords were historically stored in an unauthenticated database, any user who used their MES password for email, ERP, or other enterprise accounts must change those passwords immediately."*

---

## Acceptance Testing Matrix

| Test Case | Actor | Expected Result | Verified By |
| :--- | :--- | :--- | :--- |
| **Operator Login** | Operator | Issues custom token with role claim; no plaintext password returned or stored in localStorage. | Automated / Manual |
| **Non-Calculator Device Move** | Operator | Unit status updates successfully; `devices` document updated. | Manual |
| **Calculator Device Move** | Operator | Dispatched through `processCalculatorStation`; direct client write rejected with 403. | Rules Test Suite |
| **Proof Image Upload** | Operator | Valid JPEG/PNG/WebP (<5MB) uploads to Storage; SVG or disguised executable rejected. | Automated & Manual |
| **BAAN Part Consumption** | Operator | Part requests and inventory consumption writes succeed under authenticated rules. | Manual |
| **Admin Create/Update User** | Admin / Super Admin | Callable function creates user; secret written to `user_secrets`; no password in `users`. | Cloud Function |
| **Super Admin Privilege Boundary** | Admin | Admin cannot create/modify/delete Super Admin accounts (`permission-denied`). | Cloud Function |
| **Purge Devices** | Super Admin | Super Admin types "PURGE"; Cloud Function deletes batches; writes `DATA_PURGED` audit log. | Cloud Function |
| **Tamper Protection** | Operator / Attacker | Editing `localStorage['cqa_user']` role to 'Admin' yields permission-denied on all Firestore queries. | Rules Test Suite |
| **Unauthenticated REST Access** | Anonymous | `https://firestore.googleapis.com/v1/projects/cqa-mes/databases/(default)/documents/users` returns HTTP 403. | REST Verification |

---

## Rollback Procedures

### If Cloud Functions Fail (Step 2)
```bash
git checkout HEAD~1 functions/
firebase deploy --only functions
```

### If Client Build Breaks Navigation/Stations (Step 3)
```bash
# Rollback Firebase Hosting to previous release in Firebase Console
# Or redeploy previous commit:
git checkout HEAD~1 src/
npm run build
firebase deploy --only hosting
```

### If Rules Block Critical Production Operations (Step 5)
If legitimate operator actions are blocked due to an unforeseen collection constraint:
```bash
# 1. Rollback rules to previous version
git checkout HEAD~1 firestore.rules storage.rules
firebase deploy --only firestore:rules,storage

# 2. Check Firestore audit logs to identify the exact blocked query/path
```
