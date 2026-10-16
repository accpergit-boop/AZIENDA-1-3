import { createContext, useContext, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=unauth, obj=auth
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    // Returning from Google OAuth: AuthCallback exchanges session_id first
    if (window.location.hash?.includes("session_id=")) { setBooting(false); return; }
    api.get("/auth/me").then(setUser).catch(() => setUser(false)).finally(() => setBooting(false));
  }, []);

  const login = async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    setUser(data.user);
  };

  const completeGoogle = async (sessionId) => {
    const data = await api.post("/auth/google/session", { session_id: sessionId });
    localStorage.setItem("token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    localStorage.removeItem("token");
    setUser(false);
    window.location.href = "/login";
  };

  return <AuthCtx.Provider value={{ user, setUser, booting, login, completeGoogle, logout, apiError }}>{children}</AuthCtx.Provider>;
}
