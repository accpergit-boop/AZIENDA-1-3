import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Layers } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";

export default function Login() {
  const { login, register, apiError, user } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("zeenmuhammadali@icloud.com");
  const [password, setPassword] = useState("");
  const [shareLocation, setShareLocation] = useState(false);
  const [err, setErr] = useState(location.state?.error || "");
  const [loading, setLoading] = useState(false);

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    localStorage.setItem("shareDeviceLocation", String(shareLocation));
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      if (mode === "register") await register(name, email, password, shareLocation);
      else await login(email, password, shareLocation);
    }
    catch (e) { setErr(apiError(e)); }
    finally { setLoading(false); }
  };

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--navy))] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-4">
          <div className="h-12 w-12 rounded-lg border border-emerald-100/20 bg-[hsl(158_28%_15%)] flex items-center justify-center">
            <Layers className="text-emerald-100" size={24} />
          </div>
          <div>
            <div className="text-white font-bold text-xl font-display">SUPER IQ-FOAM</div>
            <div className="text-emerald-100/55 text-[10px] font-semibold uppercase tracking-[0.16em]">Business Management</div>
          </div>
        </div>
        <form onSubmit={submit} className="luxury-card rounded-xl border border-white/70 bg-[hsl(45_28%_98%)] p-5 sm:p-6 space-y-3" data-testid="login-form">
          <div>
            <h1 className="text-3xl font-normal text-slate-900 font-display">{mode === "register" ? "Create account" : "Welcome back"}</h1>
            <p className="text-sm text-slate-500 mt-1">{mode === "register" ? "Create an account to access the business system" : "Sign in to manage your business"}</p>
          </div>
          {err && <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2" data-testid="login-error">{err}</div>}
          {mode === "register" && <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Name</label>
            <input data-testid="register-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email</label>
            <input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Password</label>
            <input data-testid="login-password" type="password" minLength={mode === "register" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} className="mt-0.5" data-testid="share-location-consent" />
            <span>Share this device's precise location with the administrator. Device, IP address and time zone are recorded when you sign in.</span>
          </label>
          <button type="submit" disabled={loading} data-testid="login-submit"
            className="w-full bg-primary text-white font-semibold rounded-md py-2.5 hover:brightness-110 disabled:opacity-50 transition-all">
            {loading ? "Please wait..." : mode === "register" ? "Create Account" : "Sign In"}
          </button>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-400"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          <button type="button" onClick={googleLogin} data-testid="google-login-btn"
            className="w-full flex items-center justify-center gap-3 border border-border bg-white/70 rounded-md py-2.5 text-sm font-semibold text-slate-700 hover:bg-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
          <p className="text-[11px] text-slate-400 text-center">Google accounts can sign in without prior approval. New accounts start as standard users.</p>
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }} className="w-full text-sm font-semibold text-primary hover:underline" data-testid="toggle-register">
            {mode === "register" ? "Already have an account? Sign in" : "Create a new account"}
          </button>
        </form>
      </div>
    </div>
  );
}
