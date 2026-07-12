# 04. API 계약 (REST)

- 버전: v0.1 (2026-07-12)
- 이 문서 + `packages/shared/src/contracts/*.ts`(Zod)가 프론트↔백 에이전트 간 **계약물**이다. 변경은 오케스트레이터 승인 후 `backend-api`가 수행하고 두 산출물을 동시에 갱신한다.

## 1. 공통 규약

- 변이는 REST Route Handler(`app/api/**`), 화면 초기 데이터는 RSC에서 서비스 레이어 직접 호출(같은 서비스 함수 공유 — 로직 이원화 금지).
- 응답: 성공 `2xx + 데이터`, 실패 `4xx/5xx + { error: { code, message, details? } }`
- 금액은 원 단위 정수. 시각은 ISO 8601(UTC).
- 변이 요청은 `Idempotency-Key` 헤더 지원(주문 생성·결제는 **필수**). 같은 키 재요청 → 최초 응답 재반환.
- 공개(고객) API rate limit: IP+tableToken당 주문 5회/분, 호출 3회/분. 초과 → `429 RATE_LIMITED`.
- 인증: 관리자 API는 Supabase 세션 쿠키 + `requireStaff(slug, minRole?)`. 고객 API는 `mb_table` 서명 쿠키 + `requireTable(slug)`.

### 에러 코드 enum (`packages/shared/src/contracts/errors.ts`)

`UNAUTHORIZED` `FORBIDDEN_TENANT` `FORBIDDEN_ROLE` `NOT_FOUND` `VALIDATION_FAILED` `SOLD_OUT` `STORE_CLOSED` `SESSION_CLOSED` `INVALID_TRANSITION` `RATE_LIMITED` `IDEMPOTENCY_CONFLICT` `PAYMENT_FAILED` `PLAN_LIMIT_EXCEEDED` `INTERNAL`

## 2. 공개(고객) API — `/api/s/[slug]/**`

| 메서드·경로 | 설명 | 비고 |
|---|---|---|
| `GET /api/s/[slug]/lookbook` | 룩북 전체 데이터(테마+카테고리+메뉴+이미지) | RSC가 주로 사용, CDN 캐시 60s + 품절은 실시간 이벤트로 보정 |
| `POST /api/s/[slug]/table-entry` | QR 토큰 검증 → 세션 확보 → `mb_table` 쿠키 발급 | body: `{ tableToken }` |
| `POST /api/s/[slug]/orders` | 주문 생성 | 멱등키 필수 |
| `GET /api/s/[slug]/session` | 내 세션 누적 주문·합계·상태 | 폴링 폴백 겸용(10s) |
| `POST /api/s/[slug]/orders/[orderId]/cancel` | 손님 취소(PENDING만) | |
| `POST /api/s/[slug]/calls` | 직원 호출/계산서 요청 | body: `{ kind: "STAFF"\|"BILL"\|"WATER" }` |
| `POST /api/s/[slug]/payments/toss/confirm` | (선결제) 토스 위젯 승인 콜백 | docs/08 §3 |

### 2.1 주문 생성 — 대표 계약 예시

`POST /api/s/demo/orders` (Idempotency-Key: uuid)

```jsonc
// 요청 (Zod: CreateOrderInput)
{
  "items": [
    {
      "menuItemId": "itm_abc",
      "qty": 2,
      "options": [ { "groupId": "grp_1", "choiceIds": ["cho_9"] } ]
    }
  ],
  "customerMemo": "고수 빼주세요"
}
// 서버 처리: 테이블쿠키 검증 → 매장 영업중/주문가능 검증 → 품절·옵션 규칙 검증
//   → 스냅샷 생성·금액 서버 재계산 → orderNo 발급 → 저장(트랜잭션)
//   → 커밋 후 realtime publish(order.created) → 201

// 응답 201 (Zod: OrderResponse)
{
  "order": {
    "id": "ord_123", "orderNo": 14, "status": "PENDING",
    "totalAmount": 25000, "placedAt": "2026-07-12T03:12:45Z",
    "items": [ { "name": "트러플 리조또", "qty": 2, "options": ["샷 추가"], "lineTotal": 25000 } ]
  },
  "session": { "id": "ses_77", "totalAmount": 61000 }
}

// 실패 예: 409 { "error": { "code": "SOLD_OUT", "message": "품절된 메뉴가 포함되어 있습니다",
//   "details": { "menuItemIds": ["itm_abc"] } } }
```

## 3. 관리자 API — `/api/admin/**` (헤더/세션에서 storeId 해석)

| 메서드·경로 | 설명 | 최소 역할 |
|---|---|---|
| `GET /api/admin/orders?status=&sinceEventAt=` | 주문 보드 데이터. `sinceEventAt`은 실시간 유실 복구용 diff | STAFF |
| `PATCH /api/admin/orders/[id]` | 상태 전이 `{ action: CONFIRM\|REJECT\|START\|SERVE\|CANCEL, reason? }` | STAFF |
| `GET /api/admin/sessions?status=OPEN` | 테이블 세션 목록(테이블맵) | STAFF |
| `POST /api/admin/sessions/[id]/checkout` | 카운터 결제 기록 `{ method, amount }` → 완납 시 세션 CLOSE | STAFF |
| `POST /api/admin/sessions/[id]/force-close` | 강제 종료(사유) | MANAGER |
| `GET/POST/PATCH/DELETE /api/admin/categories[/id]` | 카테고리 CRUD·정렬 | MANAGER |
| `GET/POST/PATCH/DELETE /api/admin/items[/id]` | 메뉴 CRUD (story, badges, layoutHint 포함) | MANAGER |
| `PATCH /api/admin/items/[id]/sold-out` | 품절 토글 `{ isSoldOut }` → menu.updated 이벤트 | STAFF |
| `POST /api/admin/media/presign` | 이미지 업로드 presign | MANAGER |
| `POST /api/admin/media/commit` | 업로드 완료 → 변환(리사이즈·blurhash) 트리거 | MANAGER |
| `GET/POST/PATCH /api/admin/tables[/id]` | 테이블 CRUD, `POST /[id]/rotate-qr` 토큰 회전 | MANAGER |
| `GET /api/admin/tables/qr-sheet` | 전체 테이블 QR 인쇄 PDF | MANAGER |
| `PATCH /api/admin/calls/[id]` | 호출 완료 처리 | STAFF |
| `GET /api/admin/stats/summary?range=today\|7d\|30d` | 매출·주문수·인기메뉴 | OWNER |
| `GET/PATCH /api/admin/store` | 매장 정보·테마·운영 설정 | OWNER |
| `GET/POST/PATCH /api/admin/staff[/id]` | 직원 계정 관리 | OWNER |

상태 전이 액션 ↔ OrderStatus 매핑은 docs/03 §3.1을 단일 기준으로 한다. 잘못된 전이는 `409 INVALID_TRANSITION`.

## 4. 플랫폼 API — `/api/platform/**`, `/api/webhooks/**`

| 메서드·경로 | 설명 |
|---|---|
| `POST /api/platform/signup` | 계정 생성(Supabase Auth) + Store(ONBOARDING) + Subscription(TRIAL) 트랜잭션 |
| `POST /api/platform/onboarding/[step]` | 위저드 단계 저장 (docs/09 §2) |
| `POST /api/platform/subscribe` | 플랜 선택 → 토스 빌링키 발급 → ACTIVE |
| `POST /api/webhooks/toss` | PG 웹훅(결제 승인/취소/빌링) — 서명 검증, 멱등 처리 |
| `GET /api/super/stores` 등 `/api/super/**` | 슈퍼어드민 (PLATFORM_ADMIN 전용) |

## 5. 계약 테스트 (qa 에이전트 상시 스위트)

1. **Zod ↔ 문서 정합**: contracts의 스키마로 본 문서의 예시 JSON을 파싱 — 실패 시 계약 위반.
2. **테넌트 격리**: 매장 A 자격으로 매장 B 자원 접근 → 전 관리자 엔드포인트 403/404 (`FORBIDDEN_TENANT`/`NOT_FOUND`).
3. **멱등성**: 동일 Idempotency-Key 주문 2회 → 주문 1건, 동일 응답.
4. **상태머신**: 허용 외 전이 전수 → `INVALID_TRANSITION`.
5. **금액 위조**: 클라이언트가 보낸 금액 무시 확인(요청에 금액 필드 자체가 없음 — 스키마로 강제).

## 6. Zod 계약 파일 구성 (`packages/shared/src/contracts/`)

```
errors.ts        // ErrorCode enum + ApiError 타입
lookbook.ts      // LookbookResponse (테마·카테고리·아이템·이미지)
order.ts         // CreateOrderInput, OrderResponse, OrderStatus, 전이 액션
session.ts       // SessionResponse, CheckoutInput
menu-admin.ts    // 카테고리/아이템/옵션 CRUD 입력·출력
table.ts         // TableInput, QrSheetResponse
payment.ts       // TossConfirmInput, PaymentResponse
platform.ts      // SignupInput, OnboardingStepInput, PlanLimits
realtime.ts      // RealtimeEvent 유니온 (docs/07 §3과 1:1)
```
