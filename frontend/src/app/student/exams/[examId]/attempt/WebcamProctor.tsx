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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Configuration
  const CAPTURE_INTERVAL_MS = 1000; // 1 second
  const AUDIO_SAMPLE_INTERVAL_MS = 200; // 200ms
  const SOUND_THRESHOLD = 0.08; // Normalized RMS threshold for speaking/sound above silence
  const SUSTAINED_DURATION_THRESHOLD_MS = 3000; // 3 seconds continuous
  const OCCURRENCE_THRESHOLD = 3; // 3 distinct sound occurrences
  const ALERT_COOLDOWN_MS = 15000; // 15 seconds cooldown between alerts

  const continuousLoudMsRef = useRef<number>(0);
  const loudOccurrencesRef = useRef<number>(0);
  const inBurstRef = useRef<boolean>(false);
  const lastAlertTimeRef = useRef<number>(0);

  // Send proctoring violation to backend
  const reportAudioViolation = async (continuousMs: number, occurrences: number, peakRms: number) => {
    const now = Date.now();
    if (now - lastAlertTimeRef.current < ALERT_COOLDOWN_MS) {
      return; // Cooldown active
    }
    lastAlertTimeRef.current = now;

    const token = getStoredToken();
    if (!token) return;

    const durSec = Math.max(1, Math.round(continuousMs / 1000));
    try {
      await fetch(`${API_BASE_URL}/student/exams/${examId}/attempts/${attemptId}/proctoring/violation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "AUDIO_VIOLATION",
          description: `Acoustic threshold exceeded in student environment (Continuous: ${durSec}s, Incidents: ${occurrences})`,
          metadata: {
            duration_seconds: durSec,
            occurrences: occurrences,
            peak_rms: Number(peakRms.toFixed(3)),
            timestamp: new Date().toISOString(),
          },
        }),
      });

      toast.error("⚠️ Noise / Audio Alert: Sound detected above threshold. Please maintain silence.", {
        id: "audio-violation-toast",
        duration: 4000,
      });
    } catch (err) {
      console.error("Failed to report audio violation:", err);
    }
  };

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    // Start video and audio streams
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
            source.connect(analyser); // Do not connect to destination to prevent feedback

            setMicActive(true);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            audioIntervalRef.current = setInterval(() => {
              analyser.getByteTimeDomainData(dataArray);

              // Calculate Root Mean Square (RMS) volume
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                const val = (dataArray[i] - 128) / 128; // normalize -1.0 to 1.0
                sum += val * val;
              }
              const rms = Math.sqrt(sum / dataArray.length);

              if (rms > SOUND_THRESHOLD) {
                continuousLoudMsRef.current += AUDIO_SAMPLE_INTERVAL_MS;

                if (!inBurstRef.current) {
                  inBurstRef.current = true;
                  loudOccurrencesRef.current += 1;
                }

                if (
                  continuousLoudMsRef.current >= SUSTAINED_DURATION_THRESHOLD_MS ||
                  loudOccurrencesRef.current >= OCCURRENCE_THRESHOLD
                ) {
                  reportAudioViolation(continuousLoudMsRef.current, loudOccurrencesRef.current, rms);
                  continuousLoudMsRef.current = 0; // reset continuous counter after alert
                }
              } else {
                inBurstRef.current = false;
                // Decay continuous loud counter gradually
                continuousLoudMsRef.current = Math.max(0, continuousLoudMsRef.current - AUDIO_SAMPLE_INTERVAL_MS * 2);
              }
            }, AUDIO_SAMPLE_INTERVAL_MS);
          }
        } catch (audioErr) {
          console.warn("Web Audio API not supported or failed to initialize:", audioErr);
        }
      } catch (err) {
        console.error("Error accessing camera/microphone for proctoring", err);
        setError("Camera/Mic access lost. Proctoring may fail.");
      }
    };

    startMedia();

    // Cleanup on unmount
    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const currentStream = videoRef.current.srcObject as MediaStream;
        currentStream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, attemptId]);

  useEffect(() => {
    // Stop capturing if stream is missing
    if (!stream) return;

    // Capture and upload frame
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
            const res = await fetch(
              `${API_BASE_URL}/student/exams/${examId}/attempts/${attemptId}/proctoring/frame`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                body: formData,
              }
            );

            if (!res.ok) {
              console.warn("Proctoring frame upload failed:", await res.text());
            }
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
      <div className="w-36 h-28 bg-black rounded-lg overflow-hidden border-2 border-slate-700 shadow-xl relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform -scale-x-100"
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 text-white text-[0.6rem] text-center p-1 font-bold">
            {error}
          </div>
        )}
        {!stream && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <div className="w-4 h-4 border-2 border-slate-500 border-t-white rounded-full animate-spin"></div>
          </div>
        )}
        <div className="absolute bottom-1 right-1 flex items-center gap-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[0.6rem] font-bold text-white">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
          <span>REC</span>
          {micActive && (
            <span className="material-symbols-outlined text-[10px] text-emerald-400" title="Audio Isolation Active">
              mic
            </span>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
