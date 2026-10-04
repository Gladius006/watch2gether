import { findRoom, requireMember, payload, database, json, failure } from "@/lib/rooms";
import { AppError } from "@/lib/drive";
type Context = { params: Promise<{ id: string }> };
type Message = { id: string; sender_name: string; message: string; created_at: number };
export async function GET(request: Request, { params }: Context) {
  try {
    const room = await findRoom((await params).id);
    await requireMember(request, room);
    const rows = await database().prepare("SELECT id,sender_name,message,created_at FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC,id DESC LIMIT 100").bind(room.id).all<Message>();
    return json({ messages: rows.results.reverse().map(row => ({ id: row.id, name: row.sender_name, text: row.message, createdAt: row.created_at })) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const body = await payload(request, 8192), room = await findRoom((await params).id);
    const member = await requireMember(request, room);
    if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id)) throw new AppError("Invalid message identifier.");
    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 1000) throw new AppError("Messages must contain 1–1,000 characters.");
    const db = database(), now = Date.now();
    await db.batch([db.prepare("INSERT INTO chat_messages (id,room_id,sender_hash,sender_name,message,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM chat_messages WHERE room_id = ?) < 5000 AND (SELECT COUNT(*) FROM chat_messages WHERE sender_hash = ? AND created_at > ?) < 3 ON CONFLICT(id) DO NOTHING").bind(body.id, room.id, member.token_hash, member.name, body.text.trim(), now, room.id, member.token_hash, now - 3000)]);
    const saved = await db.prepare("SELECT sender_hash FROM chat_messages WHERE id = ? AND room_id = ?").bind(body.id, room.id).first<{ sender_hash: string }>();
    if (!saved) throw new AppError("Chat is busy or full. Wait a moment before sending another message.", 429);
    if (saved.sender_hash !== member.token_hash) throw new AppError("This message identifier is already in use.", 409);
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
