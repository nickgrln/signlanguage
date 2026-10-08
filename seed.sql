USE sign_language_db;

INSERT INTO gestures_catalog (gesture_label, sample_count) VALUES
('A', 0), ('B', 0), ('C', 0), ('D', 0), ('E', 0), ('F', 0), ('G', 0),
('H', 0), ('I', 0), ('J', 0), ('K', 0), ('L', 0), ('M', 0), ('N', 0),
('O', 0), ('P', 0), ('Q', 0), ('R', 0), ('S', 0), ('T', 0), ('U', 0),
('V', 0), ('W', 0), ('X', 0), ('Y', 0), ('Z', 0), ('HELLO', 0),
('THANK YOU', 0), ('YES', 0), ('NO', 0), ('PLEASE', 0)
ON DUPLICATE KEY UPDATE gesture_label = VALUES(gesture_label);

-- Demo accounts use unusable passwords by design. Create real accounts through the registration screen.
INSERT INTO users (u_id, name, email, password, role) VALUES
('demo-admin', 'Demo Administrator', 'admin@example.test', '!disabled-demo-account', 'Admin'),
('demo-signer', 'Demo Signer', 'signer@example.test', '!disabled-demo-account', 'Signer'),
('demo-listener', 'Demo Listener', 'listener@example.test', '!disabled-demo-account', 'Listener')
ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role);

INSERT INTO sessions (sessions_id, u_id, started_at, ended_at, signs_detected, unique_signs) VALUES
('demo-session-001', 'demo-signer', '2026-01-15 09:00:00.000', '2026-01-15 09:02:00.000', 2, 2)
ON DUPLICATE KEY UPDATE ended_at = VALUES(ended_at), signs_detected = VALUES(signs_detected);

INSERT INTO history (history_id, u_id, sessions_id, sign, confidence, detected_at) VALUES
('demo-history-001', 'demo-signer', 'demo-session-001', 'HELLO', 92.50, '2026-01-15 09:00:15.000'),
('demo-history-002', 'demo-signer', 'demo-session-001', 'THANK YOU', 88.00, '2026-01-15 09:01:03.000')
ON DUPLICATE KEY UPDATE confidence = VALUES(confidence);
