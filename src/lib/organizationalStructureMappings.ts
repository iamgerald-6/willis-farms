// Shared types for the Organizational Structure "Mapping set up" feature —
// user-created groups (accordion panels) that link one org structure list
// to another (e.g. Sites & business units), each holding its own set of
// parent<->child mapping rows. See docs/organizational-structure/
// mapping-groups.sql for the tables themselves.
//
// A "list ref" identifies which list a group's parent/child side points at
// — either one of the 5 fixed lists (Sites, Business units, Departments,
// Sections, Grade levels) or a custom list type created from Set up. Both
// are stored in the same `parent_list_key`/`child_list_key` text column:
// fixed lists as their plain key ("sites"), custom lists as
// "custom:<list_type_id>". No schema change needed to support custom lists
// here — just this encoding.

import { isOrgStructureListKey, type OrgStructureListKey } from "@/lib/organizationalStructure";

export type OrgListRef =
  | { kind: "fixed"; key: OrgStructureListKey }
  | { kind: "custom"; id: string };

const CUSTOM_PREFIX = "custom:";

export function encodeListRef(ref: OrgListRef): string {
  return ref.kind === "fixed" ? ref.key : `${CUSTOM_PREFIX}${ref.id}`;
}

export function parseListRef(value: string): OrgListRef | null {
  if (value.startsWith(CUSTOM_PREFIX)) {
    const id = value.slice(CUSTOM_PREFIX.length);
    return id ? { kind: "custom", id } : null;
  }
  return isOrgStructureListKey(value) ? { kind: "fixed", key: value } : null;
}

export type OrgMappingGroup = {
  id: string;
  /** Encoded OrgListRef — see parseListRef/encodeListRef above. */
  parent_list_key: string;
  child_list_key: string;
  title: string;
  /** Name of this group's own physical table, e.g. "mapping_sections_positions". */
  table_name: string;
  /** Real column names on that table, e.g. "section_id" / "position_id". */
  parent_column: string;
  child_column: string;
  sort_order: number;
  created_at: string;
};

/**
 * A row in a mapping group's own table, as the API returns it — always
 * shaped as parent_row_id/child_row_id regardless of the group, even
 * though the underlying table's columns are named after its lists (see
 * parent_column/child_column on OrgMappingGroup). The API translates
 * between the two so the frontend doesn't need to know column names.
 */
export type OrgMappingRow = {
  id: string;
  parent_row_id: string;
  child_row_id: string;
  created_at: string;
};
