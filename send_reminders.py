#!/usr/bin/env python3

import json
import subprocess
from datetime import date, datetime, time
from pathlib import Path

STATE_PATH = Path(__file__).resolve().parent / "data" / "state.json"


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {
            "tasksByDate": {},
            "lastNightlyPromptAt": None,
            "lastReminderAt": None,
            "notificationsEnabled": False,
        }
    return json.loads(STATE_PATH.read_text())


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


def notify(message: str) -> None:
    subprocess.run(
        ["osascript", "-e", f'display notification "{message}" with title "Nightly To-Dos"'],
        check=False,
    )


def main() -> None:
    now = datetime.now().astimezone()
    if now.time() < time(hour=9) or now.time() > time(hour=21):
        return

    state = load_state()
    today = date.today().isoformat()
    tasks = state.get("tasksByDate", {}).get(today, [])
    remaining = [task for task in tasks if not task.get("completed")]

    if not remaining:
        return

    last_sent = state.get("lastReminderAt")
    if last_sent:
        elapsed = now - datetime.fromisoformat(last_sent)
        if elapsed.total_seconds() < 45 * 60:
            return

    preview = ", ".join(task["title"] for task in remaining[:3])
    suffix = "..." if len(remaining) > 3 else ""
    notify(f"{len(remaining)} tasks still open: {preview}{suffix}")
    state["lastReminderAt"] = now.isoformat()
    save_state(state)


if __name__ == "__main__":
    main()
