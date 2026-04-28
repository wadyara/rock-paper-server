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
let myPlayerIndex = null;       // 0 или 1
let opponentIndex = null;
let roundTimeLimit = 15;
let roundTimerInterval = null;
let myMoveDone = false;
let waitingForRoundResult = false;   // чтобы не кликать во время анимации

// --- Вспомогательные функции ---
function startClientTimer(seconds) {
    if (roundTimerInterval) clearInterval(roundTimerInterval);
    let remaining = seconds;
    timerSpan.innerText = remaining;
    roundTimerInterval = setInterval(() => {
        remaining--;
        timerSpan.innerText = remaining >= 0 ? remaining : 0;
        if (remaining <= 0) {
            clearInterval(roundTimerInterval);
            roundTimerInterval = null;
        }
    }, 1000);
}

function stopClientTimer() {
    if (roundTimerInterval) {
        clearInterval(roundTimerInterval);
        roundTimerInterval = null;
    }
}

// Показываем арену, прячем кнопки
function showArenaAndHideMoves() {
    movesPanel.style.display = 'none';
    arenaDiv.style.display = 'flex';
}

// Прячем арену, показываем кнопки
function showMovesAndHideArena() {
    arenaDiv.style.display = 'none';
    movesPanel.style.display = 'flex';
    // сброс изображений на кулак
    fighter1Img.style.backgroundImage = "url('/images/fist.svg')";
    fighter2Img.style.backgroundImage = "url('/images/fist.svg')";
    // убираем классы анимации
    fighter1Img.classList.remove('shake', 'celebration');
    fighter2Img.classList.remove('shake', 'celebration');
}

// Анимация тряски кулаков дважды, затем смена на фигуры
function animateFightAndShowChoices(myMove, oppMove, onComplete) {
    // Устанавливаем имена игроков в арене
    fighter1NameSpan.innerText = player1Name.innerText;
    fighter2NameSpan.innerText = player2Name.innerText;
    
    // Добавляем класс тряски для обоих
    fighter1Img.classList.add('shake');
    fighter2Img.classList.add('shake');
    
    // Через 0.6 сек (два цикла тряски) меняем картинки
    setTimeout(() => {
        fighter1Img.classList.remove('shake');
        fighter2Img.classList.remove('shake');
        // Замена на картинки ходов
        fighter1Img.style.backgroundImage = `url('/images/${myMove}.svg')`;
        fighter2Img.style.backgroundImage = `url('/images/${oppMove}.svg')`;
        
        // Даём анимацию появления (scale)
        fighter1Img.style.transform = 'scale(1.1)';
        fighter2Img.style.transform = 'scale(1.1)';
        setTimeout(() => {
            fighter1Img.style.transform = '';
            fighter2Img.style.transform = '';
            onComplete();
        }, 200);
    }, 600);
}

// Запуск конфетти для определённого игрока (0 - я, 1 - соперник)
function celebrateWinner(winnerIndex) {
    const isMe = (winnerIndex === myPlayerIndex);
    if (isMe) {
        canvasConfetti({ particleCount: 180, spread: 80, origin: { y: 0.6 }, startVelocity: 20, colors: ['#ffd700', '#ffaa00'] });
    } else {
        canvasConfetti({ particleCount: 100, spread: 60, origin: { y: 0.3 }, startVelocity: 15, colors: ['#ff5555', '#aa2222'] });
    }
    // Доп. визуал на карточке
    const winnerCard = (winnerIndex === 0) ? document.getElementById('player1-card') : document.getElementById('player2-card');
    winnerCard.classList.add('celebration');
    setTimeout(() => winnerCard.classList.remove('celebration'), 800);
}

// --- Обработчики событий сокета ---
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
    waitingForRoundResult = false;
    moveBtns.forEach(btn => {
        btn.classList.remove('disabled-btn');
        btn.disabled = false;
    });
    showMovesAndHideArena();
    resultMsgDiv.innerText = 'Сделайте ход!';
});

// Получение информации о сопернике
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
    resultMsgDiv.innerText = 'Соперник сделал ход! Ожидаем разрешения...';
});

// Автовыбор со стороны сервера (когда время вышло)
socket.on('autoMove', ({ move }) => {
    if (!myMoveDone && !waitingForRoundResult) {
        myMoveDone = true;
        moveBtns.forEach(btn => btn.disabled = true);
        resultMsgDiv.innerText = `⏰ Время вышло! Автовыбор: ${move}`;
        // дополнительно можно показать анимацию, но сервер сам вызовет roundResult
    }
});

// Результат раунда (самое важное)
socket.on('roundResult', (data) => {
    stopClientTimer();
    waitingForRoundResult = true;
    
    const myMove = data.moves[myPlayerIndex];
    const oppMove = data.moves[opponentIndex];
    
    // Скрываем панель выбора, показываем арену
    showArenaAndHideMoves();
    
    // Запускаем анимацию тряски -> показ фигур
    animateFightAndShowChoices(myMove, oppMove, () => {
        // Определяем победителя
        let winnerIdx = null;
        if (data.winner === 'player1') winnerIdx = 0;
        else if (data.winner === 'player2') winnerIdx = 1;
        
        if (winnerIdx !== null) {
            // Празднуем победителя
            celebrateWinner(winnerIdx);
            const winnerText = (winnerIdx === myPlayerIndex) ? 'Вы выиграли раунд!' : 'Соперник выиграл раунд!';
            resultMsgDiv.innerText = winnerText;
        } else {
            resultMsgDiv.innerText = 'Ничья! 🤝';
        }
        
        // Обновляем счёт на карточках
        player1ScoreSpan.innerText = data.scores[0];
        player2ScoreSpan.innerText = data.scores[1];
        
        // Через 3 секунды готовим следующий раунд (или окончание игры)
        setTimeout(() => {
            // Если игра не закончена, показываем кнопки и запускаем таймер заново
            // Но сервер пришлёт newRound отдельно, поэтому мы просто сбрасываем флаг ожидания
            waitingForRoundResult = false;
            myMoveDone = false;
            // Анимационная арена спрячется при получении newRound
        }, 3000);
    });
});

// Начало нового раунда
socket.on('newRound', (data) => {
    // Возвращаем обычный интерфейс
    showMovesAndHideArena();
    roundSpan.innerText = data.round;
    roundTimeLimit = data.timeLimit;
    startClientTimer(roundTimeLimit);
    myMoveDone = false;
    waitingForRoundResult = false;
    moveBtns.forEach(btn => {
        btn.classList.remove('disabled-btn');
        btn.disabled = false;
    });
    resultMsgDiv.innerText = 'Раунд начался! Выберите фигуру.';
});

// Конец игры
socket.on('gameOver', (data) => {
    stopClientTimer();
    if (roundTimerInterval) clearInterval(roundTimerInterval);
    moveBtns.forEach(btn => btn.disabled = true);
    let text = '';
    if (data.isDraw) {
        text = '🤝 Игра закончилась ничьей после 10 ничьих 😐';
    } else {
        const iWon = (data.winnerId === socket.id);
        text = iWon ? '🏆 ПОБЕДА! 🏆' : '💔 Поражение...';
        if (iWon) canvasConfetti({ particleCount: 300, spread: 100, origin: { y: 0.5 }, startVelocity: 25 });
    }
    document.getElementById('gameover-text').innerText = text;
    gameScreen.style.display = 'none';
    gameoverScreen.style.display = 'block';
});

socket.on('opponentDisconnected', () => {
    alert('Соперник покинул игру. Возврат в поиск...');
    location.reload();
});

// --- Отправка хода ---
function makeMove(move) {
    if (myMoveDone || waitingForRoundResult) return;
    myMoveDone = true;
    moveBtns.forEach(btn => btn.disabled = true);
    socket.emit('makeMove', { roomId: currentRoomId, move });
    resultMsgDiv.innerText = 'Ход сделан, ожидаем соперника...';
    // на время ожидания можно показать, что думаем
}

// --- Получение профиля игрока ---
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

// --- Привязка кнопок ---
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