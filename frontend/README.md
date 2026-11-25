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
- 메모지 격자의 카드 보기와 주제별 가로 줄의 분류 보기
- 그룹 생성·이름 수정, 드래그 앤 드롭 및 선택 메뉴를 통한 카드 이동
- B2 카드 CRUD와 B3 그룹 생성·저장 그룹 이름 변경·카드 이동 API 연동
- B5 실제 AI 분석 호출 및 DB에 저장된 결과 그룹 표시
- 분석 중 중복 요청·보드 조작 방지, 409 충돌 및 503 분석 실패 안내
- 도메인·API·주요 UI 흐름 테스트

## 검증

```bash
npm run test
npm run lint
npm run build
npm run test:e2e
```

원격 모드에서는 카드 생성·수정·삭제와 그룹 생성·이름 변경·카드 이동이 동기화됩니다. `아이디어 분석` 결과는 백엔드 DB에 저장되며 서버에서 다시 조회해도 유지됩니다. `group_id: null`인 카드는 미분류에 표시합니다. 분석 중 보드가 변경되어 409가 발생하면 새로고침 후 재분석하도록 안내하고, 분석이나 저장 요청이 실패하면 기존 화면을 유지하고 하단에 오류를 표시합니다. 로컬 모드의 그룹과 즐겨찾기는 브라우저에 보존됩니다.
