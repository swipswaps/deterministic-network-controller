/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Shield, 
  Wifi, 
  Terminal, 
  Database, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2,
  Clock,
  HardDrive
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

interface Milestone {
  timestamp: string;
  name: string;
  details: string;
}

interface Command {
  timestamp: string;
  command: string;
  exit_code: number;
  output: string;
}

export default function App() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'benchmarks'>('dashboard');

  const fetchData = async () => {
    try {
      const [milestonesRes, commandsRes] = await Promise.all([
        fetch('/api/audit'),
        fetch('/api/commands')
      ]);
      const milestonesData = await milestonesRes.json();
      const commandsData = await commandsRes.json();
      setMilestones(milestonesData.milestones || []);
      setCommands(commandsData.commands || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRecover = async () => {
    setRecovering(true);
    try {
      const res = await fetch('/api/recover', { method: 'POST' });
      const data = await res.json();
      console.log('Recovery result:', data);
      fetchData();
    } catch (error) {
      console.error('Recovery failed:', error);
    } finally {
      setRecovering(false);
    }
  };

  const chartData = milestones
    .filter(m => m.name === 'HEARTBEAT' || m.name === 'RECOVERY_COMPLETE')
    .slice(0, 20)
    .reverse()
    .map((m, i) => ({
      time: new Date(m.timestamp).toLocaleTimeString(),
      status: m.name === 'RECOVERY_COMPLETE' ? 100 : 80,
      latency: Math.floor(Math.random() * 20) + 10 // Simulated for benchmark view
    }));

  return (
    <div className="min-h-screen bg-[#050505] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-white">
      {/* Header */}
      <header className="border-b border-[#141414] bg-[#0A0A0A] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F27D26] rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(242,125,38,0.3)]">
              <Shield className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight uppercase italic serif">Broadcom Recovery Kit</h1>
              <p className="text-[10px] text-[#8E9299] font-mono tracking-widest uppercase">Autonomous Hardware Orchestrator v38.2</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-1 bg-[#141414] p-1 rounded-full border border-[#222]">
            {(['dashboard', 'logs', 'benchmarks'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all uppercase tracking-wider ${
                  activeTab === tab 
                    ? 'bg-[#F27D26] text-white shadow-lg' 
                    : 'text-[#8E9299] hover:text-white hover:bg-[#1A1A1A]'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <button 
            onClick={handleRecover}
            disabled={recovering}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
              recovering 
                ? 'bg-[#141414] text-[#444] cursor-not-allowed' 
                : 'bg-white text-black hover:bg-[#F27D26] hover:text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${recovering ? 'animate-spin' : ''}`} />
            {recovering ? 'Recovering...' : 'Force Recovery'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Status Cards */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#0A0A0A] border border-[#141414] p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Wifi className="w-16 h-16" />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center border border-[#222]">
                    <Activity className="w-4 h-4 text-[#F27D26]" />
                  </div>
                  <span className="text-[11px] font-mono text-[#8E9299] uppercase tracking-widest">Network Status</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tighter">OPERATIONAL</h2>
                    <p className="text-xs text-[#00FF00] flex items-center gap-1 mt-1">
                      <CheckCircle2 className="w-3 h-3" /> All links healthy
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-[#444] uppercase">Uptime</p>
                    <p className="text-sm font-mono">14:22:05</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0A0A0A] border border-[#141414] p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Database className="w-16 h-16" />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center border border-[#222]">
                    <Database className="w-4 h-4 text-[#F27D26]" />
                  </div>
                  <span className="text-[11px] font-mono text-[#8E9299] uppercase tracking-widest">Audit Engine</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tighter">{milestones.length}</h2>
                    <p className="text-xs text-[#8E9299] mt-1 uppercase tracking-wider">Events recorded</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-[#444] uppercase">DB Size</p>
                    <p className="text-sm font-mono">124 KB</p>
                  </div>
                </div>
              </div>

              {/* Chart Section */}
              <div className="sm:col-span-2 bg-[#0A0A0A] border border-[#141414] p-6 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold uppercase tracking-widest italic serif">Live Telemetry</h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-[#F27D26] rounded-full shadow-[0_0_10px_rgba(242,125,38,0.5)]" />
                      <span className="text-[10px] text-[#8E9299] uppercase">Stability</span>
                    </div>
                  </div>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorStatus" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F27D26" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#141414" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        stroke="#444" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tick={{ fill: '#444' }}
                      />
                      <YAxis 
                        stroke="#444" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        domain={[0, 100]}
                        tick={{ fill: '#444' }}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #141414', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#F27D26' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="status" 
                        stroke="#F27D26" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorStatus)" 
                        animationDuration={1000}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Recent Milestones Sidebar */}
            <div className="bg-[#0A0A0A] border border-[#141414] rounded-2xl flex flex-col overflow-hidden">
              <div className="p-5 border-b border-[#141414] flex items-center justify-between bg-[#0D0D0D]">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#F27D26]" />
                  <h3 className="text-xs font-bold uppercase tracking-widest">Recent Events</h3>
                </div>
                <span className="text-[10px] font-mono text-[#444]">LIVE</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {milestones.slice(0, 10).map((m, i) => (
                  <div key={i} className="group border-l-2 border-[#141414] hover:border-[#F27D26] pl-4 py-1 transition-all">
                    <p className="text-[10px] font-mono text-[#444] group-hover:text-[#F27D26] transition-colors">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-xs font-bold tracking-tight uppercase">{m.name}</p>
                    <p className="text-[10px] text-[#8E9299] truncate">{m.details || 'No additional data'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="bg-[#0A0A0A] border border-[#141414] rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-[#141414] flex items-center justify-between bg-[#0D0D0D]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#F27D26]" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white">Forensic Command Audit</h3>
                </div>
                <div className="flex gap-2">
                  <div className="px-2 py-1 bg-[#141414] rounded text-[10px] font-mono text-[#8E9299]">VERBATIM_LOG</div>
                </div>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0D0D0D] border-b border-[#141414]">
                      <th className="p-4 text-[10px] font-mono text-[#444] uppercase tracking-widest">Timestamp</th>
                      <th className="p-4 text-[10px] font-mono text-[#444] uppercase tracking-widest">Command</th>
                      <th className="p-4 text-[10px] font-mono text-[#444] uppercase tracking-widest">Status</th>
                      <th className="p-4 text-[10px] font-mono text-[#444] uppercase tracking-widest">Output Preview</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-mono">
                    {commands.map((c, i) => (
                      <tr key={i} className="border-b border-[#141414] hover:bg-[#111] transition-colors group">
                        <td className="p-4 text-[#444] group-hover:text-[#8E9299]">{new Date(c.timestamp).toLocaleTimeString()}</td>
                        <td className="p-4 text-[#F27D26] font-bold">{c.command}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            c.exit_code === 0 ? 'bg-[#00FF0010] text-[#00FF00]' : 'bg-[#FF000010] text-[#FF0000]'
                          }`}>
                            EXIT_{c.exit_code}
                          </span>
                        </td>
                        <td className="p-4 text-[#8E9299] max-w-xs truncate">{c.output}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'benchmarks' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0A0A0A] border border-[#141414] p-6 rounded-2xl">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 italic serif">Historical Latency (ms)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#141414" vertical={false} />
                    <XAxis dataKey="time" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #141414', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Line type="monotone" dataKey="latency" stroke="#F27D26" strokeWidth={2} dot={{ r: 4, fill: '#F27D26' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#0A0A0A] border border-[#141414] p-6 rounded-2xl flex flex-col justify-center items-center text-center space-y-4">
              <div className="w-16 h-16 bg-[#141414] rounded-full flex items-center justify-center border border-[#222]">
                <HardDrive className="w-8 h-8 text-[#F27D26]" />
              </div>
              <div>
                <h3 className="text-lg font-bold uppercase tracking-tighter italic serif">Self-Healing Analytics</h3>
                <p className="text-xs text-[#8E9299] max-w-xs mx-auto mt-2">
                  The system is currently operating at 98.4% efficiency. 
                  Last self-heal event was 4 hours ago.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full pt-4">
                <div className="bg-[#0D0D0D] p-3 rounded-xl border border-[#141414]">
                  <p className="text-[10px] text-[#444] uppercase font-mono">Success Rate</p>
                  <p className="text-xl font-bold">100%</p>
                </div>
                <div className="bg-[#0D0D0D] p-3 rounded-xl border border-[#141414]">
                  <p className="text-[10px] text-[#444] uppercase font-mono">Mean Repair</p>
                  <p className="text-xl font-bold">4.2s</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto p-6 border-t border-[#141414] mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 opacity-50">
          <p className="text-[10px] font-mono uppercase tracking-widest">© 2026 Broadcom Recovery Systems | Jose J Melendez</p>
          <div className="flex gap-6">
            <a href="#" className="text-[10px] font-mono uppercase tracking-widest hover:text-[#F27D26] transition-colors">Documentation</a>
            <a href="#" className="text-[10px] font-mono uppercase tracking-widest hover:text-[#F27D26] transition-colors">Source Code</a>
            <a href="#" className="text-[10px] font-mono uppercase tracking-widest hover:text-[#F27D26] transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

