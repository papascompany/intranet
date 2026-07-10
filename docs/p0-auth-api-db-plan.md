# P0 인증/API 권한/DB 설계

작성일: 2026-07-08

## 결정

- 기본 DB는 Supabase Postgres로 둔다.
- 인증 주체는 Supabase Auth의 `auth.users.id`와 `employees.auth_user_id`를 1:1로 연결한다.
- 앱 내부 API는 `AuthSession`을 받아 직원 본인/승인자/관리자 범위를 분리한다.
- 직원 세션은 본인 직원카드, 근태, 휴가, 야근, 급여명세서만 조회할 수 있다.
- 승인자 세션은 휴가/야근 상태 변경을 할 수 있다.
- HR/SYSTEM 관리자 세션은 전체 운영 데이터, 설정 변경, 급여 업로드/삭제, 근태 보정을 수행할 수 있다.

## 구현 상태

- `src/api/auth.ts`: 인증 세션, 관리자/승인자 역할 판정 추가.
- `src/api/hrApi.ts`: dashboard, 직원 디렉터리, 직원 스냅샷, 설정, 승인, 급여, 보정 API에 세션 기반 권한 검사 추가.
- `src/api/hrRepository.ts`: API가 의존하는 저장소 계약을 분리해 메모리 저장소와 Supabase 저장소를 교체 가능하게 정리.
- `src/api/supabaseRepository.ts`: 실제 Supabase 쿼리 연결 전까지 사용할 어댑터 골격 추가.
- `src/App.tsx`: 로그인 시 `AuthSession`을 만들고 모든 주요 API 호출에 전달.
- `supabase/migrations/202607080001_initial_hr_schema.sql`: Supabase Postgres 초기 스키마와 RLS 정책 초안 추가.

## 다음 구현 단위

1. Supabase 프로젝트 연결 후 마이그레이션 적용.
2. `SupabaseHrRepository`의 메서드를 Supabase Postgres/Storage 쿼리로 채우고 통합 테스트 추가.
3. Supabase Auth 로그인으로 데모 계정 선택 UI 교체.
4. 급여명세서 PDF는 Supabase Storage `payroll-statements` 버킷으로 이관.
5. 민감 필드는 애플리케이션 계층 암호화 후 `*_enc` 컬럼에 저장.
6. 급여명세서 다운로드는 API에서 본인/관리자 권한을 확인하고 `PAYROLL_STATEMENT_DOWNLOADED` 감사 로그를 남긴 뒤 storage metadata 또는 signed URL을 반환한다. 현재 UI는 이 API 호출까지 연결되어 있다.
7. 급여명세서 삭제는 soft delete만 허용하며 `deletedBy`, `deletedAt`, `deleteReason`을 필수로 저장.

## 보안 메모

- 현재 localStorage 세션은 개발용 데모 경계다.
- 운영 전에는 refresh token/session cookie, CSRF 정책, 감사 로그 IP/User-Agent 수집, 관리자 액션 재인증 기준을 확정해야 한다.
- RLS는 최후 방어선이고, API 계층에서도 동일한 권한 검사를 유지한다.
