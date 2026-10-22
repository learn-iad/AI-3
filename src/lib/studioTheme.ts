/** Единый визуальный стиль «Мастерская» — бархатный зелёный */
export function applyStudioTheme(): void {
  document.documentElement.dataset.visualTheme = "studio";
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", "#e8f2ec");
  }
}
