const {rmSync}=require('node:fs');
const {join,basename}=require('node:path');
const target=join(__dirname,'.finance-test');
if(basename(target)!=='.finance-test')throw new Error('Unexpected cleanup target');
rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:100});
