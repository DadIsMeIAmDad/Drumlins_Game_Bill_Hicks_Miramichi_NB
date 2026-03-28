// Drums In Space - HTML5 Canvas version

let crawlMusicStarted = false;
// --- CANVAS SETUP ---
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
function spawnDrum(x, y) {
  const drum = {
    x,
    y,
    vx: (Math.random() - 0.5) * 10, // random horizontal push
    vy: (Math.random() - 0.5) * 10, // random vertical push
    radius: 40,
    rotation: 0,
    rotationSpeed: (Math.random() - 0.5) * 0.2
  };

  drums.push(drum);
}
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

let SCREEN_WIDTH = canvas.width;
let SCREEN_HEIGHT = canvas.height;

// --- SETTINGS ---
const MAX_DRUMS = 15;
const BG_ANIM_SPEED = 200; // ms

// --- TIME ---
let lastTimestamp = 0;

// --- AUDIO ---
const introMusic = document.getElementById("introMusic");
let loopTracks = [];
let currentLoop = null;
let isMuted = false;
let softSounds = [];
let hardSounds = [];
let lastCollisionSoundTime = 0;
const collisionSoundCooldown = 120; // ms
let drumScaleMultiplier = 1;
// Helper to load audio as HTMLAudioElement
function loadAudio(src) {
  const a = new Audio(src);
  a.preload = "auto";
  return a;
}

// You can manually list your loop tracks and effects here,
// or generate them dynamically if you want to fetch directory listings from a server.
function initAudio() {
  // Example: adjust filenames to match your real files
  loopTracks = [
    "music/loops/loop1.mp3",
    "music/loops/loop2.mp3",
    "music/loops/loop3.mp3",
    "music/loops/loop4.mp3",
    "music/loops/loop5.mp3",
    "music/loops/loop6.mp3"
  ].map(loadAudio);

  softSounds = [
    "effects/soft/soft1.mp3",
    "effects/soft/soft2.mp3",
    "effects/soft/soft3.mp3",
    "effects/soft/soft4.mp3",
    "effects/soft/soft5.mp3"
  ].map(loadAudio);

  hardSounds = [
    "effects/hard/hard1.mp3",
    "effects/hard/hard2.mp3"
  ].map(loadAudio);
}
// Toggle mute
window.toggleMusic = function () {
  isMuted = !isMuted;

  if (currentLoop) currentLoop.muted = isMuted;
  if (introMusic) introMusic.muted = isMuted;

  return isMuted; // lets UI know state
};

// Next track
window.changeSong = function () {
  playRandomLoopTrack();
};
function playRandomLoopTrack() {
  if (!loopTracks.length) return;

  const idx = Math.floor(Math.random() * loopTracks.length);

  // Stop all tracks
  loopTracks.forEach(a => {
    a.pause();
    a.currentTime = 0;
    a.muted = isMuted;
  });

  currentLoop = loopTracks[idx];
  currentLoop.loop = true;
  currentLoop.muted = isMuted;
  currentLoop.play();
}

function playWithPitch(audioArray, isSoft) {
  if (!audioArray.length) return;
  const now = performance.now();
  if (now - lastCollisionSoundTime < collisionSoundCooldown) return;
  lastCollisionSoundTime = now;

  const src = audioArray[Math.floor(Math.random() * audioArray.length)];
  // For simple version, just clone and play; pitch shifting would require Web Audio API.
  const a = src.cloneNode();
  // Slight volume variation to mimic pitch/energy
  const vol = isSoft ? 0.4 + Math.random() * 0.3 : 0.6 + Math.random() * 0.4;
  a.volume = Math.min(1, vol);
  a.play();
}

function playSoftHit() {
  playWithPitch(softSounds, true);
}

function playHardHit() {
  playWithPitch(hardSounds, false);
}

// --- IMAGE LOADING ---
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// You can keep the same folder structure: background/*.png, drums/*.png, skip_button.png
// Here we manually list them; you can expand as needed.
// Load background/1.png through background/121.png
const backgroundSources = Array.from({ length: 40 }, (_, i) => `background/${i + 1}.png`);


const drumSources = [
  "drums/1.png",
  "drums/2.png",
  "drums/3.png",
  "drums/4.png",
  "drums/5.png",
  "drums/6.png",
  "drums/7.png",
  "drums/8.png",
  "drums/9.png",
  "drums/10.png",
  "drums/11.png",
  "drums/12.png",
  "drums/13.png",
  "drums/14.png",
  "drums/15.png",
  "drums/16.png"
];

let backgroundFrames = [];
let bgIndex = 0;
let bgTimer = 0;

let drumImages = [];
let usedDrumImages = [];

let skipButtonImg = null;
let skipRect = { x: 0, y: 0, w: 0, h: 0 };
let skipFloatTimer = 0;

// --- SAT HELPERS ---
function rotatePoint(px, py, cx, cy, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  px -= cx;
  py -= cy;
  const xnew = px * c - py * s;
  const ynew = px * s + py * c;
  return { x: xnew + cx, y: ynew + cy };
}

function getRectCorners(x, y, w, h, angleDeg) {
  const hw = w / 2;
  const hh = h / 2;
  const corners = [
    { x: x - hw, y: y - hh },
    { x: x + hw, y: y - hh },
    { x: x + hw, y: y + hh },
    { x: x - hw, y: y + hh }
  ];
  return corners.map(p => rotatePoint(p.x, p.y, x, y, angleDeg));
}

function projectPolygon(axis, points) {
  const dots = points.map(p => p.x * axis.x + p.y * axis.y);
  return { min: Math.min(...dots), max: Math.max(...dots) };
}

function overlap1D(aMin, aMax, bMin, bMax) {
  return !(aMax < bMin || bMax < aMin);
}

function satCollision(rect1, rect2) {
  const axes = [];

  function addAxes(rect) {
    for (let i = 0; i < 4; i++) {
      const p1 = rect[i];
      const p2 = rect[(i + 1) % 4];
      const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
      const axis = { x: -edge.y, y: edge.x };
      const length = Math.hypot(axis.x, axis.y);
      if (length !== 0) {
        axis.x /= length;
        axis.y /= length;
      }
      axes.push(axis);
    }
  }

  addAxes(rect1);
  addAxes(rect2);

  for (const axis of axes) {
    const r1 = projectPolygon(axis, rect1);
    const r2 = projectPolygon(axis, rect2);
    if (!overlap1D(r1.min, r1.max, r2.min, r2.max)) {
      return false;
    }
  }
  return true;
}

// --- DRUM CLASS ---
class Drum {
  constructor(image) {
    this.originalImage = image;

    // Scale
    this.baseScale = 0.3 + Math.random() * 0.2;

const scale = this.baseScale * drumScaleMultiplier;

this.width = image.width * scale;
this.height = image.height * scale;

    // Side spawn
    const side = Math.random() < 0.5 ? "left" : "right";
    if (side === "left") {
      this.x = -this.width;
      this.vx = 0.2 + Math.random() * 0.5;
    } else {
      this.x = SCREEN_WIDTH + this.width;
      this.vx = -(0.2 + Math.random() * 0.5);
    }

    this.y = Math.random() * SCREEN_HEIGHT;
    this.vy = (Math.random() - 0.5) * 0.4;
    this.angle = 0;
    this.spin = (Math.random() - 0.5) * 0.4;

    const depth = 0.6 + Math.random() * 0.6;
    this.vx *= depth;
    this.vy *= depth;
    this.spin *= depth;

    this.dragging = false;
    this.offsetX = 0;
    this.offsetY = 0;

    // Hitbox (approximate, with padding)
    const padding = 10;
this.hitWidth = this.width * 0.8;
this.hitHeight = this.height * 0.8;
  }

  getRotatedHitbox() {
    return getRectCorners(this.x, this.y, this.hitWidth, this.hitHeight, this.angle);
  }

  getRect() {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      w: this.width,
      h: this.height
    };
  }

  containsPoint(px, py) {
    const r = this.getRect();
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  update(dt) {
    if (!this.dragging) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.angle += this.spin * dt;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle * Math.PI / 180);
    ctx.drawImage(
      this.originalImage,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height
    );
    ctx.restore();
  }

  isOffScreen() {
    return (
      this.x < -200 ||
      this.x > SCREEN_WIDTH + 200 ||
      this.y < -200 ||
      this.y > SCREEN_HEIGHT + 200
    );
  }
}

// --- DRUM MANAGEMENT ---
let drums = [];

function spawnDrum() {
  if (drums.length >= MAX_DRUMS) return;
  let available = drumImages.filter(img => !usedDrumImages.includes(img));
  if (!available.length) {
    usedDrumImages = [];
    available = drumImages.slice();
  }
  const chosen = available[Math.floor(Math.random() * available.length)];
  usedDrumImages.push(chosen);
  drums.push(new Drum(chosen));
}

// --- TEXT CRAWL ---
class TextCrawl {
  constructor(lines, screenWidth, screenHeight, maxFont = 40, minFont = 0, color = "#FFFFFF", speed = 0.0005) {
    this.lines = lines;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.maxFont = maxFont;
    this.minFont = minFont;
    this.color = color;
    this.speed = speed;

    this.lineStates = [];
    let y = screenHeight;
    const spacing = 10;
    for (const line of lines) {
      this.lineStates.push({ text: line, y });
      y += maxFont + spacing;
    }
  }

  update(dt) {
    for (const line of this.lineStates) {
      line.y -= this.speed * dt;
    }
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
// --- BACKGROUND PANEL ---
const padding = 20;
const panelWidth = this.screenWidth * 2;

// Find visible lines to calculate panel height
let topY = Infinity;
let bottomY = -Infinity;

for (const line of this.lineStates) {
  const y = line.y;
  if (y < -this.maxFont || y > this.screenHeight) continue;

  topY = 0
  bottomY = Math.max(bottomY, y + this.maxFont);
  bottomY = bottomY * 8
}

if (topY !== Infinity) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // ?? semi-transparent
  ctx.fillRect(
    this.screenWidth / 2 - panelWidth / 2,
    topY - padding,
    panelWidth,
    (bottomY - topY) + padding * 12
  );
}

// Reset text color after drawing background
ctx.fillStyle = this.color;
    for (const line of this.lineStates) {
      const y = line.y;
      if (y < -this.maxFont) continue;

      const fontSize = Math.max(this.minFont, Math.floor(this.maxFont * (y / this.screenHeight)));
      if (fontSize <= 0) continue;

      ctx.font = `bold ${fontSize}px Arial`;
      ctx.fillText(line.text, this.screenWidth / 2, y);
    }
  }

  isFinished() {
    return this.lineStates.every(line => line.y + 10 < 0);
  }
}

const crawlLines = [
  "A long time ago...",
  "in the quiet hills beyond Miramichi, New Brunswick...",
  "",
  "Across the landscape, the DRUMLINS rise-",
  "ancient, silent, and perfectly shaped.",
  "Formed by forces long forgotten,",
  "they stand as the last remnants",
  "of a world that once moved with purpose.",
    "",
  "But the DRUMLINS were never meant",
  "to remain.",
  "As the planet shifts and time moves on,",
  "a hidden force awakens within them-",
  "lifting them slowly from the earth.",
    "",
  "One by one...",
  "they break free.",
  "Drifting beyond the sky...",
  "past the clouds...",
  "into the vast unknown of space.",
    "",
  "Now, scattered among the stars,",
  "the DRUMLINS continue their journey-",
  "carrying with them the secrets of their origin",
  "and the power of what lies beneath.",
  "What they will become...",
  "no one yet understands.",
  "",  
  "",  
  "May the RUST be with you!"
];

let textCrawl = null;
let textCrawlActive = true;
let introPlaying = true;

// --- DRAGGING STATE ---
let dragTarget = null;
let dragStartPos = null;
let dragStartTime = null;

// --- COLLISION HANDLING ---
function handleCollisions() {
  const bounce = 1.1;

  for (let i = 0; i < drums.length; i++) {
    for (let j = i + 1; j < drums.length; j++) {
      const a = drums[i];
      const b = drums[j];

      const rectA = a.getRotatedHitbox();
      const rectB = b.getRotatedHitbox();

      if (satCollision(rectA, rectB)) {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist === 0) {
          dx = 1;
          dy = 0;
          dist = 1;
        }

        const nx = dx / dist;
        const ny = dy / dist;

        const push = 5;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;

        const avx = a.vx;
        const avy = a.vy;
        a.vx = b.vx * bounce;
        a.vy = b.vy * bounce;
        b.vx = avx * bounce;
        b.vy = avy * bounce;

        const impactForce = Math.abs(a.vx - b.vx) + Math.abs(a.vy - b.vy);
        const spinAmount = impactForce * 0.05;
        a.spin += (Math.random() * 2 - 1) * spinAmount;
        b.spin += (Math.random() * 2 - 1) * spinAmount;

        if (impactForce < 5) {
          playSoftHit();
        } else {
          playHardHit();
        }
      }
    }
  }
}

// --- INPUT HANDLERS ---
function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / rect.width),
    y: (evt.clientY - rect.top) * (canvas.height / rect.height)
  };
}

canvas.addEventListener("pointerdown", (evt) => {
  const { x, y } = getMousePos(evt);

  if (textCrawlActive) {
    // Skip button
    if (
      x >= skipRect.x &&
      x <= skipRect.x + skipRect.w &&
      y >= skipRect.y &&
      y <= skipRect.y + skipRect.h
    ) {
      textCrawlActive = false;
      introMusic.pause();
      introPlaying = false;
      playRandomLoopTrack();
    }
    return;
  }

  // Dragging drums
  for (let i = drums.length - 1; i >= 0; i--) {
    const drum = drums[i];
    if (drum.containsPoint(x, y)) {
      dragTarget = drum;
      drum.dragging = true;
      drum.vx = 0;
      drum.vy = 0;
      drum.offsetX = drum.x - x;
      drum.offsetY = drum.y - y;
      dragStartPos = { x, y };
      dragStartTime = performance.now();
      break;
    }
  }
});
canvas.addEventListener("pointermove", (evt) => {
  const { x, y } = getpointerPos(evt);

  // ?? Skip button hover detection
  if (
    textCrawlActive &&
    x >= skipRect.x &&
    x <= skipRect.x + skipRect.w &&
    y >= skipRect.y &&
    y <= skipRect.y + skipRect.h
  ) {
    canvas.style.cursor = "pointer"; // ?? finger cursor
  } else {
    canvas.style.cursor = "default";
  }

  // Existing drag logic
  if (!dragTarget || !dragTarget.dragging) return;

  dragTarget.x = x + dragTarget.offsetX;
  dragTarget.y = y + dragTarget.offsetY;
});
canvas.addEventListener("pointermove", (evt) => {
  if (!dragTarget || !dragTarget.dragging) return;
  const { x, y } = getMousePos(evt);
  dragTarget.x = x + dragTarget.offsetX;
  dragTarget.y = y + dragTarget.offsetY;
});

canvas.addEventListener("pointerup", (evt) => {
  if (!dragTarget) return;
  const { x, y } = getMousePos(evt);
  const endPos = { x, y };
  const endTime = performance.now();

  const dx = endPos.x - dragStartPos.x;
  const dy = endPos.y - dragStartPos.y;
  let dragTime = (endTime - dragStartTime) / 1000.0;
  if (dragTime === 0) dragTime = 0.001;

  let vx = dx / dragTime;
  let vy = dy / dragTime;

  const damping = 0.005;
  vx *= damping;
  vy *= damping;

  const maxSpeed = 5;
  vx = Math.max(-maxSpeed, Math.min(maxSpeed, vx));
  vy = Math.max(-maxSpeed, Math.min(maxSpeed, vy));

  dragTarget.vx = vx;
  dragTarget.vy = vy;

  dragTarget.dragging = false;
  dragTarget = null;
  dragStartPos = null;
  dragStartTime = null;
});

// --- KEY HANDLERS (ESC to "quit" = reload, F for fullscreen toggle) ---
window.addEventListener("keydown", (evt) => {
  if (evt.key === "Escape") {
    // On web, we can't quit; simplest is to reload or ignore.
    // location.reload();
  }
  if (evt.key.toLowerCase() === "f") {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
});

// --- MAIN LOOP ---
let running = true;

function gameLoop(timestamp) {
  if (!running) return;
	const deltaMs = timestamp - lastTimestamp;
	lastTimestamp = timestamp;

  SCREEN_WIDTH = canvas.width;
  SCREEN_HEIGHT = canvas.height;

// Background animation
if (backgroundFrames.length > 1) {
  bgTimer += deltaMs;

  if (bgTimer >= BG_ANIM_SPEED) {
    bgTimer = 0;
    bgIndex = (bgIndex + 1) % backgroundFrames.length;
  }
}
const dt = deltaMs / (1000 / 60);
  // Draw background
  if (backgroundFrames.length) {
    ctx.drawImage(backgroundFrames[bgIndex], 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  } else {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  if (textCrawlActive && textCrawl) {
  if (!crawlMusicStarted) {
  crawlMusicStarted = true;

  // Change music when crawl starts
  const audio = document.getElementById("introMusic");

  audio.pause();
  audio.currentTime = 0;

  audio.src = "music/intro_music.mp3"; // ?? your new track
  audio.load();
  audio.play().catch(() => {});
}
    textCrawl.update(dt);
    textCrawl.draw(ctx);

    // Skip button float/rock
    if (skipButtonImg) {
      skipFloatTimer += dt * 0.02;
      const rockAngle = Math.sin(skipFloatTimer) * 3 * Math.PI / 180;
      const floatOffset = Math.sin(skipFloatTimer * 0.5) * 3;

      const cx = skipRect.x + skipRect.w / 2;
      const cy = skipRect.y + skipRect.h / 2 + floatOffset;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rockAngle);
      ctx.drawImage(
        skipButtonImg,
        -skipRect.w / 2,
        -skipRect.h / 2,
        skipRect.w,
        skipRect.h
      );
      ctx.restore();
    }

    if (textCrawl.isFinished()) {
      textCrawlActive = false;
	  
    }
  } else {
    // Drums
    for (const drum of drums) {
      drum.update(dt);
      drum.draw(ctx);
	  	  document.getElementById("next-song").style.display = "block"; 
      document.getElementById("sizeSlider").style.display = "block"; 
    }

    // Remove off-screen drums and respawn
    for (let i = drums.length - 1; i >= 0; i--) {
      if (drums[i].isOffScreen()) {
        const original = drums[i].originalImage;
        usedDrumImages = usedDrumImages.filter(img => img !== original);
        drums.splice(i, 1);
        spawnDrum();
      }
    }

    handleCollisions();
  }

  // Intro -> loop music switch
  if (introPlaying && introMusic.ended) {
    introPlaying = false;
    playRandomLoopTrack();
  }

  requestAnimationFrame(gameLoop);
}



// --- INIT EVERYTHING ---
async function init() {
  initAudio();

  // Start intro music (user interaction may be required in some browsers)
  introMusic.loop = false;
  introMusic.volume = 0.8;
  introMusic.play().catch(() => {
    // Some browsers block autoplay; you may need a "Click to start" overlay.
  });

  // Load images
  try {
    const bgImgs = await Promise.all(backgroundSources.map(loadImage));
    backgroundFrames = bgImgs.map(img => {
      const c = document.createElement("canvas");
      c.width = SCREEN_WIDTH;
      c.height = SCREEN_HEIGHT;
      const cctx = c.getContext("2d");
      cctx.drawImage(img, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      return c;
	  
    });
  } catch (e) {
    backgroundFrames = [];
  }

  try {
    drumImages = await Promise.all(drumSources.map(loadImage));
  } catch (e) {
    // Fallback: simple rectangle
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 60;
    const cctx = c.getContext("2d");
    cctx.fillStyle = "rgb(200,100,50)";
    cctx.fillRect(0, 0, 100, 60);
    drumImages = [c];
	
  }

  try {
    skipButtonImg = await loadImage("img/skip_button.png");
    const w = skipButtonImg.width;
    const h = skipButtonImg.height;
    skipRect.w = w;
    skipRect.h = h;
    skipRect.x = SCREEN_WIDTH - w - 20;
    skipRect.y = 10;
  } catch (e) {
    skipButtonImg = null;
  }

  // Spawn drums
  for (let i = 0; i < Math.min(MAX_DRUMS, drumImages.length); i++) {
    spawnDrum();
  }

  // Text crawl  ======================================================================================================= REAL SPEED FOR TEXT
  textCrawl = new TextCrawl(crawlLines, SCREEN_WIDTH, SCREEN_HEIGHT, 60, 0, "#FFFFFF", 0.59);

  lastTimestamp = performance.now();
  requestAnimationFrame(gameLoop);


}

function updateAllDrumSizes() {
  drums.forEach(drum => {
    const scale = drum.baseScale * drumScaleMultiplier;

    drum.width = drum.originalImage.width * scale;
    drum.height = drum.originalImage.height * scale;

    drum.hitWidth = drum.width * 0.8;
    drum.hitHeight = drum.height * 0.8;
  });
}

window.addEventListener("start-game", () => {
  const sizeSlider = document.getElementById("sizeSlider");

  if (sizeSlider) {
    sizeSlider.value = 50;
    drumScaleMultiplier = 1;
  }
});

window.addEventListener("start-game", () => {
  console.log("Game starting...");
  init();
});