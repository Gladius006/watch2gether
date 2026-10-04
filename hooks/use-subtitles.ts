"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { validateCues, type SubtitleCue } from "@/lib/subtitles";
import type { Room } from "@/hooks/use-room";

export function useSubtitles(room: Room | null, memberToken: string, video: RefObject<HTMLVideoElement | null>, ready: boolean) {
  const [enabled, setEnabled] = useState(true);
  const [cues, setCues] = useState<SubtitleCue[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const native = useRef<{ video: HTMLVideoElement; track: TextTrack } | null>(null);
  const roomId = room?.id, revision = room?.subtitle?.revision;

  useEffect(() => {
    setCues(null); setError("");
    if (!roomId || revision === undefined || !memberToken) { setLoading(false); return; }
    const abort = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/rooms/${roomId}/subtitles`, { headers: { "X-Member-Token": memberToken }, cache: "no-store", signal: abort.signal });
        const data = await response.json() as { error?: string; subtitle?: { revision: number; cues: unknown } };
        if (!response.ok) throw new Error(data.error || "Couldn’t load the room’s subtitles.");
        if (data.subtitle?.revision !== revision) throw new Error("The subtitles changed. Try loading them again.");
        const parsed = validateCues(data.subtitle!.cues);
        if (!abort.signal.aborted) setCues(parsed);
      } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, [roomId, revision, memberToken, retry]);

  useEffect(() => {
    const v = video.current;
    if (!v || !ready || !cues) return;
    if (native.current?.video !== v) native.current = { video: v, track: v.addTextTrack("subtitles", "Room subtitles") };
    const track = native.current.track;
    for (const cue of cues) {
      // VTTCue parses markup. Escape characters so uploaded cues remain plain text.
      const text = cue.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      track.addCue(new VTTCue(cue.start, cue.end, text));
    }
    track.mode = enabled ? "showing" : "hidden";
    return () => {
      // Disabled tracks expose null cues in browsers. Clear while readable first.
      track.mode = "hidden";
      while (track.cues?.length) track.removeCue(track.cues[0]);
      track.mode = "disabled";
    };
  }, [cues, ready, roomId, video]);

  useEffect(() => { if (native.current && cues) native.current.track.mode = enabled ? "showing" : "hidden"; }, [enabled, cues]);
  return { enabled, setEnabled, loading, error, reload: () => setRetry(value => value + 1) };
}
