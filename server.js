// Подключаем установленные библиотеки
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Настраиваем express-сервер
const app = express();
// Папка, где будут лежать файлы самой игры (HTML, CSS, JS)
app.use(express.static('public'));

// Создаем сервер
const server = http.createServer(app);
// Подключаем к нему socket.io
const io = socketIo(server);

// Здесь будет храниться список игроков в очереди
let waitingPlayer = null;

// Обработчик новых подключений
io.on('connection', (socket) => {
    console.log('Новый игрок подключился:', socket.id);

    // Игрок нажал кнопку "Поиск соперника"
    socket.on('findOpponent', () => {
        if (waitingPlayer) {
            // Если кто-то ждет, запускаем игру
            console.log(`Игра началась! ${waitingPlayer.id} VS ${socket.id}`);

            // Создаем "комнату" для двоих
            const roomName = `game_${waitingPlayer.id}_${socket.id}`;
            waitingPlayer.join(roomName);
            socket.join(roomName);

            // Сообщаем обоим игрокам, что пора начинать
            io.to(roomName).emit('gameStart', { room: roomName });

            // Очищаем очередь
            waitingPlayer = null;
        } else {
            // Если никого нет, ставим текущего в очередь
            waitingPlayer = socket;
            socket.emit('waiting');
            console.log('Игрок встал в очередь');
        }
    });

    // Обработчик хода игрока
    socket.on('makeMove', (data) => {
        // data содержит { room, move }
        // Отправляем ход второму игроку в той же комнате
        socket.to(data.room).emit('opponentMove', data.move);
    });

    // Игрок отключился
    socket.on('disconnect', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null; // Убираем из очереди
        }
        console.log('Игрок отключился');
    });
});

// Запускаем сервер на порту, который даст Railway, или на 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});