import { useState, useEffect } from 'react';
import { Users, Music, TrendingUp, Activity, LogOut, Database, BarChart, User, Settings, Library, Image, ClipboardList, GripVertical, Radio, FileJson, HelpCircle, ImageIcon, Presentation, Wrench, TestTube2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ChannelManager } from './ChannelManager';
import { MusicLibrary } from './MusicLibrary';
import { UserManager } from './UserManager';
import ImageSetsManager from './ImageSetsManager';
import { QuizManager } from './QuizManager';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { TimerBellSettings } from './TimerBellSettings';
import { TestingDashboard } from './TestingDashboard';
import { TestsAdminDashboard } from './TestsAdminDashboard';
import { BUILD_VERSION } from '../buildVersion';

type AnalyticsData = {
  totalUsers: number;
  completedOnboarding: number;
  activeSessions: number;
  totalListeningSessions: number;
  averageSessionDuration: number;
  topChannels: Array<{ channel_name: string; session_count: number }>;
  brainTypeDistribution: Array<{ brain_type: string; count: number }>;
  skipRatesByChannel: Array<{ channel_name: string; skip_rate: number }>;
};

type Channel = {
  id: string;
  channel_number: number;
  channel_name: string;
  description: string | null;
  playlist_data: {
    low: string[];
    medium: string[];
    high: string[];
  };
};

type TabConfig = {
  id: 'analytics' | 'channels' | 'library' | 'users' | 'images' | 'quiz' | 'settings' | 'testing' | 'tests';
  label: string;
  icon: React.ComponentType<{ size?: number }>;
};

const DEFAULT_TABS: TabConfig[] = [
  { id: 'analytics', label: 'Analytics', icon: BarChart },
  { id: 'channels', label: 'Channels', icon: Radio },
  { id: 'library', label: 'Music Library', icon: Library },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'quiz', label: 'Quiz', icon: ClipboardList },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'tests', label: 'Tests', icon: TestTube2 },
  { id: 'testing', label: 'Dev Tools', icon: Wrench },
];

type AdminDashboardProps = {
  onSwitchToUser?: () => void;
  showAudioDiagnostics?: boolean;
  onToggleAudioDiagnostics?: () => void;
};

export function AdminDashboard({ onSwitchToUser, showAudioDiagnostics, onToggleAudioDiagnostics }: AdminDashboardProps = {}) {
  const { signOut, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'analytics' | 'channels' | 'library' | 'users' | 'images' | 'quiz' | 'settings' | 'testing' | 'tests'>('analytics');
  const [tabs, setTabs] = useState<TabConfig[]>(DEFAULT_TABS);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalUsers: 0,
    completedOnboarding: 0,
    activeSessions: 0,
    totalListeningSessions: 0,
    averageSessionDuration: 0,
    topChannels: [],
    brainTypeDistribution: [],
    skipRatesByChannel: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTabOrder();
  }, [user]);

  // Check for channel query parameter and switch to channels tab
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const channelId = urlParams.get('channel');

    if (channelId) {
      setActiveTab('channels');
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics') {
      loadAnalytics();
    }
  }, [activeTab]);

  const loadTabOrder = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('admin_tab_preferences')
      .select('tab_order')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data && data.tab_order) {
      const orderedTabs = (data.tab_order as string[]).map(tabId =>
        DEFAULT_TABS.find(t => t.id === tabId)
      ).filter(Boolean) as TabConfig[];

      const missingTabs = DEFAULT_TABS.filter(t =>
        !orderedTabs.find(ot => ot.id === t.id)
      );

      setTabs([...orderedTabs, ...missingTabs]);
    }
  };

  const saveTabOrder = async (newTabs: TabConfig[]) => {
    if (!user) return;

    const tabOrder = newTabs.map(t => t.id);

    const { error } = await supabase
      .from('admin_tab_preferences')
      .upsert({
        user_id: user.id,
        tab_order: tabOrder,
        updated_at: new Date().toISOString(),
      });

    if (error) {
    }
  };

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTab(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropTabId: string) => {
    e.preventDefault();

    if (!draggedTab || draggedTab === dropTabId) {
      setDraggedTab(null);
      return;
    }

    const draggedIndex = tabs.findIndex(t => t.id === draggedTab);
    const dropIndex = tabs.findIndex(t => t.id === dropTabId);

    const newTabs = [...tabs];
    const [removed] = newTabs.splice(draggedIndex, 1);
    newTabs.splice(dropIndex, 0, removed);

    setTabs(newTabs);
    saveTabOrder(newTabs);
    setDraggedTab(null);
  };

  const handleDragEnd = () => {
    setDraggedTab(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleStartReordering = () => {
    setIsReordering(true);
    setContextMenu(null);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('brain_type, onboarding_completed');

    const { data: sessions } = await supabase
      .from('listening_sessions')
      .select('channel_id, total_duration_seconds, tracks_skipped, ended_at');

    const { data: channels } = await supabase
      .from('audio_channels')
      .select('id, channel_name');

    const totalUsers = profiles?.length || 0;
    const completedOnboarding = profiles?.filter(p => p.onboarding_completed).length || 0;

    const completedSessions = sessions?.filter(s => s.ended_at) || [];
    const activeSessions = sessions?.filter(s => !s.ended_at).length || 0;
    const totalListeningSessions = sessions?.length || 0;

    const avgDuration =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0) /
          completedSessions.length
        : 0;

    const channelCounts = new Map<string, number>();
    completedSessions.forEach((session) => {
      if (session.channel_id) {
        channelCounts.set(session.channel_id, (channelCounts.get(session.channel_id) || 0) + 1);
      }
    });

    const topChannels = Array.from(channelCounts.entries())
      .map(([channelId, count]) => {
        const channel = channels?.find(c => c.id === channelId);
        return {
          channel_name: channel?.channel_name || 'Unknown',
          session_count: count,
        };
      })
      .sort((a, b) => b.session_count - a.session_count)
      .slice(0, 5);

    const brainTypeCounts = new Map<string, number>();
    profiles?.forEach((profile) => {
      if (profile.brain_type) {
        brainTypeCounts.set(
          profile.brain_type,
          (brainTypeCounts.get(profile.brain_type) || 0) + 1
        );
      }
    });

    const brainTypeDistribution = Array.from(brainTypeCounts.entries())
      .map(([brain_type, count]) => ({ brain_type, count }))
      .sort((a, b) => b.count - a.count);

    const channelSkipRates = new Map<string, { total: number; skipped: number }>();
    completedSessions.forEach((session) => {
      if (session.channel_id) {
        const current = channelSkipRates.get(session.channel_id) || { total: 0, skipped: 0 };
        const skippedCount = Array.isArray(session.tracks_skipped)
          ? session.tracks_skipped.length
          : 0;
        channelSkipRates.set(session.channel_id, {
          total: current.total + 1,
          skipped: current.skipped + skippedCount,
        });
      }
    });

    const skipRatesByChannel = Array.from(channelSkipRates.entries())
      .map(([channelId, data]) => {
        const channel = channels?.find(c => c.id === channelId);
        return {
          channel_name: channel?.channel_name || 'Unknown',
          skip_rate: data.total > 0 ? data.skipped / data.total : 0,
        };
      })
      .sort((a, b) => b.skip_rate - a.skip_rate)
      .slice(0, 5);

    setAnalytics({
      totalUsers,
      completedOnboarding,
      activeSessions,
      totalListeningSessions,
      averageSessionDuration: avgDuration,
      topChannels,
      brainTypeDistribution,
      skipRatesByChannel,
    });

    setLoading(false);
  };

  if (loading && activeTab === 'analytics') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="mt-4 text-slate-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-24">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl text-slate-900">
              <span className="font-bold">focus</span>.music
            </h1>
            <div className="h-6 w-px bg-slate-300"></div>
            <span className="text-lg font-semibold text-slate-700">Admin Dashboard</span>
            <div className="h-6 w-px bg-slate-300"></div>
            <span className="text-sm text-slate-600">{user?.email}</span>
            <span className="mx-1">•</span>
            <span className="text-xs text-slate-500">Version {BUILD_VERSION}</span>
          </div>
          <div className="flex items-center gap-3">
            {onToggleAudioDiagnostics && (
              <button
                onClick={onToggleAudioDiagnostics}
                className={`flex items-center justify-center w-10 h-10 rounded-lg font-bold transition-all ${
                  showAudioDiagnostics
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                title="Audio Engine Diagnostics"
              >
                <Activity className="w-5 h-5" />
              </button>
            )}
            {onSwitchToUser && (
              <button
                onClick={onSwitchToUser}
                className="flex items-center gap-2 px-4 py-2 text-blue-700 hover:text-blue-900 transition-colors"
              >
                <User size={20} />
                User View
              </button>
            )}
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 transition-colors"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {isReordering && (
              <div className="py-2 text-sm text-slate-600 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <GripVertical size={16} />
                  Drag tabs to reorder them
                </span>
                <button
                  onClick={() => setIsReordering(false)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Done
                </button>
              </div>
            )}
            <nav className="flex gap-8" onContextMenu={handleContextMenu}>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    draggable={isReordering}
                    onDragStart={(e) => handleDragStart(e, tab.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, tab.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => !isReordering && setActiveTab(tab.id)}
                    className={`py-4 px-1 border-b-2 font-semibold flex items-center gap-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    } ${
                      isReordering ? 'cursor-move' : 'cursor-pointer'
                    } ${
                      draggedTab === tab.id ? 'opacity-50' : ''
                    }`}
                  >
                    {isReordering && <GripVertical size={16} />}
                    <Icon size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {contextMenu && (
          <div
            className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleStartReordering}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
            >
              <Settings size={16} />
              Reorder Tabs
            </button>
          </div>
        )}

        {activeTab === 'quiz' && (
          <div className="border-t border-slate-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <nav className="flex gap-8">
                <button
                  onClick={() => {
                    const quizManager = document.querySelector('[data-quiz-manager]') as any;
                    if (quizManager?.setActiveTab) {
                      quizManager.setActiveTab('questions');
                    }
                  }}
                  className="py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                  data-sub-tab-quiz="questions"
                >
                  <HelpCircle size={18} />
                  Questions (21)
                </button>
                <button
                  onClick={() => {
                    const quizManager = document.querySelector('[data-quiz-manager]') as any;
                    if (quizManager?.setActiveTab) {
                      quizManager.setActiveTab('algorithm');
                    }
                  }}
                  className="py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                  data-sub-tab-quiz="algorithm"
                >
                  <FileJson size={18} />
                  Algorithm & Scoring
                </button>
              </nav>
            </div>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="border-t border-slate-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <nav className="flex gap-8">
                <button
                  onClick={() => {
                    const imageManager = document.querySelector('[data-image-manager]') as any;
                    if (imageManager?.setActiveTab) {
                      imageManager.setActiveTab('channel');
                    }
                  }}
                  className="py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                  data-sub-tab-images="channel"
                >
                  <ImageIcon size={18} />
                  Channel Images
                </button>
                <button
                  onClick={() => {
                    const imageManager = document.querySelector('[data-image-manager]') as any;
                    if (imageManager?.setActiveTab) {
                      imageManager.setActiveTab('slideshow');
                    }
                  }}
                  className="py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                  data-sub-tab-images="slideshow"
                >
                  <Presentation size={18} />
                  Slideshow Sets
                </button>
              </nav>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {activeTab === 'analytics' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="text-blue-600" size={24} />
                  <h3 className="font-semibold text-slate-900">Total Users</h3>
                </div>
                <p className="text-3xl font-bold text-slate-900">{analytics.totalUsers}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {analytics.completedOnboarding} completed onboarding
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="text-green-600" size={24} />
                  <h3 className="font-semibold text-slate-900">Active Sessions</h3>
                </div>
                <p className="text-3xl font-bold text-slate-900">{analytics.activeSessions}</p>
                <p className="text-sm text-slate-500 mt-1">Currently listening</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Music className="text-orange-600" size={24} />
                  <h3 className="font-semibold text-slate-900">Total Sessions</h3>
                </div>
                <p className="text-3xl font-bold text-slate-900">{analytics.totalListeningSessions}</p>
                <p className="text-sm text-slate-500 mt-1">All time</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="text-emerald-600" size={24} />
                  <h3 className="font-semibold text-slate-900">Avg Duration</h3>
                </div>
                <p className="text-3xl font-bold text-slate-900">
                  {Math.round(analytics.averageSessionDuration / 60)}m
                </p>
                <p className="text-sm text-slate-500 mt-1">Per session</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Top Channels</h2>
                <div className="space-y-3">
                  {analytics.topChannels.map((channel, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-slate-700">{channel.channel_name}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{
                              width: `${
                                (channel.session_count /
                                  Math.max(...analytics.topChannels.map(c => c.session_count))) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-slate-900 w-12 text-right">
                          {channel.session_count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Brain Type Distribution</h2>
                <div className="space-y-3">
                  {analytics.brainTypeDistribution.slice(0, 5).map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-slate-700 text-sm capitalize">
                        {item.brain_type.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-emerald-600 h-2 rounded-full"
                            style={{
                              width: `${
                                (item.count /
                                  Math.max(...analytics.brainTypeDistribution.map(b => b.count))) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-slate-900 w-12 text-right">
                          {item.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">
                Skip Rates by Channel
              </h2>
              <div className="space-y-3">
                {analytics.skipRatesByChannel.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-slate-700">{item.channel_name}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-48 bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-red-500 h-2 rounded-full"
                          style={{ width: `${(item.skip_rate / 10) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-900 w-16 text-right">
                        {item.skip_rate.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <AnalyticsDashboard />
          </>
        )}

        {activeTab === 'channels' && <ChannelManager />}

        {activeTab === 'library' && <MusicLibrary />}

        {activeTab === 'users' && <UserManager />}

        {activeTab === 'images' && <ImageSetsManager />}

        {activeTab === 'quiz' && <QuizManager />}

        {activeTab === 'settings' && <TimerBellSettings />}

        {activeTab === 'tests' && (
          <TestsAdminDashboard
            showAudioDiagnostics={showAudioDiagnostics}
            onToggleAudioDiagnostics={onToggleAudioDiagnostics}
          />
        )}

        {activeTab === 'testing' && <TestingDashboard />}
      </main>
    </div>
  );
}
