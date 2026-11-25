"""보드, 아이디어 카드 및 그룹 API."""

from contextlib import asynccontextmanager, closing, contextmanager
from pathlib import Path
import logging

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StrictInt, field_validator

from backend.database import DEFAULT_DATABASE, connect, initialize_database
from backend.analysis_service import StaleAnalysis, run_analysis
from ai.grouping import propose_idea_groups

logger = logging.getLogger(__name__)


class BoardCreate(BaseModel):
    title: str = Field(min_length=1)

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("보드 이름을 입력해 주세요.")
        return value


class IdeaInput(BaseModel):
    text: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("아이디어 내용을 입력해 주세요.")
        return value


class GroupInput(BaseModel):
    name: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("그룹 이름을 입력해 주세요.")
        return value


class IdeaGroupInput(BaseModel):
    group_id: StrictInt | None = Field(ge=1, le=2**63 - 1)


def create_app(database_path: str | Path = DEFAULT_DATABASE) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        initialize_database(database_path)
        yield

    app = FastAPI(title="Idea Hub API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    def get_board(db, board_id: int):
        board = db.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
        if board is None:
            raise HTTPException(status_code=404, detail="보드를 찾을 수 없습니다.")
        return dict(board)

    def get_idea(db, board_id: int, idea_id: int):
        idea = db.execute(
            "SELECT * FROM ideas WHERE id = ? AND board_id = ?", (idea_id, board_id)
        ).fetchone()
        if idea is None:
            raise HTTPException(status_code=404, detail="아이디어를 찾을 수 없습니다.")
        result = dict(idea)
        result["assignment_is_manual"] = bool(result["assignment_is_manual"])
        return result

    def group_response(row):
        result = dict(row)
        result["name_is_manual"] = bool(result["name_is_manual"])
        return result

    def get_group(db, board_id: int, group_id: int):
        group = db.execute(
            "SELECT * FROM groups WHERE id = ? AND board_id = ?", (group_id, board_id)
        ).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다.")
        return group_response(group)

    @contextmanager
    def edit_board_groups(board_id: int):
        with closing(connect(database_path)) as db, db:
            # 소속 확인과 변경 사이에 다른 요청이 데이터를 바꾸지 못하게 합니다.
            db.execute("BEGIN IMMEDIATE")
            get_board(db, board_id)
            yield db
            db.execute(
                "UPDATE boards SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
                (board_id,),
            )

    @app.get("/boards")
    def list_boards():
        with closing(connect(database_path)) as db:
            return [dict(row) for row in db.execute("SELECT * FROM boards ORDER BY id")]

    @app.post("/boards", status_code=status.HTTP_201_CREATED)
    def create_board(data: BoardCreate):
        with closing(connect(database_path)) as db, db:
            cursor = db.execute("INSERT INTO boards (title) VALUES (?)", (data.title,))
            return get_board(db, cursor.lastrowid)

    def load_board_detail(board_id: int):
        with closing(connect(database_path)) as db:
            db.execute("BEGIN")
            board = get_board(db, board_id)
            groups = [group_response(row) for row in db.execute(
                "SELECT * FROM groups WHERE board_id = ? ORDER BY id", (board_id,)
            )]
            ideas = [dict(row) for row in db.execute(
                "SELECT * FROM ideas WHERE board_id = ? ORDER BY id", (board_id,)
            )]
            for idea in ideas:
                idea["assignment_is_manual"] = bool(idea["assignment_is_manual"])
            board.update(groups=groups, ideas=ideas)
            return board

    @app.get("/boards/{board_id}")
    def read_board(board_id: int):
        return load_board_detail(board_id)

    @app.post("/boards/{board_id}/analyze", summary="아이디어 AI 분석")
    def analyze_board(board_id: int):
        # 없는 보드를 먼저 404로 처리하고, 분석 중에는 DB 쓰기 잠금을 잡지 않는다.
        load_board_detail(board_id)
        try:
            run_analysis(database_path, board_id, lambda request: propose_idea_groups(**request))
        except StaleAnalysis as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("아이디어 분석 실패: board_id=%s", board_id)
            raise HTTPException(status_code=503, detail="분석에 실패했습니다. 잠시 후 다시 시도해 주세요.") from exc
        return load_board_detail(board_id)

    @app.delete("/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_board(board_id: int):
        with closing(connect(database_path)) as db, db:
            get_board(db, board_id)
            db.execute("DELETE FROM boards WHERE id = ?", (board_id,))
        return Response(status_code=204)

    @app.post("/boards/{board_id}/ideas", status_code=status.HTTP_201_CREATED)
    def create_idea(board_id: int, data: IdeaInput):
        with closing(connect(database_path)) as db, db:
            get_board(db, board_id)
            cursor = db.execute(
                "INSERT INTO ideas (board_id, text) VALUES (?, ?)", (board_id, data.text)
            )
            db.execute("UPDATE boards SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", (board_id,))
            return get_idea(db, board_id, cursor.lastrowid)

    @app.patch("/boards/{board_id}/ideas/{idea_id}")
    def update_idea(board_id: int, idea_id: int, data: IdeaInput):
        with closing(connect(database_path)) as db, db:
            get_board(db, board_id)
            get_idea(db, board_id, idea_id)
            db.execute("UPDATE ideas SET text = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND board_id = ?", (data.text, idea_id, board_id))
            db.execute("UPDATE boards SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", (board_id,))
            return get_idea(db, board_id, idea_id)

    @app.delete("/boards/{board_id}/ideas/{idea_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_idea(board_id: int, idea_id: int):
        with closing(connect(database_path)) as db, db:
            get_board(db, board_id)
            get_idea(db, board_id, idea_id)
            db.execute("DELETE FROM ideas WHERE id = ? AND board_id = ?", (idea_id, board_id))
            db.execute("UPDATE boards SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", (board_id,))
        return Response(status_code=204)

    @app.post("/boards/{board_id}/groups", status_code=status.HTTP_201_CREATED)
    def create_group(board_id: int, data: GroupInput):
        with edit_board_groups(board_id) as db:
            cursor = db.execute(
                "INSERT INTO groups (board_id, name, name_is_manual) VALUES (?, ?, 1)",
                (board_id, data.name),
            )
            return get_group(db, board_id, cursor.lastrowid)

    @app.patch("/boards/{board_id}/groups/{group_id}")
    def rename_group(board_id: int, group_id: int, data: GroupInput):
        with edit_board_groups(board_id) as db:
            cursor = db.execute(
                """
                UPDATE groups
                SET name = ?, name_is_manual = 1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ? AND board_id = ?
                """,
                (data.name, group_id, board_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다.")
            return get_group(db, board_id, group_id)

    @app.delete(
        "/boards/{board_id}/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT
    )
    def delete_group(board_id: int, group_id: int):
        with edit_board_groups(board_id) as db:
            # 기존 DB 트리거가 해당 그룹의 카드를 미분류로 옮깁니다.
            cursor = db.execute(
                "DELETE FROM groups WHERE id = ? AND board_id = ?", (group_id, board_id)
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다.")
        return Response(status_code=204)

    @app.patch("/boards/{board_id}/ideas/{idea_id}/group")
    def move_idea(board_id: int, idea_id: int, data: IdeaGroupInput):
        with edit_board_groups(board_id) as db:
            if data.group_id is not None:
                get_group(db, board_id, data.group_id)
            cursor = db.execute(
                """
                UPDATE ideas
                SET group_id = ?, assignment_is_manual = 1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ? AND board_id = ?
                """,
                (data.group_id, idea_id, board_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="아이디어를 찾을 수 없습니다.")
            return get_idea(db, board_id, idea_id)

    return app


app = create_app()
