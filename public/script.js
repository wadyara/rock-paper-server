const socket = io(); // Подключаемся к серверу

const findBtn = document.getElementById('findBtn');
const gameArea = document.getElementById('gameArea');

let currentRoom = null;

findBtn.onclick = () => {
    socket.emit('findOpponent');
    findBtn.disabled = true;
    findBtn.innerText = 'Поиск...';
};

socket.on('waiting', () => {
    findBtn.innerText = 'Ожидание соперника...';
});

socket.on('gameStart', (data) => {
    currentRoom = data.room;
    gameArea.style.display = 'block';
    findBtn.style.display = 'none';
});

// Обработка нажатий на кнопки
document.getElementById('rock').onclick = () => makeMove('rock');
document.getElementById('paper').onclick = () => makeMove('paper');
document.getElementById('scissors').onclick = () => makeMove('scissors');

function makeMove(move) {
    socket.emit('makeMove', { room: currentRoom, move: move });
    // Дальше обновите UI: заблокируйте кнопки, покажите анимацию "Ожидание хода соперника"
}

socket.on('opponentMove', (move) => {
    // Получаем ход соперника
    console.log('Соперник выбрал:', move);
    // Тут будет ваша бизнес-логика: определить победителя, обновить счет и т.д.
});