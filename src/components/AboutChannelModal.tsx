import React from 'react';
import { X, ExternalLink } from 'lucide-react';

interface AboutChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  aboutContent?: string;
  aboutImageUrl?: string;
  aboutExternalLink?: string;
}

export function AboutChannelModal({
  isOpen,
  onClose,
  channelName,
  aboutContent,
  aboutImageUrl,
  aboutExternalLink,
}: AboutChannelModalProps) {
  if (!isOpen) return null;

  const renderMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-700 underline">$1</a>')
      .replace(/\n\n/g, '</p><p class="mb-3">')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">About {channelName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {aboutImageUrl && (
            <div className="mb-6">
              <img
                src={aboutImageUrl}
                alt={`About ${channelName}`}
                className="w-full h-48 object-cover rounded-lg"
              />
            </div>
          )}

          {aboutContent ? (
            <div
              className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: `<p class="mb-3">${renderMarkdown(aboutContent)}</p>`,
              }}
            />
          ) : (
            <p className="text-gray-500 italic">
              No information available for this channel yet.
            </p>
          )}

          {aboutExternalLink && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <a
                href={aboutExternalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                Learn more
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
