import { test } from "node:test";
import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
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
test("an empty live read is a failure and is never cached",async()=>{
 const original=globalThis.fetch, key=process.env.TINYFISH_API_KEY;
 process.env.TINYFISH_API_KEY="test";
 const spec={mpn:"TESTEMPTY456",package:"LQFP-48",temp_range:"-40 to +85 °C",qty:10};
 const empty={mpn:null,stock:null,moq:null,price_breaks:[],package:null,temp_range:null,url:null};
 globalThis.fetch=async(url)=>{
  const u=String(url);
  if(u.includes("run-async"))return Response.json({run_id:"run-empty"});
  if(u.includes("/runs/"))return Response.json({status:"COMPLETED",result:empty});
  if(u.includes("api.search"))return Response.json({results:[{url:"https://www.dnatechindia.com/contact.html"}]});
  return Response.json({results:[{text:"Contact us",final_url:"https://www.dnatechindia.com/contact.html"}]});
 };
 const job=startSearch(spec);
 try{
  const deadline=Date.now()+10000;
  while(job.status!=="done"&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
  assert.equal(job.status,"done");assert.deepEqual(job.rows,[]);
  assert.ok(job.sellers.every(s=>s.status==="failed"&&/part not found/.test(s.note)));
  assert.equal(await stat("data/cache/TESTEMPTY456").catch(()=>null),null);
 }finally{
  globalThis.fetch=original;
  if(key===undefined)delete process.env.TINYFISH_API_KEY;else process.env.TINYFISH_API_KEY=key;
  await rm("data/cache/TESTEMPTY456",{recursive:true,force:true});
  await rm("data/demo/TESTEMPTY456.json",{force:true});
  await rm(`data/searches/${job.id}.json`,{force:true});
 }
});
