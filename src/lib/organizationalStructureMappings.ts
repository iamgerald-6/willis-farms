// Shared types for the Organizational Structure "Mapping set up" feature —
// user-created groups (accordion panels) that link one org structure list
// to another (e.g. Sites & business units), each holding its own set of
// parent<->child mapping rows. See docs/organizational-structure/
// mapping-groups.sql for the tables themselves.

import type { OrgStructureListKey } from "@/lib/organizationalStructure";

export type OrgMappingGroup = {
  id: string;
  parent_list_key: OrgStructureListKey;
  child_list_key: OrgStructureListKey;
  title: string;
  sort_order: number;
  created_at: string;
};

export type OrgMappingRow = {
  id: string;
  group_id: string;
  parent_row_id: string;
  child_row_id: string;
  created_at: string;
};
