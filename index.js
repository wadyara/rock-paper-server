const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIo(server);

// Очередь ожидающих игроков (храним объект socket)
let waitingPlayer = null;

// Хранилище игр: ключ - roomId, значение - состояние игры
const games = new Map();

// Функция для определения победителя раунда
function getRoundWinner(move1, move2) {
    if (move1 === move2) return 'draw';
    if (
        (move1 === 'rock' && move2 === 'scissors') ||
        (move1 === 'scissors' && move2 === 'paper') ||
        (move1 === 'paper' && move2 === 'rock')
    ) {
        return 'player1';
    }
    return 'player2';
}

// Создание новой игры
function createGame(roomId, player1, player2) {
    const gameState = {
        roomId,
        players: [player1.id, player2.id],
        scores: [0, 0],
        round: 1,
        roundDraws: 0,
        currentRoundStart: Date.now(),
        moves: [null, null],
        roundTimer: null,
        timeLimit: 15, // начальное время 15 секунд
        gameWinner: null,
        isActive: true
    };
    
    games.set(roomId, gameState);
    
    // Запускаем таймер на сервере
    startRoundTimer(roomId);
    
    return gameState;
}

// Запуск таймера раунда на сервере
function startRoundTimer(roomId) {
    const game = games.get(roomId);
    if (!game || !game.isActive) return;
    
    // Очищаем предыдущий таймер, если есть
    if (game.roundTimer) clearTimeout(game.roundTimer);
    
    const timeLimitMs = game.timeLimit * 1000;
    const elapsed = Date.now() - game.currentRoundStart;
    const remaining = Math.max(0, timeLimitMs - elapsed);
    
    game.roundTimer = setTimeout(() => {
        handleRoundTimeout(roomId);
    }, remaining);
}

// Обработка истечения времени раунда
function handleRoundTimeout(roomId) {
    const game = games.get(roomId);
    if (!game || !game.isActive) return;
    
    // Для каждого игрока, кто не сделал ход, автоматически выбираем случайный
    const moves = game.moves;
    for (let i = 0; i < 2; i++) {
        if (moves[i] === null) {
            const randomMove = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
            moves[i] = randomMove;
            // Уведомляем игрока, что его ход был выбран автоматически
            io.to(game.players[i]).emit('autoMove', { move: randomMove });
        }
    }
    
    // Определяем победителя раунда
    const winner = getRoundWinner(moves[0], moves[1]);
    if (winner === 'player1') {
        game.scores[0]++;
        game.roundDraws = 0;
    } else if (winner === 'player2') {
        game.scores[1]++;
        game.roundDraws = 0;
    } else { // ничья
        game.roundDraws++;
    }
    
    // Уведомляем игроков о результате раунда
    io.to(roomId).emit('roundResult', {
        moves: moves,
        winner: winner,
        scores: game.scores,
        roundDraws: game.roundDraws
    });
    
    // Проверяем окончание игры
    const winnerIdx = game.scores[0] >= 3 ? 0 : (game.scores[1] >= 3 ? 1 : null);
    const isDrawGame = game.roundDraws >= 10;
    
    if (winnerIdx !== null || isDrawGame) {
        // Игра окончена
        game.isActive = false;
        if (game.roundTimer) clearTimeout(game.roundTimer);
        
        const finalWinner = isDrawGame ? null : game.players[winnerIdx];
        game.gameWinner = finalWinner;
        
        io.to(roomId).emit('gameOver', {
            winnerId: finalWinner,
            isDraw: isDrawGame,
            scores: game.scores
        });
        
        // Удаляем игру из памяти через 10 секунд
        setTimeout(() => games.delete(roomId), 10000);
        return;
    }
    
    // Подготовка к следующему раунду
    game.round++;
    game.moves = [null, null];
    // Уменьшаем время на 1 секунду, но не менее 5
    game.timeLimit = Math.max(5, game.timeLimit - 1);
    game.currentRoundStart = Date.now();
    
    // Уведомляем о начале нового раунда
    io.to(roomId).emit('newRound', {
        round: game.round,
        timeLimit: game.timeLimit,
        scores: game.scores
    });
    
    // Запускаем новый таймер
    startRoundTimer(roomId);
}

// Обработка хода игрока
function handleMove(socket, roomId, move) {
    const game = games.get(roomId);
    if (!game || !game.isActive) return false;
    
    // Определяем, какой это игрок (0 или 1)
    const playerIndex = game.players.indexOf(socket.id);
    if (playerIndex === -1) return false;
    
    // Если ход уже сделан этим игроком, игнорируем
    if (game.moves[playerIndex] !== null) return false;
    
    game.moves[playerIndex] = move;
    
    // Уведомляем соперника, что ход сделан
    const opponentId = game.players[1 - playerIndex];
    io.to(opponentId).emit('opponentMadeMove');
    
    // Проверяем, сделали ли ход оба игрока
    if (game.moves[0] !== null && game.moves[1] !== null) {
        // Отменяем текущий таймер и обрабатываем раунд немедленно
        if (game.roundTimer) clearTimeout(game.roundTimer);
        handleRoundTimeout(roomId);
    }
    
    return true;
}

// ----- Socket.IO события -----
io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);
    
    // Поиск соперника
    socket.on('findOpponent', () => {
        if (waitingPlayer && waitingPlayer !== socket) {
            // Соперник найден
            const roomId = `game_${waitingPlayer.id}_${socket.id}`;
            
            // Объединяем обоих в комнату
            waitingPlayer.join(roomId);
            socket.join(roomId);
            
            // Создаём игру
            const game = createGame(roomId, waitingPlayer, socket);
            
            // Сообщаем обоим игрокам ID комнаты и их номер (0 или 1)
            io.to(waitingPlayer.id).emit('gameStart', { roomId, playerIndex: 0, timeLimit: game.timeLimit });
            io.to(socket.id).emit('gameStart', { roomId, playerIndex: 1, timeLimit: game.timeLimit });
            
            waitingPlayer = null;
        } else {
            // Ставим в очередь
            waitingPlayer = socket;
            socket.emit('waiting');
        }
    });
    
    // Игрок делает ход
    socket.on('makeMove', ({ roomId, move }) => {
        handleMove(socket, roomId, move);
    });
    
    // Передача имени и аватарки (после получения из Яндекс SDK)
    socket.on('playerInfo', ({ name, avatar }) => {
        // Сохраняем информацию в socket для последующей рассылки
        socket.playerName = name;
        socket.playerAvatar = avatar;
        
        // Если игрок уже в игре, шлём его данные сопернику
        const rooms = Array.from(socket.rooms);
        for (const room of rooms) {
            if (room.startsWith('game_')) {
                const game = games.get(room);
                if (game) {
                    const opponentId = game.players.find(id => id !== socket.id);
                    if (opponentId) {
                        io.to(opponentId).emit('opponentInfo', { name, avatar });
                    }
                }
            }
        }
    });
    
    // Отключение
    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        if (waitingPlayer === socket) waitingPlayer = null;
        
        // Если игрок был в активной игре, уведомляем соперника о выходе
        for (const [roomId, game] of games.entries()) {
            if (game.players.includes(socket.id)) {
                io.to(roomId).emit('opponentDisconnected');
                games.delete(roomId);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));