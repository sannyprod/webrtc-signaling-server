const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Настройки CORS для Railway
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

// Инициализация Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Хранилище комнат
const rooms = new Map();

// Статическая страница для теста
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WebRTC Signaling Server</title>
    </head>
    <body>
      <h1>🚀 WebRTC Signaling Server is Running!</h1>
      <p>Connected users: <span id="users">0</span></p>
      <p>Active rooms: <span id="rooms">0</span></p>
      
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        socket.on('stats-update', (data) => {
          document.getElementById('users').textContent = data.users;
          document.getElementById('rooms').textContent = data.rooms;
        });
      </script>
    </body>
    </html>
  `);
});

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);
  
  // Отправляем текущую статистику
  updateStats();
  
  // Создание комнаты
  socket.on('create-room', (roomId) => {
    rooms.set(roomId, {
      users: [socket.id],
      createdAt: new Date().toISOString()
    });
    
    socket.join(roomId);
    socket.emit('room-created', roomId);
    
    console.log(`🆕 Room created: ${roomId}`);
    updateStats();
  });
  
  // Присоединение к комнате
  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    
    if (room) {
      room.users.push(socket.id);
      socket.join(roomId);
      
      // Уведомляем существующих пользователей
      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        roomId: roomId
      });
      
      socket.emit('room-joined', {
        roomId: roomId,
        users: room.users.filter(id => id !== socket.id)
      });
      
      console.log(`👥 User ${socket.id} joined room: ${roomId}`);
      updateStats();
    } else {
      socket.emit('room-not-found', roomId);
    }
  });
  
  // WebRTC сигналы
  socket.on('webrtc-offer', (data) => {
    socket.to(data.target).emit('webrtc-offer', {
      offer: data.offer,
      from: socket.id
    });
  });
  
  socket.on('webrtc-answer', (data) => {
    socket.to(data.target).emit('webrtc-answer', {
      answer: data.answer,
      from: socket.id
    });
  });
  
  socket.on('webrtc-ice-candidate', (data) => {
    socket.to(data.target).emit('webrtc-ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });
  
  // Отключение
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    
    // Удаляем пользователя из всех комнат
    rooms.forEach((room, roomId) => {
      const userIndex = room.users.indexOf(socket.id);
      if (userIndex > -1) {
        room.users.splice(userIndex, 1);
        
        // Уведомляем остальных
        socket.to(roomId).emit('user-left', socket.id);
        
        // Удаляем пустые комнаты
        if (room.users.length === 0) {
          rooms.delete(roomId);
          console.log(`🗑️ Room deleted: ${roomId}`);
        }
      }
    });
    
    updateStats();
  });
});

// Функция обновления статистики
function updateStats() {
  const stats = {
    users: io.engine.clientsCount,
    rooms: rooms.size
  };
  
  io.emit('stats-update', stats);
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎯 Signaling server running on port ${PORT}`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
});
