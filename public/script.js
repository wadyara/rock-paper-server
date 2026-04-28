const socket = io(); // автоматически подключается к тому же хосту

// DOM элементы
const searchScreen = document.getElementById('search-screen');
const gameScreen = document.getElementById('game-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const findBtn = document.getElementById('find-btn');
const waitingMsg = document.getElementById('waiting-message');
const playAgainBtn = document.getElementById('play-again-btn');

const roundNumberSpan = document.getElementById('round-number');
const timerSpan = document.getElementById('timer');
const resultMsgDiv = document.getElementById('result-message');
const moveBtns = document.querySelectorAll('.move-btn');

// Карточки игроков
const player1Card = document.getElementById('player1-card');
const player2Card = document.getElementById('player2-card');
const player1Name = document.getElementById('player1-name');
const player2Name = document.getElementById('player2-name');
const player1Score = document.getElementById('player1-score');
const player2Score = document.getElementById('player2-score');
const player1Avatar = document.getElementById('player1-avatar');
const player2Avatar = document.getElementById('player2-avatar');
const player1Thinking = document.getElementById('player1-thinking');
const player2Thinking = document.getElementById('player2-thinking');

// Состояние клиента
let currentRoomId = null;
let myPlayerIndex = null;      // 0 или 1
let opponentIndex = null;
let roundTimeLimit = 15;
let roundTimerInterval = null;
let myMoveMade = false;

// --- Получение данных из Яндекс.Игр (или заглушки) ---
async function fetchPlayerInfo() {
    try {
        // При реальной публикации используйте YaGames.getPlayer()
        if (typeof YaGames !== 'undefined' && YaGames.getPlayer) {
            const player = await YaGames.getPlayer();
            const name = await player.getName();
            const avatar = await player.getAvatarSrc();
            return { name, avatar };
        }
    } catch(e) { console.warn(e); }
    // Заглушка для локальной разработки
    return { name: `Игрок${Math.floor(Math.random()*1000)}`, avatar: 'https://via.placeholder.com/100' };
}

// Отправляем информацию о себе на сервер
async function sendMyInfo() {
    const { name, avatar } = await fetchPlayerInfo();
    socket.emit('playerInfo', { name, avatar });
    // Отображаем в своём профиле
    player1Name.innerText = name;
    player1Avatar.style.backgroundImage = `url(${avatar})`;
    return { name, avatar };
}

// --- Таймер на клиенте (синхронизация с серверным) ---
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

// --- Анимация между раундами (прокрутка картинок) ---
function animateChoices(playerMove, opponentMove, callback) {
    // Здесь можно добавить визуальное отображение выбора
    // Для простоты показываем сообщение
    resultMsgDiv.innerText = `Ваш ход: ${playerMove}  |  Соперник: ${opponentMove}`;
    setTimeout(() => {
        callback();
    }, 1200);
}

// --- Обработка результата раунда ---
function onRoundResult(data) {
    // Останавливаем таймер
    if (roundTimerInterval) clearInterval(roundTimerInterval);
    // Убираем анимацию "думает"
    player1Thinking.style.display = 'none';
    player2Thinking.style.display = 'none';
    
    const moves = data.moves;
    const myMove = moves[myPlayerIndex];
    const oppMove = moves[opponentIndex];
    
    animateChoices(myMove, oppMove, () => {
        if (data.winner === 'player1') {
            resultMsgDiv.innerText = myPlayerIndex === 0 ? '✅ Вы выиграли раунд!' : '❌ Соперник выиграл раунд!';
        } else if (data.winner === 'player2') {
            resultMsgDiv.innerText = myPlayerIndex === 1 ? '✅ Вы выиграли раунд!' : '❌ Соперник выиграл раунд!';
        } else {
            resultMsgDiv.innerText = '🤝 Ничья!';
        }
        
        // Обновляем счёт
        player1Score.innerText = data.scores[0];
        player2Score.innerText = data.scores[1];
        
        // Разблокируем кнопки ходов (через секунду после анимации)
        setTimeout(() => {
            myMoveMade = false;
            moveBtns.forEach(btn => btn.disabled = false);
        }, 1500);
    });
}

// --- Новый раунд ---
function onNewRound(data) {
    resultMsgDiv.innerText = `Раунд ${data.round} | Время на ход: ${data.timeLimit} сек`;
    roundTimeLimit = data.timeLimit;
    roundNumberSpan.innerText = data.round;
    timerSpan.innerText = roundTimeLimit;
    startClientTimer(roundTimeLimit);
    myMoveMade = false;
    moveBtns.forEach(btn => btn.disabled = false);
    // Скрываем анимации "думает"
    player1Thinking.style.display = 'none';
    player2Thinking.style.display = 'none';
}

// --- Окончание игры ---
function onGameOver(data) {
    if (roundTimerInterval) clearInterval(roundTimerInterval);
    moveBtns.forEach(btn => btn.disabled = true);
    
    let text = '';
    if (data.isDraw) {
        text = '🤝 Игра закончилась ничьей после 10 ничьих подряд!';
    } else {
        const iWon = (data.winnerId === socket.id);
        text = iWon ? '🏆 ПОБЕДА! 🏆' : '💔 Поражение...';
    }
    document.getElementById('gameover-text').innerText = text;
    gameScreen.style.display = 'none';
    gameoverScreen.style.display = 'block';
    
    // TODO: выдать валюту победителю через API Яндекс.Игр
}

// --- Socket события ---
socket.on('waiting', () => {
    waitingMsg.style.display = 'block';
    findBtn.disabled = true;
});

socket.on('gameStart', async (data) => {
    currentRoomId = data.roomId;
    myPlayerIndex = data.playerIndex;
    opponentIndex = myPlayerIndex === 0 ? 1 : 0;
    roundTimeLimit = data.timeLimit;
    
    // Отправляем свои данные сопернику
    await sendMyInfo();
    
    // Прячем поиск, показываем игру
    searchScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    gameoverScreen.style.display = 'none';
    
    roundNumberSpan.innerText = '1';
    player1Score.innerText = '0';
    player2Score.innerText = '0';
    startClientTimer(roundTimeLimit);
    moveBtns.forEach(btn => btn.disabled = false);
    myMoveMade = false;
});

socket.on('opponentInfo', ({ name, avatar }) => {
    if (opponentIndex === 1) {
        player2Name.innerText = name;
        player2Avatar.style.backgroundImage = `url(${avatar})`;
    } else {
        player1Name.innerText = name;
        player1Avatar.style.backgroundImage = `url(${avatar})`;
    }
});

socket.on('opponentMadeMove', () => {
    // Показываем анимацию у соперника
    if (opponentIndex === 1) player2Thinking.style.display = 'block';
    else player1Thinking.style.display = 'block';
});

socket.on('autoMove', ({ move }) => {
    resultMsgDiv.innerText = `⏰ Время вышло! Автовыбор: ${move}`;
    myMoveMade = true;
    moveBtns.forEach(btn => btn.disabled = true);
});

socket.on('roundResult', onRoundResult);
socket.on('newRound', onNewRound);
socket.on('gameOver', onGameOver);

socket.on('opponentDisconnected', () => {
    alert('Соперник покинул игру. Возврат в поиск...');
    location.reload();
});

// --- Клик по кнопке хода ---
moveBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (myMoveMade) return;
        const move = btn.getAttribute('data-move');
        socket.emit('makeMove', { roomId: currentRoomId, move });
        myMoveMade = true;
        btn.disabled = true;
        // Показать, что вы сделали ход
        if (myPlayerIndex === 0) player1Thinking.style.display = 'block';
        else player2Thinking.style.display = 'block';
        resultMsgDiv.innerText = 'Ход сделан, ожидаем соперника...';
    });
});

// --- Поиск игрока ---
findBtn.addEventListener('click', () => {
    socket.emit('findOpponent');
    findBtn.disabled = true;
    findBtn.innerText = 'Поиск...';
});

playAgainBtn.addEventListener('click', () => {
    location.reload(); // просто перезагружаем страницу для новой игры
});