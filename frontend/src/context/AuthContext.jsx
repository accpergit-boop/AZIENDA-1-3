import { createContext, useContext, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=unauth, obj=auth
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) { setUser(false); setBooting(false); return; }
    api.get("/auth/me").then(setUser).catch(() => setUser(false)).finally(() => setBooting(false));
  }, []);

  const login = async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(false);
    window.location.href = "/login";
  };

  return <AuthCtx.Provider value={{ user, booting, login, logout, apiError }}>{children}</AuthCtx.Provider>;
}
