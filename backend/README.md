# 백엔드

보드·카드·그룹 API와 데이터 저장을 구현하는 공간입니다.

## API 실행

저장소 루트에서 Python 3.12 이상을 사용합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload
```

서버가 켜지면 `http://127.0.0.1:8000/docs`에서 요청을 실행해 볼 수 있습니다. DB와 테이블은 서버가 시작될 때 준비됩니다.

로컬 프론트엔드 주소는 `http://localhost:5173` 또는 `http://127.0.0.1:5173`을 허용합니다. 다른 포트를 사용하면 프론트엔드 담당자와 주소를 맞춰 설정을 변경해야 합니다.

## 그룹과 카드 이동

| 기능 | API | 요청 본문 | 성공 응답 |
|---|---|---|---|
| 그룹 생성 | `POST /boards/{board_id}/groups` | `{"name":"계정 관리"}` | 201, 새 그룹 |
| 그룹명 수정 | `PATCH /boards/{board_id}/groups/{group_id}` | `{"name":"계정 기능"}` | 200, 수정된 그룹 |
| 그룹 삭제 | `DELETE /boards/{board_id}/groups/{group_id}` | 없음 | 204 |
| 카드 이동 | `PATCH /boards/{board_id}/ideas/{idea_id}/group` | `{"group_id":10}` 또는 `{"group_id":null}` | 200, 수정된 카드 |

직접 만들거나 이름을 바꾼 그룹은 `name_is_manual: true`로 기록됩니다. 카드 이동은 `assignment_is_manual: true`로 기록되며, `group_id: null`을 보내면 미분류로 이동합니다. 그룹을 삭제하면 해당 카드를 미분류로 옮기고 수동 배정으로 표시합니다. 같은 보드 안의 카드와 그룹만 연결할 수 있으며, 해당 보드에서 찾을 수 없는 ID는 404를 반환합니다.

## 분석 API Mock (B4)

`POST /boards/{board_id}/analyze`는 빈 JSON 객체 `{}`로 호출할 수 있습니다. 응답은 200과 함께 보드 상세 조회와 같은 필드(`id`, `title`, `groups`, `ideas`, 생성·수정 시각)를 반환합니다. 없는 보드는 404입니다.

분석된 적이 없고 사용자가 직접 배정하지 않은 미분류 카드를 ID 순으로 읽습니다. 대상 중 첫 두 장을 **예시 그룹**으로 묶고, 나머지는 미분류로 표시합니다. 대상이 한 장이면 그 카드도 미분류로 남고, 대상이 없으면 현재 보드를 반환합니다. 기존 그룹과 기존 카드의 배정은 응답에서도 유지합니다.

`/docs`에서 보드를 만들고 카드 두 장 이상을 넣은 뒤 분석을 호출하면 결과 화면을 확인할 수 있습니다. 프론트엔드는 이 POST 응답을 읽어 화면을 갱신합니다. 예시 그룹의 음수 ID는 화면 표시용이며, 실제 그룹 수정 API에는 저장된 그룹 ID를 사용하세요. Mock 응답은 DB에 저장하지 않으므로 새로 조회하면 원래 상태가 나옵니다. 분석 결과 저장은 후속 작업입니다.

## SQLite DB 준비

저장소 루트에서 아래 명령을 실행하면 `backend/idea_hub.sqlite3` 파일과 테이블이 생성됩니다. Python 표준 라이브러리만 사용합니다.

```powershell
python -m backend.database
```

같은 명령을 다시 실행해도 기존 데이터는 유지됩니다. `CREATE TABLE IF NOT EXISTS`는 기존 테이블 구조를 변경하지 않으므로, 추후 모델을 변경할 때는 별도 마이그레이션이 필요합니다. DB 파일은 Git에 포함되지 않습니다.

다른 백엔드 코드에서 연결할 때는 `backend.database.connect()`를 사용하고 사용 후 연결을 닫습니다. 이 함수는 SQLite 외래 키 검사를 켭니다. 변경한 레코드의 `updated_at`은 API 구현 시 갱신해야 합니다. 그룹 삭제로 이동된 카드의 시각은 DB 트리거가 갱신합니다.

```powershell
python -m unittest discover -s backend/tests -v
```

## 분석 이력

`analysis_results` 테이블은 개발·테스트용으로 보드 ID, 상태(`running`, `completed`, `failed`), 분석 대상 카드 수(`target_count`), 시작 시각(`created_at`), 종료 시각(`completed_at`), 실패 내용(`error_message`)을 보관합니다. 상태를 완료 또는 실패로 바꿀 때 종료 시각을 입력합니다. 실패 시에는 오류 내용을 입력하고, 성공 시에는 오류 내용을 비웁니다. 시간은 UTC 문자열(예: `2026-11-19T04:00:00.000Z`)로 기록합니다. 보드 삭제 시 해당 이력도 삭제됩니다.

현재는 테이블 구조만 준비된 상태입니다. 분석 API와 AI 모듈을 연결할 때 실행 시작·완료·실패 기록을 저장하는 코드를 추가해야 실제 이력이 쌓입니다. 사용자에게 보여주는 이력 화면과 API는 포함하지 않습니다.
