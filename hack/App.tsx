
import React, { useState, useEffect, useRef } from 'react';
import { PlatformType, AppState, LogEntry } from './types';
import { PLATFORMS, STAGES, FAKE_CHATS, DEFAULT_CHATS, MOCK_METRICS } from './constants';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    view: 'HUB',
    platform: null,
    identity: '',
    progress: 0,
    stageIndex: 0,
    logs: [],
    isTerminalOpen: false,
    resultData: null
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.logs, state.isTerminalOpen]);

  const addLog = (text: string, category: LogEntry['category'] = 'system') => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, { text, category, timestamp: new Date().toLocaleTimeString().split(' ')[0] }]
    }));
  };

  const abort = () => {
    setState(prev => ({
      ...prev,
      view: 'HUB',
      platform: null,
      identity: '',
      progress: 0,
      logs: []
    }));
  };

  const startVerification = async () => {
    const config = PLATFORMS.find(p => p.id === state.platform);
    if (!config || !config.pattern.test(state.identity)) return;

    setState(prev => ({ ...prev, view: 'VERIFYING' }));
    await new Promise(r => setTimeout(r, 2500));
    startExploit();
  };

  const startExploit = async () => {
    setState(prev => ({ ...prev, view: 'PROCESS', progress: 0, stageIndex: 0, logs: [], isTerminalOpen: true }));

    for (let i = 0; i < STAGES.length; i++) {
      const stage = STAGES[i];
      setState(prev => ({ ...prev, stageIndex: i }));
      addLog(`>> SYSTEM: Mounting Phase: ${stage.name}`, 'system');

      for (const log of stage.logs) {
        const delay = 700 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
        addLog(log.replace('%ID%', state.identity), i === 3 ? 'decryption' : i === 1 ? 'exploit' : 'network');
        setState(prev => ({ ...prev, progress: Math.min(prev.progress + (100 / (STAGES.length * stage.logs.length)), 99) }));
      }
    }
    setState(prev => ({ ...prev, view: 'SUCCESS', progress: 100 }));
  };

  const IconWrapper: React.FC<{ d: string, size?: number, color?: string }> = ({ d, size = 24, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d={d} />
    </svg>
  );

  const ProgressRing = ({ progress }: { progress: number }) => {
    const radius = 90;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
      <div className="relative flex items-center justify-center">
        <svg className="w-64 h-64 md:w-80 md:h-80 -rotate-90">
          <circle cx="50%" cy="50%" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
          <circle 
            cx="50%" cy="50%" r={radius} fill="none" stroke="url(#gradient)" strokeWidth="12" 
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-6xl font-black text-slate-900 tracking-tighter mono">
            {Math.floor(progress)}<span className="text-2xl text-slate-300">%</span>
          </span>
          <span className="text-[10px] mono uppercase tracking-[0.4em] text-sky-500 font-bold mt-2 animate-pulse">Syncing...</span>
        </div>
      </div>
    );
  };

  const renderHub = () => (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-1 futuristic-progress opacity-20"></div>
      
      <div className="flex-1 overflow-y-auto px-6 py-12 md:px-20 scroll-smooth">
        <div className="max-w-7xl mx-auto">
          <header className="mb-20 flex flex-col items-start">
            <div className="flex items-center gap-3 mb-6">
              <span className="h-[2px] w-12 bg-sky-500"></span>
              <span className="mono text-xs font-bold uppercase tracking-[0.4em] text-sky-600">Spectral Neural OS</span>
            </div>
            <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-slate-900 uppercase leading-none drop-shadow-sm">
              AETHER<span className="text-sky-500 italic">.</span>LIGHT
            </h1>
            <p className="mt-8 text-slate-400 mono text-xs uppercase tracking-[0.5em] font-medium max-w-lg leading-relaxed">
              Decentralized Intelligence Network // Universal Extraction Module // v10.6.2
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-20">
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => setState(prev => ({ ...prev, platform: p.id, view: 'CONFIG', identity: '' }))}
                className="group cyber-card rounded-[2.5rem] p-10 flex flex-col items-start text-left relative overflow-hidden"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-8 shadow-xl transition-transform group-hover:scale-110`}>
                  <IconWrapper d={p.iconPath} size={32} color="white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">{p.label}</h3>
                <span className="text-[10px] mono text-slate-400 uppercase tracking-widest font-bold">{p.actionLabel}</span>
                
                <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
                   <svg className="w-6 h-6 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <footer className="shrink-0 glass-panel border-t border-slate-200 py-6 px-10 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-8 mono text-[10px] text-slate-400 uppercase font-bold tracking-widest">
           <span className="flex items-center gap-2 text-emerald-600"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> System Ready</span>
           <span>Latency: 0.1ms</span>
        </div>
        <span className="mono text-[10px] text-slate-300 uppercase tracking-[0.3em]">Authorized for Pentest Simulation v5</span>
      </footer>
    </div>
  );

  const renderConfig = () => {
    const config = PLATFORMS.find(p => p.id === state.platform);
    const isValid = config?.pattern.test(state.identity);
    return (
      <div className="h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl glass-panel p-12 md:p-24 rounded-[4rem] relative shadow-2xl overflow-hidden">
          <button onClick={abort} className="mb-16 text-slate-400 hover:text-rose-600 mono text-xs font-bold uppercase flex items-center gap-3 transition-all group tracking-widest">
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Abort Protocol
          </button>

          <div className="flex flex-col md:flex-row items-center gap-12 mb-20">
            <div className={`w-28 h-28 rounded-3xl bg-gradient-to-br ${config?.color} flex items-center justify-center shadow-2xl`}>
              <IconWrapper d={config?.iconPath || ""} size={56} color="white" />
            </div>
            <div className="text-center md:text-left">
              <h2 className="text-5xl font-black text-slate-900 tracking-tighter uppercase italic">{config?.label}</h2>
              <p className="text-sky-500 text-[10px] uppercase mono tracking-[0.5em] mt-3 font-bold">Infiltration Protocol v1.0</p>
            </div>
          </div>

          <div className="space-y-16">
            <div className="relative">
              <input 
                type="text"
                autoFocus
                placeholder={config?.placeholder}
                value={state.identity}
                onChange={(e) => setState(prev => ({ ...prev, identity: e.target.value }))}
                className={`w-full bg-transparent border-b-2 ${state.identity && !isValid ? 'border-rose-400' : 'border-slate-200'} focus:border-sky-500 py-8 text-4xl mono text-slate-900 outline-none transition-all placeholder:text-slate-200`}
              />
              <p className={`mt-6 text-[11px] font-bold tracking-widest uppercase mono ${state.identity && !isValid ? 'text-rose-500' : 'text-slate-400'}`}>
                {state.identity && !isValid ? config?.hint : 'System: Awaiting Target String'}
              </p>
            </div>

            <button 
              disabled={!isValid}
              onClick={startVerification}
              className={`w-full py-10 rounded-[2.5rem] font-black text-xs tracking-[0.6em] uppercase transition-all relative overflow-hidden shadow-xl ${isValid ? 'bg-slate-900 text-white hover:bg-sky-600 active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              Verify Identity Node
              {isValid && <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none"></div>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderVerifying = () => (
    <div className="h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-xl glass-panel p-20 rounded-[4rem] relative shadow-2xl">
        <div className="w-24 h-24 border-8 border-slate-100 border-t-sky-500 rounded-full animate-spin mx-auto mb-12"></div>
        <h2 className="text-4xl font-black text-slate-900 mb-6 uppercase italic tracking-tighter">Identity Discovery</h2>
        <div className="space-y-4 mono text-[11px] text-slate-400 uppercase tracking-widest font-bold">
          <p>Scanning Neural Network...</p>
          <p className="text-sky-500">Lookup CID: {state.identity}</p>
          <p className="animate-pulse">Validating Signature...</p>
        </div>
        <button onClick={abort} className="mt-16 text-slate-300 hover:text-rose-500 mono text-[10px] font-bold uppercase tracking-widest transition-colors">
          Abort Synchronizer
        </button>
      </div>
    </div>
  );

  const renderProcess = () => (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden relative">
      <div className="px-10 py-12 glass-panel border-t-0 border-x-0 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-8">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg border border-slate-100">
            <IconWrapper d={PLATFORMS.find(p => p.id === state.platform)?.iconPath || ""} size={28} color="#0ea5e9" />
          </div>
          <div>
            <span className="mono text-[10px] text-slate-400 uppercase tracking-[0.4em] block mb-2 font-bold">Active CID</span>
            <span className="mono text-lg font-black text-slate-900 uppercase">{state.identity}</span>
          </div>
        </div>
        <div className="flex items-center gap-10">
          <div className="text-right hidden md:block">
             <span className="mono text-[10px] text-slate-400 uppercase block mb-2 font-bold">Neural Protocol</span>
             <span className="mono text-xs font-black text-sky-600 italic tracking-[0.2em]">S_X_INFILTRATION</span>
          </div>
          <button onClick={abort} className="bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white px-8 py-3 rounded-full mono text-[10px] font-black uppercase tracking-widest transition-all border border-rose-100">
            Abort Hack
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-12 gap-20">
         <div className="relative group">
            <ProgressRing progress={state.progress} />
         </div>
         
         <div className="w-full max-w-md hidden lg:flex flex-col gap-8">
            <h3 className="mono text-xs font-black uppercase tracking-[0.5em] text-slate-300 border-b border-slate-200 pb-4">Live Exfiltration Trace</h3>
            <div className="space-y-6">
              {state.logs.slice(-4).map((log, i) => (
                <div key={i} className="flex gap-4 mono text-[11px] animate-in slide-in-from-right-4 duration-500">
                   <span className="text-sky-500 font-bold shrink-0">[{log.timestamp}]</span>
                   <span className="text-slate-500 tracking-tight leading-relaxed">{log.text}</span>
                </div>
              ))}
            </div>
         </div>
      </div>

      <div 
        className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${state.isTerminalOpen ? 'h-64' : 'h-14'} glass-panel border-b-0 border-x-0 shadow-2xl overflow-hidden`}
      >
        <div 
          className="flex items-center justify-between px-10 h-14 cursor-pointer hover:bg-white/50 transition-colors"
          onClick={() => setState(prev => ({ ...prev, isTerminalOpen: !prev.isTerminalOpen }))}
        >
          <div className="flex items-center gap-4">
            <div className={`w-2.5 h-2.5 rounded-full ${state.view === 'PROCESS' ? 'bg-sky-500 animate-pulse' : 'bg-slate-300'}`}></div>
            <span className="mono text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">Terminal_Payload_Output</span>
          </div>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${state.isTerminalOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
        </div>
        <div ref={scrollRef} className="h-full overflow-y-auto p-10 space-y-4 mono text-[11px] pb-24 no-scrollbar">
          {state.logs.map((log, i) => (
            <div key={i} className={`flex gap-8 ${log.category === 'success' ? 'text-emerald-600' : log.category === 'exploit' ? 'text-rose-600' : log.category === 'decryption' ? 'text-sky-600' : 'text-slate-400'}`}>
              <span className="opacity-40 shrink-0 font-bold">L_{i.toString().padStart(3, '0')}</span>
              <span className="tracking-wide font-medium">{log.text}</span>
            </div>
          ))}
          <div className="text-sky-500 animate-pulse font-black text-lg">_</div>
        </div>
      </div>
    </div>
  );

  const renderSuccess = () => {
    const metric = (MOCK_METRICS as any)[state.platform!] || { msgs: '---', bytes: '---', node: '---' };
    const chatHistory = (FAKE_CHATS as any)[state.platform!] || DEFAULT_CHATS;

    return (
      <div className="h-screen flex flex-col bg-white overflow-y-auto no-scrollbar p-6 md:p-12">
        <div className="max-w-7xl mx-auto w-full space-y-12">
          <header className="glass-panel p-16 md:p-24 rounded-[4rem] flex flex-col lg:flex-row justify-between items-center gap-16 shadow-xl border-slate-100">
            <div className="flex items-center gap-12">
              <div className="w-28 h-28 bg-emerald-50 rounded-[2.5rem] flex items-center justify-center text-6xl shadow-inner border border-emerald-100">🔓</div>
              <div className="text-center lg:text-left">
                <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-6 italic">Access_Granted</h1>
                <p className="text-slate-400 mono text-xs uppercase tracking-[0.4em] font-bold flex items-center gap-4 justify-center lg:justify-start">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> 
                  Neural Handshake complete for {state.identity}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-6 w-full lg:w-auto">
              <button onClick={() => alert("Simulation Pack Generated. Local pickup enabled.")} className="bg-slate-900 text-white px-14 py-7 rounded-[2.5rem] font-black text-xs tracking-[0.4em] uppercase hover:scale-105 transition-all shadow-2xl">
                Download Pack
              </button>
              <button onClick={abort} className="bg-slate-100 text-slate-400 hover:text-rose-600 px-14 py-7 rounded-[2.5rem] font-black text-xs tracking-[0.4em] uppercase transition-all border border-slate-200">
                Purge Link
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {Object.entries(metric).map(([k, v]) => (
              <div key={k} className="glass-panel p-16 rounded-[4rem] text-center group hover:bg-sky-50 transition-colors duration-500">
                <span className="block text-[11px] mono text-slate-300 uppercase tracking-[0.5em] mb-4 font-bold group-hover:text-sky-500 transition-colors">{k}</span>
                <span className="text-6xl font-black text-slate-900 tracking-tighter italic">{v as string}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-12 pb-32">
            <div className="xl:col-span-3 glass-panel p-16 md:p-24 rounded-[5rem] flex flex-col h-[750px] shadow-2xl relative overflow-hidden">
               <div className="flex justify-between items-center mb-16 border-b border-slate-100 pb-10">
                 <h3 className="text-sm mono text-slate-400 uppercase tracking-[0.6em] font-black italic">Intercepted Streams</h3>
                 <span className="mono text-[10px] font-black text-emerald-500 uppercase tracking-widest px-4 py-2 bg-emerald-50 rounded-full">Securely_Decrypted</span>
              </div>
              <div className="space-y-16 flex-1 overflow-y-auto no-scrollbar pr-6">
                {chatHistory.map((chat: any, i: number) => (
                  <div key={i} className={`flex flex-col ${chat.sender === 'Target' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-[11px] mono text-slate-400 uppercase font-black tracking-widest">{chat.sender}</span>
                      <span className="text-[10px] mono text-slate-200 font-bold">{chat.time}</span>
                    </div>
                    <div className={`px-12 py-8 rounded-[3.5rem] text-lg font-medium leading-relaxed max-w-[80%] shadow-lg ${chat.sender === 'Target' ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-50 text-slate-600 rounded-tl-none border border-slate-100'}`}>
                      {chat.msg}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="xl:col-span-2 space-y-10">
              <div className="glass-panel p-16 rounded-[4rem] flex-1">
                <h3 className="text-xs mono text-slate-400 uppercase tracking-[0.6em] mb-12 border-b border-slate-100 pb-8 font-black italic">Metadata Cluster</h3>
                <div className="space-y-10 mono text-[11px] font-bold">
                  <div className="flex justify-between items-center py-2 border-b border-slate-50"><span className="text-slate-300 uppercase tracking-widest">Platform</span><span className="text-slate-900 italic uppercase">{state.platform}</span></div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-50"><span className="text-slate-300 uppercase tracking-widest">Trace_ID</span><span className="text-sky-500 font-black">X_{Math.random().toString(16).substr(2, 6).toUpperCase()}</span></div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-50"><span className="text-slate-300 uppercase tracking-widest">Sync_State</span><span className="text-emerald-500 font-black">100%_LOCK</span></div>
                  <div className="flex justify-between items-center py-2"><span className="text-slate-300 uppercase tracking-widest">OpSec_Mode</span><span className="text-slate-900">SILENT</span></div>
                </div>
              </div>

              <div className="bg-emerald-50 p-12 rounded-[4rem] border border-emerald-100">
                <p className="text-emerald-700/80 text-[11px] mono uppercase tracking-[0.4em] leading-loose font-bold italic text-center">
                  Neural bridge established. Extraction link finalized.
                </p>
              </div>

              <button onClick={abort} className="w-full py-12 rounded-[3rem] bg-slate-900 text-white font-black text-xs tracking-[0.5em] uppercase hover:bg-sky-600 transition-all shadow-xl">
                Close_Hub
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative z-10 selection:bg-sky-500/10">
      {state.view === 'HUB' && renderHub()}
      {state.view === 'CONFIG' && renderConfig()}
      {state.view === 'VERIFYING' && renderVerifying()}
      {state.view === 'PROCESS' && renderProcess()}
      {state.view === 'SUCCESS' && renderSuccess()}
    </div>
  );
};

export default App;
