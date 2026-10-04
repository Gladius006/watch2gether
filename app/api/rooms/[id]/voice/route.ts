import { findRoom, requireMember, payload, database, json, failure } from "@/lib/rooms";
import { AppError } from "@/lib/drive";
import { peerId, signalMessage, voiceIceServers, VOICE_LIMIT } from "@/lib/voice";
type Context = { params: Promise<{ id: string }> };
type Peer = { id: string; member_hash: string; name: string; muted: number; expires_at: number };
async function ownPeer(id: string, roomId: string, memberHash: string) {
  const peer = await database().prepare("SELECT * FROM voice_peers WHERE id = ? AND room_id = ? AND member_hash = ? AND expires_at > ?").bind(id, roomId, memberHash, Date.now()).first<Peer>();
  if (!peer) throw new AppError("Your voice session ended. Join voice again.", 410);
  return peer;
}
export async function GET(request: Request, { params }: Context) {
  try {
    const room = await findRoom((await params).id), member = await requireMember(request, room), db = database(), now = Date.now();
    const raw = new URL(request.url).searchParams.get("peer");
    if (raw) {
      await ownPeer(peerId(raw), room.id, member.token_hash);
      await db.prepare("UPDATE voice_peers SET expires_at = ? WHERE id = ?").bind(now + 45000, raw).run();
    }
    const peers = await db.prepare("SELECT id,name,muted FROM voice_peers WHERE room_id = ? AND expires_at > ? ORDER BY id").bind(room.id, now).all<Peer>();
    const signals = raw ? (await db.prepare("SELECT id,from_id,message_json FROM voice_signals WHERE to_id = ? AND room_id = ? AND expires_at > ? ORDER BY created_at,id LIMIT 100").bind(raw, room.id, now).all<{ id: string; from_id: string; message_json: string }>()).results : [];
    return json({ peers: peers.results.map(peer => ({ id: peer.id, name: peer.name, muted: !!peer.muted })), signals: signals.map(signal => ({ id: signal.id, from: signal.from_id, message: JSON.parse(signal.message_json) })), limit: VOICE_LIMIT });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const body = await payload(request, 20000), room = await findRoom((await params).id), member = await requireMember(request, room);
    const id = peerId(body.peer), db = database(), now = Date.now();
    if (body.action === "join") {
      const exists = await db.prepare("SELECT member_hash FROM voice_peers WHERE id = ?").bind(id).first<Peer>();
      if (exists && exists.member_hash !== member.token_hash) throw new AppError("This voice participant identifier is already in use.", 409);
      await db.batch([
        db.prepare("DELETE FROM voice_peers WHERE room_id = ? AND (expires_at < ? OR member_hash = ?)").bind(room.id, now, member.token_hash),
        db.prepare("DELETE FROM voice_signals WHERE room_id = ? AND expires_at < ?").bind(room.id, now),
        db.prepare("INSERT INTO voice_peers (id,room_id,member_hash,name,muted,expires_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM voice_peers WHERE room_id = ?) < ?").bind(id, room.id, member.token_hash, member.name, 0, now + 45000, room.id, VOICE_LIMIT),
      ]);
      const joined = await db.prepare("SELECT id FROM voice_peers WHERE id = ? AND member_hash = ?").bind(id, member.token_hash).first();
      if (!joined) throw new AppError(`Voice chat is full. Up to ${VOICE_LIMIT} people can join at once.`, 409);
      return json({ iceServers: voiceIceServers(), relayConfigured: voiceIceServers().length > 1, limit: VOICE_LIMIT });
    }
    if (body.action === "leave") {
      await db.prepare("DELETE FROM voice_peers WHERE id = ? AND room_id = ? AND member_hash = ?").bind(id, room.id, member.token_hash).run();
      return json({ ok: true });
    }
    await ownPeer(id, room.id, member.token_hash);
    if (body.action === "mute") {
      if (typeof body.muted !== "boolean") throw new AppError("Invalid microphone state.");
      await db.prepare("UPDATE voice_peers SET muted = ? WHERE id = ?").bind(body.muted ? 1 : 0, id).run();
    } else if (body.action === "ack") {
      if (!Array.isArray(body.ids) || body.ids.length > 100) throw new AppError("Invalid voice acknowledgement.");
      const ids = body.ids.map(peerId);
      if (ids.length) await db.prepare(`DELETE FROM voice_signals WHERE to_id = ? AND id IN (${ids.map(() => "?").join(",")})`).bind(id, ...ids).run();
    } else if (body.action === "signal") {
      const to = peerId(body.to), message = signalMessage(body.message);
      if (to === id) throw new AppError("Choose another voice participant.");
      const target = await db.prepare("SELECT id FROM voice_peers WHERE id = ? AND room_id = ? AND expires_at > ?").bind(to, room.id, now).first();
      if (!target) throw new AppError("That person left voice chat.", 410);
      const signalId = crypto.randomUUID();
      await db.batch([
        db.prepare("DELETE FROM voice_signals WHERE room_id = ? AND expires_at < ?").bind(room.id, now),
        db.prepare("INSERT INTO voice_signals (id,room_id,from_id,to_id,message_json,created_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM voice_signals WHERE from_id = ? AND created_at > ?) < 100").bind(signalId, room.id, id, to, JSON.stringify(message), now, now + 60000, id, now - 5000),
      ]);
      if (!await db.prepare("SELECT id FROM voice_signals WHERE id = ?").bind(signalId).first()) throw new AppError("Too many voice signals. Leave voice and rejoin to retry.", 429);
    } else throw new AppError("Invalid voice action.");
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
