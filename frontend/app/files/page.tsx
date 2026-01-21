'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import { useMCDData } from '@/hooks/useMCDData';
import { getExtractedTexts, getExtractedText, deleteExtractedText, extractFilesAndStore, type ExtractedText, type ExtractedTextSummary } from '@/lib/extractionClient';
import { caseFilesClient, type CaseFile } from '@/lib/caseFilesClient';

type FileItem = {
  id: string; // textId for ExtractedText, or generated ID for MCD documents
  name: string;
  caseId: string;
  size: string;
  updated: string;
  owner: string;
  type: string;
  summary: string;
  source: 'extracted' | 'mcd'; // Source of the file
  textId?: string; // For ExtractedText files
  extractedText?: string; // Full extracted text for preview
};

function FilesPage() {
  const { themeMode, layoutDensity } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const { mcds, dashboardCases, loading: mcdLoading, recentActivities } = useMCDData();
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('All files');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [showCaseSelectModal, setShowCaseSelectModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const showSidebar = false;

  // Pagination state
  const FILES_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(0);

  // Recent Activity scroll ref
  const activityScrollRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2600);
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Format date
  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Format time ago
  const formatTimeAgo = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatDate(d);
  };

  // Get file type from filename or MIME type
  const getFileType = (fileName: string, mimeType?: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const typeMap: Record<string, string> = {
      pdf: 'PDF',
      docx: 'Word',
      doc: 'Word',
      txt: 'Text',
      md: 'Markdown',
      csv: 'Excel',
      xlsx: 'Excel',
      xls: 'Excel',
      rtf: 'Rich Text',
      zip: 'Archive',
      rar: 'Archive',
    };
    return typeMap[ext] || mimeType?.split('/')[1]?.toUpperCase() || 'File';
  };

  // Fetch files from case folders (lawyer's local folder structure)
  const fetchFiles = async () => {
    try {
      setLoading(true);
      const allFiles: FileItem[] = [];

      // Fetch files from case folders (primary source - lawyer's local folders)
      try {
        const caseFilesResponse = await caseFilesClient.getAllFiles();
        if (caseFilesResponse.success && caseFilesResponse.files) {
          caseFilesResponse.files.forEach((file: CaseFile) => {
            allFiles.push({
              id: file.id,
              name: file.name,
              caseId: file.caseId,
              size: formatFileSize(file.size),
              updated: formatTimeAgo(file.updated),
              owner: 'Case Folder',
              type: getFileType(file.name),
              summary: `File from case ${file.caseId} folder`,
              source: 'mcd', // Files from case folders
            });
          });
        }
      } catch (error) {
        console.error('Error fetching case folder files:', error);
      }

      // Also include ExtractedText files (for backward compatibility)
      try {
        const extractedResponse = await getExtractedTexts({ source: 'file', limit: 100 });
        if (extractedResponse.success && extractedResponse.extractedTexts) {
          extractedResponse.extractedTexts.forEach((text: ExtractedTextSummary) => {
            const fileName = text.sourceName || 'Unknown file';
            allFiles.push({
              id: text.textId,
              textId: text.textId,
              name: fileName,
              caseId: 'Unassigned', // ExtractedText doesn't have case_id yet
              size: 'Unknown', // Summary doesn't include file size
              updated: formatTimeAgo(text.createdAt),
              owner: 'You',
              type: getFileType(fileName),
              summary: `File uploaded with ${text.wordCount} words. Click to view full content.`,
              source: 'extracted',
            });
          });
        }
      } catch (error) {
        console.error('Error fetching extracted texts:', error);
      }

      // Sort by updated date (most recent first)
      allFiles.sort((a, b) => {
        const dateA = new Date(a.updated).getTime();
        const dateB = new Date(b.updated).getTime();
        return dateB - dateA;
      });

      setFileItems(allFiles);
      if (allFiles.length > 0 && !selectedFile) {
        setSelectedFile(allFiles[0]);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      showToast('Failed to load files', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load files on mount
  useEffect(() => {
    if (!mcdLoading) {
      fetchFiles();
    }
  }, [mcds, dashboardCases, mcdLoading]);

  // Load full file details when selected
  useEffect(() => {
    // Load file content for ExtractedText files
    if (selectedFile?.textId && selectedFile.source === 'extracted' && !selectedFile.extractedText) {
      getExtractedText(selectedFile.textId)
        .then((response) => {
          if (response.success && response.extractedText) {
            setSelectedFile({
              ...selectedFile,
              extractedText: response.extractedText.extractedText,
              summary: response.extractedText.extractedText.substring(0, 200) + '...',
            });
          }
        })
        .catch((error) => {
          console.error('Error loading file details:', error);
        });
    }
    // For case folder files, we can load them if needed (text files)
    // Binary files (PDF, DOCX) will be downloaded instead
  }, [selectedFile?.textId, selectedFile?.source]);

  const filteredFiles = useMemo(() => {
    let filtered = fileItems;

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (file) =>
          file.name.toLowerCase().includes(term) ||
          file.caseId.toLowerCase().includes(term) ||
          file.summary.toLowerCase().includes(term)
      );
    }

    // Apply type filter
    if (activeFilter !== 'All files') {
      if (activeFilter === 'AI drafts') {
        filtered = filtered.filter((file) => file.owner === 'Pepper AI' || file.owner === 'You');
      } else if (activeFilter === 'Evidence') {
        filtered = filtered.filter((file) => file.type === 'PDF' || file.type === 'Image');
      } else if (activeFilter === 'Client notes') {
        filtered = filtered.filter((file) => file.type === 'Text' || file.type === 'Word');
      }
    }

    return filtered;
  }, [fileItems, searchTerm, activeFilter]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / FILES_PER_PAGE));
  const paginatedFiles = useMemo(() => {
    const startIndex = currentPage * FILES_PER_PAGE;
    const endIndex = startIndex + FILES_PER_PAGE;
    return filteredFiles.slice(startIndex, endIndex);
  }, [filteredFiles, currentPage, FILES_PER_PAGE]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, activeFilter]);

  // Auto-scroll for Recent Activity card
  useEffect(() => {
    if (!activityScrollRef.current || recentActivities.length <= 3) return;

    const container = activityScrollRef.current;
    let scrollInterval: NodeJS.Timeout;
    let isPaused = false;

    const startScrolling = () => {
      scrollInterval = setInterval(() => {
        if (!isPaused && container) {
          if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
            // Reached bottom, scroll to top smoothly
            container.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            // Scroll down slowly
            container.scrollBy({ top: 0.5, behavior: 'auto' });
          }
        }
      }, 30); // Update every 30ms for smooth scrolling
    };

    const handleMouseEnter = () => {
      isPaused = true;
    };

    const handleMouseLeave = () => {
      isPaused = false;
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    startScrolling();

    return () => {
      clearInterval(scrollInterval);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [recentActivities.length]);

  const shellSpacing = isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-8 gap-6 lg:gap-8';
  const panelWrapper = isLight
    ? 'rounded-[24px] border border-slate-200 bg-white shadow-[0_25px_55px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] border border-white/5 bg-[rgba(5,18,45,0.55)] shadow-[0_25px_55px_rgba(3,9,24,0.45)]';

  const headerColor = isLight ? 'text-slate-900' : 'text-slate-50';
  const subColor = isLight ? 'text-slate-600' : 'text-slate-300';
  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';

  return (
    <div className="app-shell">
      <Header />

      <div className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-20 ${shellSpacing}`}>
        {showSidebar && (
          <div className="w-full lg:w-[30%] lg:max-w-sm">
            <Sidebar showQuickActions={false} showRecentCases={false} />
          </div>
        )}

        <main
          className={`w-full ${showSidebar ? 'lg:w-[70%]' : 'lg:w-full'} flex-1 ${isCompact ? 'pt-1' : 'pt-2'
            } lg:pt-0 ${showSidebar ? 'lg:pl-6 lg:pr-8' : 'lg:px-0'} ${showSidebar
              ? isLight
                ? 'lg:border-l lg:border-slate-200'
                : 'lg:border-l lg:border-slate-800/70'
              : ''
            }`}
        >
          <div className={`${panelWrapper} ${isCompact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'} lg:p-0 lg:border-none lg:bg-transparent lg:shadow-none lg:rounded-none`}>
            <div className={isCompact ? 'space-y-4 lg:space-y-5' : 'space-y-6 lg:space-y-8'}>
              {/* Header */}
              <section className={isCompact ? 'mt-2' : 'mt-4'}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h1 className={`text-3xl font-semibold ${headerColor}`}>{t('files.title')}</h1>
                    <p className={`text-sm ${subColor}`}>{t('files.subtitle')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-xl bg-[linear-gradient(135deg,_#31d5ff,_#3191ff)] text-white font-semibold px-4 py-2 shadow-[0_10px_25px_rgba(49,149,255,0.35)] hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? t('files.uploading') : t('files.uploadFiles')}
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,.md,.csv,.rtf"
                      className="hidden"
                      onChange={async (event) => {
                        const incoming = event.target.files;
                        if (!incoming?.length) return;

                        const filesArray = Array.from(incoming);

                        // Get all available cases for selection
                        const allCases = [
                          ...mcds.map(mcd => ({ id: mcd.case_id, name: `${mcd.case_id}: ${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}` })),
                          ...dashboardCases.map(dc => ({ id: dc.case_id, name: `${dc.case_id}: ${dc.client}` }))
                        ];

                        if (allCases.length === 0) {
                          // No cases available - use old method (ExtractedText)
                          try {
                            setUploading(true);
                            const result = await extractFilesAndStore(filesArray);
                            if (result.success && result.stored > 0) {
                              showToast(`Successfully uploaded ${result.stored} file${result.stored > 1 ? 's' : ''}`, 'success');
                              await fetchFiles();
                            } else {
                              showToast('Failed to upload files', 'error');
                            }
                          } catch (error) {
                            console.error('Upload error:', error);
                            showToast(error instanceof Error ? error.message : 'Failed to upload files', 'error');
                          } finally {
                            setUploading(false);
                            event.target.value = '';
                          }
                        } else {
                          // Show case selection modal
                          setPendingFiles(filesArray);
                          setShowCaseSelectModal(true);
                          event.target.value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              </section>

              {/* Filters */}
              <section className="space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className={`flex-1 rounded-2xl border ${borderColor} px-4 py-2 flex items-center gap-3 ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                    <svg className={`w-5 h-5 ${subColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h18M6 12h12M10 19h4" />
                    </svg>
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder={t('files.searchPlaceholder')}
                      className="flex-1 bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[t('files.allFiles'), t('files.aiDrafts'), t('files.evidence'), t('files.clientNotes')].map((chip) => (
                      <button
                        key={chip}
                        onClick={() => setActiveFilter(chip)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${activeFilter === chip
                          ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200'
                          : isLight
                            ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'border-white/15 text-white/80 hover:bg-white/10'
                          }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Folder quick access - Dynamic from cases */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {useMemo(() => {
                  // Create folders from cases
                  const foldersMap = new Map<string, number>();

                  // Count files per case
                  fileItems.forEach((file) => {
                    if (file.caseId && file.caseId !== 'Unassigned') {
                      const count = foldersMap.get(file.caseId) || 0;
                      foldersMap.set(file.caseId, count + 1);
                    }
                  });

                  // Get case names
                  const caseFolders: Array<{ name: string; count: number; caseId: string }> = [];
                  mcds.forEach((mcd) => {
                    const caseName = `${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`;
                    const count = foldersMap.get(mcd.case_id) || 0;
                    if (count > 0) {
                      caseFolders.push({ name: caseName, count, caseId: mcd.case_id });
                    }
                  });

                  dashboardCases.forEach((dc) => {
                    const count = foldersMap.get(dc.case_id) || 0;
                    if (count > 0) {
                      caseFolders.push({ name: dc.client, count, caseId: dc.case_id });
                    }
                  });

                  const folders = caseFolders.slice(0, 6); // Limit to 6 folders

                  if (folders.length === 0) {
                    return (
                      <div className={`rounded-2xl border ${borderColor} px-4 py-3 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                        <p className={`text-sm ${subColor}`}>{t('files.noCaseFolders')}</p>
                      </div>
                    );
                  }

                  return folders.map((folder) => (
                    <div
                      key={folder.caseId}
                      className={`rounded-2xl border ${borderColor} px-4 py-3 ${isLight ? 'bg-slate-50' : 'bg-white/5'} flex flex-col gap-2 cursor-pointer hover:bg-white/10 transition`}
                      onClick={() => {
                        setSearchTerm(folder.caseId);
                        setActiveFilter('All files');
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <p className={`font-semibold ${headerColor} truncate`}>{folder.name}</p>
                        <span className="text-xs text-emerald-400 flex-shrink-0 ml-2">{folder.count} {t('files.files')}</span>
                      </div>
                      <p className={`text-xs ${subColor}`}>Case: {folder.caseId}</p>
                    </div>
                  ));
                }, [fileItems, mcds, dashboardCases, borderColor, isLight, headerColor, subColor])}
              </section>

              {/* File table */}
              <section className="rounded-2xl border border-white/10 overflow-hidden">
                <div className={`overflow-x-auto ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                  <table className="min-w-full text-sm">
                    <thead className={isLight ? 'bg-slate-50 text-slate-500' : 'bg-white/10 text-slate-200'}>
                      <tr>
                        {[t('files.name'), t('files.case'), t('files.owner'), t('files.updated'), t('files.size'), t('files.actions')].map((head) => (
                          <th key={head} className="px-4 py-3 text-left font-semibold">
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                            {t('files.loadingFiles')}
                          </td>
                        </tr>
                      ) : filteredFiles.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                            {searchTerm
                              ? `${t('files.noFilesMatch')} "${searchTerm}". ${t('files.tryDifferentSearch')}`
                              : t('files.noFilesFound')}
                          </td>
                        </tr>
                      ) : (
                        paginatedFiles.map((file) => (
                          <tr
                            key={file.id}
                            className={`${isLight ? 'bg-white' : 'bg-transparent'} cursor-pointer hover:bg-white/10 transition`}
                            onClick={() => setSelectedFile(file)}
                          >
                            <td className="px-4 py-3">
                              <p className={`font-semibold ${headerColor}`}>{file.name}</p>
                              <p className={`text-xs ${subColor}`}>{file.type}</p>
                            </td>
                            <td className="px-4 py-3">
                              {file.caseId !== 'Unassigned' ? (
                                <span className="text-emerald-400">{file.caseId}</span>
                              ) : (
                                <span className={subColor}>—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">{file.owner}</td>
                            <td className="px-4 py-3">{file.updated}</td>
                            <td className="px-4 py-3">{file.size}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 transition"
                                  onClick={() => {
                                    setSelectedFile(file);
                                    showToast(`${t('files.opened')} ${file.name}`, 'success');
                                  }}
                                >
                                  {t('common.view')}
                                </button>
                                {(file.source === 'extracted' || (file.source === 'mcd' && file.caseId && file.caseId !== 'Unassigned')) && (
                                  <button
                                    className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 transition"
                                    onClick={async () => {
                                      if (confirm(`Delete ${file.name}?`)) {
                                        try {
                                          if (file.source === 'extracted' && file.textId) {
                                            // Delete ExtractedText file
                                            await deleteExtractedText(file.textId);
                                          } else if (file.source === 'mcd' && file.caseId && file.caseId !== 'Unassigned') {
                                            // Delete file from case folder
                                            await caseFilesClient.deleteFile(file.caseId, file.name);
                                          }
                                          showToast(`Deleted ${file.name}`, 'success');
                                          await fetchFiles();
                                          if (selectedFile?.id === file.id) {
                                            setSelectedFile(null);
                                          }
                                        } catch (error) {
                                          showToast('Failed to delete file', 'error');
                                        }
                                      }
                                    }}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination controls */}
                {!loading && filteredFiles.length > 0 && (
                  <div className={`flex items-center justify-between px-4 py-3 border-t ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Showing {(currentPage * FILES_PER_PAGE) + 1}–{Math.min((currentPage + 1) * FILES_PER_PAGE, filteredFiles.length)} of {filteredFiles.length}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isLight
                          ? 'border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
                          : 'border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
                          }`}
                        disabled={currentPage === 0}
                        onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                      >
                        Previous
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isLight
                          ? 'border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
                          : 'border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
                          }`}
                        disabled={currentPage >= totalPages - 1}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Preview + activity */}
              <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className={`rounded-2xl border ${borderColor} ${isLight ? 'bg-white' : 'bg-white/5'} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className={`text-xs uppercase tracking-[0.3em] ${subColor}`}>Preview</p>
                      <h3 className={`text-lg font-semibold ${headerColor}`}>{selectedFile?.name ?? 'Select a file'}</h3>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button
                        className="px-3 py-1 rounded-full border border-emerald-400 text-emerald-300"
                        onClick={async () => {
                          if (!selectedFile) return;
                          try {
                            if (selectedFile.source === 'mcd' && selectedFile.caseId && selectedFile.caseId !== 'Unassigned') {
                              // Download from case folder
                              const blob = await caseFilesClient.downloadFile(selectedFile.caseId, selectedFile.name);
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = selectedFile.name;
                              link.click();
                              URL.revokeObjectURL(url);
                              showToast(`Downloaded ${selectedFile.name}`, 'success');
                            } else if (selectedFile.source === 'extracted' && selectedFile.extractedText) {
                              // Download ExtractedText as text file
                              const blob = new Blob([selectedFile.extractedText], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `${selectedFile.name}.txt`;
                              link.click();
                              URL.revokeObjectURL(url);
                              showToast(`Downloaded ${selectedFile.name}`, 'success');
                            } else {
                              // Fallback: download summary
                              const blob = new Blob([selectedFile.summary], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `${selectedFile.name}.txt`;
                              link.click();
                              URL.revokeObjectURL(url);
                              showToast(`Downloaded ${selectedFile.name}`, 'success');
                            }
                          } catch (error) {
                            showToast('Failed to download file', 'error');
                          }
                        }}
                      >
                        {t('files.download')}
                      </button>
                      <button
                        className="px-3 py-1 rounded-full border border-white/20 text-white/80"
                        onClick={async () => {
                          if (!selectedFile) return;
                          const payload = {
                            title: selectedFile.name,
                            text: `${t('files.share')} ${selectedFile.name} (${selectedFile.caseId})`,
                          };
                          if (navigator.share) {
                            try {
                              await navigator.share(payload);
                              showToast(t('files.shareSent'), 'success');
                              return;
                            } catch {
                              showToast(t('files.shareCancelled'), 'error');
                              return;
                            }
                          }
                          if (navigator.clipboard) {
                            await navigator.clipboard.writeText(`${payload.title} — ${payload.text}`);
                            showToast(t('files.shareCopied'), 'success');
                          } else {
                            showToast(t('files.shareNotSupported'), 'error');
                          }
                        }}
                      >
                        {t('files.share')}
                      </button>
                    </div>
                  </div>
                  <div className={`rounded-2xl border ${borderColor} p-4 text-sm ${isLight ? 'bg-slate-50' : 'bg-white/5'} space-y-3`}>
                    <p className="font-semibold">{t('files.pepperSummary')}</p>
                    <p className={subColor}>
                      {selectedFile?.extractedText
                        ? selectedFile.extractedText.substring(0, 500) + (selectedFile.extractedText.length > 500 ? '...' : '')
                        : selectedFile?.summary ?? t('files.pickDocument')}
                    </p>
                    {selectedFile && (
                      <p className="text-xs text-emerald-400">
                        {selectedFile.source === 'extracted' ? t('files.extractedText') : t('files.caseDocument')} · {selectedFile.updated}
                      </p>
                    )}
                  </div>
                </div>
                <div className={`rounded-2xl border ${borderColor} ${isLight ? 'bg-white' : 'bg-white/5'} p-4 flex flex-col`}>
                  <h3 className={`text-lg font-semibold mb-3 ${headerColor}`}>{t('files.recentActivity')}</h3>
                  <div
                    ref={activityScrollRef}
                    className="flex-1 overflow-y-auto space-y-3 text-sm scroll-smooth [&::-webkit-scrollbar]:hidden"
                    style={{
                      maxHeight: '400px',
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      padding: '10px'
                    }}
                    onWheel={(e) => {
                      // Allow manual scrolling
                      e.currentTarget.scrollTop += e.deltaY;
                    }}
                  >
                    {mcdLoading ? (
                      <p className={`text-sm ${subColor}`}>{t('files.loadingActivities')}</p>
                    ) : recentActivities.length === 0 ? (
                      <p className={`text-sm ${subColor}`}>{t('files.noRecentActivity')}</p>
                    ) : (
                      recentActivities.map((activity) => (
                        <div
                          key={activity.id}
                          className={`rounded-xl border ${borderColor} px-3 py-2 flex items-center gap-3 ${isLight ? 'bg-slate-50' : 'bg-white/5'} transition hover:scale-[1.02] cursor-pointer `}
                        >
                          <div className="w-8 h-8 min-w-8 rounded-full inline-grid place-items-center bg-emerald-500/20 text-emerald-400">
                            {activity.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold ${headerColor} truncate`}>{activity.message}</p>
                            <p className={`text-xs ${subColor}`}>{activity.time}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-40 rounded-2xl border px-4 py-3 text-sm shadow-lg ${toast.type === 'success'
            ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100'
            : toast.type === 'error'
              ? 'border-rose-400/60 bg-rose-500/10 text-rose-200'
              : 'border-white/20 bg-white/10 text-white'
            }`}
        >
          {toast.message}
        </div>
      )}
      {/* Case Selection Modal */}
      {showCaseSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`rounded-2xl border ${borderColor} ${isLight ? 'bg-white' : 'bg-slate-900'} p-6 max-w-md w-full mx-4 shadow-xl`}>
            <h3 className={`text-xl font-semibold mb-4 ${headerColor}`}>{t('files.selectCaseForUpload')}</h3>
            <p className={`text-sm mb-4 ${subColor}`}>
              {t('files.chooseCaseToUpload')} {pendingFiles.length} {pendingFiles.length > 1 ? t('files.filesPlural') : t('files.file')} {t('files.to')}
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {[
                ...mcds.map(mcd => ({ id: mcd.case_id, name: `${mcd.case_id}: ${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}` })),
                ...dashboardCases.map(dc => ({ id: dc.case_id, name: `${dc.case_id}: ${dc.client}` }))
              ].map((caseItem) => (
                <button
                  key={caseItem.id}
                  onClick={() => setSelectedCaseId(caseItem.id)}
                  className={`w-full text-left px-4 py-2 rounded-lg border transition ${selectedCaseId === caseItem.id
                    ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200'
                    : `${borderColor} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'} ${headerColor}`
                    }`}
                >
                  {caseItem.name}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (!selectedCaseId) {
                    showToast('Please select a case', 'error');
                    return;
                  }

                  try {
                    setUploading(true);
                    setShowCaseSelectModal(false);
                    const result = await caseFilesClient.uploadFiles(selectedCaseId, pendingFiles);

                    if (result.success) {
                      showToast(result.message, 'success');
                      await fetchFiles();
                    } else {
                      showToast('Failed to upload files', 'error');
                    }
                  } catch (error) {
                    console.error('Upload error:', error);
                    showToast(error instanceof Error ? error.message : 'Failed to upload files', 'error');
                  } finally {
                    setUploading(false);
                    setSelectedCaseId('');
                    setPendingFiles([]);
                  }
                }}
                disabled={!selectedCaseId || uploading}
                className="flex-1 rounded-xl bg-[linear-gradient(135deg,_#31d5ff,_#3191ff)] text-white font-semibold px-4 py-2 shadow-[0_10px_25px_rgba(49,149,255,0.35)] hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? t('files.uploading') : t('files.uploadToCase')}
              </button>
              <button
                onClick={() => {
                  setShowCaseSelectModal(false);
                  setSelectedCaseId('');
                  setPendingFiles([]);
                }}
                className="px-4 py-2 rounded-xl border border-white/20 text-white/80 hover:bg-white/10 transition"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(FilesPage);

