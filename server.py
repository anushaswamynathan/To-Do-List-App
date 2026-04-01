#!/usr/bin/env python3

import json
import os
import tempfile
import uuid
from datetime import date, datetime, timedelta
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import unquote

BASE_DIR = Path(__file__).resolve().parent
HOST = os.getenv("NIGHTLY_TODOS_HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", os.getenv("NIGHTLY_TODOS_PORT", "4173")))


def utc_now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def today_key() -> str:
    return date.today().isoformat()


def date_key(offset_days: int) -> str:
    return (date.today() + timedelta(days=offset_days)).isoformat()


def create_empty_state() -> dict:
    return {
        "tasksByDate": {},
        "lastNightlyPromptAt": None,
        "lastReminderAt": None,
        "notificationsEnabled": False,
    }


def resolve_data_dir() -> Path:
    candidates = []
    configured = os.getenv("NIGHTLY_TODOS_DATA_DIR")
    if configured:
        candidates.append(Path(configured).expanduser())
    candidates.append(BASE_DIR / "data")
    candidates.append(Path(tempfile.gettempdir()) / "nightly-todos-data")

    for candidate in candidates:
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            probe = candidate / ".write-test"
            probe.write_text("ok")
            probe.unlink()
            return candidate
        except OSError:
            continue

    raise RuntimeError("No writable data directory available")


DATA_DIR = resolve_data_dir()
STATE_PATH = DATA_DIR / "state.json"


def load_state() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STATE_PATH.exists():
        state = create_empty_state()
        save_state(state)
        return state

    try:
        return json.loads(STATE_PATH.read_text())
    except json.JSONDecodeError:
        state = create_empty_state()
        save_state(state)
        return state


def save_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


def ensure_rollover(state: dict) -> None:
    tasks = state.setdefault("tasksByDate", {})
    today = today_key()
    if tasks.get(today):
        return

    yesterday_tasks = tasks.get(date_key(-1), [])
    rollover = []
    for task in yesterday_tasks:
        if not task.get("completed"):
            rollover.append(create_task(task.get("title", "")))

    if rollover:
        tasks[today] = rollover


def create_task(title: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "completed": False,
        "createdAt": utc_now_iso(),
    }


class AppHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/api/state":
            self.send_json(load_state_with_rollover())
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/plan-nightly":
            self.handle_plan_nightly()
            return
        if self.path == "/api/preferences":
            self.handle_preferences()
            return
        if self.path.startswith("/api/tasks/"):
            self.handle_add_task()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PATCH(self) -> None:
        if self.path.startswith("/api/tasks/"):
            self.handle_update_task()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        if self.path.startswith("/api/tasks/"):
            self.handle_delete_task()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def handle_plan_nightly(self) -> None:
        payload = self.read_json()
        target_date = payload.get("date")
        titles = [title.strip() for title in payload.get("titles", []) if title.strip()]
        state = load_state_with_rollover()
        state["tasksByDate"][target_date] = [create_task(title) for title in titles]
        state["lastNightlyPromptAt"] = utc_now_iso()
        save_state(state)
        self.send_json({"ok": True})

    def handle_preferences(self) -> None:
        payload = self.read_json()
        state = load_state_with_rollover()
        state["notificationsEnabled"] = bool(payload.get("notificationsEnabled"))
        save_state(state)
        self.send_json({"ok": True})

    def handle_add_task(self) -> None:
        date_value, _ = self.parse_task_path(require_task_id=False)
        payload = self.read_json()
        title = payload.get("title", "").strip()
        if not title:
            self.send_error(HTTPStatus.BAD_REQUEST, "Missing title")
            return

        state = load_state_with_rollover()
        tasks = state["tasksByDate"].setdefault(date_value, [])
        tasks.append(create_task(title))
        save_state(state)
        self.send_json({"ok": True})

    def handle_update_task(self) -> None:
        date_value, task_id = self.parse_task_path(require_task_id=True)
        payload = self.read_json()
        state = load_state_with_rollover()
        tasks = state["tasksByDate"].setdefault(date_value, [])

        for task in tasks:
            if task["id"] == task_id:
                if "completed" in payload:
                    task["completed"] = bool(payload["completed"])
                if "title" in payload and payload["title"].strip():
                    task["title"] = payload["title"].strip()
                save_state(state)
                self.send_json({"ok": True})
                return

        self.send_error(HTTPStatus.NOT_FOUND, "Task not found")

    def handle_delete_task(self) -> None:
        date_value, task_id = self.parse_task_path(require_task_id=True)
        state = load_state_with_rollover()
        tasks = state["tasksByDate"].setdefault(date_value, [])
        state["tasksByDate"][date_value] = [task for task in tasks if task["id"] != task_id]
        save_state(state)
        self.send_json({"ok": True})

    def parse_task_path(self, require_task_id: bool) -> Tuple[str, Optional[str]]:
        pieces = [unquote(piece) for piece in self.path.split("/") if piece]
        if len(pieces) < 3:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid task path")
            raise ValueError("invalid task path")

        date_value = pieces[2]
        task_id = pieces[3] if len(pieces) > 3 else None
        if require_task_id and not task_id:
            self.send_error(HTTPStatus.BAD_REQUEST, "Missing task id")
            raise ValueError("missing task id")
        return date_value, task_id

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def send_json(self, payload: dict, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path: str) -> str:
        candidate = super().translate_path(path)
        return str(BASE_DIR / Path(candidate).name) if path != "/" else str(BASE_DIR / "index.html")


def load_state_with_rollover() -> dict:
    state = load_state()
    ensure_rollover(state)
    save_state(state)
    return state


def run_server() -> None:
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Serving Nightly To-Dos on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
