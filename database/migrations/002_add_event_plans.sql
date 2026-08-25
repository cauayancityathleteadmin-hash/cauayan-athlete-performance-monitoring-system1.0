-- Upcoming city sports event plans. Run after schema.sql.
CREATE TABLE IF NOT EXISTS event_plans (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(191) NOT NULL,
    description TEXT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    venue VARCHAR(191) NOT NULL,
    status ENUM('draft','open','closed','cancelled') NOT NULL DEFAULT 'draft',
    program_flow TEXT NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_event_plans_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_plan_sports (
    event_plan_id INT UNSIGNED NOT NULL,
    sport_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (event_plan_id, sport_id),
    CONSTRAINT fk_eps_plan FOREIGN KEY (event_plan_id) REFERENCES event_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_eps_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_applications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_plan_id INT UNSIGNED NOT NULL,
    coach_id INT UNSIGNED NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reason VARCHAR(500) NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT UNSIGNED NULL,
    UNIQUE KEY uq_event_coach_application (event_plan_id, coach_id),
    CONSTRAINT fk_ea_plan FOREIGN KEY (event_plan_id) REFERENCES event_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_ea_coach FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE,
    CONSTRAINT fk_ea_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_participants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_plan_id INT UNSIGNED NOT NULL,
    coach_id INT UNSIGNED NOT NULL,
    athlete_id INT UNSIGNED NULL,
    sport_id INT UNSIGNED NOT NULL,
    participant_type ENUM('coach','athlete') NOT NULL,
    status ENUM('active','removed') NOT NULL DEFAULT 'active',
    added_by INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_event_participant (event_plan_id, coach_id, athlete_id, sport_id),
    CONSTRAINT fk_ep_plan FOREIGN KEY (event_plan_id) REFERENCES event_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_ep_coach FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE,
    CONSTRAINT fk_ep_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
    CONSTRAINT fk_ep_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE,
    CONSTRAINT fk_ep_user FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE athletes MODIFY event_id INT UNSIGNED NULL;

-- Legacy performance events remain available to metrics; athlete records no longer
-- need an event assignment.