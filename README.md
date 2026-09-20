# habit-tracker
Habit Tracker PWA for two people, static app on Cloudflare Pages

Live at https://habits.pporeddy.com (Cloudflare Pages, auto-deploys from `main`).

## Known limits

- Weekly streaks cap near 4 weeks. The Sync screen reads a ~30-day window, so
  longer weekly runs are cut off. This gets fixed properly with monthly data
  files later.
