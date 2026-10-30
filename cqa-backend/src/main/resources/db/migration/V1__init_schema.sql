-- =============================================================================
-- CQA MES — V1 Initial PostgreSQL Schema
-- Replaces Firestore NoSQL with Relational Schema & ACID Constraints
-- =============================================================================

-- 1. Master & Authentication
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(128) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(64),
    role VARCHAR(64) NOT NULL,
    stations JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stations_master (
    id INT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    project_id VARCHAR(64) REFERENCES projects(id) ON DELETE SET NULL,
    category VARCHAR(64),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. Device Lifecycle & Station History (MES Core)
CREATE TABLE IF NOT EXISTS devices (
    serial_number VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) REFERENCES projects(id) ON DELETE SET NULL,
    current_station_id INT REFERENCES stations_master(id) ON DELETE SET NULL,
    station_name VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'In Progress',
    stage VARCHAR(64) NOT NULL DEFAULT 'Station 1',
    fail_count INT NOT NULL DEFAULT 0,
    is_held BOOLEAN NOT NULL DEFAULT FALSE,
    hold_reason TEXT,
    last_operator_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    test_records JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_project_station ON devices (project_id, current_station_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);

CREATE TABLE IF NOT EXISTS device_station_history (
    id BIGSERIAL PRIMARY KEY,
    serial_number VARCHAR(64) NOT NULL REFERENCES devices(serial_number) ON DELETE CASCADE,
    station_id INT NOT NULL,
    station_name VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    operator_name VARCHAR(128),
    status VARCHAR(64) NOT NULL,
    remarks TEXT,
    test_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_history_serial ON device_station_history (serial_number);

-- 3. BAAN Inventory Management & Batch Tracking
CREATE TABLE IF NOT EXISTS baan_parts (
    part_number VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(64) NOT NULL,
    uom VARCHAR(16) NOT NULL DEFAULT 'Nos',
    min_stock_level NUMERIC(12, 3) DEFAULT 0,
    last_inward TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS baan_locations (
    code VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    warehouse VARCHAR(64) DEFAULT 'Main',
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS baan_batches (
    id VARCHAR(64) PRIMARY KEY,
    batch_number VARCHAR(64) NOT NULL,
    part_number VARCHAR(64) NOT NULL REFERENCES baan_parts(part_number) ON DELETE CASCADE,
    initial_quantity NUMERIC(12, 3) NOT NULL,
    quantity_available NUMERIC(12, 3) NOT NULL CHECK (quantity_available >= 0),
    location_code VARCHAR(64) REFERENCES baan_locations(code) ON DELETE SET NULL,
    location_name VARCHAR(128),
    per_unit_cost NUMERIC(12, 4) DEFAULT 0,
    inward_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'Active'
);

CREATE INDEX IF NOT EXISTS idx_batches_part_avail ON baan_batches (part_number, quantity_available);

CREATE TABLE IF NOT EXISTS baan_inventory_movements (
    id VARCHAR(64) PRIMARY KEY,
    movement_type VARCHAR(32) NOT NULL,
    part_number VARCHAR(64) NOT NULL REFERENCES baan_parts(part_number) ON DELETE CASCADE,
    batch_id VARCHAR(64) REFERENCES baan_batches(id) ON DELETE SET NULL,
    location_code VARCHAR(64),
    location_name VARCHAR(128),
    quantity NUMERIC(12, 3) NOT NULL,
    per_unit_cost NUMERIC(12, 4) DEFAULT 0,
    reference VARCHAR(128),
    session_id VARCHAR(64),
    user_name VARCHAR(128) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movements_part_time ON baan_inventory_movements (part_number, timestamp DESC);

CREATE TABLE IF NOT EXISTS baan_requests (
    id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL,
    station_id INT NOT NULL,
    part_number VARCHAR(64) NOT NULL REFERENCES baan_parts(part_number) ON DELETE CASCADE,
    quantity NUMERIC(12, 3) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    requested_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    fulfilled_by VARCHAR(128)
);

CREATE TABLE IF NOT EXISTS baan_issuances (
    id VARCHAR(64) PRIMARY KEY,
    issuance_id VARCHAR(64) NOT NULL,
    request_id VARCHAR(64) REFERENCES baan_requests(id) ON DELETE SET NULL,
    batch_id VARCHAR(64) REFERENCES baan_batches(id) ON DELETE SET NULL,
    part_number VARCHAR(64) NOT NULL REFERENCES baan_parts(part_number) ON DELETE CASCADE,
    quantity NUMERIC(12, 3) NOT NULL,
    issued_to VARCHAR(128) NOT NULL,
    issued_by VARCHAR(128) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Centralized BOM Management (Headers, Revisions, Items)
CREATE TABLE IF NOT EXISTS bom_headers (
    variant_id VARCHAR(64) PRIMARY KEY,
    variant_name VARCHAR(128) NOT NULL,
    category VARCHAR(64) DEFAULT 'CALCULATOR',
    active_revision VARCHAR(32) NOT NULL DEFAULT 'REV-01',
    description TEXT,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bom_revisions (
    id VARCHAR(64) PRIMARY KEY,
    variant_id VARCHAR(64) NOT NULL REFERENCES bom_headers(variant_id) ON DELETE CASCADE,
    revision VARCHAR(32) NOT NULL,
    change_notes TEXT,
    is_locked BOOLEAN NOT NULL DEFAULT TRUE,
    item_count INT NOT NULL DEFAULT 0,
    uploaded_by VARCHAR(64) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (variant_id, revision)
);

CREATE TABLE IF NOT EXISTS bom_items (
    id BIGSERIAL PRIMARY KEY,
    revision_id VARCHAR(64) NOT NULL REFERENCES bom_revisions(id) ON DELETE CASCADE,
    sr_no INT NOT NULL,
    part_number VARCHAR(64) NOT NULL REFERENCES baan_parts(part_number) ON DELETE CASCADE,
    part_name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    qty_per_unit NUMERIC(10, 4) NOT NULL DEFAULT 1,
    uom VARCHAR(16) NOT NULL DEFAULT 'Nos',
    process_stage VARCHAR(64),
    station_id INT,
    remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_bom_items_revision ON bom_items (revision_id);

-- 5. Inventory SKU Locks & Discrepancy Workflows
CREATE TABLE IF NOT EXISTS baan_inventory_locks (
    sku VARCHAR(64) PRIMARY KEY REFERENCES baan_parts(part_number) ON DELETE CASCADE,
    locked_by_uid VARCHAR(64) NOT NULL,
    locked_by_name VARCHAR(128) NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    fencing_token BIGINT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS baan_inventory_discrepancies (
    ticket_id VARCHAR(64) PRIMARY KEY,
    sku VARCHAR(64) NOT NULL REFERENCES baan_parts(part_number) ON DELETE CASCADE,
    part_name VARCHAR(255) NOT NULL,
    system_stock NUMERIC(12, 3) NOT NULL,
    physical_count NUMERIC(12, 3) NOT NULL,
    delta NUMERIC(12, 3) NOT NULL,
    reason TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_FIRST_APPROVAL',
    created_by VARCHAR(64) NOT NULL,
    first_approver_uid VARCHAR(64),
    first_approver_name VARCHAR(128),
    first_approved_at TIMESTAMP WITH TIME ZONE,
    second_approver_uid VARCHAR(64),
    second_approver_name VARCHAR(128),
    second_approved_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_distinct_approvers CHECK (
        first_approver_uid IS NULL OR 
        second_approver_uid IS NULL OR 
        first_approver_uid <> second_approver_uid
    )
);

-- 6. Audit Trail & Rework Tickets
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    actor_id VARCHAR(64) NOT NULL,
    actor_name VARCHAR(128),
    actor_role VARCHAR(64),
    action VARCHAR(64) NOT NULL,
    entity VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64),
    reason TEXT,
    remarks TEXT,
    client_ip VARCHAR(64),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs (timestamp DESC);

CREATE TABLE IF NOT EXISTS tickets (
    id VARCHAR(64) PRIMARY KEY,
    serial_number VARCHAR(64) REFERENCES devices(serial_number) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'Pending',
    priority VARCHAR(32) NOT NULL DEFAULT 'Medium',
    created_by VARCHAR(64) NOT NULL,
    assigned_to VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
