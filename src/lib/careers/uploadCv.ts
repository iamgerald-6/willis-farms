import { CLOUDINARY_UPLOAD_PRESET, cloudinaryUploadUrl } from "@/lib/cloudinary";
import { validateCvOrJdFile } from "@/lib/uploadConstraints";

export async function uploadCvToCloudinary(
  file: File,
): Promise<{ secure_url: string; public_id: string }> {
  const validationError = validateCvOrJdFile(file);
  if (validationError) {
    throw new Error(validationError);
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "CareersCVs");

  const resourceType =
    file.type.startsWith("image/") || file.type === "application/pdf"
      ? "image"
      : "raw";

  const res = await fetch(cloudinaryUploadUrl(resourceType), { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    const message =
      json?.error?.message ?? `Upload failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return { secure_url: json.secure_url, public_id: json.public_id };
}
