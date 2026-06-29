"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Search, Shield, ShieldOff, UserCheck, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { cn, formatUsd, shortId, timeAgo } from "@/lib/utils";

type UserRow = {
  _id: Id<"users">;
  email: string | null;
  name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
  createdAt: number;
  lastSeenAt: number;
  isDefaultAdmin: boolean;
};

const COLSPAN = 7;

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);

  const users = useQuery(api.admin.listUsers, { search: search || undefined }) as
    | UserRow[]
    | undefined;

  const setRole = useMutation(api.admin.setUserRole);
  const setStatus = useMutation(api.admin.setUserStatus);
  const [pendingId, setPendingId] = useState<Id<"users"> | null>(null);

  async function handleRole(row: UserRow, role: "user" | "admin") {
    setPendingId(row._id);
    try {
      await setRole({ userId: row._id, role });
      toast.success(
        role === "admin"
          ? `Promoted ${row.email ?? "user"} to admin`
          : `Demoted ${row.email ?? "user"} to user`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setPendingId(null);
    }
  }

  async function handleStatus(row: UserRow, status: "active" | "disabled") {
    setPendingId(row._id);
    try {
      await setStatus({ userId: row._id, status });
      toast.success(
        status === "active"
          ? `Enabled ${row.email ?? "account"}`
          : `Disabled ${row.email ?? "account"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setPendingId(null);
    }
  }

  const total = users?.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-text-primary">Users</h1>
          <span className="font-mono text-xs text-text-muted">
            {users === undefined ? "—" : `${total} shown`}
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          Manage roles and account status across the workspace.
        </p>
      </header>

      <div className="relative max-w-sm">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          aria-label="Search users"
          className="pl-9"
        />
      </div>

      <div className="panel overflow-hidden p-0">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Email</TH>
              <TH>Name</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH>Last seen</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {users === undefined &&
              Array.from({ length: 6 }).map((_, i) => (
                <TR key={`s-${i}`} className="hover:bg-transparent">
                  <TD colSpan={COLSPAN}>
                    <Skeleton className="h-5 w-full" />
                  </TD>
                </TR>
              ))}

            {users !== undefined && total === 0 && (
              <TR className="hover:bg-transparent">
                <TD colSpan={COLSPAN} className="py-10 text-center text-text-muted">
                  No users match “{search}”.
                </TD>
              </TR>
            )}

            {users?.map((u) => {
              const protectedRow = u.isDefaultAdmin;
              const isPending = pendingId === u._id;
              return (
                <TR
                  key={u._id}
                  onClick={() => setSelected(u)}
                  className={cn(
                    "cursor-pointer",
                    selected?._id === u._id && "bg-surface-elevated/60",
                  )}
                >
                  <TD className="max-w-[16rem] truncate font-mono text-text-primary">
                    {u.email ?? <span className="text-text-muted">—</span>}
                  </TD>
                  <TD className="max-w-[12rem] truncate">
                    {u.name ?? <span className="text-text-muted">—</span>}
                  </TD>
                  <TD>
                    <Badge variant={u.role === "admin" ? "cyan" : "muted"}>
                      {u.role}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge variant={u.status === "active" ? "success" : "error"}>
                      {u.status}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-xs text-text-muted">
                    {timeAgo(u.createdAt)}
                  </TD>
                  <TD className="font-mono text-xs text-text-muted">
                    {timeAgo(u.lastSeenAt)}
                  </TD>
                  <TD
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {isPending && <Spinner className="mr-1" />}
                      {/* Role toggle */}
                      <ConfirmButton
                        label={
                          u.role === "admin" ? (
                            <>
                              <ShieldOff /> Demote
                            </>
                          ) : (
                            <>
                              <Shield /> Promote
                            </>
                          )
                        }
                        confirmLabel={u.role === "admin" ? "Demote?" : "Promote?"}
                        onConfirm={() =>
                          handleRole(u, u.role === "admin" ? "user" : "admin")
                        }
                        pending={isPending}
                        disabled={protectedRow}
                        title={protectedRow ? "Protected owner" : undefined}
                      />
                      {/* Status toggle */}
                      <ConfirmButton
                        label={
                          u.status === "active" ? (
                            <>
                              <UserX /> Disable
                            </>
                          ) : (
                            <>
                              <UserCheck /> Enable
                            </>
                          )
                        }
                        confirmLabel={
                          u.status === "active" ? "Disable?" : "Enable?"
                        }
                        onConfirm={() =>
                          handleStatus(
                            u,
                            u.status === "active" ? "disabled" : "active",
                          )
                        }
                        pending={isPending}
                        disabled={protectedRow}
                        title={protectedRow ? "Protected owner" : undefined}
                      />
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      {selected && (
        <UserDetailDrawer
          user={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function UserDetailDrawer({
  user,
  onClose,
}: {
  user: UserRow;
  onClose: () => void;
}) {
  const summary = useQuery(api.admin.userUsageSummary, { userId: user._id });

  const stats = useMemo(
    () =>
      summary
        ? [
            { label: "Conversations", value: String(summary.conversations) },
            { label: "Voice sessions", value: String(summary.voiceSessions) },
            { label: "Voice minutes", value: summary.voiceMinutes.toFixed(1) },
            { label: "Usage events", value: String(summary.usageEvents) },
            { label: "Est. cost", value: formatUsd(summary.estimatedCost) },
          ]
        : [],
    [summary],
  );

  return (
    <aside
      className="panel flex flex-col gap-4 p-5 animate-rise"
      aria-label={`Usage detail for ${user.email ?? "user"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-text-primary">
            {user.email ?? shortId(user._id)}
          </p>
          <p className="text-xs text-text-muted">
            {user.name ?? "No display name"} · {user.role}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close detail"
        >
          <X />
        </Button>
      </div>

      {summary === undefined ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border bg-surface-elevated/40 p-3"
            >
              <p className="font-mono text-lg text-text-primary">{s.value}</p>
              <p className="mt-0.5 text-xs text-text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
