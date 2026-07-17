/* ============================================================
   STAR CATCHER — script.js
   Complete game logic using vanilla JavaScript + Canvas API.

   How this file is organised:
   1.  DOM references       — grab HTML elements
   2.  Game state           — all variables that track what's happening
   3.  Audio (Web Audio)    — tiny sound effects with no external files
   4.  Screen helpers       — show / hide screens
   5.  Canvas setup         — size the canvas correctly
   6.  Particle system      — sparkle effects on catch
   7.  Falling object logic — create, move, draw objects
   8.  Basket logic         — draw and move the player basket
   9.  Collision detection  — did the basket catch an object?
   10. HUD update           — refresh score / level / lives display
   11. Level progression    — increase difficulty over time
   12. Main game loop       — requestAnimationFrame loop
   13. Input handling       — keyboard + touch controls
   14. Button listeners     — start / restart buttons
============================================================ */


/* ──────────────────────────────────────────────────────────
   1. DOM REFERENCES
   Cache references so we don't search the DOM repeatedly.
────────────────────────────────────────────────────────── */
const startScreen    = document.getElementById('start-screen');
const gameScreen     = document.getElementById('game-screen');
const gameoverScreen = document.getElementById('gameover-screen');

const canvas         = document.getElementById('game-canvas');
const ctx            = canvas.getContext('2d');   // 2D drawing context

const scoreDisplay   = document.getElementById('score-display');
const levelDisplay   = document.getElementById('level-display');
const livesDisplay   = document.getElementById('lives-display');

const finalScoreEl   = document.getElementById('final-score');
const finalLevelEl   = document.getElementById('final-level');
const bestScoreEl    = document.getElementById('best-score');

const startBtn       = document.getElementById('start-btn');
const restartBtn     = document.getElementById('restart-btn');

const touchLeft      = document.getElementById('touch-left');
const touchRight     = document.getElementById('touch-right');


/* ──────────────────────────────────────────────────────────
   2. GAME STATE
   One object that holds everything about the current session.
────────────────────────────────────────────────────────── */
let game = {};   // populated (or reset) in initGame()

// Best score survives across sessions using localStorage
let bestScore = parseInt(localStorage.getItem('starCatcher_best') || '0');

// Track which keys are currently held down
const keys = { ArrowLeft: false, ArrowRight: false };


/* ──────────────────────────────────────────────────────────
   3. AUDIO — Web Audio API
   We synthesise simple beeps so no audio files are needed.
────────────────────────────────────────────────────────── */

// AudioContext is created once on first user interaction (browser requirement)
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * playTone(frequency, type, duration, volume)
 * Plays a single synthesised note.
 * @param {number} freq     - pitch in Hz (e.g. 440 = A4)
 * @param {string} type     - wave shape: 'sine' | 'square' | 'triangle'
 * @param {number} duration - length in seconds
 * @param {number} vol      - volume 0–1
 */
function playTone(freq, type = 'sine', duration = 0.15, vol = 0.3) {
  try {
    const ac  = getAudioCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);

    // Fade out smoothly to avoid clicks
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch (e) {
    // Silently ignore audio errors (some browsers block it)
  }
}

// Convenient named sound effects
const sfx = {
  catch:   () => playTone(880, 'sine',     0.12, 0.25),   // high ding
  miss:    () => playTone(150, 'triangle', 0.25, 0.3),    // low thud
  levelUp: () => {
    playTone(523, 'sine', 0.1, 0.2);
    setTimeout(() => playTone(659, 'sine', 0.1, 0.2), 100);
    setTimeout(() => playTone(784, 'sine', 0.2, 0.2), 200);
  },
};


/* ──────────────────────────────────────────────────────────
   4. SCREEN HELPERS
   Show/hide screens by toggling the CSS 'active' class.
────────────────────────────────────────────────────────── */
function showScreen(screen) {
  [startScreen, gameScreen, gameoverScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}


/* ──────────────────────────────────────────────────────────
   5. CANVAS SETUP
   Make the canvas fill the available space inside game-screen.
────────────────────────────────────────────────────────── */
function resizeCanvas() {
  // HUD height + touch controls height
  const hudH   = document.getElementById('hud').offsetHeight;
  const touchH = window.innerWidth <= 768 ? 70 : 0;

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight - hudH - touchH;

  // Also update basket position so it doesn't fly off-screen
  if (game.basket) {
    game.basket.x = Math.min(game.basket.x, canvas.width - game.basket.w);
  }
}

window.addEventListener('resize', () => {
  resizeCanvas();
});


/* ──────────────────────────────────────────────────────────
   6. PARTICLE SYSTEM
   Tiny sparkles that burst out when the player catches a star.
────────────────────────────────────────────────────────── */

/**
 * spawnParticles(x, y, color)
 * Creates several particles at position (x, y).
 */
function spawnParticles(x, y, color) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i;
    const speed = 2 + Math.random() * 3;
    game.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 3 + Math.random() * 3,
      alpha: 1,
      color,
      decay: 0.03 + Math.random() * 0.02,   // how fast it fades
    });
  }
}

/**
 * updateParticles()
 * Move each particle and remove it when fully transparent.
 */
function updateParticles() {
  game.particles = game.particles.filter(p => p.alpha > 0.01);
  for (const p of game.particles) {
    p.x     += p.vx;
    p.y     += p.vy;
    p.vy    += 0.12;        // gravity pulls them down
    p.alpha -= p.decay;
    p.radius *= 0.97;       // shrink over time
  }
}

/** drawParticles() — render all active particles */
function drawParticles() {
  for (const p of game.particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}


/* ──────────────────────────────────────────────────────────
   7. FALLING OBJECTS
   Each object is a star (or bomb at higher levels) that falls
   from the top of the canvas.
────────────────────────────────────────────────────────── */

// Object type definitions — add more here to extend the game!
const OBJECT_TYPES = [
  { emoji: '⭐', color: '#fbbf24', points: 1,  isBad: false },
  { emoji: '💎', color: '#60a5fa', points: 3,  isBad: false },
  { emoji: '🍎', color: '#f87171', points: 2,  isBad: false },
  { emoji: '💣', color: '#6b7280', points: -1, isBad: true  },  // unlocks at level 3
];

/**
 * spawnObject()
 * Creates one new falling object and adds it to game.objects.
 */
function spawnObject() {
  // At level < 3, only use non-bad objects (first 3 types)
  const availableTypes = game.level < 3
    ? OBJECT_TYPES.filter(t => !t.isBad)
    : OBJECT_TYPES;

  const type  = availableTypes[Math.floor(Math.random() * availableTypes.length)];
  const size  = 36;

  // Bias slightly toward sides so centre isn't always easiest
  const margin = size;
  const x = margin + Math.random() * (canvas.width - margin * 2);

  game.objects.push({
    x,
    y:      -size,
    size,
    speed:  game.fallSpeed + Math.random() * 1.5,
    ...type,
  });
}

/**
 * updateObjects()
 * Move objects down. Remove if off-screen (missed).
 */
function updateObjects() {
  for (let i = game.objects.length - 1; i >= 0; i--) {
    const obj = game.objects[i];
    obj.y += obj.speed;

    // Object has passed the bottom edge — player missed it
    if (obj.y - obj.size > canvas.height) {
      game.objects.splice(i, 1);

      if (!obj.isBad) {
        // Missed a good object → lose a life
        loseLife();
      }
      // Missed a bomb → no penalty (it's a relief!)
    }
  }
}

/**
 * drawObjects()
 * Render each falling object as an emoji with a glowing shadow.
 */
function drawObjects() {
  for (const obj of game.objects) {
    ctx.save();
    ctx.font          = `${obj.size}px serif`;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';

    // Glow effect using shadowBlur
    ctx.shadowColor   = obj.color;
    ctx.shadowBlur    = 20;

    ctx.fillText(obj.emoji, obj.x, obj.y);
    ctx.restore();
  }
}


/* ──────────────────────────────────────────────────────────
   8. BASKET (the player)
   A rounded rectangle with a gradient fill and a rim highlight.
────────────────────────────────────────────────────────── */

/**
 * createBasket()
 * Returns a fresh basket object centred at the bottom.
 */
function createBasket() {
  const w = 90, h = 30;
  return {
    w, h,
    x: canvas.width / 2 - w / 2,
    y: canvas.height - h - 12,
    speed: 7,
  };
}

/**
 * updateBasket()
 * Moves the basket left/right based on held keys.
 */
function updateBasket() {
  const b = game.basket;

  if (keys.ArrowLeft)  b.x -= b.speed;
  if (keys.ArrowRight) b.x += b.speed;

  // Clamp to canvas edges
  b.x = Math.max(0, Math.min(canvas.width - b.w, b.x));

  // Keep Y in sync (canvas might have been resized)
  b.y = canvas.height - b.h - 12;
}

/**
 * drawBasket()
 * Renders the basket as a rounded gradient rectangle.
 */
function drawBasket() {
  const b  = game.basket;
  const cx = b.x + b.w / 2;

  ctx.save();

  // Outer glow when moving
  const isMoving = keys.ArrowLeft || keys.ArrowRight;
  if (isMoving) {
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur  = 24;
  }

  // Gradient fill — purple to pink
  const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  grad.addColorStop(0,   '#7c3aed');
  grad.addColorStop(1,   '#db2777');
  ctx.fillStyle = grad;

  // Rounded rectangle (roundRect is supported in modern browsers)
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(b.x, b.y, b.w, b.h, 10);
  } else {
    // Fallback for older browsers
    ctx.rect(b.x, b.y, b.w, b.h);
  }
  ctx.fill();

  // Rim highlight (white semi-transparent line at the top)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(b.x + 12, b.y + 3);
  ctx.lineTo(b.x + b.w - 12, b.y + 3);
  ctx.stroke();

  // Basket icon emoji in the centre
  ctx.font         = '18px serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧺', cx, b.y + b.h / 2);

  ctx.restore();
}


/* ──────────────────────────────────────────────────────────
   9. COLLISION DETECTION
   Check if any falling object overlaps the basket.
────────────────────────────────────────────────────────── */

function checkCollisions() {
  const b = game.basket;

  for (let i = game.objects.length - 1; i >= 0; i--) {
    const obj = game.objects[i];

    // Simple AABB (axis-aligned bounding box) check
    // The object's bounding box is a square centred on obj.x, obj.y
    const half = obj.size / 2;
    const objLeft   = obj.x - half;
    const objRight  = obj.x + half;
    const objBottom = obj.y + half;
    const objTop    = obj.y - half;

    const caught =
      objRight  > b.x &&
      objLeft   < b.x + b.w &&
      objBottom > b.y &&
      objTop    < b.y + b.h;

    if (caught) {
      game.objects.splice(i, 1);   // remove the object

      if (obj.isBad) {
        // Caught a bomb → lose a life
        loseLife();
        sfx.miss();
      } else {
        // Caught a good object → add points
        game.score += obj.points;
        sfx.catch();
        spawnParticles(obj.x, b.y, obj.color);
        updateHUD();
        checkLevelUp();
      }
    }
  }
}


/* ──────────────────────────────────────────────────────────
   10. HUD UPDATE
   Refresh the on-screen score, level, and hearts display.
────────────────────────────────────────────────────────── */

function updateHUD() {
  scoreDisplay.textContent = game.score;
  levelDisplay.textContent = game.level;

  // Build a hearts string: ❤️ for each remaining life, 🖤 for lost lives
  const maxLives = 3;
  livesDisplay.textContent =
    '❤️'.repeat(game.lives) + '🖤'.repeat(maxLives - game.lives);

  // "Pop" animation on score
  scoreDisplay.classList.remove('pop');
  void scoreDisplay.offsetWidth;   // force reflow to restart animation
  scoreDisplay.classList.add('pop');
}


/* ──────────────────────────────────────────────────────────
   11. LEVEL PROGRESSION
   Every N points the level increases, making objects fall faster
   and spawn more frequently.
────────────────────────────────────────────────────────── */

const POINTS_PER_LEVEL = 10;   // score needed to advance each level

function checkLevelUp() {
  const newLevel = Math.floor(game.score / POINTS_PER_LEVEL) + 1;
  if (newLevel > game.level) {
    game.level     = newLevel;
    game.fallSpeed = 2 + game.level * 0.4;      // objects fall faster
    game.spawnRate = Math.max(40, 80 - game.level * 6);  // spawn more often

    sfx.levelUp();
    showLevelUpBanner();
  }
}

/**
 * showLevelUpBanner()
 * A temporary "Level Up!" text drawn on the canvas.
 * We use a flag + timer instead of DOM elements to keep it simple.
 */
function showLevelUpBanner() {
  game.banner      = `Level ${game.level}!`;
  game.bannerTimer = 90;   // frames to show (≈ 1.5 seconds at 60fps)
}

function drawBanner() {
  if (!game.bannerTimer || game.bannerTimer <= 0) return;

  const alpha = Math.min(1, game.bannerTimer / 30);   // fade out
  ctx.save();
  ctx.globalAlpha  = alpha;
  ctx.font         = 'bold 48px ' + getComputedStyle(document.body).fontFamily;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#fbbf24';
  ctx.shadowColor  = '#fbbf24';
  ctx.shadowBlur   = 30;
  ctx.fillText(game.banner, canvas.width / 2, canvas.height / 2);
  ctx.restore();

  game.bannerTimer--;
}


/* ──────────────────────────────────────────────────────────
   LOSE A LIFE helper
────────────────────────────────────────────────────────── */
function loseLife() {
  game.lives--;
  sfx.miss();
  updateHUD();

  // Brief red flash on the canvas
  game.flashTimer = 12;

  if (game.lives <= 0) {
    endGame();
  }
}


/* ──────────────────────────────────────────────────────────
   DRAW BACKGROUND
   A subtle starfield so the canvas doesn't look blank.
────────────────────────────────────────────────────────── */

// Generate stars once; they stay in the same position
let bgStars = [];
function generateBgStars() {
  bgStars = [];
  const count = Math.floor((canvas.width * canvas.height) / 4000);
  for (let i = 0; i < count; i++) {
    bgStars.push({
      x:       Math.random() * canvas.width,
      y:       Math.random() * canvas.height,
      r:       0.5 + Math.random() * 1.5,
      alpha:   0.2 + Math.random() * 0.6,
      flicker: Math.random() * Math.PI * 2,   // phase offset for twinkle
    });
  }
}

function drawBackground() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dark gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0f0c29');
  grad.addColorStop(1, '#24243e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Twinkle the background stars
  const t = performance.now() / 1000;
  for (const s of bgStars) {
    const alpha = s.alpha * (0.6 + 0.4 * Math.sin(t * 1.5 + s.flicker));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Red flash overlay when a life is lost
  if (game.flashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = game.flashTimer / 20;
    ctx.fillStyle   = '#ef4444';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    game.flashTimer--;
  }
}


/* ──────────────────────────────────────────────────────────
   12. MAIN GAME LOOP
   requestAnimationFrame calls this ~60 times per second.
────────────────────────────────────────────────────────── */

function gameLoop() {
  if (!game.running) return;

  // ① Background
  drawBackground();

  // ② Spawn objects on a timer
  game.spawnCounter++;
  if (game.spawnCounter >= game.spawnRate) {
    spawnObject();
    game.spawnCounter = 0;
  }

  // ③ Update game entities
  updateObjects();
  updateBasket();
  updateParticles();

  // ④ Check for catches
  checkCollisions();

  // ⑤ Draw everything
  drawObjects();
  drawBasket();
  drawParticles();
  drawBanner();

  // ⑥ Request next frame
  game.animId = requestAnimationFrame(gameLoop);
}


/* ──────────────────────────────────────────────────────────
   INIT / START / END GAME
────────────────────────────────────────────────────────── */

/**
 * initGame()
 * Resets all game state to starting values.
 */
function initGame() {
  // Cancel any running loop first
  if (game.animId) cancelAnimationFrame(game.animId);

  resizeCanvas();
  generateBgStars();

  game = {
    running:      true,
    score:        0,
    level:        1,
    lives:        3,
    fallSpeed:    2.4,     // initial fall speed
    spawnRate:    80,      // frames between spawns
    spawnCounter: 0,
    objects:      [],
    particles:    [],
    basket:       createBasket(),
    banner:       '',
    bannerTimer:  0,
    flashTimer:   0,
    animId:       null,
  };

  updateHUD();
  showScreen(gameScreen);
  gameLoop();
}

/**
 * endGame()
 * Called when lives reach zero.
 */
function endGame() {
  game.running = false;
  cancelAnimationFrame(game.animId);

  // Update best score
  if (game.score > bestScore) {
    bestScore = game.score;
    localStorage.setItem('starCatcher_best', bestScore);
  }

  // Populate game-over screen
  finalScoreEl.textContent = game.score;
  finalLevelEl.textContent = game.level;
  bestScoreEl.textContent  = bestScore;

  // Small delay so the player can see the last moment
  setTimeout(() => showScreen(gameoverScreen), 600);
}


/* ──────────────────────────────────────────────────────────
   13. INPUT HANDLING
────────────────────────────────────────────────────────── */

// Keyboard: set key flag on press/release
document.addEventListener('keydown', e => {
  if (e.key in keys) keys[e.key] = true;
});
document.addEventListener('keyup', e => {
  if (e.key in keys) keys[e.key] = false;
});

// Touch: hold finger on left/right zone
touchLeft.addEventListener('touchstart',  () => keys.ArrowLeft  = true,  { passive: true });
touchLeft.addEventListener('touchend',    () => keys.ArrowLeft  = false, { passive: true });
touchRight.addEventListener('touchstart', () => keys.ArrowRight = true,  { passive: true });
touchRight.addEventListener('touchend',   () => keys.ArrowRight = false, { passive: true });

// Also support mouse clicks for non-touch desktop testing
touchLeft.addEventListener('mousedown',  () => keys.ArrowLeft  = true);
touchLeft.addEventListener('mouseup',    () => keys.ArrowLeft  = false);
touchRight.addEventListener('mousedown', () => keys.ArrowRight = true);
touchRight.addEventListener('mouseup',   () => keys.ArrowRight = false);


/* ──────────────────────────────────────────────────────────
   14. BUTTON LISTENERS
────────────────────────────────────────────────────────── */

startBtn.addEventListener('click',   initGame);
restartBtn.addEventListener('click', initGame);
