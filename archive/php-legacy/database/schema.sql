-- Performance Monitoring System Schema
-- Cauayan City Athletes Performance Monitoring System Schema
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NULL UNIQUE,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin','coach') NOT NULL,
    status ENUM('pending','active','inactive','rejected') NOT NULL DEFAULT 'pending',
    last_login_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schools (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    school_name VARCHAR(191) NOT NULL UNIQUE,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coaches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    coach_code VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(20) NULL,
    birthdate DATE NOT NULL,
    email VARCHAR(191) NOT NULL,
    school_id INT UNSIGNED NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    date_registered DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_coaches_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_coaches_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sports (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sport_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sport_id INT UNSIGNED NOT NULL,
    event_name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sport_event (sport_id, event_name),
    CONSTRAINT fk_events_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coach_sports (
    coach_id INT UNSIGNED NOT NULL,
    sport_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (coach_id, sport_id),
    CONSTRAINT fk_cs_coach FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_cs_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS athletes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    athlete_code VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(20) NULL,
    birthdate DATE NOT NULL,
    gender ENUM('male','female','other','prefer_not_to_say') NOT NULL,
    contact_number VARCHAR(30) NULL,
    email VARCHAR(191) NULL,
    address TEXT NULL,
    school_id INT UNSIGNED NULL,
    sport_id INT UNSIGNED NOT NULL,
    event_id INT UNSIGNED NOT NULL,
    coach_id INT UNSIGNED NOT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    date_registered DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_athletes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL,
    CONSTRAINT fk_athletes_sport FOREIGN KEY (sport_id) REFERENCES sports(id),
    CONSTRAINT fk_athletes_event FOREIGN KEY (event_id) REFERENCES events(id),
    CONSTRAINT fk_athletes_coach FOREIGN KEY (coach_id) REFERENCES coaches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS athlete_coach_history (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    athlete_id INT UNSIGNED NOT NULL,
    coach_id INT UNSIGNED NOT NULL,
    assigned_by INT UNSIGNED NULL,
    reason VARCHAR(255) NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    CONSTRAINT fk_ach_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
    CONSTRAINT fk_ach_coach FOREIGN KEY (coach_id) REFERENCES coaches(id),
    CONSTRAINT fk_ach_user FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS athlete_status_history (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    athlete_id INT UNSIGNED NOT NULL,
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NOT NULL,
    changed_by INT UNSIGNED NULL,
    reason VARCHAR(255) NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ash_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
    CONSTRAINT fk_ash_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS performance_metrics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id INT UNSIGNED NOT NULL,
    metric_name VARCHAR(150) NOT NULL,
    unit VARCHAR(50) NULL,
    data_type ENUM('decimal','integer','text') NOT NULL DEFAULT 'decimal',
    better_direction ENUM('higher','lower','neutral') NOT NULL DEFAULT 'neutral',
    decimal_places TINYINT UNSIGNED NOT NULL DEFAULT 2,
    minimum_value DECIMAL(12,4) NULL,
    maximum_value DECIMAL(12,4) NULL,
    is_required TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_event_metric (event_id, metric_name),
    CONSTRAINT fk_pm_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    athlete_id INT UNSIGNED NOT NULL,
    recorded_by INT UNSIGNED NOT NULL,
    assessment_date DATE NOT NULL,
    assessment_type VARCHAR(100) NOT NULL DEFAULT 'Regular Assessment',
    remarks TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ass_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
    CONSTRAINT fk_ass_user FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_results (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    assessment_id INT UNSIGNED NOT NULL,
    metric_id INT UNSIGNED NOT NULL,
    value_decimal DECIMAL(12,4) NULL,
    value_text VARCHAR(255) NULL,
    notes VARCHAR(255) NULL,
    CONSTRAINT fk_ar_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
    CONSTRAINT fk_ar_metric FOREIGN KEY (metric_id) REFERENCES performance_metrics(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS achievements (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    athlete_id INT UNSIGNED NOT NULL,
    achievement_title VARCHAR(191) NOT NULL,
    achievement_type VARCHAR(100) NULL,
    achievement_date DATE NULL,
    organization VARCHAR(191) NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_achv_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NULL,
    entity_id INT UNSIGNED NULL,
    description TEXT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Seed sample data
INSERT INTO schools (school_name) VALUES
('Cauayan City National High School'),
('Isabela National High School'),
('University of Cagayan Valley - Cauayan');

INSERT INTO sports (sport_name, description) VALUES
('Athletics', 'Track and field events'),
('Swimming', 'Aquatic sports'),
('Basketball', 'Team basketball'),
('Volleyball', 'Indoor and beach volleyball');

INSERT INTO events (sport_id, event_name) VALUES
(1, '100m Sprint'),
(1, 'Long Jump'),
(1, 'Shot Put'),
(2, '50m Freestyle'),
(2, '100m Backstroke'),
(3, '5x5 Basketball'),
(4, 'Indoor Volleyball');

INSERT INTO performance_metrics (event_id, metric_name, unit, data_type, better_direction, decimal_places, is_required) VALUES
(1, 'Time', 'seconds', 'decimal', 'lower', 2, 1),
(1, 'Reaction Time', 'seconds', 'decimal', 'lower', 3, 0),
(2, 'Distance', 'meters', 'decimal', 'higher', 2, 1),
(3, 'Distance', 'meters', 'decimal', 'higher', 2, 1),
(4, 'Time', 'seconds', 'decimal', 'lower', 2, 1),
(5, 'Time', 'seconds', 'decimal', 'lower', 2, 1);
