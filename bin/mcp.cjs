#!/usr/bin/env node
'use strict';
const {HostMemory}=require('../src/protocol/service.cjs');const {serveMcp}=require('../src/protocol/mcp.cjs');const {parse,serviceOptions}=require('./options.cjs');
try{serveMcp(new HostMemory(serviceOptions(parse(process.argv.slice(2)).options)));}catch(e){process.stderr.write(`${e.code??'ERROR'}: ${e.message}\n`);process.exitCode=1;}
