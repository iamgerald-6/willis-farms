// Shared types for the Organizational Structure "Mapping set up" feature —
// user-created groups (accordion panels) that link one org structure list
// to another (e.g. Sites & business units), each holding its own set of
// parent<->child mapping rows. See docs/organizational-structure/
// dynamic-mapping-tables.sql and mapping-column-names.sql for the tables
// themselves.
//
// A group's parent_list_key/child_list_key is always a plain
// org_custom_list_types.id — every list (the original 5 fixed ones and any
// custom list from Set up) lives in that same registry now, so there's no
// "fixed vs custom" distinction to encode here anymore. See
// docs/organizational-structure/merge-fixed-lists.sql for the migration
// that folded the old fixed-key format ("sites", "custom:<id>", etc.) into
// this plain-id format.

export type OrgMappingGroup = {
  id: string;
  /** org_custom_list_types.id for each side of the mapping. */
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
