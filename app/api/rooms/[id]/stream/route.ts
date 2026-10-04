import { driveMedia, boundedVideoRange, VIDEO_CHUNK_BYTES, AppError } from "@/lib/drive";
import { findRoom,requireMember,failure } from "@/lib/rooms";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const room=await findRoom((await params).id);await requireMember(request,room,true);
 const media=await driveMedia(room.drive_id,room.resource_key,boundedVideoRange(request.headers.get("range")));
 if(media.status!==416){
  const length=Number(media.headers.get("content-length")||NaN);
  const range=media.headers.get("content-range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  const size=range?Number(range[2])-Number(range[1])+1:length;
  if(!Number.isSafeInteger(size)||size<0||size>VIDEO_CHUNK_BYTES){await media.body?.cancel();throw new AppError("Drive didn’t support streaming this video in small ranges. Try a different MP4 video.",422);}
 }
 const headers=new Headers({"Content-Type":media.headers.get("content-type")||"video/mp4","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"});
 for(const name of ["content-length","content-range","accept-ranges"])if(media.headers.has(name))headers.set(name,media.headers.get(name)!);
 return new Response(media.body,{status:media.status,headers});
}catch(e){return failure(e);}}
