# CQA - Critical Quality Assurance Web Application
## Design & Functional Specification Document

### 1. Project Overview
**CQA (Critical Quality Assurance)** is a specialized Manufacturing Execution System (MES) designed to track, manage, and optimize the lifecycle of devices and peripherals within a production or refurbishment facility. The application ensures rigorous quality control through station-based sequencing, real-time analytics, and detailed traceability.

---

### 2. Functional Specification

#### 2.1 User Roles & Authentication
*   **Standard Operator:** Can access assigned stations and perform data entry.
*   **Administrator:** Full access to all sections, including "SCRAP REVIEW" and "REJECTION REVIEW" stations, and user management.
*   **System Actions:** Log out functionality available across all roles.

#### 2.2 Stations Section
The core of the application where units are processed. Divided into two major projects:

| Project: **Device** | Project: **Peripherals** |
| :--- | :--- |
| 1. RECEIVING | 1. RECEIVING |
| 2. INSPECTION | 2. QC |
| 3. DEBUG | 3. MOVE TO FG |
| 4. REWORK | 4. REJECTION REVIEW (Admin Only) |
| 5. FINAL QC | |
| 6. PACKING | |
| 7. MOVE TO FG | |
| 8. SCRAP REVIEW (Admin Only) | |

#### 2.3 Info Centre (Read-Only Traceability)
A comprehensive search and reporting module for full unit history.
*   **Search Filters:** Device ID, Status (Current), Date Range, Looper.
*   **Data Points Displayed:**
    *   Lifetime Loopers (Number of times a unit has cycled through stations).
    *   Current Status & Station Timeline (Historical flow).
    *   Scrap/Rejection history with reasons.
    *   Defects logged and Replacements (Part level tracking).
    *   Admin Overrides (Logged changes by authorized personnel).
    *   Operators involved and precise Timestamps for every action.

#### 2.4 Dashboard (Real-Time Analytics)
*   **Top Metric Row:** Filterable by project (**Device** or **Peripherals**).
    *   Total Input | WIP (Work in Progress) | FG (Finished Goods) | Scrap/Rejection.
*   **Recent Activities:** A live feed showing Device ID, Model, Current Station, Last Updated User, and Aging (Time since last update).
*   **WIP Monitoring (Right Panel):** A breakdown of WIP counts per station.
*   **Key Features:** 
    *   30-second Auto-refresh.
    *   Export Report button (CSV/Excel).

---

### 3. UI/UX Design & Wireframes

#### 3.1 Design Philosophy
*   **Modern Aesthetics:** Deep navy/dark theme for Dashboard; clean, high-contrast light theme for Stations to reduce operator fatigue.
*   **Responsiveness:** Fluid grid layouts that adapt from desktop monitors to tablets.
*   **Micro-animations:** Subtle transitions when switching stations or updating data.

#### 3.2 Wireframe Layout
*   **Sidebar:** Permanent navigation (Stations, Info Centre, Dashboard, User Control).
*   **Main Header:** Contextual info (Selected Project, User Profile, Global Search).
*   **Content Area:** Dynamic loading of modules.

---

### 4. Technical Architecture & Scalability

#### 4.1 Tech Stack (Proposed)
*   **Frontend:** React.js / Next.js for a robust, component-based UI.
*   **Styling:** Modern CSS (Flexbox/Grid) with Variables/Tokens for themes.
*   **Backend:** Node.js with a scalable API layer.
*   **Database:** PostgreSQL (Relational) for complex traceability or MongoDB (NoSQL) for flexible device attributes.

#### 4.2 Scalability Plan
*   **Modular Station Logic:** New stations can be added via configuration without changing core code.
*   **Audit Logging:** Middleware-level logging to ensure every write operation is captured for the Info Centre.
*   **Caching:** Redis implementation for the Dashboard metrics to handle high-frequency auto-refreshes.

---

### 5. Prototype Description
The prototype will feature a functional Dashboard with mock data demonstrating the auto-refresh and filter capabilities. The Stations module will allow users to "process" a mock device ID through the defined sequence, validating role permissions for Admin-only reviews.

---
*Created by Antigravity Design Team*
