"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Mic, MicOff, PhoneOff, Loader2, Headphones } from "lucide-react";
import { useVoice } from "@/hooks/use-voice";
type Message = { id: string; name: string; text: string; createdAt: number };
type ChatResponse = { messages: Message[]; error?: string };
export function RoomConversation({ roomId, memberToken }: { roomId: string; memberToken: string }) {
  const voice = useVoice(roomId, memberToken);
  const [messages, setMessages] = useState<Message[]>([]), [draft, setDraft] = useState(""), [sending, setSending] = useState(false), [error, setError] = useState(""), [connected, setConnected] = useState(true);
  const scroll = useRef<HTMLDivElement>(null), pending = useRef<{ id: string; text: string } | null>(null), autoScroll = useRef(true);
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const response = await fetch(`/api/rooms/${roomId}/chat`, { headers: { "X-Member-Token": memberToken }, cache: "no-store" }); const data = await response.json() as ChatResponse; if (!response.ok) throw new Error(data.error); if (!cancelled) { setMessages(data.messages); setConnected(true); } } catch { if (!cancelled) setConnected(false); }
      if (!cancelled) timer = setTimeout(poll, 1500);
    }
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [roomId, memberToken]);
  const lastMessage = messages.at(-1)?.id;
  useEffect(() => { if (autoScroll.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [lastMessage]);
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (sending || !draft.trim()) return;
    const message = pending.current?.text === draft.trim() ? pending.current : { id: crypto.randomUUID(), text: draft.trim() }; pending.current = message;
    setSending(true); setError("");
    try {
      const response = await fetch(`/api/rooms/${roomId}/chat`, { method: "POST", headers: { "Content-Type": "application/json", "X-Member-Token": memberToken }, body: JSON.stringify(message) });
      const data = await response.json() as ChatResponse; if (!response.ok) throw new Error(data.error || "Your message couldn’t be sent.");
      setDraft(""); pending.current = null; autoScroll.current = true;
      const history = await fetch(`/api/rooms/${roomId}/chat`, { headers: { "X-Member-Token": memberToken }, cache: "no-store" }); if (history.ok) setMessages((await history.json() as ChatResponse).messages);
    } catch (cause) { setError((cause as Error).message); } finally { setSending(false); }
  }
  return <section className="conversation" aria-label="Room conversation">
    <div className="voice-heading"><h3><Headphones size={16}/>Voice chat</h3><span>{voice.people.length}/6</span></div>
    <p className="conversation-help">Talk while you watch. Headphones help prevent echoes.</p>
    {voice.joined ? <div className="voice-actions"><button className={`outline ${voice.muted ? "mic-muted" : ""}`} aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={voice.muted} onClick={() => void voice.toggleMute()}>{voice.muted ? <MicOff size={16}/> : <Mic size={16}/>} {voice.muted ? "Mic off" : "Mic on"}</button><button className="outline" onClick={voice.leave}><PhoneOff size={16}/>Leave voice</button></div> : <button className="outline full" disabled={voice.busy} onClick={() => void voice.join()}>{voice.busy ? <Loader2 size={16} className="spin"/> : <Mic size={16}/>} {voice.busy ? "Connecting microphone…" : "Join voice"}</button>}
    {voice.people.length > 0 && <ul className="voice-people" aria-label="Voice participants">{voice.people.map(person => <li key={person.id}>{person.muted ? <MicOff size={13}/> : <Mic size={13}/>}<span>{person.name}{person.id === voice.ownId ? " (you)" : ""}</span>{voice.joined && person.id !== voice.ownId && <small>{voice.states[person.id] === "connected" ? "Connected" : voice.states[person.id] === "failed" || voice.states[person.id] === "disconnected" ? "Connection blocked" : "Connecting…"}</small>}</li>)}</ul>}
    {voice.joined && Object.values(voice.states).some(state => state === "failed" || state === "disconnected") && <p className="error" role="alert">Voice couldn’t connect to everyone. Leave voice and rejoin, or try another network.</p>}
    {voice.needsAudio && <button className="outline full" onClick={() => void voice.enableAudio()}>Enable voice audio</button>}
    {voice.error && <p className="error" role="alert">{voice.error}</p>}
    <div className="chat-heading"><h3><MessageCircle size={16}/>Room chat</h3><span>{connected ? "Live" : "Reconnecting…"}</span></div>
    <div className="chat-messages" role="log" aria-label="Room messages" aria-live="polite" aria-relevant="additions" ref={scroll} onScroll={event => { const node = event.currentTarget; autoScroll.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60; }}>
      {!messages.length && <p className="chat-empty">Say hello to your movie crew.<br/>Recent messages appear for everyone who joins.</p>}
      {messages.map(message => <div className="chat-message" key={message.id}><div><strong>{message.name}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.text}</p></div>)}
    </div>
    <form className="chat-compose" onSubmit={event => void send(event)}><label className="sr-only" htmlFor="chat-message">Message the room</label><textarea id="chat-message" placeholder="Message the room…" rows={2} maxLength={1000} value={draft} disabled={sending} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><button className="primary" aria-label="Send message" disabled={sending || !draft.trim()}>{sending ? <Loader2 size={17} className="spin"/> : <Send size={17}/>}</button></form>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="conversation-help">Enter to send · Shift + Enter for a new line</p>
  </section>;
}
