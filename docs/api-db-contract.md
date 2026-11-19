# Idea Hub API·DB 데이터 형식 합의 초안

상태: 팀 검토 전 초안 · 기준: 2026-11-19 PRD v0.2 · 개발 환경 제안: 로컬 FastAPI + SQLite

설계 기준: PRD v0.2와 팀 화면 시안.

## 1. 이 문서의 목적

화면, 서버, AI가 같은 데이터를 주고받기 위한 약속입니다. API와 DB를 구매하거나 외부 서비스에 가입한다는 뜻은 아닙니다. 프론트엔드·백엔드·AI 담당자가 함께 검토하고 수정합니다.

## 2. 핵심 동작

1. MVP에서 사용자는 보드를 만들고 카드를 작성·조회·수정·삭제합니다. 새 카드는 미분류 영역에 저장합니다.
2. 사용자가 **아이디어 분석** 버튼을 누르면 분석을 요청합니다. 화면에서 진행 상태를 표시하고, 응답을 받으면 그룹별 카드를 보여 줍니다. 적절한 그룹이 없는 카드는 미분류에 남습니다.
3. Beta에서 사용자는 아이디어를 이동하고 그룹명을 바꿀 수 있습니다. 추가 분석은 새 아이디어를 대상으로 하며 기존 그룹과 수동 수정 결과를 보존합니다. 이 동작은 최종 시연 검증에 포함됩니다.

시안의 프로필, 클라우드 저장공간, 즐겨찾기와 검색은 화면 참고 사항입니다. 이 문서는 PRD v0.2의 MVP·Beta 범위를 기준으로 합니다.

## 3. DB에 저장할 정보

SQLite에서 ID는 정수로 자동 생성합니다. 시간은 UTC ISO 8601 문자열로 저장하고 전송합니다. `null`은 값이 없음을 뜻합니다.

| 테이블 | 필드 | 뜻 |
|---|---|---|
| boards | id, title, created_at, updated_at | 보드 ID, 이름, 생성·수정 시각 |
| groups | id, board_id, name, name_is_manual, created_at, updated_at | 그룹 ID, 소속 보드, 이름, 사용자가 이름을 직접 바꿨는지 여부, 시각 |
| ideas | id, board_id, group_id, text, assignment_is_manual, analyzed_at, created_at, updated_at | 아이디어 ID, 소속 보드, 그룹 ID 또는 null(미분류), 내용, 수동 배정 여부, 분석 완료 시각 또는 null(아직 분석하지 않음), 생성·수정 시각 |
| analysis_results | id, board_id, status, created_at | 분석 실행 ID, 소속 보드, 상태(`running`, `completed`, `failed`), 시작 시각. 저장 여부와 이력 보관 범위는 팀 확인 사항 |

`analyzed_at`은 새 카드와 분석 후에도 미분류인 카드를 구분하기 위한 제안입니다. 분석이 성공하면 결과가 미분류여도 해당 대상의 `analyzed_at`을 기록합니다. 사용자 계정 및 로그인 구현 여부는 PRD의 미결 사항입니다.

`groups.board_id`와 `ideas.board_id`는 boards를 참조하며 `ideas.group_id`는 같은 보드의 그룹만 참조합니다. 보드 삭제 시 소속 그룹과 아이디어도 함께 삭제합니다. 그룹 삭제 시 아이디어를 삭제하지 않고 미분류로 이동하며 수동 지정 상태를 유지합니다. 팀에서 다른 정책을 원하면 구현 전에 수정합니다.

## 4. API 공통 약속

- 로컬 개발 주소 예시: `http://localhost:8000` (실제 포트는 팀 환경에 맞춤)
- 데이터 형식: JSON, 문자 인코딩 UTF-8
- 성공: 조회·수정 200, 생성 201, 삭제 204(응답 본문 없음)
- 실패 예시: 잘못된 입력 400 또는 422, 없는 ID 404, 분석 처리 실패 500
- 오류 형식 제안: `{"detail": "아이디어를 찾을 수 없습니다."}`. 실제 필드별 유효성 오류는 FastAPI 기본 422 형식을 사용할 수 있습니다.
- ID는 서버가 발급합니다. 요청에 다른 보드의 그룹 ID가 오면 거절합니다.

## 5. 화면 ↔ 서버 API

| 기능 | 메서드·주소 | 요청 본문 / 응답 | 단계 |
|---|---|---|---|
| 보드 목록 | GET /boards | 보드 배열 | MVP |
| 보드 생성 | POST /boards | `{"title":"회의 아이디어"}` / 생성된 보드 | MVP |
| 보드 전체 조회 | GET /boards/{board_id} | 보드, 그룹, 아이디어를 포함한 JSON | MVP |
| 보드 삭제 | DELETE /boards/{board_id} | 204 | 기존 일정 기반 제안 |
| 아이디어 생성 | POST /boards/{board_id}/ideas | `{"text":"로그인 화면 개선"}` / 생성된 미분류 아이디어 | MVP |
| 아이디어 내용 수정 | PATCH /boards/{board_id}/ideas/{idea_id} | `{"text":"수정된 내용"}` / 수정된 아이디어 | MVP |
| 아이디어 삭제 | DELETE /boards/{board_id}/ideas/{idea_id} | 204 | MVP |
| 분석 | POST /boards/{board_id}/analyze | `{}` / 저장된 최신 보드 전체 상태 | MVP. Beta에서 신규 카드 재분석도 같은 주소 사용 |
| 그룹명 수정 | PATCH /boards/{board_id}/groups/{group_id} | `{"name":"계정 기능"}` / 수정된 그룹. 수동 이름으로 표시 | Beta |
| 카드 이동 | PATCH /boards/{board_id}/ideas/{idea_id}/group | `{"group_id":10}` 또는 `{"group_id":null}` / 수정된 아이디어. 수동 배정으로 표시 | Beta |
| 그룹 수동 생성 | POST /boards/{board_id}/groups | `{"name":"계정 관리"}` / 수동 이름을 포함한 새 그룹 | 기존 일정 기반 제안 |
| 그룹 삭제 | DELETE /boards/{board_id}/groups/{group_id} | 아이디어는 미분류로 이동 후 204 | 추가 제안 |

초안은 분석 요청이 끝나면 최신 보드를 반환하는 방식입니다. 화면은 응답을 기다리는 동안 분석 중을 표시하고, 성공 시 결과로 갱신합니다. 분석 이력 조회가 필요해지면 별도 API를 검토합니다.

### 보드 전체 조회·분석 응답 예시

```json
{
  "id": 1,
  "title": "회의 아이디어",
  "created_at": "2026-11-19T04:00:00Z",
  "updated_at": "2026-11-19T04:05:00Z",
  "groups": [
    {"id": 10, "board_id": 1, "name": "계정 관리", "name_is_manual": true, "created_at": "2026-11-19T04:01:00Z", "updated_at": "2026-11-19T04:04:00Z"}
  ],
  "ideas": [
    {"id": 1, "board_id": 1, "group_id": 10, "text": "로그인 화면 개선", "assignment_is_manual": true, "analyzed_at": "2026-11-19T04:03:00Z", "created_at": "2026-11-19T04:02:00Z", "updated_at": "2026-11-19T04:04:00Z"},
    {"id": 2, "board_id": 1, "group_id": null, "text": "다크 모드 추가", "assignment_is_manual": false, "analyzed_at": null, "created_at": "2026-11-19T04:05:00Z", "updated_at": "2026-11-19T04:05:00Z"}
  ]
}
```

위 예시에서 아이디어는 `group_id`로 연결합니다. API를 받은 화면은 ID별로 아이디어를 그룹에 배치하고 `null`은 미분류로 표시합니다.

## 6. 서버 ↔ AI 분석 모듈

백엔드는 현재 보드의 기존 그룹과 참고용 아이디어를 전달하고, `target_idea_ids`에 실제 분류할 카드 ID를 담습니다. 첫 분석은 아직 분석하지 않은 카드가 대상입니다. Beta에서 다시 분석할 때는 추가된 카드만 대상으로 삼고 기존 카드는 비교에 사용합니다. 수동 배정한 카드는 대상에서 제외합니다. 대상이 없으면 현재 보드를 그대로 반환합니다. AI는 **배정 제안**을 반환하고 저장은 백엔드에서 처리합니다.

요청 예시:

```json
{
  "board_id": 1,
  "target_idea_ids": [2, 3, 4, 5],
  "groups": [{"group_id": 10, "name": "계정 관리", "name_is_manual": true}],
  "ideas": [
    {"idea_id": 1, "text": "로그인 화면 개선", "group_id": 10, "assignment_is_manual": true},
    {"idea_id": 2, "text": "소셜 로그인 추가", "group_id": null, "assignment_is_manual": false},
    {"idea_id": 3, "text": "다크 모드", "group_id": null, "assignment_is_manual": false},
    {"idea_id": 4, "text": "화면 밝기 설정", "group_id": null, "assignment_is_manual": false},
    {"idea_id": 5, "text": "회의 시간 알림", "group_id": null, "assignment_is_manual": false}
  ]
}
```

응답 예시:

```json
{
  "board_id": 1,
  "groups": [
    {"group_id": 10, "name": "계정 관리", "idea_ids": [2]},
    {"group_id": null, "name": "화면 설정", "idea_ids": [3, 4]}
  ],
  "unclassified_idea_ids": [5]
}
```

응답의 새 그룹은 `group_id: null`이며 서버가 DB에 저장할 때 ID를 발급합니다. `target_idea_ids`의 각 ID는 응답에서 정확히 한 그룹 또는 미분류에 한 번만 나와야 합니다. 이 예시에서 1번 카드는 참고용이므로 응답에서 빠져도 기존 그룹에 그대로 남습니다.

## 7. 수동 수정 보존과 실패 처리

- `assignment_is_manual: true`인 카드는 재분석으로 그룹을 변경하지 않습니다. 사용자가 미분류로 직접 옮긴 경우도 포함합니다.
- `name_is_manual: true`인 그룹명은 AI 제안으로 덮어쓰지 않습니다. 사용자가 수동으로 만든 그룹도 이름을 보존합니다.
- 재분석에서 기존 그룹을 가리키는 제안은 해당 그룹에 카드를 추가하는 용도로 적용합니다. 그룹명은 새로 만드는 그룹에만 AI 제안을 사용합니다.
- AI는 수동 카드를 참고해 신규 아이디어를 기존 그룹에 배정할 수 있습니다. 백엔드는 저장 전 수동 수정 상태와 결과 ID를 검증합니다.
- 분석 중 오류나 잘못된 결과가 나오면 분석 결과를 일부만 저장하지 않고 기존 보드 상태를 유지합니다. 아이디어 생성은 분석과 분리해 먼저 저장하므로, 분석이 실패해도 입력한 카드는 미분류로 남습니다.
- 기존 카드의 본문을 수정했을 때 다시 분석 대상으로 넣을지, 분석 후에도 미분류였던 카드를 다시 분석할 방법이 필요한지는 팀 확인 사항입니다. 초안에서는 작성 후 처음 분석되는 카드만 대상으로 합니다.

## 8. 합의 체크리스트

- [ ] 프론트엔드: 보드 전체 응답으로 화면과 미분류 영역을 표시할 수 있다.
- [ ] 백엔드: SQLite 관계, 삭제 정책, 응답 코드와 저장 범위를 확인했다.
- [ ] AI: 입력·출력 형식, 기존 그룹 ID, 신규 그룹과 미분류 규칙을 확인했다.
- [ ] 프론트엔드: 분석 버튼을 누른 뒤 진행·성공·실패 상태를 표시하고, 응답으로 보드를 갱신할 수 있다.
- [ ] 백엔드·AI: 재분석 때 기존 그룹과 카드 배정을 유지하고, 대상 ID만 반영하는 규칙을 확인했다.
- [ ] 백엔드: 보드별 분석 상태를 저장할지, 결과 이력을 얼마나 보관할지 확인했다.
- [ ] 전원: 최종 통합 검증에 수동 수정·신규 카드 재분석·새로고침을 포함하고, 아이디어 50개 데이터로 품질과 안정성을 확인하기로 했다.

일괄 입력, 검색·필터·즐겨찾기는 후속 범위입니다. 유사도 임계값과 그룹 이름 추천 방식은 AI 담당자가 샘플 데이터로 검증하면서 결정합니다.
