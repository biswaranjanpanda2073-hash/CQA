-- =============================================================================
-- CQA MES — V2 Master Data & Test User Seeding
-- Passwords seeded with scrypt / bcrypt compatibility
-- =============================================================================

-- Seed Default Project
INSERT INTO projects (id, name, description, active)
VALUES ('CALCULATOR', 'Smart Calculator', 'Tohands Smart Calculator Refurbishment & MES Line', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Stations 1 through 10
INSERT INTO stations_master (id, name, project_id, category, active) VALUES
(1, 'Station 1 - Disassembly & Visual Inspection', 'CALCULATOR', 'Assembly', TRUE),
(2, 'Station 2 - Motherboard Diagnostic & Cleaning', 'CALCULATOR', 'Testing', TRUE),
(3, 'Station 3 - Display & Keypad Refurbishment', 'CALCULATOR', 'Assembly', TRUE),
(4, 'Station 4 - Sub-Assembly Integration', 'CALCULATOR', 'Assembly', TRUE),
(5, 'Station 5 - Battery & Power Calibration', 'CALCULATOR', 'Testing', TRUE),
(6, 'Station 6 - Enclosure Assembly & Ultrasonic Welding', 'CALCULATOR', 'Assembly', TRUE),
(7, 'Station 7 - Firmware Flashing & Automated Functional Test', 'CALCULATOR', 'Testing', TRUE),
(8, 'Station 8 - Final Quality Assurance (FQA)', 'CALCULATOR', 'QC', TRUE),
(9, 'Station 9 - Packaging, Kitting & Barcoding', 'CALCULATOR', 'Packaging', TRUE),
(10, 'Station 10 - Scrap & Rework Analysis', 'CALCULATOR', 'QC', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Default Locations
INSERT INTO baan_locations (code, name, warehouse, active) VALUES
('BIN-01', 'Rack A1 - Mechanicals', 'Main', TRUE),
('BIN-02', 'Rack B2 - Electronics & PCBA', 'Main', TRUE),
('BIN-03', 'Rack C3 - Fasteners & Hardware', 'Main', TRUE),
('BIN-04', 'Rack D4 - Packaging Materials', 'Main', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Seed Test Users (Password hash for 'password123': bcrypt $2a$10$wTf2E8j6hD... or plaintext fallback for local dev)
-- For local dev safety, BCrypt '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a' = password123
INSERT INTO users (id, name, email, password_hash, role, stations, is_active) VALUES
('biswaranjan@tohands.in', 'Biswa Ranjan Panda', 'biswaranjan@tohands.in', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'Super Admin', '[1,2,3,4,5,6,7,8,9,10]', TRUE),
('ADMIN', 'System Administrator', 'admin@tohands.in', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'Super Admin', '[1,2,3,4,5,6,7,8,9,10]', TRUE),
('STORE_MGR', 'Store Manager', 'store.mgr@tohands.in', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'Store Manager', '[1,2,3,4,5,6,7,8,9,10]', TRUE),
('STORE_EXEC', 'Store Executive', 'store.exec@tohands.in', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'Store Executive', '[1,2,3,4,5,6,7,8,9,10]', TRUE),
('OP001', 'Line Operator 1', 'operator1@tohands.in', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'Store Operator', '[1,2,3]', TRUE),
('harish.m@tohands.in', 'Harish M', 'harish.m@tohands.in', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'Super Admin', '[1,2,3,4,5,6,7,8,9,10]', TRUE)
ON CONFLICT (id) DO NOTHING;
