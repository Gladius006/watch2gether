import {NetlifyDB} from '@netlify/database-dev';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const database=new NetlifyDB({logger:()=>{}});
let app,diagnostics='';
try {
 const url=await database.start();await database.applyMigrations('netlify/database/migrations');
 // PGlite shares one backend; parallel unnamed statements on separate sockets collide.
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','5173'],{env:{...process.env,NETLIFY_DB_URL:url,DATABASE_POOL_SIZE:'1',NODE_ENV:'production'},stdio:['ignore','ignore','pipe'],windowsHide:true});
 app.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk).slice(-10000);});
 const deadline=Date.now()+45000;
 let ready=false;
 while(Date.now()<deadline){if(app.exitCode!==null)throw new Error('Production server exited before starting.');try{const response=await fetch('http://127.0.0.1:5173');if(response.ok){ready=true;break;}}catch{}await delay(300);}
 if(!ready)throw new Error('Production server did not start in time.');
 const result=await new Promise((resolve,reject)=>{
  const test=spawn(process.execPath,['scripts/test-browser.mjs'],{env:{...process.env,TEST_DATABASE_URL:url},stdio:'inherit',windowsHide:true});
  test.on('error',reject);test.on('exit',resolve);
 });
 if(result!==0)throw new Error('Production browser checks failed.');
 console.log('Production Next.js/PostgreSQL browser checks passed.');
} catch(error){console.error(diagnostics.replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted]'));throw error;}
finally{if(app && app.exitCode===null)app.kill();await database.stop();}
