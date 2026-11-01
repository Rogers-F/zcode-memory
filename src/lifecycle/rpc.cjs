'use strict';
const {spawn}=require('node:child_process');
// Control-plane JSON RPC only. This helper never starts a model turn or grants
// a host permission request. Callers select the installed native executable.
class NativeRpc {
  constructor(command,args,{env=process.env,cwd=process.cwd(),timeoutMs=15000}={}) {
    this.pending=new Map();this.events=[];this.errors='';this.next=0;this.timeoutMs=timeoutMs;
    this.child=spawn(command,args,{env,cwd,stdio:['pipe','pipe','pipe']});let buffer='';
    const rejectAll=error=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();};
    this.child.on('error',rejectAll);this.child.on('exit',()=>rejectAll(Error('Native control process exited')));
    this.child.stdin.on('error',rejectAll);
    this.child.stderr.on('data',b=>{this.errors=(this.errors+b).slice(-32000);});
    this.child.stdout.on('data',b=>{buffer+=b;if(buffer.length>8*1024*1024){rejectAll(Error('Native RPC output exceeded budget'));this.child.kill();return;}while(buffer.includes('\n')){const at=buffer.indexOf('\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+1);let msg;try{msg=JSON.parse(line);}catch{continue;}const p=this.pending.get(msg.id);if(p){clearTimeout(p.timer);this.pending.delete(msg.id);msg.error?p.reject(Object.assign(Error(msg.error.message??JSON.stringify(msg.error)),{code:msg.error.code})):p.resolve(msg.result);}else if(msg.method&&msg.id!==undefined){this.events.push(msg);this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'No interactive permission or client tool execution from lifecycle control'}})+'\n');}else this.events.push(msg);}});
  }
  request(method,params={}){return new Promise((resolve,reject)=>{const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Native ${method} timeout`));},this.timeoutMs);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
  notify(method,params={}){this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');}
  async close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Native RPC closed'));}this.pending.clear();this.child.stdin.end();if(this.child.exitCode===null){this.child.kill();await new Promise(resolve=>{const t=setTimeout(resolve,1000);this.child.once('exit',()=>{clearTimeout(t);resolve();});});}}
}
module.exports={NativeRpc};
