// How many client-side navigations have happened since this document loaded
// (updated by SmoothScroll, which lives in the root layout and so sees every
// route change). Lets a "back"-style control tell whether there is an
// in-site page to go back to, or whether this page was opened directly and
// `router.back()` would leave the site / do nothing.
export const routeHistory = { inAppNavigations: 0 };

export function canGoBackInApp() {
  return routeHistory.inAppNavigations > 0;
}
