"use client";

import { Mic, MicOff, PhoneOff, X, MessageSquare, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HugoOrbState } from "@/lib/types";

/**
 * HugoSessionControls — the voice session control bar (PRD 5.4).
 *
 * Surfaces connect / disconnect, mic toggle, barge-in interrupt, and an escape
 * hatch to text chat, plus a live status badge driven by the orb state. Mic is
 * disabled until the realtime channel is connected. Every control has an
 * accessible label and keyboard-visible focus.
 */

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

const STATE_BADGE: Record<HugoOrbState, { label: string; variant: BadgeProps["variant"] }> = {
  idle: { label: "Idle", variant: "muted" },
  auth_required: { label: "Sign in required", variant: "warning" },
  connecting: { label: "Connecting", variant: "blue" },
  listening: { label: "Listening", variant: "cyan" },
  thinking: { label: "Thinking", variant: "blue" },
  speaking: { label: "Speaking", variant: "cyan" },
  interrupted: { label: "Interrupted", variant: "magenta" },
  tool_running: { label: "Running tool", variant: "magenta" },
  error: { label: "Error", variant: "error" },
  sleeping: { label: "Sleeping", variant: "muted" },
};

export function HugoSessionControls({
  orbState,
  isCapturing,
  status,
  onConnect,
  onDisconnect,
  onToggleMic,
  onInterrupt,
  onSwitchToText,
  className,
}: {
  orbState: HugoOrbState;
  isCapturing: boolean;
  status: ConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMic: () => void;
  onInterrupt: () => void;
  onSwitchToText: () => void;
  className?: string;
}) {
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const badge = STATE_BADGE[orbState];
  const canInterrupt =
    isConnected && (orbState === "speaking" || orbState === "thinking" || orbState === "tool_running");

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-border bg-surface/50 px-4 py-3",
        className,
      )}
    >
      {/* Live status */}
      <div className="flex items-center gap-2" aria-live="polite">
        <Radio
          aria-hidden
          className={cn(
            "size-3.5",
            isConnected ? "text-hugo-cyan" : isConnecting ? "text-hugo-blue" : "text-text-muted",
          )}
        />
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {!isConnected && !isConnecting ? (
          <Button
            variant="primary"
            size="md"
            onClick={onConnect}
            aria-label="Connect voice session"
          >
            <Mic aria-hidden />
            Connect
          </Button>
        ) : (
          <Button
            variant={isCapturing ? "subtle" : "outline"}
            size="md"
            onClick={onToggleMic}
            disabled={!isConnected}
            aria-pressed={isCapturing}
            aria-label={isCapturing ? "Mute microphone" : "Unmute microphone"}
          >
            {isCapturing ? <Mic aria-hidden /> : <MicOff aria-hidden />}
            {isCapturing ? "Mic on" : "Mic off"}
          </Button>
        )}

        <Button
          variant="ghost"
          size="md"
          onClick={onInterrupt}
          disabled={!canInterrupt}
          aria-label="Interrupt Hugo"
        >
          <X aria-hidden />
          Interrupt
        </Button>

        {(isConnected || isConnecting) && (
          <Button
            variant="destructive"
            size="md"
            onClick={onDisconnect}
            aria-label="End voice session"
          >
            <PhoneOff aria-hidden />
            End
          </Button>
        )}

        <Button
          variant="ghost"
          size="md"
          onClick={onSwitchToText}
          aria-label="Switch to text chat"
        >
          <MessageSquare aria-hidden />
          Text
        </Button>
      </div>
    </div>
  );
}
