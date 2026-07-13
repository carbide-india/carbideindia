"use client";

import * as React from "react";
import { upload } from "@vercel/blob/client";
import { Loader2, Mic, Square, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";

/* ── Voice-note recorder (browser → Vercel Blob, client-direct) ─────────
 *
 * Records a short voice note via MediaRecorder, assembles the chunks into an
 * audio/webm Blob and uploads it to Blob storage using the same client-direct
 * pattern as the business-card / sample-photo uploads (browser PUTs straight
 * to Blob, the /api/documents/upload route only mints a scoped token). The
 * resulting public URL is handed back via onChange for the form to persist.
 */

interface Props {
  value?: string;
  onChange: (url: string | undefined) => void;
  /** Distinguishes the three stage recorders in aria labels + blob names. */
  label?: string;
}

const INDIGO = "#3f3f94";

/** Sanitize a label into something safe for a blob pathname segment. */
function safeSlug(label: string): string {
  return label.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 40) || "note";
}

/** Upload a recorded audio blob under documents/ (route requires that prefix). */
function uploadVoiceNote(blob: Blob, label: string) {
  const contentType = blob.type || "audio/webm";
  const name = `documents/voice-note-${safeSlug(label)}-${Date.now()}.webm`;
  return upload(name, blob, {
    access: "public",
    handleUploadUrl: "/api/documents/upload",
    contentType,
    clientPayload: JSON.stringify({ contentType }),
  });
}

export function AudioNoteRecorder({ value, onChange, label = "Voice Note" }: Props) {
  const [recording, setRecording] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Stop any in-flight recording + release the mic when this unmounts.
  React.useEffect(() => {
    return () => {
      clearTimer();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [clearTimer]);

  async function startRecording() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      fireToast({
        message: "Voice recording is not supported in this browser.",
        type: "error",
      });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Permission denied, no mic, or a hardware error all land here.
      fireToast({
        message: "Microphone access was blocked — allow it to record a voice note.",
        type: "error",
      });
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      fireToast({
        message: "Could not start recording on this device.",
        type: "error",
      });
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimer();
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];
      if (blob.size === 0) return;
      void uploadRecorded(blob);
    };

    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setRecording(true);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  async function uploadRecorded(blob: Blob) {
    setUploading(true);
    try {
      const result = await uploadVoiceNote(blob, label);
      onChange(result.url);
    } catch {
      // Missing BLOB_READ_WRITE_TOKEN (or a Blob outage) lands here.
      fireToast({
        message: "Voice note upload unavailable — check storage configuration.",
        type: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  // ── Uploaded state: inline player + re-record / remove ──
  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          controls
          src={value}
          className="h-9 max-w-[240px] rounded-lg"
          aria-label={`${label} playback`}
        />
        <button
          type="button"
          onClick={() => void startRecording()}
          disabled={recording || uploading}
          aria-label={`Re-record ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9ea] bg-[#f4f4fd] px-2.5 py-1.5 text-[12px] font-bold transition hover:border-[#3f3f94] hover:bg-[#eeeefb] disabled:opacity-60"
          style={{ color: INDIGO }}
        >
          <Mic className="h-[15px] w-[15px]" />
          Re-record
        </button>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={`Remove ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
        >
          <Trash2 className="h-[15px] w-[15px]" />
          Remove
        </button>
      </div>
    );
  }

  // ── Recording state: pulsing dot + elapsed + stop ──
  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={stopRecording}
          aria-label={`Stop recording ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#f0b4b4] bg-[#fdf3f3] px-2.5 py-1.5 text-[12px] font-bold text-[#d32f2f] transition hover:bg-[#fbe9e9]"
        >
          <Square className="h-[13px] w-[13px]" fill="currentColor" />
          Stop
        </button>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
          <span
            className="inline-block size-[9px] animate-pulse rounded-full bg-[#d32f2f]"
            aria-hidden="true"
          />
          {mm}:{ss}
        </span>
      </div>
    );
  }

  // ── Idle state: record button (or an uploading spinner) ──
  return (
    <button
      type="button"
      onClick={() => void startRecording()}
      disabled={uploading}
      aria-label={`Record ${label.toLowerCase()}`}
      className="inline-flex w-max items-center gap-1.5 rounded-lg border border-[#c9c9ea] bg-[#f4f4fd] px-2.5 py-1.5 text-[12px] font-bold transition hover:border-[#3f3f94] hover:bg-[#eeeefb] disabled:opacity-60"
      style={{ color: INDIGO }}
    >
      {uploading ? (
        <>
          <Loader2
            className="h-[15px] w-[15px]"
            style={{ animation: "spinFast 0.8s linear infinite" }}
          />
          Uploading
        </>
      ) : (
        <>
          <Mic className="h-[15px] w-[15px]" />
          Record
        </>
      )}
    </button>
  );
}
