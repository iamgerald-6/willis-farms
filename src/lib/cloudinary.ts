// Single source for the Cloudinary account config every upload flow in the
// app shares — careers CVs (careers/uploadCv.ts), Task Manager document
// extraction (DocumentExtractionModal.tsx), policy documents
// (policies/uploadModal.tsx), and the general content library
// (addContentModal.tsx) each used to type the cloud name and upload preset
// out by hand independently. Identical everywhere today, so nothing was
// actually broken by that — but one shared source means a future account
// change (or moving the preset name) only has to happen once.
//
// These are read client-side (every consumer above is a "use client"
// component), so the env var names need the NEXT_PUBLIC_ prefix Next.js
// requires to inline them into the browser bundle. Both fall back to
// today's values, so behavior is unchanged unless those env vars are
// deliberately set.
export const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dmvr8ooz1";
export const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "willsUpload";

/** Builds the upload endpoint for a given Cloudinary resource type ("image", "video", "raw", or "auto"). */
export function cloudinaryUploadUrl(resourceType: string): string {
  return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
}
