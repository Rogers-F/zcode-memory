'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const {MemoryStore}=require('../src/core/index.cjs');
async function temporary(t,host='pi-cli',options={}){const base=process.env.ZCODE_MEMORY_TEST_ROOT;if(!base)throw new Error('Run through scripts/test.cjs for isolated HOME/TMP');const root=await fs.mkdtemp(path.join(base,'memory-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,store:new MemoryStore({root:path.join(root,'memory'),host,project:'/test/project',...options})};}
module.exports={temporary};
