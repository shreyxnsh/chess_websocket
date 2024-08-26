const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
  board: Array(5).fill().map(() => Array(5).fill(null)),
  currentPlayer: 'A',
  players: {},
  moveHistory: []
};

const pieces = {
  'Pawn': { name: 'Pawn', moves: ['F', 'B', 'L', 'R', 'FL', 'FR', 'BL', 'BR'], range: 1 },
  'Rook': { name: 'Rook', moves: ['F', 'B', 'L', 'R'], range: 2 },
  'Bishop': { name: 'Bishop', moves: ['FL', 'FR', 'BL', 'BR'], range: 2 },
  'Queen': { name: 'Queen', moves: ['F', 'B', 'L', 'R', 'FL', 'FR', 'BL', 'BR'], range: 3 } // Correcting Queen's moves
};

function initializeGame() {
  gameState.board = [
    ['A-Pawn', 'A-Rook', 'A-Bishop', 'A-Queen', 'A-Pawn'],
    [null, null, null, null, null],
    [null, null, null, null, null],
    [null, null, null, null, null],
    ['B-Pawn', 'B-Rook', 'B-Bishop', 'B-Queen', 'B-Pawn']
  ];
  gameState.currentPlayer = 'A';
  gameState.moveHistory = [];
}

function isValidMove(player, fromX, fromY, toX, toY) {
  const piece = gameState.board[fromY][fromX];
  if (!piece || piece[0] !== player) return false;

  const [, type] = piece.split('-');
  const pieceType = pieces[type];

  // Ensure pieceType exists before accessing its properties
  if (!pieceType) return false;

  const dx = toX - fromX;
  const dy = toY - fromY;

  // Check if move is out of board bounds
  if (toX < 0 || toX > 4 || toY < 0 || toY > 4) return false;

  // Check if the target position is occupied by the player's own piece
  if (gameState.board[toY][toX] && gameState.board[toY][toX][0] === player) return false;

  return Math.abs(dx) <= pieceType.range && Math.abs(dy) <= pieceType.range && (dx !== 0 || dy !== 0);
}

function processMove(player, fromX, fromY, toX, toY) {
  const piece = gameState.board[fromY][fromX];
  const capturedPiece = gameState.board[toY][toX];

  gameState.board[toY][toX] = piece;
  gameState.board[fromY][fromX] = null;

  const moveDescription = `${piece}: (${fromX},${fromY}) to (${toX},${toY})${capturedPiece ? ` capturing ${capturedPiece}` : ''}`;
  gameState.moveHistory.push(moveDescription);

  gameState.currentPlayer = gameState.currentPlayer === 'A' ? 'B' : 'A';
  return true;
}

function checkGameOver() {
  const aQueens = gameState.board.flat().filter(cell => cell && cell.endsWith('Queen')).length;
  const bQueens = gameState.board.flat().filter(cell => cell && cell.endsWith('Queen')).length;
  if (aQueens === 0) return 'B';
  if (bQueens === 0) return 'A';
  if (gameState.moveHistory.length >= 100) return 'draw';
  return null;
}

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('joinGame', (player) => {
    if (!gameState.players[player]) {
      gameState.players[player] = socket.id;
      socket.emit('playerAssigned', player);

      if (Object.keys(gameState.players).length === 2) {
        initializeGame();
        io.emit('gameStart', gameState);
      }
    } else {
      socket.emit('gameUpdate', gameState);
    }
  });

  socket.on('move', ({ player, fromX, fromY, toX, toY }) => {
    if (player === gameState.currentPlayer && isValidMove(player, fromX, fromY, toX, toY)) {
      processMove(player, fromX, fromY, toX, toY);
      io.emit('gameUpdate', gameState);

      const result = checkGameOver();
      if (result) {
        io.emit('gameOver', { result });
      }
    } else {
      socket.emit('invalidMove');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    Object.keys(gameState.players).forEach(player => {
      if (gameState.players[player] === socket.id) {
        delete gameState.players[player];
      }
    });
    if (Object.keys(gameState.players).length < 2) {
      gameState = {
        board: Array(5).fill().map(() => Array(5).fill(null)),
        currentPlayer: 'A',
        players: {},
        moveHistory: []
      };
      io.emit('gameReset');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
