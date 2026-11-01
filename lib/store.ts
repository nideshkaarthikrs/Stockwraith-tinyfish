import { promises as fs } from "fs";
import path from "path";

const DATA = path.join(process.cwd(), "data");

const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");

export async function readJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, rel), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJson(rel: string, value: unknown): Promise<void> {
  const file = path.join(DATA, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

export const cachePath = (mpn: string, seller: string) => `cache/${safe(mpn)}/${safe(seller)}.json`;
export const demoPath = (mpn: string) => `demo/${safe(mpn)}.json`;
export const searchPath = (id: string) => `searches/${safe(id)}.json`;
export const WATCH_PATH = "watch.json";
