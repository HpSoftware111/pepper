'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import VoiceCapture from './VoiceCapture';
import { extractFilesAndStore } from '@/lib/extractionClient';

interface Case {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'pending' | 'urgent';
  case_id?: string; // Optional case_id for navigation
}

type SidebarProps = {
  showQuickActions?: boolean;
  showRecentCases?: boolean;
  recentCases?: Case[];
};

export default function Sidebar({ showQuickActions = true, showRecentCases = true, recentCases = [] }: SidebarProps) {
  const { themeMode, layoutDensity } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const router = useRouter();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [recentUploadLabel, setRecentUploadLabel] = useState('');
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [fileProcessingError, setFileProcessingError] = useState<string | null>(null);

  const handleCaseClick = (caseItem: Case) => {
    // Extract case_id from name if not provided directly
    // Name format is usually: "CASE_ID: Case Name" or just "Case Name"
    let caseId = caseItem.case_id;
    if (!caseId && caseItem.name) {
      // Try to extract case_id from name (format: "CASE_ID: ...")
      const nameParts = caseItem.name.split(':');
      if (nameParts.length > 1) {
        caseId = nameParts[0].trim();
      } else {
        // If no colon, use the id (which might be case_id or _id)
        caseId = caseItem.id;
      }
    } else if (!caseId) {
      caseId = caseItem.id;
    }

    // Navigate to calendar page with case information
    const params = new URLSearchParams();
    params.set('case', caseId);
    if (caseItem.name) {
      // Use the full name or extract just the case name part
      const nameParts = caseItem.name.split(':');
      const caseName = nameParts.length > 1 ? nameParts.slice(1).join(':').trim() : caseItem.name;
      params.set('caseName', caseName);
    }
    router.push(`/calendar?${params.toString()}`);
  };
  const panelSurface = isLight
    ? 'border border-slate-200 bg-white text-slate-900 shadow-[0_18px_35px_rgba(15,23,42,0.08)]'
    : 'border border-white/10 bg-white/5 text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur';
  const secondaryText = isLight ? 'text-slate-500' : 'text-slate-400';

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    setIsProcessingFiles(true);
    setFileProcessingError(null);

    try {
      const fileArray = Array.from(files);
      const result = await extractFilesAndStore(fileArray);

      if (result.success && result.stored > 0) {
        const summary =
          result.stored === 1
            ? result.extractedTexts[0].fileName
            : `${result.extractedTexts[0].fileName} +${result.stored - 1} more`;
        setRecentUploadLabel(`${summary} (${result.stored} file${result.stored > 1 ? 's' : ''} processed)`);
      } else {
        setFileProcessingError('No files were successfully processed');
      }
    } catch (error) {
      console.error('Error extracting files:', error);
      setFileProcessingError(error instanceof Error ? error.message : 'Error processing files');
      const names = Array.from(files).map((file) => file.name);
      const summary =
        names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`;
      setRecentUploadLabel(summary);
    } finally {
      setIsProcessingFiles(false);
      // allow selecting the same files again
      event.target.value = '';
    }
  };

  const handleVoiceSuccess = (textId: string, sourceName: string) => {
    setRecentUploadLabel(`Voice: ${sourceName}`);
    setShowVoiceModal(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'urgent':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <aside className={`w-full ${isCompact ? 'mt-6' : 'mt-8'} lg:mt-2`}>
      <div className={`flex flex-col ${isCompact ? 'gap-3.5' : 'gap-4'} lg:h-[calc(100vh-88px)] lg:sticky lg:top-24`}>
        {/* Quick Actions Panel */}
        {showQuickActions && (
          <div className={`rounded-2xl ${isCompact ? 'px-4 py-5' : 'px-5 py-6'} ${panelSurface}`}>
            <div className="mb-4">
              <h2 className={`text-[18px] font-semibold tracking-tight mb-4 ${isLight ? 'text-slate-900' : 'text-slate-50'}`}>
                {t('sidebar.quickActions')}
              </h2>
              <div className={`${isCompact ? 'space-y-2.5' : 'space-y-3'}`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFilesSelected}
                />
                <button
                  onClick={() => router.push('/cases?new=true')}
                  className={`w-full flex items-center justify-between ${isCompact ? 'px-5 py-3.5' : 'px-6 py-4'} rounded-[18px] font-semibold text-base shadow-[0_12px_30px_rgba(15,23,42,0.12)] transition transform hover:-translate-y-[1px] ${isLight
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border border-emerald-300/40 bg-[rgba(13,120,100,0.25)] text-emerald-50 hover:bg-[rgba(13,120,100,0.35)]'
                    }`}
                >
                  <span className="flex items-center space-x-3">
                    <span
                      className={`inline-flex items-center justify-center w-[46px] h-[46px] rounded-[10px] border text-2xl font-bold ${isLight
                        ? 'bg-white border-emerald-200 text-emerald-700'
                        : 'bg-[rgba(255,255,255,0.08)] border-emerald-300/40 text-emerald-50'
                        }`}
                    >
                      +
                    </span>
                    <span>{t('sidebar.newCase')}</span>
                  </span>
                </button>

                <button
                  onClick={handleUploadClick}
                  className={`w-full flex items-center justify-between ${isCompact ? 'px-5 py-3.5' : 'px-6 py-4'} rounded-[18px] ${isLight
                    ? 'border border-slate-200 bg-slate-50 text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.08)]'
                    : 'border border-white/15 bg-white/5 text-white shadow-[0_12px_30px_rgba(0,0,0,0.45)]'
                    } transition transform hover:-translate-y-[1px]`}
                >
                  <span className="flex items-center space-x-3">
                    <span className="inline-flex items-center justify-center w-[46px] h-[46px] rounded-[10px] bg-[linear-gradient(135deg,_#466bb1,_#344d8f)] border border-white/10 text-white">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 5v14m0-14l-4 4m4-4l4 4M5 19h14"
                        />
                      </svg>
                    </span>
                    <span>{t('sidebar.uploadFiles')}</span>
                  </span>
                </button>
                {isProcessingFiles && (
                  <p className={`px-1 text-[12px] ${isLight ? 'text-blue-600' : 'text-blue-200/80'}`}>
                    {t('sidebar.processingFiles')}
                  </p>
                )}
                {fileProcessingError && (
                  <p className={`px-1 text-[12px] ${isLight ? 'text-rose-600' : 'text-rose-200/80'}`}>
                    {fileProcessingError}
                  </p>
                )}
                {recentUploadLabel && !isProcessingFiles && (
                  <p className={`px-1 text-[12px] ${isLight ? 'text-emerald-600' : 'text-emerald-200/80'}`}>
                    {recentUploadLabel}
                  </p>
                )}

                <button
                  onClick={() => setShowVoiceModal(true)}
                  className={`w-full flex items-center justify-between ${isCompact ? 'px-5 py-3.5' : 'px-6 py-4'} rounded-[18px] ${isLight
                    ? 'border border-slate-200 bg-slate-50 text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.08)]'
                    : 'border border-white/15 bg-white/5 text-white shadow-[0_12px_30px_rgba(0,0,0,0.45)]'
                    } transition transform hover:-translate-y-[1px]`}
                >
                  <span className="flex items-center space-x-4">
                    <span className="inline-flex items-center justify-center w-[46px] h-[46px] rounded-[10px] bg-[linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0.02))] border border-[rgba(255,255,255,0.03)] text-[#13d08b]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </span>
                    <span>{t('sidebar.voiceInput')}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Recent Cases Panel */}
        {showRecentCases && (
          <div className={`rounded-2xl ${isCompact ? 'px-4 py-5' : 'px-5 py-6'} ${panelSurface}`}>
            <h2 className={`text-[18px] font-semibold tracking-tight mb-4 ${isLight ? 'text-slate-900' : 'text-slate-50'}`}>
              {t('sidebar.recentCases')}
            </h2>
            <div className={`${isCompact ? 'space-y-2.5' : 'space-y-3'}`}>
              {recentCases.length === 0 ? (
                <div className={`${isCompact ? 'px-5 py-3.5' : 'px-6 py-4'} ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('sidebar.noRecentCases')}
                </div>
              ) : (
                recentCases.map((caseItem) => (
                  <div
                    key={caseItem.id}
                    onClick={() => handleCaseClick(caseItem)}
                    className={`group rounded-[18px] ${isCompact ? 'px-5 py-3.5' : 'px-6 py-4'} cursor-pointer transition-all transform hover:scale-[1.02] border ${isLight ? 'bg-white border-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.08)] hover:shadow-[0_14px_35px_rgba(15,23,42,0.12)]' : 'bg-white/5 border-white/10 shadow-[0_12px_30px_rgba(0,0,0,0.35)] hover:bg-white/8 hover:shadow-[0_14px_35px_rgba(0,0,0,0.45)]'
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-3 h-3 rounded-full ${getStatusColor(
                          caseItem.status,
                        )}`}
                      ></div>
                      <div className="flex-1">
                        <h3 className={`text-sm font-medium ${isLight ? 'text-slate-900' : 'text-slate-50'}`}>
                          {caseItem.name}
                        </h3>
                        <p className={`text-xs mt-1 ${secondaryText}`}>{caseItem.type}</p>
                      </div>
                      {/* Arrow indicator */}
                      <div
                        className={`text-sm flex items-center justify-center transition-transform duration-200 ease-out group-hover:translate-x-1 ${isLight ? 'text-emerald-500' : 'text-[#3ddc84]'
                          }`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      <VoiceCapture
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onSuccess={handleVoiceSuccess}
        themeMode={themeMode}
        layoutDensity={layoutDensity === 'cozy' ? 'comfortable' : layoutDensity}
      />
    </aside>
  );
}

