# Dorm Points 🫧

A cute, Super-Mario-World-coloured leaderboard for the dorm's social contribution points.

- **Bubble board**: every student is a bouncing bubble with their first name and student ID. More points = higher bubble. Tap a bubble to see rank and points.
- **Find me**: students type their ID to find their bubble (it gets a "YOU" tag on later visits).
- **Leaderboard**: top students plus a searchable list of everyone.
- **How to earn points**: the point system and why points matter.
- **Ask for points**: students describe what they did, attach a photo, and it's emailed to the admin.
- **Admin page** (`admin.html`): paste the Students tab from Excel and publish.

It's a plain static website (HTML/CSS/JS, no build step), so it runs for free on GitHub Pages. The animations run in each visitor's browser, so they work the same on GitHub Pages.

---

## 1. Put it online (one time, ~5 minutes)

1. **Make `main` the website branch.** On GitHub open the repository → **Code** tab → branch dropdown → **View all branches**. Click the ✏️ next to `claude/eager-planck-nl3ihr` and rename it to `main`. (Or merge it into `main` if `main` already has commits.)
2. **Turn on GitHub Pages.** **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, pick **main** and **/ (root)**, then **Save**.
3. Wait a minute. The site will be at
   **https://funnykoalabear.github.io/DormSocialContributionTracker/**

## 2. Turn on the "Ask for points" emails (one time)

Requests are emailed to you through [FormSubmit](https://formsubmit.co) (free, no account needed).

1. Open the website and send a test request yourself.
2. FormSubmit emails **2024m735@kuas.ac.jp** an activation link. Click it. (Check spam/junk if you don't see it.)
3. Done: every request now arrives as an email with the student's ID, name, activity, date, description and photo. Hitting **Reply** answers the student (their uni email is pre-filled from their ID).

Optional: the activation email also gives you a random code. Put it in `js/config.js` as `requestEmail` to hide your address from the page source.

## 3. Update the points (every time)

1. Open **https://funnykoalabear.github.io/DormSocialContributionTracker/admin.html**
2. In Excel, open the **Students** tab, press **Ctrl+A**, then **Ctrl+C**.
3. Paste into the box on the admin page. It shows everyone's points and what changed since the last update. You can fix any bubble name right there; your fixes are remembered.
4. Click **Publish to website 🚀**. The site updates in about a minute.

The first time, the admin page asks for a **publishing key** (a GitHub fine-grained token that can only edit this one repository). The page walks you through making it. It's stored only in that browser.

No key? Click **Download points.json** and upload it to the `data` folder on GitHub (**Add file → Upload files → Commit**).

## Changing things

- **Point rules, "why points matter", email address**: edit `js/config.js` on GitHub (open the file, click the pencil ✏️).
- **Bubble names**: change them on the admin page before publishing.

## What's public

Anyone with the link can see each student's **ID, first name and total points**. Full names, the points log and reasons are never uploaded. Keep the Excel file out of this repository (`.gitignore` blocks `.xlsx` files).

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `js/app.js` | The main page |
| `js/bubbles.js` | Bouncing bubble physics |
| `admin.html`, `js/admin.js` | Paste-and-publish admin page |
| `js/core.js` | Reads the Excel paste, picks first names, ranks students |
| `js/config.js` | Settings you can edit |
| `data/points.json` | The published points (written by the admin page) |
| `css/`, `assets/` | Styles, clouds and hills |
| `tests/` | Tests for the Excel reader: `node --test tests/core.test.js` |
