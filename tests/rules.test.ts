import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ruleCheck, tempPair, unitPriceInr, verifyAll } from "../lib/verify";
import { extractFromMarkdown } from "../lib/extract";
import type { Listing } from "../lib/schema";
const spec = {mpn:"STM32F103C8T6", package:"LQFP-48", temp_range:"-40 to +85 °C", qty:500};
const listing: Listing = JSON.parse(readFileSync("tests/fixtures/lcsc.json", "utf8"));
test("exact seller and mismatched package/MPN", () => {
 assert.equal(ruleCheck(listing,spec,null).verdict,"green");
 assert.equal(ruleCheck({...listing,mpn:spec.mpn+"X"},spec,null).verdict,"red");
 assert.equal(ruleCheck(listing,{...spec,package:"QFN-32"},null).verdict,"red");
});
test("unicode minus, MOQ, inactive lifecycle, insufficient stock", () => {
 assert.deepEqual(tempPair("−40 to +85 °C"),[-40,85]);
 assert.equal(ruleCheck({...listing,moq:1000},spec,null).verdict,"amber");
 assert.equal(ruleCheck({...listing,lifecycle:"Inactive"},spec,null).verdict,"amber");
 assert.equal(ruleCheck({...listing,stock:10},spec,null).verdict,"amber");
});
test("cannot quote an inaccessible price tier", () => {
 assert.equal(unitPriceInr({...listing,price_breaks:[{qty:1000,unit_price:1,currency:"USD"}]},500),null);
});
test("extraction does not confirm a different MPN with matching prefix", () => {
 const x=extractFromMarkdown("STM32F103C8T6X Stock: 500",{seller:"Test",seller_type:"broker",mpn:spec.mpn,url:"https://example.com"});
 assert.equal(x.mpn,null);
});
test("offline verification ranks and uses changed quantity", async () => {
 const out=await verifyAll([{listing,source:"cached"}],{...spec,qty:1000000},null,true);
 assert.equal(out.rows[0].verdict,"amber"); assert.equal(out.rows[0].rank,1);
});

test("Gemini cannot relax rules or attach a contradictory green reason", async () => {
 const original=globalThis.fetch,key=process.env.GEMINI_API_KEY;
 process.env.GEMINI_API_KEY="test";
 globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify([{seller:listing.seller,verdict:"green",reason:"Perfect match"}])}]}}]});
 try{
  const out=await verifyAll([{listing:{...listing,mpn:"WRONG"},source:"live"}],spec,null);
  assert.equal(out.rows[0].verdict,"red"); assert.match(out.rows[0].reason,/different part/);
  globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:"{}"}]}}]});
  assert.equal((await verifyAll([{listing,source:"live"}],spec,null)).rows[0].verdict,"green");
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});
