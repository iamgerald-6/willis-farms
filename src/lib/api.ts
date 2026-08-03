import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

const api = axios.create({
  baseURL: "/api",
});

// Attaches the current Supabase session token so API routes that need to
// verify who's calling (currently: Task Manager write routes) can do so.
// Routes that don't check this header simply ignore it — safe no-op for
// every other existing endpoint.
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
