import { AppError } from "@/lib/drive";
import { MAX_SUBTITLE_PAYLOAD_BYTES, validateCues } from "@/lib/subtitles";
import { database, failure, findRoom, hash, json, payload, requireMember, view } from "@/lib/rooms";

export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const room = await findRoom((await params).id);
    await requireMember(request, room);
    const row = await database().prepare("SELECT name, revision, cues_json FROM subtitles WHERE room_id = ?")
      .bind(room.id).first<{name: string; revision: number; cues_json: string}>();
    return json({subtitle: row ? {name: row.name, revision: row.revision, cues: JSON.parse(row.cues_json)} : null});
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const room = await findRoom((await params).id);
    const host = request.headers.get("x-host-token");
    if (!host || host.length > 128 || await hash(host) !== room.host_hash) throw new AppError("Only the host can add or remove shared subtitles.", 403);
    const body = await payload(request, MAX_SUBTITLE_PAYLOAD_BYTES);
    const db = database();
    if (body.action === "remove") {
      await db.batch([
        db.prepare("DELETE FROM subtitles WHERE room_id = ?").bind(room.id),
        db.prepare("UPDATE rooms SET version = version + 1 WHERE id = ?").bind(room.id),
      ]);
    } else {
      if (body.action !== "add" || typeof body.name !== "string" || !body.name.trim() || body.name.length > 180 || !/\.(srt|vtt)$/i.test(body.name)) {
        throw new AppError("Choose an .srt or .vtt subtitle file.");
      }
      let cues;
      try { cues = validateCues(body.cues); } catch (error) { throw new AppError((error as Error).message); }
      await db.batch([
        db.prepare("INSERT INTO subtitles (room_id,name,revision,cues_json) VALUES (?, ?,(SELECT version+1 FROM rooms WHERE id=?),?) ON CONFLICT(room_id) DO UPDATE SET name=excluded.name,revision=excluded.revision,cues_json=excluded.cues_json")
          .bind(room.id, body.name.trim(), room.id, JSON.stringify(cues)),
        db.prepare("UPDATE rooms SET version = version + 1 WHERE id = ?").bind(room.id),
      ]);
    }
    return json({room: await view(await findRoom(room.id))});
  } catch (error) { return failure(error); }
}
