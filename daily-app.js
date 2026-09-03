(() => {
  const STORAGE = {
    notes: "auroraStickyNoteV1",
    rituals: "auroraEveningRitualsV1",
    pickup: "auroraRoryPickupTimeV1",
  };
  const ZONE = "Europe/Zurich";
  const ids = [
    "loginGate", "loginForm", "passwordInput", "loginError", "loginButton", "logoutButton", "dashboard",
    "greeting", "todayLabel", "weatherIcon", "weatherText", "weatherDetail", "syncStatus", "syncText",
    "refreshButton", "nowTemperature", "nowCondition", "nowDetails", "rainSummary", "hourlyRail",
    "adaptiveIcon", "adaptiveTitle", "adaptiveSubtitle", "morningView", "afternoonView", "eveningView",
    "briefingList", "pickupForecast", "pickupTime", "tomorrowWeather", "ritualForm", "ritualInput", "ritualList",
    "noteForm", "noteInput", "noteList", "noteCount",
  ];
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONE });
  const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const viewOverride = new URLSearchParams(location.search).get("view");
  let weatherData = null;
  let activeDay = "";

  function zurichParts(date = new Date()) {
    return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  }

  function dayKey() {
    const parts = zurichParts();
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function currentHour() {
    return Number(zurichParts().hour);
  }

  function dayPart() {
    if (["morning", "afternoon", "evening"].includes(viewOverride)) return viewOverride;
    const hour = currentHour();
    return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  }

  function relativeTime(value) {
    const milliseconds = new Date(value).getTime() - Date.now();
    const minutes = Math.round(milliseconds / 60000);
    if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relativeFormat.format(hours, "hour");
    return relativeFormat.format(Math.round(hours / 24), "day");
  }

  function weatherState(code, isDay = 1) {
    if (code === 0) return [isDay ? "clear_day" : "clear_night", "Clear sky"];
    if (code <= 2) return [isDay ? "partly_cloudy_day" : "partly_cloudy_night", "Partly cloudy"];
    if (code === 3) return ["cloud", "Overcast"];
    if (code <= 48) return ["foggy", "Fog"];
    if (code <= 57) return ["grain", "Drizzle"];
    if (code <= 67 || (code >= 80 && code <= 82)) return ["rainy", "Rain"];
    if (code <= 77 || (code >= 85 && code <= 86)) return ["weather_snowy", "Snow"];
    if (code >= 95) return ["thunderstorm", "Thunderstorms"];
    return ["partly_cloudy_day", "Changing conditions"];
  }

  function setDashboardVisible() {
    els.loginGate.hidden = true;
    els.dashboard.hidden = false;
    els.logoutButton.hidden = false;
  }

  function setLoginVisible() {
    els.loginGate.hidden = false;
    els.dashboard.hidden = true;
    els.logoutButton.hidden = true;
  }

  function setDayPart() {
    const part = dayPart();
    els.greeting.textContent = part === "morning" ? "Good morning" : part === "afternoon" ? "Good afternoon" : "Good evening";
    els.todayLabel.textContent = dateFormat.format(new Date());
    els.morningView.hidden = part !== "morning";
    els.afternoonView.hidden = part !== "afternoon";
    els.eveningView.hidden = part !== "evening";
    const details = {
      morning: ["feed", "Morning briefing", "A clear five-minute start"],
      afternoon: ["bolt", "Your second wind", "One useful push before family time"],
      evening: ["nightlight", "Wind down well", "A lighter close to the day"],
    }[part];
    [els.adaptiveIcon.textContent, els.adaptiveTitle.textContent, els.adaptiveSubtitle.textContent] = details;
  }

  function renderWeather(payload) {
    weatherData = payload;
    const current = payload.current || {};
    const [icon, condition] = weatherState(current.weather_code, current.is_day);
    els.weatherIcon.textContent = icon;
    els.weatherText.textContent = `${payload.location} · ${Math.round(current.temperature_2m)}°`;
    els.weatherDetail.textContent = condition;
    els.nowTemperature.textContent = `${Math.round(current.temperature_2m)}°`;
    els.nowCondition.textContent = condition;
    els.nowDetails.textContent = `Feels like ${Math.round(current.apparent_temperature)}° · wind ${Math.round(current.wind_speed_10m)} km/h`;

    const hourly = payload.hourly || {};
    const currentKey = `${dayKey()}T${String(currentHour()).padStart(2, "0")}:00`;
    let start = Math.max(0, (hourly.time || []).findIndex((time) => time >= currentKey));
    if (start < 0) start = 0;
    const hours = (hourly.time || []).slice(start, start + 12).map((time, offset) => {
      const index = start + offset;
      return {
        time,
        temperature: hourly.temperature_2m?.[index],
        rain: hourly.precipitation_probability?.[index] ?? 0,
        code: hourly.weather_code?.[index],
      };
    });

    els.hourlyRail.innerHTML = "";
    hours.forEach((hour, index) => {
      const [hourIcon] = weatherState(hour.code, Number(hour.time.slice(11, 13)) >= 7 && Number(hour.time.slice(11, 13)) < 20);
      const node = document.createElement("div");
      node.className = `hour${index === 0 ? " current" : ""}`;
      node.innerHTML = `<span class="hour-time">${index === 0 ? "Now" : hour.time.slice(11, 16)}</span><span class="material-symbols-rounded" aria-hidden="true">${hourIcon}</span><span class="hour-temp">${Math.round(hour.temperature)}°</span><span class="hour-rain">${hour.rain ? `<span class="material-symbols-rounded" aria-hidden="true">water_drop</span>${Math.round(hour.rain)}%` : ""}</span>`;
      els.hourlyRail.append(node);
    });

    const rainy = hours.find((hour, index) => index > 0 && hour.rain >= 40);
    els.rainSummary.textContent = rainy ? `Rain more likely around ${rainy.time.slice(11, 16)} · ${Math.round(rainy.rain)}%` : "Low rain chance over the next 12 hours.";
    els.syncStatus.classList.add("live");
    els.syncText.textContent = `MeteoSwiss forecast · refreshed ${relativeTime(payload.refreshedAt)}`;
    renderPickupForecast();
    renderTomorrow();
  }

  function renderWeatherUnavailable() {
    els.weatherText.textContent = "Lausanne";
    els.weatherDetail.textContent = "Weather unavailable";
    els.nowCondition.textContent = "Forecast temporarily unavailable";
    els.nowDetails.textContent = "Try Refresh in a moment.";
    els.rainSummary.textContent = "";
    els.hourlyRail.innerHTML = '<div class="empty-state">Could not load the MeteoSwiss forecast.</div>';
    els.syncStatus.classList.remove("live");
    els.syncText.textContent = "Weather connection needs a moment";
  }

  async function loadWeather() {
    const response = await fetch("/api/weather", { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401) {
      setLoginVisible();
      return false;
    }
    setDashboardVisible();
    if (!response.ok) {
      renderWeatherUnavailable();
      return true;
    }
    renderWeather(await response.json());
    return true;
  }

  async function loadBriefing() {
    if (dayPart() !== "morning") return;
    try {
      const response = await fetch("/api/briefing", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      els.briefingList.innerHTML = "";
      (payload.items || []).forEach((item) => {
        const link = document.createElement("a");
        link.className = "briefing-item";
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const category = document.createElement("span");
        category.className = "briefing-category";
        category.textContent = item.category;
        const title = document.createElement("span");
        title.className = "briefing-title";
        title.textContent = item.title;
        const source = document.createElement("span");
        source.className = "briefing-source";
        source.textContent = item.source;
        link.append(category, title, source);
        els.briefingList.append(link);
      });
    } catch (_) {
      els.briefingList.innerHTML = '<div class="empty-state">The morning briefing could not load. Try Refresh in a moment.</div>';
    }
  }

  function renderPickupForecast() {
    if (!weatherData?.hourly) return;
    const time = els.pickupTime.value || "17:30";
    const targetHour = Number(time.slice(0, 2));
    const target = `${dayKey()}T${String(targetHour).padStart(2, "0")}:00`;
    const index = weatherData.hourly.time?.findIndex((value) => value === target) ?? -1;
    if (index < 0) {
      els.pickupForecast.textContent = "Forecast unavailable for that time.";
      return;
    }
    const temperature = Math.round(weatherData.hourly.temperature_2m[index]);
    const rain = Math.round(weatherData.hourly.precipitation_probability[index] || 0);
    const [, condition] = weatherState(weatherData.hourly.weather_code[index], 1);
    els.pickupForecast.textContent = `${time} · ${temperature}° · ${condition.toLowerCase()} · ${rain}% rain`;
  }

  function renderTomorrow() {
    const daily = weatherData?.daily;
    if (!daily?.time?.[1]) return;
    const [, condition] = weatherState(daily.weather_code[1], 1);
    els.tomorrowWeather.textContent = `Tomorrow: ${condition.toLowerCase()}, ${Math.round(daily.temperature_2m_min[1])}–${Math.round(daily.temperature_2m_max[1])}°, ${Math.round(daily.precipitation_probability_max[1] || 0)}% rain.`;
  }

  function readStore(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function uniqueId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function prepareDailyStores() {
    const today = dayKey();
    const notes = readStore(STORAGE.notes, { day: today, items: [] });
    if (notes.day !== today) {
      notes.items = (notes.items || []).filter((item) => !item.done);
      notes.day = today;
      localStorage.setItem(STORAGE.notes, JSON.stringify(notes));
    }
    const rituals = readStore(STORAGE.rituals, { day: today, items: [] });
    if (rituals.day !== today) {
      rituals.items = (rituals.items || []).map((item) => ({ ...item, done: false }));
      rituals.day = today;
      localStorage.setItem(STORAGE.rituals, JSON.stringify(rituals));
    }
    activeDay = today;
  }

  function checklistRow(item, kind) {
    const row = document.createElement("div");
    row.className = `check-row${item.done ? " done" : ""}`;
    row.dataset.id = item.id;
    row.dataset.kind = kind;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = Boolean(item.done);
    check.setAttribute("aria-label", `Mark ${item.text} ${item.done ? "open" : "complete"}`);
    const text = document.createElement("span");
    text.className = "check-text";
    text.contentEditable = "true";
    text.spellcheck = true;
    text.textContent = item.text;
    text.setAttribute("role", "textbox");
    text.setAttribute("aria-label", "Edit item");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-item";
    remove.setAttribute("aria-label", `Delete ${item.text}`);
    remove.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">close</span>';
    row.append(check, text, remove);
    return row;
  }

  function renderNotes() {
    const state = readStore(STORAGE.notes, { day: dayKey(), items: [] });
    els.noteList.innerHTML = "";
    if (!state.items.length) els.noteList.innerHTML = '<div class="empty-state">Your note is clear. Add anything you want to remember today.</div>';
    state.items.forEach((item) => els.noteList.append(checklistRow(item, "notes")));
    const open = state.items.filter((item) => !item.done).length;
    els.noteCount.textContent = `${open} open`;
  }

  function renderRituals() {
    const state = readStore(STORAGE.rituals, { day: dayKey(), items: [] });
    els.ritualList.innerHTML = "";
    if (!state.items.length) els.ritualList.innerHTML = '<div class="empty-state">Add the rituals that make your evenings easier.</div>';
    state.items.forEach((item) => els.ritualList.append(checklistRow(item, "rituals")));
  }

  function updateItem(kind, id, changes) {
    prepareDailyStores();
    const key = STORAGE[kind];
    const state = readStore(key, { day: dayKey(), items: [] });
    state.items = state.items.map((item) => item.id === id ? { ...item, ...changes } : item);
    localStorage.setItem(key, JSON.stringify(state));
    kind === "notes" ? renderNotes() : renderRituals();
  }

  function deleteItem(kind, id) {
    prepareDailyStores();
    const key = STORAGE[kind];
    const state = readStore(key, { day: dayKey(), items: [] });
    state.items = state.items.filter((item) => item.id !== id);
    localStorage.setItem(key, JSON.stringify(state));
    kind === "notes" ? renderNotes() : renderRituals();
  }

  function addItem(kind, text) {
    const clean = text.trim();
    if (!clean) return;
    prepareDailyStores();
    const key = STORAGE[kind];
    const state = readStore(key, { day: dayKey(), items: [] });
    state.items.push({ id: uniqueId(), text: clean, done: false });
    state.day = dayKey();
    localStorage.setItem(key, JSON.stringify(state));
    kind === "notes" ? renderNotes() : renderRituals();
  }

  function bindChecklist(list) {
    list.addEventListener("change", (event) => {
      const row = event.target.closest(".check-row");
      if (!row || event.target.type !== "checkbox") return;
      updateItem(row.dataset.kind, row.dataset.id, { done: event.target.checked });
    });
    list.addEventListener("click", (event) => {
      const button = event.target.closest(".delete-item");
      const row = button?.closest(".check-row");
      if (row) deleteItem(row.dataset.kind, row.dataset.id);
    });
    list.addEventListener("keydown", (event) => {
      if (event.target.classList.contains("check-text") && event.key === "Enter") {
        event.preventDefault();
        event.target.blur();
      }
    });
    list.addEventListener("focusout", (event) => {
      const text = event.target.closest(".check-text");
      const row = text?.closest(".check-row");
      if (!row) return;
      const value = text.textContent.trim();
      if (value) updateItem(row.dataset.kind, row.dataset.id, { text: value });
      else deleteItem(row.dataset.kind, row.dataset.id);
    });
  }

  async function refreshPage() {
    if (els.refreshButton.disabled) return;
    setDayPart();
    els.refreshButton.disabled = true;
    try {
      const authenticated = await loadWeather();
      if (authenticated) await loadBriefing();
    } catch (_) {
      setDashboardVisible();
      renderWeatherUnavailable();
    } finally {
      els.refreshButton.disabled = false;
    }
  }

  els.noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addItem("notes", els.noteInput.value);
    els.noteInput.value = "";
    els.noteInput.focus();
  });
  els.ritualForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addItem("rituals", els.ritualInput.value);
    els.ritualInput.value = "";
    els.ritualInput.focus();
  });
  bindChecklist(els.noteList);
  bindChecklist(els.ritualList);

  els.pickupTime.value = localStorage.getItem(STORAGE.pickup) || "17:30";
  els.pickupTime.addEventListener("change", () => {
    localStorage.setItem(STORAGE.pickup, els.pickupTime.value);
    renderPickupForecast();
  });
  els.refreshButton.addEventListener("click", refreshPage);
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.loginButton.disabled = true;
    els.loginError.textContent = "";
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: els.passwordInput.value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not sign in.");
      els.passwordInput.value = "";
      await refreshPage();
    } catch (error) {
      els.loginError.textContent = error.message;
    } finally {
      els.loginButton.disabled = false;
    }
  });
  els.logoutButton.addEventListener("click", async () => {
    try { await fetch("/api/logout", { method: "POST", body: "{}" }); } catch (_) {}
    location.reload();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (activeDay !== dayKey()) {
      prepareDailyStores();
      renderNotes();
      renderRituals();
      setDayPart();
    }
    refreshPage();
  });
  setInterval(() => {
    const changedDay = activeDay !== dayKey();
    const changedPart = (dayPart() === "morning" && els.morningView.hidden)
      || (dayPart() === "afternoon" && els.afternoonView.hidden)
      || (dayPart() === "evening" && els.eveningView.hidden);
    if (changedDay) {
      prepareDailyStores();
      renderNotes();
      renderRituals();
    }
    setDayPart();
    if (changedDay || changedPart) refreshPage();
  }, 60000);
  setInterval(() => {
    if (document.visibilityState === "visible") refreshPage();
  }, 15 * 60000);

  prepareDailyStores();
  renderNotes();
  renderRituals();
  setDayPart();
  refreshPage();
})();
