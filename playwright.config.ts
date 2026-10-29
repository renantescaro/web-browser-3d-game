import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Todos os testes usam a mesma sala no servidor: rodam um de cada vez.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    viewport: { width: 1000, height: 650 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // WebGL por software no modo headless.
      args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    },
  },
  webServer: [
    {
      command: "npm run dev -w server",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w client",
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
