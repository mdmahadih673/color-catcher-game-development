/* ============================================================
   COLOR CATCHER — script.js
   Vanilla JS game engine, no external dependencies
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const COLORS = [
  { name: 'Red',    hex: '#e84040', glow: 'rgba(232,64,64,0.6)'   },
  { name: 'Blue',   hex: '#4a90e2', glow: 'rgba(74,144,226,0.6)'  },
  { name: 'Green',  hex: '#27ae60', glow: 'rgba(39,174,96,0.6)'   },
  { name: 'Yellow', hex: '#f1c40f', glow: 'rgba(241,196,15,0.6)'  },
  { name: 'Purple', hex: '#9b59b6', glow: 'rgba(155,89,182,0.6)'  },
];

const BASKET_WIDTH_RATIO  = 0.14;   // fraction of canvas width
const BASKET_HEIGHT       = 36;
const BASKET_SPEED        = 7;
const BALL_RADIUS         = 18;
const BASE_FALL_SPEED     = 2.2;
const SPEED_INCREMENT     = 0.22;   // extra speed per level
const BALLS_PER_LEVEL     = 8;      // balls before next level
const SPAWN_INTERVAL_BASE = 1400;   // ms between spawns at level 1
const SPAWN_MIN           = 550;    // fastest spawn interval
const MAX_LIVES           = 3;
const LIFE_ICONS          = ['❤️','❤️❤️','❤️❤️❤️'];

/* ─────────────────────────────────────────
   DOM REFERENCES
───────────────────────────────────────── */
const canvas            = document.getElementById('gameCanvas');
const ctx               = canvas.getContext('2d');
const scoreDisplay      = document.getElementById('scoreDisplay');
const highScoreDisplay  = document.getElementById('highScoreDisplay');
const livesDisplay      = document.getElementById('livesDisplay');
const targetColorDot    = document.getElementById('targetColorDot');
const targetColorName   = document.getElementById('targetColorName');
const levelDisplay      = document.getElementById('levelDisplay');
const levelBadge        = document.getElementById('levelBadge');
const finalScore        = document.getElementById('finalScore');
const finalHighScore    = document.getElementById('finalHighScore');
const newRecordMsg      = document.getElementById('newRecordMsg');
const startHighScore    = document.getElementById('startHighScore');

// Screens
const startScreen       = document.getElementById('startScreen');
const gameOverScreen    = document.getElementById('gameOverScreen');
const pauseScreen       = document.getElementById('pauseScreen');

// Buttons
const startBtn          = document.getElementById('startBtn');
const restartBtn        = document.getElementById('restartBtn');
const menuBtn           = document.getElementById('menuBtn');
const pauseBtn          = document.getElementById('pauseBtn');
const resumeBtn         = document.getElementById('resumeBtn');
const pauseMenuBtn      = document.getElementById('pauseMenuBtn');
const leftBtn           = document.getElementById('leftBtn');
const rightBtn          = document.getElementById('rightBtn');

/* ─────────────────────────────────────────
   AUDIO ENGINE (Web Audio API — no files!)
───────────────────────────────────────── */
let audioCtx = null;

/** Lazily create AudioContext on first user gesture */
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * Play a synthesised beep/tone.
 * @param {number} freq      - frequency in Hz
 * @param {string} type      - oscillator type
 * @param {number} duration  - seconds
 * @param {number} vol       - volume 0-1
 * @param {number} [ramp]    - exponential ramp end value
 */
function playTone(freq, type, duration, vol = 0.3, ramp = 0.001) {
  try {
    const ac  = getAudioCtx();
    const osc = ac.createOscillator();
    const gain= ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(ramp, ac.currentTime + duration);
    osc.start();
    osc.stop(ac.currentTime + duration);
  } catch(_) {}
}

const SFX = {
  /** Happy chime for correct catch */
  correct() {
    playTone(523, 'sine', 0.08, 0.25);
    setTimeout(() => playTone(659, 'sine', 0.10, 0.25), 80);
    setTimeout(() => playTone(784, 'sine', 0.15, 0.25), 160);
  },
  /** Buzzer for wrong catch */
  wrong() {
    playTone(220, 'sawtooth', 0.15, 0.2);
    setTimeout(() => playTone(180, 'sawtooth', 0.12, 0.15), 120);
  },
  /** Life lost */
  loseLife() {
    playTone(300, 'sawtooth', 0.18, 0.3);
    setTimeout(() => playTone(200, 'sawtooth', 0.25, 0.3), 150);
    setTimeout(() => playTone(150, 'square',   0.30, 0.3), 300);
  },
  /** Level up fanfare */
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => playTone(f, 'triangle', 0.12, 0.28), i * 90));
  },
  /** Game over */
  gameOver() {
    [400, 320, 260, 200].forEach((f, i) =>
      setTimeout(() => playTone(f, 'sawtooth', 0.22, 0.35), i * 130));
  },
};

/* ─────────────────────────────────────────
   GAME STATE
───────────────────────────────────────── */
let state = {};   // filled by resetGame()

function resetGame() {
  state = {
    running:      false,
    paused:       false,
    score:        0,
    lives:        MAX_LIVES,
    level:        1,
    ballsCaught:  0,          // counts toward next level
    targetColor:  null,       // current COLORS entry
    balls:        [],
    particles:    [],         // canvas particle effects
    basket: {
      x: 0,                   // set after canvas resize
      y: 0,
      width: 0,
      height: BASKET_HEIGHT,
      speed: BASKET_SPEED,
    },
    keys:         { left: false, right: false },
    spawnTimer:   null,
    animFrame:    null,
    lastTime:     0,
  };
}

/* ─────────────────────────────────────────
   HIGH SCORE
───────────────────────────────────────── */
function getHighScore() {
  return parseInt(localStorage.getItem('colorCatcherHS') || '0', 10);
}
function saveHighScore(s) {
  localStorage.setItem('colorCatcherHS', String(s));
}
function refreshHighScoreUI() {
  const hs = getHighScore();
  highScoreDisplay.textContent = hs;
  startHighScore.textContent   = `Best: ${hs}`;
}

/* ─────────────────────────────────────────
   CANVAS SIZING
───────────────────────────────────────── */
function resizeCanvas() {
  const hud     = document.getElementById('hud');
  const mob     = document.getElementById('mobileControls');
  const hudH    = hud.offsetHeight;
  const mobH    = window.matchMedia('(hover:none)').matches ? mob.offsetHeight : 0;
  canvas.width  = canvas.offsetWidth;
  canvas.height = window.innerHeight - hudH - mobH - 1;

  // Reposition basket
  if (state.basket) {
    state.basket.width = canvas.width * BASKET_WIDTH_RATIO;
    if (!state.basket.x) {
      state.basket.x = (canvas.width - state.basket.width) / 2;
    }
    state.basket.x = Math.min(
      Math.max(state.basket.x, 0),
      canvas.width - state.basket.width
    );
    state.basket.y = canvas.height - state.basket.height - 10;
  }
}

/* ─────────────────────────────────────────
   PICK TARGET COLOR
───────────────────────────────────────── */
function pickTargetColor() {
  const prev = state.targetColor;
  let next;
  do { next = COLORS[Math.floor(Math.random() * COLORS.length)]; }
  while (next === prev && COLORS.length > 1);
  state.targetColor = next;

  // Update HUD
  targetColorDot.style.backgroundColor = next.hex;
  targetColorDot.style.boxShadow        = `0 0 12px ${next.glow}`;
  targetColorName.textContent           = next.name;
  targetColorName.style.color           = next.hex;
  targetColorName.style.textShadow      = `0 0 10px ${next.glow}`;

  // Flash animation
  targetColorName.style.animation = 'none';
  requestAnimationFrame(() => {
    targetColorName.style.animation = 'pulse 0.6s ease 2';
  });
}

/* ─────────────────────────────────────────
   SPAWN BALL
───────────────────────────────────────── */
function spawnBall() {
  if (!state.running || state.paused) return;

  const color   = COLORS[Math.floor(Math.random() * COLORS.length)];
  const speed   = BASE_FALL_SPEED + (state.level - 1) * SPEED_INCREMENT;
  const x       = BALL_RADIUS + Math.random() * (canvas.width - BALL_RADIUS * 2);

  state.balls.push({
    x, y: -BALL_RADIUS,
    radius: BALL_RADIUS,
    color,
    speed,
    wobble: Math.random() * Math.PI * 2,   // phase offset for slight side wobble
    wobbleAmp: 0.3 + Math.random() * 0.5,
    opacity: 1,
    trail: [],                              // positions for motion trail
  });
}

function scheduleSpawn() {
  if (state.spawnTimer) clearTimeout(state.spawnTimer);
  if (!state.running)   return;

  // Interval decreases with level
  const interval = Math.max(
    SPAWN_MIN,
    SPAWN_INTERVAL_BASE - (state.level - 1) * 80
  );
  state.spawnTimer = setTimeout(() => {
    spawnBall();
    scheduleSpawn();
  }, interval + Math.random() * 300);
}

/* ─────────────────────────────────────────
   CANVAS PARTICLE BURST (visual fx)
───────────────────────────────────────── */
function spawnParticleBurst(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 3 + Math.random() * 4,
      color: color.hex,
      alpha: 1,
      decay: 0.04 + Math.random() * 0.04,
    });
  }
}

/* ─────────────────────────────────────────
   FLOATING SCORE POPUP (DOM)
───────────────────────────────────────── */
function showScorePop(text, color, x, y) {
  const el = document.createElement('div');
  el.className   = 'score-pop';
  el.textContent = text;
  el.style.color = color;
  // Position relative to canvas
  const rect = canvas.getBoundingClientRect();
  el.style.left = `${rect.left + x}px`;
  el.style.top  = `${rect.top  + y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/* ─────────────────────────────────────────
   LEVEL UP
───────────────────────────────────────── */
function checkLevelUp() {
  if (state.ballsCaught >= state.level * BALLS_PER_LEVEL) {
    state.level++;
    levelDisplay.textContent = state.level;

    // Flash badge
    levelBadge.classList.add('show');
    setTimeout(() => levelBadge.classList.remove('show'), 2000);

    pickTargetColor();
    SFX.levelUp();
  }
}

/* ─────────────────────────────────────────
   SCORE / LIVES HUD UPDATE
───────────────────────────────────────── */
function updateHUD() {
  scoreDisplay.textContent = state.score;
  highScoreDisplay.textContent = Math.max(state.score, getHighScore());

  const hearts = '❤️'.repeat(state.lives) || '💔';
  livesDisplay.textContent = hearts;
}

/* ─────────────────────────────────────────
   COLLISION DETECTION
───────────────────────────────────────── */
function checkCollision(ball) {
  const bx = state.basket;
  // Ball centre vs basket rectangle (with slight forgiveness)
  return (
    ball.y + ball.radius >= bx.y - 4 &&
    ball.y - ball.radius <= bx.y + bx.height + 4 &&
    ball.x >= bx.x - ball.radius * 0.5 &&
    ball.x <= bx.x + bx.width + ball.radius * 0.5
  );
}

/* ─────────────────────────────────────────
   HANDLE BALL CAUGHT
───────────────────────────────────────── */
function catchBall(ball, index) {
  const isCorrect = ball.color.name === state.targetColor.name;

  if (isCorrect) {
    state.score++;
    state.ballsCaught++;
    SFX.correct();
    spawnParticleBurst(ball.x, ball.y, ball.color, 16);
    showScorePop('+1', '#6ab04c', ball.x, ball.y);
    checkLevelUp();
  } else {
    state.score = Math.max(0, state.score - 1);
    SFX.wrong();
    spawnParticleBurst(ball.x, ball.y, ball.color, 8);
    showScorePop('-1', '#eb4d4b', ball.x, ball.y);
    shakeBasket();
  }

  updateHUD();
  state.balls.splice(index, 1);
}

/* ─────────────────────────────────────────
   HANDLE BALL MISSED (fell off screen)
───────────────────────────────────────── */
function missBall(ball, index) {
  const isTarget = ball.color.name === state.targetColor.name;

  if (isTarget) {
    state.lives--;
    SFX.loseLife();
    showScorePop('💔', '#eb4d4b', ball.x, canvas.height - 40);
    updateHUD();

    if (state.lives <= 0) {
      endGame();
      return;
    }
  }
  state.balls.splice(index, 1);
}

/* ─────────────────────────────────────────
   BASKET SHAKE (CSS animation)
───────────────────────────────────────── */
let shakeTimeout = null;
function shakeBasket() {
  canvas.classList.remove('shake');
  clearTimeout(shakeTimeout);
  requestAnimationFrame(() => {
    canvas.classList.add('shake');
    shakeTimeout = setTimeout(() => canvas.classList.remove('shake'), 400);
  });
}

/* ─────────────────────────────────────────
   DRAW FUNCTIONS
───────────────────────────────────────── */

/** Draw a single ball with gradient, glow, and highlight */
function drawBall(ball) {
  ctx.save();

  // Glow
  ctx.shadowColor = ball.color.glow;
  ctx.shadowBlur  = 18;

  // Gradient fill
  const grad = ctx.createRadialGradient(
    ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, ball.radius * 0.1,
    ball.x, ball.y, ball.radius
  );
  grad.addColorStop(0, lightenHex(ball.color.hex, 60));
  grad.addColorStop(1, ball.color.hex);

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle   = grad;
  ctx.globalAlpha = ball.opacity;
  ctx.fill();

  // Specular highlight
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(
    ball.x - ball.radius * 0.28,
    ball.y - ball.radius * 0.30,
    ball.radius * 0.28,
    0, Math.PI * 2
  );
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();

  ctx.restore();
}

/** Draw the basket as a rounded rectangle with gradient and rim */
function drawBasket() {
  const { x, y, width, height } = state.basket;
  ctx.save();

  // Basket body
  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0.06)');

  ctx.shadowColor = 'rgba(249,202,36,0.5)';
  ctx.shadowBlur  = 20;

  roundRect(ctx, x, y, width, height, 10);
  ctx.fillStyle = grad;
  ctx.fill();

  // Rim (top border)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#f9ca24';
  ctx.lineWidth   = 3;
  roundRect(ctx, x, y, width, height, 10);
  ctx.stroke();

  // Basket colour strip (matches target colour)
  if (state.targetColor) {
    ctx.fillStyle = state.targetColor.hex;
    ctx.globalAlpha = 0.6;
    roundRect(ctx, x + 4, y + 4, width - 8, 5, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** Draw canvas particle effects */
function drawParticles() {
  state.particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/** Rounded rectangle helper */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Lighten a hex colour by `amount` (0-255) */
function lightenHex(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r   = Math.min(255, (num >> 16) + amount);
  const g   = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b   = Math.min(255, (num & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}

/* ─────────────────────────────────────────
   MAIN GAME LOOP
───────────────────────────────────────── */
function gameLoop(timestamp) {
  if (!state.running || state.paused) return;

  const dt = Math.min(timestamp - state.lastTime, 50); // cap at 50ms
  state.lastTime = timestamp;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Move basket
  const bx = state.basket;
  if (state.keys.left)  bx.x -= bx.speed;
  if (state.keys.right) bx.x += bx.speed;
  bx.x = Math.max(0, Math.min(canvas.width - bx.width, bx.x));

  // Update & draw particles
  state.particles = state.particles.filter(p => p.alpha > 0.02);
  state.particles.forEach(p => {
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.1; // gravity
    p.alpha -= p.decay;
    p.radius *= 0.97;
  });
  drawParticles();

  // Update & draw balls
  for (let i = state.balls.length - 1; i >= 0; i--) {
    const ball = state.balls[i];

    // Subtle side wobble
    ball.wobble += 0.04;
    ball.x += Math.sin(ball.wobble) * ball.wobbleAmp * 0.4;

    ball.y += ball.speed;

    // Check catch
    if (checkCollision(ball)) {
      catchBall(ball, i);
      continue;
    }

    // Check missed
    if (ball.y - ball.radius > canvas.height) {
      missBall(ball, i);
      if (!state.running) return; // game over happened
      continue;
    }

    drawBall(ball);
  }

  // Draw basket on top
  drawBasket();

  state.animFrame = requestAnimationFrame(gameLoop);
}

/* ─────────────────────────────────────────
   GAME FLOW
───────────────────────────────────────── */
function startGame() {
  resetGame();
  resizeCanvas();

  state.running = true;
  state.basket.x = (canvas.width - state.basket.width) / 2;
  state.basket.y = canvas.height - state.basket.height - 10;

  // Level badge init
  levelDisplay.textContent = '1';
  levelBadge.classList.remove('show');

  pickTargetColor();
  updateHUD();
  refreshHighScoreUI();

  showScreen(null);        // hide all screens
  scheduleSpawn();

  state.lastTime = performance.now();
  state.animFrame = requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (!state.running || state.paused) return;
  state.paused = true;
  pauseBtn.textContent = '▶';
  clearTimeout(state.spawnTimer);
  showScreen('pause');
}

function resumeGame() {
  if (!state.running || !state.paused) return;
  state.paused = false;
  pauseBtn.textContent = '⏸';
  showScreen(null);
  scheduleSpawn();
  state.lastTime = performance.now();
  state.animFrame = requestAnimationFrame(gameLoop);
}

function endGame() {
  state.running = false;
  clearTimeout(state.spawnTimer);
  cancelAnimationFrame(state.animFrame);

  SFX.gameOver();

  const hs    = getHighScore();
  const isNew = state.score > hs;
  if (isNew) saveHighScore(state.score);

  finalScore.textContent     = state.score;
  finalHighScore.textContent = isNew ? state.score : hs;
  newRecordMsg.classList.toggle('hidden', !isNew);

  refreshHighScoreUI();
  showScreen('gameover');
}

function goToMenu() {
  state.running = false;
  clearTimeout(state.spawnTimer);
  cancelAnimationFrame(state.animFrame);
  refreshHighScoreUI();
  showScreen('start');
}

/* ─────────────────────────────────────────
   SCREEN MANAGER
───────────────────────────────────────── */
function showScreen(which) {
  startScreen.classList.remove('active');
  gameOverScreen.classList.remove('active');
  pauseScreen.classList.remove('active');

  if (which === 'start')    startScreen.classList.add('active');
  if (which === 'gameover') gameOverScreen.classList.add('active');
  if (which === 'pause')    pauseScreen.classList.add('active');
}

/* ─────────────────────────────────────────
   INPUT HANDLING
───────────────────────────────────────── */
// Keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') state.keys.left  = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.keys.right = true;
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (state.running && !state.paused) pauseGame();
    else if (state.paused)             resumeGame();
  }
});

document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') state.keys.left  = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.keys.right = false;
});

// Mobile buttons
leftBtn.addEventListener('pointerdown',  () => state.keys.left  = true);
leftBtn.addEventListener('pointerup',    () => state.keys.left  = false);
leftBtn.addEventListener('pointerleave', () => state.keys.left  = false);

rightBtn.addEventListener('pointerdown',  () => state.keys.right = true);
rightBtn.addEventListener('pointerup',    () => state.keys.right = false);
rightBtn.addEventListener('pointerleave', () => state.keys.right = false);

// Touch swipe on canvas
let touchStartX = null;
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  if (touchStartX === null) return;
  const dx = e.touches[0].clientX - touchStartX;
  touchStartX = e.touches[0].clientX;
  state.basket.x = Math.max(
    0,
    Math.min(canvas.width - state.basket.width, state.basket.x + dx)
  );
}, { passive: true });

canvas.addEventListener('touchend', () => { touchStartX = null; });

// Pause button
pauseBtn.addEventListener('click', () => {
  if (!state.running) return;
  state.paused ? resumeGame() : pauseGame();
});

// Overlay buttons
startBtn.addEventListener('click',    startGame);
restartBtn.addEventListener('click',  startGame);
menuBtn.addEventListener('click',     goToMenu);
resumeBtn.addEventListener('click',   resumeGame);
pauseMenuBtn.addEventListener('click',goToMenu);

/* ─────────────────────────────────────────
   RESIZE HANDLER
───────────────────────────────────────── */
window.addEventListener('resize', () => {
  resizeCanvas();
  if (state.basket) {
    state.basket.y = canvas.height - state.basket.height - 10;
  }
});

/* ─────────────────────────────────────────
   BACKGROUND FLOATING PARTICLES (decorative)
───────────────────────────────────────── */
function spawnBgParticles() {
  const container = document.getElementById('particles');
  const count     = 18;
  const colors    = ['#f9ca24','#4a90e2','#e84040','#27ae60','#9b59b6','#f0932b'];

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.className = 'particle';
    const size = 6 + Math.random() * 18;
    dot.style.width  = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.left   = `${Math.random() * 100}%`;
    dot.style.bottom = `-${size}px`;
    dot.style.background = colors[Math.floor(Math.random() * colors.length)];
    dot.style.animationDuration  = `${8 + Math.random() * 16}s`;
    dot.style.animationDelay     = `${Math.random() * 10}s`;
    container.appendChild(dot);
  }
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
(function init() {
  spawnBgParticles();
  refreshHighScoreUI();
  showScreen('start');
  resizeCanvas();

  // Initial draw — just the background gradient on canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
})();
