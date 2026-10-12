/** Same-tab navigation (never window.open: blocked after an await on iOS Safari, leaves the app in Capacitor). */
export function navigateSameTab(url: string) {
  window.location.assign(url)
}
