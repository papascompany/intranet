# MENUBOOK (가칭) — 룩북 스타일 테이블 QR 오더 SaaS

> **"메뉴판이 아니라, 매장의 매거진."**
> 음식 사진이 주인공인 패션 매거진/룩북 스타일 디지털 메뉴판 + 실시간 주문 알림 POS 관리자 페이지를 매장별로 제공하는 멀티테넌트 SaaS.

- 상태: **설계 단계** (본 폴더는 설계 문서 + 개발 오케스트레이션 체계)
- 작성일: 2026-07-12
- 제품명 `MENUBOOK`은 가칭이며, 폴더/코드에는 중립적 이름(`table-order`)을 사용한다. 브랜드 확정 시 문서만 치환하면 된다.

---

## ⚠️ 레포 격리 원칙

이 폴더(`table-order/`)는 기존 인트라넷 프로젝트(레포 루트의 `src/`, `api/`, `database/`, `docs/` 등)와 **완전히 분리된 독립 프로젝트**다.

- 이 프로젝트의 모든 코드/문서/설정은 `table-order/` 안에서만 생성·수정한다.
- 레포 루트 및 기존 인트라넷 파일은 **절대 수정하지 않는다.**
- Claude Code로 개발할 때는 반드시 이 폴더에서 시작한다: `cd table-order && claude`

## 핵심 차별점

1. **룩북 메뉴판 (2층 구조)** — 쇼핑몰식 썸네일 그리드가 아니라 ① 전체 메뉴를 잡지 지면처럼 편집하는 **큐레이션 스프레드**(이미지+타이포 중심, 세로 타이포·챕터 모티프), ② 메뉴를 탭하면 연출컷·클로즈업을 크게 보는 **풀스크린 디테일 컷 화보**. 매장별 브랜딩(커버/컬러/서체) 커스터마이징. → 시각화: `design/menu-style-concept.html`
2. **AI 연출컷 스튜디오** — 운영자가 메뉴의 식재료를 디테일하게 입력하면 AI가 먹음직스러운 **실사 연출컷**(스테이징 히어로 컷·재료 분해컷·클로즈업)을 생성. 검수·선택을 거쳐 룩북에 적용 — 전문 촬영 없이도 감각적인 메뉴판을 가질 수 있다.
3. **POS형 관리자** — 신규 주문이 실시간(3초 내)으로 알림음과 함께 도착하는 주문 보드(태블릿·내부 모니터링 PC·사장님 폰 모바일 웹), 주문 확인 → 조리 시작 → 서빙 상태 관리, 테이블 세션 단위 정산(카운터 결제 + PG 선결제).
4. **SaaS 멀티테넌시** — 매장 셀프 가입 → 온보딩 위저드 → 매장별 고객 페이지(`/s/{slug}`)와 관리자 페이지(`/s/{slug}/admin`) 자동 발급, 플랜/구독 과금.

## 세 개의 표면(Surface)

| 표면 | 사용자 | URL | 설명 |
|---|---|---|---|
| 룩북 메뉴판 | 매장 손님 | `/s/[storeSlug]` (QR: `/s/[slug]/t/[tableToken]`) | 인증 없음. 테이블 QR로 진입, 메뉴 탐색→주문→주문현황 |
| POS 관리자 | 매장 오너/직원 | `/s/[storeSlug]/admin` | 로그인 필수. 주문 보드·정산·메뉴/테이블/QR 관리·통계 |
| 플랫폼 | 예비 가입 매장·운영자 | `/` , `/join`, `/super` | 랜딩·가입·온보딩 위저드·구독, 슈퍼어드민 |

## 문서 맵

| # | 문서 | 내용 |
|---|---|---|
| 01 | [docs/01-product-vision-requirements.md](docs/01-product-vision-requirements.md) | 비전, 페르소나, 유저 스토리, 기능/비기능 요구사항(MoSCoW) |
| 02 | [docs/02-architecture.md](docs/02-architecture.md) | 기술 스택, 시스템 구조, 모노레포 구조, 멀티테넌시, 배포 |
| 03 | [docs/03-data-model.md](docs/03-data-model.md) | ERD, Prisma 스키마 초안, 상태머신 |
| 04 | [docs/04-api-contract.md](docs/04-api-contract.md) | REST API 계약(고객/관리자/플랫폼), 에러 규약 |
| 05 | [docs/05-ux-lookbook-menu.md](docs/05-ux-lookbook-menu.md) | 룩북 메뉴판 UX/UI 상세 설계 |
| 06 | [docs/06-ux-pos-admin.md](docs/06-ux-pos-admin.md) | POS 관리자 UX/UI 상세 설계 |
| 07 | [docs/07-realtime-notifications.md](docs/07-realtime-notifications.md) | 실시간 주문 알림 아키텍처 |
| 08 | [docs/08-payments.md](docs/08-payments.md) | 결제(카운터/토스페이먼츠) + 구독 빌링 설계 |
| 09 | [docs/09-saas-onboarding-billing.md](docs/09-saas-onboarding-billing.md) | 매장 가입/온보딩/플랜/슈퍼어드민 |
| 10 | [docs/10-roadmap-milestones.md](docs/10-roadmap-milestones.md) | 마일스톤 M0~M6, DoD, 리스크 |
| 11 | [docs/11-agent-orchestration.md](docs/11-agent-orchestration.md) | **서브에이전트 구성 + 오케스트레이션 개발 계획** |
| 12 | [docs/12-ai-food-imagery.md](docs/12-ai-food-imagery.md) | AI 연출컷 스튜디오(재료 입력→실사 이미지 생성) 설계 |

> 🎨 **룩북 스타일 시각화**: [design/menu-style-concept.html](design/menu-style-concept.html) — 큐레이션 스프레드 · 풀스크린 디테일 컷 · AI 분해컷 · 주문→POS 플로우를 브라우저에서 바로 확인할 수 있다.

## 서브에이전트 개발 체계

`.claude/agents/`에 역할별 서브에이전트 10종이 정의되어 있다. 오케스트레이터(메인 Claude 세션)가 [CLAUDE.md](CLAUDE.md)의 프로토콜에 따라 마일스톤 단위로 에이전트를 병렬 투입한다.

| 에이전트 | 역할 | 소유 영역(구현 시) |
|---|---|---|
| `db-schema` | Prisma 스키마·마이그레이션·시드 | `packages/db` |
| `design-system` | 에디토리얼 디자인 토큰·공용 UI | `packages/ui` |
| `backend-api` | 도메인 로직·REST API | `apps/web/src/server`, `apps/web/app/api` |
| `lookbook-ui` | 고객 룩북 메뉴판 화면 | `apps/web/app/(store)` |
| `pos-ui` | POS 관리자 화면 | `apps/web/app/(admin)` |
| `realtime` | 실시간 알림 채널/훅 | `apps/web/src/realtime` |
| `auth-tenancy` | 인증·멀티테넌시·온보딩 | `apps/web/src/auth`, `middleware.ts`, `app/(platform)` |
| `payments` | 토스페이먼츠·정산·구독 | `apps/web/src/payments` |
| `ai-imagery` | AI 연출컷 생성·크레딧 | `apps/web/src/ai`, `app/api/admin/ai` |
| `qa` | 테스트·검증(전 영역 읽기) | `apps/web/tests`, `packages/*/tests` |

## 시작하기 (개발 착수 시)

```bash
cd table-order
claude
# 오케스트레이터 세션에서:
#   "docs/10 로드맵 기준으로 M0 스캐폴드를 시작해줘"
```

오케스트레이터는 CLAUDE.md의 규칙에 따라 마일스톤을 진행하고, 완료 시 `docs/10-roadmap-milestones.md`의 체크박스를 갱신한다.
