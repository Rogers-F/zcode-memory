'use strict';
const path=require('node:path');const {hash,assertSafe}=require('./text.cjs');const {parseFact}=require('./format.cjs');const {markdownFiles}=require('./store.cjs');const {plainPath,readSafe,fail,relativeFile,abort}=require('./paths.cjs');
async function commitImport(store,operations,{signal,session,source,prefix},skipped){
  const parts=[];
  for(let i=0;i<operations.length;i+=50){const batch=operations.slice(i,i+50);const opts={signal,session,source,origin:'imported',operationId:`${prefix}:${hash(JSON.stringify(batch.map(x=>x.importKey)))}`};
    try{parts.push(await store.apply(batch,opts));}catch(error){abort(signal);if(batch.length===1){skipped.push({path:batch[0].path,code:error.code??'IMPORT_ERROR',reason:'File not imported; source preserved'});continue;}for(const op of batch){try{parts.push(await store.apply([op],{...opts,operationId:`${prefix}:file:${op.importKey}`}));}catch(e){abort(signal);skipped.push({path:op.path,code:e.code??'IMPORT_ERROR',reason:'File not imported; source preserved'});}}}
  }
  return {results:parts.flatMap(p=>p.results),generation:parts.at(-1)?.generation??(await store.catalog({signal})).generation,replayed:parts.length>0&&parts.every(p=>p.replayed===true),skipped};
}
async function importDirectory(store,{sourceDir,sourceHost,sourceProject,session='migration',settings,signal}={}) {
  if(!path.isAbsolute(sourceDir??'')||!sourceHost||!sourceProject)throw fail('MAPPING_REQUIRED','Explicit absolute source directory, source host and project mapping required');
  await plainPath(sourceDir);const operations=[],skipped=[];
  for(const rel of await markdownFiles(sourceDir,'',skipped)){abort(signal);try{relativeFile(store.root,rel);const read=await readSafe(sourceDir,rel);assertSafe(read.content);const fact=parseFact(read.content);operations.push({action:'save',path:rel,content:read.content,type:fact.type,importKey:hash(`${sourceHost}:${sourceProject}:${rel}:${read.revision}`)});}catch(error){abort(signal);skipped.push({path:rel,code:error.code??'INVALID_FACT',reason:'File skipped; source preserved; repair source or explicitly map another source'});}}
  const result=await commitImport(store,operations,{signal,session,source:{host:sourceHost,project:sourceProject},prefix:'import'},skipped);
  if(settings){const selected=settings.autoExtract??(settings.enabled===false?false:settings.extractionEnabled??settings.enabled);if(typeof selected==='boolean'&&(await store.catalog({signal})).settings.autoExtract!==selected)await store.configure({autoExtract:selected},{signal});}
  return result;
}
async function importExchange(store,bundle,{sourceProject,signal}={}) {
  if(bundle?.format!=='zcode-memory-exchange'||bundle.version!==1||!Array.isArray(bundle.facts)||!sourceProject)throw fail('INVALID_EXCHANGE','Valid exchange and explicit source project mapping required');
  const operations=[],skipped=[];for(const f of bundle.facts){abort(signal);try{relativeFile(store.root,f.path);if(hash(f.content)!==f.revision)throw fail('INVALID_EXCHANGE','Hash mismatch');assertSafe(f.content);parseFact(f.content);operations.push({action:'save',path:f.path,content:f.content,importKey:hash(`${bundle.host}:${sourceProject}:${f.path}:${f.revision}`)});}catch(e){skipped.push({path:f.path,code:e.code??'INVALID_FACT',reason:'Exchange file skipped'});}}
  return commitImport(store,operations,{signal,session:'exchange-import',source:{host:bundle.host,project:sourceProject},prefix:'exchange'},skipped);
}
module.exports={importDirectory,importExchange};
