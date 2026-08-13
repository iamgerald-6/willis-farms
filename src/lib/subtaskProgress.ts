import type { DisplayStatus, TMSubtask } from "@/types/taskManager";

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
 * children ignores its own is_done entirely and is instead derived from its
 * children, cascading all the way up. Matches Sheila's "build a house"
 * example: buy materials (10%) + hire staff (10%) + paint house (50%) + pay
 * contractors (30%) = 100% once every leaf is ticked.
 *
 * weight_percent is ABSOLUTE at every depth — each node's own share of the
 * WHOLE task, not a fraction of its immediate parent. A group of siblings'
 * weights sum to their immediate parent's own weight_percent (enforced at
 * save time — see the subtasks PUT route), with the task itself standing in
 * as an implicit "parent" of weight 100 for the top-level group. So a 30%
 * subtask broken into 4 even children gets children weighing ~7.5% each
 * (rounded), not 25% each — they add up to 30, not to 100.
 *
 * Because of that, a parent node's own 0-100 completion has to be expressed
 * relative to ITS OWN weight, not to 100: sum up how much of the node's
 * absolute weight is actually done (each child's weight × that child's own
 * completion), then divide by the node's own weight_percent to turn it back
 * into a plain 0-100 "how much of what I'm allocated is finished" number —
 * e.g. one of four ~7.5%-weight children done = 7.5 of the parent's 30 done
 * = 25% complete, the same number a reviewer would expect from "1 of 4".
 */
export function computeNodeCompletion(node: TMSubtask): number {
  if (!node.children || node.children.length === 0) {
    return node.is_done ? 100 : 0;
  }
  if (!node.weight_percent) return 0;
  const doneAbsolute = node.children.reduce((sum, child) => sum + (child.weight_percent / 100) * computeNodeCompletion(child), 0);
  return Math.round((doneAbsolute / node.weight_percent) * 100);
}

/**
 * The task-level rollup: the weighted completion of the top-level subtask
 * group. Unchanged by the switch to absolute nested weights above — the
 * top-level group's own weights were already absolute (they sum to 100,
 * the task's own "weight"), so this formula reads the same either way.
 * Returns null when the task has no subtasks at all — callers should treat
 * null as "this task isn't using subtasks, leave progress_percent alone /
 * fall back to the manual slider" rather than as 0%.
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
 * Splits `total` into `count` whole-number shares as evenly as possible
 * (e.g. 100 over 4 -> [25,25,25,25], 100 over 3 -> [34,33,33], 30 over 4 ->
 * [8,8,7,7]) — any remainder from the division goes to the first few shares
 * so the total is always exactly `total`, never off by a point of rounding.
 * `total` defaults to 100 for a top-level group; a nested group passes the
 * parent subtask's own weight_percent instead, since children now weigh a
 * share of their parent's allocation rather than always summing to 100 (see
 * computeNodeCompletion). Used to auto-populate a sibling group's weights
 * whenever a row is added or removed, so the common "just split evenly"
 * case never requires typing numbers by hand; a reviewer can still type
 * over any individual weight afterward for an intentionally uneven split.
 */
export function evenSplitWeights(count: number, total: number = 100): number[] {
  if (count <= 0 || total <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => (i < remainder ? base + 1 : base));
}

/**
 * Proportionally rescales a set of sibling weights to a new total, keeping
 * each item's relative SHARE the same as closely as whole numbers allow
 * (largest-remainder rounding — same idea as evenSplitWeights, but weighted
 * instead of even). Used when an existing subtask's own weight_percent
 * changes (e.g. a new sibling was added, shrinking it from 50 to 33) and it
 * already has children of its own — those children were saved summing to
 * the OLD weight, so they need to be re-proportioned to sum to the NEW one,
 * or the "children sum to their parent's weight_percent" invariant (see
 * computeNodeCompletion above) silently breaks. See the PUT /subtasks route,
 * which walks this down through every level of descendants — not just
 * direct children — one level at a time, so each level's own sum-to-parent
 * invariant holds all the way down.
 */
export function scaleWeightsToTotal<T extends { weight_percent: number }>(items: T[], newTotal: number): T[] {
  if (items.length === 0 || newTotal <= 0) return items;
  const oldTotal = items.reduce((sum, i) => sum + i.weight_percent, 0);
  if (oldTotal <= 0) return items;

  const raw = items.map((i) => (i.weight_percent / oldTotal) * newTotal);
  const floors = raw.map((v) => Math.max(1, Math.floor(v)));
  let remainder = newTotal - floors.reduce((sum, v) => sum + v, 0);

  // Hand out any leftover points to whichever rows were closest to rounding
  // up (largest fractional part first) so the total lands on newTotal
  // exactly, never off by a point.
  const byFractionDesc = raw
    .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; remainder > 0 && k < byFractionDesc.length; k++) {
    result[byFractionDesc[k % byFractionDesc.length].idx] += 1;
    remainder--;
  }
  // Only possible when newTotal is smaller than the item count (not even
  // one whole point each) — claw back from whichever rows can spare it.
  for (let j = result.length - 1; remainder < 0 && j >= 0; ) {
    if (result[j] > 1) {
      result[j] -= 1;
      remainder++;
    } else {
      j--;
    }
  }

  return items.map((item, i) => ({ ...item, weight_percent: result[i] }));
}

/**
 * Does `date` fall within [boundStart, boundEnd]? Either bound being
 * null/undefined means "no constraint on that side" — e.g. a task with no
 * due_date set yet imposes no ceiling on its subtasks' dates. A missing
 * `date` always passes — an unset date has nothing to validate. Dates are
 * plain ISO "YYYY-MM-DD" strings throughout this app, which sort/compare
 * correctly as strings.
 */
export function isDateWithin(
  date: string | null | undefined,
  boundStart: string | null | undefined,
  boundEnd: string | null | undefined,
): boolean {
  if (!date) return true;
  if (boundStart && date < boundStart) return false;
  if (boundEnd && date > boundEnd) return false;
  return true;
}

/**
 * A LEAF subtask's own status — the subtask equivalent of
 * computeDisplayStatus (taskAccessControl.ts), but working off is_done +
 * start_date/due_date instead of progress_percent, since a leaf subtask has
 * no percentage field of its own (only a tick). Ticked always wins; past due
 * and not ticked is Overdue regardless of whether it's "started"; otherwise
 * a start_date that's already arrived reads as In Progress (the closest
 * subtask-level analogue of progress_percent > 0), and anything else —
 * including a subtask with no dates set at all — is Not Started. Never
 * returns "Compliant / Ongoing", "Archived", or "Deleted" — those are
 * task-only lifecycle states that don't apply to a subtask.
 */
export function computeLeafSubtaskStatus(node: Pick<TMSubtask, "is_done" | "start_date" | "due_date">): DisplayStatus {
  if (node.is_done) return "Completed";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (node.due_date) {
    const due = new Date(node.due_date);
    due.setHours(0, 0, 0, 0);
    if (due.getTime() < today.getTime()) return "Overdue";
  }

  if (node.start_date) {
    const start = new Date(node.start_date);
    start.setHours(0, 0, 0, 0);
    if (start.getTime() <= today.getTime()) return "In Progress";
  }

  return "Not Started";
}

/**
 * The priority rule a client meeting confirmed for rolling a set of sibling
 * statuses up to their parent's (or the task's own): any Overdue wins
 * outright; otherwise all-Completed -> Completed, all-Not-Started -> Not
 * Started; any other mix (some done, some not, some in progress, etc.) ->
 * In Progress. Used both to aggregate a subtask node's children into that
 * node's own status, and to aggregate a task's top-level subtask group into
 * the task's own display_status.
 */
function computeGroupStatus(statuses: DisplayStatus[]): DisplayStatus {
  if (statuses.some((s) => s === "Overdue")) return "Overdue";
  if (statuses.every((s) => s === "Completed")) return "Completed";
  if (statuses.every((s) => s === "Not Started")) return "Not Started";
  return "In Progress";
}

/**
 * Walks the tree bottom-up, stamping a `status` onto every node — leaves via
 * computeLeafSubtaskStatus, any node with children via computeGroupStatus
 * over its (already-stamped) children. Returns a new tree; doesn't mutate
 * the input. This is what the subtask API routes run their trees through
 * before returning them, so the client never has to recompute status itself.
 */
export function attachSubtaskStatuses(nodes: TMSubtask[]): TMSubtask[] {
  return nodes.map((node) => {
    const children = node.children && node.children.length > 0 ? attachSubtaskStatuses(node.children) : node.children;
    const status =
      children && children.length > 0
        ? computeGroupStatus(children.map((c) => c.status as DisplayStatus))
        : computeLeafSubtaskStatus(node);
    return { ...node, children, status };
  });
}

/**
 * The task-level rollup, status edition — the subtask-tree equivalent of
 * computeDisplayStatus. Returns null when the task has no subtasks at all
 * (mirrors computeTaskRollup's null convention), so callers know to fall
 * back to the ordinary due-date-driven status instead. Once a task has
 * subtasks, its own due_date stops driving its status — this is what drives
 * it instead, same priority rule as any other node in the tree.
 */
export function computeSubtaskGroupStatus(tree: TMSubtask[]): DisplayStatus | null {
  if (tree.length === 0) return null;
  const statused = attachSubtaskStatuses(tree);
  return computeGroupStatus(statused.map((n) => n.status as DisplayStatus));
}
