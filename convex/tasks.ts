import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model/authz";

/**
 * User tasks / to-dos (PRD 5.10 "Jarvis" buildout). Scoped strictly per user,
 * same shape as convex/memories.ts: self-owned rows, soft-delete via a status
 * value rather than a hard delete.
 */

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("archived"),
);
const priorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

/** Create a task for the current user. */
export const createTask = mutation({
  args: {
    title: v.string(),
    dueDate: v.optional(v.number()),
    priority: v.optional(priorityValidator),
  },
  handler: async (ctx, { title, dueDate, priority }) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      userId: user._id,
      title,
      dueDate,
      status: "pending",
      priority: priority ?? "medium",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** The current user's tasks. Defaults to everything except archived. */
export const listOwnTasks = query({
  args: { status: v.optional(statusValidator), limit: v.optional(v.number()) },
  handler: async (ctx, { status, limit }) => {
    const user = await requireUser(ctx);
    const maxRows = Math.min(limit ?? 50, 200);
    const rows = status
      ? await ctx.db
          .query("tasks")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", user._id).eq("status", status),
          )
          .order("desc")
          .take(maxRows)
      : await ctx.db
          .query("tasks")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(maxRows);
    return status ? rows : rows.filter((t) => t.status !== "archived");
  },
});

/** Mark one of the current user's tasks completed. */
export const completeTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const user = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    if (task.userId !== user._id) throw new Error("Forbidden");
    const now = Date.now();
    await ctx.db.patch(taskId, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

/** Archive (soft-delete) one of the current user's tasks. */
export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const user = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    if (task.userId !== user._id) throw new Error("Forbidden");
    await ctx.db.patch(taskId, { status: "archived", updatedAt: Date.now() });
    return { ok: true };
  },
});
