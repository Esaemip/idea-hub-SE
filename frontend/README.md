# Idea Hub 프런트엔드

아이디어 카드 담당 범위(U1~U6)를 React + TypeScript로 구현한 보드입니다.

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
- B2 카드 API 계약을 따르는 REST API 어댑터와 로컬 저장 폴백
- 도메인·API·주요 UI 흐름 테스트

## 검증

```bash
npm run test
npm run build
```

현재 백엔드 `B2` 카드 CRUD API는 연결할 수 있고 `B3` 그룹 API는 아직 준비되지 않았습니다. 로컬 모드에서는 모든 기능이 동작합니다. 원격 모드에서는 카드 생성·수정·삭제가 서버와 동기화되며, 그룹 생성·이름 수정·카드 그룹 배치와 즐겨찾기는 브라우저에 보존됩니다. 원격 저장 실패 시에도 로컬 변경은 유지되고 화면 상단에 오류가 표시됩니다.
