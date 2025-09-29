class WebRTCApp {
    constructor() {
        this.socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        this.localStream = null;
        this.remoteStream = null;
        this.peers = new Map();
        this.currentRoom = null;
        
        this.initializeElements();
        this.initializeSocket();
        this.setupEventListeners();
    }
    
    initializeElements() {
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.startCallBtn = document.getElementById('startCall');
        this.endCallBtn = document.getElementById('endCall');
        this.shareScreenBtn = document.getElementById('shareScreen');
        this.joinRoomBtn = document.getElementById('joinRoom');
        this.roomInput = document.getElementById('roomInput');
        this.status = document.getElementById('status');
        this.roomInfo = document.getElementById('roomInfo');
    }
    
    initializeSocket() {
        this.socket.on('connect', () => {
            this.updateStatus('Connected to server', true);
        });
        
        this.socket.on('disconnect', () => {
            this.updateStatus('Disconnected from server', false);
        });
        
        this.socket.on('reconnect', () => {
            this.updateStatus('Reconnected to server', true);
            if (this.currentRoom) {
                this.socket.emit('join-room', this.currentRoom);
            }
        });
        
        this.socket.on('user-connected', (userId) => {
            console.log('User connected:', userId);
            this.updateStatus(`User ${userId.substring(0, 8)} connected`);
            this.createPeer(userId, true);
        });
        
        this.socket.on('user-disconnected', (userId) => {
            console.log('User disconnected:', userId);
            this.updateStatus(`User ${userId.substring(0, 8)} disconnected`);
            this.removePeer(userId);
        });
        
        this.socket.on('room-users', (users) => {
            console.log('Users in room:', users);
            users.forEach(userId => {
                if (userId !== this.socket.id && !this.peers.has(userId)) {
                    this.createPeer(userId, true);
                }
            });
        });
        
        this.socket.on('offer', async (data) => {
            console.log('Received offer from:', data.sender);
            await this.handleOffer(data);
        });
        
        this.socket.on('answer', async (data) => {
            console.log('Received answer from:', data.sender);
            await this.handleAnswer(data);
        });
        
        this.socket.on('ice-candidate', (data) => {
            console.log('Received ICE candidate from:', data.sender);
            this.handleIceCandidate(data);
        });
    }
    
    setupEventListeners() {
        this.startCallBtn.addEventListener('click', () => this.startCall());
        this.endCallBtn.addEventListener('click', () => this.hangUp());
        this.shareScreenBtn.addEventListener('click', () => this.shareScreen());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        
        // Автогенерация ID комнаты
        this.roomInput.value = this.generateRoomId();
    }
    
    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    async joinRoom() {
        const roomId = this.roomInput.value.trim();
        if (!roomId) return;
        
        this.currentRoom = roomId;
        this.socket.emit('join-room', roomId);
        this.updateStatus(`Joined room: ${roomId}`);
        this.roomInfo.textContent = `Room: ${roomId}`;
        this.updateUI('joined');
    }
    
    async initializeMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            this.localVideo.srcObject = this.localStream;
            this.updateStatus('Camera and microphone enabled');
            return true;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.updateStatus('Error accessing camera/microphone');
            return false;
        }
    }
    
    async startCall() {
        if (!this.currentRoom) {
            this.updateStatus('Please join a room first');
            return;
        }
        
        const mediaSuccess = await this.initializeMedia();
        if (!mediaSuccess) return;
        
        this.updateUI('in-call');
        this.updateStatus('Call started - waiting for connections');
    }
    
    createPeer(userId, isInitiator) {
        if (this.peers.has(userId)) return;
        
        const peer = new SimplePeer({
            initiator: isInitiator,
            trickle: true,
            stream: this.localStream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });
        
        peer.on('signal', (data) => {
            this.handleSignal(data, userId);
        });
        
        peer.on('stream', (stream) => {
            console.log('Received remote stream from:', userId);
            this.remoteStream = stream;
            this.remoteVideo.srcObject = stream;
        });
        
        peer.on('connect', () => {
            console.log('WebRTC connected to:', userId);
            this.updateStatus(`Connected to ${userId.substring(0, 8)}`, true);
        });
        
        peer.on('close', () => {
            console.log('WebRTC connection closed with:', userId);
            this.removePeer(userId);
        });
        
        peer.on('error', (error) => {
            console.error('WebRTC error with', userId, ':', error);
            this.removePeer(userId);
        });
        
        this.peers.set(userId, peer);
    }
    
    handleSignal(data, targetUserId) {
        if (data.type === 'offer') {
            this.socket.emit('offer', {
                target: targetUserId,
                offer: data
            });
        } else if (data.type === 'answer') {
            this.socket.emit('answer', {
                target: targetUserId,
                answer: data
            });
        } else if (data.type === 'candidate') {
            this.socket.emit('ice-candidate', {
                target: targetUserId,
                candidate: data
            });
        }
    }
    
    async handleOffer(data) {
        if (!this.localStream) {
            const mediaSuccess = await this.initializeMedia();
            if (!mediaSuccess) return;
        }
        
        this.createPeer(data.sender, false);
        const peer = this.peers.get(data.sender);
        if (peer) {
            peer.signal(data.offer);
        }
    }
    
    async handleAnswer(data) {
        const peer = this.peers.get(data.sender);
        if (peer) {
            peer.signal(data.answer);
        }
    }
    
    handleIceCandidate(data) {
        const peer = this.peers.get(data.sender);
        if (peer) {
            peer.signal(data.candidate);
        }
    }
    
    removePeer(userId) {
        const peer = this.peers.get(userId);
        if (peer) {
            peer.destroy();
            this.peers.delete(userId);
        }
        
        if (this.peers.size === 0) {
            this.remoteVideo.srcObject = null;
        }
    }
    
    async shareScreen() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'window'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            
            // Заменяем видео трек у всех пиров
            const videoTrack = screenStream.getVideoTracks()[0];
            this.peers.forEach(peer => {
                const sender = peer._pc.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                if (sender) {
                    sender.replaceTrack(videoTrack);
                }
            });
            
            // Обработка завершения шаринга экрана
            videoTrack.onended = () => {
                if (this.localStream) {
                    const camTrack = this.localStream.getVideoTracks()[0];
                    this.peers.forEach(peer => {
                        const sender = peer._pc.getSenders().find(s => 
                            s.track && s.track.kind === 'video'
                        );
                        if (sender && camTrack) {
                            sender.replaceTrack(camTrack);
                        }
                    });
                }
                this.updateStatus('Screen sharing stopped');
            };
            
            this.updateStatus('Screen sharing started');
        } catch (error) {
            console.error('Error sharing screen:', error);
            this.updateStatus('Error sharing screen');
        }
    }
    
    hangUp() {
        // Закрываем все пиры
        this.peers.forEach((peer, userId) => {
            peer.destroy();
        });
        this.peers.clear();
        
        // Останавливаем локальный поток
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.localVideo.srcObject = null;
        this.remoteVideo.srcObject = null;
        
        this.updateUI('idle');
        this.updateStatus('Call ended');
    }
    
    updateUI(state) {
        switch(state) {
            case 'idle':
                this.startCallBtn.disabled = false;
                this.endCallBtn.disabled = true;
                this.shareScreenBtn.disabled = true;
                this.joinRoomBtn.disabled = false;
                break;
            case 'joined':
                this.startCallBtn.disabled = false;
                this.endCallBtn.disabled = true;
                this.shareScreenBtn.disabled = true;
                this.joinRoomBtn.disabled = true;
                break;
            case 'in-call':
                this.startCallBtn.disabled = true;
                this.endCallBtn.disabled = false;
                this.shareScreenBtn.disabled = false;
                this.joinRoomBtn.disabled = true;
                break;
        }
    }
    
    updateStatus(message, isConnected = false) {
        this.status.textContent = message;
        this.status.className = `status ${isConnected ? 'connected' : 'disconnected'}`;
        
        // Автоочистка статуса через 5 секунд
        if (isConnected) {
            setTimeout(() => {
                if (this.status.textContent === message) {
                    this.status.textContent = 'Connected';
                }
            }, 5000);
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new WebRTCApp();
});
