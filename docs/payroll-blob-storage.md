# 급여명세서 Vercel Blob 운영 설정

급여명세서 파일은 Vercel Blob의 `private` 접근 등급으로 저장된다. Blob URL과 `BLOB_READ_WRITE_TOKEN`은 브라우저에 노출하지 않는다. 다운로드는 로그인 세션을 다시 검증하는 `GET /api/payroll?statementId=...`가 파일을 스트리밍한다.

## Vercel 환경 변수

Production과 Preview에 아래 값을 등록한다.

| 이름 | 용도 |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 서버 전용 읽기/쓰기 토큰 |

토큰이 없으면 급여 업로드 또는 다운로드는 `BLOB_READ_WRITE_TOKEN is required for payroll file storage.` 오류로 실패한다. 토큰 값은 상태 API, 에러 응답, 감사 로그에 기록하지 않는다.

## 업로드 API 계약

`POST /api/hr`의 `uploadPayrollStatement` 액션은 아래 파일 payload를 받는다. 파일 내용은 JSON 전송을 위해 Base64로 인코딩하며 서버에서 다시 검증한다.

```json
{
  "action": "uploadPayrollStatement",
  "payload": {
    "employeeId": "emp-ops-1",
    "month": "2026-07",
    "filename": "2026-07-payroll.pdf",
    "file": {
      "contentBase64": "JVBERi0xLjQK...",
      "contentType": "application/pdf",
      "sizeBytes": 12345
    }
  }
}
```

허용 파일은 PDF이며 최대 10 MiB다. 파일명에는 경로 구분자와 제어 문자를 허용하지 않고, 저장 경로는 서버가 직원·급여월·파일명으로 생성한다. 클라이언트가 storage bucket 또는 path를 지정할 수 없다.

급여명세서는 soft delete 정책이므로 Blob 원본을 즉시 물리 삭제하지 않는다. 삭제된 명세서는 다운로드 API에서 거부되고, DB 메타데이터와 감사 로그로 추적된다.
