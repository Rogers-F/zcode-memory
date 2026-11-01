#!/usr/bin/env node
'use strict';
const {HostMemory}=require('../src/protocol/service.cjs');const {handleHook}=require('../src/protocol/hooks.cjs');const {parse,serviceOptions,readInput}=require('./options.cjs');
(async()=>{const options=parse(process.argv.slice(2)).options;const payload=await readInput();const service=new HostMemory({...serviceOptions(options),project:options.project??payload.cwd??process.cwd()});try{const result=await handleHook(service,payload);if(result.hookSpecificOutput?.additionalContext)process.stdout.write(JSON.stringify(result)+'\n');}finally{await service.close();}})().catch(e=>{process.stderr.write(`zcode-memory: ${e.code??e.name}: ${e.message}\n`);process.exitCode=0;});
