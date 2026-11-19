-- SQLite의 외래 키 검사는 연결마다 활성화해야 합니다 (database.py 참고).
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    name_is_manual INTEGER NOT NULL DEFAULT 0 CHECK (name_is_manual IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    UNIQUE (board_id, id)
);

CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    group_id INTEGER,
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    assignment_is_manual INTEGER NOT NULL DEFAULT 0 CHECK (assignment_is_manual IN (0, 1)),
    analyzed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (board_id, group_id) REFERENCES groups(board_id, id)
);

CREATE TABLE IF NOT EXISTS analysis_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    target_count INTEGER NOT NULL CHECK (target_count >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at TEXT,
    error_message TEXT,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    CHECK ((status = 'running' AND completed_at IS NULL AND error_message IS NULL)
        OR (status = 'completed' AND completed_at IS NOT NULL AND error_message IS NULL)
        OR (status = 'failed' AND completed_at IS NOT NULL AND length(trim(COALESCE(error_message, ''))) > 0)),
    CHECK (completed_at IS NULL OR completed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_groups_board_id ON groups(board_id);
CREATE INDEX IF NOT EXISTS idx_ideas_board_group ON ideas(board_id, group_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_board_created ON analysis_results(board_id, created_at);

-- 그룹만 삭제할 때 카드는 남기고 미분류로 이동합니다.
CREATE TRIGGER IF NOT EXISTS groups_unclassify_ideas_before_delete
BEFORE DELETE ON groups
BEGIN
    UPDATE ideas
    SET group_id = NULL,
        assignment_is_manual = 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE board_id = OLD.board_id AND group_id = OLD.id;
END;
