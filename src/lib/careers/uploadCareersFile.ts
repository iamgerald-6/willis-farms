import { CLOUDINARY_UPLOAD_PRESET, cloudinaryUploadUrl } from "@/lib/cloudinary";

export async function uploadCareersFile(
  file: File,
  folder: string,
): Promise<{ secure_url: string; public_id: string; original_name: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", folder);

  const resourceType =
    file.type.startsWith("image/") || file.type === "application/pdf"
      ? "image"
      : "raw";

  const res = await fetch(cloudinaryUploadUrl(resourceType), {
    method: "POST",
    body: formData,
  });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    const message = json?.error?.message ?? `Upload failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  return {
    secure_url: json.secure_url,
    public_id: json.public_id,
    original_name: file.name,
  };
}
