#!/usr/bin/env node
'use strict';
const {HostMemory}=require('../src/protocol/service.cjs');const {handleHook}=require('../src/protocol/hooks.cjs');const {parse,serviceOptions,readInput}=require('./options.cjs');
(async()=>{const options=parse(process.argv.slice(2)).options;const payload=await readInput();const service=new HostMemory({...serviceOptions(options),project:options.project??payload.cwd??process.cwd()});try{const result=await handleHook(service,payload);const text=result.hookSpecificOutput?.additionalContext;if(text)process.stdout.write(service.options.host==='kimi-cli'?text:JSON.stringify(result)+'\n');}finally{await service.close();}})().catch(e=>{process.stderr.write(`zcode-memory: ${e.code??e.name}: ${e.message}\n`);process.exitCode=0;});
