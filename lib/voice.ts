import { AppError } from "./drive";
export const VOICE_LIMIT = 6;
export function peerId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/.test(value)) throw new AppError("Invalid voice participant.");
  return value;
}
export function signalMessage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("Invalid voice signal.");
  const signal = value as Record<string, unknown>;
  if (signal.type === "offer" || signal.type === "answer") {
    if (typeof signal.sdp !== "string" || !signal.sdp.startsWith("v=0") || signal.sdp.length > 12000) throw new AppError("Invalid voice description.");
    return { type: signal.type, sdp: signal.sdp };
  }
  if (signal.type === "candidate") {
    const candidate = signal.candidate as Record<string, unknown>;
    if (!candidate || typeof candidate !== "object" || typeof candidate.candidate !== "string" || candidate.candidate.length > 2048 || (candidate.sdpMid !== null && typeof candidate.sdpMid !== "string") || (candidate.sdpMLineIndex !== null && (!Number.isInteger(candidate.sdpMLineIndex) || Number(candidate.sdpMLineIndex) < 0))) throw new AppError("Invalid voice candidate.");
    return { type: "candidate", candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex } };
  }
  throw new AppError("Unsupported voice signal.");
}
export function voiceIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
  const urls = process.env.VOICE_TURN_URLS?.split(",").map(url => url.trim()).filter(Boolean);
  if (urls?.length && urls.every(url => /^turns?:/.test(url)) && process.env.VOICE_TURN_USERNAME && process.env.VOICE_TURN_CREDENTIAL) {
    servers.push({ urls, username: process.env.VOICE_TURN_USERNAME, credential: process.env.VOICE_TURN_CREDENTIAL });
  }
  return servers;
}
