"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X, FileText, Video, FileImage } from "lucide-react";
import Image from "next/image";
// Define schema
const contentSchema = z.object({
  title: z.string().min(3, "Title is required"),
  category: z.string().min(1, "Category required"),
  sub_category: z.string().min(1, "Subcategory required"),
  description: z.string().min(5, "Description required"),
  cover_image: z.instanceof(File, { message: "Cover image required" }),
  document: z.instanceof(File, { message: "Document required" }),
  document_read_minutes: z.number().min(1, "Read time required"),
  video: z.instanceof(File).optional(),
  video_duration_minutes: z.number().optional(),
});

export type ContentFormValues = z.infer<typeof contentSchema>;

interface Props {
  open: boolean;
  setOpen: (val: boolean) => void;
}

export default function AddContentModal({ open, setOpen }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, setValue } =
    useForm<ContentFormValues>({
      resolver: zodResolver(contentSchema),
    });
  const coverImage = watch("cover_image") as File | null;
  const documentFile = watch("document") as File | null;
  const videoFile = watch("video") as File | null;

  const uploadToCloudinary = async (file: File, folder: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "willsUpload");
    formData.append("folder", folder);

    const res = await fetch(
      "https://api.cloudinary.com/v1_1/dmvr8ooz1/upload",
      { method: "POST", body: formData }
    );
    const json = await res.json();
    return json.secure_url as string;
  };

  const onSubmit = async (data: ContentFormValues) => {
    setLoading(true);
    setMessage(null);
    try {
      // Upload each file to its folder
      const coverUrl = await uploadToCloudinary(data.cover_image, "WillImage");
      const docUrl = await uploadToCloudinary(data.document, "WillDocs");
      let videoUrl: string | undefined = undefined;
      if (data.video)
        videoUrl = await uploadToCloudinary(data.video, "WillsVideos");

      // Send all data + URLs to backend
      const res = await fetch("/api/content/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          category: data.category,
          sub_category: data.sub_category,
          description: data.description,
          cover_image_url: coverUrl,
          document_url: docUrl,
          document_read_minutes: data.document_read_minutes ?? null,
          video_url: videoUrl ?? null,
          video_duration_minutes: data.video_duration_minutes ?? null,
        }),
      });
      const result = await res.json();

      if (result.error) setMessage(result.error);
      else {
        setMessage("Content added successfully!");
        reset();
        setOpen(false);
      }
    } catch (err) {
      console.error(err);
      setMessage("Failed to add content");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] bg-white rounded shadow-lg p-6 max-h-[90vh] overflow-y-auto">
          <Dialog.Title className="text-xl font-bold mb-4 flex justify-between items-center">
            Add Learning Content
            <X className="cursor-pointer" onClick={() => setOpen(false)} />
          </Dialog.Title>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block font-medium mb-1">Title</label>
              <input
                type="text"
                {...register("title")}
                className="w-full border p-2 rounded"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block font-medium mb-1">Category</label>
                <input
                  type="text"
                  {...register("category")}
                  className="w-full border p-2 rounded"
                />
              </div>
              <div className="flex-1">
                <label className="block font-medium mb-1">Subcategory</label>
                <input
                  type="text"
                  {...register("sub_category")}
                  className="w-full border p-2 rounded"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium mb-1">Description</label>
              <textarea
                {...register("description")}
                className="w-full border p-2 rounded"
                rows={3}
              />
            </div>

            <div>
              <label className=" font-medium mb-1 flex items-center gap-1">
                <FileImage className="w-4 h-4" /> Cover Image
              </label>
              <input
                type="file"
                {...register("cover_image")}
                accept="image/*"
              />
              {coverImage && (
                <img
                  src={URL.createObjectURL(coverImage)}
                  alt="preview"
                  className="w-full h-40 object-cover mt-2 rounded"
                />
              )}
            </div>

            <div>
              <label className=" font-medium mb-1 flex items-center gap-1">
                <FileText className="w-4 h-4" /> Document (PDF/Word)
              </label>
              <input
                type="file"
                {...register("document")}
                accept=".pdf,.doc,.docx"
              />
              <input
                type="number"
                {...register("document_read_minutes", { valueAsNumber: true })}
                placeholder="Estimated Read Time (minutes)"
                className="border p-2 rounded mt-2 w-36"
              />
            </div>

            <div>
              <label className=" font-medium mb-1 flex items-center gap-1">
                <Video className="w-4 h-4" /> Video (Optional)
              </label>
              <input type="file" {...register("video")} accept="video/*" />
              <input
                type="number"
                {...register("video_duration_minutes", { valueAsNumber: true })}
                placeholder="Duration (minutes)"
                className="border p-2 rounded mt-2 w-36"
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 border rounded hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1"
                disabled={loading}
              >
                <Plus className="w-4 h-4" />
                {loading ? "Adding..." : "Add Content"}
              </button>
            </div>
            {message && (
              <p className="text-center mt-2 text-red-600">{message}</p>
            )}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
