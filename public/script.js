const socket = io();

// DOM элементы
const searchScreen = document.getElementById('search-screen');
const gameScreen = document.getElementById('game-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const findBtn = document.getElementById('find-btn');
const waitingMsg = document.getElementById('waiting-message');
const playAgainBtn = document.getElementById('play-again-btn');

const roundSpan = document.getElementById('round-number');
const timerSpan = document.getElementById('timer');
const resultMsgDiv = document.getElementById('result-message');
const movesPanel = document.getElementById('moves-panel');
const arenaDiv = document.getElementById('arena');

const player1Name = document.getElementById('player1-name');
const player2Name = document.getElementById('player2-name');
const player1ScoreSpan = document.getElementById('player1-score');
const player2ScoreSpan = document.getElementById('player2-score');
const player1AvatarDiv = document.getElementById('player1-avatar');
const player2AvatarDiv = document.getElementById('player2-avatar');

const fighter1Img = document.getElementById('fighter1-img');
const fighter2Img = document.getElementById('fighter2-img');
const fighter1NameSpan = document.getElementById('fighter1-name');
const fighter2NameSpan = document.getElementById('fighter2-name');

const moveBtns = document.querySelectorAll('.move-btn');

// Состояния
let currentRoomId = null;
let myPlayerIndex = null;
let opponentIndex = null;
let roundTimeLimit = 15;
let roundTimerInterval = null;
let myMoveDone = false;
let waitingForAnimation = false;    // идёт анимация/ожидание перед анимацией
let pendingRoundData = null;        // данные roundResult, если пришли во время анимации

// --- Вспомогательные функции ---
function startClientTimer(seconds) {
    if (roundTimerInterval) clearInterval(roundTimerInterval);
    let remaining = seconds;
    timerSpan.innerText = remaining;
    roundTimerInterval = setInterval(() => {
        remaining--;
        timerSpan.innerText = remaining >= 0 ? remaining : 0;
        if (remaining <= 0) clearInterval(roundTimerInterval);
    }, 1000);
}

function stopClientTimer() {
    if (roundTimerInterval) clearInterval(roundTimerInterval);
}

// Анимация подъёма руки с заданными таймингами
function animateArm(playerElement, direction, onComplete) {
    // direction: 'left' (левый игрок) или 'right' (правый)
    const isLeft = direction === 'left';
    // Параметры движения: подъём на 100px вверх и 20px вбок
    const upY = -100;
    const sideX = isLeft ? -20 : 20;
    
    // Функция для выполнения одного подъёма-возврата
    function doRaise(callback) {
        // Подъём за 0.25с
        playerElement.style.transition = 'transform 0.25s ease-out';
        playerElement.style.transform = `translate(${sideX}px, ${upY}px)`;
        setTimeout(() => {
            // Возврат за 0.25с
            playerElement.style.transition = 'transform 0.25s ease-in';
            playerElement.style.transform = 'translate(0, 0)';
            setTimeout(callback, 250);
        }, 250);
    }
    
    // Первый подъём + пауза 0.5с
    doRaise(() => {
        setTimeout(() => {
            // Второй подъём + пауза 0.5с
            doRaise(() => {
                setTimeout(() => {
                    // Третий подъём без паузы в конце (сразу завершаем)
                    doRaise(() => {
                        // Анимация закончена
                        if (onComplete) onComplete();
                    });
                }, 500);
            });
        }, 500);
    });
}

// Запуск полной анимации для обоих игроков
function startFullAnimation(myMove, oppMove, onFinished) {
    // Скрываем панель выбора, показываем арену
    movesPanel.style.display = 'none';
    arenaDiv.style.display = 'flex';
    // Сбрасываем картинки на кулак
    fighter1Img.style.backgroundImage = "url('/images/fist.svg')";
    fighter2Img.style.backgroundImage = "url('/images/fist.svg')";
    fighter1Img.style.transform = ''; // сброс
    fighter2Img.style.transform = '';
    
    // Имена в арене
    fighter1NameSpan.innerText = player1Name.innerText;
    fighter2NameSpan.innerText = player2Name.innerText;
    
    // Пауза 2 секунды перед началом движений
    setTimeout(() => {
        // Запускаем анимацию для левого и правого одновременно
        let finishedCount = 0;
        function oneFinished() {
            finishedCount++;
            if (finishedCount === 2) {
                // Оба закончили – показываем выбранные фигуры
                fighter1Img.style.backgroundImage = `url('/images/${myMove}.svg')`;
                fighter2Img.style.backgroundImage = `url('/images/${oppMove}.svg')`;
                // Небольшая задержка для появления
                setTimeout(() => {
                    if (onFinished) onFinished();
                }, 200);
            }
        }
        animateArm(fighter1Img, 'left', oneFinished);
        animateArm(fighter2Img, 'right', oneFinished);
    }, 2000); // 2 секунды ожидания
}

// Показ результата раунда после анимации
function resolveRound(data) {
    // Обновляем счёт
    player1ScoreSpan.innerText = data.scores[0];
    player2ScoreSpan.innerText = data.scores[1];
    
    let winnerIdx = null;
    if (data.winner === 'player1') winnerIdx = 0;
    else if (data.winner === 'player2') winnerIdx = 1;
    
    if (winnerIdx !== null) {
        // Конфетти для победителя
        if (winnerIdx === myPlayerIndex) {
            canvasConfetti({ particleCount: 180, spread: 80, origin: { y: 0.6 } });
            resultMsgDiv.innerText = '🎉 Вы выиграли раунд! 🎉';
        } else {
            canvasConfetti({ particleCount: 100, spread: 60, origin: { y: 0.3 }, colors: ['#ff5555'] });
            resultMsgDiv.innerText = '😞 Соперник выиграл раунд...';
        }
    } else {
        resultMsgDiv.innerText = '🤝 Ничья!';
    }
    
    // Через 3 секунды готовим следующий раунд (или окончание игры)
    setTimeout(() => {
        waitingForAnimation = false;
        myMoveDone = false;
        if (pendingRoundData === null) {
            // Возвращаем панель выбора, если игра не закончена
            movesPanel.style.display = 'flex';
            arenaDiv.style.display = 'none';
        }
    }, 3000);
}

// --- События сокета ---
socket.on('waiting', () => {
    waitingMsg.style.display = 'block';
    findBtn.disabled = true;
});

socket.on('gameStart', async (data) => {
    currentRoomId = data.roomId;
    myPlayerIndex = data.playerIndex;
    opponentIndex = myPlayerIndex === 0 ? 1 : 0;
    roundTimeLimit = data.timeLimit;
    
    await sendMyInfo();
    
    searchScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    gameoverScreen.style.display = 'none';
    
    roundSpan.innerText = '1';
    player1ScoreSpan.innerText = '0';
    player2ScoreSpan.innerText = '0';
    startClientTimer(roundTimeLimit);
    
    myMoveDone = false;
    waitingForAnimation = false;
    pendingRoundData = null;
    moveBtns.forEach(btn => {
        btn.classList.remove('disabled-btn');
        btn.disabled = false;
    });
    movesPanel.style.display = 'flex';
    arenaDiv.style.display = 'none';
    resultMsgDiv.innerText = 'Сделайте ход!';
});

socket.on('opponentInfo', ({ name, avatar }) => {
    if (opponentIndex === 1) {
        player2Name.innerText = name;
        player2AvatarDiv.style.backgroundImage = `url(${avatar})`;
    } else {
        player1Name.innerText = name;
        player1AvatarDiv.style.backgroundImage = `url(${avatar})`;
    }
});

socket.on('opponentMadeMove', () => {
    resultMsgDiv.innerText = 'Соперник сделал ход, ожидаем...';
});

socket.on('autoMove', ({ move }) => {
    if (!myMoveDone && !waitingForAnimation) {
        myMoveDone = true;
        moveBtns.forEach(btn => btn.disabled = true);
        resultMsgDiv.innerText = `⏰ Автовыбор: ${move}`;
    }
});

socket.on('roundResult', (data) => {
    stopClientTimer();
    if (waitingForAnimation) {
        // Уже идёт анимация – сохраняем данные на потом (не должно случиться, но на всякий случай)
        pendingRoundData = data;
        return;
    }
    waitingForAnimation = true;
    myMoveDone = true;
    moveBtns.forEach(btn => btn.disabled = true);
    
    const myMove = data.moves[myPlayerIndex];
    const oppMove = data.moves[opponentIndex];
    
    // Запускаем анимацию
    startFullAnimation(myMove, oppMove, () => {
        resolveRound(data);
        // Если за время анимации пришёл ещё один roundResult (очень редко) – обработаем
        if (pendingRoundData) {
            const nextData = pendingRoundData;
            pendingRoundData = null;
            // Не запускаем анимацию повторно, просто обновляем результат (но по логике такого быть не должно)
            resolveRound(nextData);
        }
    });
});

socket.on('newRound', (data) => {
    // Возвращаем панель выбора, если игра не в процессе анимации
    if (!waitingForAnimation) {
        movesPanel.style.display = 'flex';
        arenaDiv.style.display = 'none';
    }
    roundSpan.innerText = data.round;
    roundTimeLimit = data.timeLimit;
    startClientTimer(roundTimeLimit);
    myMoveDone = false;
    waitingForAnimation = false;
    moveBtns.forEach(btn => btn.disabled = false);
    resultMsgDiv.innerText = 'Раунд начался! Выберите фигуру.';
});

socket.on('gameOver', (data) => {
    stopClientTimer();
    moveBtns.forEach(btn => btn.disabled = true);
    let text = '';
    if (data.isDraw) {
        text = '🤝 Ничья после 10 ничьих';
    } else {
        const iWon = (data.winnerId === socket.id);
        text = iWon ? '🏆 ПОБЕДА! 🏆' : '💔 Поражение...';
        if (iWon) canvasConfetti({ particleCount: 300, spread: 100, origin: { y: 0.5 } });
    }
    document.getElementById('gameover-text').innerText = text;
    gameScreen.style.display = 'none';
    gameoverScreen.style.display = 'block';
});

socket.on('opponentDisconnected', () => {
    alert('Соперник покинул игру');
    location.reload();
});

// --- Отправка хода ---
function makeMove(move) {
    if (myMoveDone || waitingForAnimation) return;
    myMoveDone = true;
    moveBtns.forEach(btn => btn.disabled = true);
    socket.emit('makeMove', { roomId: currentRoomId, move });
    resultMsgDiv.innerText = 'Ход сделан, ждём соперника...';
}

// --- Получение профиля (заглушка или Яндекс) ---
async function sendMyInfo() {
    try {
        let name = 'Игрок', avatar = '';
        if (typeof YaGames !== 'undefined' && YaGames.getPlayer) {
            const player = await YaGames.getPlayer();
            name = await player.getName();
            avatar = await player.getAvatarSrc();
        } else {
            name = `Игрок${Math.floor(Math.random()*1000)}`;
            avatar = 'https://via.placeholder.com/100';
        }
        socket.emit('playerInfo', { name, avatar });
        player1Name.innerText = name;
        player1AvatarDiv.style.backgroundImage = `url(${avatar})`;
    } catch(e) { console.warn(e); }
}

// --- Привязка событий ---
moveBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const move = btn.getAttribute('data-move');
        makeMove(move);
    });
});

findBtn.addEventListener('click', () => {
    socket.emit('findOpponent');
    findBtn.disabled = true;
    findBtn.innerText = 'Поиск...';
});

playAgainBtn.addEventListener('click', () => {
    location.reload();
});