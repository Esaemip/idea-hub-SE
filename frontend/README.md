# Idea Hub 프런트엔드

아이디어 카드 담당 범위(U1~U6)를 React + TypeScript로 구현한 보드입니다.

화면 흐름 시안은 [`docs/design/board-ui/`](../docs/design/board-ui/)에서 확인할 수 있습니다.

## 실행

```bash
npm install
npm run dev
```

기본값은 브라우저 `localStorage`에 저장되는 로컬 모드입니다. 백엔드를 연결하려면 먼저 백엔드에서 보드를 생성한 다음 `.env.example`을 `.env.local`로 복사하고 API 주소와 생성된 보드 ID를 설정합니다.

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/boards -ContentType 'application/json' -Body '{"title":"새로운 아이디어 보드"}'
Copy-Item .env.example .env.local
```

응답의 `id`를 `.env.local`의 `VITE_BOARD_ID`에 입력합니다. 환경 파일을 바꾼 뒤에는 개발 서버를 다시 시작해야 합니다.

## 구현 범위

- 카드 생성·수정·삭제
- 최대 50개 아이디어 일괄 입력과 중복·길이 검증
- 검색, 그룹 필터, 즐겨찾기
- 그룹 생성·이름 수정, 드래그 앤 드롭 및 선택 메뉴를 통한 카드 이동
- B2 카드 CRUD와 B3 저장 그룹 이름 변경·카드 이동 API 연동
- B4 분석 미리보기 호출 및 결과 그룹 표시, 실패 시 기존 화면 보존
- 음수 ID 분석 미리보기 그룹의 이름 변경·카드 이동 차단
- 도메인·API·주요 UI 흐름 테스트

## 검증

```bash
npm run test
npm run lint
npm run build
npm run test:e2e
```

원격 모드에서는 카드 생성·수정·삭제와 서버에 저장된 그룹의 이름 변경·카드 이동이 동기화됩니다. 화면에서 새로 만든 로컬 그룹과 즐겨찾기는 브라우저에 보존됩니다. 분석이나 저장 요청이 실패하면 기존 화면을 유지하고 하단에 오류를 표시합니다.
