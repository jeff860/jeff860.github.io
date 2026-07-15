const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('#site-nav');
const scoreEl = document.querySelector('#score');
const bestScoreEl = document.querySelector('#best-score');
const gameStateEl = document.querySelector('#game-state');
const boardStatusEl = document.querySelector('#board-status');
const canvas = document.querySelector('#game-canvas');
const boardWrap = document.querySelector('#board-wrap');
const sizeButtons = Array.from(document.querySelectorAll('[data-size]'));
const actionButtons = Array.from(document.querySelectorAll('[data-action]'));
const dpadButtons = Array.from(document.querySelectorAll('.dpad button[data-dir]'));

const ctx = canvas.getContext('2d');
const STORAGE_KEY = 'jeff860-snake-best-score';
const BOARD_SIZE = 20;
const BASE_SPEED = 180;
const FAST_MULTIPLIER = 2;
const SIZES = {
  xl: 'size-xl',
  l: 'size-l',
  m: 'size-m',
  s: 'size-s',
};

const state = {
  status: 'ready',
  snake: [],
  food: { x: 0, y: 0 },
  direction: { x: 1, y: 0 },
  queuedDirection: { x: 1, y: 0 },
  score: 0,
  bestScore: Number(localStorage.getItem(STORAGE_KEY) || 0),
  fastMode: false,
  timerId: null,
  size: 'm',
};

function setStatus(message) {
  if (boardStatusEl) {
    boardStatusEl.textContent = message;
  }
}

function renderStats() {
  if (scoreEl) scoreEl.textContent = String(state.score);
  if (bestScoreEl) bestScoreEl.textContent = String(state.bestScore);
  if (gameStateEl) {
    const labelMap = {
      ready: 'Ready',
      running: 'Running',
      paused: 'Paused',
      over: 'Game Over',
    };
    gameStateEl.textContent = labelMap[state.status] || 'Ready';
  }
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function isSamePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

function getRandomFood() {
  const occupied = new Set(state.snake.map((segment) => `${segment.x},${segment.y}`));
  let food;
  do {
    food = {
      x: Math.floor(Math.random() * BOARD_SIZE),
      y: Math.floor(Math.random() * BOARD_SIZE),
    };
  } while (occupied.has(`${food.x},${food.y}`));
  return food;
}

function resetGame() {
  state.snake = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  state.food = getRandomFood();
  state.direction = { x: 1, y: 0 };
  state.queuedDirection = { x: 1, y: 0 };
  state.score = 0;
  state.fastMode = false;
  state.status = 'ready';
  clearLoop();
  renderStats();
  setStatus('방향키, WASD, 모바일 버튼으로 시작하세요.');
  draw();
}

function clearLoop() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function currentInterval() {
  return Math.max(60, Math.round(BASE_SPEED / (state.fastMode ? FAST_MULTIPLIER : 1)));
}

function ensureLoop() {
  if (state.timerId !== null) {
    return;
  }
  state.timerId = window.setInterval(tick, currentInterval());
}

function restartLoop() {
  clearLoop();
  ensureLoop();
}

function startGame(message = '게임 시작') {
  if (state.status === 'over') {
    resetGame();
  }
  state.status = 'running';
  setStatus(message);
  renderStats();
  restartLoop();
}

function pauseGame() {
  if (state.status === 'running') {
    state.status = 'paused';
    clearLoop();
    setStatus('일시정지 상태입니다.');
    renderStats();
    return;
  }

  if (state.status === 'paused') {
    state.status = 'running';
    setStatus('게임 재개');
    renderStats();
    restartLoop();
    return;
  }

  if (state.status === 'ready') {
    startGame('게임 시작');
  }
}

function endGame() {
  state.status = 'over';
  clearLoop();
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(STORAGE_KEY, String(state.bestScore));
  }
  renderStats();
  setStatus('게임 오버. Restart 또는 Start로 다시 시작하세요.');
}

function setDirection(nextDirection) {
  if (!nextDirection) return;
  const current = state.direction;
  const isReverse = current.x + nextDirection.x === 0 && current.y + nextDirection.y === 0;
  if (state.snake.length > 1 && isReverse) {
    return;
  }
  state.queuedDirection = nextDirection;
}

function moveSnake() {
  state.direction = clonePoint(state.queuedDirection);
  const head = state.snake[0];
  const nextHead = {
    x: head.x + state.direction.x,
    y: head.y + state.direction.y,
  };

  const hitWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= BOARD_SIZE || nextHead.y >= BOARD_SIZE;
  const hitSelf = state.snake.some((segment) => isSamePoint(segment, nextHead));

  if (hitWall || hitSelf) {
    endGame();
    return;
  }

  state.snake.unshift(nextHead);

  if (isSamePoint(nextHead, state.food)) {
    state.score += 10;
    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.bestScore));
    }
    state.food = getRandomFood();
    setStatus(state.fastMode ? '정상 속도보다 빠르게 이동 중입니다.' : '먹이를 먹었습니다!');
  } else {
    state.snake.pop();
  }

  renderStats();
}

function tick() {
  if (state.status !== 'running') {
    return;
  }
  moveSnake();
  draw();
  if (state.status === 'running') {
    restartLoop();
  }
}

function drawCell(x, y, fillStyle, glow = false) {
  const cellSize = canvas.width / BOARD_SIZE;
  ctx.fillStyle = fillStyle;
  ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
  if (glow) {
    ctx.strokeStyle = 'rgba(117, 255, 154, 0.35)';
    ctx.strokeRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
  }
}

function drawGrid() {
  const cellSize = canvas.width / BOARD_SIZE;
  ctx.strokeStyle = 'rgba(117, 255, 154, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= BOARD_SIZE; i += 1) {
    const pos = i * cellSize;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(canvas.width, pos);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGradient.addColorStop(0, '#07100a');
  bgGradient.addColorStop(1, '#030603');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();

  state.snake.forEach((segment, index) => {
    const head = index === 0;
    drawCell(segment.x, segment.y, head ? '#b8ffd0' : '#3eb86f', head);
  });

  drawCell(state.food.x, state.food.y, '#7aff68', true);

  if (state.status === 'paused') {
    overlayText('PAUSED');
  } else if (state.status === 'ready') {
    overlayText('READY');
  } else if (state.status === 'over') {
    overlayText('GAME OVER');
  }
}

function overlayText(text) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#dafbe3';
  ctx.font = 'bold 42px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

function setSize(size) {
  state.size = size;
  if (boardWrap) {
    boardWrap.className = `game-board-wrap ${SIZES[size]}`;
  }
  sizeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.size === size);
  });
}

function directionFromKey(key) {
  const map = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    W: { x: 0, y: -1 },
    a: { x: -1, y: 0 },
    A: { x: -1, y: 0 },
    s: { x: 0, y: 1 },
    S: { x: 0, y: 1 },
    d: { x: 1, y: 0 },
    D: { x: 1, y: 0 },
  };
  return map[key] || null;
}

function handleMove(direction, speedBoost = false) {
  if (state.status === 'ready') {
    startGame('게임 시작');
  } else if (state.status === 'paused') {
    state.status = 'running';
    renderStats();
    restartLoop();
  } else if (state.status === 'over') {
    resetGame();
    startGame('게임 재시작');
  }

  state.fastMode = Boolean(speedBoost);
  if (state.timerId !== null) {
    restartLoop();
  }
  setDirection(direction);
  if (state.status === 'running') {
    setStatus(state.fastMode ? '빠른 이동 모드' : '이동 중');
  }
}

function handleKeyDown(event) {
  const direction = directionFromKey(event.key);
  if (direction) {
    event.preventDefault();
    handleMove(direction, event.shiftKey);
    return;
  }

  if (event.key === 'Shift') {
    state.fastMode = true;
    if (state.status === 'running') {
      restartLoop();
      setStatus('빠른 이동 모드');
    }
  }

  if (event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    pauseGame();
  }
}

function handleKeyUp(event) {
  if (event.key === 'Shift') {
    state.fastMode = false;
    if (state.status === 'running') {
      restartLoop();
      setStatus('게임 진행 중');
    }
  }
}

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.dataset.open === 'true';
    siteNav.dataset.open = String(!isOpen);
    navToggle.setAttribute('aria-expanded', String(!isOpen));
  });

  siteNav.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement && window.matchMedia('(max-width: 860px)').matches) {
      siteNav.dataset.open = 'false';
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

sizeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setSize(button.dataset.size || 'm');
  });
});

actionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'start') {
      startGame('게임 시작');
    } else if (action === 'pause') {
      pauseGame();
    } else if (action === 'restart') {
      resetGame();
      startGame('게임 재시작');
    } else if (action === 'toggle') {
      pauseGame();
    }
  });
});

dpadButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const direction = directionFromKey(
      button.dataset.dir === 'up' ? 'ArrowUp'
        : button.dataset.dir === 'down' ? 'ArrowDown'
        : button.dataset.dir === 'left' ? 'ArrowLeft'
        : 'ArrowRight',
    );
    if (direction) {
      handleMove(direction, false);
    }
  });
});

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('blur', () => {
  if (state.status === 'running') {
    pauseGame();
  }
});

window.addEventListener('resize', draw);

resetGame();
renderStats();
setSize('m');
draw();
