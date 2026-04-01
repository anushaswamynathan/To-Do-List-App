# Nightly To-Dos

A local macOS to-do app that:

- asks for tomorrow's tasks every night at 9:00 PM
- keeps reminding you about unfinished tasks during the day
- lets you check tasks off in a small browser UI

## How it works

- `server.py` serves the app at `http://my-to-dos.localhost:4173` and stores shared state in `data/state.json`
- `nightly_prompt.py` runs at 9:00 PM via `launchd` and prompts for tomorrow's tasks
- `send_reminders.py` runs hourly from 9:00 AM to 9:00 PM and sends notifications for incomplete tasks
- `install_launch_agents.py` deploys the runnable app into `~/Library/Application Support/NightlyTodos` and writes the `launchd` plist files into `~/Library/LaunchAgents`

## Run locally

```bash
python3 server.py
```

Then open [http://my-to-dos.localhost:4173](http://my-to-dos.localhost:4173)

## Open it from this folder

Double-click [open_nightly_todos.command](/Users/anusha/Documents/Playground/open_nightly_todos.command) from Finder, or run:

```bash
./open_nightly_todos.command
```

That launcher lives in this folder, opens the app URL, and starts the local server from this folder if it is not already running.

## Install background jobs

```bash
python3 install_launch_agents.py
launchctl unload ~/Library/LaunchAgents/com.anusha.nightlytodos.server.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.anusha.nightlytodos.nightlyprompt.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.anusha.nightlytodos.reminders.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.anusha.nightlytodos.server.plist
launchctl load ~/Library/LaunchAgents/com.anusha.nightlytodos.nightlyprompt.plist
launchctl load ~/Library/LaunchAgents/com.anusha.nightlytodos.reminders.plist
```

After that, the server will start automatically when you log in, the nightly prompt will appear every day at 9:00 PM, and reminder notifications will continue even when the browser is closed.

## Hosted version

This repo is now set up for a simple Render deployment with shared storage.

Files involved:

- [render.yaml](/Users/anusha/Documents/Playground/render.yaml) creates a public web service named `my-to-dos`
- [server.py](/Users/anusha/Documents/Playground/server.py) now reads host, port, and data directory from environment variables

Notes:

- the hosted version gives you a shareable URL for the shared to-do list
- the macOS nightly prompt and reminder scripts remain local-only on your Mac
- hosted task data is shared by anyone with the public link unless we add authentication later

To deploy on Render:

1. Push this folder to GitHub.
2. Create a new Render Blueprint from that repo.
3. Let Render apply [render.yaml](/Users/anusha/Documents/Playground/render.yaml).
4. Render will give you a public URL you can share.
