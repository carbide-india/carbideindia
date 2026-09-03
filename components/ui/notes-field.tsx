"use client";

import * as React from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";

/**
 * Minimal Web Speech API typing - `SpeechRecognition` isn't in every TS
 * lib.dom, and Chromium exposes it as `webkitSpeechRecognition`.
 */
type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & {
  isFinal: boolean;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort?(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * A Notes textarea with an in-box microphone that dictates speech straight
 * into the field (browser speech-to-text). Transcribed phrases are appended
 * to whatever is already typed. The mic hides itself when the browser has no
 * SpeechRecognition support. Controlled - drive it via RHF `Controller`.
 *
 * This is the app-wide Notes control: any Notes field should use it so voice
 * dictation is available everywhere.
 */
export function NotesField({
  value,
  onChange,
  id,
  placeholder,
  rows = 3,
  className,
  ariaLabel,
  lang = "en-IN",
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  ariaLabel?: string;
  /** BCP-47 dictation locale - defaults to Indian English. */
  lang?: string;
}) {
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  // Latest value in a ref so the async onresult always appends to fresh text.
  const valueRef = React.useRef(value);
  valueRef.current = value;
  // Text committed BEFORE this dictation session started + the finalised text so
  // far — interim (live) words are shown on top without being committed twice.
  const baseRef = React.useRef("");
  const finalRef = React.useRef("");
  // The user's intent, so a mid-sentence auto-stop (Chrome cuts off on silence)
  // can transparently restart instead of ending the session.
  const wantRef = React.useRef(false);
  const supported = React.useMemo(() => getRecognitionCtor() !== null, []);

  const join = (a: string, b: string) =>
    !b ? a : a && !a.endsWith(" ") && !a.endsWith("\n") ? `${a} ${b}` : `${a}${b}`;

  const stop = React.useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  function toggle() {
    if (listening) {
      stop();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      fireToast({
        message: "Voice dictation isn't supported in this browser - try Chrome or Edge.",
        type: "error",
      });
      return;
    }
    // Anchor to whatever is already typed; dictation is appended to it.
    baseRef.current = valueRef.current ?? "";
    finalRef.current = "";
    wantRef.current = true;

    const start = () => {
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true; // live words as you speak
      rec.continuous = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        // Split the results into finalised vs still-interim; commit finals to
        // finalRef, show interim live on top so it feels instant.
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res?.[0]?.transcript ?? "";
          if (res?.isFinal) finalRef.current = join(finalRef.current, text.trim());
          else interim += text;
        }
        onChange(join(join(baseRef.current, finalRef.current), interim.trim()));
      };
      rec.onend = () => {
        // Auto-restart on Chrome's silence cut-off while the user still wants to
        // dictate; otherwise settle on the finalised text.
        if (wantRef.current) {
          try {
            rec.start();
            return;
          } catch {
            /* fall through to stop */
          }
        }
        onChange(join(baseRef.current, finalRef.current));
        setListening(false);
        recRef.current = null;
      };
      rec.onerror = (ev) => {
        if (ev.error === "no-speech" && wantRef.current) return; // keep listening
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          fireToast({ message: "Microphone access was blocked — allow it and try again.", type: "error" });
        }
        wantRef.current = false;
        setListening(false);
      };
      recRef.current = rec;
      rec.start();
    };

    setListening(true);
    start();
  }

  // Stop any in-flight recognition if the field unmounts.
  React.useEffect(
    () => () => {
      wantRef.current = false;
      recRef.current?.stop();
    },
    [],
  );

  return (
    <div className="relative">
      <textarea
        id={id}
        rows={rows}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn("nt-input resize-y", supported ? "pb-11" : undefined, className)}
        style={{ fontWeight: 400 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {supported && (
        <button
          type="button"
          onClick={toggle}
          aria-label={listening ? "Stop dictation" : "Dictate with Voice"}
          aria-pressed={listening}
          title={listening ? "Stop dictation" : "Dictate with Voice"}
          className={cn(
            "absolute bottom-2 z-10 right-2 inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition",
            listening
              ? "animate-pulse border-[#d32f2f] bg-[#fdecec] text-[#d32f2f]"
              : "border-[#dcdce8] bg-white text-[#3f3f94] hover:border-[#3f3f94] hover:bg-[#efeffb]",
          )}
        >
          <Mic className="h-[15px] w-[15px]" />
          {listening ? "Listening…" : "Dictate with Voice"}
        </button>
      )}
    </div>
  );
}
