const NIGHTLY_PROMPT_HOUR = 21;

const state = {
  tasksByDate: {},
  lastNightlyPromptAt: null,
  lastReminderAt: null,
  notificationsEnabled: false,
  selectedDateKey: getDateKey(new Date()),
  visibleMonth: startOfMonth(new Date()),
};

const elements = {
  activeDateCaption: document.querySelector("#active-date-caption"),
  todayLabel: document.querySelector("#today-label"),
  completedCount: document.querySelector("#completed-count"),
  remainingCount: document.querySelector("#remaining-count"),
  taskList: document.querySelector("#task-list"),
  emptyState: document.querySelector("#empty-state"),
  taskTemplate: document.querySelector("#task-item-template"),
  nightlyDialog: document.querySelector("#nightly-dialog"),
  nightlyForm: document.querySelector("#nightly-form"),
  nightlyInputs: document.querySelector("#nightly-inputs"),
  nightlySubtitle: document.querySelector("#nightly-subtitle"),
  nightlyDateInput: document.querySelector("#nightly-date-input"),
  openNightlyModal: document.querySelector("#open-nightly-modal"),
  closeNightlyDialog: document.querySelector("#close-nightly-dialog"),
  addNightlyTask: document.querySelector("#add-nightly-task"),
  enableNotifications: document.querySelector("#enable-notifications"),
  addTaskInline: document.querySelector("#add-task-inline"),
  quickAddForm: document.querySelector("#quick-add-form"),
  quickTaskInput: document.querySelector("#quick-task-input"),
  calendarMonthLabel: document.querySelector("#calendar-month-label"),
  calendarGrid: document.querySelector("#calendar-grid"),
  previousMonth: document.querySelector("#previous-month"),
  nextMonth: document.querySelector("#next-month"),
  jumpToday: document.querySelector("#jump-today"),
};

boot();

async function boot() {
  await refreshState();
  syncSelectedDate();
  render();
  wireEvents();
  maybeOpenNightlyPrompt();
}

function wireEvents() {
  elements.openNightlyModal.addEventListener("click", () => openNightlyDialog());
  elements.closeNightlyDialog.addEventListener("click", () => {
    elements.nightlyDialog.close();
  });
  elements.addNightlyTask.addEventListener("click", () => addNightlyInput());
  elements.nightlyForm.addEventListener("submit", handleNightlySubmit);
  elements.enableNotifications.addEventListener("click", enableBrowserNotifications);
  elements.addTaskInline.addEventListener("click", toggleQuickAdd);
  elements.quickAddForm.addEventListener("submit", handleQuickAdd);
  elements.previousMonth.addEventListener("click", () => changeVisibleMonth(-1));
  elements.nextMonth.addEventListener("click", () => changeVisibleMonth(1));
  elements.jumpToday.addEventListener("click", jumpToToday);
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) {
      await refreshState();
      syncSelectedDate();
      render();
      maybeOpenNightlyPrompt();
    }
  });
}

async function refreshState() {
  const response = await fetch("/api/state");
  const payload = await response.json();
  state.tasksByDate = payload.tasksByDate || {};
  state.lastNightlyPromptAt = payload.lastNightlyPromptAt || null;
  state.lastReminderAt = payload.lastReminderAt || null;
  state.notificationsEnabled = payload.notificationsEnabled || false;
}

function render() {
  const selectedDateKey = state.selectedDateKey;
  const selectedTasks = getTasksForDate(selectedDateKey);
  const completeCount = selectedTasks.filter((task) => task.completed).length;
  const remainingCount = selectedTasks.length - completeCount;

  elements.activeDateCaption.textContent = getRelativeDateLabel(selectedDateKey);
  elements.todayLabel.textContent = formatDateLabel(selectedDateKey);
  elements.completedCount.textContent = String(completeCount);
  elements.remainingCount.textContent = String(remainingCount);
  elements.taskList.innerHTML = "";
  elements.emptyState.hidden = selectedTasks.length > 0;
  elements.enableNotifications.textContent = state.notificationsEnabled
    ? "Browser reminders on"
    : "Enable browser reminders";
  elements.quickAddForm.classList.remove("visible");

  if (!selectedTasks.length) {
    elements.emptyState.textContent =
      selectedDateKey === getDateKey(addDays(new Date(), 1))
        ? 'Nothing planned for tomorrow yet. Use "Plan tonight" to set it up.'
        : "Nothing planned for this date yet.";
  }

  selectedTasks.forEach((task) => {
    const node = elements.taskTemplate.content.firstElementChild.cloneNode(true);
    const checkbox = node.querySelector('input[type="checkbox"]');
    const title = node.querySelector(".task-title");
    const meta = node.querySelector(".task-meta");
    const removeButton = node.querySelector(".delete-button");

    checkbox.checked = task.completed;
    title.textContent = task.title;
    meta.textContent = task.completed ? "Completed" : "Still open";
    node.classList.toggle("is-complete", task.completed);

    checkbox.addEventListener("change", async () => {
      await updateTask(selectedDateKey, task.id, { completed: checkbox.checked });
      await refreshState();
      render();
    });

    removeButton.addEventListener("click", async () => {
      await removeTask(selectedDateKey, task.id);
      await refreshState();
      render();
    });

    elements.taskList.appendChild(node);
  });

  renderCalendar();
}

async function handleNightlySubmit(event) {
  event.preventDefault();
  const targetDateKey = elements.nightlyDateInput.value || getDateKey(addDays(new Date(), 1));
  const titles = Array.from(elements.nightlyInputs.querySelectorAll('input[type="text"]'))
    .map((input) => input.value.trim())
    .filter(Boolean);

  if (!titles.length) {
    addNightlyInput();
    return;
  }

  await fetch("/api/plan-nightly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: targetDateKey, titles }),
  });
  await refreshState();
  selectDate(targetDateKey);
  elements.nightlyDialog.close();
}

async function handleQuickAdd(event) {
  event.preventDefault();
  const title = elements.quickTaskInput.value.trim();
  if (!title) {
    return;
  }

  await addTask(state.selectedDateKey, title);
  elements.quickTaskInput.value = "";
  await refreshState();
  render();
}

function toggleQuickAdd() {
  elements.quickAddForm.classList.toggle("visible");
  if (elements.quickAddForm.classList.contains("visible")) {
    elements.quickTaskInput.focus();
  }
}

function openNightlyDialog() {
  const defaultDateKey = state.selectedDateKey || getDateKey(addDays(new Date(), 1));
  elements.nightlySubtitle.textContent = `Add the most important things you want to finish for ${formatDateLabel(defaultDateKey)}.`;
  elements.nightlyDateInput.value = defaultDateKey;
  elements.nightlyInputs.innerHTML = "";
  addNightlyInput();
  addNightlyInput();
  addNightlyInput();
  elements.nightlyDialog.showModal();
}

function addNightlyInput(value = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 120;
  input.placeholder = "Finish quarterly report";
  input.value = value;
  elements.nightlyInputs.appendChild(input);
  input.focus();
}

function maybeOpenNightlyPrompt() {
  const now = new Date();
  const todayKey = getDateKey(now);
  const tomorrowKey = getDateKey(addDays(now, 1));
  const promptedToday = state.lastNightlyPromptAt
    ? getDateKey(new Date(state.lastNightlyPromptAt)) === todayKey
    : false;
  const alreadyPlannedTomorrow = getTasksForDate(tomorrowKey).length > 0;

  if (now.getHours() >= NIGHTLY_PROMPT_HOUR && !promptedToday && !alreadyPlannedTomorrow) {
    state.selectedDateKey = tomorrowKey;
    openNightlyDialog();
  }
}

function selectDate(dateKey) {
  state.selectedDateKey = dateKey;
  state.visibleMonth = startOfMonth(new Date(`${dateKey}T12:00:00`));
  render();
}

function syncSelectedDate() {
  if (!state.selectedDateKey) {
    state.selectedDateKey = getDateKey(new Date());
  }
  state.visibleMonth = startOfMonth(new Date(`${state.selectedDateKey}T12:00:00`));
}

async function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    window.alert("This browser does not support notifications.");
    return;
  }

  const result = await Notification.requestPermission();
  if (result === "granted") {
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationsEnabled: true }),
    });
    await refreshState();
    render();
  }
}

function getTasksForDate(dateKey) {
  return state.tasksByDate[dateKey] || [];
}

async function addTask(dateKey, title) {
  await fetch(`/api/tasks/${encodeURIComponent(dateKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

async function updateTask(dateKey, taskId, updates) {
  await fetch(`/api/tasks/${encodeURIComponent(dateKey)}/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

async function removeTask(dateKey, taskId) {
  await fetch(`/api/tasks/${encodeURIComponent(dateKey)}/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

function renderCalendar() {
  const monthStart = state.visibleMonth;
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const todayKey = getDateKey(new Date());

  elements.calendarMonthLabel.textContent = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  elements.calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const currentDate = addDays(gridStart, index);
    const dateKey = getDateKey(currentDate);
    const tasks = getTasksForDate(dateKey);
    const completedCount = tasks.filter((task) => task.completed).length;
    const button = document.createElement("button");

    button.type = "button";
    button.className = "calendar-day";
    button.classList.toggle("is-outside-month", currentDate.getMonth() !== monthStart.getMonth());
    button.classList.toggle("is-selected", dateKey === state.selectedDateKey);
    button.classList.toggle("is-today", dateKey === todayKey);
    button.innerHTML = `
      <span class="calendar-day-number">${currentDate.getDate()}</span>
      <span class="calendar-day-meta">${tasks.length ? `${completedCount}/${tasks.length} done` : "No tasks"}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedDateKey = dateKey;
      render();
    });
    elements.calendarGrid.appendChild(button);
  }
}

function changeVisibleMonth(offset) {
  state.visibleMonth = new Date(
    state.visibleMonth.getFullYear(),
    state.visibleMonth.getMonth() + offset,
    1
  );
  renderCalendar();
}

function jumpToToday() {
  selectDate(getDateKey(new Date()));
}

function getDateKey(date) {
  return date.toLocaleDateString("en-CA");
}

function formatDateLabel(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getRelativeDateLabel(dateKey) {
  const todayKey = getDateKey(new Date());
  const tomorrowKey = getDateKey(addDays(new Date(), 1));
  const yesterdayKey = getDateKey(addDays(new Date(), -1));

  if (dateKey === todayKey) {
    return "Today";
  }
  if (dateKey === tomorrowKey) {
    return "Tomorrow";
  }
  if (dateKey === yesterdayKey) {
    return "Yesterday";
  }
  return "Selected day";
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
