import JSZip from "jszip";

/** Bundles a handful of already-rendered PDF buffers into a single zip
 * buffer — used when both the AI-generated and HR-edited copies of a
 * report need to go out together (download or email) instead of just
 * whichever one is "current". */
export async function zipReportPdfs(
  files: { filename: string; buffer: Buffer }[],
): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.buffer);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
