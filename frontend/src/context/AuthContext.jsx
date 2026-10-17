import { createContext, useContext, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

async function deviceInfo(shareLocation) {
  let deviceId = localStorage.getItem("erp_device_id");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("erp_device_id", deviceId);
  }
  let position = {};
  if (shareLocation && navigator.geolocation) {
    position = await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve({}), { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 },
    ));
  }
  return {
    device_id: deviceId,
    device_name: `${navigator.platform || "Device"} · ${navigator.userAgent}`.slice(0, 180),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    share_location: shareLocation && position.latitude != null,
    ...position,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=unauth, obj=auth
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    // Returning from Google OAuth: AuthCallback exchanges session_id first
    if (window.location.hash?.includes("session_id=")) { setBooting(false); return; }
    api.get("/auth/me").then(setUser).catch(() => setUser(false)).finally(() => setBooting(false));
  }, []);

  const finishLogin = async (data, shareLocation) => {
    localStorage.setItem("token", data.token);
    setUser(data.user);
    deviceInfo(shareLocation).then((info) => api.post("/auth/device", info)).catch(() => {});
    return data.user;
  };

  const login = async (email, password, shareLocation = false) => {
    const data = await api.post("/auth/login", { email, password });
    return finishLogin(data, shareLocation);
  };

  const register = async (name, email, password, shareLocation = false) => {
    const data = await api.post("/auth/register", { name, email, password });
    return finishLogin(data, shareLocation);
  };

  const completeGoogle = async (sessionId) => {
    const data = await api.post("/auth/google/session", { session_id: sessionId });
    const shareLocation = localStorage.getItem("shareDeviceLocation") === "true";
    localStorage.removeItem("shareDeviceLocation");
    return finishLogin(data, shareLocation);
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    localStorage.removeItem("token");
    setUser(false);
    window.location.href = "/login";
  };

  return <AuthCtx.Provider value={{ user, setUser, booting, login, register, completeGoogle, logout, apiError }}>{children}</AuthCtx.Provider>;
}
