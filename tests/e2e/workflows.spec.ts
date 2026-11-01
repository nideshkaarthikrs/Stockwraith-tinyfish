import { test, expect } from "@playwright/test";
const spec={mpn:"STM32F103C8T6",package:"LQFP-48",temp_range:"-40 to +85 °C",qty:500};
test("replay end to end, updated spec, mobile layout",async({page})=>{
 const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/"); await expect(page.getByRole("heading",{name:"Stockwraith",exact:true})).toBeVisible();
 await page.getByRole("checkbox").check(); await page.getByLabel("Quantity",{exact:true}).fill("1000000");
 await page.getByRole("button",{name:"Hunt stock",exact:true}).click();
 await expect(page.getByRole("table")).toBeVisible({timeout:25000});
 await expect(page.getByRole("heading",{name:/Verified results/})).toContainText("qty 1000000");
 await expect(page.getByRole("row")).toHaveCount(5);
 await expect(page.getByRole("button",{name:"Hunt stock",exact:true})).toBeEnabled();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:"test-results/mobile.png",fullPage:true});
 expect(errors).toEqual([]);
});
test("formatted quantity and tablet layout",async({page})=>{
 await page.setViewportSize({width:1024,height:768}); await page.goto("/");
 const qty=page.getByLabel("Quantity",{exact:true}); await qty.fill(""); await expect(qty).toHaveValue("");
 await qty.pressSequentially("2,500"); await expect(qty).toHaveValue("2,500");
 for(const width of [768,900,1024]){
  await page.setViewportSize({width,height:768});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 }
 await page.getByRole("checkbox").check();
 const searches:string[]=[]; page.on("request",r=>{if(r.url().endsWith("/api/search")&&r.method()==="POST")searches.push(r.url());});
 await qty.fill("1,2,3"); await page.getByRole("button",{name:"Hunt stock",exact:true}).click();
 await expect(page.getByText(/quantity must be a positive whole number/)).toBeVisible(); expect(searches).toEqual([]);
 await qty.fill("2,500"); await page.getByRole("button",{name:"Hunt stock",exact:true}).click();
 await expect(page.getByRole("heading",{name:/Verified results/})).toContainText("qty 2500");
});
test("API validation and missing records",async({request})=>{
 for(const body of [null,[],{}, {...spec,qty:-1},{...spec,qty:0},{...spec,qty:1.5},{...spec,qty:"16"},{...spec,qty:"0x10"},{...spec,replay:"false"},
  {...spec,temp_range:"-40 to +85 °F",replay:true},{...spec,temp_range:"-40 to 85 to 125 °C",replay:true}])
  expect((await request.post("/api/search",{data:body})).status()).toBe(400);
 expect((await request.post("/api/search",{data:"{",headers:{"Content-Type":"application/json"}})).status()).toBe(400);
 expect((await request.post("/api/search",{data:{...spec,mpn:"UNKNOWN",replay:true}})).status()).toBe(404);
 expect((await request.get("/api/search/not-found")).status()).toBe(404);
 expect((await request.post("/api/watch",{data:{}})).status()).toBe(400);
 expect((await request.post("/api/watch",{data:{...spec,seller:"bad",url:"http://localhost"}})).status()).toBe(400);
 expect((await request.post("/api/watch/missing/check?mode=clear")).status()).toBe(404);
 expect((await request.post("/api/watch/missing/check?mode=typo")).status()).toBe(400);
});
test("live search falls back to cached listings",async({request})=>{
 const res=await request.post("/api/search",{data:spec}); expect(res.ok()).toBeTruthy();
 const {id}=await res.json();
 await expect.poll(async()=> (await (await request.get(`/api/search/${id}`)).json()).status,{timeout:20000}).toBe("done");
 const job=await (await request.get(`/api/search/${id}`)).json();
 expect(job.rows).toHaveLength(4); expect(job.sellers.every((s:{status:string})=>s.status==="cached")).toBeTruthy();
});
test("network errors restore usable controls",async({page})=>{
 await page.route("**/api/watch",r=>r.request().method()==="GET" ? r.fulfill({json:[]}) : r.abort());
 await page.goto("/");
 await page.route("**/api/search",r=>r.abort());
 await page.getByRole("button",{name:"Hunt stock",exact:true}).click();
 await expect(page.getByRole("button",{name:"Hunt stock",exact:true})).toBeEnabled();
 await expect(page.getByText(/Failed to fetch/)).toBeVisible();
 await page.route("**/api/watch",r=>r.abort());
 await page.getByRole("button",{name:/Watch STM/}).click();
 await expect(page.getByRole("button",{name:/Watch STM/})).toBeEnabled();
});

test("watch simulation, alert dismissal, and failed live check",async({page})=>{
 const fs=await import("node:fs/promises"); const file="data/watch.json";
 const original=await fs.readFile(file).catch(()=>null);
 try{
  await fs.writeFile(file,JSON.stringify([{id:"test-browser-watch",mpn:spec.mpn,seller:"ST eStore",url:"https://estore.st.com/en/stm32f103c8t6-cpn.html",createdAt:new Date().toISOString(),checks:[{at:new Date().toISOString(),inStock:false,evidence:"Test fixture"}],alert:null}]));
  await page.goto("/");
  await page.getByRole("button",{name:"Simulate restock (demo)",exact:true}).click();
  await expect(page.getByText(/Back in stock:/)).toBeVisible();
  await page.getByRole("button",{name:"dismiss",exact:true}).click();
  await expect(page.getByText(/Back in stock:/)).toHaveCount(0);
  await page.getByRole("button",{name:"Simulate restock (demo)",exact:true}).click();
  await expect(page.getByText(/Back in stock:/)).toBeVisible();
  await page.route(url=>url.pathname.endsWith("/test-browser-watch/check") && !url.search,r=>r.fulfill({status:502,json:{error:"Test monitor unavailable"}}));
  await page.getByRole("button",{name:"Check now",exact:true}).click();
  await expect(page.getByText("Test monitor unavailable",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Check now",exact:true})).toBeEnabled();
 }finally{if(original)await fs.writeFile(file,original);else await fs.unlink(file).catch(()=>{});}
});
test("unknown live part ends with empty results instead of hanging",async({request})=>{
 const r=await request.post("/api/search",{data:{...spec,mpn:"UNKNOWNTESTPART"}});
 const {id}=await r.json();
 await expect.poll(async()=> (await (await request.get(`/api/search/${id}`)).json()).status).toBe("done");
 const job=await (await request.get(`/api/search/${id}`)).json();
 expect(job.rows).toEqual([]);expect(job.sellers.every((s:{status:string})=>s.status==="failed")).toBeTruthy();
});
