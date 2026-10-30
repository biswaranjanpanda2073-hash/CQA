# CQA Industrial MES (Manufacturing Execution System)

[![Production Build](https://img.shields.io/badge/Build-Passing-brightgreen)]()
[![Security Audit](https://img.shields.io/badge/Security_Audit-Remediated_(9%2F9)-blue)]()
[![Backend](https://img.shields.io/badge/Backend-Kotlin_Spring_Boot_3-purple)]()
[![Database](https://img.shields.io/badge/Database-PostgreSQL_16-blue)]()
[![Frontend](https://img.shields.io/badge/Frontend-React_19_+_Vite-cyan)]()
[![Deployment](https://img.shields.io/badge/Deployment-Docker_Compose-blue)]()

---

## 📌 Executive Overview

**CQA MES** is a high-reliability Manufacturing Execution System designed for hardware assembly, testing, quality assurance, serialization governance, and ERP spare-parts inventory tracking (BAAN module) at Tohands.

### **Key Technical Capabilities:**
1. **Target Architecture (Developer Head Specification)**:
   * **Backend**: Kotlin 1.9+ with Spring Boot 3.3.4 (`cqa-backend/`).
   * **Persistence**: PostgreSQL 16 with Flyway versioned migrations (`V1`, `V2`).
   * **Real-time Engine**: WebSockets (STOMP) & Server-Sent Events (SSE) for multi-terminal sync.
   * **Local Environment**: One-command setup via `docker-compose.yml`.
   * **Automated Data Migration**: Zero-data-loss ETL script (`scripts/migrate-firestore-to-postgres.mjs`).

2. **Security & Governance Hardening**:
   * 100% remediation of all 9 findings from the October 21 Security Audit (CVSS 9.8 $\rightarrow$ fully secured).
   * 27 passing automated security rule tests (`npm run test:rules`).
   * Two-person distinct approver verification for inventory discrepancies.
   * Fenced SKU locking for active physical stock count sessions.

3. **BAAN Inventory & Dynamic BOM Engine**:
   * 3-step physical count wizard with live reconciliation against batch quantities.
   * Atomic chunked transactions (15 items/commit) preventing timeouts.
   * 100% user-driven dynamic BOM creation and multi-level MRP explosion.

---

## 🚀 Quick Start Guide

### **Method 1: Run with Docker Compose (Recommended)**
```bash
# Start PostgreSQL 16, Spring Boot 3 Backend, and React Frontend:
docker compose up --build
```
* **Frontend Application**: `http://localhost:5173`
* **Spring Boot API**: `http://localhost:8080/api`
* **PostgreSQL Database**: `localhost:5432` (`cqa_db`, `cqa_admin`)

### **Method 2: Run Automated Firestore $\rightarrow$ PostgreSQL ETL Migration**
```bash
node scripts/migrate-firestore-to-postgres.mjs
```

### **Method 3: Local Dev with Firebase Emulators**
```bash
npm install
npm run emulators
npm run dev
```

---

## 🧪 Testing & Verification

```bash
# 1. Run Security Rules Test Suite (27 tests):
npm run test:rules

# 2. Build Production Bundle:
npm run build
```

---

## 📑 Technical Documentation Links

* 📄 **[Developer Head Architecture & Review Report](docs/DEVELOPER_HEAD_ARCHITECTURE_AND_REVIEW_REPORT.md)**
* 📄 **[Backend Migration Blueprint & Schema](cqa_backend_migration_blueprint.md)**
* 📄 **[Security Runbook & Hardening Specification](docs/SECURITY_RUNBOOK.md)**
* 📄 **[BOM & MRP Module Reviewer Report](docs/BOM_MANAGEMENT_MODULE_REVIEWER_REPORT.md)**

---

## 👥 Default Test Accounts (Local / Sandbox)

| Role | Username / ID | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `biswaranjan@tohands.in` | `password123` | Full MES, Governance, BOM Studio, & BAAN Access |
| **Store Manager** | `STORE_MGR` | `password123` | BAAN Store, Opening Stock, Inward, Returns, Issuances |
| **Store Executive** | `STORE_EXEC` | `password123` | Inward Parts, Physical Count Entry |
| **Line Operator** | `OP001` | `password123` | Stations 1, 2, 3 Assembly & Testing |
