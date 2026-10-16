import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Layers } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function Login() {
  const { login, apiError, user } = useAuth();
  const [email, setEmail] = useState("2j2skp87z8@privaterelay.appleid.com");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try { await login(email, password); }
    catch (e) { setErr(apiError(e)); }
    finally { setLoading(false); }
  };

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(222_47%_11%)] p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <Layers className="text-white" size={26} />
          </div>
          <div>
            <div className="text-white font-bold text-xl font-display">SUPER IQ-FOAM</div>
            <div className="text-slate-400 text-xs">Business Management System</div>
          </div>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-5" data-testid="login-form">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-display">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to manage your business</p>
          </div>
          {err && <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2" data-testid="login-error">{err}</div>}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email</label>
            <input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-lg border border-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Password</label>
            <input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full rounded-lg border border-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          <button type="submit" disabled={loading} data-testid="login-submit"
            className="w-full bg-primary text-white font-semibold rounded-lg py-3 hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
