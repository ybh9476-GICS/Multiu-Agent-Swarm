# IMPIX AI Orchestration Platform 로컬 복제본

공개 배포본 `https://oddeye2796-cyber.github.io/impix-ai-orchestration-platform/`의 정적 HTML, CSS, JavaScript 파일을 내려받은 스냅샷입니다. 기존 그래프 앱과 분리되어 있습니다.

## 실행

PowerShell에서 이 폴더의 `serve.ps1`을 실행한 뒤 다음 주소를 엽니다.

`http://127.0.0.1:18746/impix-ai-orchestration-platform/`

서버는 이 컴퓨터의 `127.0.0.1`에만 연결됩니다. 포트가 사용 중이면 `./serve.ps1 -Port 18747`처럼 다른 포트를 지정할 수 있습니다.

## 범위

- 배포본의 정적 파일과 화면은 로컬에서 제공됩니다.
- 원격 제공처가 오류를 반환하는 장식용 `noise.svg`는 로컬 SVG로 대체했습니다.
- AI 호출 기능은 사이트에서 요구하는 Gemini API 또는 프록시 설정과 네트워크 접근이 필요할 수 있습니다. 별도의 키나 프록시 설정은 복사하지 않았습니다.
- 원본 사이트의 브라우저 저장값(언어·설정 등)은 다른 출처인 로컬 주소로 이전되지 않습니다.
