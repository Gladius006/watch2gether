import {createRequire} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {readdirSync,mkdirSync} from "node:fs";
import assert from "node:assert/strict";
const require=createRequire("C:/Users/avikg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/entry.js");
const {chromium}=require("playwright");
const browser=await chromium.launch({channel:"chrome",headless:true});
const id=randomUUID().replaceAll("-",""),host=randomUUID(),member=randomUUID(),now=Date.now();
const digest=s=>createHash("sha256").update(s).digest("hex");
const directory=".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const db=new DatabaseSync(`${directory}/${readdirSync(directory).find(f=>f.endsWith(".sqlite")&&f!=="metadata.sqlite")}`);
db.prepare("INSERT INTO rooms (id,title,host_name,host_hash,drive_id,video_name,playing,position,updated_at,version,expires_at) VALUES (?,?,?,?,?,?,0,0,?,0,?)").run(id,"Movie night","Test Host",digest(host),"abcdefghijklmnop","Playback test.webm",now,now+600000);
db.prepare("INSERT INTO members (token_hash,room_id,name,is_host,last_seen) VALUES (?,?,?,1,?)").run(digest(member),id,"Test Host",now);
const errors=[];mkdirSync("outputs",{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const hostPage=await context.newPage();hostPage.on("pageerror",e=>errors.push(e.message));
 await hostPage.goto("http://127.0.0.1:5173/",{waitUntil:"networkidle"});await hostPage.screenshot({path:"outputs/desktop.png",fullPage:true});
 assert.equal(await hostPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await hostPage.getByRole("button",{name:"How it works"}).click();await hostPage.getByRole("dialog").waitFor();await hostPage.getByRole("button",{name:"Close",exact:true}).click();
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true});await mobile.goto("http://127.0.0.1:5173/",{waitUntil:"networkidle"});assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=390),true);await mobile.screenshot({path:"outputs/mobile.png",fullPage:true});await mobile.close();
 // Create an actual browser-playable video fixture, without accessing real files.
 const bytes=Buffer.from(await hostPage.evaluate(async()=>{const canvas=document.createElement("canvas");canvas.width=320;canvas.height=180;const ctx=canvas.getContext("2d");const stream=canvas.captureStream(15),recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8"});const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?"#123b2c":"#205d48";ctx.fillRect(0,0,320,180);},66);await new Promise(r=>setTimeout(r,6500));recorder.stop();await done;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:"video/webm"}).arrayBuffer()));}));
 async function mediaRoute(route){const range=route.request().headers().range;let start=0,end=bytes.length-1;if(range){const m=range.match(/bytes=(\d+)-(\d*)/);start=Number(m?.[1]||0);if(m?.[2])end=Math.min(end,Number(m[2]));}const body=bytes.subarray(start,end+1);await route.fulfill({status:range?206:200,headers:{"Content-Type":"video/webm","Accept-Ranges":"bytes","Content-Length":String(body.length),...(range?{"Content-Range":`bytes ${start}-${end}/${bytes.length}`}:{})},body});}
 await context.route("**/api/rooms/*/stream?*",mediaRoute);
 await context.addInitScript(({id,host,member})=>{localStorage.setItem("w2g-name","Test Host");sessionStorage.setItem(`w2g-host-${id}`,host);sessionStorage.setItem(`w2g-member-${id}`,member);},{id,host,member});
 await hostPage.goto(`http://127.0.0.1:5173/?room=${id}`);await hostPage.getByRole("button",{name:"Join the room",exact:true}).click();await hostPage.waitForFunction(()=>document.querySelector("video")?.readyState>=1);
 const guestContext=await browser.newContext();await guestContext.route("**/api/rooms/*/stream?*",mediaRoute);const guestPage=await guestContext.newPage();guestPage.on("pageerror",e=>errors.push(e.message));
 await guestPage.goto(`http://127.0.0.1:5173/?room=${id}`);await guestPage.getByRole("dialog").getByLabel("Your name",{exact:true}).fill("Test Guest");await guestPage.getByRole("button",{name:"Join the room",exact:true}).click();await guestPage.waitForFunction(()=>document.querySelector("video")?.readyState>=1);
 assert.equal(await guestPage.getByRole("button",{name:"Play for everyone",exact:true}).isDisabled(),true);
 await hostPage.getByRole("button",{name:"Play for everyone",exact:true}).click();
 await guestPage.waitForFunction(()=>document.querySelector("video").paused===false,{timeout:5000});
 await hostPage.getByRole("button",{name:"Pause for everyone",exact:true}).click();await guestPage.waitForFunction(()=>document.querySelector("video").paused===true,{timeout:5000});
 const slider=hostPage.locator('[data-slot="slider"]');const box=await slider.boundingBox();await hostPage.mouse.click(box.x+box.width*.65,box.y+box.height/2);
 await guestPage.waitForFunction(()=>document.querySelector("video").currentTime>2.5,{timeout:5000});
 const hostTime=await hostPage.locator("video").evaluate(v=>v.currentTime),guestTime=await guestPage.locator("video").evaluate(v=>v.currentTime);assert.ok(Math.abs(hostTime-guestTime)<1.5);
 await guestPage.getByRole("button",{name:"Mute",exact:true}).click();assert.equal(await guestPage.locator("video").evaluate(v=>v.muted),true);assert.equal(await hostPage.locator("video").evaluate(v=>v.muted),false);
 await hostPage.screenshot({path:"outputs/room.png",fullPage:true});assert.deepEqual(errors,[]);
 console.log("Browser checks passed: desktop/mobile layout, joins, host play/pause/seek, guest sync, independent mute, and no browser exceptions.");
 console.log("Video bytes are a local test fixture; an actual user Drive video was not supplied.");
}finally{await browser.close();db.prepare("DELETE FROM members WHERE room_id = ?").run(id);db.prepare("DELETE FROM rooms WHERE id = ?").run(id);db.close();}
