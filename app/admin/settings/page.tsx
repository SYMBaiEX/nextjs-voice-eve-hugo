"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { Info, Save } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { cn } from "@/lib/utils";
import {
  REALTIME_MODEL_OPTIONS,
  TEXT_MODEL_OPTIONS,
  VOICE_OPTIONS,
} from "@/lib/constants";

/**
 * Admin → Settings (PRD 5.8). Edits the runtime systemSettings record. Each
 * field saves independently via api.settings.update({key,value}) and is audited
 * server-side. Values are seeded from the effective settings (defaults + stored
 * overrides) returned by api.settings.getAll.
 */

type SettingsRecord = Record<string, unknown>;

const TOOL_POLICY_OPTIONS = [
  { value: "auto-safe", label: "auto-safe — risky tools require approval" },
  { value: "manual-all", label: "manual-all — every tool requires approval" },
] as const;

export default function AdminSettingsPage() {
  const settings = useQuery(api.settings.getAll) as
    | SettingsRecord
    | undefined;
  const loading = settings === undefined;

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Settings"
        description="System-wide defaults for models, voice, limits, and policy."
      />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-hugo-cyan/20 bg-hugo-cyan/5 px-3 py-2.5 text-xs text-text-secondary">
        <Info className="mt-0.5 size-3.5 shrink-0 text-hugo-cyan" />
        <p>
          Every change is{" "}
          <span className="text-text-primary">written to the audit log</span>{" "}
          with your account and a timestamp. Settings apply to new sessions
          immediately.
        </p>
      </div>

      {loading ? (
        <SettingsSkeleton />
      ) : (
        <SettingsForm settings={settings} />
      )}
    </div>
  );
}

function SettingsForm({ settings }: { settings: SettingsRecord }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Models & voice</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SelectField
            settingKey="defaultRealtimeModel"
            label="Default realtime model"
            current={asString(settings.defaultRealtimeModel)}
            options={REALTIME_MODEL_OPTIONS.map((m) => ({ value: m, label: m }))}
            hint="Used for new voice sessions when the user has no override."
          />
          <SelectField
            settingKey="defaultTextModel"
            label="Default text model"
            current={asString(settings.defaultTextModel)}
            options={TEXT_MODEL_OPTIONS.map((m) => ({ value: m, label: m }))}
            hint="Used for /api/chat completions."
          />
          <SelectField
            settingKey="defaultVoice"
            label="Default voice"
            current={asString(settings.defaultVoice)}
            options={VOICE_OPTIONS.map((v) => ({ value: v, label: v }))}
            hint="Voice timbre for new realtime sessions."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <NumberField
            settingKey="dailyVoiceMinutesLimit"
            label="Daily voice minutes / user"
            current={asNumber(settings.dailyVoiceMinutesLimit)}
            min={0}
            hint="Per-user voice cap, enforced server-side."
          />
          <NumberField
            settingKey="dailyTextMessagesLimit"
            label="Daily text messages / user"
            current={asNumber(settings.dailyTextMessagesLimit)}
            min={0}
            hint="Per-user text cap, enforced server-side."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy & access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SelectField
            settingKey="toolApprovalPolicy"
            label="Tool approval policy"
            current={asString(settings.toolApprovalPolicy)}
            options={TOOL_POLICY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            hint="Controls which tool calls land in the approval queue."
          />
          <ToggleField
            settingKey="guestPreviewEnabled"
            label="Guest preview"
            description="Allow signed-out visitors to try a limited live session."
            current={asBool(settings.guestPreviewEnabled)}
          />
          <ToggleField
            settingKey="maintenanceMode"
            label="Maintenance mode"
            description="Pause new sessions and show a maintenance notice."
            current={asBool(settings.maintenanceMode)}
            danger
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field components — each owns its draft state + per-field save.              */
/* -------------------------------------------------------------------------- */

/**
 * Local draft state that re-syncs to `source` whenever the server value changes,
 * using React's render-phase reset pattern (no effect, no cascading render).
 * Returns the draft, a setter, and the current source for dirty comparisons.
 */
function useResettableState<T>(source: T): [T, (v: T) => void] {
  const [draft, setDraft] = useState(source);
  const [prevSource, setPrevSource] = useState(source);
  if (source !== prevSource) {
    setPrevSource(source);
    setDraft(source);
  }
  return [draft, setDraft];
}

function useSaveSetting(key: string) {
  const update = useMutation(api.settings.update);
  const [saving, setSaving] = useState(false);

  async function save(value: unknown, label?: string) {
    setSaving(true);
    try {
      await update({ key, value });
      toast.success(`${label ?? key} updated`);
      return true;
    } catch {
      toast.error(`Could not update ${label ?? key}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { save, saving };
}

interface FieldOption {
  value: string;
  label: string;
}

function SelectField({
  settingKey,
  label,
  current,
  options,
  hint,
}: {
  settingKey: string;
  label: string;
  current: string;
  options: FieldOption[];
  hint?: string;
}) {
  const { save, saving } = useSaveSetting(settingKey);
  const [value, setValue] = useResettableState(current);
  const dirty = value !== current;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor={settingKey}>{label}</Label>
        <select
          id={settingKey}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={cn(
            "flex h-10 w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-mono text-text-primary",
            "outline-none transition-colors focus-visible:border-hugo-cyan/50 focus-visible:ring-2 focus-visible:ring-hugo-cyan/20",
          )}
        >
          {/* Include the current value even if it's not in the known option set. */}
          {!options.some((o) => o.value === value) && value ? (
            <option value={value}>{value}</option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
      <SaveButton
        dirty={dirty}
        saving={saving}
        onSave={() => save(value, label)}
      />
    </div>
  );
}

function NumberField({
  settingKey,
  label,
  current,
  min,
  hint,
}: {
  settingKey: string;
  label: string;
  current: number;
  min?: number;
  hint?: string;
}) {
  const { save, saving } = useSaveSetting(settingKey);
  const [value, setValue] = useResettableState(String(current));
  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= (min ?? -Infinity);
  const dirty = valid && parsed !== current;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor={settingKey}>{label}</Label>
        <Input
          id={settingKey}
          type="number"
          inputMode="numeric"
          min={min}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="font-mono tabular-nums"
        />
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
      <SaveButton
        dirty={dirty}
        saving={saving}
        onSave={() => save(parsed, label)}
      />
    </div>
  );
}

function ToggleField({
  settingKey,
  label,
  description,
  current,
  danger,
}: {
  settingKey: string;
  label: string;
  description: string;
  current: boolean;
  danger?: boolean;
}) {
  const { save, saving } = useSaveSetting(settingKey);
  const [value, setValue] = useResettableState(current);

  async function toggle() {
    const next = !value;
    setValue(next);
    const ok = await save(next, label);
    if (!ok) setValue(current); // revert on failure
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <Label className="text-text-primary">{label}</Label>
          {value ? (
            <Badge variant={danger ? "warning" : "success"}>on</Badge>
          ) : (
            <Badge variant="muted">off</Badge>
          )}
        </div>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={saving}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-hugo-cyan/40 disabled:opacity-50",
          value
            ? danger
              ? "border-warning/40 bg-warning/30"
              : "border-hugo-cyan/40 bg-hugo-cyan/30"
            : "border-border bg-surface-elevated",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 translate-x-1 rounded-full bg-text-primary transition-transform",
            value && "translate-x-6",
          )}
        />
      </button>
    </div>
  );
}

function SaveButton({
  dirty,
  saving,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={dirty ? "primary" : "subtle"}
      disabled={!dirty || saving}
      onClick={onSave}
      className="shrink-0"
    >
      {saving ? <Spinner /> : <Save className="size-4" />}
      Save
    </Button>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-5">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
          <CardFooter />
        </Card>
      ))}
    </div>
  );
}

/* ----------------------------- value coercion ----------------------------- */

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asBool(v: unknown): boolean {
  return v === true || v === "true";
}
