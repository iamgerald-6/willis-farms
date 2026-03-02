export type Role = "super_admin" | "admin" | "employee";

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  role: Role;
  created_at?: string;
  user_id?: string;
}

export interface Content {
  id: string;
  title: string;
  category: string;
  sub_category: string;
  description: string;
  cover_image_url?: string;
  video_url?: string;
  video_duration_minutes?: number;
  document_url?: string;
  document_read_minutes?: number;
  created_at: string;
  created_by: string;
}
