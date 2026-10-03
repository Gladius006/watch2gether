import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync,readFileSync } from "node:fs";
import { createHash,randomUUID } from "node:crypto";
import ts from "typescript";

// Unit-check the Drive boundary without accessing anyone's real Drive file.
const source=ts.transpileModule(readFileSync("lib/drive.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseDriveLink,driveMedia,videoFilename}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
assert.deepEqual(parseDriveLink("https://drive.google.com/file/d/abcdefghijklmnop/view?resourcekey=test-key"),{id:"abcdefghijklmnop",key:"test-key"});
for(const bad of ["https://evil.example/file/d/abcdefghijklmnop","http://drive.google.com/file/d/abcdefghijklmnop","https://drive.google.com/drive/folders/abcdefghijklmnop","javascript:alert(1)"])assert.throws(()=>parseDriveLink(bad));
const realFetch=globalThis.fetch;let calls=[];
globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(new Uint8Array([1,2,3]),{status:206,headers:{"Content-Type":"video/mp4","Content-Range":"bytes 0-2/100","Content-Disposition":"attachment; filename*=UTF-8''movie%20night.mp4"}});};
let media=await driveMedia("abcdefghijklmnop",null,"bytes=0-2");assert.equal(media.status,206);assert.equal(calls[0].options.headers.Range,"bytes=0-2");assert.equal(videoFilename(media),"movie night.mp4");await media.body.cancel();
await assert.rejects(()=>driveMedia("abcdefghijklmnop",null,"bytes=1-2,4-5"),/Unsupported/);
globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:"https://evil.example/private"}});
await assert.rejects(()=>driveMedia("abcdefghijklmnop",null),/unsupported download location/);
let count=0;globalThis.fetch=async()=>++count===1?new Response('<form action="https://drive.usercontent.google.com/download"><input name="id" value="abcdefghijklmnop"><input name="confirm" value="t"><input name="uuid" value="safe-uuid"></form>',{headers:{"Content-Type":"text/html"}}):new Response(new Uint8Array([0]),{headers:{"Content-Type":"video/mp4"}});
media=await driveMedia("abcdefghijklmnop",null);assert.equal(count,2);await media.body.cancel();
globalThis.fetch=async()=>new Response("Quota exceeded",{headers:{"Content-Type":"text/html"}});
await assert.rejects(()=>driveMedia("abcdefghijklmnop",null),/Google didn’t allow access/);
globalThis.fetch=realFetch;
console.log("Drive link validation, range streaming, confirmation, quota, and redirect checks passed.");

// Exercise actual API routes using fixtures exclusively in the local database.
const directory=".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const filename=readdirSync(directory).find(f=>f.endsWith(".sqlite")&&f!=="metadata.sqlite");assert.ok(filename);
const db=new DatabaseSync(`${directory}/${filename}`);db.exec("PRAGMA foreign_keys = ON");
const id=randomUUID().replaceAll("-",""),host=randomUUID(),member=randomUUID(),now=Date.now();
const hash=s=>createHash("sha256").update(s).digest("hex");
db.prepare("INSERT INTO rooms (id,title,host_name,host_hash,drive_id,video_name,playing,position,updated_at,version,expires_at) VALUES (?,?,?,?,?,?,0,0,?,0,?)").run(id,"Integration test room","Test Host",hash(host),"abcdefghijklmnop","Test video.mp4",now,now+600000);
db.prepare("INSERT INTO members (token_hash,room_id,name,is_host,last_seen) VALUES (?,?,?,1,?)").run(hash(member),id,"Test Host",now);
const origin="http://127.0.0.1:5173";
async function request(path,{method="GET",body,headers={}}={}){const response=await fetch(origin+path,{method,headers:{"Content-Type":"application/json",...headers},body:body?JSON.stringify(body):undefined});const text=await response.text();return {status:response.status,data:text.startsWith("{")?JSON.parse(text):{error:text}};}
try{
 const invalid=await request("/api/rooms",{method:"POST",body:{name:"Test",driveLink:"https://evil.example/video"}});assert.equal(invalid.status,400);
 const absent=await request(`/api/rooms/${id}`);assert.equal(absent.status,401);
 const join=await request(`/api/rooms/${id}/join`,{method:"POST",body:{name:"Guest"}});assert.equal(join.status,200);assert.equal(join.data.isHost,false);assert.equal(join.data.room.members.length,2);
 const guestHeaders={"X-Member-Token":join.data.memberToken};
 const forbidden=await request(`/api/rooms/${id}/control`,{method:"POST",headers:{"X-Host-Token":join.data.memberToken},body:{playing:true,position:12}});assert.equal(forbidden.status,403);
 const play=await request(`/api/rooms/${id}/control`,{method:"POST",headers:{"X-Host-Token":host},body:{playing:true,position:12}});assert.equal(play.status,200);assert.equal(play.data.room.playing,true);
 const guest=await request(`/api/rooms/${id}`,{headers:guestHeaders});assert.equal(guest.data.room.playing,true);assert.equal(guest.data.room.position,12);assert.equal(guest.data.room.version,1);
 const pause=await request(`/api/rooms/${id}/control`,{method:"POST",headers:{"X-Host-Token":host},body:{playing:false,position:36}});assert.equal(pause.data.room.position,36);assert.equal(pause.data.room.playing,false);
 const badPosition=await request(`/api/rooms/${id}/control`,{method:"POST",headers:{"X-Host-Token":host},body:{playing:true,position:-4}});assert.equal(badPosition.status,400);
 const csrf=await request(`/api/rooms/${id}/join`,{method:"POST",headers:{Origin:"https://evil.example"},body:{name:"Guest"}});assert.equal(csrf.status,403);
 const recovered=await request(`/api/rooms/${id}/join`,{method:"POST",body:{name:"Test Host",hostToken:host,memberToken:member}});assert.equal(recovered.data.isHost,true);assert.equal(recovered.data.room.members.length,2);
 const forbiddenStream=await request(`/api/rooms/${id}/stream?member=invalid`);assert.equal(forbiddenStream.status,401);
 await request(`/api/rooms/${id}/leave`,{method:"POST",body:{},headers:guestHeaders});
 const remaining=await request(`/api/rooms/${id}`,{headers:{"X-Member-Token":member}});assert.equal(remaining.data.room.members.length,1);
 db.prepare("UPDATE rooms SET expires_at = 0 WHERE id = ?").run(id);
 const expired=await request(`/api/rooms/${id}/join`,{method:"POST",body:{name:"Guest"}});assert.equal(expired.status,404);
 console.log("Live API checks passed: join, membership, host authorization, play/pause/seek, host recovery, CSRF, leave, expiry.");
}finally{db.prepare("DELETE FROM members WHERE room_id = ?").run(id);db.prepare("DELETE FROM rooms WHERE id = ?").run(id);db.close();}
