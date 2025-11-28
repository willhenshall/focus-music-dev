import { useState, useEffect, useRef } from 'react';
import { X, Move } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface TimerDebugOverlayProps {
  isTimerActive: boolean;
  remainingTime: number;
  timerDuration: number;
  isPlaying: boolean;
  lastSetDuration: number;
  hasPlayedStartBell: boolean;
  effectRunCount: number;
  intervalActive: boolean;
}

export default function TimerDebugOverlay({
  isTimerActive,
  remainingTime,
  timerDuration,
  isPlaying,
  lastSetDuration,
  hasPlayedStartBell,
  effectRunCount,
  intervalActive,
}: TimerDebugOverlayProps) {
  const { user } = useAuth();
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [intervalTicks, setIntervalTicks] = useState(0);
  const [lastTickTime, setLastTickTime] = useState<number | null>(null);
  const [timeSinceLastTick, setTimeSinceLastTick] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Track interval ticks
  useEffect(() => {
    if (intervalActive && isTimerActive && isPlaying) {
      setIntervalTicks(prev => prev + 1);
      setLastTickTime(Date.now());
    } else {
      setIntervalTicks(0);
      setLastTickTime(null);
    }
  }, [remainingTime, intervalActive, isTimerActive, isPlaying]);

  // Calculate time since last tick
  useEffect(() => {
    if (!lastTickTime) {
      setTimeSinceLastTick(null);
      return;
    }

    const interval = setInterval(() => {
      setTimeSinceLastTick(Date.now() - lastTickTime);
    }, 100);

    return () => clearInterval(interval);
  }, [lastTickTime]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    const rect = overlayRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    // Keep within viewport bounds
    const maxX = window.innerWidth - (overlayRef.current?.offsetWidth || 0);
    const maxY = window.innerHeight - (overlayRef.current?.offsetHeight || 0);

    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  const handleClose = async () => {
    if (!user) return;

    await supabase
      .from('user_preferences')
      .update({ show_timer_debug: false })
      .eq('user_id', user.id);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (active: boolean) => {
    return active ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  };

  const getStatusText = (active: boolean) => {
    return active ? 'ACTIVE' : 'INACTIVE';
  };

  return (
    <div
      ref={overlayRef}
      className="fixed bg-slate-900/95 backdrop-blur-sm text-white rounded-lg shadow-2xl border-2 border-yellow-400 select-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 10000,
        cursor: isDragging ? 'grabbing' : 'grab',
        minWidth: '350px',
        maxWidth: '500px',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-yellow-400 text-slate-900 rounded-t-md">
        <div className="flex items-center gap-2">
          <Move size={16} />
          <span className="font-bold text-sm">Timer Debug Overlay</span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-yellow-500 rounded transition-colors"
          title="Close debug overlay"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3 text-xs font-mono">
        {/* Timer State */}
        <div className="border-b border-slate-700 pb-3">
          <div className="text-yellow-400 font-bold mb-2 text-sm">TIMER STATE</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-400">Active:</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${getStatusColor(isTimerActive)}`}>
                {getStatusText(isTimerActive)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Playing:</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${getStatusColor(isPlaying)}`}>
                {getStatusText(isPlaying)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Interval:</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${getStatusColor(intervalActive)}`}>
                {getStatusText(intervalActive)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Start Bell:</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${getStatusColor(hasPlayedStartBell)}`}>
                {getStatusText(hasPlayedStartBell)}
              </span>
            </div>
          </div>
        </div>

        {/* Time Values */}
        <div className="border-b border-slate-700 pb-3">
          <div className="text-yellow-400 font-bold mb-2 text-sm">TIME VALUES</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Remaining:</span>
              <span className="text-green-400 font-bold">{formatTime(remainingTime)} ({remainingTime}s)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Duration:</span>
              <span className="text-blue-400 font-bold">{formatTime(timerDuration)} ({timerDuration}s)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Last Set:</span>
              <span className="text-purple-400 font-bold">{formatTime(lastSetDuration)} ({lastSetDuration}s)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Progress:</span>
              <span className="text-orange-400 font-bold">
                {timerDuration > 0 ? Math.round(((timerDuration - remainingTime) / timerDuration) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Interval Diagnostics */}
        <div className="border-b border-slate-700 pb-3">
          <div className="text-yellow-400 font-bold mb-2 text-sm">INTERVAL DIAGNOSTICS</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Effect Runs:</span>
              <span className="text-cyan-400 font-bold">{effectRunCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Interval Ticks:</span>
              <span className="text-cyan-400 font-bold">{intervalTicks}</span>
            </div>
            {timeSinceLastTick !== null && (
              <div className="flex justify-between">
                <span className="text-slate-400">Since Last Tick:</span>
                <span className={`font-bold ${timeSinceLastTick > 1500 ? 'text-red-400' : 'text-green-400'}`}>
                  {timeSinceLastTick}ms
                </span>
              </div>
            )}
            {lastTickTime && (
              <div className="flex justify-between">
                <span className="text-slate-400">Last Tick:</span>
                <span className="text-slate-300 text-[10px]">
                  {new Date(lastTickTime).toLocaleTimeString()}.{String(lastTickTime % 1000).padStart(3, '0')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Condition Check */}
        <div>
          <div className="text-yellow-400 font-bold mb-2 text-sm">COUNTDOWN CONDITIONS</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isTimerActive ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-slate-300">Timer is active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isPlaying ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-slate-300">Music is playing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${intervalActive ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-slate-300">Interval is running</span>
            </div>
            <div className="mt-2 p-2 bg-slate-800 rounded">
              <div className="text-[10px] text-slate-400 mb-1">SHOULD COUNT DOWN:</div>
              <div className={`text-sm font-bold ${isTimerActive && isPlaying ? 'text-green-400' : 'text-red-400'}`}>
                {isTimerActive && isPlaying ? 'YES ✓' : 'NO ✗'}
              </div>
            </div>
          </div>
        </div>

        {/* Current Time */}
        <div className="text-center pt-2 border-t border-slate-700">
          <div className="text-[10px] text-slate-500">
            {new Date().toLocaleTimeString()}.{String(Date.now() % 1000).padStart(3, '0')}
          </div>
        </div>
      </div>
    </div>
  );
}
