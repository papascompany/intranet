# AGENTS.md — 에이전트 작업 지침 (Codex / Claude 공용)

## 배포 구조 (2026-07-18부터)

`main`에 push하면 **두 곳에 자동배포**된다:

| 대상 | 주소 | 방식 |
|---|---|---|
| Vercel (병행 운영 중) | intranet-delta-rosy.vercel.app | 파일 기반 자동 라우팅 |
| 사내 서버 (Coolify) | https://intra.storige.kr | `Dockerfile` 빌드 + `server.ts` 서버 |

앱 구조: Vite SPA(`src/`) + 서버 엔드포인트(`api/`, Vercel 서버리스 함수 규약) + **셀프호스트 셔임 서버(`server.ts`)**. DB는 Neon Postgres, 급여 PDF는 Vercel Blob — 앱만 두 곳에서 돌고 데이터는 한 곳이다.

## 절대 규칙 3가지

1. **`api/`에 엔드포인트를 추가·이름변경하면 `server.ts`의 `API_ROUTES`에도 반드시 등록한다.**
   Vercel은 파일만 만들면 라우팅되지만 사내 서버는 명시 라우팅 테이블이다.
   빼먹으면 Vercel에선 되고 **사내 서버에서만 404**가 난다 (조용한 장애).

   ```ts
   // server.ts
   const API_ROUTES: Record<string, ApiHandler> = {
     "/api/auth": authHandler,
     // api/새파일.ts 를 만들었다면 여기에 한 줄 추가
   };
   ```

2. **`server.ts` · `Dockerfile` · `.dockerignore`를 삭제·이동·"정리"하지 않는다.**
   빌드에서 안 쓰이는 것처럼 보여도 사내 서버 배포 전용 파일이다. 지우면 사내 배포가 깨진다.

3. **새 환경변수를 도입하면**: ① 값을 먼저 `.env.local`에 보관하고 (이 Vercel 프로젝트는
   새 env를 기본 **Sensitive = 회수 불가**로 생성한다) ② Vercel과 **사내 Coolify 양쪽에**
   넣어야 함을 운영자에게 보고한다. 한쪽에만 넣으면 다른 배포가 조용히 고장난다.

## 알아둘 함정

- `npm run build`(tsc -b)는 `api/`와 `server.ts`를 **타입체크하지 않는다** (tsconfig 미포함).
  API·서버 코드 수정 시 `npm test`에 더해 아래 로컬 스모크를 돌려라:
  ```sh
  HR_REPOSITORY_MODE=memory SESSION_SECRET=any-32-char-or-longer-string-here PORT=3100 npx tsx server.ts
  curl -s localhost:3100/api/health   # 구조화된 JSON이 나오면 라우팅 정상
  ```
- DB 마이그레이션은 러너가 없다 — `database/migrations/*.sql`을 psql로 순서대로 수동 적용.
  누락 시 `/api/health`가 `schema: missing`으로 503을 반환한다.
- `EMPLOYEE_DATA_ENCRYPTION_KEY`(주민번호·계좌 암호화 키)는 **재생성·삭제 금지**. 분실하면 민감정보 복구 불가.
- 사내 도메인(intra.storige.kr)에 Cloudflare Access를 씌우지 마라 — Vercel Blob 업로드
  완료 콜백이 차단돼 급여 업로드가 **무증상 실패**한다. 같은 이유로 사내 서버 env의
  `VERCEL_BLOB_CALLBACK_URL=https://intra.storige.kr` 는 제거 금지.

## 검증 게이트

- 코드 변경 후: `npm test` && `npm run build` 통과
- push 후: Vercel 배포 Ready + `https://intra.storige.kr/api/health` 200 확인 (사내 빌드 3~8분 소요)
