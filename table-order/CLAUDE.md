# CLAUDE.md — 오케스트레이터 운영 지침 (table-order)

이 폴더는 **룩북 스타일 테이블 QR 오더 SaaS(가칭 MENUBOOK)** 프로젝트다. 너(메인 세션)는 **오케스트레이터**로서 직접 대량의 코드를 작성하기보다, `.claude/agents/`의 역할별 서브에이전트에게 작업을 위임하고 계약(contract)·통합·검증을 책임진다.

## 절대 규칙

1. **격리**: `table-order/` 밖(레포 루트의 인트라넷 코드: `src/`, `api/`, `database/`, `docs/`, `outputs/`, 루트 설정 파일)은 어떤 이유로도 읽기 외 접근(수정/삭제/이동) 금지.
2. **문서가 SSOT**: `docs/01~11`이 단일 진실 공급원이다. 구현이 문서와 충돌하면 먼저 문서를 갱신(사유 기록)한 뒤 구현한다. 에이전트에게 위임할 때 반드시 관련 문서 경로를 프롬프트에 명시한다.
3. **계약 우선(Contract-first)**: 병렬 작업 fan-out 전에 해당 마일스톤의 계약물(Prisma 스키마 `packages/db/prisma/schema.prisma`, API 계약 `docs/04`, 공유 타입/Zod `packages/shared/src/contracts/*`)을 먼저 확정·커밋한다. 계약이 흔들리면 병렬 작업 전체가 흔들린다.
4. **파일 소유권**: 한 경로는 한 에이전트만 수정한다(소유권 표는 `docs/11` §3). 두 에이전트가 같은 경로를 만져야 하면 순차 실행하거나 오케스트레이터가 직접 통합한다.
5. **주문·결제 도메인 불변식**: 주문 스냅샷 원칙(가격/이름 복사 저장), 상태머신 외 전이 금지, 결제 멱등키 — `docs/03` §4, `docs/08` §4를 위반하는 코드는 머지하지 않는다.

## 마일스톤 진행 프로토콜

현재 진행 상태는 `docs/10-roadmap-milestones.md`의 체크박스가 기준이다. 세션 시작 시 반드시 먼저 읽는다.

각 마일스톤은 다음 사이클로 진행한다:

```
① 계획   : docs/10에서 해당 M의 목표/산출물/투입 에이전트 확인
② 계약   : 이 M에서 신규/변경되는 계약물 확정 → 단독 커밋
③ fan-out: 소유권이 겹치지 않는 작업을 Agent tool로 병렬 위임
           (같은 경로를 만질 위험이 있으면 isolation: worktree 사용)
④ 통합   : 에이전트 산출물 검토·머지, 빌드/타입체크 통과 확인
⑤ 검증   : qa 에이전트 투입(테스트 작성·실행) + /code-review 실행
⑥ 수정   : 발견된 결함을 해당 소유 에이전트에게 재위임 (SendMessage로 컨텍스트 유지)
⑦ 마감   : docs/10 체크박스 갱신 → 커밋 → 푸시
```

## 작업 유형 → 에이전트 매핑

| 작업 | 에이전트 |
|---|---|
| DB 스키마/마이그레이션/시드 | `db-schema` |
| 디자인 토큰/공용 컴포넌트/타이포 | `design-system` |
| API 라우트/도메인 서비스/검증 로직 | `backend-api` |
| 고객 룩북 화면(커버/피드/상세/카트/현황) | `lookbook-ui` |
| POS 화면(주문보드/정산/메뉴·테이블 관리) | `pos-ui` |
| 실시간 채널/구독 훅/알림음/폴백 | `realtime` |
| 로그인/미들웨어/테넌트 가드/온보딩/구독 게이트 | `auth-tenancy` |
| 토스페이먼츠/카운터 결제/환불/빌링 | `payments` |
| 단위·통합·E2E 테스트, 회귀 검증 | `qa` |

에이전트 위임 프롬프트 템플릿과 병렬화 DAG는 `docs/11-agent-orchestration.md` §5~6을 따른다.

## 기술 결정 요약 (상세: docs/02)

- **모노레포**: pnpm workspace + Turborepo — `apps/web`(Next.js 15 App Router, TS), `packages/db`(Prisma), `packages/ui`, `packages/shared`
- **DB/인프라**: PostgreSQL(Supabase 호스팅) + Prisma, Supabase Auth/Realtime/Storage, Vercel 배포
- **스타일**: Tailwind CSS v4 + shadcn/ui 기반, 룩북 전용 에디토리얼 토큰은 `packages/ui`
- **결제**: 토스페이먼츠(선결제 위젯/빌링) + 카운터 후불 결제
- **멀티테넌시**: path 기반(`/s/[slug]`), middleware에서 테넌트 해석, 모든 쿼리 `storeId` 스코프 강제(repository 레이어)

## 커밋 규칙

- 형식: `feat(m2): 룩북 피드 무한스크롤` / `fix(m3): 주문 상태 전이 가드` — 스코프는 마일스톤(m0~m6) 또는 영역(db, api, lookbook, pos, rt, pay, auth, qa)
- 계약 변경은 반드시 단독 커밋으로 분리한다.
- 이 폴더 밖의 파일이 diff에 섞이면 커밋 전에 반드시 제외한다.

## 검증 게이트 (모든 마일스톤 공통 DoD 최소선)

- `pnpm typecheck && pnpm lint && pnpm test` 통과
- 신규 API는 계약 문서(docs/04)와 Zod 스키마가 일치
- 주문 파이프라인 관련 변경 시: E2E 시나리오(주문 생성→POS 수신→상태 전이→정산) 통과
