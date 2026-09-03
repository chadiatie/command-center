(() => {
  const key = "auroraHomeTheme";
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll("[data-theme-choice]")];
  function applyTheme(theme, save = false) {
    const value = theme === "light" ? "light" : "dark";
    root.dataset.theme = value;
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.themeChoice === value)));
    document.querySelector('meta[name="theme-color"]').content = value === "light" ? "#f7f3eb" : "#211d28";
    if (save) { try { localStorage.setItem(key, value); } catch (_) {} }
  }
  buttons.forEach(button => button.addEventListener("click", () => applyTheme(button.dataset.themeChoice, true)));
  window.addEventListener("storage", event => { if (event.key === key) applyTheme(event.newValue); });
  applyTheme(root.dataset.theme);
  function updateGreeting() {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    const greeting = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
    document.getElementById("greeting").textContent = greeting + ", Chadi.";
  }
  updateGreeting();
  setInterval(updateGreeting, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") updateGreeting(); });
})();
