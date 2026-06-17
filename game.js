const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 500;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmInterval = null;
let isBgmPlaying = false;

const GRAVITY = 0.25;
const JUMP_FORCE = -10;
const MAX_FALL_SPEED = 8;
const GROUND_HEIGHT = 60;

let gameState = 'start';
let score = 0;
let lives = 3;
let cameraX = 0;
let gameTime = 0;
let cameraSpeed = 2;
const BASE_SPEED = 2;
const MAX_SPEED = 6;
const WIN_SCORE = 10000;
const MAX_HISTORY = 10;

let jumpPressed = false;
let lastJumpTime = 0;
let jumpCount = 0;
const MAX_JUMPS = 2;
const DOUBLE_JUMP_TIME = 300;

function playTone(frequency, duration, type = 'sine', volume = 0.1) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

function startBgm() {
    if (isBgmPlaying) return;
    isBgmPlaying = true;
    
    const notes = [
        { freq: 523.25, dur: 0.25 },
        { freq: 659.25, dur: 0.25 },
        { freq: 783.99, dur: 0.5 },
        { freq: 659.25, dur: 0.25 },
        { freq: 523.25, dur: 0.25 },
        { freq: 587.33, dur: 0.25 },
        { freq: 659.25, dur: 0.25 },
        { freq: 523.25, dur: 0.5 },
        { freq: 440.00, dur: 0.25 },
        { freq: 523.25, dur: 0.25 },
        { freq: 587.33, dur: 0.25 },
        { freq: 440.00, dur: 0.5 },
        { freq: 392.00, dur: 0.25 },
        { freq: 440.00, dur: 0.25 },
        { freq: 523.25, dur: 0.75 }
    ];
    
    let noteIndex = 0;
    
    function playNextNote() {
        if (!isBgmPlaying) return;
        
        const note = notes[noteIndex];
        playTone(note.freq, note.dur, 'triangle', 0.08);
        
        noteIndex = (noteIndex + 1) % notes.length;
        bgmInterval = setTimeout(playNextNote, note.dur * 1000);
    }
    
    playNextNote();
}

function stopBgm() {
    isBgmPlaying = false;
    if (bgmInterval) {
        clearTimeout(bgmInterval);
        bgmInterval = null;
    }
}

function playDeathSound() {
    playTone(150, 0.3, 'sawtooth', 0.2);
    setTimeout(() => playTone(100, 0.4, 'sawtooth', 0.15), 200);
}

function speakDeathMessage() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance('刘千迎，你中不中啊！');
        utterance.lang = 'zh-CN';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        window.speechSynthesis.speak(utterance);
    }
}

const player = {
    x: 200,
    y: canvas.height - GROUND_HEIGHT - 50,
    width: 50,
    height: 45,
    velocityY: 0,
    isJumping: false,
    wingFlapAngle: 0
};

let obstacles = [];
let coins = [];
let particles = [];
let clouds = [];
let gameMessage = '';
let messageOpacity = 0;
let historyScores = [];

function loadHistory() {
    try {
        const saved = localStorage.getItem('gameHistory');
        if (saved) {
            historyScores = JSON.parse(saved);
        }
    } catch (e) {
        historyScores = [];
    }
}

function saveScore(finalScore) {
    const record = {
        score: finalScore,
        date: new Date().toLocaleString('zh-CN')
    };
    
    historyScores.push(record);
    historyScores.sort((a, b) => b.score - a.score);
    historyScores = historyScores.slice(0, MAX_HISTORY);
    
    try {
        localStorage.setItem('gameHistory', JSON.stringify(historyScores));
    } catch (e) {
        console.error('Failed to save history');
    }
    
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    const containers = [
        { container: document.getElementById('history-container'), list: document.getElementById('history-list') },
        { container: document.getElementById('history-container-win'), list: document.getElementById('history-list-win') }
    ];
    
    containers.forEach(({ container, list }) => {
        if (!container || !list) return;
        
        if (historyScores.length === 0) {
            container.classList.add('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        list.innerHTML = '';
        
        historyScores.forEach((record, index) => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <span class="history-rank">#${index + 1}</span>
                <span class="history-score">${record.score}</span>
                <span class="history-date">${record.date}</span>
            `;
            list.appendChild(li);
        });
    });
}

function initGame() {
    player.x = 200;
    player.y = canvas.height - GROUND_HEIGHT - 50;
    player.velocityY = 0;
    player.isJumping = false;
    jumpCount = 0;
    
    cameraX = 0;
    cameraSpeed = BASE_SPEED;
    score = 0;
    lives = 3;
    gameTime = 0;
    gameMessage = '';
    messageOpacity = 0;
    
    obstacles = [];
    coins = [];
    particles = [];
    clouds = [];
    
    for (let i = 0; i < 15; i++) {
        clouds.push({
            x: Math.random() * 2500,
            y: Math.random() * 150,
            size: Math.random() * 60 + 40,
            speed: Math.random() * 0.5 + 0.2
        });
    }
    
    generateObstacles();
    generateCoins();
}

function generateObstacles() {
    let lastX = 600;
    for (let i = 0; i < 50; i++) {
        const gap = 300 + Math.random() * 200;
        const obstacleWidth = 30 + Math.random() * 20;
        const obstacleHeight = 40 + Math.random() * 60;
        
        if (Math.random() > 0.5) {
            obstacles.push({
                x: lastX,
                y: canvas.height - GROUND_HEIGHT - obstacleHeight,
                width: obstacleWidth,
                height: obstacleHeight,
                type: 'spike'
            });
        } else {
            const heightVariation = Math.random() > 0.5 ? 80 : 120;
            obstacles.push({
                x: lastX,
                y: canvas.height - GROUND_HEIGHT - heightVariation,
                width: obstacleWidth,
                height: heightVariation,
                type: 'tree'
            });
        }
        
        lastX += gap;
    }
}

function generateCoins() {
    let lastX = 400;
    for (let i = 0; i < 100; i++) {
        coins.push({
            x: lastX,
            y: 150 + Math.random() * 150,
            collected: false,
            rotation: Math.random() * Math.PI * 2
        });
        lastX += 150 + Math.random() * 150;
    }
}

function drawPlayer() {
    ctx.save();
    ctx.translate(200 + player.width / 2, player.y + player.height / 2);
    
    const wingFlap = Math.sin(player.wingFlapAngle) * 30;
    
    // 左翅膀（大翅膀带"迎"字）
    ctx.save();
    ctx.translate(-25, -5);
    ctx.rotate(wingFlap * 0.05);
    
    // 翅膀渐变
    const leftWingGradient = ctx.createLinearGradient(-40, -30, 0, 30);
    leftWingGradient.addColorStop(0, '#FFFFFF');
    leftWingGradient.addColorStop(0.5, '#F5F5F5');
    leftWingGradient.addColorStop(1, '#E0E0E0');
    ctx.fillStyle = leftWingGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, 45, 30, wingFlap * 0.02, 0, Math.PI * 2);
    ctx.fill();
    
    // 翅膀边框
    ctx.strokeStyle = '#BDBDBD';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 翅膀羽毛纹理
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-10 - i * 10, -20 + i * 5);
        ctx.quadraticCurveTo(-20 - i * 10, 0, -10 - i * 10, 20);
        ctx.stroke();
    }
    
    // "迎"字 - 大号醒目字体
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 文字描边
    ctx.strokeStyle = '#0D47A1';
    ctx.lineWidth = 4;
    ctx.strokeText('迎', 0, 0);
    
    // 文字填充
    ctx.fillStyle = '#1565C0';
    ctx.fillText('迎', 0, 0);
    
    // 文字光晕
    ctx.shadowColor = '#2196F3';
    ctx.shadowBlur = 10;
    ctx.fillText('迎', 0, 0);
    ctx.shadowBlur = 0;
    
    ctx.restore();
    
    // 右翅膀（大翅膀带"迎"字）
    ctx.save();
    ctx.translate(25, -5);
    ctx.rotate(-wingFlap * 0.05);
    
    const rightWingGradient = ctx.createLinearGradient(0, -30, 40, 30);
    rightWingGradient.addColorStop(0, '#FFFFFF');
    rightWingGradient.addColorStop(0.5, '#F5F5F5');
    rightWingGradient.addColorStop(1, '#E0E0E0');
    ctx.fillStyle = rightWingGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, 45, 30, -wingFlap * 0.02, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#BDBDBD';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 翅膀羽毛纹理
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(10 + i * 10, -20 + i * 5);
        ctx.quadraticCurveTo(20 + i * 10, 0, 10 + i * 10, 20);
        ctx.stroke();
    }
    
    // "迎"字 - 大号醒目字体
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.strokeStyle = '#0D47A1';
    ctx.lineWidth = 4;
    ctx.strokeText('迎', 0, 0);
    
    ctx.fillStyle = '#1565C0';
    ctx.fillText('迎', 0, 0);
    
    ctx.shadowColor = '#2196F3';
    ctx.shadowBlur = 10;
    ctx.fillText('迎', 0, 0);
    ctx.shadowBlur = 0;
    
    ctx.restore();
    
    // 身体 - 渐变蓝色
    const bodyGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
    bodyGradient.addColorStop(0, '#42A5F5');
    bodyGradient.addColorStop(0.6, '#2196F3');
    bodyGradient.addColorStop(1, '#1565C0');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(0, 2, 25, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 身体边框
    ctx.strokeStyle = '#0D47A1';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 身体羽毛纹理
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8, -15);
        ctx.lineTo(i * 8, 15);
        ctx.stroke();
    }
    
    // 尾羽
    ctx.fillStyle = '#1565C0';
    ctx.beginPath();
    ctx.moveTo(-5, 15);
    ctx.quadraticCurveTo(-15, 30, -10, 40);
    ctx.quadraticCurveTo(0, 35, 5, 40);
    ctx.quadraticCurveTo(10, 30, 0, 15);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#0D47A1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // 头部
    const headGradient = ctx.createRadialGradient(0, -8, 0, 0, -8, 15);
    headGradient.addColorStop(0, '#90CAF9');
    headGradient.addColorStop(0.5, '#64B5F6');
    headGradient.addColorStop(1, '#42A5F5');
    ctx.fillStyle = headGradient;
    ctx.beginPath();
    ctx.ellipse(0, -8, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#1565C0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // 眼睛
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(-7, -10, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(7, -10, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 眼睛高光
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(-9, -12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, -12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    // 眼珠
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-6, -10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, -10, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // 腮红
    ctx.fillStyle = 'rgba(255, 138, 128, 0.6)';
    ctx.beginPath();
    ctx.ellipse(-12, -4, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, -4, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 嘴巴
    ctx.fillStyle = '#FF9800';
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(-5, 4);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#F57C00';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // 头顶羽毛
    ctx.fillStyle = '#1565C0';
    ctx.beginPath();
    ctx.moveTo(-3, -20);
    ctx.quadraticCurveTo(0, -28, 3, -20);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5, -18);
    ctx.quadraticCurveTo(-3, -24, 0, -20);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(3, -18);
    ctx.quadraticCurveTo(5, -24, 8, -18);
    ctx.fill();
    
    ctx.restore();
}

function drawObstacle(obstacle) {
    const screenX = obstacle.x - cameraX;
    
    if (screenX < -obstacle.width || screenX > canvas.width) return;
    
    if (obstacle.type === 'spike') {
        ctx.fillStyle = '#F44336';
        const spikeCount = Math.floor(obstacle.width / 15);
        for (let i = 0; i < spikeCount; i++) {
            ctx.beginPath();
            ctx.moveTo(screenX + i * 15, obstacle.y + obstacle.height);
            ctx.lineTo(screenX + i * 15 + 7.5, obstacle.y);
            ctx.lineTo(screenX + i * 15 + 15, obstacle.y + obstacle.height);
            ctx.closePath();
            ctx.fill();
        }
        
        ctx.fillStyle = '#D32F2F';
        for (let i = 0; i < spikeCount; i++) {
            ctx.beginPath();
            ctx.moveTo(screenX + i * 15, obstacle.y + obstacle.height);
            ctx.lineTo(screenX + i * 15 + 7.5, obstacle.y + 10);
            ctx.lineTo(screenX + i * 15 + 15, obstacle.y + obstacle.height);
            ctx.closePath();
            ctx.fill();
        }
    } else if (obstacle.type === 'tree') {
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(screenX + obstacle.width / 2 - 8, obstacle.y + 20, 16, obstacle.height - 20);
        
        ctx.fillStyle = '#2E7D32';
        ctx.beginPath();
        ctx.moveTo(screenX + obstacle.width / 2, obstacle.y);
        ctx.lineTo(screenX - 10, obstacle.y + 40);
        ctx.lineTo(screenX + obstacle.width + 10, obstacle.y + 40);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = '#388E3C';
        ctx.beginPath();
        ctx.moveTo(screenX + obstacle.width / 2, obstacle.y - 15);
        ctx.lineTo(screenX - 15, obstacle.y + 25);
        ctx.lineTo(screenX + obstacle.width + 15, obstacle.y + 25);
        ctx.closePath();
        ctx.fill();
    }
}

function drawCoin(coin) {
    if (coin.collected) return;
    
    const screenX = coin.x - cameraX;
    if (screenX < -30 || screenX > canvas.width + 30) return;
    
    ctx.save();
    ctx.translate(screenX, coin.y);
    ctx.rotate(coin.rotation);
    
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    gradient.addColorStop(0, '#FFEB3B');
    gradient.addColorStop(0.7, '#FFC107');
    gradient.addColorStop(1, '#FF9800');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#FF6F00';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#FF6F00';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 2);
    
    ctx.restore();
}

function drawCloud(cloud) {
    const screenX = cloud.x - cameraX * 0.3;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(screenX, cloud.y, cloud.size, 0, Math.PI * 2);
    ctx.arc(screenX + cloud.size * 0.8, cloud.y - cloud.size * 0.2, cloud.size * 0.7, 0, Math.PI * 2);
    ctx.arc(screenX + cloud.size * 1.6, cloud.y, cloud.size * 0.8, 0, Math.PI * 2);
    ctx.fill();
}

function drawParticles() {
    particles.forEach((particle, index) => {
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.alpha;
        ctx.beginPath();
        ctx.arc(particle.x - cameraX, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.alpha -= 0.02;
        particle.size *= 0.98;
        
        if (particle.alpha <= 0 || particle.size < 0.5) {
            particles.splice(index, 1);
        }
    });
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            velocityX: (Math.random() - 0.5) * 6,
            velocityY: (Math.random() - 0.5) * 6,
            size: Math.random() * 6 + 2,
            color: color,
            alpha: 1
        });
    }
}

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function updatePlayer() {
    player.wingFlapAngle += 0.15;
    
    if (jumpPressed && jumpCount < MAX_JUMPS) {
        const now = Date.now();
        if (now - lastJumpTime < DOUBLE_JUMP_TIME && jumpCount === 1) {
            player.velocityY = JUMP_FORCE * 0.9;
            jumpCount++;
            player.isJumping = true;
            createParticles(player.x + player.width / 2, player.y + player.height, '#81D4FA', 8);
        } else if (jumpCount === 0) {
            player.velocityY = JUMP_FORCE;
            jumpCount++;
            player.isJumping = true;
            createParticles(player.x + player.width / 2, player.y + player.height, '#81D4FA', 8);
        }
        lastJumpTime = now;
        jumpPressed = false;
    }
    
    player.velocityY += GRAVITY;
    if (player.velocityY > MAX_FALL_SPEED) {
        player.velocityY = MAX_FALL_SPEED;
    }
    
    player.y += player.velocityY;
    
    if (player.y + player.height >= canvas.height - GROUND_HEIGHT) {
        player.y = canvas.height - GROUND_HEIGHT - player.height;
        player.velocityY = 0;
        player.isJumping = false;
        jumpCount = 0;
    }
    
    const playerWorldX = cameraX + 200;
    const playerRect = {
        x: playerWorldX,
        y: player.y,
        width: player.width,
        height: player.height
    };
    
    obstacles.forEach(obstacle => {
        if (checkCollision(playerRect, obstacle)) {
            takeDamage();
        }
    });
    
    coins.forEach(coin => {
        if (!coin.collected && checkCollision(playerRect, { x: coin.x - 15, y: coin.y - 15, width: 30, height: 30 })) {
            coin.collected = true;
            score += 100;
            createParticles(coin.x, coin.y, '#FFEB3B', 12);
        }
    });
}

function updateGameTime() {
    gameTime += 1 / 60;
    
    cameraSpeed = BASE_SPEED + gameTime * 0.08;
    if (cameraSpeed > MAX_SPEED) {
        cameraSpeed = MAX_SPEED;
    }
    
    score += cameraSpeed * 0.5;
    
    if (score >= WIN_SCORE) {
        winGame();
    }
}

function updateCamera() {
    cameraX += cameraSpeed;
}

function updateObstacles() {
    obstacles = obstacles.filter(o => o.x > cameraX - 100);
    
    while (obstacles.length < 30) {
        const lastObstacle = obstacles[obstacles.length - 1];
        const lastX = lastObstacle ? lastObstacle.x + lastObstacle.width + 300 + Math.random() * 200 : cameraX + 2500;
        
        const obstacleWidth = 30 + Math.random() * 20;
        const obstacleHeight = 40 + Math.random() * 60;
        
        if (Math.random() > 0.5) {
            obstacles.push({
                x: lastX,
                y: canvas.height - GROUND_HEIGHT - obstacleHeight,
                width: obstacleWidth,
                height: obstacleHeight,
                type: 'spike'
            });
        } else {
            const heightVariation = Math.random() > 0.5 ? 80 : 120;
            obstacles.push({
                x: lastX,
                y: canvas.height - GROUND_HEIGHT - heightVariation,
                width: obstacleWidth,
                height: heightVariation,
                type: 'tree'
            });
        }
    }
}

function updateCoins() {
    coins.forEach(coin => {
        coin.rotation += 0.03;
    });
    
    coins = coins.filter(c => c.x > cameraX - 100);
    
    while (coins.length < 50) {
        const lastCoin = coins[coins.length - 1];
        const lastX = lastCoin ? lastCoin.x + 150 + Math.random() * 150 : cameraX + 2000;
        
        coins.push({
            x: lastX,
            y: 150 + Math.random() * 150,
            collected: false,
            rotation: Math.random() * Math.PI * 2
        });
    }
}

function updateClouds() {
    clouds.forEach(cloud => {
        cloud.x -= cloud.speed;
        if (cloud.x < cameraX - 200) {
            cloud.x = cameraX + canvas.width + 100 + Math.random() * 200;
            cloud.y = Math.random() * 150;
        }
    });
}

function takeDamage() {
    lives--;
    createParticles(player.x + player.width / 2, player.y + player.height / 2, '#F44336', 20);
    
    if (lives <= 0) {
        gameOver();
    } else {
        gameMessage = '迎迎不要放弃！嘟嘟为你加油';
        messageOpacity = 1;
        player.y = canvas.height - GROUND_HEIGHT - 100;
        player.velocityY = 0;
        jumpCount = 0;
    }
}

function gameOver() {
    gameState = 'gameover';
    stopBgm();
    playDeathSound();
    speakDeathMessage();
    saveScore(Math.floor(score));
    document.getElementById('final-score').textContent = Math.floor(score);
    document.getElementById('game-over-screen').classList.remove('hidden');
}

function winGame() {
    gameState = 'win';
    gameMessage = '迎迎nb！！！';
    messageOpacity = 1;
    saveScore(Math.floor(score));
    document.getElementById('win-score').textContent = Math.floor(score);
    document.getElementById('win-screen').classList.remove('hidden');
}

function draw() {
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    clouds.forEach(cloud => drawCloud(cloud));
    
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);
    
    ctx.fillStyle = '#66BB6A';
    ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, 8);
    
    obstacles.forEach(obstacle => drawObstacle(obstacle));
    
    coins.forEach(coin => drawCoin(coin));
    
    drawPlayer();
    
    drawParticles();
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('终点 →', cameraX + 3000 - cameraX, canvas.height - GROUND_HEIGHT - 50);
    
    if (messageOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = messageOpacity;
        ctx.fillStyle = '#FF5722';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 15;
        ctx.fillText(gameMessage, canvas.width / 2, canvas.height / 2 - 50);
        ctx.restore();
    }
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(10, 10, 200, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('玩家: 迎迎', 20, 35);
    ctx.fillText('得分: ' + Math.floor(score), 20, 60);
    ctx.fillText('生命: ' + '❤️'.repeat(lives), 20, 85);
    
    const speedPercent = Math.floor((cameraSpeed / MAX_SPEED) * 100);
    ctx.fillText('速度: ' + speedPercent + '%', 120, 60);
}

function gameLoop() {
    if (gameState === 'playing') {
        updatePlayer();
        updateCamera();
        updateObstacles();
        updateCoins();
        updateClouds();
        updateGameTime();
    }
    
    draw();
    
    requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        jumpPressed = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
    }
});

document.addEventListener('touchstart', (e) => {
    if (e.target === canvas) {
        e.preventDefault();
        jumpPressed = true;
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    if (e.target === canvas) {
        e.preventDefault();
    }
}, { passive: false });

function startGame() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    initGame();
    gameState = 'playing';
    document.getElementById('start-screen').classList.add('hidden');
    startBgm();
}

function restartGame() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    initGame();
    gameState = 'playing';
    document.getElementById('game-over-screen').classList.add('hidden');
    startBgm();
}

function winRestartGame() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    initGame();
    gameState = 'playing';
    document.getElementById('win-screen').classList.add('hidden');
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-start').addEventListener('touchstart', (e) => {
    e.preventDefault();
    startGame();
});

document.getElementById('btn-restart').addEventListener('click', restartGame);
document.getElementById('btn-restart').addEventListener('touchstart', (e) => {
    e.preventDefault();
    restartGame();
});

document.getElementById('btn-win-restart').addEventListener('click', winRestartGame);
document.getElementById('btn-win-restart').addEventListener('touchstart', (e) => {
    e.preventDefault();
    winRestartGame();
});

function canvasInteraction() {
    if (gameState === 'start') {
        startGame();
    } else if (gameState === 'gameover') {
        restartGame();
    } else if (gameState === 'win') {
        winRestartGame();
    }
}

canvas.addEventListener('click', canvasInteraction);
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    canvasInteraction();
});

loadHistory();
initGame();
gameLoop();

function resizeCanvas() {
    const maxWidth = Math.min(window.innerWidth - 20, 800);
    const maxHeight = Math.min(window.innerHeight - 20, 500);
    canvas.width = maxWidth;
    canvas.height = maxHeight;
    initGame();
}

window.addEventListener('resize', resizeCanvas);
