import { CheckCircle2, Cloud, AlertCircle, Loader } from 'lucide-react';

export type CDNSyncStatus = 'synced' | 'not-synced' | 'failed' | 'pending';

interface CDNSyncStatusBadgeProps {
  status: CDNSyncStatus;
  cdnUrl?: string;
  lastSyncedAt?: string;
  className?: string;
  showLabel?: boolean;
}

export function CDNSyncStatusBadge({
  status,
  cdnUrl,
  lastSyncedAt,
  className = '',
  showLabel = true,
}: CDNSyncStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'synced':
        return {
          icon: CheckCircle2,
          label: 'On CDN',
          bgColor: 'bg-green-50',
          textColor: 'text-green-700',
          borderColor: 'border-green-200',
          iconColor: 'text-green-600',
        };
      case 'not-synced':
        return {
          icon: Cloud,
          label: 'Not Synced',
          bgColor: 'bg-slate-50',
          textColor: 'text-slate-600',
          borderColor: 'border-slate-200',
          iconColor: 'text-slate-400',
        };
      case 'failed':
        return {
          icon: AlertCircle,
          label: 'Sync Failed',
          bgColor: 'bg-amber-50',
          textColor: 'text-amber-700',
          borderColor: 'border-amber-200',
          iconColor: 'text-amber-600',
        };
      case 'pending':
        return {
          icon: Loader,
          label: 'Syncing...',
          bgColor: 'bg-blue-50',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
          iconColor: 'text-blue-600',
        };
      default:
        return {
          icon: Cloud,
          label: 'Unknown',
          bgColor: 'bg-slate-50',
          textColor: 'text-slate-600',
          borderColor: 'border-slate-200',
          iconColor: 'text-slate-400',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const title = [
    `Status: ${config.label}`,
    cdnUrl && `CDN URL: ${cdnUrl}`,
    lastSyncedAt && `Last synced: ${formatDate(lastSyncedAt)}`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${config.bgColor} ${config.textColor} ${config.borderColor} ${className}`}
      title={title}
    >
      <Icon
        className={`w-3.5 h-3.5 ${config.iconColor} ${
          status === 'pending' ? 'animate-spin' : ''
        }`}
      />
      {showLabel && <span>{config.label}</span>}
    </div>
  );
}
