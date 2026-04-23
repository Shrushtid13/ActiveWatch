const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];
app.use(cors({ origin: allowedOrigins }));

const HISTORY_FILE = path.join(__dirname, 'history.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Request Logger for Debugging
app.use((req, res, next) => {
  console.log(`[BACKEND_LOG] ${req.method} ${req.url}`);
  next();
});

// Diagnostic Heartbeat
app.get('/ping', (req, res) => res.json({ status: 'UP', timestamp: Date.now() }));

// Initialize history file
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify({ sessions: [] }, null, 2));
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } 
  catch (e) { return { sessions: [] }; }
}

function saveSession(session) {
  const data = loadHistory();
  data.sessions.push(session);
  if (data.sessions.length > 100) data.sessions.shift();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

// User Persistence Logic
function saveUsers(usersMap) {
  const data = Object.fromEntries(usersMap);
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const defaults = new Map([
      ['admin@activewatch.com', { 
        password: '$2b$10$fKltPyBSLkZHGnz3rlqamOOUa4CrmO5QM6qFij6BvsdOmO1eFqkPq', // pass123
        displayName: 'System Admin', role: 'super_admin', recoveryCode: '123456',
        sessionCount: 0, totalActiveTime: 0, lastActivity: null, lastSessionStart: null,
        isActive: false, activeModule: null, activityHistory: [], latency: 0,
        lastInteractionType: 'SIGNAL', moduleStats: {}
      }],
      ['user@activewatch.com', { 
        password: '$2b$10$fKltPyBSLkZHGnz3rlqamOOUa4CrmO5QM6qFij6BvsdOmO1eFqkPq', // pass123
        displayName: 'Regular User', role: 'user', recoveryCode: '123456',
        sessionCount: 0, totalActiveTime: 0, lastActivity: null, lastSessionStart: null,
        isActive: false, activeModule: null, activityHistory: [], latency: 0,
        lastInteractionType: 'SIGNAL', moduleStats: {}
      }]
    ]);
    saveUsers(defaults);
    return defaults;
  }
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return new Map(Object.entries(data));
  } catch (e) {
    return new Map();
  }
}

const users = loadUsers();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

function calculateRPM(history) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const recent = history.filter(ts => ts > oneMinuteAgo);
  return recent.length;
}

// Utility to broadcast updates
function broadcastSnapshot() {
  const snapshot = [];
  const now = Date.now();
  users.forEach((data, email) => {
    // Cleanup old history
    data.activityHistory = data.activityHistory.filter(ts => ts > (now - 60000));
    
    snapshot.push({
      email,
      displayName: data.displayName,
      isActive: data.isActive,
      lastActivity: data.lastActivity,
      totalActiveTime: data.totalActiveTime,
      sessionCount: data.sessionCount,
      role: data.role,
      activeModule: data.activeModule,
      rpm: calculateRPM(data.activityHistory),
      latency: data.latency,
      lastInteractionType: data.lastInteractionType,
      moduleStats: data.moduleStats
    });
  });
  io.emit('snapshot', snapshot);
}

// REST: Get History
app.get('/history', (req, res) => {
  res.json(loadHistory());
});

// REST: Registration
app.post('/register', async (req, res) => {
  const { email, password, displayName, recoveryCode } = req.body;
  if (!email || !password || !displayName || !recoveryCode) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  if (users.has(email)) {
    return res.status(409).json({ success: false, error: 'Email already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.set(email, {
    password: hashedPassword,
    displayName,
    role: 'user',
    recoveryCode,
    sessionCount: 0,
    totalActiveTime: 0,
    lastActivity: Date.now(),
    lastSessionStart: null,
    isActive: false,
    activeModule: null,
    activityHistory: [],
    latency: 0,
    lastInteractionType: 'SIGNAL',
    moduleStats: {}
  });
  
  res.status(201).json({ success: true, user: { email, displayName, role: 'user' } });
  saveUsers(users);
});

// REST: Reset Password
app.post('/reset-password', async (req, res) => {
  const { email, recoveryCode, newPassword } = req.body;
  if (!email || !recoveryCode || !newPassword) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  const user = users.get(email);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User node not found' });
  }
  if (user.recoveryCode !== recoveryCode) {
    return res.status(401).json({ success: false, error: 'Invalid recovery code' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  users.set(email, user);
  saveUsers(users);
  res.json({ success: true, message: 'Password updated successfully' });
});

// REST: Update Profile (Security Command)
app.post('/update-profile', async (req, res) => {
  const { email, currentPassword, newPassword, newRecoveryCode } = req.body;
  if (!email || !currentPassword) {
    return res.status(400).json({ success: false, error: 'Email and current password are required' });
  }
  const user = users.get(email);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User node not found' });
  }
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Current credential is invalid' });
  }
  if (newPassword) {
    user.password = await bcrypt.hash(newPassword, 10);
  }
  if (newRecoveryCode) {
    user.recoveryCode = newRecoveryCode;
  }
  users.set(email, user);
  saveUsers(users);
  res.json({ success: true, message: 'Profile updated successfully', recoveryCode: user.recoveryCode });
});

// REST: Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  res.json({ success: true, user: { email, displayName: user.displayName, role: user.role } });
});

// REST: Logout
app.post('/logout', (req, res) => {
  const { email } = req.body;
  const u = users.get(email);
  if (u) {
    if (u.isActive) {
      const duration = Date.now() - (u.lastSessionStart || Date.now());
      u.totalActiveTime += duration;
      u.isActive = false;
      u.lastSessionStart = null;
      u.activeModule = null;
      
      saveSession({
        email,
        displayName: u.displayName,
        end: Date.now(),
        duration,
        type: 'LOGOUT',
        variety: Array.from(new Set(u.activityHistory)).length
      });
    }
  }
  res.json({ success: true });
  broadcastSnapshot();
});

// Socket.IO Logic
io.on('connection', (socket) => {
  const email = socket.handshake.query.email;
  const roleRequest = socket.handshake.query.role;
  
  const actualUser = users.get(email);
  const userRole = actualUser ? actualUser.role : 'observer';

  if (roleRequest === 'admin' && userRole !== 'admin' && userRole !== 'super_admin') {
    return socket.disconnect();
  }

  if (userRole === 'admin' || userRole === 'super_admin') {
    const snapshot = Array.from(users.entries()).map(([uid, u]) => ({ 
      ...u, 
      email: uid, 
      rpm: calculateRPM(u.activityHistory) 
    }));
    socket.emit('snapshot', snapshot);

    // Dynamic Admin Role Promotion System
    socket.on('admin:promote_user', (targetEmail) => {
      if (userRole !== 'super_admin') return; // Strict Master Admin restriction

      const targetUser = users.get(targetEmail);
      if (targetUser && targetUser.role !== 'admin' && targetUser.role !== 'super_admin') {
        targetUser.role = 'admin';
        saveUsers(users);
        broadcastSnapshot();
      }
    });

    socket.on('admin:demote_user', (targetEmail) => {
      if (userRole !== 'super_admin') return; // Strict Master Admin restriction

      const targetUser = users.get(targetEmail);
      // Prevent admins from demoting themselves or other super admins
      if (targetUser && targetUser.role === 'admin' && targetEmail !== email) {
        targetUser.role = 'user';
        saveUsers(users);
        broadcastSnapshot();
      }
    });
  }

  if (email && actualUser) {
    actualUser.sessionCount++;
    actualUser.lastActivity = Date.now();
    
    actualUser.isActive = true;
    if (!actualUser.lastSessionStart) actualUser.lastSessionStart = Date.now();
    if (!actualUser.activeModule) actualUser.activeModule = 'PORTAL_IDLE';
    
    // Latency Ping-Pong
    socket.on('latency:ping', (ts) => {
      socket.emit('latency:pong', ts);
    });

    socket.on('latency:report', (milli) => {
      const u = users.get(email);
      if (u) u.latency = milli;
    });

    socket.on('user:activity', (payload) => {
      const u = users.get(email);
      if (u) {
        if (!u.isActive) {
          u.isActive = true;
          u.lastSessionStart = Date.now();
        }
        u.lastActivity = Date.now();
        if (payload?.moduleId) {
           u.activeModule = payload.moduleId;
           u.moduleStats[u.activeModule] = (u.moduleStats[u.activeModule] || 0) + 1;
        }
        u.lastInteractionType = payload?.type || 'SIGNAL';
        u.activityHistory.push(Date.now());
        
        io.emit('user:activity', { 
           email, 
           lastActivity: u.lastActivity, 
           activeModule: u.activeModule,
           lastInteractionType: u.lastInteractionType,
           moduleStats: u.moduleStats
        });
      }
    });

    socket.on('disconnect', () => {
      const u = users.get(email);
      if (u) {
        u.sessionCount--;
        if (u.sessionCount <= 0) {
          u.sessionCount = 0;
          if (u.isActive) {
            const sessionDuration = Date.now() - (u.lastSessionStart || Date.now());
            u.totalActiveTime += sessionDuration;
            u.isActive = false;
            u.lastSessionStart = null;
            u.activeModule = null;

            saveSession({
              email,
              displayName: u.displayName,
              end: Date.now(),
              duration: sessionDuration,
              type: 'DISCONNECT'
            });
          }
        }
      }
    });
  }
});

// Inactivity Sweep (Idle Watchdog Logic starts here)
const INACTIVITY_THRESHOLD = 60 * 1000;
setInterval(() => {
  const now = Date.now();
  users.forEach((u, email) => {
    if (u.isActive && u.lastActivity && (now - u.lastActivity > INACTIVITY_THRESHOLD)) {
      const duration = now - (u.lastSessionStart || now);
      u.totalActiveTime += duration;
      u.isActive = false;
      u.lastSessionStart = null;
      u.activeModule = null;

      saveSession({
        email,
        displayName: u.displayName,
        end: now,
        duration,
        type: 'INACTIVITY_TIMEOUT'
      });
      
      io.emit('user:update', { 
        email, 
        isActive: false, 
        lastActivity: u.lastActivity,
        sessionCount: u.sessionCount,
        totalActiveTime: u.totalActiveTime
      });
    }
  });
}, 10000);

// Periodic Broadcast for Admin Live update
setInterval(() => {
  broadcastSnapshot();
}, 5000);

const PORT = process.env.PORT || 3008;
server.listen(PORT, () => console.log(`ActiveWatch Real-time Engine running on port ${PORT}`));