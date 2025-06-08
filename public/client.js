const socket = io();
let localStream;
let peerConnection;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusDiv = document.getElementById('status');

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
  });

socket.on('waiting', () => {
  statusDiv.textContent = "Waiting for a partner...";
});

socket.on('partner-found', (partnerId) => {
  statusDiv.textContent = "Partner found! Connecting...";
  startWebRTC(true);
});

socket.on('signal', async (data) => {
  if (!peerConnection) startWebRTC(false);

  if (data.sdp) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === 'offer') {
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', { sdp: answer });
    }
  }
  if (data.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) { }
  }
});

socket.on('partner-disconnected', () => {
  statusDiv.textContent = "Partner disconnected.";
  if (peerConnection) peerConnection.close();
  peerConnection = null;
  remoteVideo.srcObject = null;
});

function startWebRTC(isCaller) {
  peerConnection = new RTCPeerConnection(config);
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { candidate: event.candidate });
    }
  };
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  if (isCaller) {
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => socket.emit('signal', { sdp: peerConnection.localDescription }));
  }
}
// In client.js
let dataChannel;

function setupDataChannel(isCaller) {
  if (isCaller) {
    dataChannel = peerConnection.createDataChannel("chat");
  } else {
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
    };
  }

  dataChannel.onmessage = (event) => {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML += `<div>${event.data}</div>`;
  };
}

function sendMessage() {
  const input = document.getElementById('message-input');
  dataChannel.send(input.value);
  input.value = '';
}

// Modify startWebRTC function
function startWebRTC(isCaller) {
  // ... existing code ...
  setupDataChannel(isCaller);
}
function hangUp() {
  peerConnection.close();
  localStream.getTracks().forEach(track => track.stop());
  socket.emit('disconnect-peer');
  document.getElementById('status').textContent = "Call ended";
}
// In server.js
io.on('connection', (socket) => {
  socket.on('report-user', (reportedId) => {
    // Log report to database
    console.log(`User ${socket.id} reported ${reportedId}`);
  });
});
function reportUser() {
  if (peerConnection) {
    socket.emit('report-user', peerConnection.id);
  }
}
