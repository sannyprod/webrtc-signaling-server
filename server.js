const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected users
const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user registration
  socket.on('register', (userData) => {
    const userInfo = {
      id: socket.id,
      name: userData.name || `User-${socket.id.substring(0, 6)}`,
      ...userData
    };

    users.set(socket.id, userInfo);
    console.log(`User registered: ${userInfo.name} (${socket.id})`);

    // Notify others about new user
    socket.broadcast.emit('user-joined', userInfo);

    // Send list of existing users to the new user
    const userList = Array.from(users.values()).filter(user => user.id !== socket.id);
    socket.emit('users-list', userList);

    // Confirm registration
    socket.emit('registered', { id: socket.id, users: userList });
  });

  // WebRTC Offer
  socket.on('offer', (data) => {
    console.log(`Offer from ${socket.id} to ${data.target}`);
    if (users.has(data.target)) {
      socket.to(data.target).emit('offer', {
        offer: data.offer,
        from: socket.id,
        fromName: users.get(socket.id)?.name
      });
    }
  });


  // WebRTC Answer
  socket.on('answer', (data) => {
    console.log(`Answer from ${socket.id} to ${data.target}`);
    if (users.has(data.target)) {
      socket.to(data.target).emit('answer', {
        answer: data.answer,
        from: socket.id
      });
    }
  });

  socket.on('call-accepted', (data) => {
    console.log(`Call accepted by ${socket.id} from ${data.target}`);
    // Можно отправить подтверждение вызывающему
    socket.to(data.target).emit('call-accepted', {
      from: socket.id
    });
  });


  // ICE Candidates
  socket.on('ice-candidate', (data) => {
    if (users.has(data.target)) {
      socket.to(data.target).emit('ice-candidate', {
        candidate: data.candidate,
        from: socket.id
      });
    }
  });

  // Call initiation
  socket.on('call-user', (data) => {
    console.log(`Call from ${socket.id} to ${data.target}`);
    if (users.has(data.target)) {
      socket.to(data.target).emit('incoming-call', {
        from: socket.id,
        fromName: users.get(socket.id)?.name
      });
    }
  });

  socket.on('end-call', (data) => {
    if (users.has(data.target)) {
      socket.to(data.target).emit('call-ended', {
        from: socket.id
      });
    }
  });

  socket.on('reject-call', (data) => {
    if (users.has(data.target)) {
      socket.to(data.target).emit('call-rejected', {
        from: socket.id
      });
    }
  });


  // Handle user disconnection
  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.id, 'Reason:', reason);

    const userInfo = users.get(socket.id);
    if (userInfo) {
      users.delete(socket.id);
      socket.broadcast.emit('user-left', {
        id: socket.id,
        name: userInfo.name
      });
    }
  });

  // Ping-pong for connection health check
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    usersCount: users.size,
    users: Array.from(users.values()).map(user => ({
      id: user.id,
      name: user.name
    }))
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebRTC Signaling Server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
});
