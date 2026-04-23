import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { io } from "socket.io-client";

const GAMES = [
  { id: 'lumina', name: 'Lumina Link', icon: '✨', gradient: 'from-indigo-400 to-cyan-300', desc: 'Establish resonance between floating light nodes.' },
  { id: 'strike', name: 'Vector Dash', icon: '🏃', gradient: 'from-emerald-400 to-teal-300', desc: 'Navigate data lanes and bypass system firewalls.' },
  { id: 'blitz', name: 'Binary Blitz', icon: '⚡', gradient: 'from-amber-400 to-orange-300', desc: 'High-speed reflex data-tap protocol.' },
  { id: 'match', name: 'Zen Match', icon: '🧩', gradient: 'from-purple-400 to-pink-300', desc: 'Synchronize cognitive pattern nodes.' },
  { id: 'pop', name: 'Pixel Pop', icon: '🫧', gradient: 'from-rose-400 to-red-300', desc: 'High-speed color synchronization protocol.' }
];

function App() {
  const [socket, setSocket] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [connectedEmail, setConnectedEmail] = useState(() => localStorage.getItem('userSession') || "");
  const [userRole, setUserRole] = useState(() => localStorage.getItem('userRole') || "user");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('userSession'));
  const [showLanding, setShowLanding] = useState(() => !localStorage.getItem('userSession'));
  const [leaderboard, setLeaderboard] = useState({ lumina: [], strike: [], blitz: [], match: [], pop: [] });
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [round, setRound] = useState(1);
  const [showRoundUp, setShowRoundUp] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [users, setUsers] = useState({});
  const [authError, setAuthError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [status, setStatus] = useState("disconnected");

  // Stats
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [activeGame, setActiveGame] = useState(null);
  const [accessNotification, setAccessNotification] = useState(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // --- Hyper-Casual Game States ---
  // 1. Lumina Link
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [links, setLinks] = useState([]);

  // 2. Vector Dash
  const [playerLane, setPlayerLane] = useState(1);
  const [targets, setTargets] = useState([]); // Used for obstacles and shards

  // 3. Binary Blitz
  const [blitzTarget, setBlitzTarget] = useState(null);

  // 4. Zen Match
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);

  // 5. Pixel Pop
  const [targetColor, setTargetColor] = useState('indigo');

  // --- Sound Engine (Synthesized) ---
  const audioCtx = useRef(null);
  const ambientNode = useRef(null);
  const scoreRef = useRef(0);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume();
  };

  const playClick = useCallback((freq = 400, type = 'sine', duration = 0.1, vol = 0.1, endFreq = null) => {
    if (!soundEnabled || !audioCtx.current) return;
    try {
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.current.currentTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.current.currentTime + duration);
      gain.gain.setValueAtTime(vol, audioCtx.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.current.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.current.destination);
      osc.start(); osc.stop(audioCtx.current.currentTime + duration);
    } catch (e) { console.warn("Audio Context Collision"); }
  }, [soundEnabled]);

  const toggleAmbiance = useCallback((on) => {
    if (!audioCtx.current) return;
    if (on) {
      if (ambientNode.current) return;
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      const filter = audioCtx.current.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(40, audioCtx.current.currentTime);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, audioCtx.current.currentTime);
      gain.gain.setValueAtTime(0.02, audioCtx.current.currentTime);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.current.destination);
      osc.start();
      ambientNode.current = { osc, gain };
    } else if (ambientNode.current) {
      ambientNode.current.gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.current.currentTime + 0.5);
      const node = ambientNode.current;
      setTimeout(() => {
        try { node.osc.stop(); } catch(e) {}
        ambientNode.current = null;
      }, 500);
    }
  }, []);

  useEffect(() => {
    toggleAmbiance(soundEnabled);
    return () => toggleAmbiance(false);
  }, [soundEnabled, toggleAmbiance]);

  const triggerActivity = useCallback((moduleId = activeGame, type = 'SIGNAL') => {
    if (socket && loggedIn) socket.emit("user:activity", { moduleId, type });
  }, [socket, loggedIn, activeGame]);

  // Socket setup
  useEffect(() => {
    let activeSocket;
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3008";
    if (!loggedIn) { activeSocket = io(backendUrl, { query: { role: 'observer' } }); }
    else { activeSocket = io(backendUrl, { query: { email: connectedEmail, role: userRole } }); }
    activeSocket.on("connect", () => setStatus("connected"));
    activeSocket.on("user:update", (data) => {
      setUsers(p => ({ ...p, [data.email]: data }));
      if (data.email === connectedEmail) {
        setUserRole(data.role);
        localStorage.setItem('userRole', data.role);
      }
    });
    activeSocket.on("latency:pong", (ts) => activeSocket.emit("latency:report", Date.now() - ts));
    activeSocket.on("leaderboard:update", (data) => setLeaderboard(data));
    activeSocket.on("notification:request_status", (data) => {
      // Only handle if it belongs to this user
      if (data.email === connectedEmail || localStorage.getItem('userSession') === data.email) {
        setAccessNotification(data);
      }
    });
    setSocket(activeSocket);
    return () => activeSocket.close();
  }, [loggedIn, connectedEmail, userRole]);

  // Session Synchronization Protocol
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const syncEmail = params.get('sync_session');
    
    if (syncEmail) {
      const currentSession = localStorage.getItem('userSession');
      // If the synced ID is different from current session, force a reset
      if (syncEmail !== currentSession) {
        localStorage.removeItem('userSession');
        localStorage.removeItem('userRole');
        setLoggedIn(false);
        setConnectedEmail("");
        setShowLanding(true);
        // Optionally pre-fill the email for the admin
        setEmail(syncEmail);
      }
      // Clean up URL to keep it pretty
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  useEffect(() => {
    if (!socket || !loggedIn) return;
    const i1 = setInterval(() => socket.emit("latency:ping", Date.now()), 5000);
    const i2 = setInterval(() => triggerActivity(activeGame, 'IDLE_BEAT'), 15000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [socket, loggedIn, activeGame, triggerActivity]);

  const updateScore = useCallback((points) => {
    setScore(prev => {
      const next = prev + points;
      scoreRef.current = next;
      // Calculate current round: 1-499: R1, 500-999: R2, 1000-1499: R3
      const calculatedRound = Math.floor(next / 500) + 1;
      setRound(prevR => {
        if (calculatedRound > prevR) {
          setShowRoundUp(true);
          setIsShaking(true);
          setTimeout(() => { setShowRoundUp(false); setIsShaking(false); }, 2000);
          playClick(1200, 'sine', 0.2, 0.4, 2000); // Epic round shift
          return calculatedRound;
        }
        return prevR;
      });
      return next;
    });
  }, [round]);

  // --- Game Initializers ---
  const initLumina = () => {
    const syms = ['💎', '🌟', '🔮', '💠'];
    const newNodes = [...syms, ...syms].map((s, i) => ({
      id: i, s, x: 50 + Math.random() * 300, y: 50 + Math.random() * 200,
      dx: (Math.random() - 0.5) * 2, dy: (Math.random() - 0.5) * 2, done: false
    }));
    setNodes(newNodes); setLinks([]); setSelectedNode(null);
  };
  const initStrike = () => { setPlayerLane(1); setTargets([]); };
  const initBlitz = () => { setBlitzTarget(Math.floor(Math.random() * 9)); };
  const initMatch = () => {
    const syms = ['🛡️', '🔑', '💾', '🛰️', '📡', '💻', '⚡', '⛓️'];
    setCards([...syms, ...syms].sort(() => Math.random() - 0.5).map((s, i) => ({ id: i, s, done: false })));
    setFlipped([]);
  };
  const initPop = () => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e'];
    setTargetColor(colors[Math.floor(Math.random() * colors.length)]);
  };

  useEffect(() => {
    if (activeGame) {
      scoreRef.current = 0;
      setScore(0);
      setHealth(100);
      setRound(1);
    }
  }, [activeGame]);

  // --- Game Loops ---
  useEffect(() => {
    if (!activeGame) return;
    const loop = setInterval(() => {
      setHealth(h => {
        const next = Math.max(0, h - (0.1 + (round * 0.05))); // Difficulty increases with round
        if (next === 0 && h > 0) {
          // Game Over logic
          if (socket) socket.emit('game:submit_score', { game: activeGame, score: scoreRef.current });
        }
        return next;
      });


      if (activeGame === 'lumina') {
        setNodes(prev => prev.map(n => {
          if (n.done) return n;
          let nx = n.x + n.dx, ny = n.y + n.dy;
          if (nx < 20 || nx > 380) n.dx *= -1;
          if (ny < 20 || ny > 280) n.dy *= -1;
          return { ...n, x: nx, y: ny };
        }));
      }

      if (activeGame === 'strike') {
        setTargets(prev => {
          let next = prev.map(t => ({ ...t, y: t.y + 6 + (round * 0.5) })).filter(t => t.y < 350);
          if (next.length < 5 && Math.random() > 0.94) next.push({ lane: Math.floor(Math.random() * 3), y: -50, type: Math.random() > 0.8 ? 'shard' : 'wall' });
          
          const collision = next.find(t => t.y > 230 && t.y < 270 && t.lane === playerLane);
          if (collision) {
             if (collision.type === 'wall') { setHealth(h => Math.max(0, h - 20)); playClick(100, 'square', 0.1); }
             else { 
               updateScore(200); 
               setHealth(h => Math.min(100, h + 5)); 
               playClick(1000, 'sine', 0.1, 0.1, 1500); // Shard collect glide
             }
             return next.filter(t => t !== collision);
          }
          return next;
        });
      }
    }, 40);
    return () => clearInterval(loop);
  }, [activeGame, targets]);

  const handleAction = (moduleId) => {
    triggerActivity(moduleId, 'MODULE_ACTION');
    if (moduleId === 'strike') {
      setPlayerLane(l => (l + 1) % 3);
      playClick(400, 'square', 0.05, 0.05); // Rapid lane shift
    }
    if (moduleId === 'lumina') playClick(800, 'sine', 0.05, 0.1);
    if (moduleId === 'blitz') playClick(700, 'sine', 0.05, 0.05);
    if (moduleId === 'match') playClick(600, 'triangle', 0.05, 0.1);
    if (moduleId === 'pop') playClick(1200, 'sine', 0.05, 0.1, 1600); // Slide up pop!
  };

  const handleAuth = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3008";
      const res = await fetch(`${backendUrl}${isRegisterMode ? "/register" : "/login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isRegisterMode ? { email, password, displayName, recoveryCode } : { email, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('userSession', email);
        localStorage.setItem('userRole', data.user.role);
        setLoggedIn(true);
        setConnectedEmail(email);
        setUserRole(data.user.role);
      } else {
        setAuthError(data.error);
      }
    } catch (err) {
      setAuthError("UPLINK_FAILURE: Core engine unreachable.");
    }
  };

  const handleReset = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3008";
      const res = await fetch(`${backendUrl}/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, recoveryCode, newPassword: password })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg("Security uplink reset successful. You may now authenticate.");
        setIsResetMode(false); setAuthError("");
      } else {
        setAuthError(data.error);
      }
    } catch (err) {
      setAuthError("BYPASS_FAILURE: Security server offline.");
    }
  };

  return (
    <div className={`min-h-screen bg-[#05080f] text-[#d1d5db] font-sans selection:bg-indigo-500/30 flex flex-col transition-all duration-500 ${isShaking ? 'scale-[1.01] brightness-125' : ''}`}>
      {/* Access Request Status Alert */}
      {accessNotification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-lg animate-in slide-in-from-top-10 duration-500">
          <div className="bg-[#080c16]/95 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl p-8 flex flex-col gap-6">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${accessNotification.status === 'ACCEPTED' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]'}`} />
                  <p className={`text-[11px] font-black uppercase tracking-[0.3em] ${accessNotification.status === 'ACCEPTED' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Access {accessNotification.status}
                  </p>
                </div>
                <p className="text-sm text-slate-100 font-sans font-medium leading-relaxed">
                  {accessNotification.message}
                </p>
              </div>
              <button 
                onClick={() => setAccessNotification(null)}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 text-slate-500 hover:bg-white/10 hover:text-white transition-all text-xl"
              >
                ×
              </button>
            </div>
            {accessNotification.status === 'ACCEPTED' && (
              <button 
                onClick={() => window.location.href = 'http://localhost:5174'}
                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-indigo-600/30"
              >
                Launch Command Center
              </button>
            )}
          </div>
        </div>
      )}
      {/* Immersive Data Stream Background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] overflow-hidden -z-10">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="absolute text-[8px] font-mono whitespace-nowrap animate-pulse" 
               style={{ left: `${i * 5}%`, top: '-10%', animationDuration: `${2 + Math.random() * 4}s`, animationDelay: `${Math.random() * 2}s` }}>
            {Array(50).fill(0).map(() => Math.round(Math.random())).join('')}
          </div>
        ))}
      </div>

      <nav className="w-full border-b border-white/[0.05] bg-[#05080f]/80 backdrop-blur-md sticky top-0 z-50 px-6 md:px-10 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">🛡️</div>
          <span className="text-lg md:text-xl font-bold tracking-tight text-white uppercase flex items-center gap-2">ActiveLink <span className="text-indigo-500 font-medium hidden sm:inline">Arcade</span></span>
        </div>
        <div className="flex gap-2 sm:gap-6 items-center">
          {loggedIn ? (
            <>
              <button 
                onClick={() => { initAudio(); setSoundEnabled(!soundEnabled); }} 
                className={`text-xs font-bold transition-all uppercase tracking-widest px-3 py-2 border rounded-xl flex items-center gap-2 ${soundEnabled ? 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5' : 'text-slate-500 border-white/5 bg-white/5'}`}
              >
                {soundEnabled ? '🔊' : '🔇'} <span className="hidden md:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
              </button>
              <button onClick={() => setShowLeaderboard(true)} className="text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-widest px-3 py-2 border border-white/5 rounded-xl bg-white/5">🏆 <span className="hidden md:inline">Leaderboard</span></button>
            </>
          ) : (
            <a href="http://localhost:5174" className="text-xs font-semibold text-slate-500 hover:text-white transition-colors uppercase tracking-widest flex items-center gap-2">
              <span className="opacity-50">🛡️</span> Admin Console
            </a>
          )}
          {loggedIn && (
            <div className="relative">
              <button 
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-white hover:bg-white/10 transition-all shadow-lg"
              >
                {connectedEmail ? connectedEmail.charAt(0).toUpperCase() : 'U'}
              </button>

              {showProfileDropdown && (
                <div className="absolute right-0 mt-4 w-64 bg-[#0a0f1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-4">
                    <div className="pb-4 border-b border-white/5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Authenticated Email</p>
                      <p className="text-sm font-semibold text-white truncate">{connectedEmail}</p>
                      <div className="mt-2 inline-block px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold text-indigo-400 uppercase tracking-tight">
                         {userRole.replace('_', ' ')} Access
                      </div>
                    </div>

                    <div className="space-y-2">
                       {userRole === 'user' ? (
                        <button 
                          id="req_admin_btn"
                          onClick={() => {
                            socket.emit('admin:request_access', { email: connectedEmail, name: displayName || connectedEmail });
                            const btn = document.getElementById('req_admin_btn');
                            if (btn) {
                              btn.innerText = "REQUEST PENDING...";
                              btn.disabled = true;
                            }
                          }} 
                          className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-wide"
                        >
                          Request Admin Hub
                        </button>
                      ) : (
                        <a 
                          href={`http://localhost:5174?sync_session=${connectedEmail}`}
                          className="block w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-indigo-400 hover:text-white hover:bg-indigo-500/10 transition-all uppercase tracking-wide"
                        >
                          Enter Admin Hub →
                        </a>
                      )}
                      
                      <button 
                        onClick={() => {
                          const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:3008";
                          fetch(`${backendUrl}/logout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: connectedEmail }) });
                          localStorage.removeItem('userSession');
                          localStorage.removeItem('userRole');
                          setLoggedIn(false); setActiveGame(null); setConnectedEmail("");
                          setShowProfileDropdown(false);
                          setShowLanding(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 transition-all uppercase tracking-wide"
                      >
                        Terminate Session (Log Out)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-10 flex-1 flex flex-col justify-center">
        {!loggedIn ? (
          showLanding ? (
            <div className="flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in zoom-in duration-700 relative h-full">
              {/* Background Decorative Elements */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[100px] -z-10 animate-pulse" />

              <div className="space-y-6 relative px-4">
                <h1 className="text-5xl xs:text-6xl md:text-9xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-indigo-200 to-cyan-300 drop-shadow-[0_0_40px_rgba(99,102,241,0.3)] leading-[0.9]">
                  ARCADE<br />PORTAL
                </h1>
                <p className="text-slate-400 text-sm md:text-lg max-w-3xl mx-auto font-medium leading-relaxed tracking-wide px-2">
                  Step into the ActiveLink Arcade! Choose from our unique collection of games,
                  compete for high scores, and enjoy a seamless real-time experience while you play.
                </p>
              </div>

              <div className="flex justify-center">
                <button onClick={() => { initAudio(); setShowLanding(false); }} className="group relative px-12 py-6 bg-white text-black rounded-2xl font-bold text-sm tracking-widest uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300">
                  Play Now →
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center -mt-6 sm:-mt-8 animate-in fade-in zoom-in-95 duration-500">
              <div className="p-8 md:p-10 rounded-[2rem] w-full max-w-md bg-white/[0.01] border border-white/[0.05] shadow-2xl space-y-6">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-white tracking-tight mb-2 uppercase">
                    {isResetMode ? "Reset Password" : isRegisterMode ? "Join the Arcade" : "Welcome Back"}
                  </h2>
                  <p className="text-slate-500 text-sm font-medium">
                    {isResetMode ? "Enter your details to reset your password" : "Get ready to play and set your high scores"}
                  </p>
                </div>
                <div className="space-y-4">
                  {successMsg && <p className="text-emerald-400 text-xs font-bold text-center bg-emerald-500/10 py-3 rounded-xl border border-emerald-500/20">{successMsg}</p>}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1">Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="alpha@activewatch.com" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm" />
                  </div>

                  {isResetMode && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1">Recovery Code</label>
                      <input type="text" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} placeholder="Hex-000" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1">{isResetMode ? "New Password" : "Account Password"}</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm" />
                  </div>

                  {isRegisterMode && (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1">Your Name</label>
                        <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Player One" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1">Recovery Code</label>
                        <input type="text" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} placeholder="Hex-000" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm" />
                      </div>
                    </>
                  )}

                  {authError && <p className="text-rose-400 text-xs font-medium text-center">{authError}</p>}

                  <button onClick={isResetMode ? handleReset : handleAuth} className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all text-sm tracking-wide uppercase">
                    {isResetMode ? "Change Password" : isRegisterMode ? "Sign Up" : "Log In"}
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  <button onClick={() => { setIsRegisterMode(!isRegisterMode); setIsResetMode(false); setAuthError(""); setSuccessMsg(""); }} className="w-full text-xs font-semibold text-slate-500 hover:text-indigo-400 transition-colors uppercase tracking-[0.2em]">
                    {isRegisterMode ? "Already a member? Sign In" : "New player? Create an account"}
                  </button>
                  {!isRegisterMode && (
                    <button onClick={() => { setIsResetMode(!isResetMode); setAuthError(""); setSuccessMsg(""); }} className="w-full text-[10px] font-bold text-slate-700 hover:text-rose-500 transition-colors uppercase tracking-[0.2em]">
                      {isResetMode ? "Cancel Bypass" : "Forgot Credentials?"}
                    </button>
                  )}
                  <button 
                    onClick={() => { setShowLanding(true); setAuthError(""); setSuccessMsg(""); setIsRegisterMode(false); setIsResetMode(false); }} 
                    className="w-full mt-6 text-[11px] font-bold text-slate-500 hover:text-white transition-all uppercase tracking-[0.2em] pt-6 border-t border-white/5 flex items-center justify-center gap-2"
                  >
                    <span className="text-lg leading-none">←</span> Return to Landing Page
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
              <div className="lg:col-span-1 space-y-8">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em]">Game Library</h3>
                  <div className="w-8 h-[1px] bg-indigo-500/30 lg:block hidden" />
                </div>
                <div className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible pb-4 lg:pb-0 gap-4 snap-x no-scrollbar">
                    {GAMES.map(g => (
                    <button 
                      key={g.id} 
                      onClick={() => {
                        setActiveGame(g.id); setScore(0); setHealth(100); setRound(1);
                        if (g.id === 'lumina') initLumina(); if (g.id === 'strike') initStrike();
                        if (g.id === 'blitz') initBlitz(); if (g.id === 'match') initMatch();
                        if (g.id === 'pop') initPop();
                        triggerActivity(g.id, 'MODULE_SELECT');
                        playClick(800, 'sine', 0.2);
                      }} 
                      className={`group w-full min-w-[200px] lg:min-w-0 flex items-center gap-5 p-5 rounded-3xl border transition-all duration-300 relative overflow-hidden ${
                        activeGame === g.id 
                        ? `bg-white/[0.03] border-white/20 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] scale-[1.02]` 
                        : 'bg-white/[0.02] border-white/[0.05] hover:border-white/10 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all duration-500 ${
                        activeGame === g.id ? 'bg-white shadow-xl shadow-white/10 scale-110' : 'bg-white/5'
                      }`}>
                        {g.icon}
                      </div>
                      <div className="text-left font-bold uppercase transition-all">
                        <p className={`text-sm font-bold tracking-tight transition-all ${activeGame === g.id ? 'text-white' : 'text-slate-400'}`}>
                          {g.name}
                        </p>
                        <p className={`text-[8px] font-semibold tracking-tighter mt-1 transition-all ${activeGame === g.id ? 'text-slate-400' : 'text-slate-600'}`}>
                          {g.desc}
                        </p>
                      </div>
                      {activeGame === g.id && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_white]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-3">
                <div className="bg-white/[0.01] border border-white/[0.05] rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 flex flex-col items-center justify-center min-h-[450px] md:min-h-[600px] relative overflow-hidden transition-all shadow-2xl">
                  {activeGame ? (
                    <div className="w-full flex flex-col items-center flex-1">
                      <div className="absolute top-6 left-6 right-6 flex flex-col xs:flex-row justify-between items-center gap-4 z-20">
                        <div className="flex gap-4 md:gap-8 bg-[#05080f]/80 border border-white/5 px-6 py-3 rounded-2xl backdrop-blur-xl">
                          <div className="text-center">
                            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-1">SCORE</p>
                            <p className="text-xl md:text-2xl font-bold mono text-white">{score}</p>
                          </div>
                          <div className="w-[1px] h-8 bg-white/5" />
                          <div className="text-center">
                            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-1">ROUND</p>
                            <p className="text-xl md:text-2xl font-bold mono text-indigo-400">{round}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-md">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Health</span>
                          <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div className={`h-full transition-all duration-500 ${health > 30 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${health}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="relative z-10 w-full flex flex-col items-center justify-center flex-1 mt-24 xs:mt-20 md:mt-0" onClick={() => handleAction(activeGame)}>
                        {/* Round Up Overlay */}
                        {showRoundUp && (
                          <div className="absolute inset-0 z-50 flex items-center justify-center animate-in fade-in zoom-in duration-500 pointer-events-none">
                            <h2 className="text-5xl md:text-8xl font-bold text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.8)] tracking-tight italic">ROUND {round}</h2>
                          </div>
                        )}
                        
                        {activeGame === 'lumina' && (
                          <div className="relative w-full h-[300px] md:h-[350px] bg-white/[0.01] rounded-3xl overflow-hidden border border-white/[0.05]">
                            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                              {links.map((l, i) => (
                                <line key={i} x1={l.p1.x} y1={l.p1.y} x2={l.p2.x} y2={l.p2.y} stroke="rgba(99,102,241,0.5)" strokeWidth="2" strokeDasharray="5,5" className="animate-pulse" />
                              ))}
                            </svg>
                            {nodes.map(n => (
                              <button key={n.id} onClick={(e) => {
                                e.stopPropagation();
                                if (n.done) return;
                                if (selectedNode === null) { setSelectedNode(n.id); }
                                else if (selectedNode === n.id) { setSelectedNode(null); }
                                else {
                                  const other = nodes.find(x => x.id === selectedNode);
                                  if (other.s === n.s) {
                                    setLinks(prev => [...prev, { p1: { x: other.x, y: other.y }, p2: { x: n.x, y: n.y } }]);
                                    setNodes(prev => prev.map(x => (x.id === n.id || x.id === other.id) ? { ...x, done: true } : x));
                                    updateScore(200); setHealth(h => Math.min(100, h + 20)); setSelectedNode(null);
                                    playClick(1100, 'sine', 0.2, 0.2, 1800); // Magic chime up
                                    if (nodes.filter(x => !x.done).length === 2) setTimeout(initLumina, 1000);
                                  } else { setSelectedNode(n.id); }
                                }
                                triggerActivity('lumina', 'MODULE_ACTION');
                              }} className={`absolute w-12 h-12 md:w-14 md:h-14 rounded-full border-2 transition-all flex items-center justify-center text-xl shadow-lg ${
                                n.done ? 'opacity-0 scale-50' :
                                selectedNode === n.id ? 'bg-indigo-500 border-white text-white animate-pulse' :
                                'bg-white/5 border-white/20 text-white hover:bg-white/10'
                              }`} style={{ left: n.x, top: n.y, transform: 'translate(-50%, -50%)' }}>
                                {n.s}
                              </button>
                            ))}
                          </div>
                        )}

                        {activeGame === 'strike' && (
                          <div className="relative w-full h-[300px] overflow-hidden bg-white/[0.01] rounded-3xl border border-white/[0.05]">
                             <div className="absolute inset-0 flex">
                               <div className="flex-1 border-r border-white/5" />
                               <div className="flex-1 border-r border-white/5" />
                               <div className="flex-1" />
                             </div>
                             <div className="absolute bottom-8 w-1/3 flex justify-center transition-all duration-200" style={{ transform: `translateX(${playerLane * 100}%)` }}>
                               <div className="w-12 h-12 bg-white rounded-xl shadow-[0_0_30px_white] flex items-center justify-center text-xl animate-bounce">🚀</div>
                             </div>
                             {targets.map((t, i) => (
                               <div key={i} className={`absolute w-1/3 flex justify-center transition-linear`} style={{ top: t.y, transform: `translateX(${t.lane * 100}%)` }}>
                                 <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${t.type === 'wall' ? 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]' : 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'}`}>
                                   {t.type === 'wall' ? '🔥' : '💎'}
                                 </div>
                               </div>
                             ))}
                             <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-700 uppercase tracking-widest">Tap to switch lanes</p>
                          </div>
                        )}

                        {activeGame === 'blitz' && (
                          <div className="grid grid-cols-3 gap-4">
                            {[...Array(9)].map((_, i) => (
                              <button key={i} onClick={(e) => {
                                e.stopPropagation();
                                if (i === blitzTarget) { 
                                  updateScore(25); setHealth(h => Math.min(100, h + 8)); initBlitz(); 
                                  triggerActivity('blitz', 'MODULE_ACTION');
                                  playClick(1500, 'sine', 0.1, 0.05);
                                }
                                else {
                                  setHealth(h => Math.max(0, h - 5));
                                  playClick(200, 'sawtooth', 0.1, 0.2);
                                }
                              }} className={`w-20 h-20 rounded-2xl border transition-all ${i === blitzTarget ? 'bg-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.4)] border-amber-300 scale-105' : 'bg-white/[0.02] border-white/[0.05]'}`}>
                                {i === blitzTarget ? <span className="text-2xl font-bold text-white">1</span> : <span className="text-slate-800 font-bold opacity-20 text-xl">0</span>}
                              </button>
                            ))}
                          </div>
                        )}

                        {activeGame === 'match' && (
                          <div className="grid grid-cols-4 gap-4">
                            {cards.map(c => (
                              <button key={c.id} onClick={(e) => {
                                e.stopPropagation();
                                if (flipped.length === 2 || c.done || flipped.includes(c.id)) return;
                                const next = [...flipped, c.id];
                                setFlipped(next); triggerActivity('match', 'MODULE_ACTION');
                                if (next.length === 2) {
                                  const [c1, c2] = next.map(id => cards.find(x => x.id === id));
                                  if (c1.s === c2.s) { 
                                    setCards(prev => prev.map(x => (x.id === c1.id || x.id === c2.id) ? { ...x, done: true } : x)); 
                                    updateScore(50); setHealth(h => Math.min(100, h + 12)); setFlipped([]); 
                                    playClick(1000, 'triangle', 0.2, 0.3, 1400);
                                  }
                                  else {
                                    setTimeout(() => setFlipped([]), 800);
                                    playClick(300, 'triangle', 0.1, 0.2);
                                  }
                                }
                              }} className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl transition-all shadow-lg ${c.done ? 'opacity-0 scale-90' : flipped.includes(c.id) ? 'bg-indigo-600 text-white' : 'bg-white/[0.03] border border-white/[0.08] hover:border-indigo-400'}`}>
                                {c.done || flipped.includes(c.id) ? c.s : '?'}
                              </button>
                            ))}
                          </div>
                        )}

                        {activeGame === 'pop' && (
                          <div className="flex flex-col items-center gap-10">
                            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full shadow-[0_0_60px_rgba(255,255,255,0.1)] transition-all duration-300 animate-pulse" style={{ backgroundColor: targetColor, boxShadow: `0 0 50px ${targetColor}66` }} />
                            <div className="flex gap-4">
                              {['#6366f1', '#10b981', '#f59e0b', '#f43f5e'].map(c => (
                                <button key={c} onClick={(e) => {
                                  e.stopPropagation();
                                  triggerActivity('pop', 'MODULE_ACTION');
                                  if (c === targetColor) { updateScore(40); setHealth(h => Math.min(100, h + 15)); initPop(); }
                                  else setHealth(h => Math.max(0, h - 10));
                                }} className="w-14 h-14 md:w-16 md:h-16 rounded-2xl border-2 border-white/10 transition-all hover:scale-110 active:scale-90 shadow-xl" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button onClick={() => {
                        if (socket && scoreRef.current > 0) socket.emit('game:submit_score', { game: activeGame, score: scoreRef.current });
                        setActiveGame(null);
                      }} className="text-slate-600 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest bg-white/[0.02] px-4 py-2 rounded-lg border border-white/[0.05] mt-8">Terminate Session</button>
                    </div>
                  ) : (
                    <div className="text-center space-y-8 px-6">
                      <div className="text-6xl md:text-7xl animate-pulse">🕹️</div>
                      <div className="space-y-4">
                        <p className="text-lg md:text-xl font-bold text-white tracking-[0.3em] uppercase mb-4">Arcade Portal</p>
                        <p className="text-xs md:text-sm text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">Select a game from the menu to jump right in! Push your high score to the limit while you keep your uplink active.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full py-12 px-10 border-t border-white/[0.05] mt-16 text-center">
        <p className="text-[10px] font-bold text-slate-800 uppercase tracking-[0.3em]">ActiveLink High-Fidelity Network &copy; 2026 • Secure Node v4.0</p>
      </footer>

      {showLeaderboard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-4xl bg-[#0a0f1a] border border-white/10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
              <div>
                <h2 className="text-3xl arcade text-white">HALL OF FAME</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Real-time competitive standings</p>
              </div>
              <button onClick={() => setShowLeaderboard(false)} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 text-white hover:bg-white/10 transition-all font-bold">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {GAMES.map(game => (
                <div key={game.id} className="bg-white/5 border border-white/5 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{game.icon}</span>
                    <h3 className="font-bold text-white text-sm uppercase tracking-tight arcade">{game.name}</h3>
                  </div>
                  <div className="space-y-2">
                    {leaderboard[game.id]?.length > 0 ? (
                      leaderboard[game.id].map((entry, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[10px] py-1 border-b border-white/5 last:border-0 mono">
                          <span className={`${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-slate-500'} font-bold flex items-center gap-2`}>
                            <span className="w-4">{idx + 1}</span> {entry.player}
                          </span>
                          <span className="text-white font-black">{entry.score}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[9px] text-slate-600 italic mono">Awaiting data...</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {health <= 0 && activeGame && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in duration-500">
           <div className="text-center space-y-8 glass-card p-16 rounded-[4rem] border border-rose-500/20 shadow-2xl shadow-rose-500/10">
              <div className="space-y-4">
                <p className="text-rose-500 font-black text-xs tracking-[0.4em] uppercase">Session Terminated</p>
                <h2 className="text-7xl font-bold tracking-tight text-white uppercase">Game Over</h2>
              </div>
              <div className="space-y-2">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em]">Final Telemetry Score</p>
                <p className="text-7xl font-bold mono bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">{score}</p>
              </div>
              <div className="pt-6 flex gap-4 justify-center">
                <button onClick={() => { setHealth(100); setScore(0); setActiveGame(activeGame); }} className="px-8 py-4 bg-white text-black rounded-xl font-bold text-xs uppercase tracking-widest hover:scale-105 transition-all">Play Again</button>
                <button onClick={() => { setActiveGame(null); setHealth(100); setScore(0); }} className="px-8 py-4 bg-white/5 text-white border border-white/10 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all">Main Menu</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

export default App;