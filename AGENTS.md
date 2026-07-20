# AGENTS.md — 에이전트 작업 지침 (Codex / Claude 공용)

## 배포·데이터 구조 (2026-07-20 완전 사내 이관 이후)

**운영은 사내 서버 단독이다**: `main` push → GitHub 웹훅 → Coolify 빌드(`Dockerfile`) → https://intra.storige.kr (3~8분 소요).

| 구성요소 | 위치 |
|---|---|
| 앱 (SPA + API) | 사내 서버 Coolify 컨테이너 — `server.ts`가 정적 서빙 + `api/` 라우팅 |
| DB (Postgres) | 사내 서버 Coolify Postgres 컨테이너 (내부망 전용, R2 자동백업) |
| 급여 PDF | 사내 서버 영속 볼륨 `/data/payroll` (`DiskPayrollStorage`) — 원본은 운영자가 노트북에 별도 보관 |

⚠️ **Vercel 프로젝트는 병행 종료로 정지 대상** — 레포 연동이 남아 있어도 그쪽 배포는 옛 Neon DB를 보므로 절대 사용·안내하지 마라. 코드 자체는 Neon URL(`*.neon.tech`)이면 Neon 드라이버, 그 외엔 node-postgres(`pg`)를 자동 선택하므로 어느 환경에서도 빌드는 깨지지 않는다.

## 절대 규칙 3가지

1. **`api/`에 엔드포인트를 추가·이름변경하면 `server.ts`의 `API_ROUTES`에도 반드시 등록한다.**
   사내 서버는 명시 라우팅 테이블이다. 빼먹으면 해당 API만 404가 난다 (조용한 장애).

   ```ts
   // server.ts
   const API_ROUTES: Record<string, ApiHandler> = {
     "/api/auth": authHandler,
     // api/새파일.ts 를 만들었다면 여기에 한 줄 추가
   };
   ```

2. **`server.ts` · `Dockerfile` · `.dockerignore` · `src/server/diskPayrollStorage.ts`를 삭제·이동·"정리"하지 않는다.**
   전부 사내 배포의 필수 부품이다.

3. **새 환경변수는 사내 Coolify 앱 env가 정본이다.** 도입 시 ① 값을 `.env.local`에 먼저 보관하고
   ② Coolify에 추가해야 함을 운영자에게 보고한다. (Vercel env는 더 이상 운영에 관여하지 않는다.)

## 급여명세서 데이터 흐름 (직접 업로드 제거됨)

- 업로드: 클라이언트가 PDF를 base64로 `/api/hr` 액션 `uploadPayrollStatement`에 POST → 서버가 검증(PDF 시그니처·10MB 한도) 후 `PAYROLL_STORAGE_DIR`에 저장 + DB 등록. **콜백·서명·외부 왕복 없음.**
- 다운로드: `/api/payroll?statementId=...` same-origin 스트리밍 (쿠키 인증).
- `@vercel/blob` 직접 업로드(`api/payroll-upload.ts`, `payrollClientUpload.ts`)는 **삭제됐다** — 되살리지 마라.

## 알아둘 함정

- `npm run build`(tsc -b)는 `api/`와 `server.ts`를 **타입체크하지 않는다** (tsconfig 미포함).
  API·서버 코드 수정 시 `npm test`에 더해 아래 로컬 스모크를 돌려라:
  ```sh
  HR_REPOSITORY_MODE=memory SESSION_SECRET=any-32-char-or-longer-string-here \
    PAYROLL_STORAGE_DIR=/tmp/payroll PORT=3100 npx tsx server.ts
  curl -s localhost:3100/api/health   # blob(=저장소) 체크까지 ok여야 정상
  ```
- `server.ts`의 요청 본문 한도는 16MB다 — 급여 PDF(≤10MB)의 base64 인코딩을 수용하기 위한 값이니 줄이지 마라.
- 운영 필수 env: `DATABASE_URL`(사내 PG), `SESSION_SECRET`, `EMPLOYEE_DATA_ENCRYPTION_KEY`, `PAYROLL_STORAGE_DIR=/data/payroll`, `NODE_ENV=production`.
- `EMPLOYEE_DATA_ENCRYPTION_KEY`(주민번호·계좌 암호화 키)는 **재생성·삭제 금지**. 분실하면 민감정보 복구 불가.
- DB 마이그레이션은 러너가 없다 — `database/migrations/*.sql`을 **사내 PG 컨테이너**에 psql로 순서대로 수동 적용. 누락 시 `/api/health`가 `schema: missing` 503.
- intra.storige.kr에 Cloudflare Access를 씌우지 마라 — 앱이 자체 인증(세션 쿠키)을 가진다.

## 검증 게이트

- 코드 변경 후: `npm test` && `npm run build` 통과
- push 후: `https://intra.storige.kr/api/health` 200 전항목 ok 확인 (빌드 3~8분 대기)
