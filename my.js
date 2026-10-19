"use strict";

const STORAGE_KEY = "kun-tartibim.tasks.v1";
const WEEKDAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const CATEGORY_COLORS = { "Ish": "#8b7be7", "O‘qish": "#5793e7", "Shaxsiy": "#e6a64d", "Salomatlik": "#54b58a", "Boshqa": "#e17a92" };
const PERIODS = {
  day: { label: "Kunlik", title: "Kuningizni rejalashtiring", description: "Hafta kunini tanlab, rejalaringizni kiriting." },
  week: { label: "Haftalik", title: "Haftangizni rejalashtiring", description: "Haftaning har bir kuni uchun alohida reja tuzing." },
  month: { label: "Oylik", title: "Oy uchun maqsadlar", description: "Haftalik rejalaringizni oy davomida takrorlang." },
  year: { label: "Yillik", title: "Yilingizni rejalashtiring", description: "Oylik rejalaringizni yil davomida takrorlang." }
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  todayLabel: $("#today-label"), pageTitle: $("#page-title"), pageSubtitle: $("#page-subtitle"),
  addButton: $("#add-task-button"), periodMenu: $("#period-menu"),
  tabs: [...document.querySelectorAll(".tab-button")],
  previous: $("#previous-period"), next: $("#next-period"), todayButton: $("#today-button"), dateRange: $("#date-range"),
  scheduleView: $("#schedule-view"), tasksDescription: $("#tasks-description"), taskCount: $("#task-count"),
  taskForm: $("#task-form"), taskDialog: $("#task-dialog"), taskTitle: $("#task-title"), taskDate: $("#task-date"),
  taskCategory: $("#task-category"), taskStart: $("#task-start"), taskEnd: $("#task-end"),
  formError: $("#form-error"), closeForm: $("#close-form"), cancelForm: $("#cancel-form"),
  dialogTitle: $("#dialog-title"), dialogEyebrow: $("#dialog-eyebrow"),
  completedStat: $("#completed-stat"), progressBar: $("#progress-bar"), progressCaption: $("#progress-caption"),
  timeStat: $("#time-stat"), timeCaption: $("#time-caption"), completionStat: $("#completion-stat"),
  completionCaption: $("#completion-caption"), sidebarHours: $("#sidebar-hours"), categoryList: $("#category-list"),
  missedSection: $("#missed-section"), missedCount: $("#missed-count"), missedList: $("#missed-list")
};

const state = {
  period: "day",
  anchor: startOfDay(new Date()),
  selectedDay: startOfDay(new Date()),
  tasks: [],
  copiedDayTasks: null,
  editingTaskId: null
};

const dateFormatter = new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "short" });
const weekdayFormatter = new Intl.DateTimeFormat("uz-UZ", { weekday: "long" });
const monthFormatter = new Intl.DateTimeFormat("uz-UZ", { month: "long", year: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("uz-UZ", { weekday: "long", day: "numeric", month: "long" });

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function isPast(date) {
  return toDateKey(date) < toDateKey(new Date());
}

function uid() {
  return window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showToast(message) {
  let toast = $("#app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 5000);
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
    return true;
  } catch (error) {
    showToast("Rejalarni saqlab bo‘lmadi. Brauzer xotirasi to‘la yoki bloklangan bo‘lishi mumkin.");
    console.error("Rejalarni saqlashda xatolik:", error);
    return false;
  }
}

function loadTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const tasks = JSON.parse(saved);
    if (!Array.isArray(tasks) || tasks.some((task) =>
      !task || typeof task.id !== "string" || typeof task.title !== "string" ||
      typeof task.date !== "string" || typeof task.completed !== "boolean")) {
      throw new Error("Saqlangan reja ma’lumotlari noto‘g‘ri formatda.");
    }
    return tasks;
  } catch (error) {
    showToast("Saqlangan rejalarni o‘qib bo‘lmadi. Xatolik konsolda ko‘rsatilgan.");
    console.error("Rejalarni o‘qishda xatolik:", error);
    return [];
  }
}

function makeButton(label, className, handler, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  if (options.disabled) button.disabled = true;
  if (options.title) button.title = options.title;
  button.addEventListener("click", handler);
  return button;
}

function getTasksForDate(date) {
  const dateKey = typeof date === "string" ? date : toDateKey(date);
  return state.tasks
    .filter((task) => task.date === dateKey)
    .sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99") || a.createdAt - b.createdAt);
}

function getDuration(task) {
  if (!task.start || !task.end) return 0;
  const [startHour, startMinute] = task.start.split(":").map(Number);
  const [endHour, endMinute] = task.end.split(":").map(Number);
  return Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60);
}

function formatHours(hours) {
  if (!hours) return "0 soat";
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (!whole) return `${minutes} daqiqa`;
  return minutes ? `${whole} soat ${minutes} daq.` : `${whole} soat`;
}

function getWeekDates(anchor) {
  const monday = mondayOf(anchor);
  return WEEKDAYS.map((_, index) => addDays(monday, index));
}

function getMonthWeeks(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const weeks = [];
  let cursor = mondayOf(first);
  while (cursor <= last) {
    weeks.push(WEEKDAYS.map((_, index) => addDays(cursor, index))
      .filter((date) => date.getMonth() === anchor.getMonth()));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function getPeriodRange() {
  if (state.period === "day") return { start: state.selectedDay, end: state.selectedDay };
  if (state.period === "week") {
    const start = mondayOf(state.anchor);
    return { start, end: addDays(start, 6) };
  }
  if (state.period === "month") {
    return { start: new Date(state.anchor.getFullYear(), state.anchor.getMonth(), 1), end: new Date(state.anchor.getFullYear(), state.anchor.getMonth() + 1, 0) };
  }
  return { start: new Date(state.anchor.getFullYear(), 0, 1), end: new Date(state.anchor.getFullYear(), 11, 31) };
}

function getRangeLabel() {
  if (state.period === "day") return fullDateFormatter.format(state.selectedDay);
  if (state.period === "week") {
    const start = mondayOf(state.anchor);
    const end = addDays(start, 6);
    return `${shortDateFormatter.format(start)} – ${shortDateFormatter.format(end)} ${end.getFullYear()}`;
  }
  if (state.period === "month") return monthFormatter.format(state.anchor);
  return String(state.anchor.getFullYear());
}

function updatePageHeader() {
  const info = PERIODS[state.period];
  elements.pageTitle.textContent = info.title;
  elements.pageSubtitle.textContent = info.description;
  elements.dateRange.textContent = getRangeLabel();
  elements.tasksDescription.textContent = state.period === "day"
    ? "Hafta kunini tanlab, kunlik rejangizni boshqaring"
    : `${info.label} rejalaringiz`;
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.period === state.period;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function renderTask(task, locked = false) {
  const item = document.createElement("article");
  item.className = `task-item${task.completed ? " is-complete" : ""}${locked ? " is-locked" : ""}`;
  const checkbox = document.createElement("input");
  checkbox.className = "task-check";
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.disabled = locked;
  checkbox.setAttribute("aria-label", `${task.title} — ${task.completed ? "bajarilgan" : "bajarildi deb belgilash"}`);
  checkbox.addEventListener("change", () => {
    const previous = task.completed;
    task.completed = checkbox.checked;
    if (saveTasks()) render();
    else { task.completed = previous; checkbox.checked = previous; }
  });

  const main = document.createElement("div");
  main.className = "task-main";
  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.title;
  const meta = document.createElement("div");
  meta.className = "task-meta";
  const category = document.createElement("span");
  category.className = "task-category";
  const dot = document.createElement("span");
  dot.className = "category-dot";
  dot.style.setProperty("--dot-color", CATEGORY_COLORS[task.category] || CATEGORY_COLORS["Boshqa"]);
  const categoryLabel = document.createElement("span");
  categoryLabel.textContent = task.category || "Boshqa";
  category.append(dot, categoryLabel);
  meta.append(category);
  main.append(title, meta);

  const time = document.createElement("span");
  time.className = "task-time";
  time.textContent = task.start && task.end ? `${task.start}–${task.end}` : "Vaqt belgilanmagan";
  const actions = document.createElement("div");
  actions.className = "task-actions";
  if (!locked) {
    actions.append(
      makeButton("Tahrirlash", "task-edit", () => openTaskDialog(task.date, task)),
      makeButton("O‘chirish", "task-delete", () => deleteTask(task))
    );
  } else {
    const lock = document.createElement("span");
    lock.className = "lock-label";
    lock.textContent = "Yopilgan";
    actions.append(lock);
  }
  item.append(checkbox, main, time, actions);
  return item;
}

function renderDayTasks(container, date, options = {}) {
  const tasks = getTasksForDate(date);
  const locked = isPast(date);
  if (tasks.length) {
    tasks.forEach((task) => container.append(renderTask(task, locked)));
  } else {
    const empty = document.createElement("p");
    empty.className = "day-empty";
    empty.textContent = locked ? "Bu kunda reja yo‘q." : "Bu kunga hali reja qo‘shilmagan.";
    container.append(empty);
  }
  if (!locked && options.add !== false) {
    container.append(makeButton("+ Reja qo‘shish", "add-day-task", () => openTaskDialog(toDateKey(date))));
  }
}

function renderDayView() {
  const weekDates = getWeekDates(state.selectedDay);
  const picker = document.createElement("div");
  picker.className = "weekday-picker";
  picker.setAttribute("aria-label", "Hafta kunini tanlang");
  weekDates.forEach((date, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `weekday-choice${toDateKey(date) === toDateKey(state.selectedDay) ? " selected" : ""}${isPast(date) ? " past" : ""}`;
    button.setAttribute("aria-pressed", String(toDateKey(date) === toDateKey(state.selectedDay)));
    const name = document.createElement("span");
    name.textContent = WEEKDAYS[index];
    const number = document.createElement("strong");
    number.textContent = String(date.getDate());
    button.append(name, number);
    button.addEventListener("click", () => {
      state.selectedDay = date;
      state.anchor = date;
      render();
    });
    picker.append(button);
  });

  const card = document.createElement("section");
  card.className = `day-plan-card${isPast(state.selectedDay) ? " day-locked" : ""}`;
  const heading = document.createElement("div");
  heading.className = "day-plan-heading";
  const title = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = fullDateFormatter.format(state.selectedDay);
  const hint = document.createElement("p");
  hint.textContent = isPast(state.selectedDay) ? "O‘tgan kun — reja yopilgan" : "Vazifalaringizni shu yerda rejalashtiring";
  title.append(h3, hint);
  const count = document.createElement("span");
  count.className = "task-count";
  count.textContent = `${getTasksForDate(state.selectedDay).length} ta`;
  heading.append(title, count);
  const list = document.createElement("div");
  list.className = "day-task-list";
  renderDayTasks(list, state.selectedDay);
  card.append(heading, list);
  elements.scheduleView.append(picker, card);
}

function renderWeekView() {
  const dates = getWeekDates(state.anchor);
  const week = document.createElement("div");
  week.className = "week-schedule";
  dates.forEach((date, index) => {
    const day = document.createElement("section");
    day.className = `week-day-card${isPast(date) ? " day-locked" : ""}`;
    const heading = document.createElement("div");
    heading.className = "week-day-heading";
    const name = document.createElement("div");
    const dayName = document.createElement("h3");
    dayName.textContent = WEEKDAYS[index];
    const dayDate = document.createElement("span");
    dayDate.textContent = dateFormatter.format(date);
    name.append(dayName, dayDate);
    const count = document.createElement("span");
    count.className = "task-count";
    count.textContent = `${getTasksForDate(date).length}`;
    heading.append(name, count);
    const list = document.createElement("div");
    list.className = "week-task-list";
    renderDayTasks(list, date);

    const copyActions = document.createElement("div");
    copyActions.className = "copy-actions";
    copyActions.append(
      makeButton("Nusxalash", "copy-button", () => {
        state.copiedDayTasks = getTasksForDate(date).map(({ title, category, start, end }) => ({ title, category, start, end }));
        showToast(`${WEEKDAYS[index]} rejasidan ${state.copiedDayTasks.length} ta vazifa nusxalandi.`);
        render();
      }, { disabled: isPast(date) || getTasksForDate(date).length === 0 }),
      makeButton("Reja qo‘yish", "paste-button", () => pasteDayPlan(date), {
        disabled: isPast(date) || !state.copiedDayTasks,
        title: state.copiedDayTasks ? "Nusxalangan rejani shu kunga joylash" : "Avval boshqa kun rejasini nusxalang"
      })
    );
    day.append(heading, list, copyActions);
    week.append(day);
  });
  elements.scheduleView.append(week);
}

function renderMonthView() {
  const month = state.anchor.getMonth();
  const weeks = getMonthWeeks(state.anchor);
  const grid = document.createElement("div");
  grid.className = "month-weeks";
  weeks.forEach((dates, index) => {
    const section = document.createElement("section");
    section.className = "month-week";
    const heading = document.createElement("div");
    heading.className = "month-week-heading";
    const title = document.createElement("h3");
    title.textContent = `${index + 1}-hafta`;
    const range = document.createElement("span");
    range.textContent = `${dates[0].getDate()}–${dates[dates.length - 1].getDate()} ${monthFormatter.format(state.anchor)}`;
    heading.append(title, range);
    const days = document.createElement("div");
    days.className = "month-week-days";
    dates.forEach((date) => {
      const cell = document.createElement("div");
      cell.className = `month-day${isPast(date) ? " day-locked" : ""}`;
      const dayHeading = document.createElement("div");
      dayHeading.className = "month-day-heading";
      const dateLabel = document.createElement("strong");
      dateLabel.textContent = `${WEEKDAYS[(date.getDay() + 6) % 7]} ${date.getDate()}`;
      dayHeading.append(dateLabel);
      const list = document.createElement("div");
      list.className = "month-day-tasks";
      const tasks = getTasksForDate(date);
      tasks.forEach((task) => {
        const taskLine = document.createElement("div");
        taskLine.className = `month-task-line-wrap${task.completed ? " is-complete" : ""}`;
        const label = document.createElement("span");
        label.className = "month-task-line";
        label.textContent = task.title;
        label.title = task.title;
        taskLine.append(label);
        if (!isPast(date)) {
          taskLine.append(makeButton("✎", "month-task-edit", () => openTaskDialog(task.date, task), { title: "Rejani tahrirlash" }));
        }
        list.append(taskLine);
      });
      if (!tasks.length) {
        const empty = document.createElement("span");
        empty.className = "month-empty";
        empty.textContent = "Reja yo‘q";
        list.append(empty);
      }
      if (!isPast(date)) {
        dayHeading.append(makeButton("+", "tiny-add", () => openTaskDialog(toDateKey(date)), { title: "Shu kunga reja qo‘shish" }));
      }
      cell.append(dayHeading, list);
      days.append(cell);
    });
    const copyControls = createMonthWeekCopyControls(weeks, index, month);
    section.append(heading, days, copyControls);
    grid.append(section);
  });
  elements.scheduleView.append(grid);
}

function createMonthWeekCopyControls(weeks, currentIndex, month) {
  const controls = document.createElement("div");
  controls.className = "template-copy-controls";
  const from = createSelect(weeks.map((_, index) => ({ value: String(index), label: `${index + 1}-hafta` })), currentIndex);
  const to = createSelect(weeks.map((_, index) => ({ value: String(index), label: `${index + 1}-hafta` })), Math.min(currentIndex + 1, weeks.length - 1));
  controls.append(createCopyLabel("Haftani nusxalash:"), from, document.createTextNode(" → "), to,
    makeButton("Nusxalab qo‘yish", "copy-button", () => {
      const sourceIndex = Number(from.value);
      const targetIndex = Number(to.value);
      if (sourceIndex === targetIndex) {
        showToast("Nusxa olish uchun boshqa haftani tanlang.");
        return;
      }
      copyMonthWeek(month, weeks[sourceIndex], weeks[targetIndex]);
    }, { disabled: weeks.length < 2 }));
  return controls;
}

function renderYearView() {
  const year = state.anchor.getFullYear();
  const months = document.createElement("div");
  months.className = "year-months";
  for (let month = 0; month < 12; month += 1) {
    const section = document.createElement("section");
    section.className = `year-month${findFirstEditableDate(year, month) ? "" : " day-locked"}`;
    const heading = document.createElement("div");
    heading.className = "year-month-heading";
    const title = document.createElement("h3");
    title.textContent = new Intl.DateTimeFormat("uz-UZ", { month: "long" }).format(new Date(year, month, 1));
    const count = state.tasks.filter((task) => task.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`)).length;
    const badge = document.createElement("span");
    badge.className = "task-count";
    badge.textContent = `${count} ta reja`;
    heading.append(title, badge);
    const summary = document.createElement("div");
    summary.className = "year-month-summary";
    const monthTasks = state.tasks.filter((task) => task.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`));
    if (monthTasks.length) {
      monthTasks.slice(0, 4).forEach((task) => {
        const line = document.createElement("div");
        line.className = "year-task-line";
        const label = document.createElement("span");
        label.textContent = `${Number(task.date.slice(-2))}-kun · ${task.title}`;
        line.append(label);
        if (!isPast(fromDateKey(task.date))) {
          line.append(makeButton("✎", "month-task-edit", () => openTaskDialog(task.date, task), { title: "Rejani tahrirlash" }));
        }
        summary.append(line);
      });
      if (monthTasks.length > 4) {
        const more = document.createElement("p");
        more.className = "more-tasks";
        more.textContent = `yana ${monthTasks.length - 4} ta reja`;
        summary.append(more);
      }
    } else {
      const empty = document.createElement("p");
      empty.className = "month-empty";
      empty.textContent = "Rejalar hali kiritilmagan";
      summary.append(empty);
    }
    const firstFutureDate = findFirstEditableDate(year, month);
    const add = makeButton("+ Oylik reja qo‘shish", "add-day-task", () => openTaskDialog(toDateKey(firstFutureDate)), {
      disabled: !firstFutureDate,
      title: firstFutureDate ? "Shu oyga reja qo‘shish" : "Bu oy o‘tib ketgan"
    });
    section.append(heading, summary, add);
    months.append(section);
  }
  const controls = createYearMonthCopyControls(year);
  elements.scheduleView.append(controls, months);
}

function findFirstEditableDate(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month, day);
    if (!isPast(date)) return date;
  }
  return null;
}

function createYearMonthCopyControls(year) {
  const controls = document.createElement("div");
  controls.className = "template-copy-controls year-copy-controls";
  const options = Array.from({ length: 12 }, (_, month) => ({
    value: String(month),
    label: new Intl.DateTimeFormat("uz-UZ", { month: "long" }).format(new Date(year, month, 1))
  }));
  const from = createSelect(options, state.anchor.getMonth());
  const defaultTarget = state.anchor.getMonth() === 11 ? 0 : state.anchor.getMonth() + 1;
  const to = createSelect(options, defaultTarget);
  controls.append(createCopyLabel("Oyni nusxalash:"), from, document.createTextNode(" → "), to,
    makeButton("Nusxalab qo‘yish", "copy-button", () => {
      const source = Number(from.value);
      const target = Number(to.value);
      if (source === target) {
        showToast("Nusxa olish uchun boshqa oyni tanlang.");
        return;
      }
      copyMonth(year, source, target);
    }));
  return controls;
}

function createSelect(options, selected) {
  const select = document.createElement("select");
  select.className = "copy-select";
  options.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = Number(value) === selected;
    select.append(option);
  });
  return select;
}

function createCopyLabel(text) {
  const label = document.createElement("span");
  label.className = "copy-label";
  label.textContent = text;
  return label;
}

function pasteDayPlan(date) {
  if (!state.copiedDayTasks || isPast(date)) return;
  const before = state.tasks.length;
  const copies = state.copiedDayTasks.map((task) => ({
    ...task, id: uid(), date: toDateKey(date), completed: false, createdAt: Date.now()
  }));
  state.tasks.push(...copies);
  if (!saveTasks()) state.tasks.splice(before, copies.length);
  else {
    render();
    showToast(`${copies.length} ta vazifa ${WEEKDAYS[(date.getDay() + 6) % 7]} kuniga qo‘yildi.`);
  }
}

function copyMonthWeek(month, sourceDates, targetDates) {
  const targetDateKeys = new Set(targetDates.filter((date) => !isPast(date)).map(toDateKey));
  if (!targetDateKeys.size) {
    showToast("Tanlangan haftada reja qo‘yish mumkin bo‘lgan kelajak kun yo‘q.");
    return;
  }
  const sourceDateKeys = new Set(sourceDates.map(toDateKey));
  const sourceTasks = state.tasks.filter((task) => sourceDateKeys.has(task.date));
  const copies = sourceTasks.map((task) => {
    const sourceDate = fromDateKey(task.date);
    const weekday = sourceDate.getDay();
    const targetDate = targetDates.find((date) => date.getDay() === weekday);
    if (!targetDate || !targetDateKeys.has(toDateKey(targetDate))) return null;
    return { ...task, id: uid(), date: toDateKey(targetDate), completed: false, createdAt: Date.now() };
  }).filter(Boolean);
  if (!copies.length) {
    showToast("Tanlangan haftada nusxalanadigan reja yo‘q.");
    return;
  }
  state.tasks.push(...copies);
  if (!saveTasks()) state.tasks.splice(-copies.length, copies.length);
  else {
    render();
    showToast(`${copies.length} ta vazifa ${month + 1}-oydagi tanlangan haftaga nusxalandi.`);
  }
}

function copyMonth(year, sourceMonth, targetMonth) {
  const targetLastDay = new Date(year, targetMonth + 1, 0).getDate();
  const sourceTasks = state.tasks.filter((task) => task.date.startsWith(`${year}-${String(sourceMonth + 1).padStart(2, "0")}-`));
  const copies = sourceTasks.map((task) => {
    const sourceDay = Number(task.date.slice(-2));
    const targetDate = new Date(year, targetMonth, Math.min(sourceDay, targetLastDay));
    if (isPast(targetDate)) return null;
    return { ...task, id: uid(), date: toDateKey(targetDate), completed: false, createdAt: Date.now() };
  }).filter(Boolean);
  if (!copies.length) {
    showToast(sourceTasks.length ? "Tanlangan oyda kelajak kunlarga qo‘yiladigan reja yo‘q." : "Tanlangan oyda nusxalanadigan reja topilmadi.");
    return;
  }
  state.tasks.push(...copies);
  if (!saveTasks()) state.tasks.splice(-copies.length, copies.length);
  else {
    render();
    showToast(`${copies.length} ta vazifa tanlangan oyga nusxalandi.`);
  }
}

function renderSchedule() {
  elements.scheduleView.replaceChildren();
  const range = getPeriodRange();
  const tasks = state.tasks.filter((task) => task.date >= toDateKey(range.start) && task.date <= toDateKey(range.end));
  elements.taskCount.textContent = `${tasks.length} ta vazifa`;
  if (state.period === "day") renderDayView();
  else if (state.period === "week") renderWeekView();
  else if (state.period === "month") renderMonthView();
  else renderYearView();
}

function renderStats() {
  const { start, end } = getPeriodRange();
  const tasks = state.tasks.filter((task) => task.date >= toDateKey(start) && task.date <= toDateKey(end));
  const completed = tasks.filter((task) => task.completed).length;
  const hours = tasks.reduce((sum, task) => sum + getDuration(task), 0);
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  elements.completedStat.replaceChildren(document.createTextNode(String(completed)));
  const total = document.createElement("span");
  total.textContent = `/ ${tasks.length}`;
  elements.completedStat.append(total);
  elements.progressBar.style.width = `${percent}%`;
  elements.progressCaption.textContent = tasks.length ? `${percent}% vazifa bajarildi` : "Hali vazifalar yo‘q";
  elements.timeStat.replaceChildren(document.createTextNode(hours.toLocaleString("uz-UZ", { maximumFractionDigits: 1 })));
  const hourUnit = document.createElement("span");
  hourUnit.textContent = "soat";
  elements.timeStat.append(hourUnit);
  elements.timeCaption.textContent = hours ? `${tasks.filter((task) => getDuration(task) > 0).length} ta vazifaga vaqt ajratilgan` : "Vaqtlaringizni rejalashtiring";
  elements.completionStat.replaceChildren(document.createTextNode(String(percent)));
  const percentUnit = document.createElement("span");
  percentUnit.textContent = "%";
  elements.completionStat.append(percentUnit);
  elements.completionCaption.textContent = tasks.length
    ? completed === tasks.length ? "Ajoyib! Barcha vazifalar bajarildi" : "Har bir qadam sizni maqsadga yaqinlashtiradi"
    : "Boshlash uchun yaxshi kun";

  const categoryHours = new Map();
  tasks.forEach((task) => {
    const duration = getDuration(task);
    if (duration) categoryHours.set(task.category || "Boshqa", (categoryHours.get(task.category || "Boshqa") || 0) + duration);
  });
  elements.sidebarHours.textContent = formatHours([...categoryHours.values()].reduce((sum, value) => sum + value, 0));
  elements.categoryList.replaceChildren();
  if (!categoryHours.size) {
    const empty = document.createElement("p");
    empty.className = "category-empty";
    empty.textContent = "Vaqt taqsimotini ko‘rish uchun vazifalarga boshlanish va tugash vaqtini belgilang.";
    elements.categoryList.append(empty);
  } else {
    [...categoryHours.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, duration]) => {
      const row = document.createElement("div");
      row.className = "category-row";
      const dot = document.createElement("span");
      dot.className = "category-dot";
      dot.style.setProperty("--dot-color", CATEGORY_COLORS[name] || CATEGORY_COLORS["Boshqa"]);
      const label = document.createElement("span");
      label.textContent = name;
      const value = document.createElement("span");
      value.className = "category-hours";
      value.textContent = formatHours(duration);
      row.append(dot, label, value);
      elements.categoryList.append(row);
    });
  }
}

function renderMissedTasks() {
  const missed = state.tasks.filter((task) => !task.completed && isPast(fromDateKey(task.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
  elements.missedCount.textContent = `${missed.length} ta vazifa`;
  elements.missedList.replaceChildren();
  if (!missed.length) {
    const empty = document.createElement("p");
    empty.className = "missed-empty";
    empty.textContent = "Ajoyib! Hozircha bajarilmay qolgan vazifalar yo‘q.";
    elements.missedList.append(empty);
    return;
  }
  missed.forEach((task) => {
    const row = document.createElement("article");
    row.className = "missed-item";
    const check = document.createElement("span");
    check.className = "missed-indicator";
    check.setAttribute("aria-hidden", "true");
    const details = document.createElement("div");
    details.className = "missed-details";
    const title = document.createElement("strong");
    title.textContent = task.title;
    const date = document.createElement("span");
    date.textContent = fullDateFormatter.format(fromDateKey(task.date));
    details.append(title, date);
    const action = makeButton("Ertaga rejalash", "reschedule-button", () => rescheduleTask(task));
    row.append(check, details, action);
    elements.missedList.append(row);
  });
}

function render() {
  updatePageHeader();
  renderSchedule();
  renderStats();
  renderMissedTasks();
}

function openTaskDialog(date, task = null) {
  if (isPast(fromDateKey(date))) {
    showToast("O‘tgan kunlar yopilgan. Rejani kelajakdagi kunga qo‘shing.");
    return;
  }
  state.editingTaskId = task ? task.id : null;
  elements.taskForm.reset();
  elements.formError.hidden = true;
  elements.dialogTitle.textContent = task ? "Rejani tahrirlash" : "Keyingi qadamingiz nima?";
  elements.dialogEyebrow.textContent = task ? "REJANI TAHRIRLASH" : "YANGI REJA";
  elements.taskTitle.value = task ? task.title : "";
  elements.taskDate.value = task ? task.date : date;
  elements.taskCategory.value = task ? task.category || "Boshqa" : "Ish";
  elements.taskStart.value = task ? task.start || "" : "";
  elements.taskEnd.value = task ? task.end || "" : "";
  elements.taskDialog.showModal();
  elements.taskTitle.focus();
}

function closeTaskDialog() {
  elements.taskDialog.close();
  elements.taskForm.reset();
  elements.formError.hidden = true;
  state.editingTaskId = null;
}

function deleteTask(task) {
  if (!window.confirm(`"${task.title}" vazifasini o‘chirmoqchimisiz?`)) return;
  const previous = state.tasks;
  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  if (saveTasks()) render();
  else state.tasks = previous;
}

function rescheduleTask(task) {
  const tomorrow = toDateKey(addDays(new Date(), 1));
  openTaskDialog(tomorrow, task);
  elements.dialogTitle.textContent = "Vazifani qayta rejalash";
  elements.dialogEyebrow.textContent = "BAJARILMAGAN VAZIFA";
}

function movePeriod(direction) {
  if (state.period === "day") {
    state.selectedDay = addDays(state.selectedDay, direction);
    state.anchor = state.selectedDay;
  } else if (state.period === "week") {
    state.anchor = addDays(state.anchor, direction * 7);
  } else if (state.period === "month") {
    state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + direction, 1);
  } else {
    state.anchor = new Date(state.anchor.getFullYear() + direction, state.anchor.getMonth(), 1);
  }
  render();
}

function selectPeriod(period) {
  state.period = period;
  state.anchor = startOfDay(new Date());
  state.selectedDay = startOfDay(new Date());
  elements.periodMenu.hidden = true;
  elements.addButton.setAttribute("aria-expanded", "false");
  render();
}

elements.todayLabel.textContent = `${weekdayFormatter.format(new Date())}, ${dateFormatter.format(new Date())}`;
state.tasks = loadTasks();
render();

elements.addButton.addEventListener("click", () => {
  elements.periodMenu.hidden = !elements.periodMenu.hidden;
  elements.addButton.setAttribute("aria-expanded", String(!elements.periodMenu.hidden));
});
elements.periodMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-period]");
  if (button) selectPeriod(button.dataset.addPeriod);
});
elements.tabs.forEach((tab) => tab.addEventListener("click", () => selectPeriod(tab.dataset.period)));
elements.previous.addEventListener("click", () => movePeriod(-1));
elements.next.addEventListener("click", () => movePeriod(1));
elements.todayButton.addEventListener("click", () => {
  state.anchor = startOfDay(new Date());
  state.selectedDay = startOfDay(new Date());
  render();
});
elements.closeForm.addEventListener("click", closeTaskDialog);
elements.cancelForm.addEventListener("click", closeTaskDialog);
elements.taskDialog.addEventListener("click", (event) => {
  if (event.target === elements.taskDialog) closeTaskDialog();
});
elements.taskDialog.addEventListener("close", () => {
  state.editingTaskId = null;
});
document.addEventListener("click", (event) => {
  if (!elements.periodMenu.hidden && !event.target.closest(".add-menu-wrap")) {
    elements.periodMenu.hidden = true;
    elements.addButton.setAttribute("aria-expanded", "false");
  }
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.taskTitle.value.trim();
  const date = elements.taskDate.value;
  const start = elements.taskStart.value;
  const end = elements.taskEnd.value;
  if (!title || !date) {
    elements.formError.textContent = "Vazifa nomi va sanani kiriting.";
    elements.formError.hidden = false;
    return;
  }
  if (isPast(fromDateKey(date))) {
    elements.formError.textContent = "O‘tgan kunlar yopilgan. Kelajakdagi sanani tanlang.";
    elements.formError.hidden = false;
    return;
  }
  if (Boolean(start) !== Boolean(end)) {
    elements.formError.textContent = "Boshlanish va tugash vaqtini ikkalasini ham kiriting yoki bo‘sh qoldiring.";
    elements.formError.hidden = false;
    return;
  }
  if (start && end && end <= start) {
    elements.formError.textContent = "Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak.";
    elements.formError.hidden = false;
    return;
  }

  const previousTasks = state.tasks;
  const existing = state.editingTaskId ? state.tasks.find((task) => task.id === state.editingTaskId) : null;
  const taskData = {
    title, date, category: elements.taskCategory.value, start, end,
    completed: existing ? existing.completed : false
  };
  if (existing) Object.assign(existing, taskData);
  else state.tasks.push({ ...taskData, id: uid(), createdAt: Date.now() });
  if (!saveTasks()) {
    state.tasks = previousTasks;
    return;
  }
  state.selectedDay = fromDateKey(date);
  state.anchor = fromDateKey(date);
  closeTaskDialog();
  render();
});
