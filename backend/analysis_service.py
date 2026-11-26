"""P2 AI 분석 요청 구성, 결과 검증 및 원자적 반영."""
from contextlib import closing
import logging

from backend.database import connect

logger = logging.getLogger(__name__)


class InvalidAnalysis(ValueError):
    """AI 결과가 P2 계약을 지키지 않는다."""


class StaleAnalysis(RuntimeError):
    """분석 중 보드가 변경되어 결과를 안전하게 반영할 수 없다."""


def _snapshot(connection, board_id):
    if connection.execute('SELECT 1 FROM boards WHERE id = ?', (board_id,)).fetchone() is None:
        raise ValueError('보드를 찾을 수 없습니다')
    groups = [dict(row) for row in connection.execute(
        'SELECT id AS group_id, name, name_is_manual FROM groups WHERE board_id = ? ORDER BY id', (board_id,))]
    ideas = [dict(row) for row in connection.execute(
        'SELECT id AS idea_id, text, group_id, assignment_is_manual, analyzed_at '
        'FROM ideas WHERE board_id = ? ORDER BY id', (board_id,))]
    return groups, ideas


def _validate(result, board_id, groups, targets):
    if not isinstance(result, dict) or type(result.get('board_id')) is not int or result['board_id'] != board_id:
        raise InvalidAnalysis('보드 ID가 일치하지 않습니다')
    proposals = result.get('groups')
    unclassified = result.get('unclassified_idea_ids')
    if not isinstance(proposals, list) or not isinstance(unclassified, list):
        raise InvalidAnalysis('그룹 또는 미분류 목록이 올바르지 않습니다')
    group_ids = {group['group_id'] for group in groups}
    seen_groups = set()
    seen = []
    for proposal in proposals:
        if not isinstance(proposal, dict) or 'group_id' not in proposal:
            raise InvalidAnalysis('그룹 형식이 올바르지 않습니다')
        group_id = proposal['group_id']
        if group_id is None:
            if not isinstance(proposal.get('name'), str) or not proposal['name'].strip():
                raise InvalidAnalysis('새 그룹 이름이 필요합니다')
        elif type(group_id) is not int or group_id not in group_ids or group_id in seen_groups:
            raise InvalidAnalysis('기존 그룹 ID가 올바르지 않거나 중복입니다')
        else:
            seen_groups.add(group_id)
        ids = proposal.get('idea_ids')
        if not isinstance(ids, list) or not ids:
            raise InvalidAnalysis('그룹의 카드 목록이 비어 있거나 올바르지 않습니다')
        seen.extend(ids)
    seen.extend(unclassified)
    if any(type(idea_id) is not int for idea_id in seen) or len(seen) != len(set(seen)) or set(seen) != set(targets):
        raise InvalidAnalysis('분석 대상 카드는 정확히 한 번씩 포함되어야 합니다')


def _record_failure(database_path, history_id, exc):
    """보드 변경은 롤백하고 실패 이력은 별도의 트랜잭션으로 기록한다."""
    if isinstance(exc, StaleAnalysis):
        message = '분석 중 보드가 변경되었습니다'
    elif isinstance(exc, InvalidAnalysis):
        message = 'AI 분석 결과가 계약에 맞지 않습니다'
    else:
        # 모델이나 DB 오류 문자열에는 카드 내용이나 경로가 포함될 수 있다.
        message = '분석 처리 중 오류가 발생했습니다'
    try:
        with closing(connect(database_path)) as connection, connection:
            connection.execute(
                "UPDATE analysis_results SET status = 'failed', "
                "completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error_message = ? "
                "WHERE id = ? AND status = 'running'", (message, history_id))
    except Exception:
        # 기록 실패가 원래 분석 오류를 가리지 않게 서버 로그에 남긴다.
        logger.exception('분석 실패 이력을 기록하지 못했습니다: history_id=%s', history_id)


def run_analysis(database_path, board_id, analyzer):
    """분석 대상이 있으면 실행 이력을 남기고 결과를 원자적으로 저장한다."""
    with closing(connect(database_path)) as connection:
        connection.execute('BEGIN IMMEDIATE')
        groups, ideas = _snapshot(connection, board_id)
        targets = [idea['idea_id'] for idea in ideas
                   if idea['analyzed_at'] is None and not idea['assignment_is_manual']]
        if not targets:
            connection.commit()
            return 0
        history_id = connection.execute(
            "INSERT INTO analysis_results (board_id, status, target_count) VALUES (?, 'running', ?)",
            (board_id, len(targets))).lastrowid
        connection.commit()

    request = {
        'board_id': board_id,
        'target_idea_ids': targets.copy(),
        'groups': [dict(group, name_is_manual=bool(group['name_is_manual'])) for group in groups],
        'ideas': [{**{k: v for k, v in idea.items() if k != 'analyzed_at'},
                   'assignment_is_manual': bool(idea['assignment_is_manual'])} for idea in ideas],
    }
    try:
        result = analyzer(request)
        _validate(result, board_id, groups, targets)
        with closing(connect(database_path)) as connection:
            try:
                connection.execute('BEGIN IMMEDIATE')
                if _snapshot(connection, board_id) != (groups, ideas):
                    raise StaleAnalysis('분석 중 보드가 변경되었습니다. 다시 분석해 주세요')
                for proposal in result['groups']:
                    group_id = proposal['group_id']
                    if group_id is None:
                        cursor = connection.execute('INSERT INTO groups (board_id, name) VALUES (?, ?)',
                                                    (board_id, proposal['name'].strip()))
                        group_id = cursor.lastrowid
                    for idea_id in proposal['idea_ids']:
                        connection.execute("UPDATE ideas SET group_id = ?, analyzed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND board_id = ?", (group_id, idea_id, board_id))
                for idea_id in result['unclassified_idea_ids']:
                    connection.execute("UPDATE ideas SET group_id = NULL, analyzed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND board_id = ?", (idea_id, board_id))
                connection.execute("UPDATE boards SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", (board_id,))
                cursor = connection.execute(
                    "UPDATE analysis_results SET status = 'completed', "
                    "completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') "
                    "WHERE id = ? AND status = 'running'", (history_id,))
                if cursor.rowcount != 1:
                    raise RuntimeError('분석 이력을 완료할 수 없습니다')
                connection.commit()
            except Exception:
                connection.rollback()
                raise
    except Exception as exc:
        _record_failure(database_path, history_id, exc)
        raise
    return len(targets)
