// =============================================================================
// Endless Revolution — DDR-style keyboard rhythm game
//
// Score storage: localStorage by default, Firestore if you enable it below.
//
// To enable a shared CLOUD leaderboard:
//   1. Create a Firebase project at https://console.firebase.google.com/
//   2. Add a Web App, copy the firebaseConfig object below
//   3. Enable Cloud Firestore (test mode is fine to start)
//   4. Set USE_FIRESTORE = true and uncomment the import lines
//   5. In index.html, change <script src="index.js"> to
//      <script type="module" src="index.js">
// =============================================================================

const USE_FIRESTORE = false;

// Uncomment when USE_FIRESTORE = true:
// import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
// import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// =============================================================================
// Storage abstraction — same interface for local and cloud backends
// =============================================================================

let db = null;
if (USE_FIRESTORE) {
  // eslint-disable-next-line no-undef
  const app = initializeApp(firebaseConfig);
  // eslint-disable-next-line no-undef
  db = getFirestore(app);
}

const LOCAL_KEY = "ddr-scores";
const TOP_N = 5; // how many leaderboard entries to keep / show per difficulty

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; }
  catch { return []; }
}
function writeLocal(arr) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(arr));
}

async function saveScore(entry) {
  if (USE_FIRESTORE && db) {
    // eslint-disable-next-line no-undef
    await addDoc(collection(db, "scores"), entry);
  } else {
    const arr = readLocal();
    arr.push(entry);
    writeLocal(arr);
  }
}

async function fetchTop(difficulty, n = TOP_N) {
  if (USE_FIRESTORE && db) {
    // eslint-disable-next-line no-undef
    const q = query(
      // eslint-disable-next-line no-undef
      collection(db, "scores"),
      // eslint-disable-next-line no-undef
      where("difficulty", "==", difficulty),
      // eslint-disable-next-line no-undef
      orderBy("score", "desc"),
      // eslint-disable-next-line no-undef
      limit(n)
    );
    // eslint-disable-next-line no-undef
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  }
  return readLocal()
    .filter(s => s.difficulty === difficulty)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// =============================================================================
// Game tuning
// =============================================================================

const DIFFICULTY = {
  light:  { spawnMs: 1100, fallSpeed: 180, label: 'Light'  }, // px/sec
  medium: { spawnMs: 800,  fallSpeed: 230, label: 'Medium' },
  hard:   { spawnMs: 550,  fallSpeed: 290, label: 'Hard'   }
};

const FIELD_HEIGHT = 560;
const TARGET_Y = 30;     // top of target zone
const TARGET_H = 100;    // target zone height
const TARGET_CENTER = TARGET_Y + TARGET_H / 2; // 80
const PERFECT_WINDOW = 22;  // px from center
const GOOD_WINDOW = 50;     // px from center
const ARROW_SIZE = 80;

const POINTS = { perfect: 200, good: 100 };
const MAX_MISSES = 20;
const COMBO_BONUS_THRESHOLD = 5; // every 5 combo, bonus multiplier kicks up

// =============================================================================
// Vue app
// =============================================================================

const { createApp } = Vue;

createApp({
  data() {
    return {
      // identity
      inputUsername: '',
      username: '',

      // game state machine: 'idle' | 'playing' | 'gameover'
      state: 'idle',
      paused: false,

      // settings
      directions: ['up', 'down', 'left', 'right'],
      selectedDifficulty: 'medium',
      currentDifficulty: 'medium',

      // gameplay
      arrows: [],
      score: 0,
      misses: 0,
      maxMisses: MAX_MISSES,
      combo: 0,
      maxComboReached: 0,
      totalHits: 0,
      totalAttempts: 0,

      // visual feedback
      hitFlash:  { up: false, down: false, left: false, right: false },
      missFlash: { up: false, down: false, left: false, right: false },
      pressedKey: null,
      popups: [],

      // leaderboard
      leaderboard: { light: [], medium: [], hard: [] },

      // internal
      _arrowId: 0,
      _popupId: 0,
      _spawnTimer: null,
      _rafId: null,
      _lastFrame: 0,

      storageMode: USE_FIRESTORE ? 'cloud' : 'local'
    };
  },

  computed: {
    healthPct() {
      return Math.max(0, 100 - (this.misses / this.maxMisses) * 100);
    },
    accuracy() {
      if (this.totalAttempts === 0) return 0;
      return Math.round((this.totalHits / this.totalAttempts) * 100);
    }
  },

  methods: {
    arrowSymbol(dir) {
      return { up: '↑', down: '↓', left: '←', right: '→' }[dir];
    },
    arrowStyle(arrow) {
      const laneIdx = this.directions.indexOf(arrow.direction);
      // Field is 480 wide, 4 lanes, arrow is 80 wide → center each in its lane
      const laneWidth = 480 / 4;
      const left = laneIdx * laneWidth + (laneWidth - ARROW_SIZE) / 2;
      return {
        top: arrow.y + 'px',
        left: left + 'px'
      };
    },

    // -------------------------------------------------------------------
    // Lifecycle: start / pause / end
    // -------------------------------------------------------------------
    setUsername() {
      const name = this.inputUsername.trim();
      if (!name) return;
      this.username = name;
      localStorage.setItem('ddrUsername', name);
      this.inputUsername = '';
    },

    startGame() {
      if (!this.username) {
        alert('Please enter your name first!');
        return;
      }
      this.resetGame();
      this.currentDifficulty = this.selectedDifficulty;
      this.state = 'playing';
      this.paused = false;

      this._spawnTimer = setInterval(
        () => this.spawnArrow(),
        DIFFICULTY[this.currentDifficulty].spawnMs
      );
      this._lastFrame = performance.now();
      this._rafId = requestAnimationFrame(this.tick);
    },

    togglePause() {
      if (this.state !== 'playing') return;
      this.paused = !this.paused;
      if (this.paused) {
        clearInterval(this._spawnTimer);
        cancelAnimationFrame(this._rafId);
      } else {
        this._spawnTimer = setInterval(
          () => this.spawnArrow(),
          DIFFICULTY[this.currentDifficulty].spawnMs
        );
        this._lastFrame = performance.now();
        this._rafId = requestAnimationFrame(this.tick);
      }
    },

    async endGame(forced = false) {
      if (this.state !== 'playing') return;
      clearInterval(this._spawnTimer);
      cancelAnimationFrame(this._rafId);
      this._spawnTimer = null;
      this._rafId = null;
      this.state = 'gameover';
      this.paused = false;

      // only save scores from natural endings, or forced-end games
      if (this.score > 0) {
        try {
          await saveScore({
            username: this.username,
            score: this.score,
            difficulty: this.currentDifficulty,
            timestamp: new Date().toISOString()
          });
          await this.loadLeaderboard();
        } catch (e) {
          console.error('Failed to save score:', e);
        }
      }
    },

    resetGame() {
      clearInterval(this._spawnTimer);
      cancelAnimationFrame(this._rafId);
      this.arrows = [];
      this.popups = [];
      this.score = 0;
      this.misses = 0;
      this.combo = 0;
      this.maxComboReached = 0;
      this.totalHits = 0;
      this.totalAttempts = 0;
      this.pressedKey = null;
      for (const d of this.directions) {
        this.hitFlash[d] = false;
        this.missFlash[d] = false;
      }
    },

    // -------------------------------------------------------------------
    // Game loop
    // -------------------------------------------------------------------
    tick(now) {
      const dt = (now - this._lastFrame) / 1000; // seconds
      this._lastFrame = now;

      const speed = DIFFICULTY[this.currentDifficulty].fallSpeed;

      // arrows fly UP from bottom toward target zone at top
      // (we model y as their current top; spawn at FIELD_HEIGHT, target near 0)
      for (const a of this.arrows) {
        if (!a.consumed) a.y -= speed * dt;
      }

      // arrows that flew past the target zone without being hit = a miss
      const toRemove = [];
      for (const a of this.arrows) {
        if (a.consumed) continue;
        if (a.y + ARROW_SIZE < TARGET_Y - 20) {
          this.registerMiss(a.direction, /*passive=*/true);
          a.consumed = true;
          toRemove.push(a);
        }
      }
      // also clean up arrows flagged 'fading' that have finished animating
      this.arrows = this.arrows.filter(a => !toRemove.includes(a));

      if (this.misses >= this.maxMisses) {
        this.endGame();
        return;
      }

      this._rafId = requestAnimationFrame(this.tick);
    },

    spawnArrow() {
      if (this.paused || this.state !== 'playing') return;
      const dir = this.directions[Math.floor(Math.random() * 4)];
      this.arrows.push({
        id: ++this._arrowId,
        direction: dir,
        y: FIELD_HEIGHT,    // start at the bottom
        consumed: false,
        fading: false
      });
    },

    // -------------------------------------------------------------------
    // Input
    // -------------------------------------------------------------------
    onKeyPress(direction) {
      if (this.state !== 'playing' || this.paused) return;

      this.pressedKey = direction;
      setTimeout(() => { if (this.pressedKey === direction) this.pressedKey = null; }, 120);

      this.totalAttempts++;

      // find the arrow of this direction closest to the target center
      let best = null;
      let bestDist = Infinity;
      for (const a of this.arrows) {
        if (a.consumed || a.direction !== direction) continue;
        const arrowCenter = a.y + ARROW_SIZE / 2;
        const dist = Math.abs(arrowCenter - TARGET_CENTER);
        if (dist < bestDist) {
          bestDist = dist;
          best = a;
        }
      }

      if (best && bestDist <= GOOD_WINDOW) {
        const isPerfect = bestDist <= PERFECT_WINDOW;
        this.registerHit(best, isPerfect);
      } else {
        this.registerMiss(direction, /*passive=*/false);
      }
    },

    registerHit(arrow, perfect) {
      arrow.consumed = true;
      arrow.fading = true;

      this.totalHits++;
      this.combo++;
      if (this.combo > this.maxComboReached) this.maxComboReached = this.combo;

      const base = perfect ? POINTS.perfect : POINTS.good;
      const multiplier = 1 + Math.floor(this.combo / COMBO_BONUS_THRESHOLD) * 0.25;
      const gain = Math.round(base * multiplier);
      this.score += gain;

      this.flashTarget(arrow.direction, 'hit');
      this.spawnPopup(perfect ? 'PERFECT!' : 'GOOD', perfect ? 'perfect' : 'good');

      // remove arrow after fade animation
      setTimeout(() => {
        this.arrows = this.arrows.filter(a => a !== arrow);
      }, 180);
    },

    registerMiss(direction, passive) {
      this.misses++;
      this.combo = 0;
      this.flashTarget(direction, 'miss');
      // only show MISS popup on active misses (player pressed wrong/empty),
      // passive misses (arrow flew past) just count silently to avoid spam
      if (!passive) {
        this.spawnPopup('MISS', 'miss');
      }
      if (this.misses >= this.maxMisses) {
        this.endGame();
      }
    },

    flashTarget(direction, kind) {
      const flashMap = kind === 'hit' ? this.hitFlash : this.missFlash;
      flashMap[direction] = true;
      setTimeout(() => { flashMap[direction] = false; }, 200);
    },

    spawnPopup(text, kind) {
      const id = ++this._popupId;
      this.popups.push({ id, text, kind });
      setTimeout(() => {
        this.popups = this.popups.filter(p => p.id !== id);
      }, 700);
    },

    // -------------------------------------------------------------------
    // Leaderboard
    // -------------------------------------------------------------------
    async loadLeaderboard() {
      try {
        for (const diff of ['light', 'medium', 'hard']) {
          this.leaderboard[diff] = await fetchTop(diff, TOP_N);
        }
      } catch (e) {
        console.error('Failed to load leaderboard:', e);
      }
    },

    // -------------------------------------------------------------------
    // Keyboard handling
    // -------------------------------------------------------------------
    handleKeyDown(event) {
      // global hotkeys
      if (event.key === 'p' || event.key === 'P') {
        this.togglePause();
        return;
      }
      if (event.key === 'Escape') {
        if (this.state === 'playing') this.endGame(true);
        return;
      }

      const map = {
        ArrowUp: 'up', ArrowDown: 'down',
        ArrowLeft: 'left', ArrowRight: 'right'
      };
      const dir = map[event.key];
      if (dir) {
        event.preventDefault();
        this.onKeyPress(dir);
      }
    }
  },

  mounted() {
    window.addEventListener('keydown', this.handleKeyDown);
    const saved = localStorage.getItem('ddrUsername');
    if (saved) this.username = saved;
    this.loadLeaderboard();
  },

  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
    clearInterval(this._spawnTimer);
    cancelAnimationFrame(this._rafId);
  }
}).mount('#app');
