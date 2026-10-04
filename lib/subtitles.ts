export type SubtitleCue = { start: number; end: number; text: string };
export const MAX_SUBTITLE_BYTES = 1024 * 1024;
export const MAX_SUBTITLE_PAYLOAD_BYTES = 600 * 1024;
const MAX_CUES = 5000;

function timestamp(value: string): number {
  const match = value.match(/^(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) throw new Error("Invalid subtitle timestamp. Use an SRT or WebVTT file.");
  const [, hours, minutes, seconds, millis] = match;
  if (Number(seconds) >= 60 || Number(minutes) >= 60) throw new Error("Subtitle timestamps contain invalid minutes or seconds.");
  return Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

function cleanText(text: string): string {
  // Keep subtitles as text. File-provided formatting and positioning are omitted.
  return text.replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/\u0000/g, "").trim();
}

export function validateCues(value: unknown): SubtitleCue[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_CUES) {
    throw new Error(`Choose a subtitle file with between 1 and ${MAX_CUES} cues.`);
  }
  let previousStart = -1;
  const cues = value.map((cue: unknown) => {
    const c = cue as Partial<SubtitleCue> | null;
    if (!c || typeof c.start !== "number" || typeof c.end !== "number" || typeof c.text !== "string" ||
      !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start ||
      c.end > 86400 || c.start < previousStart || c.text.length > 4000) {
      throw new Error("The subtitle file contains an invalid cue or out-of-order timestamps.");
    }
    const text = cleanText(c.text);
    if (!text) throw new Error("The subtitle file contains an empty cue.");
    previousStart = c.start;
    return { start: c.start, end: c.end, text };
  });
  if (new TextEncoder().encode(JSON.stringify(cues)).byteLength > MAX_SUBTITLE_PAYLOAD_BYTES - 1024) {
    throw new Error("This subtitle file contains too much text. Choose a smaller file.");
  }
  return cues;
}

export function parseSubtitles(source: string, filename: string): SubtitleCue[] {
  if (!/\.(srt|vtt)$/i.test(filename)) throw new Error("Choose an .srt or .vtt subtitle file.");
  if (new TextEncoder().encode(source).byteLength > MAX_SUBTITLE_BYTES) throw new Error("Subtitle files must be 1 MB or smaller.");
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const isVtt = /\.vtt$/i.test(filename);
  if (isVtt && !/^WEBVTT(?:[ \t][^\n]*)?(?:\n|$)/.test(text)) throw new Error("This WebVTT file is missing its WEBVTT header.");
  const blocks = text.split(/\n[ \t]*\n+/);
  const cues: SubtitleCue[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (isVtt && (index === 0 || /^(NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block))) continue;
    const lines = block.split("\n");
    const timingIndex = lines[0].includes("-->") ? 0 : 1;
    const match = lines[timingIndex]?.match(/^\s*(\S+)\s+-->\s+(\S+)(?:[ \t].*)?$/);
    if (!match) throw new Error(`Couldn’t read subtitle cue ${cues.length + 1}. Check the file’s format.`);
    cues.push({ start: timestamp(match[1]), end: timestamp(match[2]), text: lines.slice(timingIndex + 1).join("\n") });
  }
  return validateCues(cues);
}
