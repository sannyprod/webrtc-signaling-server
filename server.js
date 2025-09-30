const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files for demo (optional)
app.use(express.static(path.join(__dirname, 'public')));

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
    socket.emit('registered', { 
      id: socket.id, 
      users: userList 
    });
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
    } else {
      console.log(`Target user ${data.target} not found`);
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
    } else {
      console.log(`Target user ${data.target} not found`);
    }
  });

  // ICE Candidates
  socket.on('ice-candidate', (data) => {
    console.log(`ICE candidate from ${socket.id} to ${data.target}`);
    if (users.has(data.target)) {
      socket.to(data.target).emit('ice-candidate', {
        candidate: data.candidate,
        from: socket.id
      });
    } else {
      console.log(`Target user ${data.target} not found`);
    }
  });

  // Call initiation
  socket.on('call-user', (data) => {
    console.log(`Call request from ${socket.id} to ${data.target}`);
    if (users.has(data.target)) {
      socket.to(data.target).emit('incoming-call', {
        from: socket.id,
        fromName: users.get(socket.id)?.name
      });
    } else {
      console.log(`Target user ${data.target} not found`);
      socket.emit('call-rejected', { from: data.target });
    }
  });

  // Call acceptance
  socket.on('call-accepted', (data) => {
    console.log(`Call accepted by ${socket.id} from ${data.target}`);
    if (users.has(data.target)) {
      socket.to(data.target).emit('call-accepted', {
        from: socket.id
      });
    }
  });

  // Call rejection
  socket.on('reject-call', (data) => {
    console.log(`Call rejected by ${socket.id} from ${data.target}`);
    if (users.has(data.target)) {
      socket.to(data.target).emit('call-rejected', {
        from: socket.id
      });
    }
  });

  // End call
  socket.on('end-call', (data) => {
    console.log(`Call ended by ${socket.id} with ${data.target}`);
    if (users.has(data.target)) {
      socket.to(data.target).emit('call-ended', {
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
      console.log(`User ${userInfo.name} removed from users list`);
    }
  });

  // Ping-pong for connection health check
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    usersCount: users.size,
    users: Array.from(users.values()).map(user => ({
      id: user.id,
      name: user.name
    }))
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'WebRTC Signaling Server',
    status: 'running',
    endpoints: {
      health: '/health',
      websocket: '/socket.io/'
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 WebRTC Signaling Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
