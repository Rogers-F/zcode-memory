'use strict';
const fs=require('node:fs'),path=require('node:path');
const bundled=path.join(__dirname,'unified');
module.exports=fs.existsSync(path.join(bundled,'core/index.cjs'))?{...require(path.join(bundled,'core/index.cjs')),...require(path.join(bundled,'protocol/service.cjs'))}:{...require('../../src/core/index.cjs'),...require('../../src/protocol/service.cjs')};

module.exports.memoryTools = module.exports.tools;
