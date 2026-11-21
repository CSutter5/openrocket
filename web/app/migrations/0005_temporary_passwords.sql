ALTER TABLE user ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));
-- Preserve unfinished administrator setup when upgrading existing installations.
UPDATE user SET must_change_password = (SELECT must_change_password FROM app_admin WHERE user_id=user.id)
WHERE id IN (SELECT user_id FROM app_admin);
