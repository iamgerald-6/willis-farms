// Zoom Server-to-Server OAuth integration — lets HR generate a real Zoom
// meeting link straight from the interview panel/stage 2 setup screens
// instead of creating one manually in Zoom and pasting it in.
//
// Requires three env vars (see .env.local): ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID,
// ZOOM_CLIENT_SECRET. These come from a Server-to-Server OAuth app created
// in the Zoom App Marketplace with the meeting:write:meeting:admin scope.

const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";
const ZOOM_API_BASE = "https://api.zoom.us/v2";

async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      "Zoom is not configured — set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.",
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const res = await fetch(
    `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}` },
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zoom authentication failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function createZoomMeeting(params: {
  /** Zoom account/email that will own the meeting — must be a real user on the Zoom account. */
  hostEmail: string;
  topic: string;
  /** ISO 8601 UTC start time, e.g. "2026-09-10T09:00:00Z". */
  startAt: string;
  durationMinutes?: number;
}): Promise<{ joinUrl: string }> {
  const token = await getZoomAccessToken();

  const res = await fetch(
    `${ZOOM_API_BASE}/users/${encodeURIComponent(params.hostEmail)}/meetings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: params.topic,
        type: 2, // scheduled meeting
        start_time: params.startAt,
        duration: params.durationMinutes ?? 60,
        timezone: "UTC",
        settings: {
          join_before_host: true,
          waiting_room: false,
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zoom meeting creation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { join_url: string };
  return { joinUrl: data.join_url };
}
