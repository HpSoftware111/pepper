'use client';

import { useEffect, useRef, useState } from 'react';
import { transcribeAndStore, appendTranscriptionChunk } from '@/lib/extractionClient';
import { authClient } from '@/lib/authClient';
import { useLanguage } from '@/providers/LanguageProvider';

interface VoiceCaptureProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (textId: string, sourceName: string) => void;
    themeMode?: 'light' | 'dark';
    layoutDensity?: 'compact' | 'comfortable' | 'cozy' | string;
}

export default function VoiceCapture({
    isOpen,
    onClose,
    onSuccess,
    themeMode = 'light',
    layoutDensity = 'comfortable',
}: VoiceCaptureProps) {
    const { t } = useLanguage();
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [transcript, setTranscript] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [meetingTitle, setMeetingTitle] = useState('');
    const [showTitleInput, setShowTitleInput] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentTextId, setCurrentTextId] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const [voiceLevel, setVoiceLevel] = useState(0);
    const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const isLight = themeMode === 'light';
    const isCompact = layoutDensity === 'compact';

    // Cleanup on unmount or close
    useEffect(() => {
        if (!isOpen) {
            stopRecording();
            cleanup();
        }
        return () => {
            cleanup();
        };
    }, [isOpen]);

    const cleanup = () => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        if (chunkIntervalRef.current) {
            clearInterval(chunkIntervalRef.current);
            chunkIntervalRef.current = null;
        }
        stopVoiceVisualization();
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current = null;
        }
        recordedChunksRef.current = [];
    };

    const stopVoiceVisualization = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (analyserRef.current) {
            analyserRef.current.disconnect();
            analyserRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setVoiceLevel(0);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const startRecording = async () => {
        try {
            setError(null);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            // Setup audio visualization
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioContextClass) {
                    audioContextRef.current = new AudioContextClass();
                    const source = audioContextRef.current.createMediaStreamSource(stream);
                    const analyser = audioContextRef.current.createAnalyser();
                    analyser.fftSize = 512;
                    analyserRef.current = analyser;
                    source.connect(analyser);

                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    const updateVoiceLevel = () => {
                        if (!analyserRef.current || !isRecording) return;
                        analyserRef.current.getByteTimeDomainData(dataArray);
                        let total = 0;
                        for (let i = 0; i < dataArray.length; i += 1) {
                            const value = dataArray[i] - 128;
                            total += Math.abs(value);
                        }
                        const average = total / dataArray.length;
                        const level = Math.min(1, average / 40);
                        setVoiceLevel(level);
                        animationFrameRef.current = requestAnimationFrame(updateVoiceLevel);
                    };
                    updateVoiceLevel();
                }
            }

            const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
            let selectedMimeType = '';
            for (const mimeType of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    selectedMimeType = mimeType;
                    break;
                }
            }

            const recorder = new MediaRecorder(stream, {
                mimeType: selectedMimeType || undefined,
            });

            recordedChunksRef.current = [];

            recorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);

                    // If we have a textId, append this chunk
                    if (currentTextId && !isPaused) {
                        try {
                            const chunkBlob = new Blob([event.data], { type: selectedMimeType || 'audio/webm' });
                            const chunkText = await transcribeChunk(chunkBlob);
                            if (chunkText.trim()) {
                                await appendTranscriptionChunk(currentTextId, chunkText);
                                setTranscript((prev) => prev + (prev ? ' ' : '') + chunkText);
                            }
                        } catch (err) {
                            console.error('Error appending chunk:', err);
                        }
                    }
                }
            };

            recorder.onstop = async () => {
                if (recordedChunksRef.current.length > 0) {
                    const finalBlob = new Blob(recordedChunksRef.current, {
                        type: selectedMimeType || 'audio/webm',
                    });
                    await processFinalRecording(finalBlob);
                }
                stopVoiceVisualization();
                if (mediaStreamRef.current) {
                    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
                    mediaStreamRef.current = null;
                }
            };

            mediaRecorderRef.current = recorder;

            // Start recording with 5-second chunks for real-time transcription
            recorder.start(5000);
            setIsRecording(true);
            setIsPaused(false);
            setRecordSeconds(0);
            setShowTitleInput(false);

            // Start timer
            timerIntervalRef.current = setInterval(() => {
                setRecordSeconds((prev) => prev + 1);
            }, 1000);

            // Process initial chunk after 5 seconds
            chunkIntervalRef.current = setTimeout(async () => {
                if (recordedChunksRef.current.length > 0 && !currentTextId) {
                    const firstChunk = new Blob([recordedChunksRef.current[0]], {
                        type: selectedMimeType || 'audio/webm',
                    });
                    try {
                        const result = await transcribeAndStore(firstChunk, {
                            sourceName: meetingTitle || `Meeting - ${new Date().toLocaleString()}`,
                            duration: recordSeconds,
                            meetingTitle: meetingTitle || undefined,
                            storeOnly: true,
                        });

                        setCurrentTextId(result.textId);
                        setTranscript(result.text || '');
                    } catch (err) {
                        console.error('Error processing first chunk:', err);
                        setError('Error processing audio chunk');
                    }
                }
            }, 5000);
        } catch (error) {
            console.error('Error starting recording:', error);
            setError('Unable to access microphone. Please check permissions.');
            setIsRecording(false);
        }
    };

    const transcribeChunk = async (blob: Blob): Promise<string> => {
        try {
            const token = authClient.getStoredAccessToken();
            if (!token) {
                console.error('No auth token available');
                return '';
            }

            const formData = new FormData();
            formData.append('audio', blob, 'chunk.webm');

            const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
            // Ensure API_BASE_URL doesn't end with /api to avoid double /api/api/
            const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;
            const response = await fetch(`${baseUrl}/api/chat/speech/transcribe`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Transcription failed');
            }

            const data = await response.json();
            return data.text || '';
        } catch (err) {
            console.error('Chunk transcription error:', err);
            return '';
        }
    };

    const processFinalRecording = async (blob: Blob) => {
        setIsProcessing(true);
        try {
            const result = await transcribeAndStore(blob, {
                sourceName: meetingTitle || `Meeting - ${new Date().toLocaleString()}`,
                duration: recordSeconds,
                meetingTitle: meetingTitle || undefined,
                storeOnly: true,
            });

            if (result.textId) {
                setCurrentTextId(result.textId);
                if (result.text && !transcript) {
                    setTranscript(result.text);
                }
                if (onSuccess) {
                    onSuccess(result.textId, result.extractedText.sourceName);
                }
            }
        } catch (err) {
            console.error('Error processing final recording:', err);
            setError('Error processing recording. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && isPaused) {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
            timerIntervalRef.current = setInterval(() => {
                setRecordSeconds((prev) => prev + 1);
            }, 1000);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setIsPaused(false);
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
            if (chunkIntervalRef.current) {
                clearTimeout(chunkIntervalRef.current);
                chunkIntervalRef.current = null;
            }
        }
    };

    const handleClose = () => {
        if (isRecording) {
            stopRecording();
        }
        cleanup();
        setTranscript('');
        setRecordSeconds(0);
        setMeetingTitle('');
        setShowTitleInput(true);
        setError(null);
        setCurrentTextId(null);
        onClose();
    };

    const handleStartMeeting = () => {
        if (!meetingTitle.trim()) {
            setMeetingTitle(`Meeting - ${new Date().toLocaleString()}`);
        }
        startRecording();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div
                className={`w-full max-w-2xl rounded-[24px] border p-6 shadow-[0_18px_40px_rgba(0,0,0,0.55)] ${isLight
                    ? 'bg-white border-slate-200 text-slate-900'
                    : 'bg-[linear-gradient(145deg,_rgba(41,63,112,0.96),_rgba(23,52,97,0.98))] border-white/10 text-white backdrop-blur-sm'
                    }`}
            >
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-xl font-semibold tracking-tight">{t('voiceCapture.meetingNotes')}</h3>
                        <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-200/80'}`}>
                            {t('voiceCapture.description')}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className={`p-1.5 rounded-lg transition ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-white/15 text-white/80'
                            }`}
                        aria-label={t('voiceCapture.close')}
                    >
                        ✕
                    </button>
                </div>

                {/* Meeting Title Input */}
                {showTitleInput && (
                    <div className="mb-6">
                        <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                            {t('voiceCapture.meetingTitle')}
                        </label>
                        <input
                            type="text"
                            value={meetingTitle}
                            onChange={(e) => setMeetingTitle(e.target.value)}
                            placeholder={t('voiceCapture.meetingTitlePlaceholder')}
                            className={`w-full rounded-xl border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isLight
                                ? 'border-slate-200 bg-white text-slate-900'
                                : 'border-white/30 bg-white/10 text-white placeholder-white/40'
                                }`}
                        />
                    </div>
                )}

                {/* Recording Status */}
                {!showTitleInput && (
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                                {meetingTitle || 'Meeting'}
                            </span>
                            <span className={`text-lg font-mono font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                {formatTime(recordSeconds)}
                            </span>
                        </div>
                        <div className={`h-1 rounded-full ${isLight ? 'bg-slate-200' : 'bg-white/20'}`}>
                            <div
                                className={`h-full rounded-full transition-all ${isRecording && !isPaused ? 'bg-emerald-500' : 'bg-slate-400'
                                    }`}
                                style={{ width: `${(recordSeconds % 60) * 1.67}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Voice Visualization */}
                <div className="my-6 flex flex-col items-center gap-4">
                    <div className="relative flex items-center justify-center w-28 h-28 rounded-full border border-emerald-300/40 bg-[radial-gradient(circle,_rgba(20,170,140,0.15)_0%,_rgba(12,29,60,0.85)_80%)] shadow-[0_10px_30px_rgba(0,0,0,0.45)] overflow-hidden">
                        <div className="absolute inset-3 flex items-center justify-center">
                            {[1.2, 1.7, 2.2].map((scale, index) => (
                                <span
                                    key={`voice-ring-${index}`}
                                    className="absolute h-16 w-16 rounded-full border border-rose-300/35"
                                    style={{
                                        transform: `scale(${1 + voiceLevel * scale})`,
                                        opacity: Math.max(0.15, 0.65 - index * 0.18 + voiceLevel * 0.4),
                                        transition: 'transform 120ms ease, opacity 150ms ease',
                                        boxShadow: isRecording && !isPaused
                                            ? '0 0 18px rgba(255,90,120,0.25)'
                                            : '0 0 8px rgba(255,255,255,0.08)',
                                    }}
                                />
                            ))}
                        </div>
                        <div
                            className={`relative z-10 w-16 h-16 rounded-full ${isRecording && !isPaused
                                ? 'bg-rose-500 animate-[pulse_1.2s_infinite]'
                                : isPaused
                                    ? 'bg-yellow-500'
                                    : 'bg-emerald-500'
                                } flex items-center justify-center text-lg font-semibold transition`}
                        >
                            {isRecording && !isPaused ? 'REC' : isPaused ? 'PAU' : 'IDLE'}
                        </div>
                    </div>
                    {error && <p className="text-xs text-rose-200">{error}</p>}
                </div>

                {/* Real-time Transcript */}
                {transcript && (
                    <div className={`mb-6 rounded-xl border p-4 max-h-48 overflow-y-auto ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/20 bg-white/5'
                        }`}>
                        <p className={`text-xs uppercase tracking-wider mb-2 ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>
                            {t('voiceCapture.liveTranscript')}
                        </p>
                        <p className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>{transcript}</p>
                    </div>
                )}

                {/* Control Buttons */}
                <div className="grid grid-cols-3 gap-3">
                    {!isRecording && !isProcessing && (
                        <button
                            onClick={handleStartMeeting}
                            className="col-span-3 rounded-[14px] px-4 py-3 font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition"
                        >
                            {t('voiceCapture.startMeeting')}
                        </button>
                    )}

                    {isRecording && (
                        <>
                            {isPaused ? (
                                <button
                                    onClick={resumeRecording}
                                    className="rounded-[14px] px-4 py-3 font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition"
                                >
                                    {t('voiceCapture.resume')}
                                </button>
                            ) : (
                                <button
                                    onClick={pauseRecording}
                                    className="rounded-[14px] px-4 py-3 font-semibold bg-yellow-500 hover:bg-yellow-400 text-white transition"
                                >
                                    {t('voiceCapture.pause')}
                                </button>
                            )}
                            <button
                                onClick={stopRecording}
                                className="rounded-[14px] px-4 py-3 font-semibold bg-rose-500 hover:bg-rose-400 text-white transition"
                            >
                                {t('voiceCapture.stop')}
                            </button>
                            <button
                                onClick={handleClose}
                                className="rounded-[14px] px-4 py-3 font-semibold bg-slate-500 hover:bg-slate-400 text-white transition"
                            >
                                {t('voiceCapture.cancel')}
                            </button>
                        </>
                    )}

                    {isProcessing && (
                        <div className="col-span-3 text-center py-3">
                            <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                                {t('voiceCapture.processing')}
                            </p>
                        </div>
                    )}

                    {!isRecording && !isProcessing && transcript && (
                        <button
                            onClick={handleClose}
                            className="col-span-3 rounded-[14px] px-4 py-3 font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition"
                        >
                            {t('voiceCapture.done')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

