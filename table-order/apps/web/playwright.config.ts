import { defineConfig } from "@playwright/test";

// E2E는 M3부터 작성한다(docs/10). 이 환경의 브라우저는 프리인스톨 크로미움을 사용:
// PLAYWRIGHT_BROWSERS_PATH가 설정된 CI/로컬에서는 executablePath 지정이 필요 없다.
export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 390, height: 844 },
  },
});
