# 백엔드

보드·카드·그룹 API와 데이터 저장을 구현하는 공간입니다.

## 보드·카드 API 실행

저장소 루트에서 Python 3.12 이상을 사용합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload
```

서버가 켜지면 `http://127.0.0.1:8000/docs`에서 요청을 실행해 볼 수 있습니다. 보드 목록·생성·상세·삭제와 아이디어 생성·수정·삭제를 제공합니다. DB와 테이블은 서버가 시작될 때 준비됩니다. 그룹 수정과 AI 분석은 후속 작업입니다.

로컬 프론트엔드 주소는 `http://localhost:5173` 또는 `http://127.0.0.1:5173`을 허용합니다. 다른 포트를 사용하면 프론트엔드 담당자와 주소를 맞춰 설정을 변경해야 합니다.

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
