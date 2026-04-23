import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";

function App() {
  const [socket, setSocket] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('adminSession'));
  const [adminEmail, setAdminEmail] = useState(() => localStorage.getItem('adminSession') || "");
  const [adminRole, setAdminRole] = useState(() => localStorage.getItem('adminRole') || "");
  const [users, setUsers] = useState({});
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [authError, setAuthError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [now, setNow] = useState(Date.now());
  const [notifications, setNotifications] = useState([]);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Security Command state
  const [secCurrentPassword, setSecCurrentPassword] = useState("");
  const [secNewPassword, setSecNewPassword] = useState("");
  const [secRecoveryHex, setSecRecoveryHex] = useState("");
  const [secError, setSecError] = useState("");
  const [secSuccess, setSecSuccess] = useState("");
  const [secLoading, setSecLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const params = new URLSearchParams(window.location.search);
    const syncEmail = params.get('sync_session');
    
    if (syncEmail) {
      const currentSession = localStorage.getItem('adminSession');
      if (syncEmail !== currentSession) {
        localStorage.removeItem('adminSession');
        localStorage.removeItem('adminRole');
        setLoggedIn(false);
        setAdminEmail("");
        setAdminRole("");
        setEmail(syncEmail);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let activeSocket;
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3008";
    if (!loggedIn) {
      activeSocket = io(backendUrl, { query: { role: 'observer' } });
    } else {
      activeSocket = io(backendUrl, { query: { email: adminEmail, role: adminRole || 'admin' } });
    }
    activeSocket.on("connect", () => setStatus("connected"));
    activeSocket.on("snapshot", (data) => {
      const usersObj = {};
      const userList = Array.isArray(data) ? data : (data.users || []);
      userList.forEach(u => usersObj[u.email] = u);
      setUsers(usersObj);
    });
    activeSocket.on("user:update", (data) => setUsers(p => ({ ...p, [data.email]: data })));
    activeSocket.on("user:activity", (data) => setUsers(p => ({ ...p, [data.email]: { ...(p[data.email] || {}), ...data } })));
    activeSocket.on("notification:admin_request", (data) => {
      setNotifications(prev => [data, ...prev].slice(0, 5));
    });
    setSocket(activeSocket);
    return () => activeSocket.close();
  }, [loggedIn, adminEmail, adminRole]);

  const fetchHistory = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3008";
      const res = await fetch(`${backendUrl}/history`);
      const data = await res.json();
      setHistory(data.sessions.reverse());
      setShowHistory(true);
    } catch (err) {
      console.error("HISTORY_FETCH_ERROR", err);
    }
  };

  const handleAuth = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3008";
      const res = await fetch(`${backendUrl}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success && (data.user.role === 'admin' || data.user.role === 'super_admin')) {
        localStorage.setItem('adminSession', email);
        localStorage.setItem('adminRole', data.user.role);
        setLoggedIn(true);
        setAdminEmail(email);
        setAdminRole(data.user.role);
        setSecRecoveryHex(""); // will be fetched/revealed on demand
      }
      else setAuthError(data.error || "UNAUTHORIZED ACCESS");
    } catch (err) {
      setAuthError("CONSOLE_LINK_FAILURE: Backend inaccessible.");
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
        setSuccessMsg("Admin credential updated. Access authorized.");
        setIsResetMode(false); setAuthError("");
      } else {
        setAuthError(data.error);
      }
    } catch (err) {
      setAuthError("BYPASS_LINK_FAILURE: Security nodes unreachable.");
    }
  };

  const logout = () => {
    localStorage.removeItem('adminSession');
    localStorage.removeItem('adminRole');
    setLoggedIn(false);
    setAdminEmail("");
    setAdminRole("");
    setUsers({});
    setShowSecurity(false);
    setSecCurrentPassword("");
    setSecNewPassword("");
    setSecRecoveryHex("");
    setSecError("");
    setSecSuccess("");
  };

  const generateHex = () => {
    const chars = '0123456789ABCDEF';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * 16)]).join('');
  };

  const handleUpdateProfile = async () => {
    setSecError("");
    setSecSuccess("");
    if (!secCurrentPassword) {
      setSecError("Current credential is required to authorize changes.");
      return;
    }
    if (!secNewPassword && !secRecoveryHex) {
      setSecError("Provide a new password and/or a new Recovery Hex.");
      return;
    }
    setSecLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3008";
      const res = await fetch(`${backendUrl}/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail,
          currentPassword: secCurrentPassword,
          newPassword: secNewPassword || undefined,
          newRecoveryCode: secRecoveryHex || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSecSuccess("Security profile updated. Credentials synchronized.");
        setSecCurrentPassword("");
        setSecNewPassword("");
        if (data.recoveryCode) setSecRecoveryHex(data.recoveryCode);
      } else {
        setSecError(data.error || "Update failed.");
      }
    } catch (err) {
      setSecError("LINK_FAILURE: Security node unreachable.");
    } finally {
      setSecLoading(false);
    }
  };

  const moduleMap = {
    'lumina': 'Lumina Link', 'strike': 'Neon Strike', 'blitz': 'Binary Blitz',
    'match': 'Zen Match', 'pop': 'Pixel Pop', 'PORTAL_IDLE': 'Browsing Dashboard'
  };

  const formatModule = (mod) => {
    if (typeof mod !== 'string') return "DISCONNECTED";
    return moduleMap[mod] || mod.toUpperCase();
  };

  const getFavoredModule = (stats) => {
    if (!stats || Object.keys(stats).length === 0) return "N/A";
    const favored = Object.entries(stats).reduce((a, b) => a[1] > b[1] ? a : b);
    return moduleMap[favored[0]] || favored[0].toUpperCase();
  };

  const formatLastActive = (ts) => {
    if (!ts) return "Never";
    const timeStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const seconds = Math.floor((now - ts) / 1000);
    if (seconds < 5) return `Just Now (${timeStr})`;
    if (seconds < 60) return `${seconds}s ago (${timeStr})`;
    return `${Math.floor(seconds / 60)}m ago (${timeStr})`;
  };

  const getSignalMeta = (type) => {
    switch (type) {
      case 'MOUSE': return { icon: '🖱️', label: 'Primary Input' };
      case 'KEYBOARD': return { icon: '⌨️', label: 'Manual Override' };
      case 'MODULE_ACTION': return { icon: '⚙️', label: 'Arcade Multiplier' };
      case 'MODULE_SELECT': return { icon: '🎯', label: 'Game Entry' };
      default: return { icon: '📡', label: 'Active Link' };
    }
  };

  return (
    <div className="min-h-screen bg-[#05080f] text-[#9ca3af] font-sans selection:bg-indigo-500/20">
      <nav className="w-full border-b border-white/[0.05] bg-[#05080f]/90 backdrop-blur-md sticky top-0 z-50 px-10 py-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">🛡️</div>
          <span className="text-xl font-bold tracking-tight text-white uppercase">ActiveLink <span className="text-indigo-500 font-medium">Command</span></span>
        </div>
        <div className="flex items-center gap-8">
          <a href={`http://localhost:5173?sync_session=${adminEmail}`} className="text-xs font-semibold text-slate-500 hover:text-white transition-colors uppercase tracking-widest">User Portal →</a>
          
          {loggedIn && (
            <div className="relative">
              <button 
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all"
              >
                {adminEmail ? adminEmail.charAt(0).toUpperCase() : 'A'}
              </button>

              {showProfileDropdown && (
                <div className="absolute right-0 mt-4 w-64 bg-[#0a0f1a]/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-5 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-5">
                    <div className="pb-4 border-b border-white/5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Administrator ID</p>
                      <p className="text-sm font-semibold text-white truncate">{adminEmail}</p>
                      <div className="mt-2 inline-block px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold text-indigo-400 uppercase tracking-tight">
                         {adminRole.replace('_', ' ')} verified
                      </div>
                    </div>

                    <div className="space-y-2">
                       <button onClick={() => { fetchHistory(); setShowProfileDropdown(false); }} className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-wide">
                        Audit Logs
                      </button>
                      <button onClick={() => { setShowSecurity(true); setShowProfileDropdown(false); setSecError(""); setSecSuccess(""); }} className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-wide">
                        Security Settings
                      </button>
                      <button 
                        onClick={() => {
                          logout();
                          setShowProfileDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 transition-all uppercase tracking-wide"
                      >
                        Terminate Command (Logout)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-12 flex-1">
        {!loggedIn ? (
          <div className="flex flex-col items-center justify-center mt-20 animate-in fade-in zoom-in-95 duration-500">
            <div className="p-12 rounded-[2rem] w-full max-w-sm bg-white/[0.01] border border-white/[0.05] shadow-2xl space-y-10">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-white tracking-tight uppercase">
                  {isResetMode ? "Credential Reset" : "Admin Access"}
                </h2>
                <p className="text-slate-500 text-sm font-medium mt-2">
                  {isResetMode ? "Bypass Authentication via Recovery Key" : "Elevated Command Verification"}
                </p>
              </div>
              <div className="space-y-5">
                {successMsg && <p className="text-emerald-400 text-xs font-bold text-center bg-emerald-500/10 py-3 rounded-xl border border-emerald-500/20">{successMsg}</p>}
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Admin ID" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-6 py-4 outline-none focus:border-indigo-500/50 transition-all text-sm" />

                {isResetMode && (
                  <input type="text" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} placeholder="Recovery Hex" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-6 py-4 outline-none focus:border-indigo-500/50 transition-all text-sm" />
                )}

                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isResetMode ? "New Credential" : "Credential"} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-6 py-4 outline-none focus:border-indigo-500/50 transition-all text-sm" />

                {authError && <p className="text-rose-400 text-xs font-medium text-center">{authError}</p>}

                <button onClick={isResetMode ? handleReset : handleAuth} className="w-full bg-indigo-600 py-4 rounded-2xl font-bold text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all text-sm tracking-wide uppercase">
                  {isResetMode ? "Update Key" : "AUTHORIZE"}
                </button>

                <button onClick={() => { setIsResetMode(!isResetMode); setAuthError(""); setSuccessMsg(""); }} className="w-full text-xs font-bold text-slate-700 hover:text-indigo-400 transition-colors uppercase tracking-widest">
                  {isResetMode ? "← Back to Login" : "Forgot Credentials?"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in fade-in duration-500">
            <div className="flex justify-between items-end border-b border-white/[0.05] pb-10">
              <div className="space-y-2">
                <h2 className="text-5xl font-bold text-white tracking-tighter uppercase leading-none">System <span className="text-indigo-500">Overview</span></h2>
                <p className="text-slate-600 font-semibold tracking-widest text-[10px] uppercase">Real-time Presence Cluster Insight</p>
              </div>
              <div className="flex gap-12">
                <div className="text-right border-l border-white/[0.05] pl-10"><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Active Nodes</p><p className="text-3xl font-bold text-white mono">{Object.values(users).filter(u => u.isActive).length}</p></div>
                <div className="text-right border-l border-white/[0.05] pl-10"><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Health</p><p className="text-3xl font-bold text-emerald-500 mono">STABLE</p></div>
              </div>
            </div>

            {(adminRole === 'super_admin' && notifications.length > 0) && (
              <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-4 px-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping shadow-[0_0_10px_rgba(244,63,94,0.6)]" />
                  <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em]">Pending Access Requests ({notifications.length})</h3>
                </div>
              </div>
            )}

            <div className="bg-white/[0.01] border border-white/[0.05] rounded-[2rem] overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] text-slate-500 font-bold uppercase tracking-widest bg-white/[0.03]">
                    <th className="px-8 py-8 border-b border-white/[0.05]">Operator Node</th>
                    <th className="px-8 py-8 border-b border-white/[0.05]">Last Active Signal</th>
                    <th className="px-8 py-8 border-b border-white/[0.05]">Current Task</th>
                    <th className="px-8 py-8 border-b border-white/[0.05]">Favored App</th>
                    <th className="px-8 py-8 border-b border-white/[0.05] text-center">Load Metric</th>
                    <th className="px-8 py-8 border-b border-white/[0.05] text-right">Total Uptime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {Object.values(users).map(u => {
                    const idleSeconds = u.lastActivity ? (now - u.lastActivity) / 1000 : 0;
                    const watchdogStatus = !u.isActive ? 'OFFLINE' : idleSeconds > 45 ? 'CRITICAL' : idleSeconds > 20 ? 'WARNING' : 'STABLE';
                    const signal = getSignalMeta(u.lastInteractionType);

                    return (
                      <tr key={u.email} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-8 py-8">
                          <div className="flex items-center gap-5">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${u.isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-800 text-slate-500'}`}>{u.email ? u.email.charAt(0).toUpperCase() : '?'}</div>
                            <div>
                              <p className="font-bold text-white tracking-tight uppercase text-sm flex items-center">
                                {u.displayName}
                                {u.role === 'admin' && <span className="ml-2 text-[8px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-sm border border-indigo-500/20 tracking-widest">ADMIN</span>}
                                {u.role === 'super_admin' && <span className="ml-2 text-[8px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-sm border border-amber-500/20 tracking-widest shadow-[0_0_8px_rgba(245,158,11,0.2)]">SUPER</span>}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${watchdogStatus === 'STABLE' ? 'bg-emerald-500' : watchdogStatus === 'WARNING' ? 'bg-amber-500' : watchdogStatus === 'CRITICAL' ? 'bg-rose-500' : 'bg-slate-700'}`} />
                                <span className={`text-[9px] font-bold tracking-widest uppercase ${watchdogStatus === 'STABLE' ? 'text-emerald-500' : watchdogStatus === 'WARNING' ? 'text-amber-500' : watchdogStatus === 'CRITICAL' ? 'text-rose-500' : 'text-slate-600'}`}>{watchdogStatus}</span>
                              </div>
                              {adminRole === 'super_admin' && notifications.some(n => n.email === u.email) && (
                                <div className="mt-3 py-1.5 px-3 bg-rose-500/10 border border-rose-500/20 rounded-md flex items-center justify-between gap-3 animate-pulse">
                                  <span className="text-[10px] font-semibold text-rose-500 font-sans tracking-normal">Access Request Pending</span>
                                  <button onClick={() => {
                                    socket.emit('admin:deny_access', u.email);
                                    setNotifications(prev => prev.filter(n => n.email !== u.email));
                                  }} className="text-rose-400 hover:text-white text-[12px] leading-none px-1">×</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-8">
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-bold text-white mono uppercase tracking-tight">{formatLastActive(u.lastActivity)}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{signal.icon}</span>
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{signal.label}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-8">
                          <p className={`font-bold text-[11px] uppercase tracking-wider ${u.isActive ? 'text-white' : 'text-slate-600'}`}>{formatModule(u.activeModule)}</p>
                          <p className="text-[9px] text-slate-600 font-semibold uppercase tracking-tighter mt-1">{u.isActive ? 'Active Tasking' : 'Link Terminal'}</p>
                        </td>
                        <td className="px-8 py-8">
                          <div className="flex items-center gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/30" />
                            <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">{getFavoredModule(u.moduleStats)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-8 min-w-[200px]">
                          <div className="space-y-2.5">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight text-slate-600 mono">
                              <span>{u.rpm || 0} RPM</span>
                              <span>{u.latency || 0} MS</span>
                            </div>
                            <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                              <div className="h-full transition-all duration-700 bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.2)]"
                                style={{ width: `${Math.min(100, (u.rpm || 0) * 2)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-8 text-right">
                          <div className="font-bold text-white text-xl tracking-tight mono">
                            {Math.floor(u.totalActiveTime / 1000)}<span className="text-[10px] text-slate-600 ml-1.5 uppercase font-semibold">SEC</span>
                          </div>
                          {adminRole === 'super_admin' && (
                            <div className="mt-2 text-right">
                              {u.role !== 'admin' && u.role !== 'super_admin' && (
                                <button onClick={() => socket.emit('admin:promote_user', u.email)} className="inline-block px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all">
                                  + Make Admin
                                </button>
                              )}
                              {u.role === 'admin' && (
                                <button onClick={() => socket.emit('admin:demote_user', u.email)} className="inline-block px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all">
                                  Revoke Access
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-12">
          <div className="absolute inset-0 bg-[#05080f]/80 backdrop-blur-md" onClick={() => setShowHistory(false)} />
          <div className="bg-white/[0.01] border border-white/[0.05] w-full max-w-4xl max-h-[80vh] rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col p-12 space-y-10">
            <div className="flex justify-between items-center border-b border-white/[0.05] pb-8">
              <h3 className="text-2xl font-bold text-white uppercase tracking-tight">System Audit Logs</h3>
              <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto pr-6 space-y-5">
              {history.map((h, i) => (
                <div key={i} className="flex justify-between items-center p-6 bg-white/[0.02] border border-white/[0.05] rounded-2xl hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center gap-6">
                    <span className="text-slate-700 font-bold mono text-xs">#{(history.length - i).toString().padStart(3, '0')}</span>
                    <span className="text-white font-bold uppercase text-xs tracking-wide">{h.displayName}</span>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">{new Date(h.end).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-tight">{h.type} • {Math.floor(h.duration / 1000)}S • SIGNAL VARIETY: {h.variety || 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Security Command Modal */}
      {showSecurity && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-[#05080f]/85 backdrop-blur-md" onClick={() => setShowSecurity(false)} />
          <div className="relative bg-[#080c16] border border-white/[0.07] w-full max-w-lg rounded-[2rem] shadow-2xl shadow-indigo-950/40 p-10 space-y-8 animate-in fade-in zoom-in-95 duration-300">

            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-sm">🔐</div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-tight">Security Command</h3>
                </div>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest ml-11">Credential & Recovery Hex Management</p>
              </div>
              <button onClick={() => setShowSecurity(false)} className="text-slate-600 hover:text-white transition-colors mt-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Operator ID display */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl px-6 py-4 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Operator ID</span>
              <span className="text-xs font-bold text-indigo-400 mono">{adminEmail}</span>
            </div>

            {/* Recovery Hex Row */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Recovery Hex</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={secRecoveryHex}
                  onChange={e => setSecRecoveryHex(e.target.value)}
                  placeholder="Enter or rotate hex key…"
                  className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm mono text-white font-bold tracking-widest placeholder:font-normal placeholder:tracking-normal"
                />
                <button
                  onClick={() => setSecRecoveryHex(generateHex())}
                  className="px-5 py-3.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-bold uppercase tracking-widest hover:bg-indigo-600/20 transition-all whitespace-nowrap"
                >
                  ⟳ Rotate
                </button>
              </div>
              <p className="text-[9px] text-slate-700 font-semibold uppercase tracking-widest">Click Rotate to auto-generate a secure 12-char hex key</p>
            </div>

            {/* Divider */}
            <div className="border-t border-white/[0.05]" />

            {/* Password Update */}
            <div className="space-y-4">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Update Credential</label>
              <input
                type="password"
                value={secCurrentPassword}
                onChange={e => setSecCurrentPassword(e.target.value)}
                placeholder="Current credential (required)"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-indigo-500/50 transition-all text-sm"
              />
              <input
                type="password"
                value={secNewPassword}
                onChange={e => setSecNewPassword(e.target.value)}
                placeholder="New credential (leave blank to keep)"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3.5 outline-none focus:border-amber-500/40 transition-all text-sm"
              />
            </div>

            {/* Feedback */}
            {secError && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-5 py-3 text-rose-400 text-xs font-bold">{secError}</div>
            )}
            {secSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-3 text-emerald-400 text-xs font-bold">{secSuccess}</div>
            )}

            {/* Action Button */}
            <button
              onClick={handleUpdateProfile}
              disabled={secLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed py-4 rounded-xl font-bold text-white text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all"
            >
              {secLoading ? "Synchronizing…" : "Commit Security Update"}
            </button>
          </div>
        </div>
      )}

      <footer className="w-full py-12 px-10 border-t border-white/[0.05] mt-16 text-center">
        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.2em]">ActiveLink Command Center &copy; 2026</p>
      </footer>
    </div>
  );
}

export default App;