"""화면 연결을 위한 분석 응답 예시."""

from datetime import UTC, datetime


def preview_analysis(board: dict) -> dict:
    """저장된 보드에서 분석 대상만 골라 분류 화면에 필요한 응답을 만듭니다."""
    targets = [
        idea
        for idea in board["ideas"]
        if idea["analyzed_at"] is None
        and idea["group_id"] is None
        and not idea["assignment_is_manual"]
    ]
    if not targets:
        return board

    timestamp = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    groups = list(board["groups"])
    assignments = dict.fromkeys(idea["id"] for idea in targets)

    if len(targets) >= 2:
        # 응답 전용 음수 ID로 실제 그룹 ID와 구별합니다.
        mock_group_id = min(0, min((group["id"] for group in groups), default=0)) - 1
        groups.append({
            "id": mock_group_id,
            "board_id": board["id"],
            "name": "예시 그룹",
            "name_is_manual": False,
            "created_at": timestamp,
            "updated_at": timestamp,
        })
        for idea in targets[:2]:
            assignments[idea["id"]] = mock_group_id

    ideas = [
        {
            **idea,
            "group_id": assignments[idea["id"]],
            "analyzed_at": timestamp,
            "updated_at": timestamp,
        }
        if idea["id"] in assignments
        else idea
        for idea in board["ideas"]
    ]
    return {**board, "groups": groups, "ideas": ideas, "updated_at": timestamp}
