/** Stable public route for an app's focused portfolio page. */
export function appPortfolioPath(id: string): string {
  return '/apps/' + encodeURIComponent(id);
}
