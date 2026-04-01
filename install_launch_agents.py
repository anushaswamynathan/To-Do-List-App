#!/usr/bin/env python3

import shutil
from pathlib import Path
from typing import List, Optional

BASE_DIR = Path(__file__).resolve().parent
DEPLOY_DIR = Path.home() / "Library" / "Application Support" / "NightlyTodos"
PYTHON = "/usr/bin/python3"
LAUNCH_AGENTS_DIR = Path.home() / "Library" / "LaunchAgents"
SERVER_LABEL = "com.anusha.nightlytodos.server"
PROMPT_LABEL = "com.anusha.nightlytodos.nightlyprompt"
REMINDER_LABEL = "com.anusha.nightlytodos.reminders"
DEPLOY_FILES = [
    "index.html",
    "styles.css",
    "app.js",
    "manifest.webmanifest",
    "service-worker.js",
    "server.py",
    "nightly_prompt.py",
    "send_reminders.py",
]


def plist_contents(
    label: str,
    program_arguments: List[str],
    schedule: Optional[List[dict]] = None,
    run_at_load: bool = False,
) -> str:
    schedule_xml = ""
    if schedule:
        entries = []
        for item in schedule:
            parts = []
            for key, value in item.items():
                parts.append(f"      <key>{key}</key>\n      <integer>{value}</integer>")
            entries.append("    <dict>\n" + "\n".join(parts) + "\n    </dict>")
        schedule_xml = "  <key>StartCalendarInterval</key>\n  <array>\n" + "\n".join(entries) + "\n  </array>\n"

    run_at_load_xml = "  <key>RunAtLoad</key>\n  <true/>\n" if run_at_load else ""
    args_xml = "\n".join(f"    <string>{arg}</string>" for arg in program_arguments)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{label}</string>
  <key>ProgramArguments</key>
  <array>
{args_xml}
  </array>
  <key>WorkingDirectory</key>
  <string>{DEPLOY_DIR}</string>
{run_at_load_xml}{schedule_xml}  <key>StandardOutPath</key>
  <string>{DEPLOY_DIR / "logs" / (label + ".out.log")}</string>
  <key>StandardErrorPath</key>
  <string>{DEPLOY_DIR / "logs" / (label + ".err.log")}</string>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
"""


def main() -> None:
    DEPLOY_DIR.mkdir(parents=True, exist_ok=True)
    (DEPLOY_DIR / "logs").mkdir(exist_ok=True)
    (DEPLOY_DIR / "data").mkdir(exist_ok=True)
    LAUNCH_AGENTS_DIR.mkdir(parents=True, exist_ok=True)

    for name in DEPLOY_FILES:
        shutil.copy2(BASE_DIR / name, DEPLOY_DIR / name)

    reminder_schedule = [{"Hour": hour, "Minute": 0} for hour in range(9, 22)]

    plists = {
        SERVER_LABEL: plist_contents(
            SERVER_LABEL,
            [PYTHON, str(DEPLOY_DIR / "server.py")],
            run_at_load=True,
        ),
        PROMPT_LABEL: plist_contents(
            PROMPT_LABEL,
            [PYTHON, str(DEPLOY_DIR / "nightly_prompt.py")],
            schedule=[{"Hour": 21, "Minute": 0}],
        ),
        REMINDER_LABEL: plist_contents(
            REMINDER_LABEL,
            [PYTHON, str(DEPLOY_DIR / "send_reminders.py")],
            schedule=reminder_schedule,
        ),
    }

    for label, contents in plists.items():
        (LAUNCH_AGENTS_DIR / f"{label}.plist").write_text(contents)


if __name__ == "__main__":
    main()
