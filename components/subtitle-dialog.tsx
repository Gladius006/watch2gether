"use client";
import { useEffect, useState } from "react";
import { Loader2, Captions } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { parseSubtitles, MAX_SUBTITLE_BYTES, type SubtitleCue } from "@/lib/subtitles";
import type { Room } from "@/hooks/use-room";

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; room: Room | null; isHost: boolean;
  subtitles: { enabled: boolean; setEnabled: (value: boolean) => void; loading: boolean; error: string; reload: () => void };
  save: (file: { name: string; cues: SubtitleCue[] } | null) => Promise<void>;
};
export function SubtitleDialog({ open, onOpenChange, room, isHost, subtitles, save }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { setError(""); }, [open, room?.id]);
  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      if (file.size > MAX_SUBTITLE_BYTES) throw new Error("Subtitle files must be 1 MB or smaller.");
      let source: string;
      try { source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error("Save your subtitle file using UTF-8 text encoding, then try again."); }
      await save({ name: file.name, cues: parseSubtitles(source, file.name) });
      toast.success("Subtitles shared with everyone in the room.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await save(null); toast.success("Subtitles removed from the room."); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="w2g-dialog">
      <DialogTitle>Subtitles for movie night.</DialogTitle>
      <DialogDescription>The host’s subtitle file is shared with everyone, including people who join later.</DialogDescription>
      <p className="subtitle-name">{room?.subtitle?.name || "No subtitle file added yet."}</p>
      <label className="subtitle-toggle" htmlFor="show-subtitles">Show subtitles on my screen<Switch id="show-subtitles" checked={subtitles.enabled} onCheckedChange={subtitles.setEnabled} disabled={!room?.subtitle}/></label>
      {subtitles.loading && <p className="subtitle-help" role="status">Loading room subtitles…</p>}
      {subtitles.error && <><p className="error" role="alert">{subtitles.error}</p><button className="outline" onClick={subtitles.reload}>Retry loading subtitles</button></>}
      {isHost ? <>
        <label className="subtitle-upload">{room?.subtitle ? "Replace subtitle file" : "Add subtitle file"}<input type="file" accept=".srt,.vtt" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }}/></label>
        <p className="subtitle-help">SRT or WebVTT · UTF-8 · Up to 1 MB and 5,000 cues. File formatting is simplified to plain text.</p>
        {busy && <p className="subtitle-help" role="status"><Loader2 size={16} className="spin"/> Updating subtitles for everyone…</p>}
        {room?.subtitle && <button className="outline" disabled={busy} onClick={() => void remove()}><Captions size={17}/>Remove subtitles for everyone</button>}
      </> : <p className="subtitle-help">Ask the host to add or replace a subtitle file. Your captions switch only affects your screen.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </DialogContent>
  </Dialog>;
}
