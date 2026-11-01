#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const {HostMemory}=require('../src/protocol/service.cjs');const {importExchange}=require('../src/core/index.cjs');const {parse,serviceOptions,readInput}=require('./options.cjs');
(async()=>{const {options,rest}=parse(process.argv.slice(2));const command=rest[0]??'help';if(command==='help'){console.log('zcode-memory --host <pi-desktop|dsh|claude-code|codex-cli|pi-cli> [--home PATH] [--project PATH] <save|read|list|recall|forget|repair|restore|settings|stats|dream|import|export|context|extract|exchange-import> [JSON]\nAutomatic extraction and model calls default off. JSON may also be supplied on stdin.');return;}
  const service=new HostMemory(serviceOptions(options));let args=rest[1]?JSON.parse(rest[1]):process.stdin.isTTY?{}:await readInput();if(command==='dream'&&options.apply)args.apply=true;try{let value;
    if(command==='context')value=await service.injection(args);
    else if(command==='extract'){await service.prepare();value=await service.engine().extract(args,{manual:options.manual});}
    else if(command==='exchange-import')value=await importExchange(service.store(),args.bundle,{sourceProject:args.sourceProject});
    else value=await service.tool(`memory_${command}`,args);
    console.log(JSON.stringify(value,null,2));
  }finally{await service.close();}
})().catch(e=>{console.error(`${e.code??e.name}: ${e.message}`);process.exitCode=1;});
