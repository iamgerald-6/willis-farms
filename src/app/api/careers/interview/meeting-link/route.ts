import { NextRequest, NextResponse } from "next/server";
import { createZoomMeeting } from "@/lib/videoConferencing/zoom";

const HOST_EMAIL = "amoafosheila@outlook.com";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const startAt = typeof body?.startAt === "string" ? body.startAt : "";

  if (!topic || !startAt) {
    return NextResponse.json(
      { error: "topic and startAt are required." },
      { status: 400 },
    );
  }

  try {
    const { joinUrl } = await createZoomMeeting({
      hostEmail: HOST_EMAIL,
      topic,
      startAt,
      durationMinutes: 60,
    });
    return NextResponse.json({ data: { joinUrl } });
  } catch (err) {
    console.error("meeting-link generation failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate meeting link.",
      },
      { status: 502 },
    );
  }
}
