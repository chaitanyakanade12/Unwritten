# AGENTS.md: Project brief for "Liha" (read this fully before changing anything)

You are joining an existing, working, tested project. Do not rebuild it. Understand it, then make small, careful changes that respect the rules below. If a request conflicts with a rule here, say so and ask before proceeding.

---

## 1. What this is and why it exists

**Liha** (working name; "liha" / लिहा means "write" in Marathi) is a personal writing website with three things:

1. **Daily Blog:** the owner posts a blog every day; visitors can read posts, and also write their own. Includes 3000x3000px share cards, clean A4 printable layouts, and full-bleed PDF downloads.
2. **Sticky Notes:** short notes (max 140 characters) on coloured sticky notes, saved as a wall, downloadable as 3000x3000px images.
3. **Letters:** write a real letter on A4 paper (handwritten look or clean print) with rich corner decorations (Rainy Day, Diwali, Friendship, Sorry, Congrats, Missing You, Love, Birthday, Thank you, Dreamy, Festive, Frame), download as high-quality PNG or full-bleed PDF, or print it.

**The purpose (important, it is shown to users in the "Why Liha exists" section):** Liha is **NOT** meant to replace notebooks or journals. It is a **backup and companion for the moments when a notebook is not possible** (bus, queue, midnight idea with the bag across the room). The message is "diary first, Liha alongside" (डायरी आधी, Liha सोबत). Keep this tone everywhere: warm, humble, never "better than paper".

**Goal behind the project:** revive a culture of writing (blogs, letters, short notes) in an era of scrolling. Audience: **Gen Z, millennials and kids**. It must feel playful, safe and inviting, never corporate.

**Owner:** Chaitanya, a second-year Electronics & Telecommunication Engineering student (Sangli-Miraj area, Maharashtra). He edits the files himself in VS Code/Antigravity with Live Server. He prefers **concise, simple, minimal-complexity code** and explanations that get simpler, not more complicated. Prefer clarity over cleverness. Explain what you changed in plain words.

**Name:** still undecided. Candidates he liked: "Zen Liha", "Nivant" (निवांत, "at ease"), "Zen Nivant", "Maun Ink". Keep **Liha** until he chooses.

---

## 2. Tech and file map

Plain **HTML + CSS + JavaScript**. **No frameworks, no build step, no npm, no libraries, no CDN, no network calls.** Everything works offline. Keep it that way. Run with VS Code Live Server.

| File | Role |
| --- | --- |
| `index.html` | All four pages in one file (`#page-home`, `#page-blog`, `#page-notes`, `#page-letter`), theme & language controls, "Why" section, footer, hidden helpers. |
| `style.css` | Fonts, design tokens (`:root`), per-page theming, night mode overrides (`html[data-theme="dark"]`), paper/letter CSS, zen mode, print rules. |
| `script.js` | One IIFE. Helpers, i18n dictionary (`t()`, `applyLang()`), theme toggle (`applyTheme()`), router, daily prompt, streak with nudge, blog with share card & PDF/print, notes with confetti pop, letter engine, zen mode, backup/restore, offline/install. |
| `sw.js` | Service worker, network-first with cache fallback. Bump `CACHE` on changes. |
| `manifest.webmanifest`, `icon-192.png`, `icon-512.png` | Installable app. |
| `fonts/` | Self-hosted `.woff2` files (Anton, Kalam, Mukta). |
| `README.md` | Human-facing run/edit guide. |

---

## 3. Design language (CRITICAL: preserve exactly)

**Concept: "a desk covered in paper".** Poppy background with white dot-grid, cream paper cards with folded corner, taped sticky notes, ruled letter sheets. Hard offset shadows (no blur), thick ink outlines.
- Typography: Anton 400 (display headings), Kalam 400/700 (handwriting), Mukta 400/600/800 (UI/body).
- Per-page theming: Home (orange), Blog (blue), Notes (coral), Letter (periwinkle).
- Night Mode: Dark burnt orange, midnight blue, dark coral, dark periwinkle. Warm dark cards with cream borders. Exports (PNG, PDF, print) and letter preview ALWAYS stay light.
- Language: English by default; optional natural Marathi UI via footer toggle (`liha.lang`).

## 4. Letter page flow (minimal, keep it this way)
Occasion chips first (`MAIN_THEMES` + "More"), one suggested starter (`STARTS`, `renderStarter`), then To / Letter / Sign-off + Your name, a collapsed "Page options" (`<details class="opts">`), the live preview, and a sticky `.actionbar` with **Download PDF** and a **More** menu (PNG, Print, Share, Copy, New letter). The bar hides while a field is focused. Do not put all controls back on the page. The footer shows only Why Liha, language, Install and Back to top, with the rest under "Your data".
Zen mode is opened only by the user's Zen button (nothing opens it automatically). `zenInit(id,key,{extra,done})` moves the writing field, and for letters the "To" field, into a full-screen overlay; leaving a page closes its zen box. The first-time letter is blank on purpose.

## Login and cloud sync
`firebase-config.js` (settings), `sync.js` (module: Firebase Auth + Firestore), `firestore.rules`. Only posts, notes, letter and days sync (`SYNCED` map in script.js, hooked in `store.set`). Signed out = `wipeLocal()` removes every `liha.*` key except theme and language. Do not add other keys to the sync list without updating `firestore.rules`. Login screen is `#login` (an overlay, not a route). While config says PASTE, everything is off.

## Writing and login polish (Nov 2026)
Streak is forgiving (`streakCount`: one rest day per 7). `markToday(quiet)` marks the day; `cheer()` shows "That counts" once a day (letter typing calls `markToday(true)` so it never interrupts). Writing boxes use CSS `field-sizing:content` outside zen. Privacy dialog is `#privacy`; account deletion is `#profile-delete` in sync.js (cloud docs first, then `deleteUser`). Never name a local variable `t` in a function that also calls `t()` (the translation helper).
