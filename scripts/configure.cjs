#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {parse}=require('../bin/options.cjs'),{plainPath}=require('../src/core/index.cjs');
const shellQuote=text=>`'${String(text).replace(/'/g,"'\\''")}'`;
(async()=>{
  const {options}=parse(process.argv.slice(2));
  if(!options.output||!path.isAbsolute(options.output))throw new Error('Explicit absolute --output directory required; no real profile is edited automatically');
  if(!['codex-cli','claude-code','pi-cli','kimi-cli'].includes(options.host))throw new Error('Select a CLI host');
  const root=path.resolve(__dirname,'..'),commandRoot=path.resolve(options.root??root);
  await plainPath(options.output,{create:true});
  if(options.host==='codex-cli'){
    const templateFile=require('node:fs').existsSync(path.join(root,'adapters/codex-cli/hooks.template.json'))?path.join(root,'adapters/codex-cli/hooks.template.json'):path.join(root,'hooks.template.json');
    const template=JSON.parse(await fs.readFile(templateFile,'utf8'));
    for(const groups of Object.values(template.hooks))for(const group of groups)for(const hook of group.hooks)hook.command=`node ${shellQuote(path.join(commandRoot,'bin/hook.cjs'))} --host codex-cli`;
    await fs.writeFile(path.join(options.output,'hooks.json'),JSON.stringify(template,null,2)+'\n',{flag:'wx'});
    await fs.writeFile(path.join(options.output,'mcp.config.toml'),`[mcp_servers.zcode_memory]\ncommand = "node"\nargs = ${JSON.stringify([path.join(commandRoot,'bin/mcp.cjs'),'--host','codex-cli'])}\n`,{flag:'wx'});
    const guide=require('node:fs').existsSync(path.join(root,'adapters/codex-cli/AGENTS.md'))?path.join(root,'adapters/codex-cli/AGENTS.md'):path.join(root,'AGENTS.md');
    await fs.copyFile(guide,path.join(options.output,'AGENTS.md'),require('node:fs').constants.COPYFILE_EXCL);
  }else if(options.host==='kimi-cli'){
    // Generate a complete reviewable plugin, not a manifest pointing outside its root.
    const source=require('node:fs').existsSync(path.join(root,'adapters/kimi-cli/kimi.plugin.json'))?path.join(root,'dist/kimi-cli'):root;
    if(!require('node:fs').existsSync(path.join(source,'kimi.plugin.json')))throw new Error('Build first: npm run pack; then configure the complete Kimi plugin');
    if((await fs.readdir(options.output)).length)throw new Error('Kimi output directory must be empty; refusing overwrite');
    if(path.resolve(source)===path.resolve(options.output)||path.resolve(options.output).startsWith(path.resolve(source)+path.sep))throw new Error('Output must be outside the source plugin');
    for(const entry of await fs.readdir(source))await fs.cp(path.join(source,entry),path.join(options.output,entry),{recursive:true,errorOnExist:true,force:false});
  }else{
    await fs.writeFile(path.join(options.output,'mcp.json'),JSON.stringify({mcpServers:{zcode_memory:{command:'node',args:[path.join(commandRoot,'bin/mcp.cjs'),'--host',options.host]}}},null,2)+'\n',{flag:'wx'});
  }
  console.log(`Generated reviewable ${options.host} configuration in ${options.output}`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
