import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MusicPlayerProvider } from './contexts/MusicPlayerContext';
import { ImageSetProvider } from './contexts/ImageSetContext';
import { NowPlayingFooter } from './components/NowPlayingFooter';
import { SlideshowOverlay } from './components/SlideshowOverlay';
import { LandingPage } from './components/LandingPage';
import { AuthForm } from './components/AuthForm';
import { OnboardingQuiz } from './components/OnboardingQuiz';
import { QuizResultsPage } from './components/QuizResultsPage';
import { UserDashboard } from './components/UserDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { SlotStrategyEditor } from './components/SlotStrategyEditor';
import { AudioEngineDiagnostics } from './components/AudioEngineDiagnostics';
import { supabase } from './lib/supabase';
import { BrainType } from './lib/brainTypeCalculator';
import { useMusicPlayer } from './contexts/MusicPlayerContext';

function AppContent() {
  const { user, profile, loading, signOut } = useAuth();
  const { audioMetrics, engineType, isStreamingEngine, currentTrack, playlist, currentTrackIndex } = useMusicPlayer();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showAuth, setShowAuth] = useState(false);
  const [viewMode, setViewMode] = useState<'user' | 'admin'>('user');
  const [initialTab, setInitialTab] = useState<'channels' | 'focus-profile' | 'images' | 'settings'>('channels');
  const [isAccessGranted, setIsAccessGranted] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizResults, setQuizResults] = useState<string[] | null>(null);
  const [quizBrainType, setQuizBrainType] = useState<{ primary: BrainType; secondary?: BrainType; secondaryScore?: number } | null>(null);
  const [quizCognitiveProfile, setQuizCognitiveProfile] = useState<{ adhdIndicator: number; asdScore: number; stimulantLevel: string } | null>(null);
  const [quizResponses, setQuizResponses] = useState<Record<string, number | string> | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [isRetakingQuiz, setIsRetakingQuiz] = useState(false);
  const [showSlideshow, setShowSlideshow] = useState(false);

  // Check for /admin route and set viewMode accordingly
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/admin' && profile?.is_admin) {
      setViewMode('admin');
    }
  }, [profile?.is_admin]);

  const handleLogoClick = async () => {
    if (user) {
      await signOut();
    }
    setShowAuth(false);
    setShowQuiz(false);
    setQuizResults(null);
    setQuizBrainType(null);
    setQuizCognitiveProfile(null);
    setQuizResponses(null);
    setAuthMode('signin');
  };

  useEffect(() => {
    const accessGranted = localStorage.getItem('site_access_granted');
    if (accessGranted === 'true') {
      setIsAccessGranted(true);
    }

    // Check if user wants to retake quiz
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('retake-quiz') === 'true') {
      setIsRetakingQuiz(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Clear quiz state when user successfully logs in/signs up
  useEffect(() => {
    if (user && profile) {
      setQuizResults(null);
      setQuizBrainType(null);
      setQuizCognitiveProfile(null);
      setQuizResponses(null);
    }
  }, [user, profile]);

  useEffect(() => {
    if (profile) {
      loadAudioPreferences();
    }

    const handlePreferencesChanged = (event: CustomEvent) => {
      // Only show diagnostics for admin users
      const diagnosticsValue = profile?.is_admin && event.detail.show_audio_diagnostics ? true : false;
      setShowDiagnostics(diagnosticsValue);
      // Persist diagnostics modal state across tab switches
      sessionStorage.setItem('showDiagnostics', String(diagnosticsValue));
      setShowQueue(event.detail.show_queue);
    };

    window.addEventListener('audioPreferencesChanged', handlePreferencesChanged as EventListener);

    return () => {
      window.removeEventListener('audioPreferencesChanged', handlePreferencesChanged as EventListener);
    };
  }, [profile]);

  const loadAudioPreferences = async () => {
    const { data } = await supabase
      .from('system_preferences')
      .select('show_audio_diagnostics, show_queue')
      .eq('id', 1)
      .maybeSingle();

    if (data) {
      // Check if diagnostics modal state is persisted in sessionStorage (survives tab switches)
      const persistedDiagnostics = sessionStorage.getItem('showDiagnostics');
      const diagnosticsValue = persistedDiagnostics !== null
        ? persistedDiagnostics === 'true'
        : (profile?.is_admin && data.show_audio_diagnostics ? true : false);

      setShowDiagnostics(diagnosticsValue);
      setShowQueue(data.show_queue ?? true);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.toLowerCase() === 'magic') {
      localStorage.setItem('site_access_granted', 'true');
      setIsAccessGranted(true);
      setPasswordError('');
    } else {
      setPasswordError('Incorrect password. Please try again.');
      setPasswordInput('');
    }
  };

  if (!isAccessGranted && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <h1 className="text-3xl text-slate-900 mb-2">
              <span className="font-bold">focus</span><span className="font-normal">.music</span>
            </h1>
            <p className="text-slate-600">Enter password to continue</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter password"
                autoFocus
              />
            </div>

            {passwordError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {passwordError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If user exists but profile isn't loaded yet, show loading
  if (user && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="mt-4 text-slate-600">Setting up your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (showAuth) {
      return (
        <AuthForm
          mode={authMode}
          onModeChange={setAuthMode}
          onSuccess={() => {
            // Don't do anything here - let AuthContext handle state updates
            // The component will automatically re-render when user/profile are set
            // and the conditional rendering will show the appropriate screen
          }}
          onLogoClick={handleLogoClick}
        />
      );
    }
    if (quizResults) {
      return (
        <QuizResultsPage
          topChannelIds={quizResults}
          brainType={quizBrainType || undefined}
          cognitiveProfile={quizCognitiveProfile || undefined}
          onStartTrial={() => {
            setAuthMode('signup');
            setShowAuth(true);
          }}
          onSignIn={() => {
            setAuthMode('signin');
            setShowAuth(true);
          }}
          onLogoClick={handleLogoClick}
          quizResponses={quizResponses || undefined}
        />
      );
    }
    if (showQuiz) {
      return (
        <OnboardingQuiz
          isAnonymous={true}
          onComplete={(topChannels, brainType, cognitiveProfile, responses) => {
            if (topChannels && topChannels.length > 0) {
              const channelIds = topChannels.map(ch => ch.channel_id);
              setQuizResults(channelIds);
              setQuizBrainType(brainType || null);
              setQuizCognitiveProfile(cognitiveProfile || null);
              setQuizResponses(responses || null);
              setShowQuiz(false);
            } else {
            }
          }}
          onLogoClick={handleLogoClick}
        />
      );
    }
    return (
      <LandingPage
        onAuthModeChange={(mode) => {
          setAuthMode(mode);
          setShowAuth(true);
        }}
        onStartQuiz={() => setShowQuiz(true)}
      />
    );
  }

  // Handle retaking quiz for logged-in users
  if (isRetakingQuiz) {
    return (
      <OnboardingQuiz
        onComplete={() => {
          setIsRetakingQuiz(false);
          setInitialTab('focus-profile');
        }}
        onLogoClick={() => {
          setIsRetakingQuiz(false);
          handleLogoClick();
        }}
      />
    );
  }

  if (profile?.is_admin) {
    // Check for slot-strategy route
    const path = window.location.pathname;
    const slotStrategyMatch = path.match(/^\/admin\/slot-strategy\/([^/]+)\/([^/]+)$/);
    if (slotStrategyMatch) {
      const channelId = slotStrategyMatch[1];
      const energyTier = slotStrategyMatch[2] as 'low' | 'medium' | 'high';
      return (
        <>
          <SlotStrategyEditor channelId={channelId} energyTier={energyTier} />
          <NowPlayingFooter onOpenSlideshow={() => setShowSlideshow(true)} />
          {showSlideshow && <SlideshowOverlay onClose={() => setShowSlideshow(false)} />}
          {showDiagnostics && <AudioEngineDiagnostics metrics={audioMetrics} onClose={() => { setShowDiagnostics(false); sessionStorage.setItem('showDiagnostics', 'false'); }} engineType={engineType} isStreamingEngine={isStreamingEngine} currentTrackInfo={{ trackName: currentTrack?.track_name, artistName: currentTrack?.artist_name }} prefetchTrackInfo={{ trackName: playlist[currentTrackIndex + 1]?.track_name, artistName: playlist[currentTrackIndex + 1]?.artist_name }} currentTrackFilePath={currentTrack?.file_path ?? null} prefetchTrackFilePath={playlist[currentTrackIndex + 1]?.file_path ?? null} />}
        </>
      );
    }

    if (viewMode === 'admin') {
      return (
        <>
          <AdminDashboard
            onSwitchToUser={() => setViewMode('user')}
            showAudioDiagnostics={showDiagnostics}
            onToggleAudioDiagnostics={() => {
              const newValue = !showDiagnostics;
              setShowDiagnostics(newValue);
              sessionStorage.setItem('showDiagnostics', String(newValue));
            }}
          />
          <NowPlayingFooter onOpenSlideshow={() => setShowSlideshow(true)} />
          {showSlideshow && <SlideshowOverlay onClose={() => setShowSlideshow(false)} />}
          {showDiagnostics && <AudioEngineDiagnostics metrics={audioMetrics} onClose={() => { setShowDiagnostics(false); sessionStorage.setItem('showDiagnostics', 'false'); }} engineType={engineType} isStreamingEngine={isStreamingEngine} currentTrackInfo={{ trackName: currentTrack?.track_name, artistName: currentTrack?.artist_name }} prefetchTrackInfo={{ trackName: playlist[currentTrackIndex + 1]?.track_name, artistName: playlist[currentTrackIndex + 1]?.artist_name }} currentTrackFilePath={currentTrack?.file_path ?? null} prefetchTrackFilePath={playlist[currentTrackIndex + 1]?.file_path ?? null} />}
        </>
      );
    }
    // Admin users bypass onboarding check - they can always access dashboard
    return (
      <>
        <UserDashboard
          initialTab={initialTab}
          onSwitchToAdmin={() => setViewMode('admin')}
          showAudioDiagnostics={showDiagnostics}
          onToggleAudioDiagnostics={() => {
            const newValue = !showDiagnostics;
            setShowDiagnostics(newValue);
            sessionStorage.setItem('showDiagnostics', String(newValue));
          }}
        />
        <NowPlayingFooter onOpenSlideshow={() => setShowSlideshow(true)} />
        {showSlideshow && <SlideshowOverlay onClose={() => setShowSlideshow(false)} />}
        {showDiagnostics && <AudioEngineDiagnostics metrics={audioMetrics} onClose={() => { setShowDiagnostics(false); sessionStorage.setItem('showDiagnostics', 'false'); }} engineType={engineType} isStreamingEngine={isStreamingEngine} currentTrackInfo={{ trackName: currentTrack?.track_name, artistName: currentTrack?.artist_name }} prefetchTrackInfo={{ trackName: playlist[currentTrackIndex + 1]?.track_name, artistName: playlist[currentTrackIndex + 1]?.artist_name }} currentTrackFilePath={currentTrack?.file_path ?? null} prefetchTrackFilePath={playlist[currentTrackIndex + 1]?.file_path ?? null} />}
      </>
    );
  }

  // Only show quiz if explicitly onboarding_completed is false (not null, not undefined)
  if (profile?.onboarding_completed === false) {
    return <OnboardingQuiz onComplete={() => setInitialTab('focus-profile')} onLogoClick={handleLogoClick} />;
  }

  return (
    <>
      <UserDashboard initialTab={initialTab} />
      <NowPlayingFooter onOpenSlideshow={() => setShowSlideshow(true)} />
      {showSlideshow && <SlideshowOverlay onClose={() => setShowSlideshow(false)} />}
      {showDiagnostics && <AudioEngineDiagnostics metrics={audioMetrics} onClose={() => { setShowDiagnostics(false); sessionStorage.setItem('showDiagnostics', 'false'); }} engineType={engineType} isStreamingEngine={isStreamingEngine} currentTrackInfo={{ trackName: currentTrack?.track_name, artistName: currentTrack?.artist_name }} prefetchTrackInfo={{ trackName: playlist[currentTrackIndex + 1]?.track_name, artistName: playlist[currentTrackIndex + 1]?.artist_name }} currentTrackFilePath={currentTrack?.file_path ?? null} prefetchTrackFilePath={playlist[currentTrackIndex + 1]?.file_path ?? null} />}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <MusicPlayerProvider>
        <ImageSetProvider>
          <AppContent />
        </ImageSetProvider>
      </MusicPlayerProvider>
    </AuthProvider>
  );
}

export default App;
