# 새 세션 시작 프롬프트 (스탠드얼론 레포 이관용)

> 사용법: 맥에서 `cd /Users/yohan/Developer/claude/table_qr_order && claude` 실행 후, 아래 구분선 안의 내용을 첫 메시지로 붙여넣는다.

---

[프로젝트 인수인계 — MENUBOOK 테이블 QR 오더 SaaS]

너는 이 프로젝트의 **오케스트레이터**다. 이 폴더는 papascompany/intranet 레포의 `table-order/` 하위에서 독립해 나온 스탠드얼론 프로젝트이며, **지금부터 이 폴더가 단일 진실 공급원(SSOT)**이다(기존 인트라넷 레포의 브랜치는 아카이브). 이전 세션에서 설계 v0.3과 M0 스캐폴드까지 완료했다. 너의 임무는 끊김 없이 이어서 진행하는 것이다.

## 0. 먼저 읽어라 (순서대로)
1. `CLAUDE.md` — 오케스트레이터 운영 규칙
2. `docs/10-roadmap-milestones.md` — 진행 상태 체크박스 = 현재 위치
3. `docs/11-agent-orchestration.md` — 에이전트 로스터·병렬 DAG·위임 프롬프트 템플릿
- 역할별 서브에이전트 10종은 `.claude/agents/`에 정의되어 있다. 문서 맵은 `README.md`.

## 1. 현재 상태
- **설계 v0.3 완료**: docs/01~14 (5렌즈 49건 비평 → 3심 판정 반영). 고객 UX 예산(QR 진입→주문 4탭·30초 등 8종)은 docs/05 §2, 수용 기준 A-1~A-9는 docs/06 §9 — 이 수치들은 qa 게이트로 강제한다.
- **M0 스캐폴드 완료**: pnpm+Turborepo 모노레포, apps/web(Next.js 15+React 19+Tailwind v4, /api/health), packages/shared(docs/04 에러 계약 Zod 구현+테스트), packages/db·ui(M1용 골격). typecheck/lint/test/build 그린 + dev 스모크 통과 이력.
- **베타 GTM 확정**: docs/14 — 본선 연남·연희, 촬영 패키지 계약 조건 확정. DM·데모 착수 게이트는 M3 완료 시점(스카우팅 등 사람 작업은 개발 범위 아님).
- **다음 마일스톤 = M1 (계약·코어 도메인)**: db-schema ∥ design-system ∥ auth-tenancy 병렬 → backend-api.

## 2. 이 세션의 작업 순서
① **레포 독립화**:
- `git init -b main` → 전체 초기 커밋 `chore: MENUBOOK 스탠드얼론 레포 초기화 (intranet/table-order에서 이관)`
- `CLAUDE.md` 절대 규칙 1(격리)을 스탠드얼론 기준으로 수정 — 인트라넷 언급과 `.github` 예외 문구 제거
- `ci-workflow-for-repo-root.yml.txt` → `.github/workflows/ci.yml`로 이동하고 `working-directory: table-order`·`paths` 필터·`cache-dependency-path` 접두어를 제거(레포 루트 기준으로)
- `README.md`의 "레포 격리 원칙" 절을 이관 사실 명기로 교체, 문서에서 `table-order/` 경로 표기가 남아 있으면 정리
- 원격 레포가 필요하니 **GitHub 레포 이름(예: menubook)과 공개 여부를 나에게 확인**한 뒤 `gh repo create`로 연결·푸시
② **환경 검증**: `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 그린 확인(실패 시 수정 후 진행), `pnpm dev` 스모크(`/api/health`).
③ **M1 착수**: docs/10 M1 표 기준, CLAUDE.md 프로토콜(계약 단독 커밋 → 병렬 fan-out → qa 검증 → code-review → docs/10 체크박스 갱신) 준수.
- `db-schema`: docs/03 §2 전체 Prisma 스키마+마이그레이션+**데모 시드**(slug `demo`, docs/03 §5 명세) — prisma 의존성 추가 시 루트 package.json `pnpm.onlyBuiltDependencies`에 `prisma`·`@prisma/engines` 추가 필요
- `design-system`: 토큰·타이포·기본 컴포넌트 (docs/05 §8 터치·타이포 하한, §10 ThemeConfig v2)
- `auth-tenancy`: Supabase Auth 연동·middleware 테넌트 해석·requireStaff/requireTable (docs/02 §4~5)
- 이후 `backend-api`: repository 골격 + Zod 계약 확장 (docs/04 §6 파일 구성)

## 3. 보류·확인 필요 결정 (진행 중 나에게 물어라)
- **Supabase**: 프로젝트 미생성 — db-schema 착수 전 로컬(`supabase start`, 도커 필요) vs 클라우드 dev 프로젝트 중 선택 확인 (`DATABASE_URL` 필요, `.env.example` 참조)
- **Vercel 프리뷰 연결**: 계정/팀 미정 (M0 DoD의 유일한 보류 항목)
- **PENDING_PAYMENT 표현 방식**: M4에서 db-schema와 확정 (docs/08 §3 보류 표기)
- AI 이미지 제공자: M-AI 트랙 착수 시 PoC로 확정 (docs/12 §7, 회당 원가 ≤ 300원 게이트)

## 4. 불변 원칙 (요약 — 전문은 CLAUDE.md)
문서가 SSOT(충돌 시 문서 먼저 갱신) / 계약 우선(스키마·`packages/shared` 변경은 오케스트레이터 승인+단독 커밋) / 파일 소유권 준수(docs/11 §2 표) / 주문·결제 불변식 I-1~I-8(docs/03 §4)·결제 방어 P-1~P-5(docs/08 §4) 위반 코드 머지 금지 / 커밋 컨벤션 `feat(m1): ...`

지금 ①부터 시작해라. ①·② 완료를 짧게 보고한 뒤, M1 fan-out 계획(에이전트별 과업 목록)을 보여주고 바로 진행해라.

---
