"""보드 및 아이디어 카드 API."""

from contextlib import asynccontextmanager, closing
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from backend.database import DEFAULT_DATABASE, connect, initialize_database


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

    @app.get("/boards")
    def list_boards():
        with closing(connect(database_path)) as db:
            return [dict(row) for row in db.execute("SELECT * FROM boards ORDER BY id")]

    @app.post("/boards", status_code=status.HTTP_201_CREATED)
    def create_board(data: BoardCreate):
        with closing(connect(database_path)) as db, db:
            cursor = db.execute("INSERT INTO boards (title) VALUES (?)", (data.title,))
            return get_board(db, cursor.lastrowid)

    @app.get("/boards/{board_id}")
    def read_board(board_id: int):
        with closing(connect(database_path)) as db:
            board = get_board(db, board_id)
            groups = [dict(row) for row in db.execute(
                "SELECT * FROM groups WHERE board_id = ? ORDER BY id", (board_id,)
            )]
            for group in groups:
                group["name_is_manual"] = bool(group["name_is_manual"])
            ideas = [dict(row) for row in db.execute(
                "SELECT * FROM ideas WHERE board_id = ? ORDER BY id", (board_id,)
            )]
            for idea in ideas:
                idea["assignment_is_manual"] = bool(idea["assignment_is_manual"])
            board.update(groups=groups, ideas=ideas)
            return board

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

    return app


app = create_app()
