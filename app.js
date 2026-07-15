var LISTS = [
  { id: "imperatives", title: "Imperatives" },
  { id: "importants", title: "Importants" },
  { id: "followups", title: "Seguiments" },
  { id: "contacts", title: "Contactes" }
];

var FIXED_DAILY_LIMITS = {
  imperatives: 3,
  importants: 3
};

var HOURS = [];
for (var h = 7; h <= 19; h += 1) {
  HOURS.push(pad2(h) + ":00");
}

var LLEIDA_HOLIDAYS = {
  "2026-01-01": "Any nou",
  "2026-01-06": "Reis",
  "2026-04-03": "Divendres Sant",
  "2026-04-06": "Dilluns de Pasqua",
  "2026-05-01": "Festa del Treball",
  "2026-05-11": "Sant Anastasi",
  "2026-06-24": "Sant Joan",
  "2026-08-15": "L'Assumpcio",
  "2026-09-11": "Diada Nacional",
  "2026-09-29": "Sant Miquel",
  "2026-10-12": "Dia de la Hispanitat",
  "2026-12-08": "La Immaculada",
  "2026-12-25": "Nadal",
  "2026-12-26": "Sant Esteve"
};

var STORE_KEY = "agenda-ipad-v2";
var LEGACY_STORE_KEY = "agenda-ipad-v1";
var HANDWRITING_DB = "agenda-ipad-data";
var HANDWRITING_STORE = "handwriting";
var state = loadState();
var activeDate = toISODate(new Date());
var activeView = "day";
var handwritingDB = null;
var isDrawing = false;
var lastPoint = null;
var saveHandwritingTimer = null;
var handwritingRenderToken = 0;

var els = {};

document.addEventListener("DOMContentLoaded", function () {
  cacheElements();
  bindEvents();
  registerServiceWorker();
  openHandwritingDatabase().then(function (database) {
    handwritingDB = database;
    return migrateLegacyHandwriting();
  }).then(function () {
    pruneEmptyDays();
    if (saveState()) {
      removeLegacyState();
    }
    setSaveStatus("Dades preparades", false);
    render();
  }, function () {
    setSaveStatus("Manuscrit no disponible", true);
    render();
  });
});

function cacheElements() {
  els.dateInput = document.getElementById("agendaDate");
  els.dailyPlanner = document.getElementById("dailyPlanner");
  els.weeklyPlanner = document.getElementById("weeklyPlanner");
  els.monthlyPlanner = document.getElementById("monthlyPlanner");
  els.taskTemplate = document.getElementById("taskTemplate");
  els.handwritingCanvas = document.getElementById("handwritingCanvas");
  els.handwritingContext = els.handwritingCanvas ? els.handwritingCanvas.getContext("2d") : null;
  els.saveStatus = document.getElementById("saveStatus");
  els.importFile = document.getElementById("importFile");
  els.installOverlay = document.getElementById("installOverlay");
}

function bindEvents() {
  byId("prevDay").addEventListener("click", function () {
    shiftDay(-1);
  });

  byId("nextDay").addEventListener("click", function () {
    shiftDay(1);
  });

  els.dateInput.addEventListener("change", function () {
    activeDate = els.dateInput.value || toISODate(new Date());
    render();
  });

  byId("dayView").addEventListener("click", function () {
    changeView("day");
  });

  byId("weekView").addEventListener("click", function () {
    changeView("week");
  });

  byId("monthView").addEventListener("click", function () {
    changeView("month");
  });

  var addButtons = document.querySelectorAll("[data-add]");
  for (var i = 0; i < addButtons.length; i += 1) {
    addButtons[i].addEventListener("click", handleAddTask);
  }

  byId("communications").addEventListener("input", function (event) {
    getDay(activeDate).communications = event.target.value;
    saveAndRefreshSummary();
  });

  byId("achievement").addEventListener("input", function (event) {
    getDay(activeDate).achievement = event.target.value;
    saveAndRefreshSummary();
  });

  byId("rating").addEventListener("input", function (event) {
    getDay(activeDate).rating = Number(event.target.value);
    saveAndRefreshSummary();
  });

  byId("clearHandwriting").addEventListener("click", function () {
    clearHandwritingCanvas();
    deleteHandwriting(activeDate).then(function () {
      setSaveStatus("Nota manuscrita eliminada", false);
    }, function () {
      setSaveStatus("No s'ha pogut eliminar", true);
    });
  });

  byId("exportData").addEventListener("click", exportBackup);
  byId("importData").addEventListener("click", function () {
    els.importFile.click();
  });
  els.importFile.addEventListener("change", importBackup);
  byId("installApp").addEventListener("click", showInstallGuide);
  byId("closeInstall").addEventListener("click", hideInstallGuide);
  els.installOverlay.addEventListener("click", function (event) {
    if (event.target === els.installOverlay) {
      hideInstallGuide();
    }
  });

  if (els.handwritingCanvas) {
    els.handwritingCanvas.addEventListener("pointerdown", startHandwriting);
    els.handwritingCanvas.addEventListener("pointermove", drawHandwriting);
    els.handwritingCanvas.addEventListener("pointerup", finishHandwriting);
    els.handwritingCanvas.addEventListener("pointercancel", finishHandwriting);
  }

  window.addEventListener("resize", function () {
    window.clearTimeout(saveHandwritingTimer);
    if (activeView === "day") {
      saveHandwritingTimer = window.setTimeout(renderHandwriting, 150);
    }
  });
}

function handleAddTask(event) {
  var listId = event.currentTarget.getAttribute("data-add");
  var day = getDay(activeDate);
  var limit = FIXED_DAILY_LIMITS[listId];

  if (limit && day[listId].length >= limit) {
    focusFirstEmpty(listId);
    return;
  }

  day[listId].push({ id: makeId(), text: "", done: false });
  saveState();
  renderLists();
  focusLastTask(listId);
}

function render() {
  els.dateInput.value = activeDate;
  repairDay(getDay(activeDate));
  renderHeader();
  setView(activeView);
  renderActiveView();
}

function renderActiveView() {
  if (activeView === "day") {
    renderLists();
    renderSchedule();
    renderNotes();
    renderHandwriting();
  } else if (activeView === "week") {
    renderWeek();
  } else {
    renderMonth();
  }
}

function renderHeader() {
  var date = parseISO(activeDate);
  byId("todayName").textContent = formatDate(date, { weekday: "long" });
  byId("todayDate").textContent = formatDate(date, { day: "2-digit", month: "long", year: "numeric" });
  refreshSummary();
}

function renderLists() {
  var day = getDay(activeDate);

  for (var i = 0; i < LISTS.length; i += 1) {
    var id = LISTS[i].id;
    var target = byId(id + "List");
    var limit = FIXED_DAILY_LIMITS[id];
    target.innerHTML = "";

    if (limit) {
      day[id] = day[id].slice(0, limit);
      while (day[id].length < limit) {
        day[id].push({ id: makeId(), text: "", done: false });
      }
    } else if (day[id].length === 0) {
      day[id].push({ id: makeId(), text: "", done: false });
    }

    for (var taskIndex = 0; taskIndex < day[id].length; taskIndex += 1) {
      target.appendChild(createTaskNode(id, day[id][taskIndex], limit));
    }
  }

  saveState();
}

function createTaskNode(listId, task, limit) {
  var node = els.taskTemplate.content.firstElementChild.cloneNode(true);
  var checkbox = node.querySelector("input");
  var textarea = node.querySelector("textarea");
  var deleteButton = node.querySelector(".delete-button");

  checkbox.checked = !!task.done;
  textarea.value = task.text || "";
  textarea.placeholder = placeholderFor(listId);

  checkbox.addEventListener("change", function () {
    task.done = checkbox.checked;
    saveAndRefreshSummary();
  });

  textarea.addEventListener("input", function () {
    task.text = textarea.value;
    saveAndRefreshSummary();
  });

  deleteButton.addEventListener("click", function () {
    var day = getDay(activeDate);

    if (limit) {
      task.text = "";
      task.done = false;
    } else {
      day[listId] = day[listId].filter(function (item) {
        return item.id !== task.id;
      });
    }

    saveState();
    renderLists();
    refreshSummary();
  });

  return node;
}

function renderSchedule() {
  var day = getDay(activeDate);
  var target = byId("scheduleList");
  target.innerHTML = "";

  for (var i = 0; i < HOURS.length; i += 1) {
    var hour = HOURS[i];
    var row = document.createElement("label");
    var textarea = document.createElement("textarea");
    var label = document.createElement("span");

    row.className = "schedule-slot";
    label.className = "hour";
    label.textContent = hour;
    textarea.className = "scribble-field";
    textarea.setAttribute("inputmode", "text");
    textarea.setAttribute("autocapitalize", "sentences");
    textarea.setAttribute("spellcheck", "true");
    textarea.setAttribute("rows", "2");
    textarea.setAttribute("placeholder", "Bloc de treball");
    textarea.value = day.schedule[hour] || "";

    textarea.addEventListener("input", createScheduleHandler(hour, textarea));
    row.appendChild(label);
    row.appendChild(textarea);
    target.appendChild(row);
  }
}

function createScheduleHandler(hour, textarea) {
  return function () {
    getDay(activeDate).schedule[hour] = textarea.value;
    saveState();
  };
}

function renderNotes() {
  var day = getDay(activeDate);
  byId("communications").value = day.communications || "";
  byId("achievement").value = day.achievement || "";
  byId("rating").value = day.rating || 0;
  byId("ratingValue").textContent = day.rating || 0;
}

function renderHandwriting() {
  if (!els.handwritingCanvas || !els.handwritingContext) {
    return;
  }

  var requestedDate = activeDate;
  var token = handwritingRenderToken + 1;
  handwritingRenderToken = token;
  resizeHandwritingCanvas();
  clearHandwritingCanvas();

  getHandwriting(requestedDate).then(function (savedImage) {
    if (!savedImage || token !== handwritingRenderToken || requestedDate !== activeDate) {
      return;
    }

    var image = new Image();
    image.onload = function () {
      if (token !== handwritingRenderToken || requestedDate !== activeDate) {
        return;
      }
      var rect = els.handwritingCanvas.getBoundingClientRect();
      els.handwritingContext.drawImage(image, 0, 0, rect.width, rect.height);
    };
    image.src = savedImage;
  }, function () {
    setSaveStatus("No s'ha pogut carregar el manuscrit", true);
  });
}

function resizeHandwritingCanvas() {
  var rect = els.handwritingCanvas.getBoundingClientRect();
  var ratio = window.devicePixelRatio || 1;
  var nextWidth = Math.max(320, Math.round(rect.width * ratio));
  var nextHeight = Math.max(210, Math.round(rect.height * ratio));

  if (els.handwritingCanvas.width !== nextWidth || els.handwritingCanvas.height !== nextHeight) {
    els.handwritingCanvas.width = nextWidth;
    els.handwritingCanvas.height = nextHeight;
  }

  els.handwritingContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  configureHandwritingPen();
}

function configureHandwritingPen() {
  els.handwritingContext.lineCap = "round";
  els.handwritingContext.lineJoin = "round";
  els.handwritingContext.strokeStyle = "#1f2937";
  els.handwritingContext.lineWidth = 3;
}

function clearHandwritingCanvas() {
  if (!els.handwritingContext) {
    return;
  }

  var rect = els.handwritingCanvas.getBoundingClientRect();
  els.handwritingContext.clearRect(0, 0, rect.width, rect.height);
  els.handwritingContext.fillStyle = "#fffdf8";
  els.handwritingContext.fillRect(0, 0, rect.width, rect.height);
  drawHandwritingLines(rect);
  configureHandwritingPen();
}

function drawHandwritingLines(rect) {
  els.handwritingContext.save();
  els.handwritingContext.strokeStyle = "rgba(148, 163, 184, 0.28)";
  els.handwritingContext.lineWidth = 1;

  for (var y = 42; y < rect.height; y += 42) {
    els.handwritingContext.beginPath();
    els.handwritingContext.moveTo(16, y);
    els.handwritingContext.lineTo(rect.width - 16, y);
    els.handwritingContext.stroke();
  }

  els.handwritingContext.restore();
}

function startHandwriting(event) {
  event.preventDefault();
  isDrawing = true;
  lastPoint = canvasPoint(event);
  if (els.handwritingCanvas.setPointerCapture) {
    els.handwritingCanvas.setPointerCapture(event.pointerId);
  }
}

function drawHandwriting(event) {
  if (!isDrawing || !lastPoint) {
    return;
  }

  event.preventDefault();
  var point = canvasPoint(event);
  var pressure = event.pressure || 0.45;
  els.handwritingContext.lineWidth = Math.max(1.8, Math.min(5.2, pressure * 5.8));
  els.handwritingContext.beginPath();
  els.handwritingContext.moveTo(lastPoint.x, lastPoint.y);
  els.handwritingContext.lineTo(point.x, point.y);
  els.handwritingContext.stroke();
  lastPoint = point;
}

function finishHandwriting(event) {
  if (!isDrawing) {
    return;
  }

  isDrawing = false;
  lastPoint = null;

  if (els.handwritingCanvas.hasPointerCapture && els.handwritingCanvas.hasPointerCapture(event.pointerId)) {
    els.handwritingCanvas.releasePointerCapture(event.pointerId);
  }

  try {
    var drawingDate = activeDate;
    var imageData = els.handwritingCanvas.toDataURL("image/jpeg", 0.72);
    putHandwriting(drawingDate, imageData).then(function () {
      setSaveStatus("Manuscrit desat", false);
    }, function () {
      setSaveStatus("No s'ha pogut desar el manuscrit", true);
    });
  } catch (error) {
    setSaveStatus("No s'ha pogut desar el manuscrit", true);
  }
}

function canvasPoint(event) {
  var rect = els.handwritingCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function renderWeek() {
  var target = byId("weekGrid");
  target.innerHTML = "";

  var dates = weekDates(activeDate);
  byId("weekTitle").textContent = "Setmana del " +
    formatDate(parseISO(dates[0]), { day: "numeric", month: "short" }) +
    " al " + formatDate(parseISO(dates[6]), { day: "numeric", month: "short" });
  for (var i = 0; i < dates.length; i += 1) {
    var isoDate = dates[i];
    var day = getDayForDisplay(isoDate);
    var date = parseISO(isoDate);
    var calendarInfo = getCalendarDayInfo(isoDate);
    var card = document.createElement("article");
    card.className = "day-card";
    applyCalendarDayClasses(card, calendarInfo);
    card.innerHTML =
      '<header><div class="day-heading-copy"><h2>' +
      escapeHTML(formatDate(date, { weekday: "long" })) +
      "</h2><p>" +
      escapeHTML(formatDate(date, { day: "2-digit", month: "short" })) +
      "</p></div>" + renderCalendarLabel(calendarInfo) + "</header>" +
      weekSection("Imperatives", day.imperatives) +
      weekSection("Importants", day.importants) +
      weekSection("Seguiments", day.followups) +
      weekSection("Contactes", day.contacts) +
      '<section class="week-section"><strong>Logro</strong><ul><li>' +
      escapeHTML(day.achievement || "Sense definir") +
      "</li></ul></section>";

    card.addEventListener("click", createDateViewHandler(isoDate));
    target.appendChild(card);
  }
}

function renderMonth() {
  var target = byId("monthGrid");
  var monthTitle = byId("monthTitle");
  var current = parseISO(activeDate);
  var year = current.getFullYear();
  var month = current.getMonth();
  var firstGridDay = new Date(year, month, 1);
  var mondayOffset = (firstGridDay.getDay() + 6) % 7;
  firstGridDay.setDate(firstGridDay.getDate() - mondayOffset);

  monthTitle.textContent = formatDate(current, { month: "long", year: "numeric" });
  target.innerHTML = "";

  for (var i = 0; i < 42; i += 1) {
    var date = new Date(firstGridDay);
    date.setDate(firstGridDay.getDate() + i);
    var isoDate = toISODate(date);
    var day = getDayForDisplay(isoDate);
    var calendarInfo = getCalendarDayInfo(isoDate);
    var openTasks = countOpenTasks(day);
    var topTasks = getTopTasks(day, 3);
    var cell = document.createElement("button");

    cell.className = "month-day";
    applyCalendarDayClasses(cell, calendarInfo);
    cell.type = "button";
    if (date.getMonth() !== month) {
      cell.className += " outside-month";
    }
    if (isoDate === activeDate) {
      cell.className += " selected-day";
    }

    cell.innerHTML =
      '<span class="month-day-number">' +
      date.getDate() +
      "</span>" + renderHolidayName(calendarInfo) + "<strong>" +
      openTasks +
      " pendents</strong><ul>" +
      renderMonthTasks(topTasks) +
      "</ul><small>" +
      escapeHTML(day.achievement || "Sense logro") +
      "</small>";

    cell.addEventListener("click", createDateViewHandler(isoDate));
    target.appendChild(cell);
  }
}

function getCalendarDayInfo(isoDate) {
  var date = parseISO(isoDate);
  return {
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
    holidayName: LLEIDA_HOLIDAYS[isoDate] || ""
  };
}

function applyCalendarDayClasses(element, calendarInfo) {
  if (calendarInfo.isWeekend) {
    element.className += " weekend-day";
  }
  if (calendarInfo.holidayName) {
    element.className += " holiday-day";
  }
}

function renderCalendarLabel(calendarInfo) {
  if (calendarInfo.holidayName) {
    return '<span class="calendar-day-label holiday-label">' + escapeHTML(calendarInfo.holidayName) + "</span>";
  }
  if (calendarInfo.isWeekend) {
    return '<span class="calendar-day-label weekend-label">Cap de setmana</span>';
  }
  return "";
}

function renderHolidayName(calendarInfo) {
  if (!calendarInfo.holidayName) {
    return "";
  }
  return '<em class="holiday-name">' + escapeHTML(calendarInfo.holidayName) + "</em>";
}

function renderMonthTasks(tasks) {
  if (!tasks.length) {
    return "<li>Sense entrades</li>";
  }

  var html = "";
  for (var i = 0; i < tasks.length; i += 1) {
    html += "<li>" + escapeHTML(tasks[i].text) + "</li>";
  }
  return html;
}

function weekSection(title, tasks) {
  var visibleTasks = [];
  for (var i = 0; i < tasks.length; i += 1) {
    if (tasks[i].text && tasks[i].text.trim()) {
      visibleTasks.push(tasks[i]);
    }
    if (visibleTasks.length === 4) {
      break;
    }
  }

  var items = "";
  if (!visibleTasks.length) {
    items = "<li>Sense entrades</li>";
  } else {
    for (var t = 0; t < visibleTasks.length; t += 1) {
      items += "<li>" + (visibleTasks[t].done ? "Fet: " : "") + escapeHTML(visibleTasks[t].text) + "</li>";
    }
  }

  return '<section class="week-section"><strong>' + escapeHTML(title) + "</strong><ul>" + items + "</ul></section>";
}

function createDateViewHandler(isoDate) {
  return function () {
    activeDate = isoDate;
    setView("day");
    render();
  };
}

function setView(view) {
  activeView = view;
  toggleHidden(els.dailyPlanner, view !== "day");
  toggleHidden(els.weeklyPlanner, view !== "week");
  toggleHidden(els.monthlyPlanner, view !== "month");
  setTab("dayView", view === "day");
  setTab("weekView", view === "week");
  setTab("monthView", view === "month");
}

function changeView(view) {
  setView(view);
  renderActiveView();
}

function setTab(id, active) {
  var tab = byId(id);
  if (active) {
    tab.classList.add("active");
  } else {
    tab.classList.remove("active");
  }
  tab.setAttribute("aria-selected", active ? "true" : "false");
}

function toggleHidden(element, hidden) {
  if (hidden) {
    element.classList.add("hidden");
  } else {
    element.classList.remove("hidden");
  }
}

function refreshSummary() {
  var day = getDay(activeDate);
  byId("openTasks").textContent = countOpenTasks(day);
  byId("ratingSummary").textContent = (day.rating || 0) + "/5";
  byId("ratingValue").textContent = day.rating || 0;
  byId("achievementSummary").textContent = day.achievement && day.achievement.trim() ? day.achievement.trim() : "Sense definir";
}

function saveAndRefreshSummary() {
  saveState();
  refreshSummary();
}

function shiftDay(amount) {
  var date = parseISO(activeDate);
  date.setDate(date.getDate() + amount);
  activeDate = toISODate(date);
  render();
}

function getDay(isoDate) {
  if (!state.days) {
    state.days = {};
  }
  if (!state.days[isoDate]) {
    state.days[isoDate] = createBlankDay();
  }
  repairDay(state.days[isoDate]);
  return state.days[isoDate];
}

function getDayForDisplay(isoDate) {
  var day = state.days && state.days[isoDate] ? state.days[isoDate] : createBlankDay();
  repairDay(day);
  return day;
}

function pruneEmptyDays() {
  var dates = Object.keys(state.days || {});
  for (var i = 0; i < dates.length; i += 1) {
    if (isDayEmpty(state.days[dates[i]])) {
      delete state.days[dates[i]];
    }
  }
}

function isDayEmpty(day) {
  if (!day) {
    return true;
  }
  for (var i = 0; i < LISTS.length; i += 1) {
    var tasks = Array.isArray(day[LISTS[i].id]) ? day[LISTS[i].id] : [];
    for (var taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
      if (tasks[taskIndex].text && tasks[taskIndex].text.trim()) {
        return false;
      }
    }
  }
  var schedule = day.schedule || {};
  var hours = Object.keys(schedule);
  for (var hourIndex = 0; hourIndex < hours.length; hourIndex += 1) {
    if (schedule[hours[hourIndex]] && schedule[hours[hourIndex]].trim()) {
      return false;
    }
  }
  return !(day.communications && day.communications.trim()) &&
    !(day.achievement && day.achievement.trim()) &&
    !day.rating;
}

function repairDay(day) {
  for (var i = 0; i < LISTS.length; i += 1) {
    var id = LISTS[i].id;
    if (!Array.isArray(day[id])) {
      day[id] = [];
    }
  }

  if (!day.schedule) {
    day.schedule = {};
  }
  for (var hIndex = 0; hIndex < HOURS.length; hIndex += 1) {
    if (typeof day.schedule[HOURS[hIndex]] !== "string") {
      day.schedule[HOURS[hIndex]] = "";
    }
  }

  if (typeof day.communications !== "string") {
    day.communications = "";
  }
  if (typeof day.achievement !== "string") {
    day.achievement = "";
  }
  if (typeof day.rating !== "number") {
    day.rating = 0;
  }
}

function createBlankDay() {
  return {
    imperatives: [],
    importants: [],
    followups: [],
    contacts: [],
    schedule: {},
    communications: "",
    rating: 0,
    achievement: ""
  };
}

function countOpenTasks(day) {
  var count = 0;
  for (var i = 0; i < LISTS.length; i += 1) {
    var tasks = day[LISTS[i].id] || [];
    for (var t = 0; t < tasks.length; t += 1) {
      if (tasks[t].text && tasks[t].text.trim() && !tasks[t].done) {
        count += 1;
      }
    }
  }
  return count;
}

function getTopTasks(day, limit) {
  var tasks = [];
  for (var i = 0; i < LISTS.length; i += 1) {
    var list = day[LISTS[i].id] || [];
    for (var t = 0; t < list.length; t += 1) {
      if (list[t].text && list[t].text.trim()) {
        tasks.push(list[t]);
      }
      if (tasks.length === limit) {
        return tasks;
      }
    }
  }
  return tasks;
}

function placeholderFor(id) {
  var placeholders = {
    imperatives: "Accio obligatoria",
    importants: "Prioritat rellevant",
    followups: "Persona, tema o estat",
    contacts: "Nom, telefon o email"
  };
  return placeholders[id] || "";
}

function weekDates(isoDate) {
  var date = parseISO(isoDate);
  var day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);

  var dates = [];
  for (var i = 0; i < 7; i += 1) {
    var item = new Date(date);
    item.setDate(date.getDate() + i);
    dates.push(toISODate(item));
  }
  return dates;
}

function parseISO(isoDate) {
  var parts = isoDate.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function toISODate(date) {
  var year = date.getFullYear();
  var month = pad2(date.getMonth() + 1);
  var day = pad2(date.getDate());
  return year + "-" + month + "-" + day;
}

function pad2(value) {
  return value < 10 ? "0" + value : String(value);
}

function formatDate(date, options) {
  try {
    return new Intl.DateTimeFormat("ca-ES", options).format(date);
  } catch (error) {
    return date.toLocaleDateString();
  }
}

function loadState() {
  var parsed = readStoredState(STORE_KEY) || readStoredState(LEGACY_STORE_KEY);
  if (!parsed || typeof parsed !== "object") {
    parsed = { days: {} };
  }
  if (!parsed.days) {
    parsed.days = {};
  }
  return parsed;
}

function readStoredState(key) {
  try {
    var stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    setSaveStatus("Desat", false);
    return true;
  } catch (error) {
    setSaveStatus("Error de guardat", true);
    return false;
  }
}

function removeLegacyState() {
  try {
    localStorage.removeItem(LEGACY_STORE_KEY);
  } catch (error) {
    // The current data remains available even if the old key cannot be removed.
  }
}

function setSaveStatus(message, isError) {
  if (!els.saveStatus) {
    return;
  }
  els.saveStatus.textContent = message;
  if (isError) {
    els.saveStatus.classList.add("error");
  } else {
    els.saveStatus.classList.remove("error");
  }
}

function openHandwritingDatabase() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB no disponible"));
      return;
    }

    var request = window.indexedDB.open(HANDWRITING_DB, 1);
    request.onupgradeneeded = function () {
      var database = request.result;
      if (!database.objectStoreNames.contains(HANDWRITING_STORE)) {
        database.createObjectStore(HANDWRITING_STORE, { keyPath: "date" });
      }
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error || new Error("No s'ha pogut obrir IndexedDB"));
    };
  });
}

function migrateLegacyHandwriting() {
  if (!handwritingDB) {
    return Promise.resolve();
  }

  var dates = Object.keys(state.days || {});
  var legacyDrawings = [];
  for (var i = 0; i < dates.length; i += 1) {
    var day = state.days[dates[i]];
    if (day && typeof day.handwriting === "string" && day.handwriting) {
      legacyDrawings.push({ date: dates[i], data: day.handwriting, updatedAt: Date.now() });
    }
  }

  if (!legacyDrawings.length) {
    return Promise.resolve();
  }

  return new Promise(function (resolve, reject) {
    var transaction = handwritingDB.transaction(HANDWRITING_STORE, "readwrite");
    var store = transaction.objectStore(HANDWRITING_STORE);
    for (var drawingIndex = 0; drawingIndex < legacyDrawings.length; drawingIndex += 1) {
      store.put(legacyDrawings[drawingIndex]);
    }
    transaction.oncomplete = function () {
      for (var dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
        if (state.days[dates[dateIndex]]) {
          delete state.days[dates[dateIndex]].handwriting;
        }
      }
      try {
        localStorage.setItem(LEGACY_STORE_KEY, JSON.stringify(state));
      } catch (error) {
        setSaveStatus("Migracio pendent", true);
      }
      saveState();
      resolve();
    };
    transaction.onerror = function () {
      reject(transaction.error || new Error("Error de migracio"));
    };
  });
}

function putHandwriting(date, data) {
  return new Promise(function (resolve, reject) {
    if (!handwritingDB) {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    var transaction = handwritingDB.transaction(HANDWRITING_STORE, "readwrite");
    transaction.objectStore(HANDWRITING_STORE).put({ date: date, data: data, updatedAt: Date.now() });
    transaction.oncomplete = function () {
      resolve();
    };
    transaction.onerror = function () {
      reject(transaction.error || new Error("Error de guardat"));
    };
  });
}

function getHandwriting(date) {
  return new Promise(function (resolve, reject) {
    if (!handwritingDB) {
      var legacyDay = state.days && state.days[date];
      resolve(legacyDay && legacyDay.handwriting ? legacyDay.handwriting : "");
      return;
    }
    var transaction = handwritingDB.transaction(HANDWRITING_STORE, "readonly");
    var request = transaction.objectStore(HANDWRITING_STORE).get(date);
    request.onsuccess = function () {
      resolve(request.result ? request.result.data : "");
    };
    request.onerror = function () {
      reject(request.error || new Error("Error de lectura"));
    };
  });
}

function deleteHandwriting(date) {
  return new Promise(function (resolve, reject) {
    if (!handwritingDB) {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    var transaction = handwritingDB.transaction(HANDWRITING_STORE, "readwrite");
    transaction.objectStore(HANDWRITING_STORE)["delete"](date);
    transaction.oncomplete = function () {
      resolve();
    };
    transaction.onerror = function () {
      reject(transaction.error || new Error("Error d'eliminacio"));
    };
  });
}

function getAllHandwriting() {
  return new Promise(function (resolve, reject) {
    var drawings = {};
    if (!handwritingDB) {
      resolve(drawings);
      return;
    }
    var transaction = handwritingDB.transaction(HANDWRITING_STORE, "readonly");
    var request = transaction.objectStore(HANDWRITING_STORE).openCursor();
    request.onsuccess = function () {
      var cursor = request.result;
      if (cursor) {
        drawings[cursor.value.date] = cursor.value.data;
        cursor["continue"]();
      } else {
        resolve(drawings);
      }
    };
    request.onerror = function () {
      reject(request.error || new Error("Error de lectura"));
    };
  });
}

function replaceAllHandwriting(drawings) {
  return new Promise(function (resolve, reject) {
    if (!handwritingDB) {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    var transaction = handwritingDB.transaction(HANDWRITING_STORE, "readwrite");
    var store = transaction.objectStore(HANDWRITING_STORE);
    store.clear();
    var dates = Object.keys(drawings || {});
    for (var i = 0; i < dates.length; i += 1) {
      if (typeof drawings[dates[i]] === "string" && drawings[dates[i]]) {
        store.put({ date: dates[i], data: drawings[dates[i]], updatedAt: Date.now() });
      }
    }
    transaction.oncomplete = function () {
      resolve();
    };
    transaction.onerror = function () {
      reject(transaction.error || new Error("Error de restauracio"));
    };
  });
}

function exportBackup() {
  setSaveStatus("Preparant copia...", false);
  getAllHandwriting().then(function (drawings) {
    var backup = {
      version: 3,
      exportedAt: new Date().toISOString(),
      state: state,
      handwriting: drawings
    };
    var blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "agenda-ipad-copia-" + toISODate(new Date()) + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    setSaveStatus("Copia creada", false);
  }, function () {
    setSaveStatus("Error creant la copia", true);
  });
}

function importBackup(event) {
  var file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  var reader = new FileReader();
  reader.onload = function () {
    try {
      var backup = JSON.parse(reader.result);
      var importedState = backup.state || backup;
      if (!importedState || !importedState.days || typeof importedState.days !== "object") {
        throw new Error("Format incorrecte");
      }
      if (!window.confirm("Aquesta accio substituira les dades actuals. Vols continuar?")) {
        return;
      }

      var drawings = backup.handwriting || extractEmbeddedHandwriting(importedState);
      replaceAllHandwriting(drawings).then(function () {
        state = importedState;
        removeEmbeddedHandwriting(state);
        saveState();
        render();
        setSaveStatus("Copia restaurada", false);
      }, function () {
        setSaveStatus("Error restaurant manuscrits", true);
      });
    } catch (error) {
      setSaveStatus("Copia no valida", true);
    }
  };
  reader.onerror = function () {
    setSaveStatus("No s'ha pogut llegir la copia", true);
  };
  reader.readAsText(file);
}

function extractEmbeddedHandwriting(importedState) {
  var drawings = {};
  var dates = Object.keys(importedState.days || {});
  for (var i = 0; i < dates.length; i += 1) {
    var day = importedState.days[dates[i]];
    if (day && typeof day.handwriting === "string" && day.handwriting) {
      drawings[dates[i]] = day.handwriting;
    }
  }
  return drawings;
}

function removeEmbeddedHandwriting(importedState) {
  var dates = Object.keys(importedState.days || {});
  for (var i = 0; i < dates.length; i += 1) {
    if (importedState.days[dates[i]]) {
      delete importedState.days[dates[i]].handwriting;
    }
  }
}

function showInstallGuide() {
  var installed = window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  var message = "";
  if (installed) {
    message = "L'agenda ja esta oberta en mode aplicacio.";
  } else if (window.AGENDA_STANDALONE) {
    message = "Aquesta versio HTML es pot afegir a la pantalla d'inici, pero el funcionament fora de linia no esta garantit. Per tenir mode offline cal utilitzar el paquet PWA complet.";
  } else if (window.location.protocol === "file:") {
    message = "Aquesta copia oberta com a fitxer serveix per provar-la, pero no es pot instal·lar de forma fiable. Primer cal publicar la carpeta en un allotjament HTTPS.";
  } else if (!window.isSecureContext) {
    message = "Aquesta adreca HTTP permet provar l'agenda, pero per instal·lar-la i usar-la fora de linia necessites una adreca HTTPS.";
  } else {
    message = "L'agenda esta preparada per instal·lar-se des de Safari.";
  }
  byId("installMessage").textContent = message;
  els.installOverlay.classList.remove("hidden");
}

function hideInstallGuide() {
  els.installOverlay.classList.add("hidden");
}

function registerServiceWorker() {
  if (window.AGENDA_STANDALONE) {
    return;
  }
  if (!("serviceWorker" in navigator)) {
    return;
  }
  if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
    return;
  }
  navigator.serviceWorker.register("service-worker.js").then(null, function () {
    setSaveStatus("Mode offline no disponible", true);
  });
}

function makeId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return "task-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function focusFirstEmpty(listId) {
  var fields = document.querySelectorAll("#" + listId + "List textarea");
  for (var i = 0; i < fields.length; i += 1) {
    if (!fields[i].value.trim()) {
      fields[i].focus();
      return;
    }
  }
  if (fields[0]) {
    fields[0].focus();
  }
}

function focusLastTask(listId) {
  var fields = document.querySelectorAll("#" + listId + "List textarea");
  if (fields.length) {
    fields[fields.length - 1].focus();
  }
}

function byId(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}
