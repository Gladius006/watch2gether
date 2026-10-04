export class AppError extends Error { constructor(message:string, public status=400){super(message);} }
export const VIDEO_CHUNK_BYTES = 2 * 1024 * 1024;
export function boundedVideoRange(range: string | null) {
  if (!range) return `bytes=0-${VIDEO_CHUNK_BYTES - 1}`;
  const match = range.match(/^bytes=(\d+)-(\d*)$/);
  const start = Number(match?.[1]), requestedEnd = match?.[2] ? Number(match[2]) : Infinity;
  if (!match || !Number.isSafeInteger(start) || (requestedEnd !== Infinity && (!Number.isSafeInteger(requestedEnd) || requestedEnd < start)) || start > Number.MAX_SAFE_INTEGER - VIDEO_CHUNK_BYTES) {
    throw new AppError("Unsupported video byte range.", 416);
  }
  return `bytes=${start}-${Math.min(requestedEnd, start + VIDEO_CHUNK_BYTES - 1)}`;
}
export function parseDriveLink(input:unknown) {
  if(typeof input!=="string" || input.length>2048) throw new AppError("Paste a Google Drive video sharing link.");
  let url:URL;try{url=new URL(input);}catch{throw new AppError("Paste a valid Google Drive link.");}
  if(url.protocol!=="https:" || url.hostname!=="drive.google.com" || url.username || url.password) throw new AppError("Use a sharing link from drive.google.com.");
  const id=url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.searchParams.get("id");
  const key=url.searchParams.get("resourcekey");
  if(!id || !/^[a-zA-Z0-9_-]{10,200}$/.test(id) || (key&&!/^[a-zA-Z0-9_-]{1,200}$/.test(key))) throw new AppError("This link doesn’t identify a Drive video. Copy the link from the video’s Share menu.");
  return {id,key};
}
function allowed(url:URL) {return url.protocol==="https:" && !url.username && !url.password && (url.hostname==="drive.google.com" || url.hostname==="drive.usercontent.google.com" || url.hostname.endsWith(".googleusercontent.com"));}
async function googleFetch(initial:URL, range?:string) {
  let url=initial;
  for(let i=0;i<6;i++) {
    if(!allowed(url)) throw new AppError("Google returned an unsupported download location.",502);
    // Bound the wait for headers without interrupting a long video response.
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
    let response:Response;try{response=await fetch(url,{headers:range?{Range:range}:{},redirect:"manual",signal:controller.signal});}finally{clearTimeout(timeout);}
    if([301,302,303,307,308].includes(response.status)) {const next=response.headers.get("location");await response.body?.cancel();if(!next)break;url=new URL(next,url);continue;}
    return response;
  }
  throw new AppError("The video download couldn’t be opened. Try again.",502);
}
export async function driveMedia(id:string,key:string|null,range?:string) {
  if(range && !/^bytes=\d+-\d*$/.test(range)) throw new AppError("Unsupported video byte range.",416);
  const url=new URL("https://drive.usercontent.google.com/download");
  url.searchParams.set("id",id);url.searchParams.set("export","download");url.searchParams.set("confirm","t");if(key)url.searchParams.set("resourcekey",key);
  let response=await googleFetch(url,range);
  if(response.headers.get("content-type")?.includes("text/html")) {
    // Drive can require its large-file confirmation form, even for public videos.
    const reader=response.body?.getReader();let html="";const decoder=new TextDecoder();
    if(reader) {try{while(html.length<65536){const part=await reader.read();if(part.done)break;html+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel();}}
    const form=html.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
    if(!form) throw new AppError("Google didn’t allow access to this video. Set sharing to “Anyone with the link” and allow viewers to download. Drive download quotas may also apply.",422);
    const confirmed=new URL(form[1].replaceAll("&amp;","&"));
    if(confirmed.hostname!=="drive.usercontent.google.com" || confirmed.pathname!=="/download" || !allowed(confirmed)) throw new AppError("Google didn’t return a playable video.",422);
    for(const input of form[2].matchAll(/<input\b[^>]*>/gi)) {const name=input[0].match(/\bname="([^"]+)"/)?.[1], value=input[0].match(/\bvalue="([^"]*)"/)?.[1];if(name&&value&&["id","export","confirm","uuid","resourcekey"].includes(name))confirmed.searchParams.set(name,value.replaceAll("&amp;","&"));}
    if(confirmed.searchParams.get("id")!==id)throw new AppError("Google returned a different file.",502);
    response=await googleFetch(confirmed,range);
  }
  if(response.status===416) return response;
  if(!response.ok) {await response.body?.cancel();throw new AppError("Drive couldn’t stream the video. Check sharing and download permissions, or try again later.",422);}
  const type=response.headers.get("content-type")||"";
  if(!type.startsWith("video/") && !type.startsWith("application/octet-stream")) {await response.body?.cancel();throw new AppError("This Drive file isn’t a downloadable video. Use an MP4 video with public link access.",422);}
  return response;
}
export function videoFilename(response:Response) {
  const disposition=response.headers.get("content-disposition")||"";
  const encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  try{if(encoded)return decodeURIComponent(encoded).slice(0,200);}catch{}
  return disposition.match(/filename="([^"]+)"/i)?.[1]?.slice(0,200)||"Google Drive video";
}
