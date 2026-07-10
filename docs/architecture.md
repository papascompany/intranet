# 사내 근태 MVP 데이터 모델/API 계약 초안

작성일: 2026-07-08  
참조 문서:

- `outputs/internal-hr-attendance-prd.md`
- `outputs/ceo-decisions-cto-implementation-note.md`

## 1. 설계 원칙

- MVP는 출퇴근, 휴가/연차/반차, 야근, 조기퇴근, 급여명세서 조회와 관리자 보정을 우선한다.
- 출퇴근 인증은 GPS를 기본으로 하되, 고정 QR과 Wi-Fi/IP는 보조 신호로만 사용한다.
- GPS 실패 시에도 QR 스캔 또는 재클릭으로 출퇴근을 허용하되, 반드시 `GPS_FAILED_ALLOWED`로 남긴다.
- 법정 연차와 회사 선사용 휴가는 별도 장부로 관리한다.
- 조기퇴근과 야근 상계는 급여 자동 계산으로 연결하지 않고 장부와 관리자 인정 상태까지만 제공한다.
- 원본 근태 기록은 삭제하지 않고 정정/보정 이력을 별도 엔티티와 감사 로그에 남긴다.

## 2. MVP 엔티티

| 엔티티 | 핵심 필드 | 설명 |
|---|---|---|
| `Employee` | `id`, `name`, `email`, `departmentId`, `role`, `hireDate`, `employmentStatus`, `primaryWorkplaceId`, `approverId` | 직원 기본 정보와 승인 라인 |
| `Department` | `id`, `name`, `managerEmployeeId` | 부서/팀 단위 조회와 승인 범위 |
| `Workplace` | `id`, `name`, `address`, `latitude`, `longitude`, `allowedRadiusMeters`, `allowedIpRanges`, `qrEnabled` | 사무실 2개, 기본 반경 300m |
| `AttendanceRecord` | `id`, `employeeId`, `workDate`, `clockInAt`, `clockOutAt`, `clockInVerificationId`, `clockOutVerificationId`, `status`, `earlyLeaveMinutes`, `correctionStatus` | 일자별 출퇴근 원장 |
| `VerificationAttempt` | `id`, `employeeId`, `workplaceId`, `attendanceRecordId`, `type`, `result`, `requestedAt`, `accuracyMeters`, `distanceMeters`, `failureReason`, `rawLocationStored` | GPS/QR/Wi-Fi/IP/수동 인증 시도 |
| `AttendanceCorrectionRequest` | `id`, `employeeId`, `attendanceRecordId`, `requestedClockInAt`, `requestedClockOutAt`, `reason`, `status`, `approverId`, `decidedAt` | 직원 출퇴근 정정 요청 |
| `AttendanceAdjustment` | `id`, `attendanceRecordId`, `employeeId`, `adjustmentType`, `beforeValue`, `afterValue`, `reason`, `adjustedBy`, `adjustedAt` | 관리자 보정, 인정지각/인정조퇴 포함 |
| `LeaveBalanceLedger` | `id`, `employeeId`, `ledgerType`, `amountDays`, `balanceAfterDays`, `reason`, `effectiveDate`, `expiresAt`, `relatedRequestId` | 법정/선사용/조정 휴가 장부 |
| `LeaveRequest` | `id`, `employeeId`, `leaveType`, `startDate`, `endDate`, `amountDays`, `reason`, `status`, `approverId`, `decidedAt` | 연차/반차/휴가 신청 |
| `AdvanceLeavePolicySnapshot` | `id`, `employeeId`, `eligibleFrom`, `monthlyGrantDays`, `grantCapDays`, `settledDays`, `unsettledDays` | 입사 3개월 후 월 1일 선사용 정책 스냅샷 |
| `EarlyLeaveLedger` | `id`, `employeeId`, `attendanceRecordId`, `workDate`, `minutes`, `status`, `reason`, `balanceAfterMinutes` | 17:00 이전 퇴근 누적 |
| `OvertimeRequest` | `id`, `employeeId`, `workDate`, `startAt`, `endAt`, `expectedMinutes`, `reason`, `weeklyOvertimeMinutesAtRequest`, `status`, `approverId`, `decidedAt` | 야근 신청/승인 |
| `OvertimeOffsetLedger` | `id`, `employeeId`, `overtimeRequestId`, `earlyLeaveLedgerId`, `offsetMinutes`, `status`, `payApprovedMinutes`, `decidedBy`, `decidedAt` | 조기퇴근-야근 상계와 수당 집계 인정 |
| `PayrollStatement` | `id`, `employeeId`, `payrollMonth`, `storageBucket`, `storagePath`, `fileName`, `uploadedBy`, `uploadedAt`, `deletedAt`, `deletedBy`, `deleteReason` | 급여명세서 파일 메타데이터, soft delete |
| `AuditLog` | `id`, `actorEmployeeId`, `action`, `targetType`, `targetId`, `beforeJson`, `afterJson`, `reason`, `ipAddress`, `userAgent`, `createdAt` | 민감 조회/변경/삭제 감사 로그 |

## 3. 상태값 계약

### 3.1 역할

| 값 | 의미 |
|---|---|
| `EMPLOYEE` | 본인 출퇴근, 신청, 조회 |
| `APPROVER` | 승인 대상 직원의 신청 승인/반려와 요약 조회 |
| `HR_ADMIN` | 전체 직원, 근태, 휴가, 급여명세서 운영 |
| `SYSTEM_ADMIN` | 권한, 근무지, 정책, 감사 로그 운영 |

### 3.2 출퇴근/인증

| 구분 | 값 |
|---|---|
| `AttendanceRecord.status` | `OPEN`, `COMPLETED`, `MISSING_CLOCK_IN`, `MISSING_CLOCK_OUT`, `CORRECTED`, `ADJUSTED` |
| `VerificationAttempt.type` | `GPS`, `QR`, `WIFI_IP`, `MANUAL_CLICK` |
| `VerificationAttempt.result` | `PASS`, `FAIL`, `GPS_FAILED_ALLOWED`, `GPS_FAILED_QR_ALLOWED`, `GPS_FAILED_MANUAL_ALLOWED` |
| `VerificationAttempt.failureReason` | `OUT_OF_RADIUS`, `PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, `ACCURACY_TOO_LOW`, `TIMEOUT`, `QR_INVALID`, `IP_NOT_ALLOWED` |
| `AttendanceCorrectionRequest.status` | `REQUESTED`, `APPROVED`, `REJECTED`, `CANCELED` |
| `AttendanceAdjustment.adjustmentType` | `APPROVED_LATE`, `APPROVED_EARLY_LEAVE`, `CLOCK_IN_CORRECTION`, `CLOCK_OUT_CORRECTION`, `MISSING_RECORD_CREATED` |

### 3.3 휴가/야근/급여

| 구분 | 값 |
|---|---|
| `LeaveBalanceLedger.ledgerType` | `STATUTORY`, `ADVANCE`, `ADJUSTMENT` |
| `LeaveRequest.leaveType` | `ANNUAL`, `HALF_DAY_AM`, `HALF_DAY_PM`, `SPECIAL`, `UNPAID` |
| 신청 공통 `status` | `REQUESTED`, `APPROVED`, `REJECTED`, `CANCELED` |
| `EarlyLeaveLedger.status` | `APPROVED`, `FLEX_ALLOWED`, `LEAVE_RELATED`, `UNAPPROVED`, `CORRECTED` |
| `OvertimeOffsetLedger.status` | `EARLY_LEAVE_ACCRUED`, `OVERTIME_APPROVED`, `OFFSET_APPLIED`, `OFFSET_EXCLUDED_PEAK_SEASON`, `OVERTIME_PAY_APPROVED`, `OVERTIME_PAY_NOT_COUNTED` |
| `PayrollStatement` 삭제 | `deletedAt`이 있으면 직원/일반 관리자 목록에서 제외, 감사 로그로 추적 |

## 4. 주요 API 계약

응답은 기본적으로 `{ data, meta }` 형태를 사용하고, 실패는 `{ error: { code, message, details } }`로 통일한다. 모든 시간은 ISO 8601, 서버 저장은 UTC, 화면 표시는 회사 기본 타임존을 사용한다.

### 4.1 직원 API

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| `GET` | `/api/me/dashboard` | 본인 | 오늘 출퇴근 상태, 휴가 잔액, 조기퇴근 누계, 대기 신청 요약 |
| `POST` | `/api/attendance/clock-in` | 본인 | 출근 처리, GPS/QR/Wi-Fi/IP 인증 페이로드 포함 |
| `POST` | `/api/attendance/clock-out` | 본인 | 퇴근 처리, 17:00 이전이면 조기퇴근 장부 생성 |
| `GET` | `/api/attendance/me?from=&to=` | 본인 | 본인 출퇴근 내역 |
| `POST` | `/api/attendance/corrections` | 본인 | 누락/오류 정정 요청 생성 |
| `PATCH` | `/api/attendance/corrections/:id` | 본인 | 대기 중 정정 요청 취소 |
| `GET` | `/api/early-leave/me?from=&to=` | 본인 | 본인 조기퇴근 누계/상계 내역 |
| `GET` | `/api/leave/balance/me` | 본인 | 법정/선사용/조정 장부 잔액 |
| `POST` | `/api/leave/requests` | 본인 | 휴가/연차/반차 신청 |
| `GET` | `/api/leave/requests/me` | 본인 | 본인 휴가 신청 내역 |
| `POST` | `/api/overtime/requests` | 본인 | 야근 신청, 주 12시간 초과 가능성 경고 포함 |
| `GET` | `/api/overtime/requests/me` | 본인 | 본인 야근/상계 내역 |
| `GET` | `/api/payroll/statements/me` | 본인 | 본인 급여명세서 목록 |
| `GET` | `/api/payroll/statements/:id/download` | 본인 | 본인 명세서만 다운로드, storage metadata/signed URL 반환, 감사 로그 기록 |

### 4.2 관리자 API

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| `GET` | `/api/admin/employees` | `HR_ADMIN` 이상 | 직원 목록 |
| `POST` | `/api/admin/employees` | `HR_ADMIN` 이상 | 직원 등록 |
| `PATCH` | `/api/admin/employees/:id` | `HR_ADMIN` 이상 | 직원 정보 수정 |
| `GET` | `/api/admin/workplaces` | `HR_ADMIN` 이상 | 근무지/GPS/QR/IP 설정 조회 |
| `PATCH` | `/api/admin/workplaces/:id` | `SYSTEM_ADMIN` | 근무지 좌표, 반경, QR 사용 여부 수정 |
| `GET` | `/api/admin/attendance?from=&to=&employeeId=&departmentId=&verificationResult=` | `APPROVER` 이상 | 권한 범위 내 근태 조회, GPS 실패 필터 포함 |
| `GET` | `/api/admin/attendance/corrections` | `APPROVER` 이상 | 정정 요청 목록 |
| `PATCH` | `/api/admin/attendance/corrections/:id` | `APPROVER` 이상 | 정정 요청 승인/반려 |
| `POST` | `/api/admin/attendance/adjustments` | `HR_ADMIN` 이상 | 관리자 출퇴근 보정 |
| `GET` | `/api/admin/early-leave?from=&to=&employeeId=&departmentId=` | `APPROVER` 이상 | 조기퇴근 조회/CSV 대상 |
| `GET` | `/api/admin/leave/requests` | `APPROVER` 이상 | 휴가 신청 목록 |
| `PATCH` | `/api/admin/leave/requests/:id` | `APPROVER` 이상 | 휴가 승인/반려 |
| `GET` | `/api/admin/overtime/requests` | `APPROVER` 이상 | 야근 신청 목록 |
| `PATCH` | `/api/admin/overtime/requests/:id` | `APPROVER` 이상 | 야근 승인/반려 |
| `PATCH` | `/api/admin/overtime-offsets/:id` | `HR_ADMIN` 이상 | 수당 집계 인정/미인정 |
| `GET` | `/api/admin/payroll/statements/:id/download` | `HR_ADMIN` 이상 | 직원 명세서 다운로드, storage metadata/signed URL 반환, 감사 로그 기록 |
| `POST` | `/api/admin/payroll/statements` | `HR_ADMIN` 이상 | 급여명세서 업로드, storage bucket/path 기록 |
| `DELETE` | `/api/admin/payroll/statements/:id` | `HR_ADMIN` 이상 | soft delete, 사유/삭제자/삭제시각 필수 |
| `GET` | `/api/admin/audit-logs` | `SYSTEM_ADMIN` | 감사 로그 조회 |

### 4.3 주요 요청 페이로드

```json
{
  "attendanceClock": {
    "workplaceId": "workplace_1",
    "verification": {
      "type": "GPS",
      "latitude": 37.0,
      "longitude": 127.0,
      "accuracyMeters": 45,
      "qrWorkplaceId": null,
      "clientCapturedAt": "2026-07-08T00:00:00.000Z"
    }
  },
  "attendanceAdjustment": {
    "attendanceRecordId": "attendance_1",
    "adjustmentType": "CLOCK_OUT_CORRECTION",
    "afterValue": "2026-07-08T08:00:00.000Z",
    "reason": "GPS 오류로 퇴근 시간이 잘못 기록됨"
  },
  "leaveRequest": {
    "leaveType": "HALF_DAY_PM",
    "startDate": "2026-07-10",
    "endDate": "2026-07-10",
    "amountDays": 0.5,
    "reason": "개인 일정"
  }
}
```

## 5. 권한 체크

- 직원은 `employeeId == session.employeeId`인 데이터만 조회/생성할 수 있다.
- 직원은 승인/반려, 관리자 보정, 급여명세서 업로드/삭제를 수행할 수 없다.
- 승인자는 `approverId == session.employeeId` 또는 담당 부서 범위에 속한 직원의 신청만 조회/결정할 수 있다.
- 승인자는 급여명세서 원본 파일과 감사 로그를 조회할 수 없다.
- HR 관리자는 전체 직원의 근태, 휴가, 야근, 급여명세서를 운영할 수 있다.
- 시스템 관리자는 근무지, 정책, 권한, 감사 로그를 관리할 수 있다.
- 급여명세서 다운로드는 본인, HR 관리자, 시스템 관리자만 가능하며 접근 로그를 항상 남긴다.
- 관리자 보정과 급여명세서 삭제는 `reason`이 없으면 실패해야 한다.

## 6. 감사 로그 정책

### 6.1 기록 대상

| 이벤트 | 액션 예시 | 필수 기록 |
|---|---|---|
| 출퇴근 인증 실패 후 허용 | `ATTENDANCE_GPS_FAILED_ALLOWED` | 직원, 근무지, 인증 방식, 실패 사유, 거리/정확도, 시각 |
| 정정 요청 결정 | `ATTENDANCE_CORRECTION_APPROVED`, `ATTENDANCE_CORRECTION_REJECTED` | 요청자, 승인자, 전/후 시각, 사유 |
| 관리자 보정 | `ATTENDANCE_ADJUSTED` | 보정자, 대상 직원, 보정 유형, 전/후 값, 사유 |
| 휴가/야근 승인 | `LEAVE_APPROVED`, `OVERTIME_APPROVED` | 승인자, 대상 직원, 신청 ID, 결정 시각 |
| 수당 집계 인정 | `OVERTIME_PAY_APPROVED`, `OVERTIME_PAY_REJECTED` | 결정자, 상계 ID, 인정 분, 사유 |
| 급여명세서 조회/다운로드 | `PAYROLL_VIEWED`, `PAYROLL_DOWNLOADED` | 조회자, 대상 직원, 명세서 ID, IP, userAgent |
| 급여명세서 업로드/삭제 | `PAYROLL_UPLOADED`, `PAYROLL_DELETED` | 처리자, 대상 직원, 파일 ID, 삭제 사유 |
| 권한/근무지/정책 변경 | `ROLE_CHANGED`, `WORKPLACE_UPDATED`, `POLICY_UPDATED` | 변경자, 전/후 값, 사유 |

### 6.2 보관/개인정보

- 위치정보는 출퇴근 버튼 클릭 시점에만 수집한다.
- 기본 저장값은 판정 결과, 인증 방식, 근무지, 거리, 정확도이며 원시 좌표 저장은 정책 설정으로 분리한다.
- 원시 좌표를 저장하는 경우 보관 기간을 짧게 두고 감사 목적 외 조회를 제한한다.
- 급여명세서는 관리자가 삭제하기 전까지 보관하되, 삭제는 soft delete로 시작한다.
- 감사 로그는 일반 수정 API로 변경할 수 없고 별도 보존 정책에 따라 관리한다.

## 7. MVP 운영 기본값

| 항목 | 기본값 |
|---|---|
| 근무지 | 회사 사무실 2개 |
| GPS 허용 반경 | 각 근무지 300m |
| QR | 출입문 고정 QR 1개, `workplaceId` 또는 체크인 URL만 포함 |
| 기본 퇴근 시간 | 17:00 |
| 선사용 휴가 시작 | 입사 3개월 경과 후 |
| 선사용 휴가 충전 | 매월 1일, 다음해 지급 예정 연차 총량 상한 |
| 조기퇴근-야근 상계 제외 | 1월, 2월 |
| 급여명세서 보관 | 관리자 삭제 전까지 |
| 파일럿 | 운영팀, 대표 포함 4명 |
