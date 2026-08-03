"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import AppraisalForm from "@/app/(dashboard)/dashboard/humanCapital/appraisal/component/AppraisalPage";
import FinalReviewForm from "@/app/(dashboard)/dashboard/humanCapital/appraisal/component/finalFormReview";
import { Quarter, QUARTERS } from "@/lib/appraisal/sections";

const AppraisalFormPage = () => {
  const [quarter, setQuarter] = useState<Quarter>("Q1");
  const searchParams = useSearchParams();
  const router = useRouter();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const userId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === userId);

  const existingAppraisalId = searchParams.get("id");
  // ?step=final triggers the Final Review Meeting form
  const step = searchParams.get("step");
  const isFinalReview = step === "final" && !!existingAppraisalId;

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
      >
        ← Back to appraisals
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isFinalReview ? "Final Review Meeting" : "Performance Appraisal"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Performance and Probation Tools
        </p>
      </div>

      {/* Quarter picker — hidden once filling an existing record (quarter is
          locked from that record) or during the Final Review Meeting.
          There are exactly 4 quarters; Q4 is also the Annual appraisal. */}
      {!isFinalReview && !existingAppraisalId && (
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit flex-wrap">
          {QUARTERS.map((q) => (
            <button
              key={q}
              onClick={() => setQuarter(q)}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${
                quarter === q
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {q === "Q4" ? "Q4 (Annual)" : q}
            </button>
          ))}
        </div>
      )}

      <div className="max-w-5xl">
        {isFinalReview ? (
          <FinalReviewForm
            appraisalId={existingAppraisalId!}
            onSuccess={() => router.push("/dashboard/humanCapital/appraisal")}
            onBack={() => router.back()}
          />
        ) : (
          <AppraisalForm
            key={quarter}
            defaultQuarter={quarter}
            viewerGradeLevel={profile?.grade_level}
            existingAppraisalId={existingAppraisalId}
            onSuccess={() => router.push("/dashboard/humanCapital/appraisal")}
          />
        )}
      </div>
    </div>
  );
};

export default AppraisalFormPage;
