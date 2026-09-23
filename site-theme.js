(() => {
  const key = "auroraTheme";
  const legacyKey = "auroraHomeTheme";
  const root = document.documentElement;

  function readTheme() {
    try {
      return localStorage.getItem(key) || localStorage.getItem(legacyKey) || "dark";
    } catch (_) {
      return "dark";
    }
  }

  function applyTheme(theme, save = false) {
    const value = theme === "light" ? "light" : "dark";
    root.dataset.theme = value;
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === value));
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = value === "light" ? "#fffdeb" : "#071310";
    if (save) {
      try {
        localStorage.setItem(key, value);
        localStorage.setItem(legacyKey, value);
      } catch (_) {}
    }
  }

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => applyTheme(button.dataset.themeChoice, true));
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === legacyKey) applyTheme(readTheme());
  });
  applyTheme(readTheme());
})();
