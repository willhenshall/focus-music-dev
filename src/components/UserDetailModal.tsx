import { useState, useEffect } from 'react';
import { X, Clock, Music, MapPin, Brain, Activity, TrendingUp, Calendar, BarChart3, ListMusic, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type UserProfile = {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  onboarding_completed: boolean;
  brain_type: string | null;
  created_at: string;
  ocean_openness: number;
  ocean_conscientiousness: number;
  ocean_extraversion: number;
  ocean_agreeableness: number;
  ocean_neuroticism: number;
  adhd_indicator: number;
  asd_indicator: number;
  prefers_music: boolean;
  energy_preference: string;
};

type ListeningSession = {
  id: string;
  channel_id: string;
  channel_name: string;
  energy_level: string;
  started_at: string;
  ended_at: string | null;
  total_duration_seconds: number;
  tracks_played: string[];
  tracks_skipped: string[];
  productivity_rating: number | null;
};

type QuizResponse = {
  question_number: number;
  response_value: number;
  response_time_ms: number | null;
  created_at: string;
};

type LoginHistory = {
  timestamp: string;
  ip_address: string | null;
  user_agent: string | null;
};

type UserDetailModalProps = {
  user: UserProfile;
  onClose: () => void;
  onUserDeleted?: () => void;
  onUserUpdated?: () => void;
};

export function UserDetailModal({ user, onClose, onUserDeleted, onUserUpdated }: UserDetailModalProps) {
  const [sessions, setSessions] = useState<ListeningSession[]>([]);
  const [quizResponses, setQuizResponses] = useState<QuizResponse[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'quiz' | 'activity'>('overview');
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [email, setEmail] = useState(user.email);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadUserDetails();
  }, [user.id]);

  useEffect(() => {
    setDisplayName(user.display_name || '');
    setEmail(user.email);
  }, [user.display_name, user.email]);

  const loadUserDetails = async () => {
    setLoading(true);
    try {
      const [sessionsRes, quizRes] = await Promise.all([
        supabase
          .from('listening_sessions')
          .select('*, audio_channels(channel_name)')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .limit(20),
        supabase
          .from('quiz_responses')
          .select('*')
          .eq('user_id', user.id)
          .order('question_number', { ascending: true }),
      ]);

      if (sessionsRes.data) {
        setSessions(
          sessionsRes.data.map((session: any) => ({
            ...session,
            channel_name: session.audio_channels?.channel_name || 'Unknown Channel',
          }))
        );
      }

      if (quizRes.data) {
        setQuizResponses(quizRes.data);
      }

      setLoginHistory([
        {
          timestamp: user.created_at,
          ip_address: null,
          user_agent: null,
        },
      ]);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };


  const handleUpdateDisplayName = async () => {
    if (displayName.trim() === user.display_name) {
      setIsEditingName(false);
      return;
    }

    setUpdatingName(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id);

      if (error) throw error;

      user.display_name = displayName.trim();
      setIsEditingName(false);
    } catch (error) {
      alert('Failed to update display name. Please try again.');
      setDisplayName(user.display_name || '');
    } finally {
      setUpdatingName(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (email.trim() === user.email) {
      setIsEditingEmail(false);
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }

    setUpdatingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-user-email`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          newEmail: email.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update email');
      }

      user.email = email.trim();
      setIsEditingEmail(false);
      alert('Email updated successfully');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update email. Please try again.');
      setEmail(user.email);
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handleDeleteUser = async () => {
    if (deleteConfirmText !== 'DELETE') {
      return;
    }

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      alert(`User "${user.email}" has been deleted successfully`);
      onClose();
      if (onUserDeleted) {
        onUserDeleted();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const totalListeningTime = sessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0);
  const completedSessions = sessions.filter(s => s.ended_at).length;
  const avgSessionDuration = completedSessions > 0 ? totalListeningTime / completedSessions : 0;

  const channelStats = sessions.reduce((acc, session) => {
    const name = session.channel_name;
    if (!acc[name]) {
      acc[name] = { count: 0, duration: 0 };
    }
    acc[name].count += 1;
    acc[name].duration += session.total_duration_seconds || 0;
    return acc;
  }, {} as Record<string, { count: number; duration: number }>);

  const topChannels = Object.entries(channelStats)
    .sort((a, b) => b[1].duration - a[1].duration)
    .slice(0, 5);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24"
      onClick={onClose}
      data-testid="user-detail-modal"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full flex flex-col"
        style={{ height: 'calc(100vh - 220px)', maxHeight: 'calc(100vh - 220px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {isEditingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateDisplayName();
                      if (e.key === 'Escape') {
                        setDisplayName(user.display_name || '');
                        setIsEditingName(false);
                      }
                    }}
                    disabled={updatingName}
                    data-testid="user-detail-displayname-input"
                    className="text-2xl font-bold bg-white bg-opacity-20 text-white px-3 py-1 rounded border-2 border-white border-opacity-40 focus:outline-none focus:border-opacity-100 disabled:opacity-50"
                    autoFocus
                  />
                  <button
                    onClick={handleUpdateDisplayName}
                    disabled={updatingName}
                    data-testid="user-detail-save-name-button"
                    className="px-3 py-1 bg-white text-blue-600 rounded hover:bg-opacity-90 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {updatingName ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setDisplayName(user.display_name || '');
                      setIsEditingName(false);
                    }}
                    disabled={updatingName}
                    className="px-3 py-1 bg-white bg-opacity-20 text-white rounded hover:bg-opacity-30 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <h2
                  className="text-2xl font-bold mb-1 cursor-pointer hover:bg-white hover:bg-opacity-10 px-2 py-1 -mx-2 rounded transition-colors"
                  onClick={() => setIsEditingName(true)}
                  title="Click to edit name"
                  data-testid="user-detail-displayname"
                >
                  {displayName || 'No Name'}
                </h2>
              )}

              {isEditingEmail ? (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateEmail();
                      if (e.key === 'Escape') {
                        setEmail(user.email);
                        setIsEditingEmail(false);
                      }
                    }}
                    disabled={updatingEmail}
                    className="bg-white bg-opacity-20 text-white px-3 py-1 rounded border-2 border-white border-opacity-40 focus:outline-none focus:border-opacity-100 disabled:opacity-50"
                    autoFocus
                  />
                  <button
                    onClick={handleUpdateEmail}
                    disabled={updatingEmail}
                    className="px-3 py-1 bg-white text-blue-600 rounded hover:bg-opacity-90 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {updatingEmail ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEmail(user.email);
                      setIsEditingEmail(false);
                    }}
                    disabled={updatingEmail}
                    className="px-3 py-1 bg-white bg-opacity-20 text-white rounded hover:bg-opacity-30 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p
                  className="text-blue-100 cursor-pointer hover:bg-white hover:bg-opacity-10 px-2 py-1 -mx-2 rounded transition-colors inline-block"
                  onClick={() => setIsEditingEmail(true)}
                  title="Click to edit email"
                >
                  {email}
                </p>
              )}

              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {user.onboarding_completed ? (
                  <span className="px-2 py-1 bg-green-500 bg-opacity-30 rounded text-xs font-medium">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-yellow-500 bg-opacity-30 rounded text-xs font-medium">
                    Pending Onboarding
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="user-detail-delete-button"
                className="p-2 hover:bg-red-500 hover:bg-opacity-20 rounded-lg transition-colors flex-shrink-0"
                title="Delete user"
              >
                <Trash2 size={20} />
              </button>
              <button
                onClick={onClose}
                data-testid="user-detail-close-button"
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors flex-shrink-0"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white flex-shrink-0">
          <div className="flex gap-6 px-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'sessions'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Listening Sessions
            </button>
            <button
              onClick={() => setActiveTab('quiz')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'quiz'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Quiz Results
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'activity'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Activity Log
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <Clock size={18} />
                        <span className="text-sm font-medium">Total Listening</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">
                        {formatDuration(totalListeningTime)}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <ListMusic size={18} />
                        <span className="text-sm font-medium">Sessions</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">{sessions.length}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <TrendingUp size={18} />
                        <span className="text-sm font-medium">Avg Session</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">
                        {formatDuration(avgSessionDuration)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <Brain size={20} />
                      Personality Profile
                    </h3>
                    <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-700">Brain Type</span>
                        <span className="font-medium text-slate-900 capitalize">
                          {user.brain_type?.replace(/_/g, ' ') || 'Not set'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-700">Energy Preference</span>
                        <span className="font-medium text-slate-900 capitalize">
                          {user.energy_preference}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-700">Music Preference</span>
                        <span className="font-medium text-slate-900">
                          {user.prefers_music ? 'Prefers music' : 'Prefers ambient'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <BarChart3 size={20} />
                      OCEAN Scores
                    </h3>
                    <div className="space-y-2">
                      {[
                        { label: 'Openness', value: user.ocean_openness },
                        { label: 'Conscientiousness', value: user.ocean_conscientiousness },
                        { label: 'Extraversion', value: user.ocean_extraversion },
                        { label: 'Agreeableness', value: user.ocean_agreeableness },
                        { label: 'Neuroticism', value: user.ocean_neuroticism },
                      ].map((trait) => (
                        <div key={trait.label}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-700">{trait.label}</span>
                            <span className="font-medium text-slate-900">{trait.value}/100</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${trait.value}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {topChannels.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <Music size={20} />
                        Top Channels
                      </h3>
                      <div className="space-y-2">
                        {topChannels.map(([name, stats]) => (
                          <div key={name} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                            <div>
                              <p className="font-medium text-slate-900">{name}</p>
                              <p className="text-xs text-slate-600">
                                {stats.count} sessions
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-blue-600">
                              {formatDuration(stats.duration)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'sessions' && (
                <div className="space-y-4">
                  {sessions.length === 0 ? (
                    <div className="text-center py-12">
                      <Music className="mx-auto text-slate-300 mb-4" size={48} />
                      <p className="text-slate-600">No listening sessions yet</p>
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <div key={session.id} className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-semibold text-slate-900">
                              {session.channel_name}
                            </h4>
                            <p className="text-sm text-slate-600 capitalize">
                              {session.energy_level || 'not defined'} energy
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            session.ended_at
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {session.ended_at ? 'Completed' : 'Active'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            {new Date(session.started_at).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={14} />
                            {formatDuration(session.total_duration_seconds)}
                          </span>
                          {session.tracks_played && (
                            <span>
                              {Array.isArray(session.tracks_played) ? session.tracks_played.length : 0} tracks
                            </span>
                          )}
                          {session.tracks_skipped && Array.isArray(session.tracks_skipped) && session.tracks_skipped.length > 0 && (
                            <span className="text-orange-600">
                              {session.tracks_skipped.length} skipped
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'quiz' && (
                <div className="space-y-4">
                  {quizResponses.length === 0 ? (
                    <div className="text-center py-12">
                      <Brain className="mx-auto text-slate-300 mb-4" size={48} />
                      <p className="text-slate-600">No quiz responses yet</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-slate-600 mb-4">
                        Total responses: {quizResponses.length} questions
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {quizResponses.map((response) => (
                          <div
                            key={response.question_number}
                            className="bg-slate-50 rounded-lg p-3 flex justify-between items-center"
                          >
                            <div>
                              <span className="text-sm font-medium text-slate-900">
                                Question {response.question_number}
                              </span>
                              {response.response_time_ms && (
                                <p className="text-xs text-slate-500">
                                  {(response.response_time_ms / 1000).toFixed(1)}s
                                </p>
                              )}
                            </div>
                            <span className="text-lg font-bold text-blue-600">
                              {response.response_value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Calendar className="text-blue-600" size={20} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Account Created</p>
                        <p className="text-sm text-slate-600">
                          {new Date(user.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {sessions.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Activity className="text-green-600" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">Last Active</p>
                          <p className="text-sm text-slate-600">
                            {new Date(sessions[0].started_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                      <strong>Note:</strong> Detailed login history including IP addresses and device information
                      will be available in a future update. Currently showing basic account activity.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div
          className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center z-10 rounded-lg"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Delete User</h3>
                <p className="text-slate-600 text-sm mb-4">
                  You are about to permanently delete the user:
                </p>
                <p className="text-slate-900 font-semibold mb-4">
                  {user.email}
                </p>
                <p className="text-slate-600 text-sm mb-4">
                  This action cannot be undone. All user data, sessions, and preferences will be permanently removed. To confirm, please type <span className="font-mono font-bold text-red-600">DELETE</span> below:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && deleteConfirmText === 'DELETE') {
                      handleDeleteUser();
                    }
                    if (e.key === 'Escape') {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                  placeholder="Type DELETE to confirm"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
                disabled={deleting}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
