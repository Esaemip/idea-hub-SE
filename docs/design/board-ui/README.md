# 보드 화면 시안 — 계정 · 보드 관리 · 메모 쓰기 · 분류 · 예외 상태

담당: 이재환 · 브랜치 `feature/board-ui`

입력칸 없이 **메모장처럼 바로 적고 → Enter로 메모지를 붙이고 → "분류하기"로 주제별로 모으는** 보드 화면과, 그 앞뒤에 필요한 로그인·보드 관리·예외 상태 화면 시안입니다. 마인드맵은 이번 범위에서 뺐습니다. 서버·AI와는 아직 연결하지 않았습니다.

> **팀원 확인 목록은 [`REVIEW.md`](REVIEW.md)에 있습니다.** 화면마다 필요한 서버 기능과 지금 API(P2 명세, B2 PR #5)를 나란히 비교해 두었습니다.

## 여는 방법

HTML 파일을 내려받아 두 번 누르면 브라우저(Chrome 권장)에서 열립니다. 설치할 것은 없고, 파일 하나만 있어도 열립니다. 화면끼리 이어 보려면 네 파일을 같은 폴더에 두세요.

| 파일 | 화면 | 처음 열리는 모습 |
|---|---|---|
| `login.html` | 로그인 · 회원가입 · 복구 코드 | 로그인 |
| `boards.html` | 내 보드 목록 | 보드 4개 |
| `index.html` | 보드 (메모 쓰기 · 분류) | 예시 메모 24개 |
| `account.html` | 계정 설정 | 계정 설정 |

주소 끝에 `?state=…`를 붙이면 특정 상태로 바로 열립니다. 아래 표의 "주소"가 그 값입니다.

## 1. 기본 흐름

| 화면 | 주소 | 설명 |
|---|---|---|
| ![](screenshots/1-empty-board.png) | `index.html?state=new` | 빈 보드. 입력칸 없이 바로 적습니다. |
| ![](screenshots/2-writing.png) | — | `Enter` → 메모지로 붙기, `Shift + Enter` → 줄바꿈. 빈 곳을 두 번 누르면 그 자리에서 적습니다. |
| ![](screenshots/3-card.png) | `index.html` | 메모지 보드. 펜, 표시(별), 메모 찾기, 확대·축소 |
| ![](screenshots/4-classified.png) | `index.html?state=groups` | 분류하기 결과. 메모를 눌러 다른 주제로 옮기면 "고정"되어 다시 분류해도 그대로입니다. |

## 2. 계정 (메일 인증 없음)

메일 인증을 쓰지 않기로 해서, 비밀번호를 잊었을 때는 가입할 때 받은 **복구 코드**로 새 비밀번호를 정합니다.

| 화면 | 주소 | 설명 |
|---|---|---|
| ![](screenshots/05-login.png) | `login.html` | 로그인 |
| ![](screenshots/06-login-error.png) | `?state=error` | 로그인 실패. 이메일과 비밀번호 중 무엇이 틀렸는지는 알려 주지 않습니다. |
| ![](screenshots/07-signup.png) | `?state=signup` | 회원가입. 입력 오류를 바로 보여 주고, 비밀번호 조건을 하나씩 체크합니다. |
| ![](screenshots/08-recovery-code.png) | `?state=code` | 가입 직후 복구 코드 저장. "적어 뒀어요"를 체크해야 넘어갑니다. |
| ![](screenshots/09-forgot-password.png) | `?state=recover` | 비밀번호를 잊었을 때. 이메일 + 복구 코드 + 새 비밀번호. 쓴 코드는 버리고 새 코드를 줍니다. |
| ![](screenshots/10-session-expired.png) | `?state=expired` | 로그인 시간 만료(서버 401). 다시 로그인하면 보던 보드로 돌아갑니다. |
| ![](screenshots/16-account.png) | `account.html` | 계정 설정: 이름, 비밀번호 바꾸기, 복구 코드 새로 만들기, 로그아웃 |
| ![](screenshots/17-account-delete.png) | `account.html?state=delete` | 회원 탈퇴 확인. 비밀번호를 넣어야 탈퇴됩니다. |

시안 확인용: 회원가입에서 `jaehwan@example.com`을 넣으면 "이미 가입된 이메일" 오류, 비밀번호 찾기에서는 코드 `K7QM-2XPA-9DRT`만 통과합니다.

## 3. 보드 관리

| 화면 | 주소 | 설명 |
|---|---|---|
| ![](screenshots/11-boards.png) | `boards.html` | 내 보드 목록. 메모 수, 주제 수, 분류 상태, 최근 수정 |
| ![](screenshots/12-boards-empty.png) | `?state=empty` | 보드가 하나도 없을 때 |
| ![](screenshots/13-new-board.png) | `?state=new` | 새 보드 이름 정하기(최대 40자). 만들면 빈 보드가 열립니다. |
| ![](screenshots/14-rename-board.png) | `?state=rename` | 보드 이름 바꾸기 |
| ![](screenshots/15-delete-board.png) | `?state=delete` | 삭제 확인. 함께 지워지는 메모 수를 보여 줍니다. |

## 4. 예외 상태

| 화면 | 주소 | 설명 |
|---|---|---|
| ![](screenshots/18-boards-error.png) | `boards.html?state=error` | 보드 목록을 못 불러옴 → 다시 시도 |
| ![](screenshots/19-board-loading.png) | `index.html?state=loading` | 보드 불러오는 중 |
| ![](screenshots/20-board-offline.png) | `?state=offline` | 서버 연결 실패 → 다시 시도 / 내 보드 목록 |
| ![](screenshots/21-board-notfound.png) | `?state=notfound` | 없는 보드(404) |
| ![](screenshots/22-analyze-fail.png) | `?state=analyzefail` | 분류 실패. 메모는 그대로 두고 다시 시도 |
| ![](screenshots/23-save-fail.png) | `?state=savefail` | 메모 저장 실패. 해당 메모지에 빨간 점선, "다시 저장" |
| ![](screenshots/24-search-nohit.png) | `?state=nohit` | 찾는 메모가 없음 → 찾기 지우기 |
| ![](screenshots/25-memo-deleted.png) | `?state=gone` | 이미 지워진 메모를 고치려 할 때(404) |

## PRD 요구사항과 연결

| PRD | 시안에서 해 볼 수 있는 것 |
|---|---|
| F-001 카드 생성·수정·삭제 | Enter로 메모지 붙이기, 두 번 눌러 고치기, 메모를 누르면 나오는 막대에서 삭제 |
| F-002 데이터 저장·조회 | 보드 목록·불러오기·저장 실패 화면 (실제 저장은 서버 연결 후) |
| F-003 사용자 요청 기반 자동 그룹화 | 분류하기 버튼, 진행 중·실패 상태, 어디에도 안 맞는 메모는 미분류 |
| F-004 그룹화 결과 시각화 | 주제별 줄과 주제 색 메모지 |
| F-005 분류 결과 수동 수정 | 분류 화면에서 메모를 눌러 다른 주제로 옮기기 |
| F-006 사용자 수정 결과 보존 | 옮긴 메모는 "고정"되어 다시 분류해도 그대로 |
| F-007 그룹·아이디어 조회 | 메모 찾기, 찾는 메모가 없을 때 안내, 주제 줄 접고 펼치기 |

## 파일

- `login.html`, `boards.html`, `index.html`, `account.html` — 화면. 각 파일 안의 `render()` 템플릿이 화면 구조, `Page` 클래스가 동작입니다. 화면을 그리는 작은 라이브러리(Preact + htm, 13KB)가 파일마다 함께 들어 있습니다.
- `screenshots/` — 위 표의 화면 캡처
- `REVIEW.md` — 팀원 확인 목록
- `LICENSE-htm.txt` — 함께 넣은 라이브러리의 라이선스(htm, Apache-2.0). Preact(MIT) 고지는 맨 아래에 있습니다.

## React로 옮길 때 참고

- `Page` 클래스는 React의 클래스 컴포넌트와 같은 방식(`state`, `setState`)이라 거의 그대로 옮길 수 있습니다. 템플릿의 `style="..."` 문자열은 React에서는 객체로 바꿔야 합니다.
- 메모 데이터는 `{ id, text, g(주제), x, y, marked, pinned }` 형태입니다. `docs/api-db-contract.md`의 `ideas` 테이블과 맞출 때 `g`는 `group_id`, `pinned`는 `assignment_is_manual`에 해당합니다.

---

Preact 고지: Copyright (c) 2015-present Jason Miller. MIT License — Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
