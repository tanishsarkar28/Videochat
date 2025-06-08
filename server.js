const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let waitingUser = null;

io.on('connection', (socket) => {
  if (waitingUser) {
    // Pair the current user with the waiting user
    socket.partner = waitingUser;
    waitingUser.partner = socket;
    waitingUser.emit('partner-found', socket.id);
    socket.emit('partner-found', waitingUser.id);
    waitingUser = null;
  } else {
    waitingUser = socket;
    socket.emit('waiting');
  }

  socket.on('signal', (data) => {
    if (socket.partner) {
      socket.partner.emit('signal', data);
    }
  });

  socket.on('disconnect', () => {
    if (socket.partner) {
      socket.partner.emit('partner-disconnected');
      socket.partner.partner = null;
    }
    if (waitingUser === socket) {
      waitingUser = null;
    }
  });
});

http.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
