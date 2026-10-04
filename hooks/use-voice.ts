"use client";
import { useCallback, useEffect, useRef, useState } from "react";
type Person = { id: string; name: string; muted: boolean };
type Signal = { id: string; from: string; message: RTCSessionDescriptionInit | { type: "candidate"; candidate: RTCIceCandidateInit } };
type VoiceResponse = { error?: string; iceServers: RTCIceServer[]; peers: Person[]; signals: Signal[] };
type Connection = { pc: RTCPeerConnection; audio: HTMLAudioElement; pending: RTCIceCandidateInit[]; remoteReady: boolean; startedAt: number };
type Session = { id: string; room: string; token: string; stream: MediaStream; iceServers: RTCIceServer[]; peers: Map<string, Connection>; seen: Set<string> };
function dispose(current: Session) {
  current.stream.getTracks().forEach(track => track.stop());
  current.peers.forEach(peer => { peer.pc.close(); peer.audio.pause(); peer.audio.srcObject = null; });
  current.peers.clear();
  void request(current, { action: "leave" }).catch(() => {});
}
async function request(session: Pick<Session, "room" | "token" | "id">, body?: object) {
  const response = await fetch(`/api/rooms/${session.room}/voice${body ? "" : `?peer=${session.id}`}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-Member-Token": session.token }, ...(body ? { body: JSON.stringify({ ...body, peer: session.id }) } : {}), cache: "no-store", keepalive: !!body && (body as { action?: string }).action === "leave" });
  const data = await response.json() as VoiceResponse;
  if (!response.ok) throw Object.assign(new Error(data.error || "Voice chat is unavailable. Try again."), { status: response.status });
  return data;
}
export function useVoice(room: string, token: string) {
  const [joined, setJoined] = useState(false), [busy, setBusy] = useState(false), [muted, setMuted] = useState(false);
  const [people, setPeople] = useState<Person[]>([]), [states, setStates] = useState<Record<string, string>>({}), [error, setError] = useState(""), [needsAudio, setNeedsAudio] = useState(false);
  const [ownId, setOwnId] = useState<string>();
  const session = useRef<Session | null>(null), generation = useRef(0), joining = useRef(false);
  const leave = useCallback(() => {
    generation.current++; joining.current = false;
    const current = session.current; session.current = null;
    if (current) dispose(current);
    setJoined(false); setBusy(false); setMuted(false); setStates({}); setNeedsAudio(false); setOwnId(undefined);
  }, []);
  useEffect(() => {
    const hide = () => leave(); window.addEventListener("pagehide", hide);
    return () => { window.removeEventListener("pagehide", hide); leave(); };
  }, [room, token, leave]);
  async function join() {
    if (joining.current || session.current) return;
    const epoch = ++generation.current; joining.current = true; setBusy(true); setError("");
    let stream: MediaStream | undefined, current: Session | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error("Voice chat needs a browser with microphone support and a secure connection.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (epoch !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      current = { id: crypto.randomUUID(), room, token, stream, iceServers: [], peers: new Map(), seen: new Set() };
      session.current = current;
      const data = await request(current, { action: "join" });
      if (epoch !== generation.current) { dispose(current); return; }
      current.iceServers = data.iceServers; setMuted(false); setOwnId(current.id); setJoined(true);
      stream.getAudioTracks().forEach(track => { track.onended = () => { if (session.current === current) { leave(); setError("Your microphone disconnected. Connect it and join voice again."); } }; });
    } catch (cause) {
      stream?.getTracks().forEach(track => track.stop());
      if (current) dispose(current);
      if (epoch === generation.current) {
        session.current = null;
        const exception = cause as Error;
        setError(exception.name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser, then join voice again." : exception.name === "NotFoundError" ? "No microphone was found. Connect one and try again." : exception.message);
      }
    } finally { if (epoch === generation.current) { joining.current = false; setBusy(false); } }
  }
  useEffect(() => {
    if (!joined || !session.current) return;
    const current = session.current;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    let sending: Promise<void> = Promise.resolve();
    const live = () => !cancelled && session.current === current;
    const send = (to: string, message: object) => {
      sending = sending.catch(() => {}).then(async () => { if (live()) await request(current, { action: "signal", to, message }); });
      return sending;
    };
    function connection(id: string) {
      const existing = current.peers.get(id); if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: current.iceServers }), audio = new Audio(); audio.autoplay = true;
      const peer: Connection = { pc, audio, pending: [], remoteReady: false, startedAt: Date.now() }; current.peers.set(id, peer);
      current.stream.getTracks().forEach(track => pc.addTrack(track, current.stream));
      pc.onicecandidate = event => { if (event.candidate) void send(id, { type: "candidate", candidate: event.candidate.toJSON() }).catch(() => { if (live()) setError("Voice connection interrupted. Leave voice and rejoin to retry."); }); };
      pc.ontrack = event => { audio.srcObject = event.streams[0] || new MediaStream([event.track]); void audio.play().catch(() => { if (live()) setNeedsAudio(true); }); };
      pc.onconnectionstatechange = () => { if (live()) setStates(previous => ({ ...previous, [id]: pc.connectionState })); };
      return peer;
    }
    async function poll() {
      try {
        const data = await request(current);
        if (!live()) return;
        setPeople(data.peers); setError("");
        const active = new Set<string>(data.peers.map((person: Person) => person.id));
        for (const [id, peer] of current.peers) if (!active.has(id)) { peer.pc.close(); peer.audio.pause(); peer.audio.srcObject = null; current.peers.delete(id); setStates(previous => { const next = { ...previous }; delete next[id]; return next; }); }
        for (const [id, peer] of current.peers) if (Date.now() - peer.startedAt > 20000 && peer.pc.connectionState !== "connected") setStates(previous => ({ ...previous, [id]: "failed" }));
        for (const person of data.peers as Person[]) {
          if (person.id === current.id || current.peers.has(person.id)) continue;
          const peer = connection(person.id);
          // A fixed initiator per pair avoids offer collisions; tracks stay constant when muted.
          if (current.id < person.id) { await peer.pc.setLocalDescription(await peer.pc.createOffer()); await send(person.id, { type: "offer", sdp: peer.pc.localDescription!.sdp }); }
          if (!live()) return;
        }
        const acknowledged: string[] = [];
        for (const signal of data.signals) {
          if (!live()) return;
          acknowledged.push(signal.id);
          if (current.seen.has(signal.id) || !active.has(signal.from)) continue;
          const peer = connection(signal.from), message = signal.message;
          if (message.type === "candidate") {
            if (peer.remoteReady) await peer.pc.addIceCandidate(message.candidate);
            else peer.pending.push(message.candidate);
          } else {
            await peer.pc.setRemoteDescription(message); peer.remoteReady = true;
            for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
            if (message.type === "offer") { await peer.pc.setLocalDescription(await peer.pc.createAnswer()); await send(signal.from, { type: "answer", sdp: peer.pc.localDescription!.sdp }); }
          }
          current.seen.add(signal.id);
          if (current.seen.size > 500) current.seen.delete(current.seen.values().next().value!);
        }
        if (acknowledged.length) await request(current, { action: "ack", ids: acknowledged });
      } catch (cause) {
        if (live()) { if ((cause as { status?: number }).status === 410 || (cause as { status?: number }).status === 401 || (cause as { status?: number }).status === 404) leave(); setError((cause as Error).message); }
      }
      if (live()) timer = setTimeout(poll, 1200);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [joined, room, token, leave]);
  // Viewers can see who's in voice without opening their microphone.
  useEffect(() => {
    if (joined) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const response = await fetch(`/api/rooms/${room}/voice`, { headers: { "X-Member-Token": token }, cache: "no-store" }); const data = await response.json() as VoiceResponse; if (!cancelled && response.ok) setPeople(data.peers); } catch {}
      if (!cancelled) timer = setTimeout(poll, 5000);
    }
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [joined, room, token]);
  async function toggleMute() {
    const current = session.current; if (!current) return;
    const next = !muted; current.stream.getAudioTracks().forEach(track => { track.enabled = !next; }); setMuted(next);
    try { await request(current, { action: "mute", muted: next }); } catch { setError("Your microphone changed, but its status couldn’t be shared. Try again."); }
  }
  async function enableAudio() {
    const current = session.current; if (!current) return;
    try { await Promise.all(Array.from(current.peers.values()).map(peer => peer.audio.play())); setNeedsAudio(false); } catch { setError("Your browser blocked voice audio. Allow sound for this site and try again."); }
  }
  return { joined, busy, muted, people, states, error, needsAudio, ownId, join, leave, toggleMute, enableAudio };
}
