// === DOM Elements ===
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const statusDiv = document.getElementById('status');

const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const endBtn = document.getElementById('endBtn');
const shareBtn = document.getElementById('shareBtn');

// === WebRTC and Socket.io Setup ===
const socket = io();
let localStream;
let remoteStream;
let peerConnection;
let dataChannel;
let isAudioMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
let screenStream;

// ICE servers: add your TURN server here for production
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
    // { urls: 'turn:your-turn-server:3478', username: 'user', credential: 'pass' }
  ]
};

// === Utility: Add Message Bubble ===
function addMessage(text, fromMe = false) {
  const bubble = document.createElement('div');
  bubble.className = `p-2 rounded-lg max-w-xs break-words ${fromMe ? 'bg-blue-500 text-white self-end ml-auto' : 'bg-gray-200 text-gray-900 self-start mr-auto'}`;
  bubble.textContent = text;
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// === Chat Send Function ===
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !dataChannel || dataChannel.readyState !== "open") return;
  dataChannel.send(text);
  addMessage(text, true);
  messageInput.value = '';
}

// Enter key sends message
messageInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') sendMessage();
});

// === Media and WebRTC Setup ===
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    statusDiv.textContent = "Waiting for a partner...";
    socket.emit('join');
  } catch (err) {
    statusDiv.textContent = "Could not access camera/microphone.";
    console.error(err);
  }
}

function createPeerConnection(isInitiator) {
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Add local tracks
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;
    }
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  // ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { candidate: event.candidate });
    }
  };

  // Data channel (chat)
  if (isInitiator) {
    dataChannel = peerConnection.createDataChannel("chat");
    setupDataChannel();
  } else {
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel();
    };
  }
}

function setupDataChannel() {
  dataChannel.onopen = () => {
    statusDiv.textContent = "Chat ready!";
  };
  dataChannel.onmessage = (event) => {
    addMessage(event.data, false);
  };
}

// === Socket.io Event Handlers ===
socket.on('waiting', () => {
  statusDiv.textContent = "Waiting for a partner...";
});

socket.on('partner-found', async () => {
  statusDiv.textContent = "Partner found! Connecting...";
  createPeerConnection(true);
  // Create and send offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('signal', { sdp: peerConnection.localDescription });
});

socket.on('signal', async (data) => {
  if (!peerConnection) createPeerConnection(false);

  if (data.sdp) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === 'offer') {
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', { sdp: peerConnection.localDescription });
    }
  }
  if (data.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {}
  }
});

socket.on('partner-disconnected', () => {
  statusDiv.textContent = "Partner disconnected.";
  if (peerConnection) peerConnection.close();
  peerConnection = null;
  remoteVideo.srcObject = null;
  remoteStream = null;
  dataChannel = null;
});

// === Call Control Buttons ===
muteBtn.onclick = () => {
  if (!localStream) return;
  isAudioMuted = !isAudioMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isAudioMuted);
  muteBtn.textContent = isAudioMuted ? "🔇" : "🎤";
};

videoBtn.onclick = () => {
  if (!localStream) return;
  isVideoOff = !isVideoOff;
  localStream.getVideoTracks().forEach(track => track.enabled = !isVideoOff);
  videoBtn.textContent = isVideoOff ? "📷" : "🎥";
};

endBtn.onclick = () => {
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  socket.disconnect();
  statusDiv.textContent = "Call ended.";
  setTimeout(() => window.location.reload(), 1500);
};

shareBtn.onclick = async () => {
  if (isScreenSharing) {
    stopScreenShare();
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    sender.replaceTrack(screenTrack);
    screenTrack.onended = () => {
      stopScreenShare();
    };
    isScreenSharing = true;
    shareBtn.textContent = "🛑";
  } catch (err) {
    console.error("Screen share error:", err);
  }
};

function stopScreenShare() {
  if (!screenStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
  sender.replaceTrack(videoTrack);
  screenStream.getTracks().forEach(track => track.stop());
  isScreenSharing = false;
  shareBtn.textContent = "🖥️";
}
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};



// === Start Everything ===
initMedia();
