import fs from "node:fs/promises";
const base="http://localhost:3000";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(path,body){const r=await fetch(base+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
const spec={mpn:"STM32F103C8T6",package:"LQFP-48",temp_range:"-40 to +85 °C",qty:500};
let start;
for(let i=0;i<75;i++){start=await call("/api/search",spec);if(start.status!==409)break;if(i%6===0)console.log("Waiting for existing live search to finish");await sleep(5000);}
if(start.status!==200)throw new Error(JSON.stringify(start));
console.log("Live search started:",start.data.id);
let job;
for(let i=0;i<90;i++){job=(await call(`/api/search/${start.data.id}`)).data;if(i%3===0||job.status==="done")console.log(JSON.stringify({status:job.status,sellers:job.sellers.map(s=>({id:s.id,status:s.status,note:s.note}))}));if(job.status==="done")break;await sleep(5000);}
const summary={at:new Date().toISOString(),id:job.id,status:job.status,error:job.error,verifier:job.verifier,sellers:job.sellers.map(s=>({id:s.id,status:s.status,note:s.note,listing:s.listing})),rows:job.rows};
await fs.writeFile("data/live-qa.json",JSON.stringify(summary,null,2));
console.log("Live result:",JSON.stringify({status:job.status,verifier:job.verifier,rows:job.rows?.map(r=>({seller:r.seller,source:r.source,verdict:r.verdict}))}));
