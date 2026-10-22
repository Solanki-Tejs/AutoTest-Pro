"use client";

import { useEffect, useRef, useState } from "react";
import { getStoredToken } from "@/app/lib/auth";
import { API_BASE_URL } from "@/app/lib/apiConfig";
import { toast } from "sonner";

interface WebcamProctorProps {
  examId: string;
  attemptId: string;
}

export default function WebcamProctor({ examId, attemptId }: WebcamProctorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const [micActive, setMicActive] = useState<boolean>(false);
  const [isRecordingIncident, setIsRecordingIncident] = useState<boolean>(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Audio Recording Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingAudioRef = useRef<boolean>(false);
  const recordingStartTimeRef = useRef<number>(0);
  const lastLoudTimeRef = useRef<number>(0);
  const peakRmsRef = useRef<number>(0);
  const lastIncidentUploadTimeRef = useRef<number>(0);

  // Configuration
  const CAPTURE_INTERVAL_MS = 1000; // 1s frame capture for face & head pose
  const AUDIO_SAMPLE_INTERVAL_MS = 150; // 150ms audio sample interval
  const SOUND_THRESHOLD = 0.08; // Normalized RMS threshold
  const MIN_RECORD_DURATION_MS = 5000; // Minimum 5s audio recording
  const SILENCE_WINDOW_MS = 1200; // 1.2s silence required after >=5s to finish
  const INCIDENT_COOLDOWN_MS = 8000; // Cooldown between consecutive incidents

  // Upload recorded audio snippet to backend
  const uploadAudioIncident = async (blob: Blob, durationSec: number, peakRms: number) => {
    const token = getStoredToken();
    if (!token) return;

    try {
      const formData = new FormData();
      formData.append("audio", blob, "acoustic_incident.webm");
      formData.append("duration", durationSec.toFixed(1));
      formData.append("peak_rms", peakRms.toFixed(3));

      await fetch(
        `${API_BASE_URL}/student/exams/${examId}/attempts/${attemptId}/proctoring/audio`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      toast.error(
        `⚠️ Acoustic Alert: Noise threshold exceeded (${durationSec.toFixed(0)}s). Incident recorded for educator review.`,
        {
          id: "acoustic-violation-toast",
          duration: 5000,
        }
      );
    } catch (err) {
      console.error("Failed to upload proctoring audio incident:", err);
    }
  };

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        // Setup Web Audio Analyser
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioContextRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(mediaStream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);

            setMicActive(true);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            audioIntervalRef.current = setInterval(() => {
              analyser.getByteTimeDomainData(dataArray);

              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                const val = (dataArray[i] - 128) / 128;
                sum += val * val;
              }
              const rms = Math.sqrt(sum / dataArray.length);
              const now = Date.now();

              if (rms > SOUND_THRESHOLD) {
                lastLoudTimeRef.current = now;
                peakRmsRef.current = Math.max(peakRmsRef.current, rms);

                // Start audio recorder if not already running and not in cooldown
                if (
                  !isRecordingAudioRef.current &&
                  now - lastIncidentUploadTimeRef.current >= INCIDENT_COOLDOWN_MS
                ) {
                  try {
                    const audioStream = new MediaStream(mediaStream.getAudioTracks());
                    const recorder = new MediaRecorder(audioStream, {
                      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                        ? "audio/webm;codecs=opus"
                        : "audio/webm",
                    });
                    audioChunksRef.current = [];

                    recorder.ondataavailable = (e) => {
                      if (e.data && e.data.size > 0) {
                        audioChunksRef.current.push(e.data);
                      }
                    };

                    recorder.onstop = () => {
                      const chunks = [...audioChunksRef.current];
                      const blob = new Blob(chunks, { type: "audio/webm" });
                      const totalDur = Math.max(
                        5.0,
                        (Date.now() - recordingStartTimeRef.current) / 1000
                      );
                      const finalPeak = peakRmsRef.current;
                      uploadAudioIncident(blob, totalDur, finalPeak);
                      setIsRecordingIncident(false);
                      isRecordingAudioRef.current = false;
                      lastIncidentUploadTimeRef.current = Date.now();
                      audioChunksRef.current = [];
                    };

                    recorder.start(400); // 400ms chunk intervals
                    mediaRecorderRef.current = recorder;
                    isRecordingAudioRef.current = true;
                    recordingStartTimeRef.current = now;
                    peakRmsRef.current = rms;
                    setIsRecordingIncident(true);
                  } catch (recorderErr) {
                    console.warn("Failed to initialize MediaRecorder for proctoring:", recorderErr);
                  }
                }
              } else if (isRecordingAudioRef.current) {
                // Sound has dropped below threshold
                const elapsedSinceStart = now - recordingStartTimeRef.current;
                const silenceDuration = now - lastLoudTimeRef.current;

                // Stop only if we've recorded at least MIN_RECORD_DURATION_MS (5s) AND silence has held for SILENCE_WINDOW_MS
                if (
                  elapsedSinceStart >= MIN_RECORD_DURATION_MS &&
                  silenceDuration >= SILENCE_WINDOW_MS
                ) {
                  if (
                    mediaRecorderRef.current &&
                    mediaRecorderRef.current.state === "recording"
                  ) {
                    try {
                      mediaRecorderRef.current.stop();
                    } catch {
                      isRecordingAudioRef.current = false;
                      setIsRecordingIncident(false);
                    }
                  }
                }
              }
            }, AUDIO_SAMPLE_INTERVAL_MS);
          }
        } catch (audioErr) {
          console.warn("Web Audio API not supported or failed to initialize:", audioErr);
        }
      } catch (err) {
        console.error("Error accessing camera/microphone for proctoring", err);
        setError("Camera/Mic access lost. Proctoring disabled.");
      }
    };

    startMedia();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const currentStream = videoRef.current.srcObject as MediaStream;
        currentStream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [examId, attemptId]);

  // Periodic visual snapshot frame upload (1 frame per second)
  useEffect(() => {
    if (!stream) return;

    const captureAndUpload = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      if (canvas.width === 0 || canvas.height === 0) return;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        async (blob) => {
          if (!blob) return;
          const token = getStoredToken();
          if (!token) return;

          const formData = new FormData();
          formData.append("image", blob, "snapshot.jpg");

          try {
            await fetch(
              `${API_BASE_URL}/student/exams/${examId}/attempts/${attemptId}/proctoring/frame`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                body: formData,
              }
            );
          } catch (err) {
            console.error("Error uploading proctoring frame:", err);
          }
        },
        "image/jpeg",
        0.7
      );
    };

    intervalRef.current = setInterval(captureAndUpload, CAPTURE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stream, examId, attemptId]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="w-40 h-28 bg-black border-2 border-black shadow-[4px_4px_0px_#111111] overflow-hidden relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform -scale-x-100"
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-white font-mono text-[9px] text-center p-2 font-bold uppercase">
            {error}
          </div>
        )}
        {!stream && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="w-4 h-4 border-2 border-white/20 border-t-brand-crimson rounded-full animate-spin"></div>
          </div>
        )}

        {/* Status Indicators */}
        <div className="absolute bottom-1 right-1 flex items-center gap-1.5 bg-black/85 px-1.5 py-0.5 border border-white/20 text-[9px] font-mono font-bold text-white uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-crimson animate-pulse"></span>
          <span>REC</span>
          {micActive && (
            <span
              className={`material-symbols-outlined text-[12px] ${
                isRecordingIncident ? "text-brand-crimson animate-ping" : "text-emerald-400"
              }`}
              title={isRecordingIncident ? "Acoustic Violation Recording Active" : "Acoustic Invigilator Active"}
            >
              {isRecordingIncident ? "mic" : "mic"}
            </span>
          )}
        </div>

        {isRecordingIncident && (
          <div className="absolute top-1 left-1 bg-brand-crimson text-white font-mono text-[8px] font-bold px-1.5 py-0.5 tracking-wider uppercase border border-white/30 animate-pulse">
            AUDIO CAPTURE &gt;5S
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
