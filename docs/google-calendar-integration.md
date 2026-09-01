# Google Calendar 연동

## 현재 계정

- Google Cloud 프로젝트: `intra-localserver`
- 서비스 계정: `intra-628@intra-localserver.iam.gserviceaccount.com`
- 연결 캘린더: 회사일반, 개발/운영, 생산관리
- 권한: 일정 읽기 전용(`calendar.events.readonly`)

Calendar API는 프로젝트에서 활성화되어 있습니다. 각 캘린더의 설정에서 아래 서비스 계정을 `일정의 모든 세부정보 보기` 권한으로 공유해야 일정이 표시됩니다.

`intra-628@intra-localserver.iam.gserviceaccount.com`

## 환경변수

로컬 개발은 다운로드한 JSON 파일 경로를 사용합니다.

```text
GOOGLE_CALENDAR_IDS=캘린더ID1,캘린더ID2,캘린더ID3
GOOGLE_CALENDAR_LABELS=회사일반,개발/운영,생산관리
GOOGLE_CALENDAR_CREDENTIALS_PATH=/path/to/service-account.json
GOOGLE_CALENDAR_TIMEZONE=Asia/Seoul
```

Coolify 운영 환경에서는 JSON 원문을 저장소나 로그에 넣지 않고 base64로 인코딩한 값을 `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON_BASE64`에 등록합니다. 새 환경변수는 Coolify 앱 env가 정본입니다.

## 화면 동작

대시보드의 `일정` 패널에서 `회사 일정`이 기본 탭으로 열리고, `휴가 일정` 탭에서 기존 연차·반차 일정을 확인합니다. Google 연결이 실패해도 근태·휴가 신청 화면은 사용할 수 있으며, 회사 일정 탭 안에서만 오류와 재시도를 제공합니다. 조회 결과는 서버와 브라우저에서 각각 5분간 캐시합니다.
