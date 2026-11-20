-- Preserve existing public visibility and URLs; new rockets are restricted.
CREATE TABLE rocket_shared (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  route_username TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('public', 'restricted')),
  public_download INTEGER NOT NULL DEFAULT 0 CHECK (public_download IN (0, 1)),
  sharing_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE(route_username, slug)
);
INSERT INTO rocket_shared(id, owner_id, name, slug, created_at, deleted_at, route_username, visibility, public_download)
SELECT rocket.id, owner_id, rocket.name, slug, rocket.created_at, deleted_at, user.username, 'public', 1 FROM rocket JOIN user ON user.id=rocket.owner_id;
DROP TABLE rocket;
ALTER TABLE rocket_shared RENAME TO rocket;
CREATE INDEX rocket_owner_id_idx ON rocket(owner_id);
CREATE TABLE rocket_member (
  rocket_id TEXT NOT NULL REFERENCES rocket(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  can_download INTEGER NOT NULL CHECK (can_download IN (0, 1)),
  PRIMARY KEY (rocket_id, user_id)
);
CREATE INDEX rocket_member_user_idx ON rocket_member(user_id);
-- Serialize ownership transfer against the administrator marking a user deleted.
CREATE TRIGGER rocket_owner_available BEFORE UPDATE OF owner_id ON rocket
WHEN NOT EXISTS (SELECT 1 FROM user WHERE id=NEW.owner_id AND deleting=0)
BEGIN SELECT RAISE(ABORT, 'New owner is unavailable'); END;
