/** SPDX-License-Identifier: Apache-2.0
 * DSH port tests for ZCode memory engine; modified to use node:test and temporary workspace storage.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryStorage } from '../src/storage.js';
export const testRoot = dirname(fileURLToPath(import.meta.url));
export const workspace = resolve(testRoot, 'engine-workspace');
export const memoryRoot = join(workspace, 'memory');
export const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Agent', 'WebFetch', 'OtherReadOnly', 'mcp__server__lookup'].map(name => ({name, inputSchema:{type:'object'}, sideEffectScope: name === 'WebFetch' ? 'network' : 'none'}));
export function deferred() { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;}); return {promise,resolve,reject}; }
export function user(id, text='Please remember this preference') { return {id,role:'user',parts:[{type:'text',text}]}; }
export function snapshot(id, messages=[user(id)]) { return {boundaryMessageId:id,durableMessages:messages,messages:[{role:'system',content:'Full main context'},{role:'user',content:'Please remember this preference'}],tools,memoryRoot,workingDirectory:workspace,workspaceRoot:workspace,readState:new Map()}; }
export function model(generateText) { return {generateText,properties:{supportsJsonSchemaOutput:true},optionSpecs:{reasoningLevel:{values:['low','high']},maxOutputTokens:{max:32000}}}; }
export async function temporaryStorage(t) {
  const root = await mkdtemp(join(testRoot,'engine-temp-'));
  t.after(async()=>{ if (!root.startsWith(join(testRoot,'engine-temp-'))) throw new Error('Unsafe cleanup target'); await rm(root,{recursive:true,force:true}); });
  const storage=createMemoryStorage({rootDir:root,sessionId:'engine-session'});
  await storage.ensure();
  return storage;
}
export function storageExecutor(storage) {
  return async (call,{readState,abortSignal}) => {
    try {
      abortSignal?.throwIfAborted();
      const args=call.input;
      if(call.name==='Read'||call.name==='read') return {success:true,output:await storage.read(args.file_path,{readState,signal:abortSignal})};
      if(call.name==='Write'||call.name==='write') return {success:true,output:await storage.write(args.file_path,args.content,{readState,signal:abortSignal})};
      if(call.name==='Edit'||call.name==='edit') return {success:true,output:await storage.edit(args.file_path,args.old_string,args.new_string,{readState,signal:abortSignal,replaceAll:args.replace_all})};
      throw new Error('Unexpected test tool '+call.name);
    } catch(error) { if(abortSignal?.aborted) throw error; return {success:false,error:{message:error.message}}; }
  };
}
