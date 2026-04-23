import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { io } from "socket.io-client";

const GAMES = [
  { id: 'lumina', name: 'Lumina Link', icon: '✨', gradient: 'from-indigo-400 to-cyan-300', desc: 'Establish resonance between floating light nodes.' },
  { id: 'strike', name: 'Neon Strike', icon: '🎯', gradient: 'from-emerald-400 to-teal-300', desc: 'Neutralize system glitches with precision fire.' },
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
  const [users, setUsers] = useState({});
  const [authError, setAuthError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [status, setStatus] = useState("disconnected");
  
  // Stats
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [activeGame, setActiveGame] = useState(null);

  // --- Hyper-Casual Game States ---
  // 1. Lumina Link
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [links, setLinks] = useState([]);
  
  // 2. Neon Strike
  const [strikePos, setStrikePos] = useState(50);
  const [targets, setTargets] = useState([]);
  const [lasers, setLasers] = useState([]);

  // 3. Binary Blitz
  const [blitzTarget, setBlitzTarget] = useState(null);

  // 4. Zen Match
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);

  // 5. Pixel Pop
  const [targetColor, setTargetColor] = useState('indigo');

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
    activeSocket.on("user:update", (data) => setUsers(p => ({ ...p, [data.email]: data })));
    activeSocket.on("latency:pong", (ts) => activeSocket.emit("latency:report", Date.now() - ts));
    setSocket(activeSocket);
    return () => activeSocket.close();
  }, [loggedIn, connectedEmail, userRole]);

  useEffect(() => {
    if (!socket || !loggedIn) return;
    const i1 = setInterval(() => socket.emit("latency:ping", Date.now()), 5000);
    const i2 = setInterval(() => triggerActivity(activeGame, 'IDLE_BEAT'), 15000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [socket, loggedIn, activeGame, triggerActivity]);

  // --- Game Initializers ---
  const initLumina = () => {
    const syms = ['💎', '🌟', '🔮', '💠'];
    const newNodes = [...syms, ...syms].map((s, i) => ({
      id: i, s, x: 50 + Math.random() * 300, y: 50 + Math.random() * 200, 
      dx: (Math.random() - 0.5) * 2, dy: (Math.random() - 0.5) * 2, done: false
    }));
    setNodes(newNodes); setLinks([]); setSelectedNode(null);
  };
  const initStrike = () => { setTargets([]); setLasers([]); };
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

  // --- Game Loops ---
  useEffect(() => {
    if (!activeGame) return;
    const loop = setInterval(() => {
      setHealth(h => Math.max(0, h - 0.1));

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
           let next = prev.map(t => ({ ...t, x: t.x + t.s })).filter(t => t.x > -20 && t.x < 420);
           if (Math.random() > 0.95) next.push({ x: Math.random() > 0.5 ? -10 : 410, y: 30 + Math.random() * 60, s: Math.random() > 0.5 ? 2.5 : -2.5 });
           return next;
        });
        setLasers(prev => {
           let next = prev.map(l => ({ ...l, y: l.y - 12 })).filter(l => l.y > -20);
           next = next.filter(l => {
              const hit = targets.find(t => Math.abs(t.x - l.x) < 20 && Math.abs(t.y - l.y) < 20);
              if (hit) { setScore(s => s + 100); setHealth(h => Math.min(100, h + 5)); setTargets(ts => ts.filter(t => t !== hit)); return false; }
              return true;
           });
           return next;
        });
      }
    }, 40);
    return () => clearInterval(loop);
  }, [activeGame, targets]);

  const handleAction = (moduleId) => {
    triggerActivity(moduleId, 'MODULE_ACTION');
    if (moduleId === 'strike') setLasers(prev => [...prev, { x: strikePos, y: 160 }]);
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
    <div className="min-h-screen bg-[#05080f] text-[#d1d5db] font-sans selection:bg-indigo-500/30">
      <nav className="w-full border-b border-white/[0.05] bg-[#05080f]/80 backdrop-blur-md sticky top-0 z-50 px-10 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">🛡️</div>
          <span className="text-xl font-bold tracking-tight text-white uppercase">ActiveWatch <span className="text-indigo-500 font-medium">Link</span></span>
        </div>
        <div className="flex gap-6">
          {loggedIn && userRole === 'admin' && <a href={import.meta.env.VITE_ADMIN_URL || "http://localhost:5174"} className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">Command Console →</a>}
          {loggedIn && <button onClick={() => { 
            const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:3008";
            fetch(`${backendUrl}/logout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: connectedEmail }) }); 
            localStorage.removeItem('userSession');
            localStorage.removeItem('userRole');
            setLoggedIn(false); setActiveGame(null); setConnectedEmail("");
          }} className="px-5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs font-semibold hover:bg-rose-500/10 hover:text-rose-400 transition-all">DISCONNECT</button>}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-10 flex-1">
        {!loggedIn ? (
          <div className="flex flex-col items-center justify-center mt-12 animate-in fade-in zoom-in-95 duration-500">
             <div className="p-12 rounded-[2rem] w-full max-w-md bg-white/[0.01] border border-white/[0.05] shadow-2xl space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-white tracking-tight mb-2 uppercase">
                    {isResetMode ? "Security Reset" : isRegisterMode ? "REGISTER NODE" : "AUTHENTICATE"}
                  </h2>
                  <p className="text-slate-500 text-sm font-medium">
                    {isResetMode ? "Provide recovery hex to update credentials" : "Secure biometrics verification required"}
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
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1">Admin Display Name</label>
                        <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Operator Zero" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1">Recovery Code</label>
                        <input type="text" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} placeholder="Hex-000" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm" />
                      </div>
                    </>
                  )}

                  {authError && <p className="text-rose-400 text-xs font-medium text-center">{authError}</p>}
                  
                  <button onClick={isResetMode ? handleReset : handleAuth} className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all text-sm tracking-wide uppercase">
                    {isResetMode ? "Update Uplink" : isRegisterMode ? "INITIALIZE" : "ESTABLISH UPLINK"}
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  <button onClick={() => { setIsRegisterMode(!isRegisterMode); setIsResetMode(false); setAuthError(""); setSuccessMsg(""); }} className="w-full text-xs font-semibold text-slate-500 hover:text-indigo-400 transition-colors uppercase tracking-[0.2em]">
                    {isRegisterMode ? "Back to Login" : "Register Node Access"}
                  </button>
                  {!isRegisterMode && (
                    <button onClick={() => { setIsResetMode(!isResetMode); setAuthError(""); setSuccessMsg(""); }} className="w-full text-[10px] font-bold text-slate-700 hover:text-rose-500 transition-colors uppercase tracking-[0.2em]">
                      {isResetMode ? "Cancel Bypass" : "Forgot Credentials?"}
                    </button>
                  )}
                </div>
             </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
              <div className="lg:col-span-1 space-y-8">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-2">Active Games</h3>
                <div className="space-y-4">
                  {GAMES.map(g => (
                    <button key={g.id} onClick={() => { 
                      setActiveGame(g.id); setScore(0); setHealth(100); 
                      if (g.id === 'lumina') initLumina(); if (g.id === 'strike') initStrike();
                      if (g.id === 'blitz') initBlitz(); if (g.id === 'match') initMatch();
                      if (g.id === 'pop') initPop();
                      triggerActivity(g.id, 'MODULE_SELECT'); 
                    }} className={`group w-full flex items-center gap-5 p-5 rounded-2xl border transition-all ${activeGame === g.id ? 'bg-indigo-600/10 border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.1)]' : 'bg-transparent border-white/[0.03] hover:border-white/[0.1]'}`}>
                      <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center text-xl">{g.icon}</div>
                      <div className="text-left font-bold uppercase">
                        <p className={`text-[12px] font-['Righteous'] tracking-[0.1em] transition-all ${activeGame === g.id ? 'bg-clip-text text-transparent bg-gradient-to-r ' + g.gradient + ' drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]' : 'text-slate-400'}`}>{g.name}</p>
                        <p className="text-[8px] text-slate-600 font-medium truncate w-32">{g.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-3 bg-white/[0.01] border border-white/[0.05] rounded-[2.5rem] p-10 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden transition-all shadow-2xl">
                {activeGame ? (
                  <div className="w-full h-full flex flex-col items-center space-y-8 animate-in zoom-in-95 duration-500">
                    <div className="w-full flex justify-between items-center bg-white/[0.02] p-6 rounded-2xl border border-white/[0.05] shadow-inner">
                       <h4 className={`text-base font-['Righteous'] tracking-[0.1em] uppercase bg-clip-text text-transparent bg-gradient-to-r ${GAMES.find(g => g.id === activeGame).gradient}`}>{GAMES.find(g => g.id === activeGame).name}</h4>
                       <div className="flex gap-10">
                         <div className="text-right"><p className="text-[9px] text-slate-600 font-bold uppercase mb-1">Score</p><p className="text-xl font-bold text-white mono">{score}</p></div>
                         <div className="text-right"><p className="text-[9px] text-slate-600 font-bold uppercase mb-1">Uptime</p><p className={`text-xl font-bold mono ${health > 30 ? 'text-emerald-500' : 'text-rose-500'}`}>{Math.floor(health)}%</p></div>
                       </div>
                    </div>

                    <div className="relative z-10 w-full flex flex-col items-center justify-center flex-1" onClick={() => handleAction(activeGame)}>
                       {activeGame === 'lumina' && (
                         <div className="relative w-full h-[300px] bg-white/[0.01] rounded-3xl overflow-hidden border border-white/[0.05]">
                            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                               {links.map((l, i) => (
                                 <line key={i} x1={l.p1.x} y1={l.p1.y} x2={l.p2.x} y2={l.p2.y} stroke="rgba(99,102,241,0.5)" strokeWidth="2" strokeDasharray="5,5" className="animate-pulse" />
                               ))}
                               {selectedNode && nodes.map(n => n.id === selectedNode).some(x => x) && (
                                  <line x1={nodes.find(n => n.id === selectedNode).x} y1={nodes.find(n => n.id === selectedNode).y} x2="?" y2="?" />
                               )}
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
                                       setScore(s => s + 200); setHealth(h => Math.min(100, h + 20)); setSelectedNode(null);
                                       if (nodes.filter(x => !x.done).length === 2) setTimeout(initLumina, 1000);
                                    } else { setSelectedNode(n.id); }
                                 }
                                 triggerActivity('lumina', 'MODULE_ACTION');
                               }} className={`absolute w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${n.done ? 'opacity-0 scale-50' : 'bg-white/[0.03] border border-white/[0.1] hover:border-indigo-400 hover:shadow-[0_0_15px_rgba(99,102,241,0.3)]'} ${selectedNode === n.id ? 'border-indigo-500 bg-indigo-500/20 scale-110 shadow-[0_0_20px_rgba(99,102,241,0.5)]' : ''}`}
                                  style={{ left: n.x - 24, top: n.y - 24 }}>{n.s}</button>
                            ))}
                         </div>
                       )}

                       {activeGame === 'strike' && (
                         <div className="relative w-full h-48 bg-white/[0.02] rounded-3xl border border-white/[0.05] overflow-hidden"
                              onMouseMove={(e) => {
                                 const rect = e.currentTarget.getBoundingClientRect();
                                 setStrikePos(((e.clientX - rect.left) / rect.width) * 400);
                              }}>
                            <div className="absolute bottom-4 w-10 h-14 bg-emerald-500 rounded-t-xl shadow-[0_0_20px_rgba(16,185,129,0.3)]" style={{ left: `${strikePos - 20}px` }} />
                            {lasers.map((l, i) => <div key={i} className="absolute w-1 h-6 bg-emerald-400 rounded-full shadow-[0_0_15px_#34d399]" style={{ left: `${l.x-2}px`, top: `${l.y}px` }} />)}
                            {targets.map((t, i) => <div key={i} className="absolute w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center text-xs shadow-[0_0_15px_rgba(244,63,94,0.3)]" style={{ left: `${t.x-16}px`, top: `${t.y}px` }}>👾</div>)}
                         </div>
                       )}

                       {activeGame === 'blitz' && (
                         <div className="grid grid-cols-3 gap-4">
                            {[...Array(9)].map((_, i) => (
                              <button key={i} onClick={(e) => {
                                 e.stopPropagation();
                                 if (i === blitzTarget) { setScore(s => s + 25); setHealth(h => Math.min(100, h + 8)); initBlitz(); triggerActivity('blitz', 'MODULE_ACTION'); }
                                 else setHealth(h => Math.max(0, h - 5));
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
                                    if (c1.s === c2.s) { setCards(prev => prev.map(x => (x.id === c1.id || x.id === c2.id) ? { ...x, done: true } : x)); setScore(s => s + 50); setHealth(h => Math.min(100, h + 12)); setFlipped([]); }
                                    else setTimeout(() => setFlipped([]), 800);
                                 }
                              }} className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl transition-all shadow-lg ${c.done ? 'opacity-0 scale-90' : flipped.includes(c.id) ? 'bg-indigo-600 text-white' : 'bg-white/[0.03] border border-white/[0.08] hover:border-indigo-400'}`}>
                                 {c.done || flipped.includes(c.id) ? c.s : '?'}
                              </button>
                            ))}
                         </div>
                       )}

                       {activeGame === 'pop' && (
                         <div className="flex flex-col items-center gap-10">
                            <div className="w-32 h-32 rounded-full shadow-[0_0_60px_rgba(255,255,255,0.1)] transition-all duration-300 animate-pulse" style={{ backgroundColor: targetColor, boxShadow: `0 0 50px ${targetColor}66` }} />
                            <div className="flex gap-4">
                               {['#6366f1', '#10b981', '#f59e0b', '#f43f5e'].map(c => (
                                 <button key={c} onClick={(e) => {
                                   e.stopPropagation();
                                   triggerActivity('pop', 'MODULE_ACTION');
                                   if (c === targetColor) { setScore(s => s + 40); setHealth(h => Math.min(100, h + 15)); initPop(); }
                                   else setHealth(h => Math.max(0, h - 10));
                                 }} className="w-16 h-16 rounded-2xl border-2 border-white/10 transition-all hover:scale-110 active:scale-90 shadow-xl" style={{ backgroundColor: c }} />
                               ))}
                            </div>
                         </div>
                       )}
                    </div>

                    <div className="w-full max-w-sm h-1.5 bg-white/[0.03] rounded-full overflow-hidden border border-white/5 shadow-inner">
                      <div className="h-full bg-indigo-500 transition-all duration-300 shadow-[0_0_15px_#6366f1]" style={{ width: `${health}%` }} />
                    </div>
                    <button onClick={() => setActiveGame(null)} className="text-slate-600 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest bg-white/[0.02] px-4 py-2 rounded-lg border border-white/[0.05]">Terminate Session</button>
                  </div>
                ) : (
                  <div className="text-center space-y-8 opacity-40">
                    <div className="text-7xl animate-pulse">🕹️</div>
                    <div className="space-y-4">
                      <p className="text-xl font-bold text-white tracking-[0.3em] uppercase mb-4">Arcade Portal</p>
                      <p className="text-sm text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">Select a game from the menu to jump right in! Push your high score to the limit while you keep your uplink active.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full py-12 px-10 border-t border-white/[0.05] mt-16 text-center">
        <p className="text-[10px] font-bold text-slate-800 uppercase tracking-[0.3em]">ActiveWatch High-Fidelity Network &copy; 2026 • Secure Node v4.0</p>
      </footer>
    </div>
  );
}

export default App;