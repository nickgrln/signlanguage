CREATE DATABASE IF NOT EXISTS sign_language_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sign_language_db;

CREATE TABLE IF NOT EXISTS users (
  u_id VARCHAR(128) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('Admin', 'Signer', 'Listener') NOT NULL DEFAULT 'Signer',
  total_signs INT UNSIGNED NOT NULL DEFAULT 0,
  total_sessions INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (u_id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gestures_catalog (
  gesture_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  gesture_label VARCHAR(32) NOT NULL,
  sample_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (gesture_id),
  UNIQUE KEY uq_gesture_label (gesture_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  sessions_id VARCHAR(128) NOT NULL,
  u_id VARCHAR(128) NOT NULL,
  started_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  signs_detected INT UNSIGNED NOT NULL DEFAULT 0,
  unique_signs INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (sessions_id),
  KEY idx_sessions_user_started (u_id, started_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (u_id) REFERENCES users (u_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS history (
  history_id VARCHAR(128) NOT NULL,
  u_id VARCHAR(128) NOT NULL,
  sessions_id VARCHAR(128) NOT NULL,
  sign VARCHAR(32) NOT NULL,
  confidence DECIMAL(5,2) NOT NULL,
  detected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (history_id),
  KEY idx_history_user (u_id),
  KEY idx_history_session (sessions_id),
  KEY idx_history_detected_at (detected_at),
  KEY idx_history_debounce (u_id, sessions_id, sign, detected_at),
  CONSTRAINT chk_history_confidence CHECK (confidence >= 0 AND confidence <= 100),
  CONSTRAINT fk_history_user FOREIGN KEY (u_id) REFERENCES users (u_id) ON DELETE CASCADE,
  CONSTRAINT fk_history_session FOREIGN KEY (sessions_id) REFERENCES sessions (sessions_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  report_id VARCHAR(128) NOT NULL,
  u_id VARCHAR(128) NOT NULL,
  sign VARCHAR(32) NOT NULL,
  `count` INT UNSIGNED NOT NULL DEFAULT 0,
  total_confidence DECIMAL(12,2) NOT NULL DEFAULT 0,
  avg_confidence DECIMAL(5,2) NOT NULL DEFAULT 0,
  first_seen DATETIME(3) NOT NULL,
  last_seen DATETIME(3) NOT NULL,
  PRIMARY KEY (report_id),
  UNIQUE KEY uq_reports_user_sign (u_id, sign),
  KEY idx_reports_user_sign (u_id, sign),
  CONSTRAINT chk_reports_avg_confidence CHECK (avg_confidence >= 0 AND avg_confidence <= 100),
  CONSTRAINT fk_reports_user FOREIGN KEY (u_id) REFERENCES users (u_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER //
DROP TRIGGER IF EXISTS history_after_insert//
CREATE TRIGGER history_after_insert
AFTER INSERT ON history
FOR EACH ROW
BEGIN
  INSERT INTO reports (report_id, u_id, sign, `count`, total_confidence, avg_confidence, first_seen, last_seen)
  VALUES (CONCAT(NEW.u_id, '_', NEW.sign), NEW.u_id, NEW.sign, 1, NEW.confidence, NEW.confidence, NEW.detected_at, NEW.detected_at)
  ON DUPLICATE KEY UPDATE
    `count` = `count` + 1,
    total_confidence = total_confidence + NEW.confidence,
    avg_confidence = ROUND((total_confidence + NEW.confidence) / (`count` + 1), 2),
    last_seen = GREATEST(last_seen, NEW.detected_at);

  UPDATE users SET total_signs = total_signs + 1 WHERE u_id = NEW.u_id;
  UPDATE sessions s
  SET signs_detected = signs_detected + 1,
      unique_signs = (
        SELECT COUNT(DISTINCT h.sign)
        FROM history h
        WHERE h.sessions_id = NEW.sessions_id
      )
  WHERE s.sessions_id = NEW.sessions_id;
END//
DELIMITER ;

CREATE OR REPLACE VIEW session_summary AS
SELECT s.sessions_id, s.u_id, u.name, s.started_at, s.ended_at,
       s.signs_detected, s.unique_signs
FROM sessions s
JOIN users u ON u.u_id = s.u_id;
