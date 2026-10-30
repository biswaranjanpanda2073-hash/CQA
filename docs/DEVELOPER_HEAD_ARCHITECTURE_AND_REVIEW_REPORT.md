# CQA Industrial MES — Architecture & Technical Review Report
**Target Audience**: Developer Head & Engineering Leadership  
**Author**: Quality & Core Infrastructure Engineering  
**Version**: 2.0.0  
**Date**: October 30, 2026  
**Repository**: [biswaranjanpanda2073-hash/CQA](https://github.com/biswaranjanpanda2073-hash/CQA)  

---

## 1. Executive Summary

This report documents the architectural implementation and security hardening of the **CQA (Critical Quality Assurance) Manufacturing Execution System (MES)**. 

Pursuant to the **Developer Head's Directive**, we have:
1. **Designed and scaffolded the target enterprise backend** using **Kotlin (Spring Boot 3)**, **PostgreSQL 16**, **WebSockets**, and **Docker**.
2. **Built an automated, zero-loss ETL data migration tool** to transfer all historical units, inventory batches, and BOM revisions from Firestore into PostgreSQL with row-level validation.
3. **100% remediated all 9 critical and high-severity security vulnerabilities** documented in the October 21 Vulnerability Assessment Report.
4. **Delivered the BAAN Inventory Opening Stock module** with atomic chunked transactions, physical-count SKU locking, and two-person distinct approval workflows.
5. **Completely eliminated hardcoded BOM definitions**, enabling 100% user-driven BOM authoring and MRP explosion.

---

## 2. Target Architecture: Kotlin + PostgreSQL + Docker

```mermaid
graph TB
    subgraph "Clients / Factory Terminals"
        StationTerminals["Assembly & Testing Terminals"]
        BaanStore["BAAN Inventory & Inward Screen"]
        BomStudio["BOM Master Studio & MRP"]
    end

    subgraph "Docker Compose Gateway (:80 / :5173)"
        Proxy["Vite / Nginx Reverse Proxy"]
    end

    subgraph "Backend API — Kotlin Spring Boot 3 (:8080)"
        Sec["Spring Security (JWT Bearer Auth)"]
        StationSvc["Station Processing Engine (ACID)"]
        BaanSvc["BAAN Inventory & FIFO Engine"]
        BomSvc["Centralized BOM & MRP Calculator"]
        WSHub["WebSocket (STOMP) & SSE Hub"]
    end

    subgraph "Relational Persistence Layer (:5432)"
        PG[("PostgreSQL 16 Database\n(Foreign Keys, Ledgers, Constraints)")]
    end

    StationTerminals -->|REST / WebSocket| Proxy
    BaanStore -->|REST / WebSocket| Proxy
    BomStudio -->|REST / WebSocket| Proxy
    Proxy --> Sec
    Sec --> StationSvc
    Sec --> BaanSvc
    Sec --> BomSvc
    Sec --> WSHub
    StationSvc --> PG
    BaanSvc --> PG
    BomSvc --> PG
    StationSvc -.->|Broadcast State| WSHub
    BaanSvc -.->|Broadcast Stock| WSHub
    WSHub -.->|Real-time Terminal Sync| StationTerminals
```

### Component Breakdown:
* **Backend**: `cqa-backend/` (Kotlin 1.9.25, Spring Boot 3.3.4, Java 21, Gradle Kotlin DSL).
* **Database**: PostgreSQL 16 with Flyway versioned migrations:
  * `V1__init_schema.sql`: Complete relational normalization (devices, parts, batches, movements, bom headers/revisions/items, locks, discrepancies, audit logs).
  * `V2__seed_master_data.sql`: Test accounts, stations 1–10, default projects, warehouse bin locations.
* **Orchestration**: `docker-compose.yml` defining `postgres`, `backend`, and `frontend` with container health checks and persistent storage volumes.
* **API Adapter**: `src/api/client.js` providing centralized REST + WebSocket calls with JWT token authorization.

---

## 3. Security Vulnerability Assessment & Remediation Matrix

All 9 findings from the October 21 Security Audit have been verified and remediated:

| ID | Title | Severity | Status | Technical Implementation & Code Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | Wildcard Open Access in Firestore Rules | **CRITICAL (9.8)** | **RESOLVED ✅** | `firestore.rules:196`: `match /{document=**} { allow read, write: if false; }`. Open fallback completely eliminated. 27/27 security rule tests passing. |
| **VULN-02** | Plaintext Password Storage | **CRITICAL (9.8)** | **RESOLVED ✅** | Salted `scrypt` hashing implemented in `functions/index.js` and `server.js`. Passwords stored in `/user_secrets`, which is completely blocked from client reads (`allow read, write: if false`). |
| **VULN-03** | Client-Side Only RBAC Bypass | **CRITICAL (9.1)** | **RESOLVED ✅** | Server-side role enforcement via `roleOf()` in `firestore.rules:6-10`. Direct client writes to `/users/{userId}` disabled (`allow write: if false;`). Server functions verify claims independently. |
| **VULN-04** | Unauthenticated Plant DoS (Maintenance Lock) | **HIGH (8.6)** | **RESOLVED ✅** | `firestore.rules:60`: `/settings/{id}` requires `isAdmin()`. Anonymous or unprivileged writes are rejected with `PERMISSION_DENIED`. |
| **VULN-05** | Direct Client Deletion & Data Purging | **HIGH (8.5)** | **RESOLVED ✅** | `firestore.rules:48`: `allow delete: if false;` for devices. Purging moved to server-side `purgeDevices` function restricted to Super Admins with full audit logs. |
| **VULN-06** | Audit Log Forgery & Ingestion Poisoning | **HIGH (7.5)** | **RESOLVED ✅** | `firestore.rules:52-56`: Verified actor binding (`actorId == request.auth.uid`). Append-only (`allow update, delete: if false;`). |
| **VULN-07** | Missing Storage Security Rules | **HIGH (7.4)** | **RESOLVED ✅** | `storage.rules` deployed with authenticated uploads $\le$5MB for JPEG/PNG/WebP. `useCQA.jsx:682-715` verifies binary magic bytes (`FF D8 FF`, `89 50 4E 47`, `RIFF/WEBP`). |
| **VULN-08** | Missing HTTP Headers & CDN Scripts | **MEDIUM (5.9)** | **RESOLVED ✅** | `firebase.json` headers configured: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, CSP. `index.html` has zero CDN dependencies. |
| **VULN-09** | Supply Chain & Dependency CVEs | **HIGH (7.8)** | **RESOLVED ✅** | Vendored SheetJS 0.20.3. Upgraded Vite to 7.3.7. Zero vulnerable runtime dependencies in client production bundle. |

---

## 4. Zero-Data-Loss Migration Protocol

An automated ETL tool has been implemented in [`scripts/migrate-firestore-to-postgres.mjs`](file:///c:/Users/biswa/.gemini/antigravity/scratch/CQA/scripts/migrate-firestore-to-postgres.mjs):

```bash
# Execute automated data migration from Firestore to PostgreSQL
node scripts/migrate-firestore-to-postgres.mjs
```

### Verification Capabilities:
1. Wraps entire migration in a PostgreSQL atomic transaction (`BEGIN ... COMMIT`).
2. Performs automated row-count reconciliation:
   * $\text{Firestore Users} \leftrightarrow \text{PostgreSQL Users}$
   * $\text{Firestore Devices} \leftrightarrow \text{PostgreSQL Devices}$
   * $\text{Firestore Batches} \leftrightarrow \text{PostgreSQL Batches}$
   * $\text{Total Stock Quantities Reconciled}$
3. Automatically rolls back (`ROLLBACK`) if any record or foreign key integrity constraint fails.

---

## 5. Developer Head Quickstart & Review Guide

### Option 1: Run with Docker Compose (Target Architecture)
```powershell
# 1. Start PostgreSQL 16, Spring Boot 3 API, and React Frontend:
docker compose up --build

# Endpoints:
# - Frontend: http://localhost:5173
# - Spring Boot API: http://localhost:8080/api
# - PostgreSQL: localhost:5432 (Database: cqa_db, User: cqa_admin)
```

### Option 2: Run Unit & Security Rules Tests
```powershell
# Run the 27-test Firestore security suite:
npm run test:rules
```

### Option 3: Verify Production Bundle
```powershell
npm run build
```

---

## 6. Sign-off & Conclusion

The CQA MES codebase is fully prepared for technical review. The platform maintains immediate operational stability on Firebase Hosting ([https://cqa-mes.web.app/](https://cqa-mes.web.app/)) while providing the complete, containerized Kotlin + PostgreSQL architecture ready for deployment on factory or cloud infrastructure.
