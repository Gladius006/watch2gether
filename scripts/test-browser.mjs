import {createRequire} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync,mkdirSync} from "node:fs";
import assert from "node:assert/strict";
import postgres from "postgres";
const require=createRequire("C:/Users/avikg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/entry.js");
const {chromium}=require("playwright");
const browser=await chromium.launch({channel:"chrome",headless:true,args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream","--autoplay-policy=no-user-gesture-required"]});
function instrumentVoice(){
 window.__voicePCs=[];window.__voiceStreams=[];
 const NativePeer=window.RTCPeerConnection;
 window.RTCPeerConnection=class extends NativePeer{constructor(...args){super(...args);window.__voicePCs.push(this);}};
 const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async options=>{const stream=await capture(options);window.__voiceStreams.push(stream);return stream;};
 window.__micCapture=navigator.mediaDevices.getUserMedia;
}
const id=randomUUID().replaceAll("-",""),host=randomUUID(),member=randomUUID(),now=Date.now();
const digest=s=>createHash("sha256").update(s).digest("hex");
mkdirSync(".watch2gether",{recursive:true});
let db;
if(process.env.TEST_DATABASE_URL){
 const sql=postgres(process.env.TEST_DATABASE_URL,{max:1,prepare:false,onnotice:()=>{}});
 db={prepare:text=>({run:async(...values)=>{let n=0;return sql.unsafe(text.replace(/\?/g,()=>`$${++n}`),values);}}),close:async()=>sql.end({timeout:5})};
}else{
 db=new DatabaseSync(".watch2gether/rooms.sqlite");db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
 db.exec(readFileSync("netlify/database/migrations/0001_watch_rooms.sql","utf8"));
}
await db.prepare("INSERT INTO rooms (id,title,host_name,host_hash,drive_id,video_name,playing,position,updated_at,version,expires_at) VALUES (?,?,?,?,?,?,0,0,?,0,?)").run(id,"Movie night","Test Host",digest(host),"abcdefghijklmnop","Playback test.webm",now,now+600000);
await db.prepare("INSERT INTO members (token_hash,room_id,name,is_host,last_seen) VALUES (?,?,?,1,?)").run(digest(member),id,"Test Host",now);
const errors=[];mkdirSync("outputs",{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(instrumentVoice);const hostPage=await context.newPage();hostPage.on("pageerror",e=>errors.push(e.message));
 await hostPage.goto("http://127.0.0.1:5173/",{waitUntil:"networkidle"});await hostPage.screenshot({path:"outputs/desktop.png",fullPage:true,caret:"initial"});
 assert.equal(await hostPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await hostPage.getByRole("button",{name:"How it works"}).click();await hostPage.getByRole("dialog").waitFor();await hostPage.getByRole("button",{name:"Close",exact:true}).click();
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true});await mobile.goto("http://127.0.0.1:5173/",{waitUntil:"networkidle"});assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=390),true);await mobile.screenshot({path:"outputs/mobile.png",fullPage:true,caret:"initial"});await mobile.close();
 // Create an actual browser-playable video fixture, without accessing real files.
 const bytes=Buffer.from(await hostPage.evaluate(async()=>{const canvas=document.createElement("canvas");canvas.width=320;canvas.height=180;const ctx=canvas.getContext("2d");const stream=canvas.captureStream(15),recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8"});const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?"#123b2c":"#205d48";ctx.fillRect(0,0,320,180);},66);await new Promise(r=>setTimeout(r,6500));recorder.stop();await done;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:"video/webm"}).arrayBuffer()));}));
 async function mediaRoute(route){const range=route.request().headers().range;let start=0,end=bytes.length-1;if(range){const m=range.match(/bytes=(\d+)-(\d*)/);start=Number(m?.[1]||0);if(m?.[2])end=Math.min(end,Number(m[2]));}const body=bytes.subarray(start,end+1);await route.fulfill({status:range?206:200,headers:{"Content-Type":"video/webm","Accept-Ranges":"bytes","Content-Length":String(body.length),...(range?{"Content-Range":`bytes ${start}-${end}/${bytes.length}`}:{})},body});}
 await context.route("**/api/rooms/*/stream?*",mediaRoute);
 await context.addInitScript(({id,host,member})=>{localStorage.setItem("w2g-name","Test Host");sessionStorage.setItem(`w2g-host-${id}`,host);sessionStorage.setItem(`w2g-member-${id}`,member);},{id,host,member});
 await hostPage.goto(`http://127.0.0.1:5173/?room=${id}`);await hostPage.getByRole("button",{name:"Join the room",exact:true}).click();await hostPage.waitForFunction(()=>document.querySelector("video")?.readyState>=1);
 const guestContext=await browser.newContext();await guestContext.addInitScript(instrumentVoice);await guestContext.route("**/api/rooms/*/stream?*",mediaRoute);const guestPage=await guestContext.newPage();guestPage.on("pageerror",e=>errors.push(e.message));
 await guestPage.goto(`http://127.0.0.1:5173/?room=${id}`);await guestPage.getByRole("dialog").getByLabel("Your name",{exact:true}).fill("Test Guest");await guestPage.getByRole("button",{name:"Join the room",exact:true}).click();await guestPage.waitForFunction(()=>document.querySelector("video")?.readyState>=1);
 assert.equal(await guestPage.getByRole("button",{name:"Play for everyone",exact:true}).isDisabled(),true);
 await hostPage.getByRole("button",{name:"Play for everyone",exact:true}).click();
 await guestPage.waitForFunction(()=>document.querySelector("video").paused===false,{timeout:5000});
 await hostPage.getByRole("button",{name:"Pause for everyone",exact:true}).click();await guestPage.waitForFunction(()=>document.querySelector("video").paused===true,{timeout:5000});
 const slider=hostPage.locator('[data-slot="slider"]');const box=await slider.boundingBox();await hostPage.mouse.click(box.x+box.width*.65,box.y+box.height/2);
 await guestPage.waitForFunction(()=>document.querySelector("video").currentTime>2.5,{timeout:5000});
 const hostTime=await hostPage.locator("video").evaluate(v=>v.currentTime),guestTime=await guestPage.locator("video").evaluate(v=>v.currentTime);assert.ok(Math.abs(hostTime-guestTime)<1.5);
 await guestPage.getByRole("button",{name:"Mute",exact:true}).click();assert.equal(await guestPage.locator("video").evaluate(v=>v.muted),true);assert.equal(await hostPage.locator("video").evaluate(v=>v.muted),false);
 await hostPage.getByRole("button",{name:"Add subtitles",exact:true}).click();
 await hostPage.getByLabel("Add subtitle file",{exact:true}).setInputFiles({name:"movie.srt",mimeType:"text/plain",buffer:Buffer.from("1\n00:00:00,000 --> 00:00:06,000\nShared subtitle")});
 await hostPage.getByRole("dialog").getByText("movie.srt",{exact:true}).waitFor();
 await hostPage.screenshot({path:"outputs/subtitle-dialog.png",fullPage:true,caret:"initial"});
 await hostPage.getByRole("button",{name:"Close",exact:true}).click();
 await guestPage.waitForFunction(()=>document.querySelector("video").textTracks[0]?.cues?.[0]?.text==="Shared subtitle");
 await guestPage.waitForFunction(()=>document.querySelector("video").textTracks[0]?.activeCues?.[0]?.text==="Shared subtitle");
 await guestPage.screenshot({path:"outputs/subtitles-playing.png",fullPage:true,caret:"initial"});
 assert.equal(await hostPage.locator("video").evaluate(v=>v.textTracks[0].mode),"showing");
 await guestPage.getByRole("button",{name:"Subtitles",exact:true}).click();
 await guestPage.getByRole("switch",{name:"Show subtitles on my screen"}).click();
 assert.equal(await guestPage.locator("video").evaluate(v=>v.textTracks[0].mode),"hidden");assert.equal(await hostPage.locator("video").evaluate(v=>v.textTracks[0].mode),"showing");
 assert.equal(await guestPage.locator('input[type="file"]').count(),0);
 await guestPage.getByRole("button",{name:"Close",exact:true}).click();
 // A new browser receives subtitles without having participated in the upload.
 const lateContext=await browser.newContext();await lateContext.addInitScript(instrumentVoice);await lateContext.route("**/api/rooms/*/stream?*",mediaRoute);const latePage=await lateContext.newPage();
 await latePage.goto(`http://127.0.0.1:5173/?room=${id}`);await latePage.getByRole("dialog").getByLabel("Your name",{exact:true}).fill("Late Guest");await latePage.getByRole("button",{name:"Join the room",exact:true}).click();
 await latePage.waitForFunction(()=>document.querySelector("video")?.textTracks[0]?.activeCues?.[0]?.text==="Shared subtitle");
 await hostPage.getByRole("button",{name:"Subtitles",exact:true}).click();
 await hostPage.getByLabel("Replace subtitle file",{exact:true}).setInputFiles({name:"bad.srt",mimeType:"text/plain",buffer:Buffer.from("bad subtitle")});
 await hostPage.getByRole("alert").filter({hasText:"Couldn’t read"}).waitFor();assert.equal(await guestPage.locator("video").evaluate(v=>v.textTracks[0].cues[0].text),"Shared subtitle");
 await hostPage.getByLabel("Replace subtitle file",{exact:true}).setInputFiles({name:"replacement.vtt",mimeType:"text/vtt",buffer:Buffer.from("WEBVTT\n\n00:00.000 --> 00:06.000\nReplacement subtitle")});
 await guestPage.waitForFunction(()=>document.querySelector("video").textTracks[0]?.cues?.[0]?.text==="Replacement subtitle");
 assert.equal(await guestPage.locator("video").evaluate(v=>v.textTracks[0].mode),"hidden");
 await hostPage.getByRole("button",{name:"Remove subtitles for everyone",exact:true}).click();
 await guestPage.waitForFunction(()=>document.querySelector("video").textTracks[0]?.mode==="disabled" && !document.querySelector("video").textTracks[0]?.cues?.length);
 await latePage.waitForFunction(()=>document.querySelector("video").textTracks[0]?.mode==="disabled" && !document.querySelector("video").textTracks[0]?.cues?.length);
 await hostPage.getByRole("button",{name:"Close",exact:true}).click();
 await hostPage.getByLabel("Message the room",{exact:true}).fill("Hello, movie crew!\n<script>plain text</script>");await hostPage.getByRole("button",{name:"Send message",exact:true}).click();
 await guestPage.getByRole("log").getByText("Hello, movie crew!",{exact:false}).waitFor();
 await latePage.getByRole("log").getByText("Hello, movie crew!",{exact:false}).waitFor();
 assert.equal(await guestPage.locator('.chat-message script').count(),0);
 await guestPage.getByLabel("Message the room",{exact:true}).fill("Hi from the guest!");await guestPage.getByLabel("Message the room",{exact:true}).press("Enter");
 await hostPage.getByRole("log").getByText("Hi from the guest!",{exact:true}).waitFor();
 await latePage.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException("Denied for test","NotAllowedError");};});
 await latePage.getByRole("button",{name:"Join voice",exact:true}).click();
 await latePage.getByRole("alert").filter({hasText:"Microphone access was denied"}).waitFor();
 assert.equal(await latePage.getByRole("button",{name:"Join voice",exact:true}).isEnabled(),true);
 await hostPage.getByRole("button",{name:"Join voice",exact:true}).click();await hostPage.getByRole("button",{name:"Mute microphone",exact:true}).waitFor();
 await guestPage.getByRole("button",{name:"Join voice",exact:true}).click();await guestPage.getByRole("button",{name:"Mute microphone",exact:true}).waitFor();
 for(const page of [hostPage,guestPage]) {
  await page.waitForFunction(()=>window.__voicePCs.some(pc=>pc.connectionState==="connected"),null,{timeout:20000});
  await page.waitForFunction(async()=>{for(const pc of window.__voicePCs){const stats=await pc.getStats();if(Array.from(stats.values()).some(stat=>stat.type==="inbound-rtp"&&stat.kind==="audio"&&stat.packetsReceived>0))return true;}return false;},null,{timeout:10000});
 }
 await latePage.evaluate(()=>{navigator.mediaDevices.getUserMedia=window.__micCapture;});
 await latePage.getByRole("button",{name:"Join voice",exact:true}).click();await latePage.getByRole("button",{name:"Mute microphone",exact:true}).waitFor();
 for(const page of [hostPage,guestPage,latePage]) {
  await page.waitForFunction(()=>window.__voicePCs.filter(pc=>pc.connectionState==="connected").length===2,null,{timeout:20000});
  await page.waitForFunction(async()=>{let receiving=0;for(const pc of window.__voicePCs){const stats=await pc.getStats();if(Array.from(stats.values()).some(stat=>stat.type==="inbound-rtp"&&stat.kind==="audio"&&stat.packetsReceived>0))receiving++;}return receiving===2;},null,{timeout:10000});
 }
 await hostPage.getByRole("button",{name:"Mute microphone",exact:true}).click();
 assert.equal(await hostPage.evaluate(()=>window.__voiceStreams[0].getAudioTracks()[0].enabled),false);
 assert.equal(await guestPage.evaluate(()=>window.__voiceStreams[0].getAudioTracks()[0].enabled),true);
 assert.equal(await hostPage.locator("video").evaluate(video=>video.muted),false);
 await hostPage.getByRole("button",{name:"Unmute microphone",exact:true}).click();
 assert.equal(await hostPage.evaluate(()=>window.__voiceStreams[0].getAudioTracks()[0].enabled),true);
 await hostPage.screenshot({path:"outputs/chat-voice.png",fullPage:true,caret:"initial"});
 await hostPage.getByRole("button",{name:"Leave voice",exact:true}).click();
 assert.equal(await hostPage.evaluate(()=>window.__voiceStreams.every(stream=>stream.getTracks().every(track=>track.readyState==="ended"))),true);
 await guestPage.getByRole("button",{name:"Leave room",exact:true}).click();
 await guestPage.getByRole("button",{name:"Create a room",exact:true}).waitFor();
 assert.equal(await guestPage.evaluate(()=>window.__voiceStreams.every(stream=>stream.getTracks().every(track=>track.readyState==="ended"))),true);
 await latePage.getByRole("button",{name:"Leave voice",exact:true}).click();
 assert.equal(await latePage.evaluate(()=>window.__voiceStreams.every(stream=>stream.getTracks().every(track=>track.readyState==="ended"))),true);
 await latePage.setViewportSize({width:390,height:844});assert.equal(await latePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await latePage.screenshot({path:"outputs/chat-mobile.png",fullPage:true,caret:"initial"});
 await lateContext.close();
 console.log("Conversation browser checks passed: shared multiline text, plain-text safety, late-join history, guest messages, actual three-person WebRTC audio packets in every direction, permission denial, independent mic mute, and microphone cleanup on leaving voice or the room.");
 console.log("Browser subtitle checks passed: SRT/WebVTT uploads, active timed cues, sharing, late joins, independent visibility, invalid replacement preservation, replacement, and removal.");
 await hostPage.getByRole("dialog").waitFor({state:"hidden"});
 await hostPage.screenshot({path:"outputs/room.png",fullPage:true,caret:"initial"});assert.deepEqual(errors,[]);
 console.log("Browser checks passed: desktop/mobile layout, joins, host play/pause/seek, guest sync, independent mute, and no browser exceptions.");
 console.log("Video bytes are a local test fixture; an actual user Drive video was not supplied.");
}finally{await browser.close();await db.prepare("DELETE FROM rooms WHERE id = ?").run(id);await db.close();}
