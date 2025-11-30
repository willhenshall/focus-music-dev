import { useState, useEffect, useRef, FormEvent } from 'react';
import { Camera, User, Upload, Trash2, ZoomIn, ZoomOut, X, Check, Edit2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export function SettingsProfile() {
  const { user, profile, refreshProfile } = useAuth();
  const [passwordResetStatus, setPasswordResetStatus] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [nameUpdateStatus, setNameUpdateStatus] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [emailUpdateStatus, setEmailUpdateStatus] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
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

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
    if (profile?.avatar_url) {
      setAvatarUrl(profile.avatar_url);
    }
    if (user?.email) {
      setCurrentEmail(user.email);
    }
  }, [profile, user]);

  const handleNameUpdate = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ display_name: displayName })
        .eq('id', user.id);

      if (error) throw error;

      // Refresh the profile to get the updated data
      await refreshProfile();

      setNameUpdateStatus('Display name updated successfully!');
      setIsEditingName(false);
      setTimeout(() => setNameUpdateStatus(''), 3000);
    } catch (error: any) {
      setNameUpdateStatus(`Error: ${error.message}`);
    }
  };

  const handleEmailUpdate = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;

    try {
      const { error } = await supabase.auth.updateUser({ email: currentEmail });

      if (error) throw error;

      setEmailUpdateStatus('Check your new email for a confirmation link');
      setIsEditingEmail(false);
      setTimeout(() => setEmailUpdateStatus(''), 5000);
    } catch (error: any) {
      setEmailUpdateStatus(`Error: ${error.message}`);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);

      if (error) throw error;

      setPasswordResetStatus('Password reset link sent to your email!');
      setTimeout(() => setPasswordResetStatus(''), 5000);
    } catch (error: any) {
      setPasswordResetStatus(`Error: ${error.message}`);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setAvatarUploadStatus('Error: File size must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
      setShowImageEditor(true);
      setImageZoom(1);
      setImagePosition({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 400;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const scale = imageZoom;
    const imgWidth = img.naturalWidth * scale;
    const imgHeight = img.naturalHeight * scale;
    const x = (size - imgWidth) / 2 + imagePosition.x;
    const y = (size - imgHeight) / 2 + imagePosition.y;

    ctx.drawImage(img, x, y, imgWidth, imgHeight);
    ctx.restore();
  };

  useEffect(() => {
    if (showImageEditor && selectedImage) {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        drawCanvas();
      };
      img.src = selectedImage;
    }
  }, [showImageEditor, selectedImage, imageZoom, imagePosition]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
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

  const handleSavePhoto = async () => {
    if (!user || !canvasRef.current) return;

    try {
      setIsUploadingAvatar(true);
      setAvatarUploadStatus('');

      const canvas = canvasRef.current;
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9);
      });

      const fileName = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('user-photos')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setShowImageEditor(false);
      setSelectedImage(null);
      setAvatarUploadStatus('Profile photo updated successfully!');
      setTimeout(() => setAvatarUploadStatus(''), 3000);
    } catch (error: any) {
      setAvatarUploadStatus(`Error: ${error.message}`);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;

    try {
      setIsUploadingAvatar(true);
      const { error } = await supabase
        .from('user_profiles')
        .update({ avatar_url: null })
        .eq('id', user.id);

      if (error) throw error;

      setAvatarUrl(null);
      setAvatarUploadStatus('Profile photo removed successfully!');
      setTimeout(() => setAvatarUploadStatus(''), 3000);
    } catch (error: any) {
      setAvatarUploadStatus(`Error: ${error.message}`);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Photo Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Camera size={20} />
          Profile Photo
        </h3>

        <div className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  data-testid="avatar-image"
                  className="w-24 h-24 rounded-full object-cover border-4 border-slate-200"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center border-4 border-slate-300">
                  <User size={40} className="text-slate-400" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <p className="text-sm text-slate-600 mb-3">
                Upload a profile photo to personalize your account. Max file size: 2MB
              </p>
              <div className="flex gap-3">
                <label data-testid="avatar-upload-button" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors cursor-pointer">
                  <Upload size={18} />
                  {avatarUrl ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarSelect}
                    disabled={isUploadingAvatar}
                    className="hidden"
                    data-testid="avatar-file-input"
                  />
                </label>
                {avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={18} />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {avatarUploadStatus && (
            <div data-testid="avatar-status" className={`text-sm p-3 rounded-md ${
              avatarUploadStatus.startsWith('Error')
                ? 'bg-red-50 text-red-700'
                : 'bg-green-50 text-green-700'
            }`}>
              {avatarUploadStatus}
            </div>
          )}
        </div>
      </div>

      {/* Account Information Section - Inline Editing */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Account Information</h3>

        <div className="space-y-6">
          {/* Display Name - Inline Editing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Your Name</label>
              <button
                onClick={() => {
                  if (isEditingName) {
                    handleNameUpdate();
                  } else {
                    setIsEditingName(true);
                    setNameUpdateStatus('');
                  }
                }}
                data-testid="display-name-edit-button"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
              >
                {isEditingName ? (
                  <>
                    <Check size={16} />
                    Save
                  </>
                ) : (
                  <>
                    <Edit2 size={16} />
                    Update
                  </>
                )}
              </button>
            </div>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={!isEditingName}
              placeholder="Enter your name"
              data-testid="display-name-input"
              className={`w-full px-3 py-2 border border-slate-300 rounded-md transition-colors ${
                isEditingName
                  ? 'bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                  : 'bg-slate-50 text-slate-700 cursor-not-allowed'
              }`}
            />
            {nameUpdateStatus && (
              <div data-testid="display-name-status" className={`text-sm mt-2 p-2 rounded-md ${
                nameUpdateStatus.startsWith('Error')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-green-50 text-green-700'
              }`}>
                {nameUpdateStatus}
              </div>
            )}
          </div>

          {/* Current Email - Inline Editing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Current Email</label>
              <button
                onClick={() => {
                  if (isEditingEmail) {
                    handleEmailUpdate();
                  } else {
                    setIsEditingEmail(true);
                    setEmailUpdateStatus('');
                  }
                }}
                data-testid="email-edit-button"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
              >
                {isEditingEmail ? (
                  <>
                    <Check size={16} />
                    Save
                  </>
                ) : (
                  <>
                    <Edit2 size={16} />
                    Update
                  </>
                )}
              </button>
            </div>
            <input
              type="email"
              value={currentEmail}
              onChange={(e) => setCurrentEmail(e.target.value)}
              disabled={!isEditingEmail}
              placeholder="your@email.com"
              data-testid="email-input"
              className={`w-full px-3 py-2 border border-slate-300 rounded-md transition-colors ${
                isEditingEmail
                  ? 'bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                  : 'bg-slate-50 text-slate-700 cursor-not-allowed'
              }`}
            />
            {emailUpdateStatus && (
              <div data-testid="email-status" className={`text-sm mt-2 p-2 rounded-md ${
                emailUpdateStatus.startsWith('Error')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-green-50 text-green-700'
              }`}>
                {emailUpdateStatus}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Password Reset Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Password Reset</h3>

        <p className="text-sm text-slate-600 mb-4">
          Click the button below to receive a password reset link via email.
        </p>

        <button
          onClick={handlePasswordReset}
          className="w-full bg-slate-700 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-md transition-colors"
        >
          Send Password Reset Email
        </button>

        {passwordResetStatus && (
          <div className={`text-sm p-3 rounded-md mt-4 ${
            passwordResetStatus.startsWith('Error')
              ? 'bg-red-50 text-red-700'
              : 'bg-green-50 text-green-700'
          }`}>
            {passwordResetStatus}
          </div>
        )}
      </div>

      {/* Image Editor Modal */}
      {showImageEditor && selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Position Your Photo</h3>
              <button
                onClick={() => {
                  setShowImageEditor(false);
                  setSelectedImage(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center" style={{ height: '400px' }}>
                <canvas
                  ref={canvasRef}
                  className="cursor-move"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              </div>

              <div className="text-sm text-center text-slate-600">
                Drag to position • Use zoom controls below
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Zoom: {Math.round(imageZoom * 100)}%</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setImageZoom(Math.max(0.5, imageZoom - 0.1))}
                    className="p-2 bg-slate-200 hover:bg-slate-300 rounded-md"
                  >
                    <ZoomOut size={20} />
                  </button>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    value={imageZoom * 100}
                    onChange={(e) => setImageZoom(Number(e.target.value) / 100)}
                    className="flex-1"
                  />
                  <button
                    onClick={() => setImageZoom(Math.min(3, imageZoom + 0.1))}
                    className="p-2 bg-slate-200 hover:bg-slate-300 rounded-md"
                  >
                    <ZoomIn size={20} />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowImageEditor(false);
                    setSelectedImage(null);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePhoto}
                  disabled={isUploadingAvatar}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  {isUploadingAvatar ? 'Saving...' : 'Save Photo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
