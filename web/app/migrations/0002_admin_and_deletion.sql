ALTER TABLE user ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rocket ADD COLUMN deleted_at INTEGER;
CREATE TABLE app_admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE RESTRICT,
  credential_version INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1))
);
-- One-time bootstrap: public signup cannot create the reserved admin username.
INSERT INTO user(id, name, email, email_verified, created_at, updated_at, username, display_username)
VALUES ('00000000-0000-4000-8000-0000000000ad', 'Administrator', 'admin@openrocket.invalid', 0, unixepoch() * 1000, unixepoch() * 1000, 'admin', 'admin');
INSERT INTO account(id, account_id, provider_id, user_id, password, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000ad', 'credential', '00000000-0000-4000-8000-0000000000ad', 'a6001e6345f02ba64c0b3ddaf4e4b699:10fe124a05ec3bc4d2f097d0c0f737933c786cd298ac3f913397a0d32fa4dc6717109d3a9e6943fc89a4a9d62dd0ca0522919341abe38649e36c31926dbf1203', unixepoch() * 1000, unixepoch() * 1000);
INSERT INTO app_admin(id, user_id, must_change_password) VALUES (1, '00000000-0000-4000-8000-0000000000ad', 1);
