import type { TMSubtask } from "@/types/taskManager";

/** Subtasks can nest this many levels deep (depth 1 = a direct child of the task). */
export const MAX_SUBTASK_DEPTH = 4;

/** Raw row shape as stored/returned by Supabase — same fields, no `children`. */
type SubtaskRow = Omit<TMSubtask, "children">;

/** Nests a flat list of subtask rows into a tree, each level sorted by `position`. */
export function buildSubtaskTree(rows: SubtaskRow[]): TMSubtask[] {
  const byParent = new Map<string | null, SubtaskRow[]>();
  for (const row of rows) {
    const key = row.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(row);
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.position - b.position);

  const attach = (parentId: string | null): TMSubtask[] =>
    (byParent.get(parentId) ?? []).map((row) => ({ ...row, children: attach(row.id) }));

  return attach(null);
}

/**
 * A node's own completion, 0-100. Leaf (no children) = 100 if ticked done,
 * else 0 — the only place a human's tick actually counts. Any node WITH
 * children ignores its own is_done entirely and is instead the weighted sum
 * of its children's completion, cascading all the way up. Matches Sheila's
 * "build a house" example: buy materials (10%) + hire staff (10%) + paint
 * house (50%) + pay contractors (30%) = 100% once every leaf is ticked.
 */
export function computeNodeCompletion(node: TMSubtask): number {
  if (!node.children || node.children.length === 0) {
    return node.is_done ? 100 : 0;
  }
  const weighted = node.children.reduce((sum, child) => sum + (child.weight_percent / 100) * computeNodeCompletion(child), 0);
  return Math.round(weighted);
}

/**
 * The task-level rollup: the weighted completion of the top-level subtask
 * group. Returns null when the task has no subtasks at all — callers should
 * treat null as "this task isn't using subtasks, leave progress_percent
 * alone / fall back to the manual slider" rather than as 0%.
 */
export function computeTaskRollup(tree: TMSubtask[]): number | null {
  if (tree.length === 0) return null;
  const weighted = tree.reduce((sum, node) => sum + (node.weight_percent / 100) * computeNodeCompletion(node), 0);
  return Math.round(weighted);
}

/** Sum of weight_percent across a flat list of sibling items (draft rows, not full TMSubtask). */
export function sumWeights(items: { weight_percent: number }[]): number {
  return items.reduce((sum, item) => sum + (Number(item.weight_percent) || 0), 0);
}

/**
 * Cleans up a raw, possibly-imperfect list of {title, weight_percent} —
 * e.g. straight from document extraction, where Claude's percentages are a
 * best-effort read of the document and won't always add up to exactly 100 —
 * into a set that does, or returns null if it can't be salvaged (fewer than
 * two usable rows, or the weights are all zero/missing). Unlike the manual
 * subtask editor (which hard-blocks a save until the reviewer's numbers sum
 * to exactly 100), this is meant for a one-time bulk import: it's better to
 * proportionally rescale Claude's numbers to fit than to reject an
 * otherwise-good breakdown over rounding, and better to silently drop a
 * genuinely unusable breakdown than to save something that violates the
 * "siblings sum to 100" invariant everywhere else in the app relies on.
 */
export function normalizeSubtaskWeights(
  raw: { title?: string; weight_percent?: number }[] | undefined | null,
): { title: string; weight_percent: number }[] | null {
  if (!raw || raw.length < 2) return null;

  const valid = raw
    .map((r) => ({ title: (r.title ?? "").trim(), weight_percent: Number(r.weight_percent) }))
    .filter((r) => r.title && Number.isFinite(r.weight_percent) && r.weight_percent > 0);
  if (valid.length < 2) return null;

  const total = valid.reduce((sum, r) => sum + r.weight_percent, 0);
  if (total <= 0) return null;

  const rounded = valid.map((r) => Math.max(1, Math.round((r.weight_percent / total) * 100)));
  const drift = 100 - rounded.reduce((sum, n) => sum + n, 0);
  if (drift !== 0) {
    const maxIdx = rounded.reduce((best, val, i) => (val > rounded[best] ? i : best), 0);
    rounded[maxIdx] += drift;
  }
  if (rounded.some((w) => w < 1) || rounded.reduce((sum, n) => sum + n, 0) !== 100) return null;

  return valid.map((r, i) => ({ title: r.title, weight_percent: rounded[i] }));
}
