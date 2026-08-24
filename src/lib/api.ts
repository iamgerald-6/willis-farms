import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

const api = axios.create({
  baseURL: "/api",
});

// Attaches the current Supabase session token so API routes that need to
// verify who's calling (currently: Task Manager write routes) can do so.
// Routes that don't check this header simply ignore it — safe no-op for
// every other existing endpoint.
//
// getSession() reads from local storage but falls back to a network refresh
// when the token is stale, so a transient network blip here can throw. Every
// axios call in the app goes through this interceptor, so let it fail soft
// (send the request without the header, which the server treats as
// unauthenticated) instead of rejecting every in-flight request with a raw
// "TypeError: Load failed"/"fetch failed" that most callers never expected
// to catch.
api.interceptors.request.use(async (config) => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.error("[api] getSession failed, sending request without auth header", err);
  }
  return config;
});

export default api;
