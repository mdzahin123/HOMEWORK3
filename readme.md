# Endless Revolution — Vue.js DDR Game

**Course:** CMPSC 421 — Web Application Development
**Topic:** Single-page application built with [Vue.js 3](https://vuejs.org/), with optional persistence to [Cloud Firestore](https://firebase.google.com/docs/firestore).

A polished, keyboard-driven rhythm game inspired by *Dance Dance Revolution*. Arrows fly up the screen toward a target zone at the top; press the matching arrow key when each one lines up. Time it perfectly for a "PERFECT!" worth double points, build a combo for a multiplier, or watch your health bar drain when you miss.

By default, the game runs out-of-the-box with high scores saved to your browser's **localStorage**. A single flag flips it over to a shared **Cloud Firestore** leaderboard if you want one.

---

## Features

### Gameplay
- **Proper hit windows** — arrows aren't just "in the bottom row." They have a **PERFECT** zone (center of the target) and a **GOOD** zone (anywhere overlapping the target box). Mistime your press by too much and it counts as a miss.
- **Combo system** — every consecutive hit grows your combo. Every 5 hits adds **+25%** to your score multiplier, stacking. Miss once and the combo resets.
- **Score tiers** — PERFECT = 200 pts, GOOD = 100 pts, both modified by combo multiplier.
- **Three difficulties** — Light / Medium / Hard change both **arrow speed** *and* **spawn rate**, not just one of them.
- **Game-over recap** — total hits, total misses, best combo, and accuracy %, all shown on the end screen.
- **Pause** with `P` and **end-game** with `Esc` — no more frantic Alt-F4 if your phone rings.

### Visuals
- Modern dark UI with neon accents and an animated gradient background.
- Each direction has its own color (pink / blue / green / orange) so you can read the screen at a glance.
- **Hit-flash and miss-flash** on the target zone — green pulse when you hit, pink pulse when you miss.
- **Combo "🔥" indicator** that shakes when you're at 10+.
- **Floating PERFECT / GOOD / MISS popups** in the play field.
- **Health bar** turns yellow under 50%, red and pulsing under 25%.

### Quality of life
- Username saved to `localStorage` so you don't retype it.
- **Top 5 leaderboard per difficulty** (the original spec asked for one — this gives a leaderboard you can actually compare friends on).
- **Auto-refresh leaderboard** after every game.
- **Storage badge** at the top-left tells you instantly whether you're on local or cloud scores.
- Game loop uses `requestAnimationFrame` for smooth motion regardless of frame rate.

---

## Project Structure

```
Homework 3/
└── game/
    ├── index.html      # Vue template + styles
    └── index.js        # Game logic + storage layer
```

No build step, no `node_modules`, no bundlers. Vue is loaded from a CDN.

---

## Running the Game

### Default mode (localStorage)
Just open `game/index.html` in your browser. Double-clicking the file works.

### If you've enabled Firestore mode
Browsers won't run ES module imports from `file://`, so you'll need to serve the folder over HTTP:

**VS Code Live Server** *(easiest)* — install the Live Server extension, right-click `index.html`, **Open with Live Server**.

**Python**
```bash
cd "Homework 3/game"
python -m http.server 8000
# open http://localhost:8000
```

**Node**
```bash
npm install -g http-server
cd "Homework 3/game"
http-server -p 8000
```

---

## How to Play

1. Type your name and click **Save** (or press Enter).
2. Pick a difficulty: Light / Medium / Hard.
3. Click **▶ Start Game**.
4. Arrows fly up from the bottom. When one reaches the highlighted target zone at the top, press the matching arrow key:

   - `↑` for an up arrow
   - `↓` for a down arrow
   - `←` for a left arrow
   - `→` for a right arrow

5. **Hit dead-center** for **PERFECT** (200 pts × combo multiplier). Slightly off = **GOOD** (100 pts × combo multiplier). Way off, wrong key, or letting an arrow fly past = **MISS**.
6. Build a combo — every 5 consecutive hits stacks a +25% multiplier.
7. **20 misses** ends the game. Your stats show on the end screen, and your score is saved to the leaderboard.

### Hotkeys

| Key                     | Action                  |
| ----------------------- | ----------------------- |
| `↑` `↓` `←` `→`         | Hit arrows              |
| `P`                     | Pause / resume          |
| `Esc`                   | End the current game    |

---

## Scoring Reference

| Hit type   | Base points | Notes                            |
| ---------- | ----------- | -------------------------------- |
| **PERFECT** | 200         | Within ~22 px of target center  |
| **GOOD**    | 100         | Within ~50 px of target center  |
| **MISS**    | 0 (and -1 health) | Wrong direction, or arrow flew past |

Combo multiplier formula: `1 + floor(combo / 5) × 0.25`

| Combo | Multiplier |
| ----- | ---------- |
| 0–4   | ×1.00      |
| 5–9   | ×1.25      |
| 10–14 | ×1.50      |
| 15–19 | ×1.75      |
| 20+   | ×2.00 and growing |

---

## Difficulty Settings

| Difficulty | Arrow speed | Spawn interval |
| ---------- | ----------- | -------------- |
| Light      | 180 px/s    | every 1100 ms  |
| Medium     | 230 px/s    | every 800 ms   |
| Hard       | 290 px/s    | every 550 ms   |

Tweak these in the `DIFFICULTY` object at the top of `game/index.js`.

---

## Optional: Cloud Leaderboard with Firestore

By default scores live in your browser. Want one shared leaderboard across all players?

### 1. Set up Firebase

1. Create a new project at [console.firebase.google.com](https://console.firebase.google.com/).
2. Add a **Web App** (`</>` icon) and copy the `firebaseConfig` object it gives you.
3. In the left nav: **Build → Firestore Database → Create database** (start in test mode).

### 2. Update `game/index.js`

Near the top of the file:

**a.** Uncomment the import lines:
```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
```

**b.** Flip the flag:
```javascript
const USE_FIRESTORE = true;
```

**c.** Replace the `firebaseConfig` placeholder with your real values.

### 3. Update `game/index.html`

Change the script tag at the bottom from:
```html
<script src="index.js"></script>
```
to:
```html
<script type="module" src="index.js"></script>
```

### 4. Recommended Firestore security rules

In **Firestore → Rules** in the Firebase console, paste these so the public can submit and view scores without being able to tamper:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /scores/{score} {
      allow read: if true;
      allow create: if request.resource.data.score is number
                    && request.resource.data.score < 10000000
                    && request.resource.data.username is string
                    && request.resource.data.username.size() < 50;
      allow update, delete: if false;
    }
  }
}
```

### A note on Firebase API keys
Firebase web API keys are *not* secrets — per [Firebase's docs](https://firebase.google.com/docs/projects/api-keys), they're identifiers, not credentials. What protects your data is your security rules. So it's safe to commit `firebaseConfig` to a public repo.

---

## Tech Stack

- **[Vue.js 3](https://vuejs.org/)** (Options API), no build step.
- **`requestAnimationFrame`** for the main game loop (smooth, frame-rate independent).
- **`setInterval`** for arrow spawning (decoupled from rendering).
- **`localStorage`** for username and (default) high scores.
- **[Cloud Firestore](https://firebase.google.com/docs/firestore)** *(optional)* for shared leaderboard.

---

## Score Document Shape

Same shape whether stored locally or in Firestore:

```json
{
  "username": "player1",
  "score": 7250,
  "difficulty": "medium",
  "timestamp": "2024-04-15T19:32:11.123Z"
}
```

Local scores live under the `ddr-scores` key in `localStorage`.

---

## Assignment Checklist

| Requirement                                                    | Status |
| -------------------------------------------------------------- | ------ |
| Vue.js implementation                                          | ✅     |
| Arrow keys handled via key events                              | ✅     |
| Arrows spawned via `setInterval`, flowing in a grid            | ✅     |
| Health bar / limited incorrect moves                           | ✅     |
| Three difficulty levels affecting `setInterval` speed          | ✅     |
| Score increases per correct move                               | ✅     |
| Game over when misses exhausted                                | ✅     |
| "Play again?" prompt on game over                              | ✅     |
| High scores stored in Firebase / Firestore                     | ✅ (opt-in) |
| Top scores displayed in the UI                                 | ✅     |
| `node_modules` excluded from submission                        | ✅ (none used) |
