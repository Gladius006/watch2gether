import { parseDriveLink, driveMedia, videoFilename, AppError } from "@/lib/drive";
import { database, payload, cleanName, token, hash, findRoom, view, json, failure } from "@/lib/rooms";
export async function POST(request:Request){try{
 const body=await payload(request), name=cleanName(body.name), drive=parseDriveLink(body.driveLink);
 if(body.title!==undefined && (typeof body.title!=="string" || body.title.length>60))throw new AppError("Room names can be up to 60 characters.");
 const media=await driveMedia(drive.id,drive.key,"bytes=0-1023");const filename=videoFilename(media);await media.body?.cancel();
 const id=crypto.randomUUID().replaceAll("-",""),hostToken=token(),memberToken=token(),now=Date.now();
 const db=database();await db.batch([
 db.prepare("INSERT INTO rooms (id,title,host_name,host_hash,drive_id,resource_key,video_name,playing,position,updated_at,version,expires_at) VALUES (?,?,?,?,?,?,?,0,0,?,0,?)").bind(id,(body.title as string)?.trim()||`${name}’s movie night`,name,await hash(hostToken),drive.id,drive.key,filename,now,now+86400000),
 db.prepare("INSERT INTO members (token_hash,room_id,name,is_host,last_seen) VALUES (?,?,?,1,?)").bind(await hash(memberToken),id,name,now)
 ]);
 return json({room:await view(await findRoom(id)),hostToken,memberToken},201);
}catch(e){return failure(e);}}
