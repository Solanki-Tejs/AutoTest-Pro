"use client";

import { useEffect, useRef, useState } from "react";
import { getStoredToken } from "@/app/lib/auth";

interface WebcamProctorProps {
  examId: string;
  attemptId: string;
}

export default function WebcamProctor({ examId, attemptId }: WebcamProctorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Configuration
  const CAPTURE_INTERVAL_MS = 1000; // 10 seconds

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    
    // Start the webcam
    const startWebcam = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Error accessing webcam for proctoring", err);
        setError("Camera access lost. Proctoring may fail.");
      }
    };

    startWebcam();

    // Cleanup on unmount
    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const currentStream = videoRef.current.srcObject as MediaStream;
        currentStream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // Ensure canvas size matches video size
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      if (canvas.width === 0 || canvas.height === 0) return;

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob (JPEG)
      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const token = getStoredToken();
        if (!token) return;

        const formData = new FormData();
        formData.append("image", blob, "snapshot.jpg");

        try {
          const res = await fetch(`http://localhost:8000/api/student/exams/${examId}/attempts/${attemptId}/proctoring/frame`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`
            },
            body: formData,
          });

          if (!res.ok) {
            console.warn("Proctoring frame upload failed:", await res.text());
          }
        } catch (err) {
          console.error("Error uploading proctoring frame:", err);
        }
      }, "image/jpeg", 0.7); // 0.7 quality to save bandwidth
    };

    // Start interval
    intervalRef.current = setInterval(captureAndUpload, CAPTURE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stream, examId, attemptId]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="w-32 h-24 bg-black rounded-lg overflow-hidden border-2 border-slate-700 shadow-xl relative">
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
        <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-[0.6rem] font-bold text-white">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
          REC
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
