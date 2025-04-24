const socket = io();
let localStream;
let peerConnection;
const roomId = window.location.pathname.split('/').pop();

// Join the room immediately after socket connects
socket.on('connect', () => {
    socket.emit('join', { room: roomId });
});


const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');
const status = document.getElementById('status');
const localAudioContainer = document.getElementById('localAudioContainer');
const remoteAudioContainer = document.getElementById('remoteAudioContainer');
const participantCount = document.getElementById('participantCount');

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ]
};

// Update status message with icon and text
function updateStatus(iconClass, text, colorClass = 'text-indigo-400') {
    status.innerHTML = `
        <div class="flex items-center justify-center space-x-2">
            <i class="${iconClass} ${colorClass}"></i>
            <span>${text}</span>
        </div>
    `;
}

// Create audio element for remote stream
function createRemoteAudioElement(stream, userId) {
    const audioElement = document.createElement('audio');
    audioElement.srcObject = stream;
    audioElement.autoplay = true;
    audioElement.controls = false;
    
    const container = document.createElement('div');
    container.className = 'bg-gray-700 rounded-lg p-4 flex items-center';
    container.id = `remote-${userId}`;
    
    container.innerHTML = `
        <div class="flex-1">
            <div class="flex items-center space-x-3">
                <i class="fas fa-user text-green-400"></i>
                <span>Participant</span>
            </div>
            <div class="mt-2 flex items-center space-x-2">
                <i class="fas fa-volume-up text-green-400"></i>
                <div class="flex-1 bg-gray-600 rounded-full h-2">
                    <div class="bg-green-400 h-2 rounded-full audio-level"></div>
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(audioElement);
    return container;
}

// Visualize audio levels
function visualizeAudio(audioElement, container) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioElement.srcObject);
    source.connect(analyser);
    analyser.fftSize = 32;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function update() {
        analyser.getByteFrequencyData(dataArray);
        const level = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
        const levelElement = container.querySelector('.audio-level');
        levelElement.style.width = `${Math.min(100, level * 2)}%`;
        requestAnimationFrame(update);
    }
    
    update();
}

startBtn.onclick = async () => {
    try {
        peerConnection = new RTCPeerConnection(config);
        
        peerConnection.onicecandidate = e => {
            if (e.candidate) {
                socket.emit('candidate', {
                    candidate: e.candidate,
                    room: roomId
                });
            }
        };

        peerConnection.ontrack = e => {
            const userId = e.streams[0].id;
            if (!document.getElementById(`remote-${userId}`)) {
                const container = createRemoteAudioElement(e.streams[0], userId);
                remoteAudioContainer.innerHTML = '';
                remoteAudioContainer.appendChild(container);
                visualizeAudio(container.querySelector('audio'), container);
                updateParticipantCount(1);
                updateStatus('fas fa-check-circle', 'Call connected!', 'text-green-400');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected') {
                updateStatus('fas fa-exclamation-triangle', 'Call disconnected', 'text-red-400');
                endCall();
            }
        };

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        // Show local audio visualization
        localAudioContainer.innerHTML = `
            <div class="w-full h-full flex flex-col justify-center items-center">
                <div class="flex items-center space-x-3 mb-2">
                    <i class="fas fa-microphone text-green-400"></i>
                    <span>You</span>
                </div>
                <div class="w-full bg-gray-600 rounded-full h-2">
                    <div class="bg-green-400 h-2 rounded-full local-audio-level"></div>
                </div>
            </div>
        `;
        
        // Visualize local audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(analyser);
        analyser.fftSize = 32;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        function updateLocalAudio() {
            analyser.getByteFrequencyData(dataArray);
            const level = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
            const levelElement = document.querySelector('.local-audio-level');
            if (levelElement) {
                levelElement.style.width = `${Math.min(100, level * 2)}%`;
            }
            requestAnimationFrame(updateLocalAudio);
        }
        
        updateLocalAudio();

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            offer: offer,
            room: roomId
        });
        
        updateStatus('fas fa-phone-alt', 'Calling...');
        startBtn.disabled = true;
        endBtn.disabled = false;
    } catch (err) {
        console.error(err);
        updateStatus('fas fa-exclamation-circle', 'Error accessing media', 'text-red-400');
    }
};

endBtn.onclick = () => {
    endCall();
    updateStatus('fas fa-phone-slash', 'Call ended');
};

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Reset local audio display
    localAudioContainer.innerHTML = '<i class="fas fa-microphone text-3xl text-gray-500"></i>';
    
    // Reset remote audio display
    remoteAudioContainer.innerHTML = `
        <div class="bg-gray-700 rounded-lg p-4 flex items-center">
            <div class="flex-1">
                <div class="flex items-center space-x-3">
                    <i class="fas fa-user text-indigo-400"></i>
                    <span>Waiting for participants...</span>
                </div>
            </div>
        </div>
    `;
    
    updateParticipantCount(0);
    startBtn.disabled = false;
    endBtn.disabled = true;
}

function updateParticipantCount(count) {
    participantCount.textContent = count;
}

// Socket events
socket.on('offer', async (data) => {
    if (data.sender === socket.id) return;
    
    try {
        peerConnection = new RTCPeerConnection(config);
        
        peerConnection.onicecandidate = e => {
            if (e.candidate) {
                socket.emit('candidate', {
                    candidate: e.candidate,
                    room: roomId
                });
            }
        };

        peerConnection.ontrack = e => {
            const userId = e.streams[0].id;
            if (!document.getElementById(`remote-${userId}`)) {
                const container = createRemoteAudioElement(e.streams[0], userId);
                remoteAudioContainer.innerHTML = '';
                remoteAudioContainer.appendChild(container);
                visualizeAudio(container.querySelector('audio'), container);
                updateParticipantCount(1);
                updateStatus('fas fa-phone-alt', 'Incoming call...');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected') {
                updateStatus('fas fa-exclamation-triangle', 'Call disconnected', 'text-red-400');
                endCall();
            }
        };

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        // Show local audio visualization
        localAudioContainer.innerHTML = `
            <div class="w-full h-full flex flex-col justify-center items-center">
                <div class="flex items-center space-x-3 mb-2">
                    <i class="fas fa-microphone text-green-400"></i>
                    <span>You</span>
                </div>
                <div class="w-full bg-gray-600 rounded-full h-2">
                    <div class="bg-green-400 h-2 rounded-full local-audio-level"></div>
                </div>
            </div>
        `;
        
        // Visualize local audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(analyser);
        analyser.fftSize = 32;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        function updateLocalAudio() {
            analyser.getByteFrequencyData(dataArray);
            const level = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
            const levelElement = document.querySelector('.local-audio-level');
            if (levelElement) {
                levelElement.style.width = `${Math.min(100, level * 2)}%`;
            }
            requestAnimationFrame(updateLocalAudio);
        }
        
        updateLocalAudio();

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            answer: answer,
            room: roomId
        });
        
        startBtn.disabled = true;
        endBtn.disabled = false;
    } catch (err) {
        console.error('Error handling offer:', err);
        updateStatus('fas fa-exclamation-circle', 'Error handling call', 'text-red-400');
    }
});

socket.on('answer', async (data) => {
    if (data.sender === socket.id || !peerConnection) return;
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        updateStatus('fas fa-check-circle', 'Call connected!', 'text-green-400');
    } catch (err) {
        console.error('Error handling answer:', err);
        updateStatus('fas fa-exclamation-circle', 'Error connecting call', 'text-red-400');
    }
});

socket.on('candidate', async (data) => {
    if (data.sender === socket.id || !peerConnection) return;
    
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
});

socket.on('joined', (data) => {
    updateStatus('fas fa-user-plus', `${data.message} (${data.room})`);
});

socket.on('left', (data) => {
    updateStatus('fas fa-user-minus', `${data.message} (${data.room})`);
});

// Handle page refresh or close
window.addEventListener('beforeunload', () => {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    socket.emit('leave', { room: roomId });
});