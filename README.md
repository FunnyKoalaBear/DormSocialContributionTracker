# Dorm Points 🫧

A cute, Super-Mario-World-coloured leaderboard for the dorm's social contribution points.

- **Bubble board**: every student is a bouncing bubble. Students who agreed show their chosen name; everyone else is an anonymous **?** bubble. More points = higher bubble. Hover (or tap) a bubble to see its rank, points and the full log of why it got them.
- **Find me**: students type their name on the board to find their bubble (it gets a "YOU" tag on later visits).
- **Leaderboard**: top students plus a searchable list of everyone.
- **Points log**: every point given or taken, newest first, searchable and filterable by category.
- **How to earn points**: the point system and why points matter.
- **Ask for points**: students describe what they did, attach a photo, and it's emailed to the admin.
- **Admin page** (`admin.html`): drop in the Excel tracker and publish.

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
3. Done: every request now arrives as an email with the student's name, university email, activity, date, description and photo. Hitting **Reply** answers the student.

Optional: the activation email also gives you a random code. Put it in `js/config.js` as `requestEmail` to hide your address from the page source.

## 3. Update the points (every time)

1. Save your tracker in Excel.
2. Open **https://funnykoalabear.github.io/DormSocialContributionTracker/admin.html**
3. Drop the `.xlsx` file into the box (or click it and choose the file). It's read in your browser only; the file itself is never uploaded anywhere.
4. Check the preview and any warnings, then click **Publish to website 🚀**. The site updates in about a minute.

The admin page reads three tabs: **Students** (including the **Website Name** column), **Points Log** and **Point System**. Points come from the Points Log's **Points** column (same as Excel's totals); if a row has no Points value it falls back to Custom Points, then to the Point System.

The first time, the admin page asks for a **publishing key** (a GitHub fine-grained token that can only edit this one repository). The page walks you through making it. It's stored only in that browser.

No key? Click **Download points.json** and upload it to the `data` folder on GitHub (**Add file → Upload files → Commit**).

## Who is named on the website

Only students with a **Website Name** on the Students tab are named. Leave it blank and the student is an anonymous **?** bubble. When someone new agrees to be named, type their chosen name in that column and publish again.

If a reason in the Points Log mentions a student's real name, the website shows their Website Name instead, or "a dorm-mate" if they aren't named. The admin page lists every swap before you publish.

## Changing things

- **Point rules, "why points matter", email address**: edit `js/config.js` on GitHub (open the file, click the pencil ✏️).
- **Names on bubbles**: edit the **Website Name** column in Excel, then publish again.

## What's public

Anyone with the link can see each student's **Website Name (only if they agreed), total points and points log** (date, category, points and reason, with names swapped as above). Student IDs, full names and "Recorded By" are never published; each bubble just gets a throwaway key that changes on every publish. Keep the Excel file out of this repository (`.gitignore` blocks `.xlsx` files).

Note: versions of `data/points.json` published before this change listed student IDs and first names, and they are still in the repository's Git history.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `js/app.js` | The main page |
| `js/bubbles.js` | Bouncing bubble physics |
| `admin.html`, `js/admin.js` | Upload-and-publish admin page (reads the Excel file with SheetJS) |
| `js/core.js` | Reads the workbook, swaps names in reasons, ranks students, builds `points.json` |
| `js/config.js` | Settings you can edit |
| `data/points.json` | The published points (written by the admin page) |
| `css/`, `assets/` | Styles, clouds and hills |
| `tests/` | Tests for the workbook reader: `node --test tests/core.test.js` |
