import { useState, useEffect, useRef } from 'react';
import { Image, Presentation } from 'lucide-react';
import ChannelImagesTab from './ChannelImagesTab';
import AdminSlideshowTab from './AdminSlideshowTab';

export default function ImageSetsManager() {
  const [activeTab, setActiveTab] = useState<'channel' | 'slideshow'>('channel');
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose setActiveTab to parent via DOM
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as any).setActiveTab = setActiveTab;
    }
  }, []);

  // Update active state of buttons in parent nav
  useEffect(() => {
    const buttons = document.querySelectorAll('[data-sub-tab-images]');
    buttons.forEach((btn) => {
      const btnElement = btn as HTMLButtonElement;
      const subTab = btnElement.getAttribute('data-sub-tab-images');
      if (subTab === activeTab) {
        btnElement.className = btnElement.className.replace('border-transparent text-slate-600', 'border-blue-600 text-blue-600');
      } else {
        btnElement.className = btnElement.className.replace('border-blue-600 text-blue-600', 'border-transparent text-slate-600');
      }
    });
  }, [activeTab]);

  return (
    <div className="space-y-6" ref={containerRef} data-image-manager>
      {activeTab === 'channel' && <ChannelImagesTab />}
      {activeTab === 'slideshow' && <AdminSlideshowTab />}
    </div>
  );
}
