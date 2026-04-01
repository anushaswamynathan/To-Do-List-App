#!/usr/bin/env python3

import json
import subprocess
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

STATE_PATH = Path(__file__).resolve().parent / "data" / "state.json"
APP_URL = "http://my-to-dos.localhost:4173"


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


def create_task(title: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "completed": False,
        "createdAt": datetime.now().astimezone().isoformat(),
    }


def prompt_for_tasks() -> list[str]:
    tomorrow_label = (date.today() + timedelta(days=1)).strftime("%A, %B %-d")
    script = f"""
    set promptText to "Enter tomorrow's tasks for {tomorrow_label}. Put one to-do per line."
    display dialog promptText default answer "" buttons {{"Cancel", "Save"}} default button "Save"
    set rawTasks to text returned of result
    return rawTasks
    """
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def notify(message: str) -> None:
    subprocess.run(
        [
            "osascript",
            "-e",
            f'display notification "{message}" with title "Nightly To-Dos"',
        ],
        check=False,
    )


def open_app() -> None:
    subprocess.run(["open", APP_URL], check=False)


def main() -> None:
    state = load_state()
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    prompted_today = False
    if state.get("lastNightlyPromptAt"):
        prompted_today = state["lastNightlyPromptAt"][:10] == today

    if prompted_today and state.get("tasksByDate", {}).get(tomorrow):
        return

    tasks = prompt_for_tasks()
    if not tasks:
        notify("Nightly planning skipped. You can finish it later in the app.")
        open_app()
        return

    state.setdefault("tasksByDate", {})[tomorrow] = [create_task(title) for title in tasks]
    state["lastNightlyPromptAt"] = datetime.now().astimezone().isoformat()
    save_state(state)
    notify(f"Saved {len(tasks)} tasks for tomorrow.")


if __name__ == "__main__":
    main()
