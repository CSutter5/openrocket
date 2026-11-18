-- Test-only remote harness lock. Consumed before any setup work, so failed setup
-- requires cleanup and a fresh isolated namespace rather than repeating secrets.
CREATE TABLE proof_remote_setup (id INTEGER PRIMARY KEY CHECK (id = 1));
