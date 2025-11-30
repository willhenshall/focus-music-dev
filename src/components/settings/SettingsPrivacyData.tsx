import { useState } from 'react';
import { Download, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { BUILD_VERSION } from '../../buildVersion';

export function SettingsPrivacyData() {
  const { user } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);

  const handleDataExport = async () => {
    if (!user) return;

    try {
      setIsExportingData(true);

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const { data: quizData, error: quizError } = await supabase
        .from('quiz_results')
        .select('*')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const exportData = {
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        },
        profile: profileData,
        quiz_results: quizData,
        exported_at: new Date().toISOString(),
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
    } catch (error: any) {
      console.error('Error exporting data:', error);
      alert(`Failed to export data: ${error.message}`);
    } finally {
      setIsExportingData(false);
    }
  };

  const handleAccountDeletion = async () => {
    if (!user || deleteConfirmText !== 'DELETE') return;

    try {
      setIsDeletingAccount(true);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ user_id: user.id }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete account');
      }

      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (error: any) {
      alert(`Failed to delete account: ${error.message}`);
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Privacy & Data Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Download size={20} />
          Privacy & Data
        </h3>

        <div className="space-y-4">
          <div className="border-b border-slate-200 pb-4">
            <h4 className="font-semibold text-slate-900 mb-2">Download Your Data</h4>
            <p className="text-sm text-slate-600 mb-3">
              Export your personal information and personality assessment results in JSON format.
            </p>
            <button
              onClick={handleDataExport}
              disabled={isExportingData}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              {isExportingData ? 'Exporting...' : 'Download My Data'}
            </button>
          </div>

          <div className="border-b border-slate-200 pb-4">
            <h4 className="font-semibold text-slate-900 mb-2">Personal Data We Store</h4>
            <ul className="text-sm text-slate-600 space-y-1 ml-4 list-disc">
              <li>Account information (email, display name)</li>
              <li>Personality assessment results (OCEAN traits, brain type, energy preference)</li>
              <li>Focus indicators (ADHD and ASD assessment scores)</li>
              <li>Listening preferences and session data</li>
              <li>Timer and notification preferences</li>
            </ul>
          </div>

          <div className="border-b border-slate-200 pb-4">
            <h4 className="font-semibold text-slate-900 mb-2">How We Use Your Data</h4>
            <ul className="text-sm text-slate-600 space-y-1 ml-4 list-disc">
              <li>Personalize music recommendations based on your cognitive profile</li>
              <li>Track your listening patterns to improve the experience</li>
              <li>Provide customized timer and notification settings</li>
              <li>Generate insights about your focus sessions</li>
            </ul>
          </div>

          <div className="border-b border-slate-200 pb-4">
            <h4 className="font-semibold text-slate-900 mb-2">Data Security</h4>
            <ul className="text-sm text-slate-600 space-y-1 ml-4 list-disc">
              <li>All data is encrypted in transit and at rest</li>
              <li>We use industry-standard security practices</li>
              <li>Your data is never sold to third parties</li>
              <li>Access to your data is strictly controlled</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Your Rights</h4>
            <ul className="text-sm text-slate-600 space-y-1 ml-4 list-disc">
              <li>Right to access your personal data</li>
              <li>Right to rectify inaccurate data</li>
              <li>Right to erasure (delete your account)</li>
              <li>Right to data portability</li>
              <li>Right to object to processing</li>
              <li>Right to withdraw consent at any time</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Analytics & Tracking Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Analytics & Tracking</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Usage Analytics</h4>
            <p className="text-sm text-slate-600 mb-3">
              We collect anonymized usage data to improve the platform. This includes:
            </p>
            <ul className="text-sm text-slate-600 space-y-1 ml-4 list-disc">
              <li>Channel play counts and skip rates</li>
              <li>Session duration and frequency</li>
              <li>Feature usage patterns</li>
              <li>Error logs and performance metrics</li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> Analytics data is aggregated and anonymized. It cannot be used to identify individual users and is used solely to improve the platform experience.
            </p>
          </div>
        </div>
      </div>

      {/* Build Version Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Application Version</h3>
        <p className="text-sm text-slate-600">
          Build Version: <span className="font-mono font-semibold text-slate-900">{BUILD_VERSION}</span>
        </p>
      </div>

      {/* Danger Zone Section */}
      <div className="bg-red-50 rounded-lg shadow-sm border-2 border-red-200 p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
          <AlertTriangle size={20} />
          Danger Zone
        </h3>

        {!showDeleteConfirm ? (
          <div>
            <p className="text-sm text-red-700 mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="delete-account-button"
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors"
            >
              <Trash2 size={18} />
              Delete My Account
            </button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="delete-confirm-modal">
            <div className="bg-white rounded-md p-4 border border-red-200">
              <p className="text-sm font-semibold text-red-900 mb-2">
                This will permanently delete:
              </p>
              <ul className="text-sm text-red-700 space-y-1 ml-4 list-disc">
                <li>Your account and login credentials</li>
                <li>Your profile and display name</li>
                <li>All quiz responses and personality data</li>
                <li>Your preferences and settings</li>
                <li>Your listening history and session data</li>
                <li>All uploaded files (profile photos, custom sounds)</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium text-red-900 mb-2">
                Type <span className="font-bold">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                data-testid="delete-confirm-input"
                className="w-full px-3 py-2 border-2 border-red-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
                data-testid="delete-cancel-button"
                className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAccountDeletion}
                disabled={deleteConfirmText !== 'DELETE' || isDeletingAccount}
                data-testid="delete-confirm-button"
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingAccount ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
