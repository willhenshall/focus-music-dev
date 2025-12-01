import { useState, useEffect } from 'react';
import { Search, UserPlus, Shield, ShieldOff, Trash2, Mail, Calendar, CheckCircle, XCircle, X, Users, Download, FileUp, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserDetailModal } from './UserDetailModal';

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

export function UserManager() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', displayName: '', isAdmin: false });
  const [creating, setCreating] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'skip' | 'replace'>('skip');
  const [importPreview, setImportPreview] = useState<any[]>([]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-users`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load users');
      }

      setUsers(data.users || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      await loadUsers();
      alert(`User ${currentStatus ? 'removed from' : 'granted'} admin privileges`);
    } catch (error) {
      alert('Failed to update admin status');
    }
  };

  const startDeleteUser = (user: UserProfile) => {
    setDeletingUser(user);
    setDeleteConfirmText('');
  };

  const cancelDelete = () => {
    setDeletingUser(null);
    setDeleteConfirmText('');
  };

  const confirmDeleteUser = async () => {
    if (!deletingUser || deleteConfirmText !== 'DELETE') {
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
          userId: deletingUser.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      alert(`User "${deletingUser.email}" has been deleted successfully`);
      await loadUsers();
      setDeletingUser(null);
      setDeleteConfirmText('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const createNewUser = async () => {
    if (!newUser.email || !newUser.password) {
      alert('Email and password are required');
      return;
    }

    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          displayName: newUser.displayName,
          isAdmin: newUser.isAdmin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      alert(`User "${newUser.email}" created successfully`);
      setNewUser({ email: '', password: '', displayName: '', isAdmin: false });
      setShowAddModal(false);
      await loadUsers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const startBulkDelete = () => {
    if (selectedUserIds.size === 0) return;
    setShowBulkDeleteModal(true);
    setBulkDeleteConfirmText('');
  };

  const cancelBulkDelete = () => {
    setShowBulkDeleteModal(false);
    setBulkDeleteConfirmText('');
  };

  const confirmBulkDelete = async () => {
    if (bulkDeleteConfirmText !== 'DELETE') {
      return;
    }

    setBulkDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`;
      const userIds = Array.from(selectedUserIds);
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      for (const userId of userIds) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Failed to delete user');
          }

          successCount++;
        } catch (error) {
          failCount++;
          const user = users.find(u => u.id === userId);
          errors.push(`${user?.email || userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      let message = `Successfully deleted ${successCount} user(s)`;
      if (failCount > 0) {
        message += `\n\nFailed to delete ${failCount} user(s):\n${errors.join('\n')}`;
      }

      alert(message);
      await loadUsers();
      setSelectedUserIds(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirmText('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete users');
    } finally {
      setBulkDeleting(false);
    }
  };

  const exportFullUserData = async () => {
    if (!confirm('Export full user data including all profile information, preferences, and analytics? This may take a moment.')) {
      return;
    }

    setExporting(true);

    try {
      // Fetch all user data with related tables
      let allUsers: any[] = [];
      let hasMore = true;
      let offset = 0;
      const batchSize = 1000;

      while (hasMore) {
        const { data: batch, error } = await supabase
          .from('user_profiles')
          .select('*')
          .range(offset, offset + batchSize - 1)
          .order('created_at');

        if (error) throw error;

        if (!batch || batch.length === 0) {
          hasMore = false;
        } else {
          allUsers = [...allUsers, ...batch];
          offset += batchSize;
          hasMore = batch.length === batchSize;
        }
      }

      if (allUsers.length === 0) {
        alert('No users found to export.');
        setExporting(false);
        return;
      }

      // Define all possible columns
      const headers = [
        'id', 'email', 'display_name', 'is_admin', 'onboarding_completed',
        'brain_type', 'created_at', 'updated_at',
        'ocean_openness', 'ocean_conscientiousness', 'ocean_extraversion',
        'ocean_agreeableness', 'ocean_neuroticism',
        'adhd_indicator', 'asd_indicator',
        'prefers_music', 'energy_preference'
      ];

      // Create CSV rows
      const csvData = allUsers.map(user =>
        headers.map(header => {
          const value = user[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'boolean') return value ? 'true' : 'false';
          if (typeof value === 'number') return value.toString();
          return String(value).replace(/"/g, '""'); // Escape quotes
        })
      );

      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `users_full_data_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`Successfully exported ${allUsers.length} users with full data`);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Display Name', 'Status', 'Brain Type', 'Role', 'Created Date'];
    const csvData = filteredUsers.map(user => [
      user.email,
      user.display_name || 'No name',
      user.onboarding_completed ? 'Active' : 'Pending',
      user.brain_type || 'Not set',
      user.is_admin ? 'Admin' : 'User',
      new Date(user.created_at).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `users_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (file: File) => {
    setImportFile(file);

    try {
      const text = await file.text();
      const lines = text.split('\n');

      if (lines.length < 2) {
        alert('Invalid CSV file: no data found');
        return;
      }

      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

      // Parse preview (first 5 rows)
      const preview = lines.slice(1, 6).filter(line => line.trim()).map(line => {
        const values = line.match(/("[^"]*"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];
        const obj: any = {};
        headers.forEach((header, idx) => {
          obj[header] = values[idx] || '';
        });
        return obj;
      });

      setImportPreview(preview);
      setShowImportModal(true);
    } catch (err: any) {
      alert(`Failed to read file: ${err.message}`);
    }
  };

  const confirmImport = async () => {
    if (!importFile) return;

    setImporting(true);

    try {
      const text = await importFile.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

      const usersToImport = lines.slice(1).filter(line => line.trim()).map(line => {
        const values = line.match(/("[^"]*"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];
        const obj: any = {};
        headers.forEach((header, idx) => {
          const value = values[idx] || '';
          if (value === '') {
            obj[header] = null;
          } else if (value === 'true' || value === 'false') {
            obj[header] = value === 'true';
          } else if (!isNaN(Number(value)) && value !== '') {
            obj[header] = Number(value);
          } else {
            obj[header] = value;
          }
        });
        return obj;
      });

      let successCount = 0;
      let skippedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const userData of usersToImport) {
        try {
          // Check if user exists
          const { data: existing } = await supabase
            .from('user_profiles')
            .select('id, email')
            .eq('email', userData.email)
            .maybeSingle();

          if (existing) {
            if (importMode === 'skip') {
              skippedCount++;
              continue;
            } else {
              // Update existing user
              const updateData: any = { ...userData };
              delete updateData.id;
              delete updateData.created_at;
              updateData.updated_at = new Date().toISOString();

              const { error } = await supabase
                .from('user_profiles')
                .update(updateData)
                .eq('id', existing.id);

              if (error) throw error;
              updatedCount++;
            }
          } else {
            // This would require creating auth user - skip for now
            errors.push(`${userData.email}: Cannot create new users via import (auth user required)`);
            errorCount++;
          }

          successCount++;
        } catch (err: any) {
          errorCount++;
          errors.push(`${userData.email}: ${err.message}`);
        }
      }

      let message = `Import completed!\n`;
      if (updatedCount > 0) message += `Updated: ${updatedCount}\n`;
      if (skippedCount > 0) message += `Skipped: ${skippedCount}\n`;
      if (errorCount > 0) message += `Errors: ${errorCount}\n\n${errors.slice(0, 10).join('\n')}`;

      alert(message);
      await loadUsers();
      setShowImportModal(false);
      setImportFile(null);
      setImportPreview([]);
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const cancelImport = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportPreview([]);
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;

    const searchTerms = searchQuery.trim().split(/\s+/).filter(term => term.length > 0);
    const emailLower = user.email.toLowerCase();
    const displayNameLower = (user.display_name || 'No name').toLowerCase();

    return searchTerms.every(term => {
      const termLower = term.toLowerCase();
      return emailLower.includes(termLower) || displayNameLower.includes(termLower);
    });
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg shadow-sm p-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search users by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="users-search-input"
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                title="Clear search"
              >
                <X size={18} />
              </button>
            )}
          </div>
          {filteredUsers.length > 0 && (
            <>
              <button
                onClick={exportFullUserData}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
                title="Export all user data with full details"
              >
                <Database size={18} />
                {exporting ? 'Exporting...' : 'Export Full Data'}
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                title="Export filtered users to CSV (summary)"
              >
                <Download size={18} />
                Export CSV
              </button>
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer">
                <FileUp size={18} />
                Import Users
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                  disabled={importing}
                />
              </label>
            </>
          )}
          {selectedUserIds.size > 0 && (
            <button
              onClick={startBulkDelete}
              data-testid="bulk-delete-users-button"
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <Trash2 size={18} />
              Delete Selected ({selectedUserIds.size})
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            data-testid="add-user-button"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <UserPlus size={20} />
            Add User
          </button>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Users size={16} />
            <span>
              {searchQuery ? (
                <>
                  Found <span className="font-semibold text-slate-900">{filteredUsers.length}</span> of {users.length} user{users.length !== 1 ? 's' : ''}
                </>
              ) : (
                <>
                  Total: <span className="font-semibold text-slate-900">{users.length}</span> user{users.length !== 1 ? 's' : ''}
                </>
              )}
            </span>
          </div>
          {searchQuery && (
            <div className="text-slate-500">
              Searching for: <span className="font-medium text-slate-700">"{searchQuery}"</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="users-table">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0}
                    onChange={toggleSelectAll}
                    data-testid="select-all-users-checkbox"
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Brain Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  data-testid={`user-row-${user.email}`}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(user.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleUserSelection(user.id);
                      }}
                      data-testid={`select-user-${user.email}`}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td
                    className="px-6 py-4 cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Mail className="text-blue-600" size={18} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{user.display_name || 'No name'}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {user.onboarding_completed ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                        <CheckCircle size={14} />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                        <XCircle size={14} />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {user.brain_type ? (
                      <span className="text-sm text-slate-700 capitalize">
                        {user.brain_type.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">Not set</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {user.is_admin ? (
                      <span 
                        data-testid={`user-admin-badge-${user.email}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full"
                      >
                        <Shield size={14} />
                        Admin
                      </span>
                    ) : (
                      <span 
                        data-testid={`user-role-badge-${user.email}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full"
                      >
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Calendar size={14} />
                      {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleAdminStatus(user.id, user.is_admin)}
                        data-testid={`toggle-admin-${user.email}`}
                        className={`p-2 rounded-lg transition-colors ${
                          user.is_admin
                            ? 'text-slate-600 hover:text-orange-600 hover:bg-orange-50'
                            : 'text-slate-600 hover:text-purple-600 hover:bg-purple-50'
                        }`}
                        title={user.is_admin ? 'Remove admin' : 'Make admin'}
                      >
                        {user.is_admin ? <ShieldOff size={18} /> : <Shield size={18} />}
                      </button>
                      <button
                        onClick={() => startDeleteUser(user)}
                        data-testid={`delete-user-${user.email}`}
                        className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete user"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Mail className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-600">No users found matching your search</p>
        </div>
      )}

      {showAddModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24"
          onClick={() => setShowAddModal(false)}
          data-testid="add-user-modal"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add New User</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  data-testid="new-user-email-input"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  data-testid="new-user-password-input"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={newUser.displayName}
                  onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                  data-testid="new-user-displayname-input"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isAdmin"
                  checked={newUser.isAdmin}
                  onChange={(e) => setNewUser({ ...newUser, isAdmin: e.target.checked })}
                  data-testid="new-user-admin-checkbox"
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isAdmin" className="text-sm font-medium text-slate-700">
                  Grant admin privileges
                </label>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                disabled={creating}
                data-testid="add-user-cancel-button"
                className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createNewUser}
                disabled={creating || !newUser.email || !newUser.password}
                data-testid="create-user-submit-button"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingUser && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24"
          onClick={cancelDelete}
          data-testid="delete-user-modal"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
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
                  {deletingUser.email}
                </p>
                <p className="text-slate-600 text-sm mb-4">
                  This action cannot be undone. All user data, sessions, and preferences will be permanently removed. To confirm, please type <span className="font-mono font-bold text-red-600">DELETE</span> below:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  data-testid="delete-confirm-input"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                  placeholder="Type DELETE to confirm"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                disabled={deleting}
                data-testid="delete-cancel-button"
                className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteUser}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                data-testid="delete-confirm-button"
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUserDeleted={loadUsers}
          onUserUpdated={loadUsers}
        />
      )}

      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Users className="text-red-600" size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Bulk Delete Users</h3>
                  <p className="text-slate-600 text-sm mb-4">
                    You are about to permanently delete {selectedUserIds.size} user{selectedUserIds.size > 1 ? 's' : ''}:
                  </p>
                  <div className="bg-slate-50 rounded-lg p-3 mb-4 max-h-40 overflow-y-auto">
                    {Array.from(selectedUserIds).map(userId => {
                      const user = users.find(u => u.id === userId);
                      return user ? (
                        <div key={userId} className="text-sm text-slate-700 py-1">
                          • {user.email}
                        </div>
                      ) : null;
                    })}
                  </div>
                  <p className="text-slate-600 text-sm mb-4">
                    This action cannot be undone. All user data, sessions, and preferences will be permanently removed. To confirm, please type <span className="font-mono font-bold text-red-600">DELETE</span> below:
                  </p>
                  <input
                    type="text"
                    value={bulkDeleteConfirmText}
                    onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                    data-testid="bulk-delete-confirm-input"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                    placeholder="Type DELETE to confirm"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelBulkDelete}
                  disabled={bulkDeleting}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDelete}
                  disabled={bulkDeleteConfirmText !== 'DELETE' || bulkDeleting}
                  data-testid="confirm-bulk-delete-button"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkDeleting ? 'Deleting...' : `Delete ${selectedUserIds.size} User${selectedUserIds.size > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full shadow-2xl">
            <div className="p-6 space-y-4">
              <h3 className="text-xl font-bold text-slate-900">Import Users</h3>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 mb-2">
                  <strong>Import Mode:</strong> Choose how to handle duplicate users (matching email addresses)
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="skip"
                      checked={importMode === 'skip'}
                      onChange={(e) => setImportMode(e.target.value as 'skip' | 'replace')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-slate-900">
                      <strong>Skip duplicates</strong> - Keep existing user data, only import new users
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={(e) => setImportMode(e.target.value as 'skip' | 'replace')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-slate-900">
                      <strong>Replace duplicates</strong> - Update existing users with imported data
                    </span>
                  </label>
                </div>
              </div>

              {importPreview.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Preview (first 5 rows):</h4>
                  <div className="bg-slate-50 rounded-lg p-3 max-h-60 overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-300">
                          {Object.keys(importPreview[0]).slice(0, 6).map(key => (
                            <th key={key} className="text-left py-1 px-2 font-semibold text-slate-700">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-200">
                            {Object.values(row).slice(0, 6).map((val: any, i) => (
                              <td key={i} className="py-1 px-2 text-slate-600">{String(val).substring(0, 30)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-900">
                  <strong>Note:</strong> This import only updates existing user profiles.
                  New users cannot be created via CSV import because they require authentication setup.
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelImport}
                  disabled={importing}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Import Users'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
