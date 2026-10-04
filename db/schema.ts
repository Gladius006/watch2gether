import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  hostName: text("host_name").notNull(), hostHash: text("host_hash").notNull(),
  driveId: text("drive_id").notNull(), resourceKey: text("resource_key"),
  videoName: text("video_name").notNull(), playing: integer("playing").notNull().default(0),
  position: real("position").notNull().default(0), updatedAt: integer("updated_at").notNull(),
  version: integer("version").notNull().default(0), expiresAt: integer("expires_at").notNull(),
});
export const members = sqliteTable("members", {
  tokenHash: text("token_hash").primaryKey(), roomId: text("room_id").notNull().references(()=>rooms.id,{onDelete:"cascade"}),
  name: text("name").notNull(), isHost: integer("is_host").notNull().default(0), lastSeen: integer("last_seen").notNull(),
}, t=>[index("idx_members_room_seen").on(t.roomId,t.lastSeen)]);
// Store normalized, structured subtitle cues, rather than the uploaded file.
export const subtitles = sqliteTable("subtitles", {
  roomId: text("room_id").primaryKey().references(()=>rooms.id,{onDelete:"cascade"}),
  name: text("name").notNull(), revision: integer("revision").notNull(),
  cuesJson: text("cues_json").notNull(),
});
