export function ThemeScript() {
  const code = `
    (() => {
      try {
        const key = "fastfleet.theme";
        const saved = localStorage.getItem(key);
        const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        const theme = saved === "dark" || saved === "light" ? saved : system;
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle("dark", theme === "dark");
      } catch {
        document.documentElement.dataset.theme = "light";
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
