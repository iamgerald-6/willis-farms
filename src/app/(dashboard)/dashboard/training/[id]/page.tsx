"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Content } from "@/types";
import {
  Bookmark,
  ArrowLeft,
  BookmarkCheck,
  BookText,
  Clock,
} from "lucide-react";
import Image from "next/image";

// interface Props {
//   content: Content;
// }

export default function ContentDetailPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const dummyContents: Content[] = [
    {
      id: "1",
      title: "Daily Walk-In Procedure",
      category: "SOP",
      sub_category: "Daily Operations",
      description:
        "Step-by-step guide to daily pig barn checks, covering animal health observation, hygiene standards, feeding and watering inspections, ventilation monitoring, and early detection of abnormal behavior to ensure optimal farm operations and animal welfare. ",
      cover_image_url: "/images/pigs1.jpg",
      document_url: "/docs/walkin.pdf",
      document_read_minutes: 10,
      video_url: "/videos/walkin.mp4",
      video_duration_minutes: 15,
      created_at: new Date().toISOString(),
      created_by: "Admin",
    },
    {
      id: "2",
      title: "Pig Health Assessment",
      category: "Clinical",
      sub_category: "Health Checks",
      description: "How to examine pigs for common health issues.",
      cover_image_url: "/images/pig_health.jpg",
      document_url: "/docs/health.pdf",
      document_read_minutes: 5,
      video_url: "/videos/health.mp4",
      video_duration_minutes: 8,
      created_at: new Date().toISOString(),
      created_by: "Admin",
    },
    {
      id: "3",
      title: "Biosecurity Measures",
      category: "SOP",
      sub_category: "Biosecurity",
      description: "Prevent disease spread in the farm.",
      cover_image_url: "/images/biosecurity.jpg",
      document_url: "/docs/biosecurity.pdf",
      document_read_minutes: 7,
      video_duration_minutes: 12,
      created_at: new Date().toISOString(),
      created_by: "Admin",
    },
    {
      id: "4",
      title: "Feed Handling Guidelines",
      category: "Training",
      sub_category: "Feeding",
      description: "Correct handling of feed to avoid contamination.",
      cover_image_url: "/images/feed.jpg",
      document_read_minutes: 6,
      created_at: new Date().toISOString(),
      created_by: "Admin",
    },
  ];
  const params = useParams();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const content = dummyContents.find((c) => c.id === id);

  if (!content) return <p className="p-6">Content not found</p>;
  useEffect(() => {
    if (!content?.document_read_minutes) return;

    const totalSec = content.document_read_minutes * 60;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += 1;
      setElapsedSec(elapsed);
      setProgress(Math.min((elapsed / totalSec) * 100, 100));

      if (elapsed >= totalSec) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [content]);

  return (
    <div className="min-h-screen bg-light">
      {/* Breadcrumb / Back */}
      <div
        className="p-6 flex items-center gap-2 text-gray-600 cursor-pointer"
        onClick={() => router.back()}
      >
        <ArrowLeft className="w-5 h-5" /> Back to Learning Hub
      </div>

      {/* Cover Image */}
      <div className="relative w-full h-64 sm:h-80 lg:h-96">
        <img
          src={content.cover_image_url || "/images/default_cover.jpg"}
          alt={content.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/30 flex justify-between items-end p-6">
          <div>
            <h1 className="text-white text-2xl font-bold mb-1">
              {content.title}
            </h1>
            <p className="text-gray-200">
              {content.category} · {content.sub_category}
            </p>
          </div>

          <button
            className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full self-start"
            onClick={() => setIsSaved(!isSaved)}
          >
            <Bookmark className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content / Description */}
      <div className="p-6 m border bg-white">
        <div className="grid grid-cols-3 ">
          <div className="col-span-2">
            <p className="text-gray-700 text-base  ">{content.description}</p>
          </div>

          {/* Progress Tracker */}
          {content.document_read_minutes && (
            <div className=" max-w-lg  space-y-2 border rounded-md py-5 px-5  ">
              {/* Compact Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-2.5 bg-red-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Status Row */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                {/* Status Dot */}
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    progress >= 100 ? "bg-green-600" : "bg-red-600"
                  }`}
                />

                {/* Progress Text */}
                <p>
                  {Math.min(
                    Math.ceil(elapsedSec / 60),
                    content.document_read_minutes
                  )}{" "}
                  of {content.document_read_minutes} mins completed
                </p>

                {/* Status Label */}
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    progress >= 100
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {progress >= 100 ? "Completed" : "In progress"}
                </span>
              </div>
            </div>
          )}
        </div>
        {/* Document / Video Actions */}
        <div className="my-5">
          <div className="flex gap-3">
            <BookText className="text-brand-red" />
            <h3>SOP Document</h3>
          </div>
        </div>
        <div className="grid">
          <div>
            {content.document_url && (
              <div className="flex justify-between items-center border  rounded-md px-3 py-3">
                <div className="flex  gap-5 items-center">
                  <div>
                    <Image
                      src="/images/PDF.png"
                      alt=""
                      width={60}
                      height={30}
                    />
                  </div>
                  <div className="grid">
                    <h3 className="text-lg">{content.title}</h3>
                    <span className="text-xs flex gap-2 mt-1 items-center text-brand-gray">
                      <Clock size={17} />

                      <span>
                        Estimated Read Time: {content.document_read_minutes} min
                      </span>
                    </span>
                  </div>
                </div>
                <button>
                  <a
                    href={content.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                  >
                    Open SOP Document
                  </a>
                </button>
              </div>
            )}
          </div>
          <div>
            {content.video_url && (
              <div className="w-full sm:w-auto mt-5">
                <video controls className="w-full rounded shadow">
                  <source src={content.video_url} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                {content.video_duration_minutes && (
                  <p className="text-gray-600 text-sm mt-1">
                    🎥 {content.video_duration_minutes} min
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
