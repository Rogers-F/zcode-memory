// Read-only verification of the public revisioned client resource on the EXISTING DSH GUI.
// Uses the exact installed dsh-client-modules artifactRevision algorithm; no credentials or memory reads.
import {stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [origin,file]=process.argv.slice(2);
if(!origin||!file)throw new Error('Usage: node scripts/verify-served-client.mjs <existing-gui-origin> <installed-client-file>');
const base=new URL(origin);
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw new Error('Only the existing local GUI may be probed');
const info=await stat(file);
const hash=createHash('sha1').update('plugin-artifact').update('\0');
for(const part of [String(info.mtimeMs),String(info.ctimeMs),String(info.size)])hash.update(`${Buffer.byteLength(part)}:`).update(part);
const rev=hash.digest('hex').slice(0,12);
const url=new URL(`/plugins/??@local/dsh-zcode-memory/client.js&rev=${rev}`,base);
const response=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(10000)});
const body=await response.text();
// esbuild's default charset serializes Chinese UI strings as Unicode escapes.
const readable=body.replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(Number.parseInt(hex,16)));
console.log(JSON.stringify({origin:base.origin,revision:rev,status:response.status,contentType:response.headers.get('content-type'),bytes:Buffer.byteLength(body),hasNativeSettings:readable.includes('settings.section'),hasEnableAction:readable.includes('开启工作区记忆'),hasNativeForms:readable.includes('configForms')},null,2));
if(response.status!==200)process.exitCode=2;
