const socket = io("https://v-call-nb7m.onrender.com", {
  transports: ["websocket"]
});let localStream;
let peerConnection;
const roomId = window.location.pathname.split('/').pop();
let pushToTalkActive = false;
let isSettingRemoteAnswer = false;
let pendingAnswer = null;

// DOM Elements
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
    
    // Important for some browsers
    audioElement.setAttribute('playsinline', 'true');
    
    const container = document.createElement('div');
    container.className = 'bg-gray-700 rounded-lg p-4 flex items-center';
    container.id = `remote-${userId}`;
    
    container.innerHTML = `
        <div class="flex-1">
            <div class="flex items-center space-x-3">
                <i class="fas fa-user text-green-400"></i>
                <span>Participant ${userId.slice(0, 4)}</span>
            </div>
            <div class="mt-2 flex items-center space-x-2">
                <i class="fas fa-volume-up text-green-400"></i>
                <div class="flex-1 bg-gray-600 rounded-full h-2">
                    <div class="bg-green-400 h-2 rounded-full audio-level" style="width: 0%"></div>
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(audioElement);
    
    // Force the audio element to start playing (some browsers need this)
    audioElement.play().catch(e => console.log('Audio play error:', e));
    
    // Start visualization
    visualizeAudio(audioElement, container);
    
    return container;
}
// Visualize audio levels
function visualizeAudio(audioElement, container) {
    // Create audio context if it doesn't exist
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create analyzer node
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 32;
    
    try {
        // Create stream source from the audio element's output
        const source = audioContext.createMediaStreamSource(audioElement.srcObject);
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        function updateVisualization() {
            if (!audioElement.srcObject || audioElement.srcObject.getTracks().length === 0) {
                return;
            }
            
            analyser.getByteFrequencyData(dataArray);
            const level = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
            const levelElement = container.querySelector('.audio-level');
            
            if (levelElement) {
                levelElement.style.width = `${Math.min(100, level * 3)}%`;
            }
            
            requestAnimationFrame(updateVisualization);
        }
        
        // Start visualization when audio starts playing
        audioElement.onplaying = () => {
            updateVisualization();
        };
        
        // Fallback in case onplaying doesn't fire
        setTimeout(updateVisualization, 500);
        
    } catch (error) {
        console.error('Audio visualization error:', error);
    }
}
// Function to toggle mute state
function toggleMute(mute) {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !mute;
        });
    }
}

// Function to handle push-to-talk
function setupPushToTalk() {
    const pushToTalkBtn = document.getElementById('pushToTalkBtn');
    
    pushToTalkBtn.addEventListener('mousedown', async () => {
        if (!pushToTalkActive && peerConnection) {
            pushToTalkActive = true;
            toggleMute(false);
            pushToTalkBtn.classList.add('active');
            updateStatus('fas fa-microphone', 'Transmitting...', 'text-green-400');
        }
    });

    pushToTalkBtn.addEventListener('mouseup', () => {
        if (pushToTalkActive && peerConnection) {
            pushToTalkActive = false;
            toggleMute(true);
            pushToTalkBtn.classList.remove('active');
            updateStatus('fas fa-microphone-slash', 'Listening...', 'text-yellow-400');
        }
    });
    logAudioState();

    pushToTalkBtn.addEventListener('touchstart', async (e) => {
        e.preventDefault();
        if (!pushToTalkActive && peerConnection) {
            pushToTalkActive = true;
            toggleMute(false);
            pushToTalkBtn.classList.add('active');
            updateStatus('fas fa-microphone', 'Transmitting...', 'text-green-400');
        }
    });

    pushToTalkBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (pushToTalkActive && peerConnection) {
            pushToTalkActive = false;
            toggleMute(true);
            pushToTalkBtn.classList.remove('active');
            updateStatus('fas fa-microphone-slash', 'Listening...', 'text-yellow-400');
        }
    });
}

// Automatically connect when joining the room
// Replace the initializeCall function with this improved version
async function initializeCall() {
    try {
        // Get local media stream first
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        // Create peer connection
        peerConnection = new RTCPeerConnection(config);


        peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState);
        if (peerConnection.signalingState === 'stable' && pendingAnswer) {
            const answer = pendingAnswer;
            pendingAnswer = null;
            setTimeout(() => {
                peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
                    .catch(e => console.error('Pending answer error:', e));
            }, 100);
        }
    };
            
        // Add local stream tracks to connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Set up local audio visualization
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

        // ICE Candidate handling
        peerConnection.onicecandidate = e => {
            if (e.candidate) {
                socket.emit('candidate', {
                    candidate: e.candidate,
                    room: roomId
                });
            }
        };

        // Track added (remote stream)
        peerConnection.ontrack = e => {
            if (!document.getElementById(`remote-${e.streams[0].id}`)) {
                console.log('Remote stream received:', e.streams[0]);
                console.log('Audio tracks:', e.streams[0].getAudioTracks());
                
                const container = createRemoteAudioElement(e.streams[0], e.streams[0].id);
                remoteAudioContainer.innerHTML = '';
                remoteAudioContainer.appendChild(container);
                
                // Debugging: Monitor audio element state
                const audioElement = container.querySelector('audio');
                audioElement.onplaying = () => {
                    console.log('Remote audio started playing');
                    visualizeAudio(audioElement, container);
                };
                
                audioElement.onerror = (err) => {
                    console.error('Remote audio error:', err);
                };
                
                updateParticipantCount(1);
                updateStatus('fas fa-check-circle', 'Connected! Push to talk', 'text-green-400');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected') {
                updateStatus('fas fa-exclamation-triangle', 'Disconnected', 'text-red-400');
                endCall();
            }
        };

        // Create and send offer
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            iceRestart: false // Prevent unnecessary renegotiation
        });
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            offer: offer,
            room: roomId
        });

        // Initialize push-to-talk
        setupPushToTalk();
        toggleMute(true); // Start muted
        updateStatus('fas fa-microphone-slash', 'Ready - Push to talk', 'text-yellow-400');
        
    } catch (err) {
        console.error('Error initializing call:', err);
        updateStatus('fas fa-exclamation-circle', 'Error accessing microphone', 'text-red-400');
    }
}

function logAudioState() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        console.log('Local audio tracks:', audioTracks);
        console.log('First track enabled state:', audioTracks[0]?.enabled);
    }
}

// Add this new handler for incoming offers
socket.on('offer', async (data) => {
    if (data.sender === socket.id) return;
    
    try {
        if (!peerConnection) {
            await initializeCall();
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            answer: answer,
            room: roomId
        });
    } catch (err) {
        console.error('Error handling offer:', err);
        updateStatus('fas fa-exclamation-circle', 'Error handling call', 'text-red-400');
    }
});
function updateParticipantCount(count) {
    participantCount.textContent = count;
}

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Reset push-to-talk state
    pushToTalkActive = false;
    const pushToTalkBtn = document.getElementById('pushToTalkBtn');
    if (pushToTalkBtn) {
        pushToTalkBtn.classList.remove('active');
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
}

// Helpful for debugging
peerConnection.addEventListener('signalingstatechange', () => 
    console.log('Signaling state changed to:', peerConnection.signalingState));

peerConnection.addEventListener('iceconnectionstatechange', () => 
    console.log('ICE connection state:', peerConnection.iceConnectionState));

// Initialize call when socket connects
socket.on('connect', () => {
    socket.emit('join', { room: roomId });
    initializeCall();
});

// Handle answer from other peer
socket.on('answer', async (data) => {
    if (data.sender === socket.id || !peerConnection) return;
    
    try {
        // Check current signaling state
        if (peerConnection.signalingState !== 'have-local-offer') {
            console.warn('Wrong state for answer:', peerConnection.signalingState);
            pendingAnswer = data.answer; // Store for later
            return;
        }

        isSettingRemoteAnswer = true;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        isSettingRemoteAnswer = false;
        
        // Process any pending candidates
        if (pendingAnswer) {
            const answer = pendingAnswer;
            pendingAnswer = null;
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
        
        updateStatus('fas fa-check-circle', 'Connected! Push to talk', 'text-green-400');
    } catch (err) {
        console.error('Error handling answer:', err);
        updateStatus('fas fa-exclamation-circle', 'Error connecting', 'text-red-400');
    }
});
// Handle ICE candidates
socket.on('candidate', async (data) => {
    if (data.sender === socket.id || !peerConnection) return;
    
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
});

// Handle room events
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






