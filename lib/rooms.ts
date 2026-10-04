export { database } from "./database";
import { database } from "./database";
import { AppError } from "./drive";
export type RoomRow={id:string;title:string;host_name:string;host_hash:string;drive_id:string;resource_key:string|null;video_name:string;playing:number;position:number;updated_at:number;version:number;expires_at:number};
export const token=()=>crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,"0")).join("");}
export function cleanName(value:unknown){if(typeof value!=="string" || !value.trim() || value.length>32)throw new AppError("Enter your name (up to 32 characters).");return value.trim();}
export function sameOrigin(request:Request){
 const origin=request.headers.get("origin");if(!origin)return;
 // Next.js can normalize the request URL to localhost. Host retains the public authority.
 const url=new URL(request.url),host=request.headers.get("host")||url.host;
 const protocol=request.headers.get("x-forwarded-proto")?.split(",")[0].trim()||url.protocol.slice(0,-1);
 if(origin!==`${protocol}://${host}`)throw new AppError("This request must come from your viewing room.",403);
}
export async function payload(request:Request,maxBytes=4096){
 sameOrigin(request);if(Number(request.headers.get("content-length")||0)>maxBytes)throw new AppError("The request is too large.",413);
 const reader=request.body?.getReader();if(!reader)throw new AppError("Invalid request.");
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxBytes){await reader.cancel();throw new AppError("The request is too large.",413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 try{const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const result=JSON.parse(new TextDecoder().decode(bytes));if(!result||typeof result!=="object"||Array.isArray(result))throw new Error();return result as Record<string,unknown>;}catch{throw new AppError("Invalid request.");}
}
export async function findRoom(id:string){if(!/^[a-zA-Z0-9_-]{16,64}$/.test(id))throw new AppError("This room link is invalid.",404);const room=await database().prepare("SELECT * FROM rooms WHERE id = ? AND expires_at > ?").bind(id,Date.now()).first<RoomRow>();if(!room)throw new AppError("This room doesn’t exist or has expired. Ask your host for a new invitation.",404);return room;}
export async function requireMember(request:Request,room:RoomRow,query=false){const raw=query?new URL(request.url).searchParams.get("member"):request.headers.get("x-member-token");if(!raw||raw.length>128)throw new AppError("Join this room to watch the video.",401);const member=await database().prepare("SELECT * FROM members WHERE room_id = ? AND token_hash = ?").bind(room.id,await hash(raw)).first<{token_hash:string;name:string;is_host:number;last_seen:number}>();if(!member)throw new AppError("Join this room to watch the video.",401);return member;}
export async function view(room:RoomRow){const [members,subtitle]=await Promise.all([
 database().prepare("SELECT name, is_host FROM members WHERE room_id = ? AND last_seen > ? ORDER BY is_host DESC, name ASC LIMIT 50").bind(room.id,Date.now()-45000).all<{name:string;is_host:number}>(),
 database().prepare("SELECT name, revision FROM subtitles WHERE room_id = ?").bind(room.id).first<{name:string;revision:number}>()
 ]);return {id:room.id,title:room.title,hostName:room.host_name,driveId:room.drive_id,videoName:room.video_name,playing:!!room.playing,position:room.position,updatedAt:room.updated_at,version:room.version,expiresAt:room.expires_at,serverTime:Date.now(),subtitle:subtitle||null,members:members.results.map(m=>({name:m.name,isHost:!!m.is_host}))};}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});}
export function failure(error:unknown){if(error instanceof AppError)return json({error:error.message},error.status);console.error("Room operation failed",error instanceof Error?error.message:"Unknown error");return json({error:"The room is temporarily unavailable. Please try again."},503);}
