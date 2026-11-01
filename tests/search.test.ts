import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { startSearch, anyRunning } from "../lib/search";
test("parallel live orchestration with mocked TinyFish success",async()=>{
 const original=globalThis.fetch, key=process.env.TINYFISH_API_KEY;
 process.env.TINYFISH_API_KEY="test";
 const spec={mpn:"TESTPART123",package:"LQFP-48",temp_range:"-40 to +85 °C",qty:10};
 let runs=0;
 globalThis.fetch=async(url)=>{
  const u=String(url);
  if(u.includes("run-async"))return Response.json({run_id:`run-${++runs}`});
  if(u.includes("/runs/"))return Response.json({status:"COMPLETED",result:{mpn:spec.mpn,stock:100,moq:1,package:spec.package,temp_range:spec.temp_range,lifecycle:"Active",price_breaks:[{qty:1,unit_price:2,currency:"INR"}],url:"https://example.com/product"}});
  if(u.includes("api.search"))return Response.json({results:[{url:"https://www.dnatechindia.com/test"}]});
  return Response.json({results:[{text:`${spec.mpn}\nStock: 100\nPackage: LQFP-48\nTemperature Range: -40 to +85 °C\nRs. 2 + GST`,final_url:"https://example.com/product"}]});
 };
 const job=startSearch(spec);
 try{
  assert.equal(anyRunning(),true);
  const deadline=Date.now()+10000;
  while(job.status!=="done"&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
  assert.equal(job.status,"done");assert.equal(job.rows?.length,4);
  assert.ok(job.sellers.every(s=>s.source==="live"));assert.equal(anyRunning(),false);
 }finally{
  globalThis.fetch=original;
  if(key===undefined)delete process.env.TINYFISH_API_KEY;else process.env.TINYFISH_API_KEY=key;
  await rm("data/cache/TESTPART123",{recursive:true,force:true});
  await rm("data/demo/TESTPART123.json",{force:true});
  await rm(`data/searches/${job.id}.json`,{force:true});
 }
});
