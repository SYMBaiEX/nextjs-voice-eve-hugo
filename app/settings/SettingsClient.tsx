"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Brain,
  Gauge,
  Lock,
  Plus,
  Shield,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { VOICE_OPTIONS } from "@/lib/constants";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Separator, Skeleton, Spinner } from "@/components/ui/misc";
import { cn, formatUsd } from "@/lib/utils";

/**
 * SettingsClient — profile, preferences, usage, and memory (PRD 5.1, 5.9, 5.16).
 *
 * Preferences persist via api.users.updatePreferences; usage reads
 * todayForUser; memory is listed/added/removed via the memories.* functions.
 * Every section degrades gracefully while its query is loading.
 */

const MEMORY_TYPES = ["preference", "profile", "project", "instruction"] as const;
type MemoryType = (typeof MEMORY_TYPES)[number];

interface MemoryDoc {
  _id: Id<"memories">;
  type: MemoryType;
  key: string;
  value: string;
  updatedAt: number;
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="size-4 text-hugo-cyan" />
        {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

/** A labeled toggle row that persists immediately. */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
  pending,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <span className="text-xs text-text-muted">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={pending}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-hugo-cyan/60 disabled:opacity-50",
          checked
            ? "border-hugo-cyan/40 bg-hugo-cyan/30"
            : "border-border bg-surface-elevated",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-text-primary transition-transform",
            checked ? "translate-x-5" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

/** A labeled progress bar for a used / limit pair. */
function UsageBar({
  label,
  used,
  limit,
  unit,
  tone = "cyan",
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
  tone?: "cyan" | "magenta";
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit > 0 && used >= limit;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="font-mono text-xs text-text-muted">
          <span className={cn(over ? "text-error" : "text-text-primary")}>
            {used}
          </span>{" "}
          / {limit} {unit}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over
              ? "bg-error"
              : tone === "magenta"
                ? "bg-accent-magenta"
                : "bg-hugo-cyan",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SettingsClient() {
  const me = useQuery(api.users.currentUser);
  const usage = useQuery(api.usageEvents.todayForUser);
  const memories = useQuery(api.memories.listOwn) as MemoryDoc[] | undefined;

  const updatePreferences = useMutation(api.users.updatePreferences);
  const upsertMemory = useMutation(api.memories.upsert);
  const removeMemory = useMutation(api.memories.remove);

  const [savingPref, setSavingPref] = useState(false);

  const prefs = me?.preferences ?? {};

  const savePreference = useCallback(
    async (patch: {
      voice?: string;
      conciseVoice?: boolean;
      reducedMotion?: boolean;
    }) => {
      setSavingPref(true);
      try {
        await updatePreferences({ preferences: patch });
      } catch {
        toast.error("Couldn't save your preference.");
      } finally {
        setSavingPref(false);
      }
    },
    [updatePreferences],
  );

  // ---- Memory add form ----
  const [memKey, setMemKey] = useState("");
  const [memValue, setMemValue] = useState("");
  const [memType, setMemType] = useState<MemoryType>("preference");
  const [addingMemory, setAddingMemory] = useState(false);

  const addMemory = useCallback(async () => {
    const key = memKey.trim();
    const value = memValue.trim();
    if (!key || !value) return;
    setAddingMemory(true);
    try {
      await upsertMemory({ type: memType, key, value });
      setMemKey("");
      setMemValue("");
      toast.success("Memory saved.");
    } catch {
      toast.error("Couldn't save that memory.");
    } finally {
      setAddingMemory(false);
    }
  }, [memKey, memValue, memType, upsertMemory]);

  const deleteMemory = useCallback(
    async (id: Id<"memories">) => {
      try {
        await removeMemory({ memoryId: id });
        toast.success("Memory removed.");
      } catch {
        toast.error("Couldn't remove that memory.");
      }
    },
    [removeMemory],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">
          Settings
        </h1>
        <p className="text-sm text-text-secondary">
          Your profile, voice preferences, usage, and what Hugo remembers.
        </p>
      </div>

      {/* Profile */}
      <Card className="animate-rise">
        <SectionHeading
          icon={UserIcon}
          title="Profile"
          description="Your account identity."
        />
        <CardContent className="flex flex-col gap-3">
          {me === undefined ? (
            <>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-56" />
            </>
          ) : me === null ? (
            <p className="text-sm text-text-muted">Not signed in.</p>
          ) : (
            <dl className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm text-text-muted">Name</dt>
                <dd className="text-sm font-medium text-text-primary">
                  {me.name ?? "—"}
                </dd>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm text-text-muted">Email</dt>
                <dd className="truncate font-mono text-sm text-text-secondary">
                  {me.email ?? "—"}
                </dd>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm text-text-muted">Role</dt>
                <dd>
                  {me.role === "admin" ? (
                    <Badge variant="cyan" className="gap-1">
                      <Shield aria-hidden className="size-3" />
                      Admin
                    </Badge>
                  ) : (
                    <Badge variant="muted">User</Badge>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className="animate-rise">
        <SectionHeading
          icon={Gauge}
          title="Preferences"
          description="How Hugo looks and sounds for you."
        />
        <CardContent className="flex flex-col gap-5">
          {/* Theme */}
          <div className="flex items-center justify-between gap-4 py-1">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">Theme</span>
              <span className="text-xs text-text-muted">
                Switch between dark and light.
              </span>
            </div>
            <ThemeToggle />
          </div>

          <Separator />

          {/* Default voice */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="voice-select">Default voice</Label>
            <div className="flex items-center gap-2">
              <select
                id="voice-select"
                value={prefs.voice ?? VOICE_OPTIONS[0]}
                disabled={me === undefined || savingPref}
                onChange={(e) => void savePreference({ voice: e.target.value })}
                className={cn(
                  "h-10 w-full max-w-xs rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary capitalize",
                  "outline-none transition-colors focus-visible:border-hugo-cyan/50 focus-visible:ring-2 focus-visible:ring-hugo-cyan/20",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {VOICE_OPTIONS.map((voice) => (
                  <option key={voice} value={voice} className="capitalize">
                    {voice}
                  </option>
                ))}
              </select>
              {savingPref && <Spinner />}
            </div>
            <p className="text-xs text-text-muted">
              The voice Hugo uses for new realtime sessions.
            </p>
          </div>

          <Separator />

          <ToggleRow
            label="Concise voice replies"
            description="Keep spoken answers short and to the point."
            checked={prefs.conciseVoice ?? false}
            pending={me === undefined || savingPref}
            onChange={(next) => void savePreference({ conciseVoice: next })}
          />

          <Separator />

          <ToggleRow
            label="Reduce motion"
            description="Minimize orb and interface animations."
            checked={prefs.reducedMotion ?? false}
            pending={me === undefined || savingPref}
            onChange={(next) => void savePreference({ reducedMotion: next })}
          />
        </CardContent>
      </Card>

      {/* Usage today */}
      <Card className="animate-rise">
        <SectionHeading
          icon={Gauge}
          title="Usage today"
          description="Your activity against today's limits."
        />
        <CardContent className="flex flex-col gap-5">
          {usage === undefined ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : (
            <>
              <UsageBar
                label="Text messages"
                used={usage.textMessages}
                limit={usage.limits.dailyTextMessages}
                unit="msgs"
              />
              <UsageBar
                label="Voice minutes"
                used={usage.voiceMinutes}
                limit={usage.limits.dailyVoiceMinutes}
                unit="min"
                tone="magenta"
              />
              <Separator />
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-text-secondary">
                  Estimated cost today
                </span>
                <span className="font-mono text-sm text-text-primary">
                  {formatUsd(usage.estimatedCost)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Memory */}
      <Card className="animate-rise">
        <SectionHeading
          icon={Brain}
          title="Memory"
          description="Facts and preferences Hugo carries between conversations. Private to you."
        />
        <CardContent className="flex flex-col gap-5">
          {/* Add form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addMemory();
            }}
            className="flex flex-col gap-3 rounded-md border border-border bg-surface/40 p-3"
          >
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mem-type" className="text-xs">
                  Type
                </Label>
                <select
                  id="mem-type"
                  value={memType}
                  onChange={(e) => setMemType(e.target.value as MemoryType)}
                  className={cn(
                    "h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary capitalize",
                    "outline-none transition-colors focus-visible:border-hugo-cyan/50 focus-visible:ring-2 focus-visible:ring-hugo-cyan/20",
                  )}
                >
                  {MEMORY_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mem-key" className="text-xs">
                  Key
                </Label>
                <Input
                  id="mem-key"
                  value={memKey}
                  onChange={(e) => setMemKey(e.target.value)}
                  placeholder="e.g. preferred_name"
                  aria-label="Memory key"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mem-value" className="text-xs">
                Value
              </Label>
              <Input
                id="mem-value"
                value={memValue}
                onChange={(e) => setMemValue(e.target.value)}
                placeholder="e.g. Call me Sam"
                aria-label="Memory value"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!memKey.trim() || !memValue.trim() || addingMemory}
              >
                {addingMemory ? <Spinner /> : <Plus aria-hidden />}
                Add memory
              </Button>
            </div>
          </form>

          {/* List */}
          {memories === undefined ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : memories.length === 0 ? (
            <p className="px-1 py-2 text-sm text-text-muted">
              Hugo hasn&apos;t saved anything yet. Add a memory above, or it will
              learn as you talk.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {memories.map((m) => (
                <li
                  key={m._id}
                  className="flex items-start justify-between gap-3 p-3"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="muted" className="capitalize">
                        {m.type}
                      </Badge>
                      <span className="truncate font-mono text-xs text-text-secondary">
                        {m.key}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary">{m.value}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove memory ${m.key}`}
                    title="Remove"
                    className="shrink-0 text-text-muted hover:text-error"
                    onClick={() => void deleteMemory(m._id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card className="animate-rise border-border/60">
        <SectionHeading
          icon={Lock}
          title="Privacy"
          description="How your data is handled."
        />
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-text-muted">
            <li className="flex gap-2">
              <span aria-hidden className="text-hugo-cyan">
                ·
              </span>
              Voice is processed in real time through the Vercel AI Gateway to
              generate responses.
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-hugo-cyan">
                ·
              </span>
              Transcripts and conversation history are stored so you can revisit
              and continue them.
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-hugo-cyan">
                ·
              </span>
              You can delete any conversation or memory at any time, and deleted
              items are removed from your history.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
