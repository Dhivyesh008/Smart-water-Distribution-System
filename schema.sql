CREATE DATABASE IF NOT EXISTS smart_water_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE smart_water_db;

CREATE TABLE IF NOT EXISTS users (
    email VARCHAR(254) NOT NULL PRIMARY KEY,
    username VARCHAR(80) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservoirs (
    reservoir_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    daily_supply INT UNSIGNED NOT NULL,
    remaining_supply INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS demand_areas (
    area_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    area_type ENUM('residential', 'critical_institution') NOT NULL,
    daily_demand INT UNSIGNED NOT NULL,
    priority ENUM('Normal', 'High', 'Critical') NOT NULL,
    allocated_water INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pipelines (
    pipeline_id VARCHAR(20) PRIMARY KEY,
    endpoint_from VARCHAR(20) NOT NULL,
    endpoint_to VARCHAR(20) NOT NULL,
    is_working TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pipeline_from (endpoint_from),
    INDEX idx_pipeline_to (endpoint_to)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS simulation_days (
    run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_state (
    state_key VARCHAR(40) PRIMARY KEY,
    active_run_id BIGINT UNSIGNED NOT NULL,
    CONSTRAINT fk_state_active_run
        FOREIGN KEY (active_run_id) REFERENCES simulation_days(run_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS water_requests (
    request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    area_id VARCHAR(20) NOT NULL,
    requested_litres INT UNSIGNED NOT NULL,
    status ENUM('pending', 'processed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_request_run
        FOREIGN KEY (run_id) REFERENCES simulation_days(run_id),
    CONSTRAINT fk_request_area
        FOREIGN KEY (area_id) REFERENCES demand_areas(area_id),
    INDEX idx_request_queue (run_id, status, request_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS allocation_history (
    allocation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    request_id BIGINT UNSIGNED NULL,
    area_id VARCHAR(20) NOT NULL,
    reservoir_id VARCHAR(20) NULL,
    allocated_litres INT UNSIGNED NOT NULL DEFAULT 0,
    result ENUM('allocated', 'demand_met', 'disconnected', 'no_supply') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_allocation_run
        FOREIGN KEY (run_id) REFERENCES simulation_days(run_id),
    CONSTRAINT fk_allocation_request
        FOREIGN KEY (request_id) REFERENCES water_requests(request_id)
        ON DELETE SET NULL,
    CONSTRAINT fk_allocation_area
        FOREIGN KEY (area_id) REFERENCES demand_areas(area_id),
    CONSTRAINT fk_allocation_reservoir
        FOREIGN KEY (reservoir_id) REFERENCES reservoirs(reservoir_id)
        ON DELETE SET NULL,
    INDEX idx_allocation_history (created_at, allocation_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS maintenance_requests (
    maintenance_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    pipeline_id VARCHAR(20) NOT NULL,
    issue VARCHAR(160) NOT NULL,
    status ENUM('open', 'completed') NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    CONSTRAINT fk_maintenance_pipeline
        FOREIGN KEY (pipeline_id) REFERENCES pipelines(pipeline_id),
    INDEX idx_maintenance_status (status, maintenance_id)
) ENGINE=InnoDB;

-- ============================================================
-- DEMAND FORECASTING: stores daily consumption per area per day
-- ============================================================

CREATE TABLE IF NOT EXISTS demand_daily_history (
    history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    area_id VARCHAR(20) NOT NULL,
    consumed_litres INT UNSIGNED NOT NULL DEFAULT 0,
    daily_demand INT UNSIGNED NOT NULL DEFAULT 0,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_history_run
        FOREIGN KEY (run_id) REFERENCES simulation_days(run_id),
    CONSTRAINT fk_history_area
        FOREIGN KEY (area_id) REFERENCES demand_areas(area_id),
    INDEX idx_history_area_time (area_id, recorded_at)
) ENGINE=InnoDB;

INSERT IGNORE INTO reservoirs
    (reservoir_id, name, daily_supply, remaining_supply)
VALUES
    ('R1', 'North Reservoir', 5000, 5000),
    ('R2', 'South Reservoir', 3000, 3000);

INSERT IGNORE INTO demand_areas
    (area_id, name, area_type, daily_demand, priority)
VALUES
    ('A1', 'Greenview Homes', 'residential', 1500, 'Normal'),
    ('A2', 'Lakeside Villas', 'residential', 2000, 'High'),
    ('A3', 'City Hospital', 'critical_institution', 3000, 'Critical'),
    ('A4', 'Rivergate Apartments', 'residential', 1800, 'Normal'),
    ('A5', 'Sunrise Colony', 'residential', 1200, 'High'),
    ('A6', 'Central Fire Station', 'critical_institution', 1800, 'Critical'),
    ('A7', 'Hillview Nagar', 'residential', 1400, 'Normal'),
    ('A8', 'Maple Residency', 'residential', 1600, 'High'),
    ('A9', 'Riverside Colony', 'residential', 1300, 'Normal'),
    ('A10', 'Green Park', 'residential', 1700, 'High');

INSERT IGNORE INTO pipelines
    (pipeline_id, endpoint_from, endpoint_to, is_working)
VALUES
    ('P1', 'R1', 'A1', 1),
    ('P2', 'R1', 'A2', 1),
    ('P3', 'R1', 'A3', 1),
    ('P4', 'A1', 'A4', 1),
    ('P5', 'A2', 'A5', 1),
    ('P6', 'A3', 'A6', 1),
    ('P7', 'A4', 'A7', 1),
    ('P8', 'A5', 'A8', 1),
    ('P9', 'A6', 'A9', 1),
    ('P10', 'A7', 'A10', 1),
    ('P11', 'R2', 'A6', 1),
    ('P12', 'R2', 'A8', 1),
    ('P13', 'A7', 'A8', 1),
    ('P14', 'A9', 'A10', 1),
    ('P15', 'A3', 'A8', 1);

INSERT IGNORE INTO simulation_days (run_id, started_at)
VALUES (1, CURRENT_TIMESTAMP);

INSERT IGNORE INTO system_state (state_key, active_run_id)
VALUES ('current_day', 1);
