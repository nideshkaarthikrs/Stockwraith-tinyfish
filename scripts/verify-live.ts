import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { verifyAll } from "../lib/verify";
import type { Listing } from "../lib/schema";
async function main(){
 loadEnvConfig(process.cwd());
 const listings: Listing[]=await Promise.all(["lcsc","digikey","dna","st"].map(async id=>JSON.parse(await readFile(`data/cache/STM32F103C8T6/${id}.json`,"utf8"))));
 const out=await verifyAll(listings.map(listing=>({listing,source:"cached" as const})),{mpn:"STM32F103C8T6",package:"LQFP-48",temp_range:"-40 to +85 °C",qty:500},listings[3]);
 console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
