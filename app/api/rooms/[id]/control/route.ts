import { AppError } from "@/lib/drive";
import { findRoom,payload,hash,database,view,json,failure } from "@/lib/rooms";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const room=await findRoom((await params).id),body=await payload(request),host=request.headers.get("x-host-token");
 if(!host||host.length>128||await hash(host)!==room.host_hash)throw new AppError("Only the host can control playback.",403);
 if(typeof body.playing!=="boolean"||typeof body.position!=="number"||!Number.isFinite(body.position)||body.position<0||body.position>86400)throw new AppError("Invalid playback position.");
 await database().prepare("UPDATE rooms SET playing = ?, position = ?, updated_at = ?, version = version + 1 WHERE id = ?").bind(body.playing?1:0,body.position,Date.now(),room.id).run();
 return json({room:await view(await findRoom(room.id))});
}catch(e){return failure(e);}}
