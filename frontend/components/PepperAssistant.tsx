'use client';

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={`w-4 h-4 ${className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4h6l1 3h3a1 1 0 011 1v1H5V8a1 1 0 011-1h3l1-3zm1 5v9m4-9v9M6 9h12v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9z" />
  </svg>
);

import { DragEvent, RefObject, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'markdown-to-jsx';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import {
  createThread as createChatThread,
  sendMessageStream as streamChatMessage,
  fetchThreadMessages,
  fetchThreads,
  updateThreadTitle,
  deleteThread as deleteChatThread,
  transcribeAudio as transcribeAudioRequest,
  synthesizeSpeech,
  extractFiles as extractFilesApi,
  extractFilesAndChat,
  detectUserLanguage,
} from '@/lib/chatClient';
import { authClient } from '@/lib/authClient';
import { getExtractedTexts, getExtractedText, ExtractedTextSummary, ExtractedText } from '@/lib/extractionClient';
import { isDashboardTemplateJSON, saveTemplateFromChatResponse } from '@/lib/dashboardAgentUtils';
import { dashboardAgentClient } from '@/lib/dashboardAgentClient';
type UploadSource = 'panel' | 'modal';
type ChatAttachment = {
  id: string;
  name: string;
  ext: string;
};

type ChatMessage = {
  id: string;
  sender: 'pepper' | 'user';
  text: string;
  attachments?: ChatAttachment[];
  audioUrl?: string; // Object URL for voice messages
  audioDuration?: number; // Duration in seconds for voice messages
  createdAt: number;
  sequence: number;
};

type FileAttachment = {
  id: string;
  name: string;
  ext: string;
  source: UploadSource;
  size?: number;
  status: 'pending' | 'extracting' | 'ready' | 'error';
  text?: string;
  error?: string;
  words?: number;
};

const generateMessageId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Greeting text will be created dynamically with translations
const createGreetingMessage = (greetingText: string, sequence: number): ChatMessage => ({
  id: generateMessageId('greeting'),
  sender: 'pepper',
  text: greetingText,
  createdAt: Date.now(),
  sequence,
});

// Sample messages will be created dynamically with translations
const createPanelSampleMessages = (t: (key: string) => string): ChatMessage[] => [
  {
    id: 'sample-1',
    sender: 'pepper',
    text: t('pepperAssistant.sampleMessage1'),
    createdAt: 1,
    sequence: 1,
  },
  {
    id: 'sample-2',
    sender: 'user',
    text: t('pepperAssistant.sampleMessage2'),
    createdAt: 2,
    sequence: 2,
  },
  {
    id: 'sample-3',
    sender: 'pepper',
    text: t('pepperAssistant.sampleMessage3'),
    createdAt: 3,
    sequence: 3,
  },
];

// Scenario options will be created dynamically with translations
const createScenarioOptions = (t: (key: string) => string) => [
  {
    id: 'text-analysis',
    label: t('pepperAssistant.textAnalysis'),
    description: t('pepperAssistant.textAnalysisDesc'),
    accent: 'from-sky-500/90 to-cyan-500/80',
  },
  {
    id: 'jurisprudence',
    label: t('pepperAssistant.jurisprudence'),
    description: t('pepperAssistant.jurisprudenceDesc'),
    accent: 'from-indigo-500/90 to-purple-500/80',
  },
  {
    id: 'legal-writing',
    label: t('pepperAssistant.legalWriting'),
    description: t('pepperAssistant.legalWritingDesc'),
    accent: 'from-emerald-500/90 to-teal-500/80',
  },
  {
    id: 'dashboard-agent',
    label: t('pepperAssistant.dashboardAgent'),
    description: t('pepperAssistant.dashboardAgentDesc'),
    accent: 'from-orange-500/90 to-red-500/80',
  },
];

const SUPPORTED_FILE_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'csv', 'rtf'];
const ACCEPTED_FILE_TYPES = SUPPORTED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',');
const MAX_UPLOAD_FILE_SIZE = 12 * 1024 * 1024; // 12MB

// Voice message player component
const VoiceMessagePlayer = ({
  audioUrl,
  duration,
  isLight,
  isUser,
  t,
}: {
  audioUrl: string;
  duration?: number;
  isLight: boolean;
  isUser: boolean;
  t: (key: string) => string;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setAudioDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;
  const displayDuration = audioDuration || duration || 0;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-[12px] max-w-[80%] ${isUser
        ? isLight
          ? 'bg-emerald-500/90 text-slate-900 self-end'
          : 'bg-[linear-gradient(180deg,#57a69082,#0b6c51)] text-[#e6fff6] self-end'
        : isLight
          ? 'bg-slate-50 border border-slate-200 text-slate-900 self-start'
          : 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.06)] text-[#eaf0fb] self-start'
        }`}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        onClick={togglePlay}
        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isUser
          ? isLight
            ? 'bg-white/20 hover:bg-white/30 text-slate-900'
            : 'bg-white/20 hover:bg-white/30 text-[#e6fff6]'
          : isLight
            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-slate-900'
            : 'bg-white/10 hover:bg-white/20 text-[#eaf0fb]'
          }`}
        aria-label={isPlaying ? t('pepperAssistant.pause') : t('pepperAssistant.play')}
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="relative h-1.5 rounded-full overflow-hidden bg-white/20">
          <div
            className={`absolute top-0 left-0 h-full rounded-full transition-all ${isUser
              ? isLight
                ? 'bg-slate-900'
                : 'bg-[#e6fff6]'
              : isLight
                ? 'bg-emerald-500'
                : 'bg-[#eaf0fb]'
              }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={isUser && isLight ? 'text-slate-700' : 'text-white/80'}>
            {formatTime(currentTime)}
          </span>
          <span className={isUser && isLight ? 'text-slate-700' : 'text-white/80'}>
            {formatTime(displayDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function PepperAssistant() {
  const { themeMode, layoutDensity } = useThemeMode();
  const { user } = useAuth();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const [avatarError, setAvatarError] = useState<{ [key: string]: boolean }>({});
  const panelSampleMessages = useMemo(() => createPanelSampleMessages(t), [t]);
  const messageSequenceRef = useRef(panelSampleMessages.length);

  // Reset avatar errors when user changes (e.g., after profile update)
  useEffect(() => {
    setAvatarError({});
  }, [user?.avatarUrl, user?.displayName, user?.firstName, user?.lastName]);

  const nextSequence = () => {
    messageSequenceRef.current += 1;
    return messageSequenceRef.current;
  };
  const [isMounted, setIsMounted] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showChatModal, setShowChatModal] = useState(false);
  const [activeRecordingSource, setActiveRecordingSource] = useState<UploadSource | null>(null);
  const [showThreadsMobile, setShowThreadsMobile] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createGreetingMessage(t('pepperAssistant.greeting'), nextSequence())]);
  const [inputValues, setInputValues] = useState<Record<UploadSource, string>>({
    panel: '',
    modal: '',
  });
  const [threads, setThreads] = useState<{ id: string; title: string; updated: string; scenario?: string }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [uploadSummary, setUploadSummary] = useState<Record<UploadSource, string | undefined>>({
    panel: undefined,
    modal: undefined,
  });
  const [attachments, setAttachments] = useState<Record<UploadSource, FileAttachment[]>>({
    panel: [],
    modal: [],
  });
  const [dragOverlay, setDragOverlay] = useState<Record<UploadSource, boolean>>({
    panel: false,
    modal: false,
  });
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [savedCaseId, setSavedCaseId] = useState<string | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const [pendingTitleThreadId, setPendingTitleThreadId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [transcribingSource, setTranscribingSource] = useState<UploadSource | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileUploadMessage, setFileUploadMessage] = useState('');
  const [availableExtractedTexts, setAvailableExtractedTexts] = useState<ExtractedTextSummary[]>([]);
  const [selectedExtractedTextIds, setSelectedExtractedTextIds] = useState<string[]>([]);
  const [showExtractedTextSelector, setShowExtractedTextSelector] = useState(false);
  const [loadingExtractedTexts, setLoadingExtractedTexts] = useState(false);
  const [extractedTextModal, setExtractedTextModal] = useState<{
    type: 'voice' | 'doc' | 'image';
    textId: string;
    sourceName: string;
  } | null>(null);
  const [extractedTextContent, setExtractedTextContent] = useState<string | null>(null);
  const [loadingExtractedTextContent, setLoadingExtractedTextContent] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const pendingVoiceBlobRef = useRef<Record<UploadSource, { blob: Blob; duration: number } | null>>({
    panel: null,
    modal: null,
  });
  const audioUrlCacheRef = useRef<Set<string>>(new Set());
  const ttsCacheRef = useRef<Map<string, string>>(new Map());
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const pendingAutoMessagesRef = useRef<Map<string, string>>(new Map());

  const formatTimestamp = useCallback((value?: string | number | Date | null) => {
    if (!value) return 'Just now';
    try {
      const date = new Date(value);
      return date.toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return 'Just now';
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      ttsCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      ttsCacheRef.current.clear();
      // Cleanup all audio URLs
      audioUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioUrlCacheRef.current.clear();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = '';
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (panelMessagesRef.current) {
      panelMessagesRef.current.scrollTop = panelMessagesRef.current.scrollHeight;
    }
  }, [messages, attachments.panel]);

  useEffect(() => {
    if (modalMessagesRef.current) {
      modalMessagesRef.current.scrollTop = modalMessagesRef.current.scrollHeight;
    }
  }, [messages, attachments.modal]);

  // Auto-scroll to bottom when streaming starts or streamedText updates in modal
  useEffect(() => {
    if (isStreaming && modalMessagesRef.current) {
      // Small delay to ensure DOM is updated
      const timeoutId = setTimeout(() => {
        modalMessagesRef.current?.scrollTo({
          top: modalMessagesRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isStreaming, streamedText]);
  const panelUploadRef = useRef<HTMLInputElement | null>(null);
  const modalUploadRef = useRef<HTMLInputElement | null>(null);
  const panelMessagesRef = useRef<HTMLDivElement>(null);
  const modalMessagesRef = useRef<HTMLDivElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (activeRecordingSource) {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      recordingIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } else if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [activeRecordingSource]);

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (activeRecordingSource) {
      setActiveRecordingSource(null);
    }
  };

  const startRecording = async (source: UploadSource) => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setUiMessage(t('pepperAssistant.browserNoVoice'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        const recordingSource = activeRecordingSource;
        const duration = recordSeconds;
        setActiveRecordingSource(null);
        if (!chunks.length) {
          return;
        }
        const blob = new Blob(chunks, { type: preferredMime });
        // Store the blob for use in auto-send
        if (recordingSource) {
          pendingVoiceBlobRef.current[recordingSource] = { blob, duration };
        }

        // Immediately display the voice message on user's side
        // Format duration helper
        const formatDuration = (secs: number) => {
          const mins = Math.floor(secs / 60).toString().padStart(2, '0');
          const sec = (secs % 60).toString().padStart(2, '0');
          return `${mins}:${sec}`;
        };

        if (recordingSource) {
          const timestamp = Date.now();
          // Use timestamp-based ID for better retrieval from history
          const messageId = generateMessageId(`${recordingSource}-voice`);
          // Also store with timestamp for history lookup
          const timestampKey = `${recordingSource}-voice-${timestamp}`;
          const audioUrl = URL.createObjectURL(blob);
          audioUrlCacheRef.current.add(audioUrl);

          // Store audio blob with both the message ID and timestamp key
          storeAudioBlob(messageId, blob).catch(console.error);
          storeAudioBlob(timestampKey, blob).catch(console.error);

          // Add voice message to chat immediately (even if no active thread, for display)
          setMessages((prev) => [
            ...prev,
            {
              id: messageId,
              sender: 'user',
              text: `🎙️ ${t('pepperAssistant.voiceMemo')} (${formatDuration(duration)})`,
              audioUrl,
              audioDuration: duration,
              createdAt: timestamp,
              sequence: nextSequence(),
            },
          ]);
        }

        // Transcribe and send in background (only if we have active scenario and thread)
        if (activeScenario && activeThreadId) {
          handleTranscriptionRequest(source, blob);
        } else {
          // If no active thread, just clear the pending blob
          pendingVoiceBlobRef.current[source] = null;
        }
      };
      mediaRecorderRef.current = recorder;
      setRecordSeconds(0);
      setActiveRecordingSource(source);
      recorder.start(200);
    } catch (error) {
      console.error('startRecording error', error);
      setUiMessage(t('pepperAssistant.microphoneAccess'));
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      setActiveRecordingSource(null);
    }
  };

  const getAuthToken = () => authClient.getStoredAccessToken();

  const forceLogout = useCallback(() => {
    setUiMessage(t('pepperAssistant.sessionExpired'));
    authClient.clearSession?.();
    window.location.href = '/login';
  }, []);

  const ensureAuthToken = async () => {
    let token = getAuthToken();
    if (token) return token;
    try {
      await authClient.refreshSession();
      token = getAuthToken();
      return token;
    } catch {
      forceLogout();
      return null;
    }
  };


  const abortStreaming = () => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    setIsStreaming(false);
    setStreamedText('');
  };

  const toggleRecording = async (source: UploadSource) => {
    if (activeRecordingSource === source) {
      stopRecording();
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopRecording();
    }
    await startRecording(source);
  };

  const handleUploadButtonClick = (source: UploadSource) => {
    const ref = source === 'panel' ? panelUploadRef : modalUploadRef;
    ref.current?.click();
  };

  const dragHasFiles = (event: DragEvent) => {
    const types = event.dataTransfer?.types;
    return Boolean(types && Array.from(types).includes('Files'));
  };

  useEffect(() => {
    return () => {
      abortStreaming();
    };
  }, []);

  const loadThreadsFromServer = useCallback(async () => {
    if (!user?.email) return;
    setThreadsLoading(true);
    const token = await ensureAuthToken();
    if (!token) {
      setThreadsLoading(false);
      return;
    }
    try {
      const response = await fetchThreads(token);
      const mapped = (response.threads || []).map((thread: any) => {
        const scenario = thread.scenario || 'text-analysis';
        const fallbackTitle = `${getScenarioLabel(scenario)} • ${formatTimestamp(thread.updatedAt)}`;
        const cleanTitle =
          typeof thread.title === 'string' && thread.title.trim().length ? thread.title.trim() : fallbackTitle;
        return {
          id: thread.threadId,
          title: cleanTitle,
          updated: formatTimestamp(thread.updatedAt),
          scenario,
        };
      });
      setThreads(mapped);
    } catch (error) {
      setUiMessage((error as Error)?.message || 'No se pudo cargar el historial de conversaciones.');
    } finally {
      setThreadsLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    loadThreadsFromServer();
  }, [user?.email, loadThreadsFromServer]);

  // Load extracted texts when modal opens
  useEffect(() => {
    if (showChatModal && activeScenario && activeThreadId) {
      loadExtractedTexts();
    }
  }, [showChatModal, activeScenario, activeThreadId]);

  const loadExtractedTexts = async () => {
    setLoadingExtractedTexts(true);
    try {
      const result = await getExtractedTexts({ limit: 20 });
      if (result.success) {
        setAvailableExtractedTexts(result.extractedTexts);
      }
    } catch (error) {
      console.error('Error loading extracted texts:', error);
    } finally {
      setLoadingExtractedTexts(false);
    }
  };

  const toggleExtractedText = (textId: string) => {
    setSelectedExtractedTextIds((prev) => {
      if (prev.includes(textId)) {
        return prev.filter((id) => id !== textId);
      } else {
        return [...prev, textId];
      }
    });
  };

  const removeExtractedText = (textId: string) => {
    setSelectedExtractedTextIds((prev) => prev.filter((id) => id !== textId));
  };

  // Helper to determine file type from sourceName
  const getFileType = (sourceName: string): 'voice' | 'doc' | 'image' => {
    const ext = sourceName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
      return 'image';
    }
    if (['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'rtf'].includes(ext)) {
      return 'doc';
    }
    return 'voice'; // Default for voice recordings
  };

  // Handle opening modals for different types
  const handleOpenExtractedTextModal = async (textId: string, sourceName: string, source: 'voice' | 'file') => {
    const type = source === 'voice' ? 'voice' : getFileType(sourceName);
    setExtractedTextModal({ type, textId, sourceName });
    setExtractedTextContent(null);
    setLoadingExtractedTextContent(true);

    try {
      const result = await getExtractedText(textId);
      if (result.success && result.extractedText) {
        setExtractedTextContent(result.extractedText.extractedText);
      }
    } catch (error) {
      console.error('Error loading extracted text content:', error);
    } finally {
      setLoadingExtractedTextContent(false);
    }
  };

  const handleCloseExtractedTextModal = () => {
    setExtractedTextModal(null);
    setExtractedTextContent(null);
  };

  const handleDragEnter = (source: UploadSource, event: DragEvent) => {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDragOverlay((prev) => ({ ...prev, [source]: true }));
  };

  const handleDragOver = (source: UploadSource, event: DragEvent) => {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (source: UploadSource, event: DragEvent) => {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    const current = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (next && current.contains(next)) {
      return;
    }
    setDragOverlay((prev) => ({ ...prev, [source]: false }));
  };

  const handleDrop = (source: UploadSource, event: DragEvent) => {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDragOverlay((prev) => ({ ...prev, [source]: false }));
    void handleFilesSelected(source, event.dataTransfer?.files ?? null);
  };

  const handleFilesSelected = async (source: UploadSource, files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    if (!activeScenario || !activeThreadId) {
      setUiMessage('Selecciona un agente antes de adjuntar documentos.');
      return;
    }
    const accepted: File[] = [];
    const rejected: string[] = [];
    const oversized: string[] = [];

    Array.from(files).forEach((file) => {
      const ext = getFileExtension(file.name);
      if (!SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
        rejected.push(file.name);
        return;
      }
      if (file.size > MAX_UPLOAD_FILE_SIZE) {
        oversized.push(file.name);
        return;
      }
      accepted.push(file);
    });

    if (rejected.length) {
      setUiMessage(`Formato no admitido: ${rejected.join(', ')}.`);
    }
    if (oversized.length) {
      setUiMessage(
        `Algunos archivos superan el límite de 12MB: ${oversized
          .map((name) => `"${name}"`)
          .join(', ')}.`,
      );
    }
    if (!accepted.length) {
      return;
    }

    // For modal uploads, show the file upload preview modal
    if (source === 'modal') {
      setPendingFiles(accepted);
      setFileUploadMessage('');
      setShowFileUploadModal(true);
      return;
    }

    // For panel uploads, use the regular extraction endpoint
    const summary =
      accepted.length === 1 ? accepted[0].name : `${accepted[0].name} +${accepted.length - 1}`;
    setUploadSummary((prev) => ({
      ...prev,
      [source]: summary,
    }));

    const tempAttachments = accepted.map((file) => ({
      id: `${source}-${file.name}-${Date.now()}-${Math.random()}`,
      name: file.name,
      ext: getFileExtension(file.name),
      source,
      size: file.size,
      status: 'extracting' as const,
    }));

    const tempIds = tempAttachments.map((attachment) => attachment.id);

    setAttachments((prev) => ({
      ...prev,
      [source]: [...prev[source], ...tempAttachments],
    }));

    const token = await ensureAuthToken();
    if (!token) {
      setAttachments((prev) => ({
        ...prev,
        [source]: prev[source].map((attachment) =>
          tempIds.includes(attachment.id)
            ? { ...attachment, status: 'error', error: 'Sesión expirada.' }
            : attachment,
        ),
      }));
      return;
    }

    try {
      // For panel uploads, use the regular extraction endpoint
      const response = await extractFilesApi(token, accepted, activeScenario);
      const extracted = Array.isArray(response?.files) ? response.files : [];
      setAttachments((prev) => {
        const updated = prev[source]
          .map((attachment) => {
            const position = tempIds.indexOf(attachment.id);
            if (position === -1) {
              return attachment;
            }
            const result = extracted[position];
            if (!result) {
              return {
                ...attachment,
                status: 'error',
                error: 'No se recibió respuesta de extracción.',
              };
            }
            if (result.status === 'error') {
              return {
                ...attachment,
                status: 'error',
                error: result.error || 'No se pudo extraer el texto.',
              };
            }
            return {
              ...attachment,
              status: 'ready',
              text: result.text,
              words: result.wordCount,
              size: result.size ?? attachment.size,
            };
          })
          .filter((attachment): attachment is FileAttachment => Boolean(attachment));
        return {
          ...prev,
          [source]: updated,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo procesar el archivo.';
      setUiMessage(message);
      setAttachments((prev) => ({
        ...prev,
        [source]: prev[source].map((attachment) =>
          tempIds.includes(attachment.id)
            ? { ...attachment, status: 'error', error: message }
            : attachment,
        ),
      }));
    }
  };

  const handleSendFilesFromModal = async () => {
    if (!pendingFiles.length || !activeScenario) {
      return;
    }

    const token = await ensureAuthToken();
    if (!token) {
      return;
    }

    // Create thread lazily if we have scenario but no threadId yet
    let threadIdToUse = activeThreadId;
    if (!threadIdToUse) {
      try {
        console.log('[PepperAssistant] Creating thread lazily for file upload, scenario:', activeScenario);
        const { threadId } = await createChatThread(token, activeScenario);
        threadIdToUse = threadId;
        setActiveThreadId(threadId);
        setPendingTitleThreadId(threadId);
        console.log('[PepperAssistant] Thread created for file upload:', threadId);
      } catch (error) {
        console.error('[PepperAssistant] Error creating thread for file upload:', error);
        const message = error instanceof Error ? error.message : 'No se pudo crear la conversación.';
        setUiMessage(message);
        return;
      }
    }

    // Close modal
    setShowFileUploadModal(false);

    const hasText = fileUploadMessage.trim().length > 0;
    const fileAttachments = pendingFiles.map((file) => ({
      id: generateMessageId(`file-${file.name}`),
      name: file.name,
      ext: getFileExtension(file.name),
    }));

    // Show file attachment message (only files, no text)
    const fileMessage: ChatMessage = {
      id: generateMessageId('file-upload'),
      sender: 'user',
      text: '', // No text in file message
      attachments: fileAttachments,
      createdAt: Date.now(),
      sequence: nextSequence(),
    };
    setMessages((prev) => [...prev, fileMessage]);

    // If user provided text, show it as a separate message immediately
    if (hasText) {
      const textMessage: ChatMessage = {
        id: generateMessageId('user-text'),
        sender: 'user',
        text: fileUploadMessage.trim(),
        createdAt: Date.now(),
        sequence: nextSequence(),
      };
      setMessages((prev) => [...prev, textMessage]);
    }

    setIsStreaming(true);
    setStreamedText('');
    setUiMessage(null);

    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      // Ensure threadIdToUse is not null (should be guaranteed by code above)
      if (!threadIdToUse) {
        throw new Error('Thread ID is required but was not created');
      }
      const finalReply = await extractFilesAndChat({
        token,
        files: pendingFiles,
        threadId: threadIdToUse,
        scenario: activeScenario,
        userMessage: hasText ? fileUploadMessage.trim() : undefined, // Pass text if provided
        signal: controller.signal,
        onDelta: (partial) => setStreamedText(partial),
      });

      if (finalReply.trim().length) {
        // Thread was successfully used - show naming modal if this is a new thread
        // Don't add thread to list yet - wait for user to name it or click "later"
        if (pendingTitleThreadId === threadIdToUse) {
          setShowTitleModal(true);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId('assistant'),
            sender: 'pepper',
            text: finalReply,
            createdAt: Date.now(),
            sequence: nextSequence(),
          },
        ]);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        const message = error instanceof Error ? error.message : 'No se pudo obtener respuesta.';
        setUiMessage(message);
      }
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
      setIsStreaming(false);
      setStreamedText('');
      setPendingFiles([]);
      setFileUploadMessage('');
    }
  };

  const handleInsertAttachmentText = (attachment: FileAttachment, source: UploadSource) => {
    if (!attachment?.text) return;
    setInputValues((prev) => {
      const current = prev[source]?.trim();
      const nextValue = current ? `${current}\n\n${attachment.text}` : attachment.text;
      return {
        ...prev,
        [source]: nextValue,
      };
    });
  };

  const handleOpenChat = () => {
    abortStreaming();
    setActiveScenario(null);
    setActiveThreadId(null);
    setUiMessage(null);
    setShowChatModal(true);
    setShowThreadsMobile(false);
  };

  const hydrateThreadFromHistory = useCallback(async (fetchedMessages: any[]) => {
    messageSequenceRef.current = fetchedMessages.length;
    const normalized: ChatMessage[] = await Promise.all(
      fetchedMessages.map(async (msg, index) => {
        const textValue = Array.isArray(msg.content)
          ? msg.content.map((chunk: any) => chunk?.text?.value ?? chunk?.text ?? '').join(' ').trim()
          : msg.text || '';
        // Extract attachments from the message
        const msgAttachments: ChatAttachment[] = Array.isArray(msg.attachments)
          ? msg.attachments.map((att: any) => ({
            id: generateMessageId(`att-${att.name}-${index}`),
            name: att.name || '',
            ext: att.ext || '',
          }))
          : [];

        const messageId = `history-${msg.role}-${index}`;
        let audioUrl: string | undefined;
        let audioDuration: number | undefined;

        // Check if this is a voice message
        // Voice messages might have:
        // 1. The voice memo indicator in text
        // 2. A flag in the message metadata
        // 3. Audio data attached
        // 4. Or we need to check if there's an audio blob stored for this message
        const hasVoiceIndicator = textValue.includes('🎙️ Voice memo');
        const hasAudioMetadata = msg.audioUrl || msg.audioBlob || msg.isVoiceMessage;

        // For user messages, check if there's an audio blob stored
        // We'll try to find it using the timestamp
        let isVoiceMessage = hasVoiceIndicator || hasAudioMetadata;

        // If it's a user message and we have a timestamp, check if there's an audio blob
        if (!isVoiceMessage && msg.role === 'user' && msg.timestamp) {
          const timestamp = new Date(msg.timestamp).getTime();
          // Try to find audio blob by timestamp-based IDs
          const possibleIds = [
            `panel-voice-${timestamp}`,
            `modal-voice-${timestamp}`,
            // Also try with the actual message ID format that might have been used
            messageId,
          ];
          for (const id of possibleIds) {
            const testBlob = await getAudioBlob(id);
            if (testBlob) {
              isVoiceMessage = true;
              break;
            }
          }
        }

        if (isVoiceMessage) {
          // Try multiple strategies to find the audio blob:
          // 1. Try with the current message ID
          let audioBlob = await getAudioBlob(messageId);

          // 2. Try with timestamp-based IDs if available
          if (!audioBlob && msg.timestamp) {
            const timestamp = new Date(msg.timestamp).getTime();
            // Try various ID formats that might have been used when storing
            const possibleIds = [
              `panel-voice-${timestamp}`,
              `modal-voice-${timestamp}`,
              // Also try with generateMessageId format (which uses Date.now())
              // We need to search all stored keys that might match
            ];
            for (const id of possibleIds) {
              audioBlob = await getAudioBlob(id);
              if (audioBlob) break;
            }
          }

          // 3. If still not found, try searching all audio blobs by timestamp range
          if (!audioBlob && msg.timestamp) {
            const timestamp = new Date(msg.timestamp).getTime();
            // Search within a 5 second window (voice messages are usually quick)
            const timeWindow = 5000;
            audioBlob = await searchAudioBlobByTimestamp(timestamp, timeWindow);
          }

          if (audioBlob) {
            audioUrl = URL.createObjectURL(audioBlob);
            audioUrlCacheRef.current.add(audioUrl);
            // Try to get duration from message or calculate it
            if (msg.audioDuration) {
              audioDuration = msg.audioDuration;
            } else {
              // Try to get duration from audio blob metadata
              try {
                const audio = new Audio();
                audio.src = audioUrl;
                await new Promise((resolve, reject) => {
                  audio.onloadedmetadata = () => {
                    audioDuration = audio.duration;
                    resolve(audioDuration);
                  };
                  audio.onerror = reject;
                  // Timeout after 2 seconds
                  setTimeout(() => resolve(undefined), 2000);
                });
              } catch (e) {
                // Ignore errors
              }
            }
          }
        }

        return {
          id: messageId,
          sender: msg.role === 'assistant' ? 'pepper' : 'user',
          text: textValue,
          attachments: msgAttachments.length > 0 ? msgAttachments : undefined,
          audioUrl,
          audioDuration,
          createdAt: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now() + index,
          sequence: index + 1,
        };
      })
    );
    setMessages(normalized.length ? normalized : [createGreetingMessage(t('pepperAssistant.greeting'), nextSequence())]);
  }, []);

  /**
   * Unified function to add thread to list with a title
   * Only adds thread if it doesn't already exist in the list
   * Saves title to server and refreshes thread list
   */
  const addThreadToListWithTitle = useCallback(async (threadId: string, title: string) => {
    // Update thread in local state (add if new, update if exists)
    setThreads((prev) => {
      const threadExists = prev.some(t => t.id === threadId);

      if (!threadExists) {
        // Add thread to local state first
        return [
          {
            id: threadId,
            title: title,
            updated: formatTimestamp(Date.now()),
            scenario: activeScenario || undefined,
          },
          ...prev.filter((thread) => thread.id !== threadId),
        ];
      } else {
        // Update existing thread title
        return prev.map((thread) => (thread.id === threadId ? { ...thread, title: title, updated: 'Just now' } : thread));
      }
    });

    // Save title to server
    const token = await ensureAuthToken();
    if (!token) {
      return;
    }
    try {
      await updateThreadTitle(token, threadId, title);
      // Refresh threads from server to get accurate data
      await loadThreadsFromServer();
    } catch (error) {
      console.error('[PepperAssistant] Error saving thread title:', error);
      setUiMessage((error as Error)?.message || 'No se pudo guardar el nombre de la conversación.');
    }
  }, [activeScenario, formatTimestamp, loadThreadsFromServer]);

  const handleSaveTitle = async () => {
    if (!pendingTitleThreadId) {
      setShowTitleModal(false);
      setNewTitle('');
      return;
    }
    const trimmed = newTitle.trim();
    const threadId = pendingTitleThreadId;
    setShowTitleModal(false);
    setPendingTitleThreadId(null);
    if (!trimmed) {
      setNewTitle('');
      return;
    }
    setNewTitle('');
    // Use unified function to add/update thread with custom title
    await addThreadToListWithTitle(threadId, trimmed);
  };

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const token = await ensureAuthToken();
      if (!token) {
        return;
      }
      try {
        await deleteChatThread(token, threadId);
        setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
        if (activeThreadId === threadId) {
          resetConversationState();
          setActiveThreadId(null);
          setActiveScenario(null);
        }
        await loadThreadsFromServer();
      } catch (error) {
        setUiMessage((error as Error)?.message || 'No se pudo eliminar la conversación.');
      }
    },
    [activeThreadId, loadThreadsFromServer],
  );

  const openExistingThread = useCallback(
    async (thread: { id: string; scenario?: string }) => {
      abortStreaming();
      setIsStreaming(false);
      setStreamedText('');
      setShowTitleModal(false);
      setPendingTitleThreadId(null);
      setActiveThreadId(thread.id);
      setActiveScenario(thread.scenario || 'text-analysis');
      setUiMessage(null);
      setShowThreadsMobile(false);
      setLoadingThreadId(thread.id);
      const token = await ensureAuthToken();
      if (!token) {
        setLoadingThreadId(null);
        setActiveThreadId(null);
        setActiveScenario(null);
        return;
      }
      try {
        const history = await fetchThreadMessages(token, thread.id);
        const fetched = Array.isArray(history?.messages) ? history.messages : [];
        hydrateThreadFromHistory(fetched);
        const scenarioValue = history?.scenario || thread.scenario || 'text-analysis';
        setActiveScenario(scenarioValue);
      } catch (error) {
        setUiMessage(error instanceof Error ? error.message : 'Error loading conversation.');
        setActiveThreadId(null);
        setActiveScenario(null);
      } finally {
        setLoadingThreadId(null);
      }
    },
    [abortStreaming, ensureAuthToken, hydrateThreadFromHistory],
  );

  // IndexedDB helper functions for storing audio blobs
  const storeAudioBlob = async (messageId: string, blob: Blob): Promise<void> => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('pepper-audio-cache', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('audioBlobs')) {
            db.createObjectStore('audioBlobs', { keyPath: 'messageId' });
          }
        };
      });
      const transaction = db.transaction('audioBlobs', 'readwrite');
      const store = transaction.objectStore('audioBlobs');
      await new Promise<void>((resolve, reject) => {
        const request = store.put({ messageId, blob, timestamp: Date.now() });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      db.close();
    } catch (error) {
      console.error('Failed to store audio blob:', error);
    }
  };

  const getAudioBlob = async (messageId: string): Promise<Blob | null> => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('pepper-audio-cache', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('audioBlobs')) {
            db.createObjectStore('audioBlobs', { keyPath: 'messageId' });
          }
        };
      });
      const transaction = db.transaction('audioBlobs', 'readonly');
      const store = transaction.objectStore('audioBlobs');
      const result = await new Promise<any>((resolve, reject) => {
        const request = store.get(messageId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return result?.blob || null;
    } catch (error) {
      console.error('Failed to get audio blob:', error);
      return null;
    }
  };

  // Helper to search for audio blob by timestamp range
  const searchAudioBlobByTimestamp = async (targetTimestamp: number, windowMs: number): Promise<Blob | null> => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('pepper-audio-cache', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('audioBlobs')) {
            db.createObjectStore('audioBlobs', { keyPath: 'messageId' });
          }
        };
      });
      const transaction = db.transaction('audioBlobs', 'readonly');
      const store = transaction.objectStore('audioBlobs');

      return new Promise<Blob | null>((resolve) => {
        const request = store.openCursor();
        const minTime = targetTimestamp - windowMs;
        const maxTime = targetTimestamp + windowMs;
        let closestMatch: { blob: Blob; diff: number } | null = null;

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const record = cursor.value;
            // Check if the timestamp is within the window
            if (record.timestamp >= minTime && record.timestamp <= maxTime) {
              const diff = Math.abs(record.timestamp - targetTimestamp);
              if (!closestMatch || diff < closestMatch.diff) {
                closestMatch = { blob: record.blob, diff };
              }
            }
            cursor.continue();
          } else {
            // No more records, return the closest match
            db.close();
            resolve(closestMatch?.blob || null);
          }
        };
        request.onerror = () => {
          db.close();
          resolve(null);
        };
      });
    } catch (error) {
      console.error('Failed to search audio blob by timestamp:', error);
      return null;
    }
  };


  const playAudioFromUrl = (url: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = '';
    }
    const audio = new Audio(url);
    audioPlayerRef.current = audio;
    audio.play().catch(() => {
      setUiMessage('No pudimos reproducir el audio en este navegador.');
    });
  };

  const handlePlayTts = async (message: ChatMessage) => {
    if (!message?.text || !message.id) return;
    if (!activeScenario || !activeThreadId) {
      setUiMessage('Inicia una conversación para reproducir audio.');
      return;
    }
    const cachedUrl = ttsCacheRef.current.get(message.id);
    if (cachedUrl) {
      playAudioFromUrl(cachedUrl);
      return;
    }
    const token = await ensureAuthToken();
    if (!token) {
      return;
    }
    try {
      setTtsLoadingId(message.id);
      const response = await synthesizeSpeech(token, { text: message.text, language: 'auto' });
      if (!response?.audioContent) {
        throw new Error('Audio vacío');
      }
      const binaryString = globalThis.atob(response.audioContent);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: response.contentType || 'audio/mpeg' });
      const objectUrl = URL.createObjectURL(blob);
      ttsCacheRef.current.set(message.id, objectUrl);
      playAudioFromUrl(objectUrl);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'No se pudo generar el audio.';
      setUiMessage(messageText);
    } finally {
      setTtsLoadingId(null);
    }
  };

  const pushAutoPlaceholder = (attachment: FileAttachment) => {
    if (pendingAutoMessagesRef.current.has(attachment.id)) return;
    const placeholderId = generateMessageId('auto-file');
    pendingAutoMessagesRef.current.set(attachment.id, placeholderId);
    setMessages((prev) => [
      ...prev,
      {
        id: placeholderId,
        sender: 'user',
        text: `📎 ${attachment.name}\nExtrayendo contenido…`,
        attachments: [{ id: attachment.id, name: attachment.name, ext: attachment.ext }],
        createdAt: Date.now(),
        sequence: nextSequence(),
      },
    ]);
  };

  const removeAutoPlaceholder = (attachmentId: string) => {
    const placeholderId = pendingAutoMessagesRef.current.get(attachmentId);
    if (!placeholderId) return;
    pendingAutoMessagesRef.current.delete(attachmentId);
    setMessages((prev) => prev.filter((msg) => msg.id !== placeholderId));
  };

  const markAutoPlaceholderError = (attachmentId: string, errorText: string) => {
    const placeholderId = pendingAutoMessagesRef.current.get(attachmentId);
    if (!placeholderId) return;
    pendingAutoMessagesRef.current.delete(attachmentId);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === placeholderId
          ? {
            ...msg,
            text: `❌ ${msg.attachments?.[0]?.name ?? 'Archivo'}\n${errorText}`,
          }
          : msg,
      ),
    );
  };

  const handleSelectScenario = async (scenarioId: string) => {
    resetConversationState();
    abortStreaming();
    setActiveScenario(null);
    setActiveThreadId(null);
    setSavedCaseId(null); // Reset saved case ID when switching scenarios
    // Don't create thread here - it will be created when user sends first message
    // and Pepper responds. This prevents empty threads from being created.
    setActiveScenario(scenarioId);
    setNewTitle('');
    setPendingTitleThreadId(null); // Will be set when thread is actually created
    setUiMessage(null);
    // Don't add to threads list yet - wait for first response from Pepper
  };

  const getScenarioLabel = (scenarioId: string | null) => {
    if (!scenarioId) return '';
    const scenarioOptions = createScenarioOptions(t);
    return scenarioOptions.find((option) => option.id === scenarioId)?.label ?? scenarioId;
  };

  const resetConversationState = () => {
    messageSequenceRef.current = panelSampleMessages.length;
    setMessages([createGreetingMessage(t('pepperAssistant.greeting'), nextSequence())]);
    setInputValues({ panel: '', modal: '' });
    setUploadSummary({ panel: undefined, modal: undefined });
    setAttachments({ panel: [], modal: [] });
    stopRecording();
  };

  const handleNewConversation = () => {
    resetConversationState();
    setActiveScenario(null);
    setActiveThreadId(null);
    setShowThreadsMobile(false);
  };

  const removeAttachment = (source: UploadSource, id: string) => {
    setAttachments((prev) => ({
      ...prev,
      [source]: prev[source].filter((file) => file.id !== id),
    }));
  };

  const getFileExtension = (name: string) => {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : 'file';
  };

  const getAttachmentIcon = (ext: string) => {
    if (['pdf'].includes(ext)) return '📕';
    if (['doc', 'docx', 'txt'].includes(ext)) return '📄';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['ppt', 'pptx'].includes(ext)) return '📑';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return '🖼️';
    if (['zip', 'rar', '7z'].includes(ext)) return '🗂️';
    return '📎';
  };

  const handleCancelDelete = () => setConfirmDelete(null);

  const sendMessagePayload = useCallback(
    async ({
      source,
      text,
      attachmentsPayload = [],
      audioBlob,
      audioDuration,
      resetInput = false,
      extractedTextIds,
    }: {
      source: UploadSource;
      text: string;
      attachmentsPayload?: { id: string; name: string; ext: string }[];
      audioBlob?: Blob;
      audioDuration?: number;
      resetInput?: boolean;
      extractedTextIds?: string[];
    }) => {
      const trimmedText = text?.trim() ?? '';
      const hasText = Boolean(trimmedText.length);
      const hasAttachments = attachmentsPayload.length > 0;

      // Auto-detect "case" keyword to trigger Dashboard Agent
      if (!activeScenario) {
        if (hasText) {
          const lowerText = trimmedText.toLowerCase();
          // Check if user said "case" or similar keywords
          if (lowerText.includes('case') || lowerText.includes('create case') || lowerText.includes('new case')) {
            // Automatically switch to Dashboard Agent scenario
            handleSelectScenario('dashboard-agent');
            // After scenario is set, continue with sending the message
            // Thread will be created lazily below when we have scenario but no threadId
          } else {
            setUiMessage('Selecciona un agente para continuar.');
            return;
          }
        } else if (!hasAttachments) {
          setUiMessage('Selecciona un agente para continuar.');
          return;
        }
      }

      // Double-check scenario is set after potential auto-switch
      if (!activeScenario) {
        return; // Scenario not set, user needs to select one
      }

      // Create thread lazily if we have scenario but no threadId yet
      // This ensures threads are only created when user actually sends a message
      let threadIdToUse = activeThreadId;
      if (!threadIdToUse) {
        const token = await ensureAuthToken();
        if (!token) {
          return;
        }
        try {
          console.log('[PepperAssistant] Creating thread lazily for scenario:', activeScenario);
          const { threadId } = await createChatThread(token, activeScenario);
          threadIdToUse = threadId;
          setActiveThreadId(threadId);
          setPendingTitleThreadId(threadId);
          console.log('[PepperAssistant] Thread created:', threadId);
        } catch (error) {
          console.error('[PepperAssistant] Error creating thread:', error);
          const message = error instanceof Error ? error.message : 'No se pudo crear la conversación.';
          setUiMessage(message);
          return;
        }
      }

      if (isStreaming) {
        setUiMessage('Espera a que Pepper finalice la respuesta anterior.');
        return;
      }

      if (!hasText && !hasAttachments) {
        return;
      }

      // Check if user wants to update an existing case (Dashboard Agent scenario)
      let enhancedText = trimmedText;
      if (activeScenario === 'dashboard-agent' && hasText) {
        // Try to detect case ID in the message (numeric only, 4+ digits)
        const caseIdMatch = trimmedText.match(/\b(\d{4,})\b/);
        if (caseIdMatch) {
          const potentialCaseId = caseIdMatch[1];
          try {
            // Try to load the existing case
            const caseResult = await dashboardAgentClient.getCase(potentialCaseId);
            if (caseResult.success && caseResult.data) {
              // Case exists - enhance the message to inform the agent
              const existingCase = caseResult.data;
              enhancedText = `[UPDATE MODE: Case ${potentialCaseId} exists. Current case data: Client: ${existingCase.client}, Status: ${existingCase.status}, Stage: ${existingCase.stage}.]\n\n${trimmedText}\n\n[Please update this case with the new information provided above. Merge new data with existing data, preserving important dates, deadlines, and recent activities unless explicitly changed.]`;
              setUiMessage(`📋 Loading existing case "${potentialCaseId}" for update...`);
            }
          } catch (error) {
            // Case doesn't exist or error loading - continue normally (will create new case)
            console.log(`[PepperAssistant] Case ${potentialCaseId} not found or error loading:`, error);
          }
        }
      }

      const outgoing: ChatMessage[] = [];
      const baseTimestamp = Date.now();
      let offset = 0;

      if (hasAttachments) {
        outgoing.push({
          id: generateMessageId(`${source}-attachments`),
          sender: 'user',
          text: '',
          attachments: attachmentsPayload.map(({ id, name, ext }) => ({ id, name, ext })),
          createdAt: baseTimestamp + offset,
          sequence: nextSequence(),
        });
        offset += 1;
      }

      if (hasText) {
        const messageId = generateMessageId(`${source}-text`);
        let audioUrl: string | undefined;
        if (audioBlob) {
          // Store the audio blob in IndexedDB for persistence
          storeAudioBlob(messageId, audioBlob).catch(console.error);
          // Create object URL for the audio blob
          audioUrl = URL.createObjectURL(audioBlob);
          audioUrlCacheRef.current.add(audioUrl);
        }
        outgoing.push({
          id: messageId,
          sender: 'user',
          text: trimmedText,
          audioUrl,
          audioDuration,
          createdAt: baseTimestamp + offset,
          sequence: nextSequence(),
        });
      }

      setMessages((prev) => [...prev, ...outgoing]);
      if (resetInput) {
        setInputValues((prev) => ({ ...prev, [source]: '' }));
      }

      const token = await ensureAuthToken();
      if (!token) {
        return;
      }

      // Ensure we have a threadId (should be set above if it was null)
      if (!threadIdToUse) {
        console.error('[PepperAssistant] No threadId available for sending message');
        setUiMessage('Error: No se pudo crear la conversación. Por favor intenta de nuevo.');
        return;
      }

      setIsStreaming(true);
      setStreamedText('');
      setUiMessage(null);

      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        let lastStreamedText = '';
        const finalReply = await streamChatMessage({
          token,
          threadId: threadIdToUse, // Use the threadId we ensured exists
          scenario: activeScenario,
          text: enhancedText || attachmentsPayload.map((item) => item.name).join(', '),
          extractedTextIds: extractedTextIds || (selectedExtractedTextIds.length > 0 ? selectedExtractedTextIds : undefined),
          signal: controller.signal,
          onDelta: (partial) => {
            // partial is already the accumulated text from sendMessageStream
            lastStreamedText = partial;
            setStreamedText(partial);
          },
        });

        // Get the final text before clearing streaming state
        // Use local variable to ensure we capture the streamed text even if state hasn't updated
        const finalText = finalReply || lastStreamedText;

        console.log('[PepperAssistant] Final text received:', finalText?.substring(0, 200));
        console.log('[PepperAssistant] Active scenario:', activeScenario);
        console.log('[PepperAssistant] Streamed text length:', lastStreamedText?.length || 0);

        // Stop streaming BEFORE adding final message to prevent flickering
        setIsStreaming(false);
        setStreamedText('');

        if (finalText && finalText.trim().length) {
          // Thread was successfully used - show naming modal if this is a new thread
          // Don't add thread to list yet - wait for user to name it or click "later"
          // This ensures threads are only added after user interaction, not automatically
          if (pendingTitleThreadId === threadIdToUse) {
            setShowTitleModal(true);
          }

          // Check if this is a Dashboard Agent JSON response and auto-save
          if (activeScenario === 'dashboard-agent') {
            console.log('[PepperAssistant] ===== Dashboard Agent Response Detected =====');
            console.log('[PepperAssistant] Final text length:', finalText.length);
            console.log('[PepperAssistant] Final text preview:', finalText.substring(0, 500));

            // Check for JSON in the response
            // Only check for actual Dashboard Template JSON (contains 'case_id' and validates)
            const isJSON = isDashboardTemplateJSON(finalText);
            console.log('[PepperAssistant] Is Dashboard Template JSON?', isJSON);

            // Note: We don't do manual extraction anymore because isDashboardTemplateJSON
            // already handles extraction and validation. This prevents false positives
            // from normal conversation messages that might contain curly braces.

            if (isJSON) {
              try {
                console.log('[PepperAssistant] Attempting to save case template...');
                const saveResult = await saveTemplateFromChatResponse(finalText);
                console.log('[PepperAssistant] Save result:', JSON.stringify(saveResult, null, 2));

                if (saveResult.success && saveResult.template) {
                  console.log('[PepperAssistant] ✅ Case saved successfully! Case ID:', saveResult.template.case_id);
                  setSavedCaseId(saveResult.template.case_id);

                  // Build comprehensive success message with proper closure
                  const action = saveResult.isUpdate ? 'updated' : 'created';
                  const hasDeadlines = saveResult.template.deadlines && saveResult.template.deadlines.length > 0;
                  const hasHearing = saveResult.template.hearing && saveResult.template.hearing.toLowerCase() !== 'none';
                  const hasImportantDates = saveResult.template.important_dates && saveResult.template.important_dates.length > 0;
                  const hasCalendarEvents = hasDeadlines || hasHearing || hasImportantDates;

                  const actionText = action === 'created' ? t('pepperAssistant.created') : t('pepperAssistant.updated');
                  let systemMessage = `${t('pepperAssistant.taskCompletedSuccessfully')}\n\n`;
                  systemMessage += `${t('pepperAssistant.caseHasBeenAction').replace('{caseId}', saveResult.template.case_id).replace('{action}', actionText)}\n\n`;

                  systemMessage += `${t('pepperAssistant.whatsBeenDone')}\n`;
                  systemMessage += action === 'created' ? `${t('pepperAssistant.caseCreatedSaved')}\n` : `${t('pepperAssistant.caseUpdatedSaved')}\n`;
                  if (hasCalendarEvents) {
                    systemMessage += t('pepperAssistant.calendarEventsRegisteredColon');
                    const eventTypes = [];
                    if (hasDeadlines) eventTypes.push(`${saveResult.template.deadlines.length} ${saveResult.template.deadlines.length > 1 ? t('pepperAssistant.deadlines') : t('pepperAssistant.deadline')}`);
                    if (hasHearing) eventTypes.push(t('pepperAssistant.hearing'));
                    if (hasImportantDates) eventTypes.push(`${saveResult.template.important_dates.length} ${saveResult.template.important_dates.length > 1 ? t('pepperAssistant.importantDates') : t('pepperAssistant.importantDate')}`);
                    systemMessage += eventTypes.join(', ');
                    systemMessage += `\n`;
                  }
                  systemMessage += `${t('pepperAssistant.masterCaseDocumentGenerated')}\n\n`;

                  systemMessage += `${t('pepperAssistant.downloadYourCaseDocument')}\n`;
                  systemMessage += `${t('pepperAssistant.clickDownloadButton')}\n\n`;

                  systemMessage += `${t('pepperAssistant.howToViewTrack')}\n`;
                  systemMessage += `${t('pepperAssistant.dashboardInfo')}\n`;
                  if (hasCalendarEvents) {
                    systemMessage += `${t('pepperAssistant.calendarInfo')}\n`;
                  }
                  systemMessage += `${t('pepperAssistant.updateLater').replace('{caseId}', saveResult.template.case_id)}\n\n`;

                  systemMessage += `${t('pepperAssistant.createAnotherCase')}\n`;
                  systemMessage += `${t('pepperAssistant.createAnotherCaseDesc')}\n\n`;

                  systemMessage += `${t('pepperAssistant.taskCompletedFooter')}`;

                  // Replace any JSON message with the user-friendly completion message
                  // Don't show JSON to users - only show the completion message
                  const systemMessageId = generateMessageId('system-completion');
                  setMessages((prev) => {
                    // Remove any JSON messages that might have been added
                    const filtered = prev.filter(msg => {
                      // Don't show messages that are pure JSON (Dashboard Agent scenario)
                      if (activeScenario === 'dashboard-agent' && msg.sender === 'pepper') {
                        const isJsonMessage = isDashboardTemplateJSON(msg.text);
                        return !isJsonMessage;
                      }
                      return true;
                    });

                    // Add the completion message
                    return [
                      ...filtered,
                      {
                        id: systemMessageId,
                        sender: 'pepper',
                        text: systemMessage,
                        createdAt: Date.now(),
                        sequence: nextSequence(),
                      },
                    ];
                  });

                  // Ensure the download button will be visible by marking this message as containing the case
                  // The button logic will detect savedCaseId and show the button

                  setUiMessage(null); // Clear any previous UI message

                  // Don't add the JSON message to chat - we've replaced it with the completion message
                  return; // Exit early to prevent adding the JSON message
                } else {
                  console.error('[PepperAssistant] ❌ Failed to save case:', saveResult.error);
                  setUiMessage(`⚠️ Case data detected but save failed: ${saveResult.error || 'Unknown error'}`);
                }
              } catch (error) {
                console.error('[PepperAssistant] ❌ Error auto-saving case:', error);
                console.error('[PepperAssistant] Error stack:', (error as Error).stack);
                setUiMessage(`⚠️ Error saving case: ${(error as Error).message}`);
              }
            } else {
              console.log('[PepperAssistant] Response does not contain valid Dashboard Template JSON');
              console.log('[PepperAssistant] Final text:', finalText);
            }
          }

          // Add final message to messages array
          // BUT: Skip adding JSON messages for Dashboard Agent scenario (they're replaced with completion message)
          const shouldSkipMessage = activeScenario === 'dashboard-agent' && isDashboardTemplateJSON(finalText);

          if (!shouldSkipMessage) {
            setMessages((prev) => {
              // Prevent duplicate messages - check if last message is already the same
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.sender === 'pepper' && lastMessage.text === finalText.trim()) {
                return prev; // Don't add duplicate
              }
              return [
                ...prev,
                {
                  id: generateMessageId('assistant'),
                  sender: 'pepper',
                  text: finalText.trim(),
                  createdAt: Date.now(),
                  sequence: nextSequence(),
                },
              ];
            });
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // ignore
        } else if (error instanceof Error && error.message.includes('Invalid or expired token')) {
          forceLogout();
        } else {
          const message = error instanceof Error ? error.message : 'No se pudo obtener respuesta.';
          setUiMessage(message);
        }
      } finally {
        if (streamAbortRef.current === controller) {
          streamAbortRef.current = null;
        }
        // Ensure streaming is stopped even if there was an error
        setIsStreaming(false);
        setStreamedText('');
      }
    },
    [
      activeScenario,
      activeThreadId,
      ensureAuthToken,
      forceLogout,
      isStreaming,
      nextSequence,
      pendingTitleThreadId,
      streamChatMessage,
      threads,
      getScenarioLabel,
      loadThreadsFromServer,
      createChatThread,
    ],
  );

  const handleTranscriptionRequest = useCallback(
    async (source: UploadSource, audioBlob: Blob) => {
      if (!audioBlob || audioBlob.size === 0) {
        return;
      }
      if (!activeScenario || !activeThreadId) {
        setUiMessage('Selecciona un agente para continuar.');
        // Clear pending blob if no active thread
        pendingVoiceBlobRef.current[source] = null;
        return;
      }
      setTranscribingSource(source);
      const token = await ensureAuthToken();
      if (!token) {
        setTranscribingSource(null);
        pendingVoiceBlobRef.current[source] = null;
        return;
      }

      // Detect user's preferred language (defaults to Spanish if browser is Spanish)
      const userLanguage = detectUserLanguage();

      // Retry configuration: try with user language first, then Spanish, then auto
      const retryAttempts = [
        { language: userLanguage !== 'auto' ? userLanguage : 'es', label: 'user language' },
        { language: 'es', label: 'Spanish' },
        { language: 'auto', label: 'auto-detect' },
      ];

      let lastError: Error | null = null;
      let response: { text: string; language: string; confidence: number | null; response?: string } | null = null;

      // Try transcription with retry logic
      for (let attempt = 0; attempt < retryAttempts.length; attempt++) {
        const { language: attemptLanguage, label } = retryAttempts[attempt];

        try {
          console.log(`[Transcription] Attempt ${attempt + 1}/${retryAttempts.length} with language: ${label} (${attemptLanguage})`);

          response = await transcribeAudioRequest(token, {
            blob: audioBlob,
            language: attemptLanguage,
            scenario: activeScenario,
            threadId: activeThreadId || undefined,
          });

          // If we got a response with text, break out of retry loop
          if (response?.text && response.text.trim().length > 0) {
            console.log(`[Transcription] Success on attempt ${attempt + 1} with language: ${label}`);
            break;
          }

          // If response is empty, try next attempt
          if (attempt < retryAttempts.length - 1) {
            console.log(`[Transcription] Empty response, retrying with next language...`);
            // Wait before retry (exponential backoff: 1s, 2s)
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          console.error(`[Transcription] Attempt ${attempt + 1} failed:`, lastError.message);

          // If this is not the last attempt, wait and retry
          if (attempt < retryAttempts.length - 1) {
            console.log(`[Transcription] Retrying with next language in ${(attempt + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
          }
        }
      }

      // If all attempts failed, throw the last error
      if (!response || !response.text || response.text.trim().length === 0) {
        const errorMessage = lastError?.message || t('pepperAssistant.transcriptionFailed');
        throw new Error(errorMessage);
      }

      try {
        if (response?.text) {
          const transcribedText = response.text.trim();
          const pendingBlob = pendingVoiceBlobRef.current[source];

          if (pendingBlob) {
            // Find the voice message we just created and update it with transcribed text
            let voiceMessageId: string | null = null;
            setMessages((prev) =>
              prev.map((msg) => {
                // Find the most recent voice message from this source
                if (
                  msg.sender === 'user' &&
                  msg.audioUrl &&
                  msg.text.includes(`🎙️ ${t('pepperAssistant.voiceMemo')}`) &&
                  msg.createdAt &&
                  Date.now() - msg.createdAt < 10000 // Created within last 10 seconds
                ) {
                  voiceMessageId = msg.id;
                  // Store audio blob with the message ID
                  storeAudioBlob(msg.id, audioBlob).catch(console.error);
                  // Also store with timestamp for history lookup
                  if (msg.createdAt) {
                    const timestampKey = `panel-voice-${msg.createdAt}`;
                    storeAudioBlob(timestampKey, audioBlob).catch(console.error);
                    // Also try modal in case it was recorded from modal
                    const modalTimestampKey = `modal-voice-${msg.createdAt}`;
                    storeAudioBlob(modalTimestampKey, audioBlob).catch(console.error);
                  }
                  return {
                    ...msg,
                    text: transcribedText, // Update with transcribed text
                  };
                }
                return msg;
              }),
            );

            // If backend already generated a response, use it directly
            // Otherwise, send the transcribed text to backend as a normal message
            if (voiceMessageId && activeThreadId) {
              // Check if response exists and is not empty
              const hasResponse = response.response && typeof response.response === 'string' && response.response.trim().length > 0;

              if (hasResponse && response.response) {
                // Backend already generated response, use it directly
                const finalText = response.response.trim();
                if (pendingTitleThreadId === activeThreadId) {
                  setShowTitleModal(true);
                }
                // Add AI response to messages (not input field)
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateMessageId('assistant'),
                    sender: 'pepper',
                    text: finalText,
                    createdAt: Date.now(),
                    sequence: nextSequence(),
                  },
                ]);
                // Clear the pending blob - we're done
                pendingVoiceBlobRef.current[source] = null;
              } else {
                // Fallback: stream response (backward compatibility)
                const sendToken = await ensureAuthToken();
                if (sendToken) {
                  setIsStreaming(true);
                  setStreamedText('');
                  setUiMessage(null);

                  const controller = new AbortController();
                  streamAbortRef.current = controller;

                  try {
                    let lastStreamedText = '';
                    const finalReply = await streamChatMessage({
                      token: sendToken,
                      threadId: activeThreadId,
                      scenario: activeScenario,
                      text: transcribedText,
                      signal: controller.signal,
                      onDelta: (partial) => {
                        // partial is already the accumulated text from sendMessageStream
                        lastStreamedText = partial;
                        setStreamedText(partial);
                      },
                    });

                    // Get final text before clearing streaming state
                    const finalText = finalReply || lastStreamedText;

                    // Stop streaming BEFORE adding final message to prevent flickering
                    setIsStreaming(false);
                    setStreamedText('');

                    if (finalText && finalText.trim().length) {
                      if (pendingTitleThreadId === activeThreadId) {
                        setShowTitleModal(true);
                      }
                      // Add AI response to messages (not input field)
                      setMessages((prev) => {
                        // Prevent duplicate messages - check if last message is already the same
                        const lastMessage = prev[prev.length - 1];
                        if (lastMessage && lastMessage.sender === 'pepper' && lastMessage.text === finalText.trim()) {
                          return prev; // Don't add duplicate
                        }
                        return [
                          ...prev,
                          {
                            id: generateMessageId('assistant'),
                            sender: 'pepper',
                            text: finalText.trim(),
                            createdAt: Date.now(),
                            sequence: nextSequence(),
                          },
                        ];
                      });
                    }
                  } catch (error) {
                    if ((error as Error).name === 'AbortError') {
                      // ignore
                    } else if (error instanceof Error && error.message.includes('Invalid or expired token')) {
                      forceLogout();
                    } else {
                      const message = error instanceof Error ? error.message : 'No se pudo obtener respuesta.';
                      setUiMessage(message);
                    }
                  } finally {
                    if (streamAbortRef.current === controller) {
                      streamAbortRef.current = null;
                    }
                    // Ensure streaming is stopped even if there was an error
                    setIsStreaming(false);
                    setStreamedText('');
                  }
                }
              }
            }

            // Clear the pending blob (if not already cleared above)
            if (pendingVoiceBlobRef.current[source]) {
              pendingVoiceBlobRef.current[source] = null;
            }
          } else {
            // Fallback: if no pending blob, create a new message with transcribed text
            // Don't put it in input field - create a message instead
            setMessages((prev) => [
              ...prev,
              {
                id: generateMessageId(`${source}-text`),
                sender: 'user',
                text: transcribedText,
                createdAt: Date.now(),
                sequence: nextSequence(),
              },
            ]);

            // Check if backend already provided a response
            const hasResponse = response.response && typeof response.response === 'string' && response.response.trim().length > 0;

            if (hasResponse && response.response && activeThreadId) {
              // Backend already generated response, use it directly
              const finalText = response.response.trim();
              if (pendingTitleThreadId === activeThreadId) {
                setShowTitleModal(true);
              }
              // Add AI response to messages
              setMessages((prev) => [
                ...prev,
                {
                  id: generateMessageId('assistant'),
                  sender: 'pepper',
                  text: finalText,
                  createdAt: Date.now(),
                  sequence: nextSequence(),
                },
              ]);
            } else if (activeThreadId) {
              // Then send it to backend (only if no response was provided)
              const sendToken = await ensureAuthToken();
              if (sendToken) {
                setIsStreaming(true);
                setStreamedText('');
                setUiMessage(null);

                const controller = new AbortController();
                streamAbortRef.current = controller;

                try {
                  let lastStreamedText = '';
                  const finalReply = await streamChatMessage({
                    token: sendToken,
                    threadId: activeThreadId,
                    scenario: activeScenario,
                    text: transcribedText,
                    signal: controller.signal,
                    onDelta: (partial) => {
                      // partial is already the accumulated text from sendMessageStream
                      lastStreamedText = partial;
                      setStreamedText(partial);
                    },
                  });

                  // Get final text before clearing streaming state
                  const finalText = finalReply || lastStreamedText;

                  // Stop streaming BEFORE adding final message to prevent flickering
                  setIsStreaming(false);
                  setStreamedText('');

                  if (finalText && finalText.trim().length) {
                    if (pendingTitleThreadId === activeThreadId) {
                      setShowTitleModal(true);
                    }
                    setMessages((prev) => {
                      // Prevent duplicate messages - check if last message is already the same
                      const lastMessage = prev[prev.length - 1];
                      if (lastMessage && lastMessage.sender === 'pepper' && lastMessage.text === finalText.trim()) {
                        return prev; // Don't add duplicate
                      }
                      return [
                        ...prev,
                        {
                          id: generateMessageId('assistant'),
                          sender: 'pepper',
                          text: finalText.trim(),
                          createdAt: Date.now(),
                          sequence: nextSequence(),
                        },
                      ];
                    });
                  }
                } catch (error) {
                  if ((error as Error).name === 'AbortError') {
                    // ignore
                  } else if (error instanceof Error && error.message.includes('Invalid or expired token')) {
                    forceLogout();
                  } else {
                    const message = error instanceof Error ? error.message : 'No se pudo obtener respuesta.';
                    setUiMessage(message);
                  }
                } finally {
                  if (streamAbortRef.current === controller) {
                    streamAbortRef.current = null;
                  }
                  // Ensure streaming is stopped even if there was an error
                  setIsStreaming(false);
                  setStreamedText('');
                }
              }
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo transcribir tu nota de voz.';
        setUiMessage(message);
        pendingVoiceBlobRef.current[source] = null;
      } finally {
        setTranscribingSource(null);
      }
    },
    [
      activeScenario,
      activeThreadId,
      ensureAuthToken,
      streamChatMessage,
      nextSequence,
      pendingTitleThreadId,
      forceLogout,
    ],
  );

  const handleSendMessage = async (source: UploadSource) => {
    // Only require activeScenario - thread will be created lazily in sendMessagePayload if needed
    if (!activeScenario) {
      setUiMessage('Selecciona un agente para continuar.');
      return;
    }
    if (isStreaming) {
      return;
    }
    if (transcribingSource === source) {
      setUiMessage('Espera a que termine la transcripción de tu nota de voz.');
      return;
    }
    const readyAttachments = attachments[source].filter((item) => item.status === 'ready');
    const remainingAttachments = attachments[source].filter((item) => item.status !== 'ready');
    const wasRecording = activeRecordingSource === source;
    const recordedDuration = recordSeconds;

    // Capture the blob before stopping if recording
    let audioBlob: Blob | undefined;
    let audioDuration: number | undefined;
    if (wasRecording && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Get the blob from recorded chunks before stopping
      const chunks = recordedChunksRef.current;
      if (chunks.length > 0) {
        const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        audioBlob = new Blob(chunks, { type: preferredMime });
        audioDuration = recordedDuration;
      }
    }

    stopRecording();

    const text = inputValues[source].trim();
    const canSendAttachments = readyAttachments.length > 0;
    const hasExtractedTexts = source === 'modal' && selectedExtractedTextIds.length > 0;

    if (!text && !wasRecording && !canSendAttachments && !hasExtractedTexts) {
      return;
    }

    const messageText = wasRecording ? `🎙️ Voice memo (${formatTime(recordedDuration)})` : text;

    await sendMessagePayload({
      source,
      text: messageText,
      attachmentsPayload: readyAttachments.map(({ id, name, ext }) => ({ id, name, ext })),
      audioBlob,
      audioDuration,
      resetInput: true,
      extractedTextIds: source === 'modal' && selectedExtractedTextIds.length > 0 ? selectedExtractedTextIds : undefined,
    });

    // Clear selected texts after sending (only for modal)
    if (source === 'modal' && selectedExtractedTextIds.length > 0) {
      setSelectedExtractedTextIds([]);
    }

    if (canSendAttachments) {
      setAttachments((prev) => ({ ...prev, [source]: remainingAttachments }));
    }
  };

  const isRecording = Boolean(activeRecordingSource);
  const isPanelRecording = activeRecordingSource === 'panel';
  const isModalRecording = activeRecordingSource === 'modal';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const showingScenarioSelection = !activeScenario;

  const renderChatMessages = (list: ChatMessage[], scrollRef?: RefObject<HTMLDivElement | null>) => {
    const sortedList = [...list].sort((a, b) => {
      const seqDiff = (a.sequence ?? 0) - (b.sequence ?? 0);
      if (seqDiff !== 0) {
        return seqDiff;
      }
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });

    return (
      <div
        ref={scrollRef as RefObject<HTMLDivElement> | undefined}
        className={`mb-4 overflow-y-auto ${isCompact ? 'p-4' : 'p-[18px]'} ${isCompact ? 'h-56' : 'h-64'}`}
      >
        <div className={isCompact ? 'space-y-3.5' : 'space-y-4'}>
          {sortedList.map((msg) => {
            const isPepper = msg.sender === 'pepper';
            return (
              <div
                key={msg.id}
                className={`flex ${isPepper ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`flex items-start gap-3 max-w-[95%] min-w-0 ${isPepper ? 'flex-row' : 'flex-row-reverse'
                    }`}
                >
                  {isPepper && (
                    <div className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0 bg-[radial-gradient(circle_at_30%_30%,rgba(18,200,160,0.16),rgba(10,140,120,0.08))] border border-[rgba(255,255,255,0.03)] overflow-hidden">
                      <img
                        src="https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=150&q=80"
                        alt="Pepper AI Assistant"
                        width={36}
                        height={36}
                        className="w-full h-full object-cover rounded-full"
                        onError={(e) => {
                          e.currentTarget.src =
                            'https://randomuser.me/api/portraits/women/81.jpg';
                        }}
                      />
                    </div>
                  )}
                  {!isPepper && (
                    user?.avatarUrl && !avatarError['panel'] ? (
                      <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border-2 border-blue-300 shadow-[0_4px_10px_rgba(15,23,42,0.35)]">
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName || 'User'}
                          width={36}
                          height={36}
                          className="w-full h-full object-cover"
                          onError={() => setAvatarError((prev) => ({ ...prev, panel: true }))}
                        />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-700 border-2 border-blue-300 text-white font-semibold text-xs shadow-[0_4px_10px_rgba(15,23,42,0.35)]">
                        {user?.displayName
                          ? user.displayName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                          : user?.firstName && user?.lastName
                            ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                            : user?.email
                              ? user.email[0].toUpperCase()
                              : 'U'}
                      </div>
                    )
                  )}
                  <div
                    className={`flex flex-col gap-2 max-w-[95%] min-w-0 ${isPepper ? 'items-start text-left' : 'items-end text-right'
                      }`}
                  >
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-col gap-2 w-full">
                        {msg.attachments.map((file) => (
                          <div
                            key={`${msg.id}-${file.id}`}
                            className={`px-4 py-3 rounded-[14px] text-sm shadow-[0_10px_24px_rgba(4,28,24,0.35)] flex items-center gap-3 max-w-[80%] ${isPepper
                              ? isLight
                                ? 'bg-slate-50 border border-slate-200 text-slate-900 self-start'
                                : 'bg-[linear-gradient(180deg,_#1f8f80,_#199172)] text-white self-start'
                              : isLight
                                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 self-end'
                                : 'bg-[linear-gradient(180deg,#57a69082,#0b6c51)] text-white self-end'
                              }`}
                          >
                            <span className="text-2xl">{getAttachmentIcon(file.ext)}</span>
                            <div className="flex flex-col">
                              <span className="font-semibold">{file.name}</span>
                              <span className={`text-[11px] uppercase ${isLight ? 'text-emerald-600' : 'text-white/75'}`}>{file.ext}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.audioUrl && (
                      <VoiceMessagePlayer
                        audioUrl={msg.audioUrl}
                        duration={msg.audioDuration}
                        isLight={isLight}
                        isUser={!isPepper}
                        t={t}
                      />
                    )}
                    {msg.text && (
                      <div
                        className={`chat-bubble break-words leading-relaxed min-w-0 text-left ${isPepper
                          ? isLight
                            ? 'max-w-[78%] px-[14px] py-[12px] rounded-[10px] border border-slate-200 bg-slate-50 text-slate-900 text-[14px] shadow-[0_4px_10px_rgba(15,23,42,0.08)] self-start'
                            : 'max-w-[78%] px-[14px] py-[12px] rounded-[10px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.06)] text-[#eaf0fb] text-[14px] shadow-[0,4px,10px_rgba(3,6,14,0.25)] self-start'
                          : isLight
                            ? 'max-w-[60%] px-[16px] py-[12px] rounded-[12px] bg-emerald-500/90 text-slate-900 text-[14px] shadow-[0_8px_20px_rgba(15,23,42,0.1)] self-end'
                            : 'max-w-[60%] px-[16px] py-[12px] rounded-[12px] bg-[linear-gradient(180deg,#57a69082,#0b6c51)] text-[#e6fff6] text-[14px] shadow-[0_8px_20px_rgba(2,36,29,0.22)] self-end'
                          }`}
                        style={{
                          wordBreak: 'break-all',
                          overflowWrap: 'break-word',
                          hyphens: 'auto',
                          minWidth: 0
                        }}
                      >
                        <div style={{
                          wordBreak: 'break-all',
                          overflowWrap: 'break-word',
                          minWidth: 0,
                          textAlign: 'left'
                        }}>
                          {/* Hide JSON from users - only show user-friendly messages */}
                          {(() => {
                            // Only hide messages that are ACTUALLY Dashboard Template JSON
                            // Use isDashboardTemplateJSON which checks for 'case_id' and validates the JSON
                            // This prevents hiding normal conversation messages
                            const isJsonMessage = activeScenario === 'dashboard-agent' &&
                              isDashboardTemplateJSON(msg.text);

                            // If this is a JSON message, replace it with a friendly message
                            if (isJsonMessage) {
                              return (
                                <div className={`text-sm ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                                  <p>✅ Processing your case information...</p>
                                  <p className="mt-2 text-xs italic">{t('pepperAssistant.yourCaseBeingSaved')}</p>
                                </div>
                              );
                            }

                            // Default: render normally with Markdown
                            return (
                              <Markdown
                                options={{
                                  overrides: {
                                    table: {
                                      props: {
                                        className: 'markdown-table w-full border-collapse my-4',
                                        style: { wordBreak: 'break-all', overflowWrap: 'break-word' },
                                      },
                                    },
                                    thead: {
                                      props: {
                                        className: 'markdown-thead',
                                      },
                                    },
                                    tbody: {
                                      props: {
                                        className: 'markdown-tbody',
                                      },
                                    },
                                    tr: {
                                      props: {
                                        className: 'markdown-tr',
                                      },
                                    },
                                    th: {
                                      props: {
                                        className: 'markdown-th px-3 py-2 text-left font-semibold border-b',
                                        style: { wordBreak: 'break-all', overflowWrap: 'break-word' },
                                      },
                                    },
                                    td: {
                                      props: {
                                        className: 'markdown-td px-3 py-2 border-b',
                                        style: { wordBreak: 'break-all', overflowWrap: 'break-word' },
                                      },
                                    },
                                    p: {
                                      props: {
                                        className: 'markdown-p my-2 first:mt-0 last:mb-0',
                                        style: { wordBreak: 'break-all', overflowWrap: 'break-word' },
                                      },
                                    },
                                    strong: {
                                      props: {
                                        className: 'markdown-strong font-semibold',
                                        style: { wordBreak: 'break-all', overflowWrap: 'break-word' },
                                      },
                                    },
                                    span: {
                                      props: {
                                        style: { wordBreak: 'break-all', overflowWrap: 'break-word' },
                                      },
                                    },
                                    div: {
                                      props: {
                                        style: { wordBreak: 'break-all', overflowWrap: 'break-word' },
                                      },
                                    },
                                  },
                                }}
                              >
                                {msg.text}
                              </Markdown>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAttachmentList = (source: UploadSource) => {
    const list = attachments[source];
    if (!list.length) return null;
    const isModal = source === 'modal';
    const containerClasses = isModal
      ? `${isCompact ? 'space-y-3 pt-1' : 'space-y-4 pt-2'}`
      : `${isCompact ? 'space-y-2 pt-1' : 'space-y-3 pt-2'}`;
    return (
      <div className={containerClasses}>
        {list.map((file) => {
          const preview =
            file.text && file.text.length > 420 ? `${file.text.slice(0, 420)}…` : file.text || '';
          return (
            <div
              key={`${source}-attachment-${file.id}`}
              className={`flex ${isModal ? 'justify-end' : 'justify-start'
                } transition rounded-2xl border ${isLight ? 'border-emerald-100 bg-emerald-50/70' : 'border-white/10 bg-white/5'
                } ${isModal ? 'px-3.5 py-3' : 'px-3 py-2.5'}`}
            >
              <div className="flex w-full items-start gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${isLight ? 'bg-white text-emerald-500' : 'bg-white/10 text-emerald-200'
                    }`}
                >
                  {getAttachmentIcon(file.ext)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm">{file.name}</p>
                    <span className="text-[11px] uppercase tracking-wide opacity-70">{file.ext}</span>
                    {file.size !== undefined && (
                      <span className="text-[11px] opacity-70">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${file.status === 'ready'
                        ? isLight
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-emerald-500/20 text-emerald-200'
                        : file.status === 'error'
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-slate-500/10 text-slate-500'
                        }`}
                    >
                      {file.status === 'ready'
                        ? `${file.words ?? 0} ${t('pepperAssistant.words')}`
                        : file.status === 'error'
                          ? t('pepperAssistant.error')
                          : t('pepperAssistant.extracting')}
                    </span>
                    <button
                      onClick={() => removeAttachment(source, file.id)}
                      className={`ml-auto text-xs uppercase tracking-[0.2em] ${isLight ? 'text-emerald-600 hover:text-emerald-800' : 'text-white/70 hover:text-white'
                        }`}
                    >
                      {t('pepperAssistant.remove')}
                    </button>
                  </div>
                  {file.status === 'extracting' && (
                    <div className="flex items-center gap-2 text-xs opacity-80">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 12a8 8 0 018-8m8 8a8 8 0 01-8 8m0-16v4m0 8v4m8-8h-4m-8 0H4"
                        />
                      </svg>
                      <span>{t('pepperAssistant.extractingText')}</span>
                    </div>
                  )}
                  {file.status === 'error' && (
                    <p className="text-xs text-rose-500">
                      {file.error || t('pepperAssistant.couldNotExtract')}
                    </p>
                  )}
                  {file.status === 'ready' && (
                    <div className="space-y-2">
                      {preview && (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap opacity-80">{preview}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleInsertAttachmentText(file, source)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${isLight
                            ? 'bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50'
                            : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                            }`}
                        >
                          {t('pepperAssistant.insertText')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={`rounded-[18px] ${isCompact ? 'px-4 py-4 sm:px-5 sm:py-5' : 'px-[22px] py-[22px]'} border ${isLight
        ? 'bg-white border-slate-200 text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.08)]'
        : 'bg-white/5 border-white/10 text-white shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur'
        }`}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xs uppercase tracking-[0.35em] ${isLight ? 'text-slate-400' : 'text-white/60'}`}>{t('pepperAssistant.assistant')}</p>
            <h3 className={`mt-1 text-[20px] font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t('pepperAssistant.title')}</h3>
          </div>
          <button
            onClick={handleOpenChat}
            className={`px-4 py-[10px] rounded-[10px] font-semibold text-[14px] transition ${isLight
              ? 'bg-[linear-gradient(135deg,_#31d5ff,_#3191ff)] text-white shadow-[0_10px_25px_rgba(49,149,255,0.35)] hover:brightness-110'
              : 'bg-white/10 border border-white/20 text-white hover:bg-white/15'
              }`}
          >
            {t('pepperAssistant.openChat')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {[t('pepperAssistant.drafts'), t('pepperAssistant.calendars'), t('pepperAssistant.whatsapp')].map((badge) => (
            <span
              key={badge}
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-white/70'
                }`}
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      {/* Chat Messages - Sample messages only */}
      <div
        className={`relative rounded-2xl border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-[rgba(24,36,64,0.85)] bg-white/5'
          } mb-4`}
      >
        {renderChatMessages(panelSampleMessages, panelMessagesRef)}
      </div>

      {/* Recording indicator - Disabled for panel (sample messages only) */}

      {/* Input Field - Disabled for panel (sample messages only) */}
      {/* Panel only shows sample messages, real chat is in modal */}

      {isMounted &&
        showChatModal &&
        createPortal(
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm px-3 py-6 flex items-center justify-center">
            <div className="w-full max-w-[1400px] max-h-[calc(100vh-3rem)] overflow-y-auto">
              <div
                className={`relative rounded-[32px] border p-4 md:p-6 lg:p-8 ${isLight
                  ? 'bg-white text-slate-900 border-slate-200 shadow-[0_45px_120px_rgba(15,23,42,0.25)]'
                  : 'bg-[linear-gradient(140deg,_rgba(19,44,90,0.98),_rgba(21,76,126,0.95))] text-white border-white/15 shadow-[0_45px_120px_rgba(7,22,56,0.65)]'
                  }`}
              >
                {showTitleModal && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div
                      className={`w-full max-w-md rounded-2xl border p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)] ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white backdrop-blur'
                        }`}
                    >
                      <h4 className="text-lg font-semibold mb-2">{t('pepperAssistant.nameConversation')}</h4>
                      <p className="text-sm mb-4">
                        {t('pepperAssistant.nameConversationDesc')}
                      </p>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder={t('pepperAssistant.namePlaceholder')}
                        className={`w-full rounded-xl border px-4 py-2 mb-3 focus:outline-none ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/30 bg-white/10 text-white'
                          }`}
                      />
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={async () => {
                            const threadId = pendingTitleThreadId;
                            setShowTitleModal(false);
                            setPendingTitleThreadId(null);
                            // Add thread with auto-generated title when user clicks "later"
                            if (threadId && activeScenario) {
                              const autoTitle = `${getScenarioLabel(activeScenario)} • ${formatTimestamp(Date.now())}`;
                              await addThreadToListWithTitle(threadId, autoTitle);
                            }
                          }}
                          className={`px-4 py-2 rounded-xl border transition ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-white/20 text-white/80 hover:bg-white/15'
                            }`}
                        >
                          {t('pepperAssistant.later')}
                        </button>
                        <button
                          onClick={handleSaveTitle}
                          className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold shadow-[0_12px_25px_rgba(16,185,129,0.35)] hover:bg-emerald-400 transition"
                        >
                          {t('pepperAssistant.saveTitle')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {showFileUploadModal && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div
                      className={`w-full max-w-lg rounded-2xl border p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)] ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white backdrop-blur'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold">{t('pepperAssistant.sendFiles')}</h4>
                        <button
                          onClick={() => {
                            setShowFileUploadModal(false);
                            setPendingFiles([]);
                            setFileUploadMessage('');
                          }}
                          className={`p-1.5 rounded-lg transition ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-white/15 text-white/80'
                            }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
                        {pendingFiles.map((file, index) => {
                          const ext = getFileExtension(file.name);
                          const fileIcon = ext === 'pdf' ? '📄' : ext === 'docx' || ext === 'doc' ? '📝' : ext === 'txt' ? '📋' : ext === 'csv' ? '📊' : '📎';
                          return (
                            <div
                              key={index}
                              className={`flex items-center gap-3 p-3 rounded-xl border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/20 bg-white/5'
                                }`}
                            >
                              <span className="text-2xl">{fileIcon}</span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                  {file.name}
                                </p>
                                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                                  {(file.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <textarea
                        value={fileUploadMessage}
                        onChange={(e) => setFileUploadMessage(e.target.value)}
                        placeholder={t('pepperAssistant.addMessageOptional')}
                        rows={3}
                        className={`w-full rounded-xl border px-4 py-3 mb-4 resize-none focus:outline-none ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/30 bg-white/10 text-white placeholder-white/40'
                          }`}
                      />
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            setShowFileUploadModal(false);
                            setPendingFiles([]);
                            setFileUploadMessage('');
                          }}
                          className={`px-4 py-2 rounded-xl border transition ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-white/20 text-white/80 hover:bg-white/15'
                            }`}
                        >
                          {t('pepperAssistant.cancel')}
                        </button>
                        <button
                          onClick={handleSendFilesFromModal}
                          disabled={isStreaming}
                          className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold shadow-[0_12px_25px_rgba(16,185,129,0.35)] hover:bg-emerald-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isStreaming ? t('pepperAssistant.sending') : t('pepperAssistant.send')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-[280px,_1fr] gap-5 lg:gap-8 h-full min-h-[70vh]">
                  <button
                    onClick={() => setShowChatModal(false)}
                    className={`hidden lg:flex absolute top-4 right-4 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${isLight
                      ? 'border border-slate-200 text-slate-700 bg-white hover:bg-slate-50'
                      : 'border border-white/20 text-white/80 bg-white/10 hover:bg-white/15'
                      }`}
                  >
                    <span className="text-[11px] tracking-[0.3em] uppercase">{t('pepperAssistant.close')}</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <aside
                    className={`rounded-[24px] border p-4 hidden lg:block ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <p className={`text-sm font-semibold uppercase tracking-[0.3em] ${isLight ? 'text-slate-500' : 'text-white/70'}`}>
                        {t('pepperAssistant.threads')}
                      </p>
                    </div>
                    <button
                      onClick={handleNewConversation}
                      className={`w-full mb-5 rounded-2xl px-4 py-3 font-semibold shadow-sm ${isLight
                        ? 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                        : 'border border-white/15 bg-white/10 hover:bg-white/20 text-white'
                        }`}
                    >
                      + {t('pepperAssistant.newConversation')}
                    </button>
                    <div
                      className={`space-y-2 overflow-y-auto ${isCompact ? 'max-h-[420px]' : 'max-h-[520px]'
                        } pr-1`}
                    >
                      {threadsLoading && (
                        <p className={`text-center text-xs py-2 ${isLight ? 'text-slate-500' : 'text-white/70'}`}>
                          Cargando conversaciones…
                        </p>
                      )}
                      {threads.map((thread) => (
                        <button
                          key={thread.id}
                          onClick={() => openExistingThread(thread)}
                          disabled={loadingThreadId === thread.id}
                          className={`w-full text-left rounded-2xl border px-4 py-3 text-sm flex items-center justify-between transition ${isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-white/10 bg-white/5 hover:bg-white/10'
                            } ${loadingThreadId === thread.id ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div>
                            <p className="font-semibold">{thread.title}</p>
                            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/60'}`}>Actualizado {thread.updated}</p>
                          </div>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!loadingThreadId) {
                                setConfirmDelete({ id: thread.id, title: thread.title });
                              }
                            }}
                            className={`p-2 rounded-full transition cursor-pointer ${isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-white/80 hover:bg-white/10'
                              }`}
                            role="button"
                            tabIndex={0}
                            aria-label={`Delete ${thread.title}`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!loadingThreadId) {
                                  setConfirmDelete({ id: thread.id, title: thread.title });
                                }
                              }
                            }}
                          >
                            <TrashIcon />
                          </div>
                        </button>
                      ))}
                      {threads.length === 0 && (
                        <p className={`text-center text-xs py-6 ${isLight ? 'text-slate-500' : 'text-white/60'}`}>{t('pepperAssistant.noConversations')}</p>
                      )}
                    </div>

                    {/* Extracted Text Selector - at bottom of Threads panel */}
                    {activeScenario && activeThreadId && (
                      <div className={`mt-4 pt-4 border-t ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                        <div className={`rounded-2xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/20 bg-white/5'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <button
                              onClick={() => {
                                if (!showExtractedTextSelector) {
                                  loadExtractedTexts();
                                }
                                setShowExtractedTextSelector(!showExtractedTextSelector);
                              }}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition w-full ${isLight
                                ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                : 'bg-white/10 border border-white/20 text-white hover:bg-white/15'
                                }`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-xs">{t('pepperAssistant.useExtractedText')}</span>
                              {selectedExtractedTextIds.length > 0 && (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-200'}`}>
                                  {selectedExtractedTextIds.length}
                                </span>
                              )}
                              <svg
                                className={`w-3 h-3 transition-transform ml-auto ${showExtractedTextSelector ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>

                          {showExtractedTextSelector && (
                            <div
                              className={`space-y-2 max-h-64 overflow-y-auto mt-2 pr-1 ${isLight
                                ? 'scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100'
                                : 'scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-white/5'
                                }`}
                              style={{
                                scrollbarWidth: 'thin',
                                scrollbarColor: isLight ? '#cbd5e1 #f1f5f9' : 'rgba(255,255,255,0.2) rgba(255,255,255,0.05)',
                                overflowY: 'auto',
                                overflowX: 'hidden',
                              }}
                            >
                              {loadingExtractedTexts ? (
                                <p className={`text-xs text-center py-3 ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                                  {t('pepperAssistant.loadingTexts')}
                                </p>
                              ) : availableExtractedTexts.length === 0 ? (
                                <p className={`text-xs text-center py-3 ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                                  {t('pepperAssistant.noExtractedTexts')}
                                </p>
                              ) : (
                                availableExtractedTexts.map((text) => {
                                  const isSelected = selectedExtractedTextIds.includes(text.textId);
                                  return (
                                    <div
                                      key={text.textId}
                                      className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition ${isSelected
                                        ? isLight
                                          ? 'border-emerald-300 bg-emerald-50'
                                          : 'border-emerald-400/50 bg-emerald-500/20'
                                        : isLight
                                          ? 'border-slate-200 bg-white hover:bg-slate-50'
                                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                                        }`}
                                      onClick={() => toggleExtractedText(text.textId)}
                                    >
                                      <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected
                                          ? 'border-emerald-500 bg-emerald-500'
                                          : isLight
                                            ? 'border-slate-300'
                                            : 'border-white/30'
                                          }`}
                                      >
                                        {isSelected && (
                                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                          <span className="text-sm">
                                            {text.source === 'voice' ? '🎙️' : getFileType(text.sourceName) === 'image' ? '🖼️' : '📄'}
                                          </span>
                                          <span className={`text-xs font-medium truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                            {text.sourceName}
                                          </span>
                                        </div>
                                        <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                                          {text.wordCount} words • {new Date(text.createdAt).toLocaleDateString()}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {text.source === 'voice' ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenExtractedTextModal(text.textId, text.sourceName, 'voice');
                                            }}
                                            className={`p-1.5 rounded-lg transition ${isLight
                                              ? 'hover:bg-slate-100 text-slate-600'
                                              : 'hover:bg-white/10 text-white/70'
                                              }`}
                                            aria-label={t('pepperAssistant.playVoiceRecording')}
                                            title={t('pepperAssistant.playVoiceRecording')}
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                          </button>
                                        ) : getFileType(text.sourceName) === 'image' ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenExtractedTextModal(text.textId, text.sourceName, 'file');
                                            }}
                                            className={`p-1.5 rounded-lg transition ${isLight
                                              ? 'hover:bg-slate-100 text-slate-600'
                                              : 'hover:bg-white/10 text-white/70'
                                              }`}
                                            aria-label={t('pepperAssistant.viewImage')}
                                            title={t('pepperAssistant.viewImage')}
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                          </button>
                                        ) : (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenExtractedTextModal(text.textId, text.sourceName, 'file');
                                            }}
                                            className={`p-1.5 rounded-lg transition ${isLight
                                              ? 'hover:bg-slate-100 text-slate-600'
                                              : 'hover:bg-white/10 text-white/70'
                                              }`}
                                            aria-label={t('pepperAssistant.viewDocumentDetails')}
                                            title={t('pepperAssistant.viewDocumentDetails')}
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}

                          {/* Selected Texts Preview - also scrollable if many */}
                          {selectedExtractedTextIds.length > 0 && (
                            <div className={`mt-2 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                              <p className={`text-[10px] font-medium mb-1.5 ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                                {t('pepperAssistant.selected')} ({selectedExtractedTextIds.length}):
                              </p>
                              <div
                                className={`flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1 ${isLight
                                  ? 'scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100'
                                  : 'scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-white/5'
                                  }`}
                                style={{
                                  scrollbarWidth: 'thin',
                                  scrollbarColor: isLight ? '#cbd5e1 #f1f5f9' : 'rgba(255,255,255,0.2) rgba(255,255,255,0.05)',
                                }}
                              >
                                {selectedExtractedTextIds.map((textId) => {
                                  const text = availableExtractedTexts.find((t) => t.textId === textId);
                                  if (!text) return null;
                                  return (
                                    <div
                                      key={textId}
                                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] ${isLight
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                                        }`}
                                    >
                                      <span className="text-xs">{text.source === 'voice' ? '🎙️' : '📄'}</span>
                                      <span className="truncate max-w-[100px]">{text.sourceName}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeExtractedText(textId);
                                        }}
                                        className="ml-0.5 hover:opacity-70 text-[10px]"
                                        aria-label={t('pepperAssistant.remove')}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    )}
                  </aside>

                  <div className="flex flex-col h-full min-h-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-3">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2
                            className={`text-2xl md:text-3xl font-semibold drop-shadow-[0_3px_15px_rgba(15,100,200,0.35)] ${isLight ? 'text-slate-900' : 'text-white'
                              }`}
                          >
                            {t('pepperAssistant.title')}
                          </h2>
                          {activeScenario && (
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.2em] ${isLight ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-white/10 text-white border border-white/20'
                                }`}
                            >
                              {getScenarioLabel(activeScenario)}
                            </span>
                          )}
                        </div>
                        <p className={`text-sm md:text-base ${isLight ? 'text-slate-600' : 'text-slate-100/90'}`}>
                          {t('pepperAssistant.realTimeCopilot')}
                        </p>
                      </div>
                      {!showingScenarioSelection && (
                        <div className="flex w-full items-center justify-between gap-2 lg:hidden">
                          <button
                            onClick={() => setShowThreadsMobile((prev) => !prev)}
                            className={`rounded-full border px-3 py-1 text-xs backdrop-blur transition ${isLight
                              ? 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50'
                              : 'border-white/30 text-white/80 bg-white/10 hover:bg-white/20'
                              }`}
                          >
                            {showThreadsMobile ? t('pepperAssistant.hideThreads') : t('pepperAssistant.showThreads')}
                          </button>
                          <button
                            onClick={() => handleNewConversation()}
                            className={`rounded-full border px-3 py-1 text-xs backdrop-blur transition ${isLight
                              ? 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50'
                              : 'border-white/30 text-white/80 bg-white/10 hover:bg-white/20'
                              }`}
                          >
                            {t('pepperAssistant.newAgent')}
                          </button>
                        </div>
                      )}
                    </div>

                    {showingScenarioSelection ? (
                      <div
                        className={`flex flex-col flex-1 gap-4 rounded-3xl border ${isLight ? 'border-slate-200 bg-white' : 'border-white/15 bg-white/5'
                          } p-5 sm:p-8`}
                      >
                        <div>
                          <p className={`text-xs uppercase tracking-[0.35em] ${isLight ? 'text-slate-400' : 'text-white/70'}`}>
                            Choose an agent
                          </p>
                          <h3 className={`text-xl sm:text-2xl font-semibold mt-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            Select how Pepper should assist before entering the chat.
                          </h3>
                          <p className={`${isLight ? 'text-slate-500' : 'text-white/70'} mt-1`}>
                            {t('pepperAssistant.threadsStayListed')}
                          </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          {createScenarioOptions(t).map((option) => (
                            <button
                              key={option.id}
                              onClick={() => handleSelectScenario(option.id)}
                              disabled={scenarioLoading}
                              className={`h-full rounded-3xl border text-left p-4 sm:p-5 flex flex-col gap-3 transition shadow-[0_15px_40px_rgba(4,12,38,0.08)] ${scenarioLoading ? 'opacity-60 cursor-not-allowed' : ''
                                } ${isLight
                                  ? 'border-slate-200 bg-slate-50 hover:border-emerald-200 hover:shadow-[0_20px_45px_rgba(4,76,64,0.12)]'
                                  : 'border-white/15 bg-white/5 hover:bg-white/10'
                                }`}
                            >
                              <span className={`h-1.5 w-12 rounded-full bg-gradient-to-r ${option.accent}`} />
                              <div className="flex flex-col gap-1">
                                <span className="text-lg font-semibold">{option.label}</span>
                                <span className={`text-sm leading-relaxed ${isLight ? 'text-slate-500' : 'text-white/70'}`}>
                                  {option.description}
                                </span>
                              </div>
                              <span
                                className={`mt-auto text-xs uppercase tracking-[0.3em] ${isLight ? 'text-emerald-600' : 'text-emerald-200'
                                  }`}
                              >
                                {scenarioLoading ? t('pepperAssistant.loading') : t('pepperAssistant.select')}
                              </span>
                            </button>
                          ))}
                          {!threadsLoading && threads.length === 0 && (
                            <p className={`text-center text-xs py-3 ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                              No conversations yet.
                            </p>
                          )}
                        </div>
                        <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                          Tip: You can switch agents anytime by selecting “Change Agent” or closing the modal.
                        </p>
                      </div>
                    ) : (
                      <>
                        {showThreadsMobile && (
                          <div
                            className={`lg:hidden mb-4 rounded-2xl ${isCompact ? 'p-3 space-y-3' : 'p-4 space-y-4'} ${isLight
                              ? 'border border-slate-200 bg-white text-slate-900'
                              : 'border border-white/20 bg-[rgba(255,255,255,0.08)] text-white'
                              }`}
                          >
                            <button
                              onClick={handleNewConversation}
                              className={`w-full rounded-2xl px-4 py-3 font-semibold shadow-sm ${isLight
                                ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                                : 'border border-white/15 bg-white/10 text-white hover:bg-white/20'
                                }`}
                            >
                              + New Conversation
                            </button>
                            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                              {threadsLoading && (
                                <p className={`text-center text-xs py-2 ${isLight ? 'text-slate-500' : 'text-white/70'}`}>
                                  Cargando conversaciones…
                                </p>
                              )}
                              {threads.map((thread) => (
                                <button
                                  key={`mobile-${thread.id}`}
                                  onClick={() => openExistingThread(thread)}
                                  disabled={loadingThreadId === thread.id}
                                  className={`w-full rounded-2xl border px-4 py-3 text-sm flex items-center justify-between transition ${isLight
                                    ? 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-white'
                                    : 'border-white/15 bg-white/5 text-white/90 hover:bg-white/10'
                                    } ${loadingThreadId === thread.id ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  <div>
                                    <p className={`font-semibold ${isLight ? 'text-slate-900' : ''}`}>{thread.title}</p>
                                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/60'}`}>Actualizado {thread.updated}</p>
                                  </div>
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!loadingThreadId) {
                                        setConfirmDelete({ id: thread.id, title: thread.title });
                                      }
                                    }}
                                    className={`p-2 rounded-full transition cursor-pointer ${isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-white/80 hover:bg-white/10'
                                      }`}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Delete ${thread.title}`}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!loadingThreadId) {
                                          setConfirmDelete({ id: thread.id, title: thread.title });
                                        }
                                      }
                                    }}
                                  >
                                    <TrashIcon />
                                  </div>
                                </button>
                              ))}
                              {!threadsLoading && threads.length === 0 && (
                                <p className={`text-center text-xs py-3 ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                                  No conversations yet.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <div
                          ref={modalMessagesRef}
                          className={`relative rounded-[24px] ${isCompact ? 'p-3 sm:p-4' : 'p-4 sm:p-6'} mb-4 flex-1 min-h-[50vh] lg:min-h-0 lg:max-h-[70vh] overflow-y-auto border ${isLight
                            ? 'border-slate-200 bg-white shadow-[inset_0_2px_12px_rgba(15,23,42,0.08)]'
                            : 'border-white/10 bg-white/6 shadow-[inset_0_2px_12px_rgba(0,0,0,0.35)] backdrop-blur'
                            }`}
                          onDragEnter={(event) => handleDragEnter('modal', event)}
                          onDragOver={(event) => handleDragOver('modal', event)}
                          onDragLeave={(event) => handleDragLeave('modal', event)}
                          onDrop={(event) => handleDrop('modal', event)}
                        >
                          <div className={`${isCompact ? 'space-y-3' : 'space-y-4'} px-1`}>
                            {messages.map((msg) => {
                              const isPepper = msg.sender === 'pepper';
                              return (
                                <div
                                  key={`modal-${msg.id}`}
                                  className={`flex ${isPepper ? 'justify-start' : 'justify-end'} w-full`}
                                >
                                  <div
                                    className={`flex items-start gap-3 min-w-0 ${isPepper ? 'flex-row' : 'flex-row-reverse'
                                      }`}
                                  >
                                    {isPepper ? (
                                      <div className="w-11 h-11 rounded-full overflow-hidden border border-emerald-200/40 shadow-[0_6px_18px_rgba(10,140,130,0.45)]">
                                        <img
                                          src="https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=150&q=80"
                                          alt="Pepper AI Assistant"
                                          width={44}
                                          height={44}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    ) : (
                                      user?.avatarUrl && !avatarError['modal'] ? (
                                        <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-emerald-300 shadow-[0_6px_14px_rgba(12,186,171,0.35)]">
                                          <img
                                            src={user.avatarUrl}
                                            alt={user.displayName || 'User'}
                                            width={44}
                                            height={44}
                                            className="w-full h-full object-cover"
                                            onError={() => setAvatarError((prev) => ({ ...prev, modal: true }))}
                                          />
                                        </div>
                                      ) : (
                                        <div className="w-11 h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 border-2 border-emerald-300 text-white font-semibold shadow-[0_6px_14px_rgba(12,186,171,0.35)]">
                                          {user?.displayName
                                            ? user.displayName
                                              .split(' ')
                                              .map((n) => n[0])
                                              .join('')
                                              .slice(0, 2)
                                              .toUpperCase()
                                            : user?.firstName && user?.lastName
                                              ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                                              : user?.email
                                                ? user.email[0].toUpperCase()
                                                : 'U'}
                                        </div>
                                      )
                                    )}
                                    <div
                                      className={`flex flex-col gap-2 min-w-0 ${isPepper ? 'items-start text-left' : 'items-end text-right'
                                        }`}
                                      style={{ maxWidth: '100%' }}
                                    >
                                      {msg.attachments && msg.attachments.length > 0 && (
                                        <div className="flex flex-col gap-2 w-full">
                                          {msg.attachments.map((file) => (
                                            <div
                                              key={`${msg.id}-${file.id}`}
                                              className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-[0_10px_22px_rgba(2,8,20,0.4)] flex items-center gap-3 ${isPepper
                                                ? isLight
                                                  ? 'bg-slate-50 border border-slate-200 text-slate-900 self-start'
                                                  : 'bg-[rgba(255,255,255,0.04)] border border-white/10 text-slate-100 self-start'
                                                : isLight
                                                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 self-end'
                                                  : 'bg-[linear-gradient(180deg,#57a69082,#0b6c51)] text-white self-end'
                                                }`}
                                              style={{
                                                maxWidth: isPepper ? '500px' : '600px',
                                                minWidth: '200px',
                                                width: 'fit-content'
                                              }}
                                            >
                                              <span className="text-2xl">{getAttachmentIcon(file.ext)}</span>
                                              <div className="flex flex-col">
                                                <span className="font-semibold">{file.name}</span>
                                                <span className="text-[11px] uppercase opacity-70">{file.ext}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {msg.text && (
                                        <div
                                          className={`flex ${isPepper ? 'justify-start' : 'justify-end'}`}
                                        >
                                          <div
                                            className={`flex items-start gap-3 min-w-0 ${isPepper ? 'flex-row' : 'flex-row-reverse'
                                              }`}
                                            style={{ maxWidth: '100%', overflow: 'hidden' }}
                                          >
                                            <div
                                              className={`chat-bubble px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-[0_10px_22px_rgba(2,8,20,0.1)] text-left ${isPepper
                                                ? isLight
                                                  ? 'bg-slate-50 border border-slate-200 text-slate-900 self-start'
                                                  : 'bg-[rgba(255,255,255,0.04)] border border-white/10 text-slate-100 self-start'
                                                : isLight
                                                  ? 'bg-emerald-100 border border-emerald-200 text-emerald-900 self-end'
                                                  : 'bg-[linear-gradient(180deg,#57a69082,#0b6c51)] text-white self-end'
                                                }`}
                                              style={{
                                                wordBreak: 'break-word',
                                                overflowWrap: 'break-word',
                                                whiteSpace: 'normal',
                                                hyphens: 'auto',
                                                minWidth: '120px',
                                                maxWidth: isPepper ? '700px' : '800px',
                                                width: 'fit-content',
                                                overflow: 'hidden',
                                                boxSizing: 'border-box'
                                              }}
                                            >
                                              <div style={{
                                                wordBreak: 'break-word',
                                                overflowWrap: 'break-word',
                                                whiteSpace: 'normal',
                                                minWidth: 0,
                                                maxWidth: '100%',
                                                textAlign: 'left',
                                                overflow: 'hidden',
                                                wordWrap: 'break-word'
                                              }}>
                                                {/* Hide JSON from users - only show user-friendly messages */}
                                                {(() => {
                                                  // Only hide messages that are ACTUALLY Dashboard Template JSON
                                                  // Use isDashboardTemplateJSON which checks for 'case_id' and validates the JSON
                                                  // This prevents hiding normal conversation messages
                                                  const isJsonMessage = activeScenario === 'dashboard-agent' &&
                                                    isDashboardTemplateJSON(msg.text);

                                                  // If this is a JSON message, replace it with a friendly message
                                                  if (isJsonMessage) {
                                                    return (
                                                      <div className={`text-sm ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                                                        <p>✅ Processing your case information...</p>
                                                        <p className="mt-2 text-xs italic">{t('pepperAssistant.yourCaseBeingSaved')}</p>
                                                      </div>
                                                    );
                                                  }

                                                  // Default: render normally with Markdown
                                                  return (
                                                    <Markdown
                                                      options={{
                                                        overrides: {
                                                          pre: {
                                                            props: {
                                                              className: 'markdown-pre bg-black/10 dark:bg-white/5 rounded-lg p-3 my-2',
                                                              style: {
                                                                wordBreak: 'break-word',
                                                                overflowWrap: 'break-word',
                                                                whiteSpace: 'pre-wrap',
                                                                maxWidth: '100%',
                                                                overflow: 'hidden',
                                                                overflowX: 'hidden',
                                                                overflowY: 'visible',
                                                                width: '100%',
                                                                boxSizing: 'border-box',
                                                                fontSize: '12px',
                                                                lineHeight: '1.5',
                                                                fontFamily: 'monospace'
                                                              },
                                                            },
                                                          },
                                                          code: {
                                                            props: {
                                                              className: 'markdown-code font-mono text-xs',
                                                              style: {
                                                                wordBreak: 'break-word',
                                                                overflowWrap: 'break-word',
                                                                whiteSpace: 'pre-wrap',
                                                                maxWidth: '100%',
                                                                display: 'block',
                                                                width: '100%',
                                                                boxSizing: 'border-box',
                                                                fontSize: '12px',
                                                                lineHeight: '1.5',
                                                                fontFamily: 'monospace'
                                                              },
                                                            },
                                                          },
                                                          table: {
                                                            props: {
                                                              className: 'markdown-table w-full border-collapse my-4',
                                                              style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' },
                                                            },
                                                          },
                                                          thead: {
                                                            props: {
                                                              className: 'markdown-thead',
                                                            },
                                                          },
                                                          tbody: {
                                                            props: {
                                                              className: 'markdown-tbody',
                                                            },
                                                          },
                                                          tr: {
                                                            props: {
                                                              className: 'markdown-tr',
                                                            },
                                                          },
                                                          th: {
                                                            props: {
                                                              className: 'markdown-th px-3 py-2 text-left font-semibold border-b',
                                                              style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' },
                                                            },
                                                          },
                                                          td: {
                                                            props: {
                                                              className: 'markdown-td px-3 py-2 border-b',
                                                              style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' },
                                                            },
                                                          },
                                                          p: {
                                                            props: {
                                                              className: 'markdown-p my-2 first:mt-0 last:mb-0',
                                                              style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' },
                                                            },
                                                          },
                                                          strong: {
                                                            props: {
                                                              className: 'markdown-strong font-semibold',
                                                              style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' },
                                                            },
                                                          },
                                                          span: {
                                                            props: {
                                                              style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' },
                                                            },
                                                          },
                                                          div: {
                                                            props: {
                                                              style: {
                                                                wordBreak: 'break-word',
                                                                overflowWrap: 'break-word',
                                                                whiteSpace: 'normal',
                                                                maxWidth: '100%',
                                                                overflow: 'hidden'
                                                              },
                                                            },
                                                          },
                                                        },
                                                      }}
                                                    >
                                                      {msg.text}
                                                    </Markdown>
                                                  );
                                                })()}
                                                {/* Download DOCX button for Dashboard Agent - at bottom of message box */}
                                                {(() => {
                                                  // Show button if:
                                                  // 1. Dashboard Agent scenario is active
                                                  // 2. We have a saved case ID
                                                  // 3. This is a pepper message
                                                  // 4. This message contains JSON (has { and case_id)
                                                  const messageHasJSON = msg.text.includes('{') && msg.text.includes('case_id');

                                                  // Check if this is the last message (most likely to contain the JSON we just saved)
                                                  const isLastMessage = messages.length > 0 && messages[messages.length - 1]?.id === msg.id;

                                                  // Check if this message contains the saved case ID (more flexible matching)
                                                  let messageHasCaseId = false;
                                                  if (savedCaseId) {
                                                    // Try multiple patterns to match the case ID
                                                    const patterns = [
                                                      `"case_id": "${savedCaseId}"`,
                                                      `"case_id":"${savedCaseId}"`,
                                                      `"case_id":${savedCaseId}`,
                                                      `case_id: "${savedCaseId}"`,
                                                      `case_id:${savedCaseId}`,
                                                      `'case_id': '${savedCaseId}'`,
                                                      `'case_id':'${savedCaseId}'`,
                                                    ];
                                                    messageHasCaseId = patterns.some(pattern => msg.text.includes(pattern)) ||
                                                      new RegExp(`["']?case_id["']?\\s*[:=]\\s*["']?${savedCaseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?`).test(msg.text);
                                                  }

                                                  // Show button if all conditions are met:
                                                  // - Dashboard Agent scenario
                                                  // - Has saved case ID
                                                  // - Is Pepper message
                                                  // - (Message contains success message OR JSON OR is the last message)
                                                  // Check if this is the success message (contains "created successfully" or "updated successfully")
                                                  const isSuccessMessage = msg.text.includes('created successfully') ||
                                                    msg.text.includes('updated successfully') ||
                                                    (msg.text.includes('Case "') && msg.text.includes('successfully'));

                                                  // This ensures the button appears even if JSON detection is slightly off
                                                  const shouldShowButton = isPepper &&
                                                    activeScenario === 'dashboard-agent' &&
                                                    savedCaseId &&
                                                    msg.sender === 'pepper' &&
                                                    (isSuccessMessage || messageHasJSON || isLastMessage);

                                                  // Debug logging (only log when conditions are close to being met)
                                                  if (activeScenario === 'dashboard-agent' && isPepper && msg.sender === 'pepper' && savedCaseId) {
                                                    console.log('[PepperAssistant][Modal] Download button check:', {
                                                      savedCaseId,
                                                      messageHasCaseId,
                                                      isLastMessage,
                                                      messageHasJSON,
                                                      shouldShowButton,
                                                      msgId: msg.id,
                                                      lastMsgId: messages[messages.length - 1]?.id,
                                                      hasBrace: msg.text.includes('{'),
                                                      hasCaseId: msg.text.includes('case_id'),
                                                    });
                                                  }

                                                  if (!shouldShowButton) return null;

                                                  return (
                                                    <div className="mt-3 pt-2 border-t border-white/10 dark:border-white/5 flex items-center justify-start">
                                                      <button
                                                        onClick={async () => {
                                                          if (!savedCaseId || downloadingDocx) return;
                                                          try {
                                                            setDownloadingDocx(true);
                                                            const blob = await dashboardAgentClient.downloadDocx(savedCaseId);
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement('a');
                                                            a.href = url;
                                                            a.download = `case-${savedCaseId}.docx`;
                                                            document.body.appendChild(a);
                                                            a.click();
                                                            document.body.removeChild(a);
                                                            URL.revokeObjectURL(url);
                                                            setUiMessage(`✅ ${t('pepperAssistant.docxDownloadedMessage').replace('{caseId}', savedCaseId)}`);
                                                          } catch (error) {
                                                            console.error('Error downloading DOCX:', error);
                                                            setUiMessage(`❌ ${t('pepperAssistant.docxDownloadFailedMessage').replace('{error}', (error as Error).message)}`);
                                                          } finally {
                                                            setDownloadingDocx(false);
                                                          }
                                                        }}
                                                        disabled={downloadingDocx}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm ${isLight
                                                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-600'
                                                          : 'bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-400'
                                                          } ${downloadingDocx ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}`}
                                                      >
                                                        {downloadingDocx ? (
                                                          <>
                                                            <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                            </svg>
                                                            <span>{t('pepperAssistant.downloading')}</span>
                                                          </>
                                                        ) : (
                                                          <>
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            <span className="font-semibold">{t('pepperAssistant.downloadCaseDocument')}</span>
                                                          </>
                                                        )}
                                                      </button>
                                                    </div>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                            {isPepper && activeScenario && activeThreadId && (
                                              <button
                                                onClick={() => handlePlayTts(msg)}
                                                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs transition ${isLight
                                                  ? 'border-slate-200 text-slate-500 hover:bg-slate-100'
                                                  : 'border-white/20 text-white/80 hover:bg-white/10'
                                                  } ${ttsLoadingId === msg.id ? 'opacity-60' : ''}`}
                                                aria-label={t('pepperAssistant.escucharRespuesta')}
                                                disabled={ttsLoadingId === msg.id}
                                              >
                                                {ttsLoadingId === msg.id ? (
                                                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364l-2.121-2.121M8.757 8.757L6.636 6.636m0 10.728l2.121-2.121m8.486-8.486l2.121-2.121"
                                                    />
                                                  </svg>
                                                ) : (
                                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M11 5l-5 4H4a1 1 0 00-1 1v4a1 1 0 001 1h2l5 4V5zm5.54 3.46a5 5 0 010 7.07M19.07 7a8 8 0 010 11.31"
                                                    />
                                                  </svg>
                                                )}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Streaming message - rendered once after all messages */}
                            {isStreaming && (
                              <div key="streaming-message-modal" className="flex justify-start">
                                <div className="flex items-start gap-4 max-w-[95%] min-w-0">
                                  <div className="w-11 h-11 rounded-full overflow-hidden border border-emerald-200/40 shadow-[0_6px_18px_rgba(10,140,130,0.45)] flex-shrink-0">
                                    <img
                                      src="https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=150&q=80"
                                      alt="Pepper AI Assistant"
                                      width={44}
                                      height={44}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-3 max-w-[95%] min-w-0 items-start text-left">
                                    <div
                                      className={`chat-bubble px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-[0_10px_22px_rgba(2,8,20,0.4)] text-left ${isLight
                                        ? 'bg-slate-50 border border-slate-200 text-slate-900'
                                        : 'bg-[rgba(255,255,255,0.04)] border border-white/10 text-slate-100'
                                        }`}
                                      style={{
                                        wordBreak: 'break-word',
                                        overflowWrap: 'break-word',
                                        whiteSpace: 'pre-wrap',
                                        hyphens: 'auto',
                                        minWidth: '120px',
                                        maxWidth: '75%',
                                        width: 'fit-content'
                                      }}
                                    >
                                      {streamedText ? (
                                        <div style={{
                                          wordBreak: 'break-word',
                                          overflowWrap: 'break-word',
                                          whiteSpace: 'pre-wrap',
                                          minWidth: 0,
                                          textAlign: 'left'
                                        }}>
                                          <Markdown
                                            options={{
                                              overrides: {
                                                p: {
                                                  props: {
                                                    className: 'markdown-p my-2 first:mt-0 last:mb-0',
                                                    style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' },
                                                  },
                                                },
                                                strong: {
                                                  props: {
                                                    style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' },
                                                  },
                                                },
                                                span: {
                                                  props: {
                                                    style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' },
                                                  },
                                                },
                                                div: {
                                                  props: {
                                                    style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' },
                                                  },
                                                },
                                              },
                                            }}
                                          >
                                            {streamedText}
                                          </Markdown>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3">
                                          <span className="flex gap-1">
                                            {[0, 1, 2].map((dot) => (
                                              <span
                                                key={`typing-dot-modal-${dot}`}
                                                className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
                                                style={{ animationDelay: `${dot * 0.15}s` }}
                                              />
                                            ))}
                                          </span>
                                          <span className="text-xs uppercase tracking-[0.3em] text-emerald-400/80">
                                            Pepper está redactando…
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            {renderAttachmentList('modal')}
                          </div>
                          {dragOverlay.modal && (
                            <div
                              className={`pointer-events-none absolute inset-0 rounded-[24px] border flex flex-col items-center justify-center gap-4 shadow-[0_30px_60px_rgba(0,0,0,0.2)] ${isLight ? 'border-slate-200 bg-white/90 text-slate-700' : 'border-white/15 bg-white/10 text-white'
                                }`}
                            >
                              <div className="w-20 h-20 rounded-full border border-emerald-200/60 bg-emerald-400/20 flex items-center justify-center text-3xl">
                                📎
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-semibold tracking-wide uppercase">Drop files to attach</p>
                                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/70'}`}>Pepper will preview them instantly</p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-0">
                          {renderInputRow({
                            source: 'modal',
                            uploadRef: modalUploadRef,
                            uploadLabel: uploadSummary.modal,
                            enableDrop: true,
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {confirmDelete && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 px-4">
                      <div
                        className={`w-full max-w-sm rounded-2xl border p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)] ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white backdrop-blur'
                          }`}
                      >
                        <h4 className="text-lg font-semibold mb-2">{t('pepperAssistant.deleteThread')}</h4>
                        <p className="text-sm mb-4" dangerouslySetInnerHTML={{
                          __html: t('pepperAssistant.deleteThreadConfirm').replace('{title}', confirmDelete.title)
                        }} />
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={handleCancelDelete}
                            className={`px-4 py-2 rounded-xl border transition ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-white/20 text-white/80 hover:bg-white/15'
                              }`}
                          >
                            {t('pepperAssistant.cancel')}
                          </button>
                          <button
                            onClick={() => {
                              if (confirmDelete) {
                                handleDeleteThread(confirmDelete.id);
                              }
                              handleCancelDelete();
                            }}
                            className="px-4 py-2 rounded-xl bg-rose-500 text-white font-semibold shadow-[0_12px_25px_rgba(255,64,105,0.35)] hover:bg-rose-400 transition"
                          >
                            {t('pepperAssistant.deleteThread')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Extracted Text Modal */}
      {isMounted &&
        extractedTextModal &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
            <div
              className={`w-full max-w-3xl rounded-[24px] border p-6 shadow-[0_18px_40px_rgba(0,0,0,0.55)] ${isLight
                ? 'bg-white border-slate-200 text-slate-900'
                : 'bg-[linear-gradient(145deg,_rgba(41,63,112,0.96),_rgba(23,52,97,0.98))] border-white/10 text-white backdrop-blur-sm'
                }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {extractedTextModal.type === 'voice' ? t('pepperAssistant.voiceRecording') : extractedTextModal.type === 'image' ? t('pepperAssistant.imageView') : t('pepperAssistant.documentDetails')}
                  </h3>
                  <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-200/80'}`}>
                    {extractedTextModal.sourceName}
                  </p>
                </div>
                <button
                  onClick={handleCloseExtractedTextModal}
                  className={`p-1.5 rounded-lg transition ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-white/15 text-white/80'
                    }`}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {loadingExtractedTextContent ? (
                <div className="flex items-center justify-center py-12">
                  <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${isLight ? 'border-slate-500' : 'border-emerald-500'}`}></div>
                </div>
              ) : extractedTextContent ? (
                <div className={`rounded-xl border p-4 max-h-[60vh] overflow-y-auto ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/20 bg-white/5'}`}>
                  {extractedTextModal.type === 'voice' && (
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`px-3 py-2 rounded-lg ${isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/20 text-emerald-200'}`}>
                        <span className="text-sm font-medium">{t('pepperAssistant.voiceTranscription')}</span>
                      </div>
                    </div>
                  )}
                  {extractedTextModal.type === 'image' && (
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`px-3 py-2 rounded-lg ${isLight ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/20 text-blue-200'}`}>
                        <span className="text-sm font-medium">{t('pepperAssistant.imageContent')}</span>
                      </div>
                    </div>
                  )}
                  {extractedTextModal.type === 'doc' && (
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`px-3 py-2 rounded-lg ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-500/20 text-slate-200'}`}>
                        <span className="text-sm font-medium">{t('pepperAssistant.documentContent')}</span>
                      </div>
                    </div>
                  )}
                  <div className={`text-sm whitespace-pre-wrap ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                    {extractedTextContent}
                  </div>
                </div>
              ) : (
                <div className={`text-center py-12 ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                  {t('pepperAssistant.noContentAvailable')}
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  onClick={handleCloseExtractedTextModal}
                  className={`px-4 py-2 rounded-xl border transition ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-white/20 text-white/80 hover:bg-white/15'
                    }`}
                >
                  {t('pepperAssistant.close')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );

  function renderInputRow({
    source,
    uploadRef,
    uploadLabel,
    enableDrop = false,
  }: {
    source: UploadSource;
    uploadRef: RefObject<HTMLInputElement>;
    uploadLabel?: string;
    enableDrop?: boolean;
  }) {
    const isModal = source === 'modal';
    // Allow input to be enabled when scenario is selected, even if threadId is null
    // Thread will be created lazily when user sends first message
    const isInteractive = isModal && Boolean(activeScenario && !scenarioLoading);
    const recordingActive = activeRecordingSource === source;
    const isTranscribingCurrent = transcribingSource === source;
    const baseDisabled = !isInteractive || isStreaming;
    const uploadDisabled = baseDisabled || recordingActive || isTranscribingCurrent;
    const textDisabled = baseDisabled || isTranscribingCurrent;
    const micDisabled = baseDisabled || isTranscribingCurrent;
    const sendDisabled = baseDisabled || isTranscribingCurrent;
    const isActive = recordingActive;
    const inputClasses = [
      'flex-1',
      'rounded-[12px]',
      isCompact ? 'px-3 py-3' : 'px-4 py-[14px]',
      'border',
      isLight
        ? 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-[inset_0_2px_4px_rgba(15,23,42,0.06)]'
        : 'bg-white/10 border-white/20 !text-white placeholder-white/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.35)]',
      'focus:outline-none',
      isLight ? 'focus:border-slate-300' : 'focus:border-emerald-300',
      isModal
        ? isCompact
          ? 'h-[44px] text-[14px]'
          : 'h-[48px] text-[15px]'
        : isCompact
          ? 'h-[44px] text-[14px]'
          : 'h-[48px] text-[15px]',
    ].join(' ');

    const micClasses = [
      'relative',
      'rounded-[12px]',
      'border',
      'flex',
      'items-center',
      'justify-center',
      'transition-all',
      'duration-200',
      'overflow-hidden',
      isModal
        ? isCompact
          ? 'w-[40px] h-[40px]'
          : 'w-[44px] h-[44px]'
        : isCompact
          ? 'w-[40px] h-[40px]'
          : 'w-[46px] h-[46px]',
      isActive
        ? isModal
          ? 'bg-[linear-gradient(135deg,_rgba(255,93,146,0.4),_rgba(255,80,110,0.85))] border-rose-200/70 text-white shadow-[0_16px_40px_rgba(255,90,120,0.4)]'
          : 'bg-[linear-gradient(180deg,_rgba(255,93,93,0.2),_rgba(140,22,40,0.9))] border-rose-400/60 text-white shadow-[0_10px_24px_rgba(255,45,85,0.32)]'
        : isModal
          ? isLight
            ? 'bg-white border-slate-200 text-emerald-600 shadow-[0_8px_22px_rgba(15,23,42,0.12)]'
            : 'bg-white/10 border-white/20 text-emerald-200 shadow-[0_8px_22px_rgba(6,18,46,0.45)]'
          : isLight
            ? 'bg-white border-slate-200 text-emerald-600 shadow-[0_6px_14px_rgba(15,23,42,0.12)]'
            : 'bg-white/10 border-white/15 text-[#13d08b] shadow-[0_6px_14px_rgba(6,12,22,0.35)]',
    ].join(' ');

    const InputStack = (
      <>
        <input
          ref={uploadRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={(event) => {
            void handleFilesSelected(source, event.target.files);
            event.target.value = '';
          }}
        />
        {isModal && isActive && (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200/50 bg-rose-500/10 px-4 py-2 shadow-[0_15px_38px_rgba(255,110,140,0.25)]">
            <div className="flex items-end gap-1">
              {[0, 1, 2, 3, 4].map((bar) => (
                <span
                  key={`modal-wave-${bar}`}
                  className="w-1.5 rounded-full bg-rose-200/90"
                  style={{
                    height: `${10 + (bar % 2 ? 18 : 26)}px`,
                    animation: `voiceWave ${0.9 + bar * 0.15}s ease-in-out infinite`,
                    animationDelay: `${bar * 0.08}s`,
                  }}
                />
              ))}
            </div>
            <span className="text-xs uppercase tracking-[0.25em] text-rose-50">
              {t('pepperAssistant.listening')}
            </span>
            <span className="font-mono text-sm text-white ml-auto">
              {formatTime(recordSeconds)}
            </span>
          </div>
        )}
        {isModal && isTranscribingCurrent && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/60 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200 shadow-[0_10px_26px_rgba(16,185,129,0.25)]">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 12a8 8 0 018-8m8 8a8 8 0 01-8 8m0-16v4m0 8v4m8-8h-4m-8 0H4"
              />
            </svg>
            <span>{t('pepperAssistant.transcribing')}</span>
          </div>
        )}

        <div
          className={`flex items-center ${isModal ? (isCompact ? 'gap-1' : 'gap-1.5') : isCompact ? 'gap-2' : 'gap-2.5'
            }`}
        >
          <button
            className={`rounded-[12px] border transition flex items-center justify-center shadow-[0_8px_20px_rgba(2,8,20,0.18)] ${isModal
              ? isCompact
                ? 'w-[40px] h-[40px]'
                : 'w-[42px] h-[42px]'
              : isCompact
                ? 'w-[38px] h-[38px]'
                : 'w-[42px] h-[42px]'
              } ${isLight
                ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-white/20 bg-white/10 text-white hover:bg-white/15'
              } ${uploadDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label="Upload file"
            onClick={() => {
              if (uploadDisabled) return;
              handleUploadButtonClick(source);
            }}
            disabled={uploadDisabled}
            aria-disabled={uploadDisabled}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
            </svg>
          </button>
          <textarea
            placeholder={t('pepperAssistant.typeMessage')}
            value={inputValues[source]}
            onChange={(e) =>
              setInputValues((prev) => ({
                ...prev,
                [source]: e.target.value,
              }))
            }
            rows={isModal ? (isCompact ? 2 : 3) : 2}
            style={{
              overflowY: inputValues[source].includes('\n') ? 'auto' : 'hidden',
            }}
            onKeyDown={(e) => {
              if (!isInteractive || isTranscribingCurrent) return;
              if (recordingActive && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                stopRecording();
                return;
              }
              if (recordingActive) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(source);
              }
            }}
            className={`${inputClasses} resize-none ${textDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={textDisabled}
            aria-disabled={textDisabled}
          />
          <button
            onClick={() => {
              if (micDisabled && !isActive) return;
              toggleRecording(source);
            }}
            aria-pressed={isActive}
            className={`${micClasses} ${micDisabled && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label={isActive ? 'Discard recording' : 'Start voice recording'}
            disabled={micDisabled && !isActive}
            aria-disabled={micDisabled && !isActive}
          >
            {isActive && (
              <>
                <span className="absolute inset-0 rounded-[12px] bg-rose-500/20 animate-ping" />
                <span className="absolute inset-0 rounded-[12px] bg-rose-400/20 blur-xl" />
              </>
            )}
            {isActive ? (
              <svg className="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 4h6l1 3h3a1 1 0 011 1v1H5V8a1 1 0 011-1h3l1-3zm1 5v9m4-9v9M6 9h12v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9z"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>
          <button
            onClick={() => {
              if (sendDisabled && !recordingActive) return;
              if (recordingActive) {
                stopRecording();
                return;
              }
              handleSendMessage(source);
            }}
            className={`rounded-[12px] text-[18px] flex items-center justify-center transition ${isModal
              ? isCompact
                ? 'w-[42px] h-[42px]'
                : 'w-[46px] h-[46px]'
              : isCompact
                ? 'w-[42px] h-[42px]'
                : 'w-[48px] h-[48px]'
              } ${isLight
                ? 'bg-[linear-gradient(135deg,_#31d5ff,_#3191ff)] text-white shadow-[0_10px_25px_rgba(49,149,255,0.35)] hover:brightness-110'
                : 'bg-white/15 border border-white/25 text-white shadow-[0_10px_25px_rgba(0,0,0,0.35)] hover:bg-white/25'
              } ${sendDisabled && !recordingActive ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={sendDisabled && !recordingActive}
            aria-disabled={sendDisabled && !recordingActive}
          >
            <svg className="w-5 h-5 text-white rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </>
    );

    if (enableDrop) {
      return (
        <div className={`flex flex-col ${isModal ? (isCompact ? 'gap-2.5' : 'gap-3') : isCompact ? 'gap-1.5' : 'gap-2'}`}>
          <div
            className={`rounded-2xl border border-dashed ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/20 bg-white/5'
              } ${isCompact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleFilesSelected(source, e.dataTransfer.files);
            }}
          >
            {InputStack}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`flex flex-col ${isModal ? (isCompact ? 'gap-2.5' : 'gap-3') : isCompact ? 'gap-1.5' : 'gap-2'}`}
      >
        {InputStack}
      </div>
    );
  }
}


