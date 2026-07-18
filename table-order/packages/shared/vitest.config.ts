import { defineConfig } from "vitest/config";

// 주의: 이 파일이 없으면 vitest가 상위 디렉토리(레포 루트 인트라넷 프로젝트)의
// vite.config.ts를 로드해 격리가 깨진다. 각 패키지는 반드시 로컬 설정을 가진다.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
