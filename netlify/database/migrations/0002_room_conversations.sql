CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_hash TEXT NOT NULL, sender_name TEXT NOT NULL, message TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_room_time ON chat_messages(room_id,created_at);
CREATE INDEX IF NOT EXISTS idx_chat_sender_time ON chat_messages(sender_hash,created_at);
CREATE TABLE IF NOT EXISTS voice_peers (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  member_hash TEXT NOT NULL REFERENCES members(token_hash) ON DELETE CASCADE,
  name TEXT NOT NULL, muted INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_room ON voice_peers(room_id,expires_at);
CREATE TABLE IF NOT EXISTS voice_signals (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL REFERENCES voice_peers(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES voice_peers(id) ON DELETE CASCADE,
  message_json TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_signals_recipient ON voice_signals(to_id,created_at);
