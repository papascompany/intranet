# P0 인증/API 권한/DB 설계

작성일: 2026-07-11

## 결정

- 기본 DB는 Neon Postgres로 둔다.
- 파일 저장소는 Vercel Blob을 우선 사용한다.
- 인증 주체는 이후 선택할 인증 provider의 user id와 `employees.auth_user_id`를 1:1로 연결한다.
- 앱 내부 API는 `AuthSession`을 받아 직원 본인/승인자/관리자 범위를 분리한다.
- 직원 세션은 본인 직원카드, 근태, 휴가, 야근, 급여명세서만 조회할 수 있다.
- 승인자 세션은 휴가/야근 상태 변경을 할 수 있다.
- HR/SYSTEM 관리자 세션은 전체 운영 데이터, 설정 변경, 급여 업로드/삭제, 근태 보정을 수행할 수 있다.

## 구현 상태

- `src/api/auth.ts`: 인증 세션, 관리자/승인자 역할 판정 추가.
- `src/api/hrApi.ts`: dashboard, 직원 디렉터리, 직원 스냅샷, 설정, 승인, 급여, 보정 API에 세션 기반 권한 검사 추가.
- `src/api/hrRepository.ts`: API가 의존하는 저장소 계약을 분리해 메모리 저장소와 Postgres 저장소를 교체 가능하게 정리.
- `src/api/hrApi.ts`: 저장소 호출을 `await` 기반으로 통일해 동기 메모리 저장소와 비동기 Postgres 저장소를 모두 수용.
- `src/api/postgresRepository.ts`: Neon/Vercel Postgres에 붙일 SQL repository, snake/camel 변환, soft delete 필터, 감사 로그 저장 구현.
- `src/server/neonRepositoryFactory.ts`: `DATABASE_URL`이 있으면 Neon Postgres, 없으면 데모용 메모리 저장소를 선택하는 서버 전용 factory 추가.
- `src/server/hrHttpHandler.ts`, `api/hr.ts`: Vercel Serverless Function에서 `HrApi`를 호출하는 HTTP API 표면 추가.
- `src/api/hrHttpClient.ts`, `src/App.tsx`: 프론트엔드는 `/api/hr` HTTP client를 통해 API를 호출한다. Vite 단독 개발 서버에서 `/api/hr`가 404인 경우에만 메모리 API fallback을 사용한다.
- `database/migrations/202607110001_neon_hr_schema.sql`: Neon Postgres 초기 스키마 추가.

## 다음 구현 단위

1. Neon 프로젝트를 Vercel Marketplace에서 연결하고 `DATABASE_URL`을 Vercel env로 주입.
2. Vercel/Neon 연결 후 `/api/hr`가 실제 `DATABASE_URL` 기반 저장소를 사용하는지 staging 환경에서 검증.
3. 실제 인증 provider(Auth.js/Clerk/Better Auth 등)로 데모 계정 선택 UI 교체.
4. 급여명세서 PDF는 Vercel Blob에 저장하고 metadata는 `payroll_statements`에 보관.
5. 민감 필드는 애플리케이션 계층 암호화 후 `*_enc` 컬럼에 저장.
6. 급여명세서 다운로드는 API에서 본인/관리자 권한을 확인하고 `PAYROLL_STATEMENT_DOWNLOADED` 감사 로그를 남긴 뒤 storage metadata 또는 signed URL을 반환한다. 현재 UI는 이 API 호출까지 연결되어 있다.
7. 급여명세서 삭제는 soft delete만 허용하며 `deletedBy`, `deletedAt`, `deleteReason`을 필수로 저장.

## 보안 메모

- 현재 localStorage 세션은 개발용 데모 경계다.
- `PostgresHrRepository`는 서버/API 계층에서만 사용해야 하며 `DATABASE_URL` 또는 DB client가 브라우저 번들에 포함되면 안 된다.
- 로컬 데모는 `HR_REPOSITORY_MODE=memory` 또는 `DATABASE_URL` 미설정 상태에서 메모리 저장소를 사용한다.
- 운영 전에는 refresh token/session cookie, CSRF 정책, 감사 로그 IP/User-Agent 수집, 관리자 액션 재인증 기준을 확정해야 한다.
- 운영 전에는 업무 write와 감사 로그 insert를 DB transaction으로 묶어 원자성을 강화해야 한다.
- DB 권한은 서버 계층에서 통제하고, API 계층에서도 동일한 권한 검사를 유지한다.
