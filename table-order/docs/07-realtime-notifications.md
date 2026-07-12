# 07. 실시간 알림 아키텍처

- 버전: v0.1 (2026-07-12)
- 구현 소유: `realtime` 에이전트 (`apps/web/src/realtime`). publish 호출 지점은 `backend-api`와 협업(인터페이스는 본 문서 §5).
- 목표(NFR N-2): 주문 생성 → POS 표시 p95 < 3s. 채널 장애 시에도 주문 유실 0 (N-4).

## 1. 방식 결정

| 후보 | 판단 |
|---|---|
| **Supabase Realtime Broadcast (채택)** | 서버가 이벤트를 명시적으로 publish, 클라이언트는 채널 구독. WS 인프라 무관리. 페이로드를 우리가 통제(스키마 §3) |
| Postgres Changes 구독 | 테이블 변경을 그대로 흘려보내 페이로드 통제 불가·조인 불가, RLS 요구 복잡 → 기각 |
| SSE 자체 구현 | Vercel 서버리스에서 장시간 연결 비용·제한 → 기각 |
| Socket.io 자체 서버 | 상시 서버 운영 부담, MVP 과설계 → 백로그(§6 전환 경로만 확보) |

**신뢰성 모델: "실시간은 가속기, DB가 진실"** — 이벤트는 알림·갱신 트리거일 뿐이며, 수신 측은 항상 API 재조회로 상태를 확정한다(이벤트 유실이 데이터 유실이 되지 않는 구조).

## 2. 채널 설계

| 채널 | 구독자 | 이벤트 | 인가 |
|---|---|---|---|
| `store:{storeId}:ops` | 해당 매장 POS | order.created, order.status_changed, call.created, session.bill_requested, session.closed | Realtime 토큰에 storeId 클레임 — 스태프 세션만 발급(`/api/admin/realtime-token`) |
| `session:{sessionId}` | 해당 테이블 손님 | order.status_changed, session.closed, menu.updated(품절) | 테이블 쿠키 보유자에게 세션 스코프 토큰 발급 |

- 채널 인가: Supabase Realtime authorization(private channel) 사용. 토큰 없는 임의 구독 차단 — 주문 내역은 개인정보는 아니나 매장 운영정보이므로 공개 채널 금지.
- 고객 품절 반영은 `session:*`에 브로드캐스트하지 않고 매장 단위가 필요하므로 예외적으로 `store:{storeId}:menu`(읽기 전용 public, 페이로드는 itemId·isSoldOut만) 채널을 둔다.

## 3. 이벤트 스키마 (`packages/shared/src/contracts/realtime.ts` — Zod 유니온)

```ts
type RealtimeEvent =
  | { type: "order.created";        at: string; storeId: string;
      order: { id: string; orderNo: number; tableLabel: string;
               totalAmount: number; itemsPreview: string; } }   // "리조또×2 외 1건"
  | { type: "order.status_changed"; at: string; storeId: string;
      orderId: string; sessionId: string;
      from: OrderStatus; to: OrderStatus; reason?: string }
  | { type: "call.created";         at: string; storeId: string;
      callId: string; tableLabel: string; kind: "STAFF"|"BILL"|"WATER" }
  | { type: "session.bill_requested"; at: string; storeId: string;
      sessionId: string; tableLabel: string; totalAmount: number }
  | { type: "session.closed";       at: string; storeId: string; sessionId: string }
  | { type: "menu.updated";         at: string; storeId: string;
      itemId: string; isSoldOut: boolean }
```

- 페이로드는 **요약만** 담는다(전체 주문 데이터 X) — 수신 후 상세는 API로 fetch. 이유: 채널 페이로드 크기 제한, 인가 단순화, 이벤트 스키마 안정성.
- `at`(서버 시각)은 유실 복구 커서로 사용된다(§4).

## 4. 유실·단절 복구 (폴백 프로토콜)

POS 클라이언트 상태기계:

```
CONNECTED ──(WS drop/heartbeat miss 5s)──> DEGRADED(폴링 5s) ──(재구독 성공)──> RESYNC ──> CONNECTED
```

1. 클라이언트는 마지막 수신 이벤트의 `at`을 `lastEventAt`으로 유지.
2. DEGRADED: `GET /api/admin/orders?sinceEventAt={lastEventAt}` 5s 폴링 — 알림음 등 UX는 동일하게 발화.
3. RESYNC: 재연결 직후 동일 diff 호출 1회로 공백 메우고 CONNECTED 복귀. 표시등(●/○)은 docs/06 §3.
4. 고객 현황 화면은 단순화: 구독 + 10s 폴링(`GET session`)을 항상 병행(멱등 렌더).
5. 중복 수신 대비: 모든 이벤트 처리는 idempotent(orderId 기준 upsert 렌더), 알림음은 orderId당 1회 + 재알림 정책만 별도.

## 5. 서버 publish 인터페이스 (backend-api와의 계약)

```ts
// apps/web/src/realtime/publish.ts — realtime 에이전트 소유
export async function publishStoreEvent(storeId: string, event: RealtimeEvent): Promise<void>
export async function publishSessionEvent(sessionId: string, event: RealtimeEvent): Promise<void>
```

- 호출 규칙: **DB 트랜잭션 커밋 후**에만 publish (커밋 전 발행 → 유령 이벤트 금지). 실패해도 요청은 성공 처리하고 warn 로그(폴백이 커버). fire-and-forget + 1회 재시도.
- publish 지점 목록(backend-api 구현 체크리스트): 주문 생성, 상태 전이, 호출 생성, 계산서 요청, 세션 종료, 품절 토글.

## 6. 클라이언트 훅 (realtime 에이전트 산출물)

```ts
useStoreOps(storeId, { onEvent })      // POS: 구독+폴백 상태기계+lastEventAt 관리, 연결상태 반환
useSessionUpdates(sessionId)           // 고객: 현황 갱신 트리거
useMenuLive(storeId)                   // 고객: 품절 실시간 반영
useOrderAlarm()                        // 알림음(Web Audio)·브라우저 알림·재알림 타이머, 제스처 활성화 처리
```

향후 자체 WS 전환 시 이 훅과 §5 publish 함수의 시그니처를 유지한 채 구현만 교체한다(어댑터 패턴).

## 7. 테스트 전략 (qa와 협업)

- 단위: 상태기계(CONNECTED→DEGRADED→RESYNC) 타이머 모킹 테스트, 이벤트 스키마 Zod 왕복.
- 통합: 주문 생성 API 호출 → 테스트 구독자가 3s 내 order.created 수신 (Supabase 로컬).
- E2E(Playwright): 두 컨텍스트(손님/POS) — 주문 → POS 카드 등장·알림음 트리거 스텁 확인, WS 차단 → 폴백 표시등 + 폴링 수신(A-5).
