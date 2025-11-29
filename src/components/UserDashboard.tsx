import { useState, useEffect, useRef } from 'react';
import { LogOut, Shield, PowerOff, User, Download, Trash2, AlertTriangle, Upload, Camera, ZoomIn, ZoomOut, X, Check, Radio, Settings as SettingsIcon, ArrowUpDown, GripVertical, Presentation, Brain, TrendingUp, Lightbulb, Menu, ChevronDown, Sparkles, Activity, Star, AlignLeft, Grid3x3, List, Play, Pause, SkipForward, Timer, HelpCircle, SlidersHorizontal, FolderOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';
import { useImageSet } from '../contexts/ImageSetContext';
import { supabase } from '../lib/supabase';
import UserSlideshowTab from './UserSlideshowTab';
import { BUILD_VERSION } from '../buildVersion';
import { BrainTypeProfile } from './BrainTypeProfile';
import { BrainType } from '../lib/brainTypeCalculator';
import { FocusProfileTabs } from './FocusProfileTabs';
import { AboutChannelModal } from './AboutChannelModal';
import { UserBellSettings } from './UserBellSettings';
import { SettingsProfile } from './settings/SettingsProfile';
import { SettingsTimerSounds } from './settings/SettingsTimerSounds';
import { SettingsPrivacyData } from './settings/SettingsPrivacyData';

type UserDashboardProps = {
  onSwitchToAdmin?: () => void;
  initialTab?: 'channels' | 'focus-profile' | 'slideshow' | 'settings';
  showAudioDiagnostics?: boolean;
  onToggleAudioDiagnostics?: () => void;
};

type ActiveTab = 'channels' | 'focus-profile' | 'slideshow' | 'settings';

type SortMethod = 'recommended' | 'intensity' | 'user-order' | 'name' | 'collections';
type ViewMode = 'grid' | 'list';
type Collection = 'electronic' | 'acoustic' | 'rhythm' | 'textures';

type RecommendedChannel = {
  id: string;
  channel_id: string;
  channel_name: string;
  description: string;
  image_url: string | null;
  confidence_score: number;
  reasoning: string;
  recommended_energy_level?: string;
};

type UserChannelOrder = {
  channel_id: string;
  sort_order: number;
};

export function UserDashboard({ onSwitchToAdmin, initialTab = 'channels', showAudioDiagnostics = false, onToggleAudioDiagnostics }: UserDashboardProps = {}) {
  const { user, profile, signOut } = useAuth();
  const { channels, activeChannel, channelStates, toggleChannel, setChannelEnergy, loadChannels, isPlaying, currentTrack, audioEngine, skipTrack } = useMusicPlayer();
  const { channelImages } = useImageSet();
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [recommendedChannels, setRecommendedChannels] = useState<RecommendedChannel[]>([]);
  const [sortMethod, setSortMethod] = useState<SortMethod>('recommended');
  const [activeCollection, setActiveCollection] = useState<Collection>('electronic');
  const [userChannelOrder, setUserChannelOrder] = useState<UserChannelOrder[]>([]);
  const [savedEnergyLevels, setSavedEnergyLevels] = useState<Record<string, 'low' | 'medium' | 'high'>>({});
  const [isDraggingChannel, setIsDraggingChannel] = useState(false);
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [emailUpdateStatus, setEmailUpdateStatus] = useState('');
  const [passwordResetStatus, setPasswordResetStatus] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [nameUpdateStatus, setNameUpdateStatus] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadStatus, setAvatarUploadStatus] = useState('');
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [brainType, setBrainType] = useState<{ primary: BrainType; secondary?: BrainType; secondaryScore?: number } | null>(null);
  const [cognitiveProfile, setCognitiveProfile] = useState<{ adhdIndicator: number; asdScore: number; stimulantLevel: string } | null>(null);
  const [settingsSubTab, setSettingsSubTab] = useState<'profile' | 'preferences' | 'privacy-data'>('profile');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [focusProfileSubTab, setFocusProfileSubTab] = useState<'brain-type' | 'channels' | 'traits' | 'tips'>('brain-type');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
  const [sessionCount, setSessionCount] = useState<number>(0);
  const [showRecommendedHighlight, setShowRecommendedHighlight] = useState(false);
  const [recommendationVisibilitySessions, setRecommendationVisibilitySessions] = useState<number>(5);
  const [aboutModalChannel, setAboutModalChannel] = useState<any>(null);
  const [autoHideNavEnabled, setAutoHideNavEnabled] = useState(true);
  const [isNavVisible, setIsNavVisible] = useState(false);
  const hideTimeoutRef = useRef<number | null>(null);
  const hoverZoneRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);


  // Scroll to active channel card
  const scrollToActiveChannel = (channelId: string) => {
    const channelCard = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (channelCard) {
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight : 0;
      const gapSpacing = window.innerWidth >= 768 ? 20 : 16;
      const cardTop = channelCard.getBoundingClientRect().top + window.scrollY;
      const scrollToPosition = cardTop - headerHeight - gapSpacing;
      window.scrollTo({
        top: scrollToPosition,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
    if (profile?.avatar_url) {
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  // Update activeTab when initialTab prop changes (e.g., after signup)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    };

    if (showSortMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSortMenu]);

  useEffect(() => {
    if (user?.id) {
      // Load threshold first, then session count to ensure proper evaluation
      const loadData = async () => {
        await loadRecommendationVisibilityThreshold();
        await loadSessionCount();
      };

      loadData();
      loadRecommendedChannels();
      loadUserChannelOrder();
      loadSavedEnergyLevels();
      loadBrainType();
      loadViewMode();
      loadAutoHidePreference();

      // Subscribe to quiz_results changes to refresh brain type when quiz is retaken
      const quizResultsSubscription = supabase
        .channel('quiz_results_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'quiz_results',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            loadBrainType();
            loadRecommendedChannels();
          }
        )
        .subscribe();

      // Subscribe to channel_recommendations changes to update when quiz is retaken
      const recommendationsSubscription = supabase
        .channel('channel_recommendations_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'channel_recommendations',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            loadRecommendedChannels();
          }
        )
        .subscribe();

      // Subscribe to system_preferences changes to update recommendation threshold in real-time
      const systemPrefsSubscription = supabase
        .channel('system_preferences_changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'system_preferences',
            filter: 'id=eq.1',
          },
          (payload) => {
            loadRecommendationVisibilityThreshold();
          }
        )
        .subscribe();

      return () => {
        quizResultsSubscription.unsubscribe();
        recommendationsSubscription.unsubscribe();
        systemPrefsSubscription.unsubscribe();
      };
    }
  }, [user?.id]);

  useEffect(() => {
    const handleAutoHideChanged = (event: CustomEvent) => {
      setAutoHideNavEnabled(event.detail.enabled);
      if (!event.detail.enabled) {
        setIsNavVisible(true);
      }
    };

    window.addEventListener('autoHideNavChanged', handleAutoHideChanged as EventListener);

    return () => {
      window.removeEventListener('autoHideNavChanged', handleAutoHideChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!autoHideNavEnabled || activeTab !== 'channels' || sortMethod === 'collections') {
      setIsNavVisible(true);
      return;
    }

    setIsNavVisible(false);
  }, [autoHideNavEnabled, activeTab, sortMethod]);

  const loadAutoHidePreference = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('auto_hide_tab_navigation')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && !error.message.includes('No rows found')) {
        throw error;
      }

      if (data && data.auto_hide_tab_navigation !== null) {
        setAutoHideNavEnabled(data.auto_hide_tab_navigation);
      }
    } catch (err) {
      console.error('Failed to load auto-hide preference:', err);
    }
  };

  // Apple Dock behavior: Show immediately on hover zone enter
  const handleMouseEnterHoverZone = () => {
    if (!autoHideNavEnabled || activeTab !== 'channels' || sortMethod === 'collections') return;

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsNavVisible(true);
  };

  // Apple Dock behavior: Hide IMMEDIATELY when mouse leaves nav (no delay)
  const handleMouseLeaveNav = () => {
    if (!autoHideNavEnabled || activeTab !== 'channels' || sortMethod === 'collections') return;

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    // Immediate hide - no delay, just like Apple Dock
    setIsNavVisible(false);
  };

  // Keep nav visible while mouse is over it
  const handleMouseEnterNav = () => {
    if (!autoHideNavEnabled || activeTab !== 'channels' || sortMethod === 'collections') return;

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const loadSavedEnergyLevels = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('user_preferences')
      .select('channel_energy_levels')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data?.channel_energy_levels) {
      setSavedEnergyLevels(data.channel_energy_levels);
    }
  };

  const loadViewMode = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('user_preferences')
      .select('channel_view_mode')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data?.channel_view_mode) {
      setViewMode(data.channel_view_mode as ViewMode);
    }
  };

  const saveViewMode = async (mode: ViewMode) => {
    if (!user?.id) return;

    setViewMode(mode);

    // Upsert the preference
    const { error } = await supabase
      .from('user_preferences')
      .upsert(
        { user_id: user.id, channel_view_mode: mode },
        { onConflict: 'user_id' }
      );

    if (error) {
    }
  };

  const loadRecommendationVisibilityThreshold = async () => {
    const { data } = await supabase
      .from('system_preferences')
      .select('recommendation_visibility_sessions')
      .eq('id', 1)
      .maybeSingle();

    if (data?.recommendation_visibility_sessions !== undefined) {
      setRecommendationVisibilitySessions(data.recommendation_visibility_sessions);
    }
  };

  const loadSessionCount = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('user_preferences')
      .select('session_count')
      .eq('user_id', user.id)
      .maybeSingle();

    const count = data?.session_count || 0;
    setSessionCount(count);
    setShowRecommendedHighlight(count < recommendationVisibilitySessions);
  };

  // Reload energy levels when channel states change (after setChannelEnergy is called)
  useEffect(() => {
    if (user?.id) {
      loadSavedEnergyLevels();
    }
  }, [channelStates]);

  // Update highlight visibility when session count or threshold changes
  useEffect(() => {
    setShowRecommendedHighlight(sessionCount < recommendationVisibilitySessions);
  }, [sessionCount, recommendationVisibilitySessions]);

  const getChannelImage = (channelId: string, defaultImageUrl: string | null) => {
    return channelImages[channelId] || defaultImageUrl;
  };

  const loadRecommendedChannels = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('channel_recommendations')
      .select(`
        id,
        channel_id,
        confidence_score,
        reasoning,
        recommended_energy_level,
        audio_channels (
          channel_name,
          description,
          image_url
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false })
      .limit(3);

    if (error) {
      return;
    }


    if (data) {
      const formatted = data.map((rec: any) => ({
        id: rec.id,
        channel_id: rec.channel_id,
        channel_name: rec.audio_channels.channel_name,
        description: rec.audio_channels.description,
        image_url: rec.audio_channels.image_url,
        confidence_score: rec.confidence_score,
        reasoning: rec.reasoning,
        recommended_energy_level: rec.recommended_energy_level || 'medium',
      }));
      setRecommendedChannels(formatted);
    }
  };

  const loadBrainType = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('quiz_results')
      .select('brain_type_primary, brain_type_secondary, brain_type_scores, adhd_indicator, asd_score, preferred_stimulant_level')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return;
    }


    if (data && data.brain_type_primary) {
      const scores = data.brain_type_scores as Record<string, number> | null;
      const secondaryScore = data.brain_type_secondary && scores
        ? scores[data.brain_type_secondary]
        : undefined;

      const newBrainType = {
        primary: data.brain_type_primary as BrainType,
        secondary: data.brain_type_secondary as BrainType | undefined,
        secondaryScore,
      };
      setBrainType(newBrainType);

      // Load cognitive profile data if available
      if (data.adhd_indicator !== null && data.asd_score !== null && data.preferred_stimulant_level) {
        const newCognitiveProfile = {
          adhdIndicator: data.adhd_indicator as number,
          asdScore: data.asd_score as number,
          stimulantLevel: data.preferred_stimulant_level as string,
        };
        setCognitiveProfile(newCognitiveProfile);
      }
    }
  };

  const loadUserChannelOrder = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('user_channel_order')
      .select('channel_id, sort_order')
      .eq('user_id', user.id)
      .order('sort_order');

    if (data && !error) {
      setUserChannelOrder(data);
    }
  };

  const saveUserChannelOrder = async (orderedChannelIds: string[]) => {
    if (!user?.id) return;

    const orderData = orderedChannelIds.map((channelId, index) => ({
      user_id: user.id,
      channel_id: channelId,
      sort_order: index,
    }));

    const { error } = await supabase
      .from('user_channel_order')
      .upsert(orderData, { onConflict: 'user_id,channel_id' });

    if (!error) {
      await loadUserChannelOrder();
    }
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailUpdateStatus('Sending confirmation email...');

    const { error } = await supabase.auth.updateUser({ email: newEmail });

    if (error) {
      setEmailUpdateStatus('Error: ' + error.message);
    } else {
      setEmailUpdateStatus('Confirmation email sent! Check your new email address.');
      setNewEmail('');
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;

    setPasswordResetStatus('Sending reset email...');

    const { error } = await supabase.auth.resetPasswordForEmail(user.email);

    if (error) {
      setPasswordResetStatus('Error: ' + error.message);
    } else {
      setPasswordResetStatus('Password reset email sent! Check your inbox.');
    }
  };

  const handleNameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setNameUpdateStatus('Updating name...');

    const { error } = await supabase
      .from('user_profiles')
      .update({ display_name: displayName })
      .eq('id', user.id);

    if (error) {
      setNameUpdateStatus('Error: ' + error.message);
    } else {
      setNameUpdateStatus('Name updated successfully!');
    }
  };

  const handleDataExport = async () => {
    if (!user?.id) return;

    setIsExportingData(true);

    try {
      const profileData = await supabase
        .from('user_profiles')
        .select('display_name, brain_type, ocean_openness, ocean_conscientiousness, ocean_extraversion, ocean_agreeableness, ocean_neuroticism, adhd_indicator, asd_indicator, prefers_music, energy_preference, created_at')
        .eq('id', user.id)
        .maybeSingle();

      const exportData = {
        exported_at: new Date().toISOString(),
        personal_information: {
          email: user.email,
          display_name: profileData.data?.display_name || null,
          account_created: user.created_at,
        },
        personality_assessment: {
          brain_type: profileData.data?.brain_type || null,
          energy_preference: profileData.data?.energy_preference || null,
          ocean_traits: {
            openness: profileData.data?.ocean_openness || 50,
            conscientiousness: profileData.data?.ocean_conscientiousness || 50,
            extraversion: profileData.data?.ocean_extraversion || 50,
            agreeableness: profileData.data?.ocean_agreeableness || 50,
            neuroticism: profileData.data?.ocean_neuroticism || 50,
          },
          adhd_indicator: profileData.data?.adhd_indicator || 0,
          asd_indicator: profileData.data?.asd_indicator || 0,
          prefers_music: profileData.data?.prefers_music ?? true,
        },
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `focus-music-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export data. Please try again.');
    } finally {
      setIsExportingData(false);
    }
  };

  const handleAccountDeletion = async () => {
    if (!user?.id || deleteConfirmText !== 'DELETE') return;

    setIsDeletingAccount(true);

    try {
      await supabase
        .from('quiz_responses')
        .delete()
        .eq('user_id', user.id);

      await supabase
        .from('user_preferences')
        .delete()
        .eq('user_id', user.id);

      await supabase
        .from('user_profiles')
        .delete()
        .eq('id', user.id);

      const { error: deleteError } = await supabase.rpc('delete_user');

      if (deleteError) {
      }

      await signOut();
    } catch (error) {
      alert('Failed to delete account. Please contact support.');
      setIsDeletingAccount(false);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];

    if (!file.type.startsWith('image/')) {
      setAvatarUploadStatus('Error: Please select an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarUploadStatus('Error: File size must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedImage(event.target.result as string);
        setImageZoom(1);
        setImagePosition({ x: 0, y: 0 });
        setShowImageEditor(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const getCroppedImage = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      const image = imageRef.current;

      if (!canvas || !image) {
        reject(new Error('Canvas or image not ready'));
        return;
      }

      const size = 300;
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      const displayWidth = 320;
      const scale = (displayWidth / image.naturalWidth);
      const scaledWidth = image.naturalWidth * scale * imageZoom;
      const scaledHeight = image.naturalHeight * scale * imageZoom;

      const canvasScale = size / 320;
      const x = (size / 2) + (imagePosition.x * canvasScale);
      const y = (size / 2) + (imagePosition.y * canvasScale);

      ctx.save();
      ctx.translate(x, y);
      ctx.drawImage(
        image,
        -scaledWidth * canvasScale / 2,
        -scaledHeight * canvasScale / 2,
        scaledWidth * canvasScale,
        scaledHeight * canvasScale
      );
      ctx.restore();

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, 'image/jpeg', 0.95);
    });
  };

  const handleSaveCroppedImage = async () => {
    if (!user?.id) return;

    setIsUploadingAvatar(true);
    setAvatarUploadStatus('Uploading...');

    try {
      const blob = await getCroppedImage();
      const fileName = `${user.id}/avatar.jpg`;

      if (avatarUrl) {
        const oldPath = avatarUrl.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('user-photos').remove([`${user.id}/${oldPath}`]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(fileName, blob, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-photos')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl + '?t=' + Date.now();

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setAvatarUploadStatus('Avatar updated successfully!');
      setShowImageEditor(false);
      setSelectedImage(null);
      setTimeout(() => setAvatarUploadStatus(''), 3000);
    } catch (error) {
      setAvatarUploadStatus('Error: Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCancelEditor = () => {
    setShowImageEditor(false);
    setSelectedImage(null);
    setImageZoom(1);
    setImagePosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - imagePosition.x,
      y: e.clientY - imagePosition.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setImagePosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleRemoveAvatar = async () => {
    if (!user?.id || !avatarUrl) return;

    setIsUploadingAvatar(true);

    try {
      const fileName = avatarUrl.split('/').slice(-2).join('/');

      await supabase.storage.from('user-photos').remove([fileName]);

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: null })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(null);
      setAvatarUploadStatus('Avatar removed successfully!');
      setTimeout(() => setAvatarUploadStatus(''), 3000);
    } catch (error) {
      setAvatarUploadStatus('Error: Failed to remove avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-24">
      {/* Trigger zone: Left side only (doesn't cover buttons) - desktop only */}
      <div
        ref={hoverZoneRef}
        onMouseEnter={handleMouseEnterHoverZone}
        className="hidden md:block fixed top-0 left-0 z-[100]"
        style={{
          height: '48px',
          width: 'calc(100% - 400px)', // Leave right 400px for buttons
          pointerEvents: autoHideNavEnabled && activeTab === 'channels' && sortMethod !== 'collections' ? 'auto' : 'none',
        }}
      />
      {/* Main header - always visible */}
      <header className="bg-white shadow-sm sticky top-0 z-50 md:overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200">
            <h1 className="text-xl text-slate-900">
              <span className="font-bold">focus</span>.music
            </h1>
            <div className="flex items-center gap-2">
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                />
              )}
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Menu size={20} />
              </button>
            </div>
          </div>


          {/* Mobile Menu Dropdown */}
          {showMobileMenu && (
            <div className="absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-lg z-50">
              <div className="px-4 py-3 space-y-3">
                <button
                  onClick={() => { setActiveTab('channels'); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <Radio size={18} />
                  <span className="font-medium">Channels</span>
                </button>
                <button
                  onClick={() => { setActiveTab('focus-profile'); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <User size={18} />
                  <span className="font-medium">Profile</span>
                </button>
                <button
                  onClick={() => { setActiveTab('slideshow'); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <Presentation size={18} />
                  <span className="font-medium">Slideshow</span>
                </button>
                <button
                  onClick={() => { setActiveTab('settings'); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <SettingsIcon size={18} />
                  <span className="font-medium">Settings</span>
                </button>
                {onSwitchToAdmin && (
                  <button
                    onClick={() => { onSwitchToAdmin(); setShowMobileMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-blue-700 hover:bg-blue-50 rounded-lg transition-colors text-left"
                  >
                    <Shield size={18} />
                    <span className="font-medium">Admin Dashboard</span>
                  </button>
                )}
                <button
                  onClick={() => { signOut(); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <LogOut size={18} />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Header */}
        <div
          className="hidden md:block relative z-[60]"
          onMouseEnter={handleMouseEnterHoverZone}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl text-slate-900"><span className="font-bold">focus</span>.music</h1>
              </div>
              <div className="h-6 w-px bg-slate-300"></div>
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="w-10 h-10 rounded-full object-cover border-2 border-slate-200"
                />
              )}
              {profile?.display_name && (
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {profile.display_name}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {profile?.is_admin && onToggleAudioDiagnostics && (
                <button
                  onClick={onToggleAudioDiagnostics}
                  className={`flex items-center justify-center w-10 h-10 rounded-lg font-bold transition-all relative z-[70] ${
                    showAudioDiagnostics
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  title="Audio Engine Diagnostics"
                >
                  <Activity className="w-5 h-5" />
                </button>
              )}
              {onSwitchToAdmin && (
                <button
                  onClick={onSwitchToAdmin}
                  className="flex items-center gap-2 px-4 py-2 text-blue-700 hover:text-blue-900 transition-colors relative z-[70]"
                >
                  <Shield size={20} />
                  Admin
                </button>
              )}
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 transition-colors relative z-[70]"
              >
                <LogOut size={20} />
                Sign Out
              </button>
            </div>
          </div>

          {/* Tab Navigation - conditional rendering based on auto-hide */}
          {!(autoHideNavEnabled && activeTab === 'channels' && sortMethod !== 'collections') && (
          <div className="border-t border-slate-200 relative z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <nav className="flex gap-8">
                <button
                  onClick={() => setActiveTab('channels')}
                  className={`py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
                    activeTab === 'channels'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Radio size={18} />
                  Channels
                </button>
                <button
                  onClick={() => setActiveTab('focus-profile')}
                  className={`py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
                    activeTab === 'focus-profile'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User size={18} />
                  Profile
                </button>
                <button
                  onClick={() => setActiveTab('slideshow')}
                  className={`py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
                    activeTab === 'slideshow'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Presentation size={18} />
                  Slideshow
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
                    activeTab === 'settings'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <SettingsIcon size={18} />
                  Settings
                </button>
              </nav>
            </div>
          </div>
          )}
        </div>
      </header>

      {/* Floating Tab Navigation - only when auto-hide is enabled on Channels tab (desktop only) */}
      {autoHideNavEnabled && activeTab === 'channels' && sortMethod !== 'collections' && (
        <div className="hidden md:block pointer-events-none md:pointer-events-auto">
          <div
            ref={navRef}
            onMouseEnter={handleMouseEnterNav}
            onMouseLeave={handleMouseLeaveNav}
            className="fixed left-0 right-0 bg-white border-b border-slate-200 shadow-lg z-30"
            style={{
              top: '73px',
              transform: isNavVisible ? 'translateY(0)' : 'translateY(-100%)',
              pointerEvents: isNavVisible ? 'auto' : 'none',
              // Apple Dock timing: 0.4s with ease-out curve
              transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
            }}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <nav className="flex items-center justify-between">
                {/* Left side: Tab buttons */}
                <div className="flex gap-8">
                  <button
                    onClick={() => setActiveTab('channels')}
                    className="py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 border-blue-600 text-blue-600"
                  >
                  <Radio size={18} />
                  Channels
                </button>
                <button
                  onClick={() => setActiveTab('focus-profile')}
                  className="py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                >
                  <User size={18} />
                  Profile
                </button>
                <button
                  onClick={() => setActiveTab('slideshow')}
                  className="py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                >
                  <Presentation size={18} />
                  Slideshow
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className="py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                >
                  <SettingsIcon size={18} />
                  Settings
                </button>
              </div>

              {/* Right side: View and Sort controls */}
              <div className="flex items-center gap-2">
                {/* View Toggle */}
                <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden">
                  <button
                    onClick={() => saveViewMode('grid')}
                    className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Grid view"
                  >
                    <Grid3x3 size={16} />
                    <span className="text-sm font-medium hidden sm:inline">Grid</span>
                  </button>
                  <button
                    onClick={() => saveViewMode('list')}
                    className={`px-3 py-2 flex items-center gap-2 transition-colors border-l border-slate-300 ${
                      viewMode === 'list'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    title="List view"
                  >
                    <List size={16} />
                    <span className="text-sm font-medium hidden sm:inline">List</span>
                  </button>
                </div>

                {/* Sort Button with Dropdown */}
                <div className="relative" ref={sortMenuRef}>
                  <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
                  >
                    <ArrowUpDown size={16} />
                    <span className="text-sm font-medium">Sort</span>
                    <ChevronDown size={14} className={`transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showSortMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
                      <button
                        onClick={() => {
                          setSortMethod('recommended');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'recommended' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <Sparkles size={18} className={sortMethod === 'recommended' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'recommended' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Recommended
                          </div>
                          <div className="text-xs text-slate-500">Based on your profile</div>
                        </div>
                        {sortMethod === 'recommended' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSortMethod('intensity');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'intensity' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <Activity size={18} className={sortMethod === 'intensity' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'intensity' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Channel Intensity
                          </div>
                          <div className="text-xs text-slate-500">Low to high energy</div>
                        </div>
                        {sortMethod === 'intensity' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSortMethod('user-order');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'user-order' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <Star size={18} className={sortMethod === 'user-order' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'user-order' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Custom Order
                          </div>
                          <div className="text-xs text-slate-500">Drag to rearrange</div>
                        </div>
                        {sortMethod === 'user-order' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSortMethod('name');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'name' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <AlignLeft size={18} className={sortMethod === 'name' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'name' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Name (A-Z)
                          </div>
                          <div className="text-xs text-slate-500">Alphabetical order</div>
                        </div>
                        {sortMethod === 'name' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSortMethod('collections');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'collections' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <FolderOpen size={18} className={sortMethod === 'collections' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'collections' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Collections
                          </div>
                          <div className="text-xs text-slate-500">Browse by category</div>
                        </div>
                        {sortMethod === 'collections' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </nav>
          </div>
          </div>
        </div>
      )}

      {/* Collection Tabs - only when Collections sort is active on Channels tab */}
      {activeTab === 'channels' && sortMethod === 'collections' && (
        <div className="bg-white border-b border-slate-200 sticky top-[73px] z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center justify-between py-3">
              {/* Left side: Collection filter buttons */}
              <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setActiveCollection('electronic')}
                  className={`px-4 py-2 rounded-full whitespace-nowrap font-medium text-sm transition-all ${
                    activeCollection === 'electronic'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Electronic
                </button>
                <button
                  onClick={() => setActiveCollection('acoustic')}
                  className={`px-4 py-2 rounded-full whitespace-nowrap font-medium text-sm transition-all ${
                    activeCollection === 'acoustic'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Acoustic
                </button>
                <button
                  onClick={() => setActiveCollection('rhythm')}
                  className={`px-4 py-2 rounded-full whitespace-nowrap font-medium text-sm transition-all ${
                    activeCollection === 'rhythm'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Rhythm
                </button>
                <button
                  onClick={() => setActiveCollection('textures')}
                  className={`px-4 py-2 rounded-full whitespace-nowrap font-medium text-sm transition-all ${
                    activeCollection === 'textures'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Textures
                </button>
              </div>

              {/* Right side: View Toggle and Sort dropdown */}
              <div className="flex items-center gap-2 ml-4">
                {/* Grid/List View Toggle */}
                <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden">
                  <button
                    onClick={() => saveViewMode('grid')}
                    className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Grid view"
                  >
                    <Grid3x3 size={16} />
                    <span className="text-sm font-medium hidden sm:inline">Grid</span>
                  </button>
                  <button
                    onClick={() => saveViewMode('list')}
                    className={`px-3 py-2 flex items-center gap-2 transition-colors border-l border-slate-300 ${
                      viewMode === 'list'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    title="List view"
                  >
                    <List size={16} />
                    <span className="text-sm font-medium hidden sm:inline">List</span>
                  </button>
                </div>

                {/* Sort Button with Dropdown */}
                <div className="relative" ref={sortMenuRef}>
                  <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
                  >
                    <ArrowUpDown size={16} />
                    <span className="text-sm font-medium">Sort</span>
                    <ChevronDown size={14} className={`transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showSortMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
                      <button
                        onClick={() => {
                          setSortMethod('recommended');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'recommended' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <Sparkles size={18} className={sortMethod === 'recommended' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'recommended' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Recommended
                          </div>
                          <div className="text-xs text-slate-500">Based on your profile</div>
                        </div>
                        {sortMethod === 'recommended' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSortMethod('intensity');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'intensity' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <Activity size={18} className={sortMethod === 'intensity' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'intensity' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Channel Intensity
                          </div>
                          <div className="text-xs text-slate-500">Low to high energy</div>
                        </div>
                        {sortMethod === 'intensity' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSortMethod('user-order');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'user-order' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <Star size={18} className={sortMethod === 'user-order' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'user-order' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Custom Order
                          </div>
                          <div className="text-xs text-slate-500">Drag to rearrange</div>
                        </div>
                        {sortMethod === 'user-order' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSortMethod('name');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'name' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <AlignLeft size={18} className={sortMethod === 'name' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'name' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Name (A-Z)
                          </div>
                          <div className="text-xs text-slate-500">Alphabetical order</div>
                        </div>
                        {sortMethod === 'name' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSortMethod('collections');
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                          sortMethod === 'collections' ? 'bg-blue-50' : ''
                        }`}
                      >
                        <FolderOpen size={18} className={sortMethod === 'collections' ? 'text-blue-600' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${sortMethod === 'collections' ? 'text-blue-600' : 'text-slate-900'}`}>
                            Collections
                          </div>
                          <div className="text-xs text-slate-500">Browse by category</div>
                        </div>
                        {sortMethod === 'collections' && (
                          <Check size={18} className="text-blue-600" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Settings Sub-Navigation Bar (desktop only) */}
      {activeTab === 'settings' && (
        <div className="hidden md:block bg-white border-b border-slate-200 sticky top-[73px] z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex gap-8">
              <button
                onClick={() => setSettingsSubTab('profile')}
                className={`py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
                  settingsSubTab === 'profile'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <User size={18} />
                Profile
              </button>
              <button
                onClick={() => setSettingsSubTab('preferences')}
                className={`py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
                  settingsSubTab === 'preferences'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <SlidersHorizontal size={18} />
                Preferences
              </button>
              <button
                onClick={() => setSettingsSubTab('privacy-data')}
                className={`py-4 px-1 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
                  settingsSubTab === 'privacy-data'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield size={18} />
                Privacy & Data
              </button>
            </nav>
          </div>
        </div>
      )}

      {activeTab === 'channels' && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-5 pb-28">
          {(() => {
            let sortedChannels = [...channels];

            switch (sortMethod) {
              case 'recommended':
                // Create a map of recommended channels with their order
                const recommendedMap = new Map(
                  recommendedChannels.map((rc, index) => [rc.channel_id, index])
                );

                sortedChannels.sort((a, b) => {
                  const aRecIndex = recommendedMap.get(a.id);
                  const bRecIndex = recommendedMap.get(b.id);

                  // Both are recommended: sort by recommendation order
                  if (aRecIndex !== undefined && bRecIndex !== undefined) {
                    return aRecIndex - bRecIndex;
                  }

                  // Only a is recommended: a comes first
                  if (aRecIndex !== undefined) return -1;

                  // Only b is recommended: b comes first
                  if (bRecIndex !== undefined) return 1;

                  // Neither recommended: use admin's display order
                  return (a.display_order || 0) - (b.display_order || 0);
                });
                break;

              case 'intensity':
                const intensityOrder = { low: 0, medium: 1, high: 2 };
                sortedChannels.sort((a, b) => {
                  const aIntensity = intensityOrder[(a as any).intensity || 'medium'];
                  const bIntensity = intensityOrder[(b as any).intensity || 'medium'];
                  return aIntensity - bIntensity;
                });
                break;

              case 'user-order':
                const orderMap = new Map(userChannelOrder.map(o => [o.channel_id, o.sort_order]));
                sortedChannels.sort((a, b) => {
                  const aOrder = orderMap.get(a.id) ?? 9999;
                  const bOrder = orderMap.get(b.id) ?? 9999;
                  return aOrder - bOrder;
                });
                break;

              case 'name':
                sortedChannels.sort((a, b) => a.channel_name.localeCompare(b.channel_name));
                break;

              case 'collections':
                // Filter by active collection
                sortedChannels = sortedChannels.filter(channel => (channel as any).collection === activeCollection);
                // Then sort by display order within collection
                sortedChannels.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
                break;
            }

            // Separate top 3 recommended from others if showing highlight
            const shouldShowFramedRecommendations = showRecommendedHighlight && viewMode === 'grid' && sortMethod === 'recommended' && recommendedChannels.length > 0;
            const top3Channels = shouldShowFramedRecommendations ? sortedChannels.slice(0, 3) : [];
            const remainingChannels = shouldShowFramedRecommendations ? sortedChannels.slice(3) : sortedChannels;

            const renderChannel = (channel: any, index: number, isInRecommendedFrame: boolean) => {
            const state = channelStates[channel.id] || { isOn: false, energyLevel: 'medium' };
            const isActive = activeChannel?.id === channel.id;
            // Check actual playback state for this channel
            const isActuallyPlaying = isActive && isPlaying;
            const isUserOrderMode = sortMethod === 'user-order';

            // Check if this is a top 3 recommended channel
            const recommendedIndex = recommendedChannels.findIndex(rc => rc.channel_id === channel.id);
            const isTopRecommended = isInRecommendedFrame || (showRecommendedHighlight && viewMode === 'grid' && sortMethod === 'recommended' && recommendedIndex >= 0 && recommendedIndex < 3);
            const recommendedEnergyLevel = isTopRecommended ? recommendedChannels[recommendedIndex]?.recommended_energy_level : null;

            return (
              <div
                key={channel.id}
                data-channel-id={channel.id}
                draggable={isUserOrderMode}
                onDragStart={(e) => {
                  if (isUserOrderMode) {
                    setIsDraggingChannel(true);
                    setDraggedChannelId(channel.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }
                }}
                onDragEnd={() => {
                  setIsDraggingChannel(false);
                  setDraggedChannelId(null);
                }}
                onDragOver={(e) => {
                  if (isUserOrderMode && draggedChannelId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  if (isUserOrderMode && draggedChannelId && draggedChannelId !== channel.id) {
                    e.preventDefault();
                    const allChannels = [...channels];
                    let sortedIds: string[];

                    switch (sortMethod) {
                      case 'user-order':
                        const orderMap = new Map(userChannelOrder.map(o => [o.channel_id, o.sort_order]));
                        allChannels.sort((a, b) => {
                          const aOrder = orderMap.get(a.id) ?? 9999;
                          const bOrder = orderMap.get(b.id) ?? 9999;
                          return aOrder - bOrder;
                        });
                        sortedIds = allChannels.map(c => c.id);
                        break;
                      default:
                        sortedIds = allChannels.map(c => c.id);
                    }

                    const draggedIndex = sortedIds.indexOf(draggedChannelId);
                    const targetIndex = sortedIds.indexOf(channel.id);

                    sortedIds.splice(draggedIndex, 1);
                    sortedIds.splice(targetIndex, 0, draggedChannelId);

                    saveUserChannelOrder(sortedIds);
                  }
                }}
                className={`${isDraggingChannel && draggedChannelId === channel.id ? 'opacity-50' : ''}`}
              >
                <div
                  onClick={() => {
                    if (!isActive) {
                      const savedLevel = savedEnergyLevels[channel.id] || 'medium';
                      setChannelEnergy(channel.id, savedLevel);
                      toggleChannel(channel, true);
                    }
                  }}
                  className={viewMode === 'grid'
                    ? `w-full group text-left rounded-2xl overflow-hidden bg-white transition-all hover:shadow-lg p-0 flex flex-col cursor-pointer ${
                      isActive
                        ? 'border-[3px] border-slate-900 shadow-2xl min-h-[305px] md:min-h-[305px]'
                        : 'border-2 border-slate-900 md:border md:border-slate-200 md:hover:border-slate-300 min-h-[290px] md:min-h-[290px] min-h-[261px]'
                    }`
                    : `w-full group text-left rounded-lg overflow-hidden bg-white transition-all hover:shadow-md p-0 flex flex-row items-center cursor-pointer ${
                      isActive
                        ? 'border-2 border-slate-900 shadow-lg'
                        : 'border border-slate-200 hover:border-slate-300'
                    }`
                  }
                >
                  {/* Image Section */}
                  <div className={viewMode === 'grid'
                    ? "relative overflow-hidden block bg-slate-100 flex-shrink-0 h-[110px] md:h-[110px] h-[99px]"
                    : "relative overflow-hidden block bg-slate-100 flex-shrink-0 w-16 md:w-24 h-16 md:h-16"
                  }>
                    {isUserOrderMode && (
                      <div className="absolute top-3 left-3 z-10 bg-slate-900 bg-opacity-70 rounded-lg p-2 cursor-grab active:cursor-grabbing">
                        <GripVertical size={20} className="text-white" />
                      </div>
                    )}
                  {getChannelImage(channel.id, channel.image_url) ? (
                    <img
                      src={getChannelImage(channel.id, channel.image_url)!}
                      alt={channel.channel_name}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105 block"
                      style={{ objectPosition: 'center' }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                      <Radio size={viewMode === 'grid' ? 40 : 20} className="text-slate-400" />
                    </div>
                  )}

                  {/* Number badge for top 3 recommended channels */}
                  {isTopRecommended && viewMode === 'grid' && (
                    <div className="absolute top-3 left-3 w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg font-bold shadow-lg z-10">
                      {recommendedIndex + 1}
                    </div>
                  )}

                  {/* Checkmark for active channel */}
                  {isActive && (
                    <div className={viewMode === 'grid'
                      ? "absolute top-3 right-3 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-lg"
                      : "absolute top-1 right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg"
                    }>
                      <Check size={viewMode === 'grid' ? 20 : 14} className="text-slate-900" strokeWidth={3} />
                    </div>
                  )}
                </div>

                {/* Content Section */}
                <div className={viewMode === 'grid'
                  ? "flex-grow flex flex-col px-5 md:px-5 px-[18px] pt-5 md:pt-5 pt-[18px] pb-6 md:pb-6 pb-[22px] w-full min-w-0"
                  : "flex-grow flex flex-col justify-center px-3 py-1 md:py-2 md:px-3 min-w-0"
                }>
                  {viewMode === 'list' ? (
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 leading-tight text-base md:text-base">
                          {channel.channel_name}
                        </h3>
                        {channel.description && !expandedChannels.has(channel.id) && (
                          <span className="text-slate-600 leading-tight text-xs md:text-xs">
                            {(() => {
                              const words = channel.description.split(' ');
                              const preview = words.slice(0, 2).join(' ');
                              return words.length > 2 ? preview + '...' : preview;
                            })()}
                          </span>
                        )}
                      </div>
                      {channel.description && expandedChannels.has(channel.id) && (
                        <p className="text-slate-600 leading-tight text-xs mt-0.5 md:mt-1">
                          {channel.description}
                        </p>
                      )}
                      {channel.description && !expandedChannels.has(channel.id) && channel.description.split(' ').length > 2 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            // Activate the channel if not already active
                            if (!isActive) {
                              const savedLevel = savedEnergyLevels[channel.id] || 'medium';
                              setChannelEnergy(channel.id, savedLevel);
                              toggleChannel(channel, true);
                            }
                            // Switch to grid view
                            saveViewMode('grid');
                            // Wait for view mode change, then scroll to the channel card
                            setTimeout(() => {
                              scrollToActiveChannel(channel.id);
                            }, 200);
                          }}
                          className="text-xs text-blue-600 mt-0.5 md:mt-0 md:inline md:ml-2 hover:text-blue-700 hover:underline cursor-pointer"
                        >
                          Show more
                        </span>
                      )}
                      {channel.description && expandedChannels.has(channel.id) && channel.description.split(' ').length > 2 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            const newExpanded = new Set(expandedChannels);
                            newExpanded.delete(channel.id);
                            setExpandedChannels(newExpanded);
                          }}
                          className="text-xs text-blue-600 mt-0.5 hover:text-blue-700 hover:underline cursor-pointer"
                        >
                          Show less
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <h3 className={`font-bold text-slate-900 leading-tight text-xl md:text-xl text-lg ${
                        isActive ? 'mb-4' : 'mb-2'
                      }`}>
                        {channel.channel_name}
                      </h3>
                      {/* Show controls when active */}
                      {isActive && viewMode === 'grid' ? (
                        <div className="space-y-2 w-full">
                          {/* Energy Level Selector */}
                          <div className="flex gap-1.5 w-full">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setChannelEnergy(channel.id, 'low');
                              }}
                              className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap ${
                                state?.energyLevel === 'low'
                                  ? 'bg-blue-600 text-white shadow'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              Low
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setChannelEnergy(channel.id, 'medium');
                              }}
                              className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap ${
                                state?.energyLevel === 'medium'
                                  ? 'bg-orange-600 text-white shadow'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              Medium
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setChannelEnergy(channel.id, 'high');
                              }}
                              className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap ${
                                state?.energyLevel === 'high'
                                  ? 'bg-red-600 text-white shadow'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              High
                            </button>
                          </div>

                          {/* Track Info */}
                          <div className="text-center space-y-0.5 w-full min-w-0">
                            <div className="text-xs text-slate-600 truncate px-2">
                              {currentTrack?.artist_name || 'Unknown Artist'}
                            </div>
                            <div className="text-sm font-semibold text-slate-900 truncate px-2">
                              {currentTrack?.track_name || 'No Track Playing'}
                            </div>
                          </div>

                          {/* Control Buttons */}
                          <div className="flex items-center justify-center gap-4 mx-auto w-full">
                            {/* About Channel Button - Only show if channel has about content */}
                            {channel.about_channel && channel.about_channel.trim() !== '' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAboutModalChannel(channel);
                                }}
                                className="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 transition-all border-2 border-slate-300 hover:border-slate-400"
                                title="About this channel"
                                aria-label="About this channel"
                              >
                                <svg
                                  className="w-5 h-5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                  <circle cx="12" cy="17" r="0.5" fill="currentColor" />
                                </svg>
                              </button>
                            )}

                            {/* Play/Pause Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleChannel(channel, !isActuallyPlaying, true);
                              }}
                              className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center transition-all shadow-md ${
                                isActuallyPlaying
                                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                                  : 'bg-white text-slate-700 hover:bg-slate-50 border-2 border-slate-300'
                              }`}
                            >
                              {isActuallyPlaying ? (
                                <Pause className="w-5 h-5" fill="currentColor" />
                              ) : (
                                <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                              )}
                            </button>

                            {/* Skip Button - Conditionally render based on channel setting */}
                            {!channel.hide_skip_button && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  skipTrack();
                                }}
                                className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
                              >
                                <SkipForward className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {channel.description && (
                            <p className="text-slate-600 leading-relaxed line-clamp-4 text-[15px] md:text-[15px] text-[13.5px]">
                              {channel.description}
                            </p>
                          )}
                          {isTopRecommended && recommendedEnergyLevel && (
                            <div className="mt-3">
                              <span className="inline-block px-3 py-1.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                                Best: {recommendedEnergyLevel} energy
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
              </div>
            );
            };

            // Return the JSX with framed recommendations section (if applicable) and remaining channels
            return (
              <>
                {shouldShowFramedRecommendations && (
                  <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 shadow-lg">
                    <div className="mb-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-2">
                        Your Personalized Recommendations
                      </h3>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        <strong className="text-blue-700">Personalized for you:</strong> These channels are scientifically matched to your cognitive profile to enhance focus and productivity. Our recommendation algorithm is the result of 15 years of in-house research and insights from over 640,000 subscribers.{' '}
                        <button
                          onClick={() => setActiveTab('focus-profile')}
                          className="text-blue-600 hover:text-blue-700 underline font-medium"
                        >
                          View my Profile
                        </button>
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 md:gap-5">
                      {top3Channels.map((channel, idx) => renderChannel(channel, idx, true))}
                    </div>
                  </div>
                )}

                <div className={viewMode === 'grid'
                  ? "grid grid-cols-1 gap-4 px-6 md:px-0 md:grid-cols-2 lg:grid-cols-3 md:gap-5 max-w-[420px] mx-auto md:max-w-none"
                  : "flex flex-col gap-3 px-6 md:px-0 max-w-2xl mx-auto"
                }>
                  {remainingChannels.map((channel, idx) => renderChannel(channel, idx, false))}
                </div>
              </>
            );
          })()}
      </main>
      )}

      {activeTab === 'focus-profile' && profile?.onboarding_completed && (
        <>
          {/* Mobile Back Link and Dropdown */}
          <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-4 pb-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('channels')}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm whitespace-nowrap"
              >
                Back
              </button>
              <select
                value={focusProfileSubTab}
                onChange={(e) => {
                  const newTab = e.target.value as 'brain-type' | 'channels' | 'traits' | 'tips';
                  setFocusProfileSubTab(newTab);
                  const focusProfileTabs = document.querySelector('[data-focus-profile-tabs]') as any;
                  if (focusProfileTabs?.setActiveSubTab) {
                    focusProfileTabs.setActiveSubTab(newTab);
                  }
                }}
                className="flex-1 px-3 py-3 text-sm font-medium bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23475569' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: '36px'
                }}
              >
                <option value="brain-type">My Brain Type</option>
                <option value="channels">Recommended Channels</option>
                <option value="traits">Personality Traits</option>
                <option value="tips">Focus Tips</option>
              </select>
            </div>
          </div>

          {/* Desktop Tabs */}
          <div className="hidden md:block border-t border-slate-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <nav className="flex gap-8">
                <button
                  onClick={() => {
                    setFocusProfileSubTab('brain-type');
                    const focusProfileTabs = document.querySelector('[data-focus-profile-tabs]') as any;
                    if (focusProfileTabs?.setActiveSubTab) {
                      focusProfileTabs.setActiveSubTab('brain-type');
                    }
                  }}
                  className="py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                  data-sub-tab="brain-type"
                >
                  <Brain size={18} />
                  My Brain Type
                </button>
                <button
                  onClick={() => {
                    setFocusProfileSubTab('channels');
                    const focusProfileTabs = document.querySelector('[data-focus-profile-tabs]') as any;
                    if (focusProfileTabs?.setActiveSubTab) {
                      focusProfileTabs.setActiveSubTab('channels');
                    }
                  }}
                  className="py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                  data-sub-tab="channels"
                >
                  <Radio size={18} />
                  Recommended Channels
                </button>
                <button
                  onClick={() => {
                    setFocusProfileSubTab('traits');
                    const focusProfileTabs = document.querySelector('[data-focus-profile-tabs]') as any;
                    if (focusProfileTabs?.setActiveSubTab) {
                      focusProfileTabs.setActiveSubTab('traits');
                    }
                  }}
                  className="py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                  data-sub-tab="traits"
                >
                  <TrendingUp size={18} />
                  Personality Traits
                </button>
                <button
                  onClick={() => {
                    setFocusProfileSubTab('tips');
                    const focusProfileTabs = document.querySelector('[data-focus-profile-tabs]') as any;
                    if (focusProfileTabs?.setActiveSubTab) {
                      focusProfileTabs.setActiveSubTab('tips');
                    }
                  }}
                  className="py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 border-transparent text-slate-600 hover:text-slate-900"
                  data-sub-tab="tips"
                >
                  <Lightbulb size={18} />
                  Focus Tips
                </button>
              </nav>
            </div>
          </div>
        </>
      )}

      {activeTab === 'focus-profile' && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2">
          {!profile?.onboarding_completed ? (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-12 border border-blue-200 text-center">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-6xl mb-4">🧠</div>
                <h2 className="text-3xl font-bold text-slate-900 mb-4">
                  Discover Your Focus Profile
                </h2>
                <p className="text-lg text-slate-700 mb-6">
                  Take our scientifically-designed quiz to unlock personalized music recommendations tailored to your unique cognitive profile. Learn how your brain works best and get channels matched specifically for you.
                </p>
                <div className="bg-white/50 rounded-lg p-6 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-3xl mb-2">⚡</div>
                      <div className="font-semibold text-slate-900">5 Minutes</div>
                      <div className="text-slate-600">Quick and easy</div>
                    </div>
                    <div>
                      <div className="text-3xl mb-2">🎯</div>
                      <div className="font-semibold text-slate-900">Personalized</div>
                      <div className="text-slate-600">Just for you</div>
                    </div>
                    <div>
                      <div className="text-3xl mb-2">🔬</div>
                      <div className="font-semibold text-slate-900">Science-Based</div>
                      <div className="text-slate-600">Backed by research</div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => window.location.href = '?retake-quiz=true'}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg rounded-lg font-semibold transition-colors shadow-lg hover:shadow-xl flex items-center gap-3 mx-auto"
                >
                  <Brain size={24} />
                  Take Focus Quiz
                </button>
              </div>
            </div>
          ) : (
            <FocusProfileTabs
              key={`${brainType?.primary}-${cognitiveProfile?.adhdIndicator}-${recommendedChannels.length}`}
              brainType={brainType}
              profile={profile}
              cognitiveProfile={cognitiveProfile}
              recommendedChannels={recommendedChannels}
              channels={channels}
              getChannelImage={getChannelImage}
            />
          )}
        </main>
      )}

      {activeTab === 'slideshow' && (
        <>
          {/* Mobile Back Link */}
          <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-4 pb-0">
            <button
              onClick={() => setActiveTab('channels')}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              Back
            </button>
          </div>
          <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <UserSlideshowTab />
          </main>
        </>
      )}

      {activeTab === 'settings' && (
        <>
          {/* Mobile Settings Sub-Navigation - single row with Back link */}
          <div className="md:hidden border-t border-slate-200 bg-white">
            <nav className="flex items-center">
              <button
                onClick={() => setActiveTab('channels')}
                className="py-3 px-3 border-b-2 border-transparent text-blue-600 hover:text-blue-700 font-semibold text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setSettingsSubTab('profile')}
                className={`flex-1 py-3 px-2 border-b-2 font-semibold text-sm transition-colors text-center ${
                  settingsSubTab === 'profile'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600'
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setSettingsSubTab('preferences')}
                className={`flex-1 py-3 px-2 border-b-2 font-semibold text-sm transition-colors text-center ${
                  settingsSubTab === 'preferences'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600'
                }`}
              >
                Prefs
              </button>
              <button
                onClick={() => setSettingsSubTab('privacy-data')}
                className={`flex-1 py-3 px-2 border-b-2 font-semibold text-sm transition-colors text-center ${
                  settingsSubTab === 'privacy-data'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600'
                }`}
              >
                Privacy
              </button>
            </nav>
          </div>
          <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <div className="mt-6 space-y-6">
              {/* Mobile User Info Section */}
              <div className="md:hidden bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <div className="space-y-2">
                  {profile?.display_name && (
                    <div className="text-lg font-semibold text-slate-900">{profile.display_name}</div>
                  )}
                  {user?.email && (
                    <div className="text-sm text-slate-600">{user.email}</div>
                  )}
                </div>
              </div>

              {/* Settings Sub-Tab Content */}
              {settingsSubTab === 'profile' && <SettingsProfile />}
              {settingsSubTab === 'preferences' && <SettingsTimerSounds />}
              {settingsSubTab === 'privacy-data' && <SettingsPrivacyData />}


              {/* Mobile Version Number at Bottom */}
              <div className="md:hidden text-center py-6">
                <div className="text-xs text-slate-400">Version {BUILD_VERSION}</div>
              </div>
            </div>
          </main>
        </>
      )}

      {showImageEditor && selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4 pb-24"
          onClick={handleCancelEditor}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-900">Position Your Photo</h3>
              <button
                onClick={handleCancelEditor}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-6">
              <div
                className="relative w-80 h-80 mx-auto bg-slate-100 rounded-full overflow-hidden cursor-move border-4 border-slate-300"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  ref={(el) => {
                    imageRef.current = el;
                  }}
                  src={selectedImage}
                  alt="Preview"
                  className="absolute"
                  style={{
                    width: '320px',
                    height: 'auto',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${imagePosition.x}px), calc(-50% + ${imagePosition.y}px)) scale(${imageZoom})`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                  }}
                  draggable={false}
                />
              </div>
              <p className="text-center text-sm text-slate-600 mt-3">
                Drag to position • Use zoom controls below
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Zoom</label>
                  <span className="text-sm text-slate-600">{Math.round(imageZoom * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setImageZoom(Math.max(0.5, imageZoom - 0.1))}
                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  >
                    <ZoomOut size={20} />
                  </button>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={imageZoom}
                    onChange={(e) => setImageZoom(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <button
                    onClick={() => setImageZoom(Math.min(3, imageZoom + 0.1))}
                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  >
                    <ZoomIn size={20} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelEditor}
                disabled={isUploadingAvatar}
                className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCroppedImage}
                disabled={isUploadingAvatar}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50"
              >
                <Check size={18} />
                {isUploadingAvatar ? 'Saving...' : 'Save Photo'}
              </button>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}

      {/* About Channel Modal */}
      <AboutChannelModal
        isOpen={!!aboutModalChannel}
        onClose={() => setAboutModalChannel(null)}
        channelName={aboutModalChannel?.channel_name || ''}
        aboutContent={aboutModalChannel?.about_channel}
        aboutImageUrl={aboutModalChannel?.about_image_url}
        aboutExternalLink={aboutModalChannel?.about_external_link}
      />
    </div>
  );
}
