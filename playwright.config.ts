import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  workers: 1,
  use: { baseURL: "http://localhost:3100", headless: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
  webServer: {
    command: "npm start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    env: { TINYFISH_API_KEY: "", GEMINI_API_KEY: "", FORCE_FAIL: "lcsc,digikey,dna,st" },
  },
  reporter: "list",
});
