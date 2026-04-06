const NIGHTLY_PROMPT_HOUR = 21;
const TASK_PLACEHOLDERS = [
  "Treat yourself to an ice-cream",
  "Go for a walk",
  "Hum your fav song",
];

const state = {
  tasksByDate: {},
  lastNightlyPromptAt: null,
  lastReminderAt: null,
  notificationsEnabled: false,
  selectedDateKey: getDateKey(new Date()),
  visibleMonth: startOfMonth(new Date()),
  activeView: "daily",
};

const elements = {
  activeDateCaption: document.querySelector("#active-date-caption"),
  todayLabel: document.querySelector("#today-label"),
  completedCount: document.querySelector("#completed-count"),
  remainingCount: document.querySelector("#remaining-count"),
  taskList: document.querySelector("#task-list"),
  weeklyList: document.querySelector("#weekly-list"),
  emptyState: document.querySelector("#empty-state"),
  taskTemplate: document.querySelector("#task-item-template"),
  weeklyDayTemplate: document.querySelector("#weekly-day-template"),
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
  showDaily: document.querySelector("#show-daily"),
  showWeekly: document.querySelector("#show-weekly"),
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
  elements.openNightlyModal.addEventListener("click", () => openTaskDialog());
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
  elements.showDaily.addEventListener("click", () => setActiveView("daily"));
  elements.showWeekly.addEventListener("click", () => setActiveView("weekly"));
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
  renderHeader();
  renderTaskArea();
  renderCalendar();
}

function renderHeader() {
  const selectedDateKey = state.selectedDateKey;
  const dailyTasks = getTasksForDate(selectedDateKey);
  const weekDates = getWeekDates(selectedDateKey);
  const weekTasks = weekDates.flatMap((dateKey) => getTasksForDate(dateKey));
  const tasks = state.activeView === "weekly" ? weekTasks : dailyTasks;
  const completeCount = tasks.filter((task) => task.completed).length;
  const remainingCount = tasks.length - completeCount;

  elements.activeDateCaption.textContent =
    state.activeView === "weekly" ? "Selected week" : getRelativeDateLabel(selectedDateKey);
  elements.todayLabel.textContent =
    state.activeView === "weekly"
      ? formatWeekLabel(selectedDateKey)
      : formatDateLabel(selectedDateKey);
  elements.completedCount.textContent = String(completeCount);
  elements.remainingCount.textContent = String(remainingCount);
  elements.enableNotifications.textContent = state.notificationsEnabled
    ? "Browser reminders on"
    : "Enable reminders";
  elements.showDaily.classList.toggle("is-active", state.activeView === "daily");
  elements.showWeekly.classList.toggle("is-active", state.activeView === "weekly");
}

function renderTaskArea() {
  elements.taskList.innerHTML = "";
  elements.weeklyList.innerHTML = "";
  elements.quickAddForm.classList.remove("visible");
  elements.taskList.hidden = state.activeView !== "daily";
  elements.weeklyList.hidden = state.activeView !== "weekly";

  if (state.activeView === "daily") {
    renderDailyTasks();
    return;
  }

  renderWeeklyTasks();
}

function renderDailyTasks() {
  const selectedTasks = getTasksForDate(state.selectedDateKey);
  elements.emptyState.hidden = selectedTasks.length > 0;
  if (!selectedTasks.length) {
    elements.emptyState.textContent = "Nothing planned for this day yet.";
  }

  selectedTasks.forEach((task) => {
    elements.taskList.appendChild(createTaskNode(task, state.selectedDateKey));
  });
}

function renderWeeklyTasks() {
  const weekDates = getWeekDates(state.selectedDateKey);
  const totalTasks = weekDates.reduce((count, dateKey) => count + getTasksForDate(dateKey).length, 0);
  elements.emptyState.hidden = totalTasks > 0;
  if (!totalTasks) {
    elements.emptyState.textContent = "Nothing planned for this week yet.";
  }

  weekDates.forEach((dateKey) => {
    const tasks = getTasksForDate(dateKey);
    const section = elements.weeklyDayTemplate.content.firstElementChild.cloneNode(true);
    const label = section.querySelector(".weekly-day-label");
    const title = section.querySelector(".weekly-day-title");
    const list = section.querySelector(".weekly-day-tasks");
    const empty = section.querySelector(".weekly-day-empty");
    const jump = section.querySelector(".weekly-day-jump");

    label.textContent = getRelativeDateLabel(dateKey);
    title.textContent = formatDateLabel(dateKey);
    empty.hidden = tasks.length > 0;

    tasks.forEach((task) => {
      list.appendChild(createTaskNode(task, dateKey));
    });

    jump.addEventListener("click", () => {
      state.selectedDateKey = dateKey;
      state.activeView = "daily";
      render();
    });

    elements.weeklyList.appendChild(section);
  });
}

function createTaskNode(task, dateKey) {
  const node = elements.taskTemplate.content.firstElementChild.cloneNode(true);
  const checkbox = node.querySelector('input[type="checkbox"]');
  const title = node.querySelector(".task-title");
  const meta = node.querySelector(".task-meta");
  const removeButton = node.querySelector(".delete-button");

  checkbox.checked = task.completed;
  title.textContent = task.title;
  meta.textContent =
    state.activeView === "weekly" ? formatDateLabel(dateKey) : task.completed ? "Completed" : "Still open";
  node.classList.toggle("is-complete", task.completed);

  checkbox.addEventListener("change", async () => {
    await updateTask(dateKey, task.id, { completed: checkbox.checked });
    await refreshState();
    render();
  });

  removeButton.addEventListener("click", async () => {
    await removeTask(dateKey, task.id);
    await refreshState();
    render();
  });

  return node;
}

async function handleNightlySubmit(event) {
  event.preventDefault();
  const targetDateKey = elements.nightlyDateInput.value || state.selectedDateKey;
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
  state.activeView = "daily";
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
  state.activeView = "daily";
  elements.quickAddForm.classList.toggle("visible");
  if (elements.quickAddForm.classList.contains("visible")) {
    elements.quickTaskInput.focus();
  }
}

function openTaskDialog() {
  const defaultDateKey = state.selectedDateKey || getDateKey(new Date());
  elements.nightlySubtitle.textContent = `Add the tasks you want to keep track of for ${formatDateLabel(defaultDateKey)}.`;
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
  input.placeholder = TASK_PLACEHOLDERS[elements.nightlyInputs.children.length % TASK_PLACEHOLDERS.length];
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
    openTaskDialog();
  }
}

function setActiveView(view) {
  state.activeView = view;
  render();
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

function getWeekDates(anchorDateKey) {
  const anchor = new Date(`${anchorDateKey}T12:00:00`);
  const weekStart = addDays(anchor, -anchor.getDay());
  return Array.from({ length: 7 }, (_, index) => getDateKey(addDays(weekStart, index)));
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

function formatWeekLabel(anchorDateKey) {
  const weekDates = getWeekDates(anchorDateKey);
  const start = new Date(`${weekDates[0]}T12:00:00`);
  const end = new Date(`${weekDates[6]}T12:00:00`);
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel} - ${endLabel}`;
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
