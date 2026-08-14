"use client";

import { LoaderCircle, Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TalkSessionResponse } from "@/lib/types";
import { sendTalkAudio, startTalkFromBrowser, stopTalk } from "@/lib/talk-client";

type TalkState = "idle" | "connecting" | "talking" | "error";

export function HoldToTalkButton({ cameraId, disabled, unsupportedReason }: {
  cameraId: string;
  disabled?: boolean;
  unsupportedReason?: string;
}) {
  const [state, setState] = useState<TalkState>("idle");
  const [error, setError] = useState(unsupportedReason ?? "");
  const sessionRef = useRef<TalkSessionResponse | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const contextRef = useRef<AudioContext | undefined>(undefined);
  const processorRef = useRef<ScriptProcessorNode | undefined>(undefined);
  const releaseRequested = useRef(false);
  const queue = useRef<ArrayBuffer[]>([]);
  const sending = useRef(false);

  useEffect(() => () => { releaseRequested.current = true; void finish(); }, []);

  const begin = async () => {
    if (disabled || unsupportedReason || state === "connecting" || state === "talking") return;
    releaseRequested.current = false; setError(""); setState("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("microphone_not_available");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      }, video: false });
      streamRef.current = stream;
      const session = await startTalkFromBrowser(cameraId);
      sessionRef.current = session;
      if (releaseRequested.current) { await finish(); return; }
      const context = new AudioContext({ latencyHint: "interactive" });
      contextRef.current = context;
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(1024, 1, 1);
      const silent = context.createGain(); silent.gain.value = 0;
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        if (releaseRequested.current) return;
        const pcm = downsamplePcm16(event.inputBuffer.getChannelData(0), context.sampleRate, session.audio.sampleRate);
        queue.current.push(pcm);
        if (queue.current.length > 8) queue.current.splice(0, queue.current.length - 8);
        void flush();
      };
      source.connect(processor); processor.connect(silent); silent.connect(context.destination);
      setState("talking");
    } catch (cause) {
      setError(talkMessage(cause)); setState("error");
      await finish(false);
    }
  };

  const flush = async () => {
    if (sending.current) return;
    const session = sessionRef.current; if (!session) return;
    sending.current = true;
    try {
      while (!releaseRequested.current && queue.current.length) {
        const chunk = queue.current.shift(); if (chunk) await sendTalkAudio(session, chunk);
      }
    } catch (cause) {
      setError(talkMessage(cause)); setState("error"); releaseRequested.current = true;
      await finish(false);
    } finally { sending.current = false; }
  };

  const finish = async (returnIdle = true) => {
    releaseRequested.current = true; queue.current = [];
    processorRef.current?.disconnect(); processorRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = undefined;
    const context = contextRef.current; contextRef.current = undefined;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    const session = sessionRef.current; sessionRef.current = undefined;
    if (session) await stopTalk(session).catch(() => undefined);
    if (returnIdle) setState("idle");
  };

  const release = () => { releaseRequested.current = true; void finish(); };
  const title = unsupportedReason ? `Talk unavailable: ${unsupportedReason}` :
    error ? `Talk failed: ${error}` : state === "talking" ? "Release to stop talking" : "Hold to talk";
  return (
    <button
      className={`hold-to-talk ${state === "talking" ? "is-talking" : ""} ${state === "error" ? "has-error" : ""}`}
      aria-label={state === "talking" ? "Talking; release to stop" : "Hold to talk"}
      aria-pressed={state === "talking"}
      title={title}
      disabled={disabled || Boolean(unsupportedReason)}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); void begin(); }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); void begin(); } }}
      onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); release(); } }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {state === "connecting" ? <LoaderCircle size={15} className="spin" /> :
        state === "error" ? <MicOff size={15} /> : <Mic size={15} />}
      <span className="talk-label">{state === "talking" ? "Talking" : "Hold"}</span>
    </button>
  );
}

function downsamplePcm16(input: Float32Array, inputRate: number, outputRate: number) {
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new ArrayBuffer(length * 2);
  const view = new DataView(output);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio); const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0; for (let source = start; source < end && source < input.length; source += 1) sum += input[source] ?? 0;
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return output;
}

function talkMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "talkback_unavailable";
  const messages: Record<string, string> = {
    NotAllowedError: "microphone permission was denied",
    microphone_not_available: "this browser has no microphone access",
    talkback_busy: "another operator is already talking",
    talkback_not_supported: "this device/channel does not support a compatible backchannel",
    device_credentials_rejected: "the saved device credentials were rejected",
  };
  return messages[code] ?? messages[error instanceof DOMException ? error.name : ""] ?? code.replaceAll("_", " ");
}
