import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { addWatch, checkWatch, clearAlert, listWatches } from "../lib/watch";
test("watch creation, duplicate requests, checks, unknown stock, restock, simulation and dismissal",async()=>{
 const file="data/watch.json";
 const original=await readFile(file).catch(()=>null);
 const originalFetch=globalThis.fetch;
 const key=process.env.TINYFISH_API_KEY;
 process.env.TINYFISH_API_KEY="test-only";
 let page="Out of Stock",created=0;
 globalThis.fetch=async(_url,init)=>{
  const creation=String(_url).endsWith("/monitors");
  if(creation)created++;
  assert.equal(new Headers(init?.headers).get("X-API-Key"),"test-only");
  return Response.json({monitor:{id:"test-monitor"},run:{results:[{text:page}]}});
 };
 try{
  await writeFile(file,"[]");
  const [a,b]=await Promise.all([addWatch("TEST","ST","https://estore.st.com/test"),addWatch("TEST","ST","https://estore.st.com/test")]);
  assert.equal(a.id,b.id);assert.equal(created,1);
  assert.equal((await checkWatch(a.id,false))?.checks.at(-1)?.inStock,false);
  page="Unavailable";await checkWatch(a.id,false);
  page="In Stock";assert.ok((await checkWatch(a.id,false))?.alert);
  assert.equal(await clearAlert(a.id),true);
  assert.equal((await listWatches())[0].alert,null);
  page="Out of Stock";await checkWatch(a.id,false);
  assert.equal((await checkWatch(a.id,true))?.alert?.simulated,true);
  await clearAlert(a.id);
  assert.equal((await checkWatch(a.id,true))?.alert?.simulated,true);
  for(let i=0;i<12;i++){await clearAlert(a.id);await checkWatch(a.id,true);}
  await clearAlert(a.id);
  page="In Stock";const real=await checkWatch(a.id,false);
  assert.equal(real?.alert?.simulated,undefined);assert.equal(real?.alert?.inStock,true);
  assert.equal(await checkWatch("unknown",false),null);
  assert.equal(await clearAlert("unknown"),false);
 }finally{
  globalThis.fetch=originalFetch;
  if(key===undefined)delete process.env.TINYFISH_API_KEY;else process.env.TINYFISH_API_KEY=key;
  if(original)await writeFile(file,original);else await unlink(file).catch(()=>{});
 }
});
