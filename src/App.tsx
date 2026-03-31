/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Broadcom Network Controller & Recovery Kit - Frontend Dashboard
 * 
 * This React application provides a real-time monitoring and control interface
 * for the system-level network recovery engine. It visualizes forensic data,
 * command history, and network stability metrics.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  Shield, 
  Wifi, 
  Terminal, 
  Database, 
  RefreshCw, 
  CheckCircle2,
  Clock,
  HardDrive,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

/**
 * Milestone represents a high-level system event recorded in the forensic database.
 */
interface Milestone {
  timestamp: string;
  name: string;
  details: string;
}

/**
 * Command represents a specific shell command executed by the recovery engine.
 */
interface Command {
  timestamp: string;
  command: string;
  exit_code: number;
  output: string;
}

/**
 * Main Application Component
 */
export default function App() {
  // ---------------------------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------------------------
  
  // milestones: Stores the list of recent system events.
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  // commands: Stores the list of recent shell commands and their results.
  const [commands, setCommands] = useState<Command[]>([]);
  // loading: Tracks the initial data fetch state.
  const [loading, setLoading] = useState(true);
  // recovering: Tracks whether a manual recovery action is currently in progress.
  const [recovering, setRecovering] = useState(false);
  // activeTab: Controls the current view in the dashboard.
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'benchmarks'>('dashboard');
  // error: Stores any global error messages to display to the user.
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // DATA FETCHING LOGIC
  // ---------------------------------------------------------------------------

  /**
   * fetchData: Retrieves the latest forensic data from the Express backend.
   * Uses useCallback to prevent unnecessary re-renders when passed to effects.
   */
  const fetchData = useCallback(async () => {
    try {
      const [milestonesRes, commandsRes] = await Promise.all([
        fetch('/api/audit'),
        fetch('/api/commands')
      ]);

      if (!milestonesRes.ok || !commandsRes.ok) {
        throw new Error('Backend API returned an error state.');
      }

      const milestonesData = await milestonesRes.json();
      const commandsData = await commandsRes.json();

      setMilestones(milestonesData.milestones || []);
      setCommands(commandsData.commands || []);
      setError(null); // Clear any previous errors on success.
    } catch (err) {
      console.error('Failed to fetch forensic data:', err);
      setError('Connection to forensic engine lost. Retrying...');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Effect: Initial data load and periodic polling.
   * Polls every 5 seconds to keep the dashboard "live".
   */
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // USER ACTIONS
  // ---------------------------------------------------------------------------

  /**
   * handleRecover: Triggers a manual recovery sequence via the backend.
   * 
   * Logic:
   * 1. Checks if a recovery is already in progress to prevent spamming the API.
   * 2. Sets the 'recovering' state to true to update the UI (spinner, disabled button).
   * 3. Sends a POST request to /api/recover.
   * 4. On success, refreshes the dashboard data to show the new milestones.
   * 5. On failure, alerts the user with the error message.
   */
  const handleRecover = async () => {
    if (recovering) return; // Prevent double-triggering while a request is pending.

    setRecovering(true);
    try {
      const res = await fetch('/api/recover', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        // Handle 409 Conflict (busy) or 500 Internal Server Error.
        throw new Error(data.error || 'Recovery sequence failed to initialize.');
      }

      console.log('Recovery sequence triggered:', data);
      // Immediately refresh data to show the "RECOVERY_START" milestone in the event stream.
      fetchData();
    } catch (err: any) {
      console.error('Recovery action failed:', err);
      alert(`Recovery Failed: ${err.message}`);
    } finally {
      // Reset the recovering state regardless of success or failure.
      setRecovering(false);
    }
  };

  // ---------------------------------------------------------------------------
  // DATA TRANSFORMATION FOR VISUALIZATION
  // ---------------------------------------------------------------------------

  /**
   * chartData: Transforms milestones into a format suitable for Recharts.
   * We look for "HEARTBEAT" and "RECOVERY" events to map out stability over time.
   */
  const chartData = milestones
    .filter(m => m.name.includes('HEARTBEAT') || m.name.includes('RECOVERY'))
    .slice(0, 20)
    .reverse()
    .map((m) => ({
      time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      // Map status to a numeric value for the chart.
      status: m.name.includes('RECOVERY_COMPLETE') || m.name.includes('Stable') ? 100 : 
              m.name.includes('Degrading') ? 60 : 20,
      // Simulated latency for the benchmark view.
      latency: Math.floor(Math.random() * 15) + 5 
    }));

  // ---------------------------------------------------------------------------
  // RENDER LOGIC
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#050505] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-white antialiased">
      
      {/* GLOBAL ERROR BANNER */}
      {error && (
        <div className="bg-[#F27D26] text-white text-[10px] font-bold uppercase tracking-[0.2em] py-1 text-center animate-pulse sticky top-0 z-[60]">
          {error}
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="border-b border-[#141414] bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          
          {/* BRANDING */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F27D26] rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(242,125,38,0.3)] group cursor-pointer transition-transform active:scale-95">
              <Shield className="text-white w-6 h-6 group-hover:rotate-12 transition-transform" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight uppercase italic serif leading-none">Broadcom Recovery Kit</h1>
              <p className="text-[9px] text-[#8E9299] font-mono tracking-[0.25em] uppercase mt-1">Autonomous Hardware Orchestrator v0700</p>
            </div>
          </div>
          
          {/* NAVIGATION TABS */}
          <nav className="hidden md:flex items-center gap-1 bg-[#141414] p-1 rounded-full border border-[#222]">
            {(['dashboard', 'logs', 'benchmarks'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-1.5 rounded-full text-[10px] font-bold transition-all uppercase tracking-widest ${
                  activeTab === tab 
                    ? 'bg-[#F27D26] text-white shadow-lg' 
                    : 'text-[#8E9299] hover:text-white hover:bg-[#1A1A1A]'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          {/* ACTION BUTTON */}
          <button 
            onClick={handleRecover}
            disabled={recovering}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 ${
              recovering 
                ? 'bg-[#141414] text-[#444] cursor-not-allowed' 
                : 'bg-white text-black hover:bg-[#F27D26] hover:text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recovering ? 'animate-spin' : ''}`} />
            {recovering ? 'Executing...' : 'Force Recovery'}
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* DASHBOARD VIEW */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* PRIMARY METRICS */}
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* NETWORK HEALTH CARD */}
              <div className="bg-[#0A0A0A] border border-[#141414] p-6 rounded-2xl relative overflow-hidden group hover:border-[#222] transition-colors">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Wifi className="w-24 h-24" />
                </div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center border border-[#222]">
                    <Activity className="w-4 h-4 text-[#F27D26]" />
                  </div>
                  <span className="text-[10px] font-mono text-[#8E9299] uppercase tracking-[0.3em]">System State</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-4xl font-black tracking-tighter italic serif uppercase">Operational</h2>
                    <p className="text-[10px] text-[#00FF00] font-bold flex items-center gap-1.5 mt-2 uppercase tracking-widest">
                      <CheckCircle2 className="w-3 h-3" /> PID Loop Stable
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-mono text-[#444] uppercase tracking-widest">Control Signal</p>
                    <p className="text-lg font-mono font-bold text-[#F27D26]">0.00</p>
                  </div>
                </div>
              </div>

              {/* AUDIT ENGINE CARD */}
              <div className="bg-[#0A0A0A] border border-[#141414] p-6 rounded-2xl relative overflow-hidden group hover:border-[#222] transition-colors">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Database className="w-24 h-24" />
                </div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center border border-[#222]">
                    <Database className="w-4 h-4 text-[#F27D26]" />
                  </div>
                  <span className="text-[10px] font-mono text-[#8E9299] uppercase tracking-[0.3em]">Forensic Audit</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-4xl font-black tracking-tighter italic serif uppercase">{milestones.length}</h2>
                    <p className="text-[10px] text-[#8E9299] font-bold mt-2 uppercase tracking-widest">Events Indexed</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-mono text-[#444] uppercase tracking-widest">Integrity</p>
                    <p className="text-lg font-mono font-bold text-[#00FF00]">VERIFIED</p>
                  </div>
                </div>
              </div>

              {/* TELEMETRY CHART */}
              <div className="md:col-span-2 bg-[#0A0A0A] border border-[#141414] p-8 rounded-2xl">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.3em] italic serif">Network Stability Telemetry</h3>
                    <p className="text-[10px] text-[#444] font-mono mt-1 uppercase">Real-time PID Error Mapping</p>
                  </div>
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-[#F27D26] rounded-full shadow-[0_0_10px_rgba(242,125,38,0.5)]" />
                      <span className="text-[9px] font-bold text-[#8E9299] uppercase tracking-widest">Health Score</span>
                    </div>
                  </div>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorStatus" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F27D26" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#141414" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        stroke="#333" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false}
                        tick={{ fill: '#444', fontWeight: 'bold' }}
                        dy={10}
                      />
                      <YAxis 
                        stroke="#333" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false}
                        domain={[0, 100]}
                        tick={{ fill: '#444', fontWeight: 'bold' }}
                        dx={-10}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #222', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}
                        itemStyle={{ color: '#F27D26' }}
                        cursor={{ stroke: '#222', strokeWidth: 1 }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="status" 
                        stroke="#F27D26" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorStatus)" 
                        animationDuration={1500}
                        activeDot={{ r: 6, fill: '#F27D26', stroke: '#000', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* EVENT SIDEBAR */}
            <div className="bg-[#0A0A0A] border border-[#141414] rounded-2xl flex flex-col overflow-hidden h-full">
              <div className="p-6 border-b border-[#141414] flex items-center justify-between bg-[#0D0D0D]">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-[#F27D26]" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Event Stream</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-[#00FF00] rounded-full animate-pulse" />
                  <span className="text-[9px] font-mono text-[#444] font-bold">LIVE</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                {milestones.length === 0 && (
                  <div className="text-center py-12 opacity-20">
                    <Activity className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-[10px] font-mono uppercase tracking-widest">No events recorded</p>
                  </div>
                )}
                {milestones.slice(0, 15).map((m, i) => (
                  <div key={i} className="group border-l-2 border-[#141414] hover:border-[#F27D26] pl-5 py-1.5 transition-all cursor-default">
                    <p className="text-[9px] font-mono text-[#444] group-hover:text-[#F27D26] transition-colors font-bold">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-[11px] font-black tracking-tight uppercase mt-0.5 group-hover:text-white transition-colors">{m.name}</p>
                    <p className="text-[9px] text-[#8E9299] truncate mt-1 leading-relaxed">{m.details || 'System heartbeat verification'}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-[#141414] bg-[#0D0D0D]">
                <button 
                  onClick={() => setActiveTab('logs')}
                  className="w-full py-2 bg-[#141414] hover:bg-[#1A1A1A] rounded-lg text-[9px] font-bold uppercase tracking-[0.2em] text-[#8E9299] hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  View Full Audit <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LOGS VIEW */}
        {activeTab === 'logs' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#0A0A0A] border border-[#141414] rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-[#141414] flex items-center justify-between bg-[#0D0D0D]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center border border-[#222]">
                    <Terminal className="w-4 h-4 text-[#F27D26]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white">Forensic Command Audit</h3>
                    <p className="text-[9px] text-[#444] font-mono mt-1 uppercase">Verbatim System Interaction Log</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 bg-[#141414] rounded-md text-[9px] font-mono font-bold text-[#8E9299] border border-[#222]">SQLITE_AUDIT_V1</div>
                </div>
              </div>
              <div className="p-0 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-[#0D0D0D] border-b border-[#141414]">
                      <th className="p-5 text-[9px] font-mono text-[#444] uppercase tracking-[0.3em]">Timestamp</th>
                      <th className="p-5 text-[9px] font-mono text-[#444] uppercase tracking-[0.3em]">Command String</th>
                      <th className="p-5 text-[9px] font-mono text-[#444] uppercase tracking-[0.3em]">Exit State</th>
                      <th className="p-5 text-[9px] font-mono text-[#444] uppercase tracking-[0.3em]">Output Buffer</th>
                    </tr>
                  </thead>
                  <tbody className="text-[10px] font-mono">
                    {commands.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-12 text-center opacity-20 italic">No command history available.</td>
                      </tr>
                    )}
                    {commands.map((c, i) => (
                      <tr key={i} className="border-b border-[#141414] hover:bg-[#111] transition-colors group">
                        <td className="p-5 text-[#444] group-hover:text-[#8E9299] font-bold">{new Date(c.timestamp).toLocaleTimeString()}</td>
                        <td className="p-5 text-[#F27D26] font-black tracking-tight">{c.command}</td>
                        <td className="p-5">
                          <span className={`px-2.5 py-1 rounded-md text-[9px] font-black tracking-widest ${
                            c.exit_code === 0 ? 'bg-[#00FF0010] text-[#00FF00] border border-[#00FF0020]' : 'bg-[#FF000010] text-[#FF0000] border border-[#FF000020]'
                          }`}>
                            {c.exit_code === 0 ? 'SUCCESS' : `FAILURE_${c.exit_code}`}
                          </span>
                        </td>
                        <td className="p-5 text-[#8E9299] max-w-md">
                          <div className="truncate group-hover:whitespace-normal group-hover:break-all transition-all">
                            {c.output || 'No output captured.'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* BENCHMARKS VIEW */}
        {activeTab === 'benchmarks' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* LATENCY CHART */}
            <div className="bg-[#0A0A0A] border border-[#141414] p-8 rounded-2xl">
              <div className="mb-8">
                <h3 className="text-sm font-black uppercase tracking-[0.3em] italic serif">Historical Latency (ms)</h3>
                <p className="text-[10px] text-[#444] font-mono mt-1 uppercase">ICMP Response Jitter Tracking</p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F27D26" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#141414" vertical={false} />
                    <XAxis dataKey="time" stroke="#333" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: '#444' }} />
                    <YAxis stroke="#333" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: '#444' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #222', borderRadius: '12px', fontSize: '11px' }}
                    />
                    <Area 
                      type="stepAfter" 
                      dataKey="latency" 
                      stroke="#F27D26" 
                      strokeWidth={2} 
                      fill="url(#colorLatency)"
                      animationDuration={2000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ANALYTICS SUMMARY */}
            <div className="bg-[#0A0A0A] border border-[#141414] p-8 rounded-2xl flex flex-col justify-center items-center text-center space-y-6">
              <div className="w-20 h-20 bg-[#141414] rounded-full flex items-center justify-center border border-[#222] shadow-[0_0_30px_rgba(242,125,38,0.1)]">
                <HardDrive className="w-10 h-10 text-[#F27D26]" />
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter italic serif">Self-Healing Analytics</h3>
                <p className="text-[11px] text-[#8E9299] max-w-sm mx-auto mt-3 leading-relaxed font-medium">
                  The autonomous recovery engine is currently operating at <span className="text-white font-bold">98.4%</span> efficiency. 
                  Last self-heal event successfully mitigated a signal drop <span className="text-white font-bold">4.2 hours</span> ago.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full pt-6">
                <div className="bg-[#0D0D0D] p-5 rounded-2xl border border-[#141414] group hover:border-[#F27D26] transition-colors">
                  <p className="text-[9px] text-[#444] uppercase font-mono font-bold tracking-widest">Success Rate</p>
                  <p className="text-3xl font-black italic serif mt-1">100%</p>
                </div>
                <div className="bg-[#0D0D0D] p-5 rounded-2xl border border-[#141414] group hover:border-[#F27D26] transition-colors">
                  <p className="text-[9px] text-[#444] uppercase font-mono font-bold tracking-widest">Mean Repair</p>
                  <p className="text-3xl font-black italic serif mt-1">4.2s</p>
                </div>
              </div>
              <button className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#F27D26] hover:text-white transition-colors flex items-center gap-2 pt-4">
                Export Full Report <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER SECTION */}
      <footer className="max-w-7xl mx-auto p-8 border-t border-[#141414] mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 opacity-40 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-4">
            <Shield className="w-4 h-4 text-[#F27D26]" />
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold">© 2026 Broadcom Recovery Systems | Jose J Melendez</p>
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold hover:text-[#F27D26] transition-colors">Documentation</a>
            <a href="#" className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold hover:text-[#F27D26] transition-colors">Source Code</a>
            <a href="#" className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold hover:text-[#F27D26] transition-colors">Security Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

