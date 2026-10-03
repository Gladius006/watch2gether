import { driveMedia } from "@/lib/drive";
import { findRoom,requireMember,failure } from "@/lib/rooms";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const room=await findRoom((await params).id);await requireMember(request,room,true);
 const media=await driveMedia(room.drive_id,room.resource_key,request.headers.get("range")||undefined);
 const headers=new Headers({"Content-Type":media.headers.get("content-type")||"video/mp4","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"});
 for(const name of ["content-length","content-range","accept-ranges"])if(media.headers.has(name))headers.set(name,media.headers.get(name)!);
 return new Response(media.body,{status:media.status,headers});
}catch(e){return failure(e);}}
