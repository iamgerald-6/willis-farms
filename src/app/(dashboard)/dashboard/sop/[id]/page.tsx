"use client";

import { useParams } from "next/navigation";
import { useAppNavigation } from "@/lib/navigation/appNavigation";
import { Content } from "@/types";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  ArrowLeft,
  Clock,
  Video,
  FileText,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import { DetailHeroSkeleton } from "@/components/skeletons/PageSkeletons";
import { getSopCategoryBadgeClass } from "@/lib/moduleRegistry";

// ─── Progress tracker ─────────────────────────────────────────────────────────
// function ReadingProgress({ minutes }: { minutes: number }) {
//   const [completed, setCompleted] = useState(false);
//   const [mounted, setMounted] = useState(false);

//   useEffect(() => {
//     setMounted(true);
//   }, []);

//   if (!mounted) return null;

//   return (
//     <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between h-full">
//       <div>
//         <div className="flex items-center justify-between mb-3">
//           <div className="flex items-center gap-2">
//             <BookOpen className="w-4 h-4 text-red-600" />
//             <span className="text-sm font-semibold text-gray-700">
//               Training Status
//             </span>
//           </div>
//           <span
//             className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
//               completed
//                 ? "bg-green-100 text-green-700"
//                 : "bg-amber-100 text-amber-700"
//             }`}
//           >
//             {completed ? "✓ Completed" : "In Progress"}
//           </span>
//         </div>

//         <p className="text-xs text-gray-500 mt-1 leading-relaxed">
//           {completed
//             ? "You have marked this training document as read."
//             : `Review the attached document. Expected read time is roughly ${minutes} minutes.`}
//         </p>
//       </div>

//       <div className="mt-5">
//         <button
//           onClick={() => setCompleted(!completed)}
//           className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition ${
//             completed
//               ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
//               : "bg-gray-900 text-white hover:bg-gray-800"
//           }`}
//         >
//           {completed ? (
//             <>
//               <CheckCircle className="w-4 h-4 text-green-600" />
//               Completed (Click to undo)
//             </>
//           ) : (
//             "Mark as Completed"
//           )}
//         </button>
//       </div>
//     </div>
//   );
// }

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ContentDetailPage() {
  const { goBack } = useAppNavigation();
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : params?.id;
  const [isSaved, setIsSaved] = useState(false);

  // ── Fetch single content item ─────────────────────────────────────────────
  const getContent = async (): Promise<Content> => {
    try {
      const res = await api.get(`/sop/get_training_data/${id}`);

      if (!res.data) {
        throw new Error("No data returned from backend api.");
      }

      return res.data;
    } catch (error) {
      console.error("Error running getContent client query:", error);
      throw error;
    }
  };

  const {
    data: content,
    isLoading,
    isError,
  } = useQuery<Content>({
    queryKey: ["get_content", id],
    queryFn: getContent,
    enabled: !!id,
  });

  if (isLoading || !id) {
    return <DetailHeroSkeleton />;
  }

  if (isError || !content) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-gray-500">Content not found.</p>
        <button
          onClick={() => goBack("/dashboard/sop")}
          className="text-red-600 text-sm hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Go back
        </button>
      </div>
    );
  }

  const hasVideo = !!content.video_url;
  const hasDocument = !!content.document_url;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Back nav ── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2 shrink-0">
        <button
          onClick={() => goBack("/dashboard/sop")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Learning Hub
        </button>
      </div>

      {/* ── Cover image ── */}
      <div className="relative w-full h-56 sm:h-72 md:h-80 lg:h-96 overflow-hidden shrink-0">
        <img
          src={content.cover_image_url || "/images/default_cover.jpg"}
          alt={content.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Title over image */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="min-w-0">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mb-1.5 ${getSopCategoryBadgeClass(content.category)}`}
            >
              {content.category}
            </span>
            <h1 className="text-white text-xl sm:text-2xl md:text-3xl font-bold leading-tight break-words">
              {content.title}
            </h1>
            <p className="text-gray-300 text-xs sm:text-sm mt-0.5 md:mt-1 truncate">
              {content.sub_category}
            </p>
          </div>
          <button
            onClick={() => setIsSaved(!isSaved)}
            className="p-2.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white hover:bg-red-600 hover:border-red-600 transition self-end sm:self-auto shrink-0"
            title={isSaved ? "Unsave" : "Save"}
          >
            {isSaved ? (
              <BookmarkCheck className="w-5 h-5" />
            ) : (
              <Bookmark className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-5xl w-full  px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6 flex-1 flex flex-col justify-start">
        {/* ── Meta + description + progress ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch auto-rows-max">
          <div className="">
            {/* Left: description + meta */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 h-full flex flex-col justify-between">
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    About this material
                  </h2>
                  <p className="text-gray-700 text-sm leading-relaxed break-words">
                    {content.description}
                  </p>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-5 pt-4 border-t border-gray-100">
                  {content.document_read_minutes && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5 text-red-500" />
                      {content.document_read_minutes} min read
                    </span>
                  )}
                  {content.video_duration_minutes && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                      <Video className="w-3.5 h-3.5 text-red-500" />
                      {content.video_duration_minutes} min video
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 truncate max-w-full">
                    <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="truncate">
                      {content.category} · {content.sub_category}
                    </span>
                  </span>
                </div>
                {content.created_by_name && (
                  <p className="text-xs text-gray-400 mt-3">
                    Added by {content.created_by_name} ·{" "}
                    {new Date(content.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* Right: progress tracker panel */}
            {/* {content.document_read_minutes && (
            <div className="lg:col-span-1">
              <ReadingProgress minutes={content.document_read_minutes} />
            </div>
          )} */}
          </div>

          {/* ── Document section ── */}
          {hasDocument && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-semibold text-gray-700">
                  SOP Document
                </h3>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border border-gray-100 rounded-xl p-4 bg-gray-50 gap-4">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 relative">
                    <Image
                      src="/images/PDF.png"
                      alt="PDF"
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 break-words pr-2">
                      {content.title}
                    </p>
                    {content.document_read_minutes && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        Estimated read time: {content.document_read_minutes} min
                      </p>
                    )}
                  </div>
                </div>
                <a
                  href={content.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition font-medium w-full sm:w-auto whitespace-nowrap shadow-sm"
                >
                  Open Document
                </a>
              </div>
            </div>
          )}

          {/* ── Video section ── */}
          {hasVideo && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Video className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Training Video
                </h3>
                {content.video_duration_minutes && (
                  <span className="ml-auto text-xs text-gray-400">
                    {content.video_duration_minutes} min
                  </span>
                )}
              </div>
              <div className="w-full rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-black aspect-video">
                <video controls className="w-full h-full object-contain">
                  <source src={content.video_url!} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
