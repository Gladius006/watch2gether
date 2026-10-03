import { AppError } from "@/lib/drive";
import { findRoom,payload,cleanName,hash,token,database,view,json,failure } from "@/lib/rooms";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const room=await findRoom((await params).id),body=await payload(request),name=cleanName(body.name);
 const host=typeof body.hostToken==="string"&&body.hostToken.length<=128&&await hash(body.hostToken)===room.host_hash;
 let memberToken=typeof body.memberToken==="string"&&body.memberToken.length<=128?body.memberToken:token();let digest=await hash(memberToken);
 const existing=await database().prepare("SELECT token_hash FROM members WHERE room_id = ? AND token_hash = ?").bind(room.id,digest).first();
 if(!existing){memberToken=token();digest=await hash(memberToken);const count=await database().prepare("SELECT COUNT(*) as n FROM members WHERE room_id = ? AND last_seen > ?").bind(room.id,Date.now()-45000).first<{n:number}>();if((count?.n||0)>=50)throw new AppError("This room is full. Try again when someone leaves.",409);}
 await database().prepare("INSERT INTO members (token_hash,room_id,name,is_host,last_seen) VALUES (?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET name=excluded.name,is_host=excluded.is_host,last_seen=excluded.last_seen").bind(digest,room.id,name,host?1:0,Date.now()).run();
 return json({room:await view(room),memberToken,isHost:host});
}catch(e){return failure(e);}}
