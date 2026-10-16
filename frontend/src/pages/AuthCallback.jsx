import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";

export default function AuthCallback() {
  const { completeGoogle, setUser } = useAuth();
  const nav = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const m = window.location.hash.match(/session_id=([^&]+)/);
    window.history.replaceState(null, "", window.location.pathname);
    if (!m) { nav("/login", { replace: true }); return; }
    completeGoogle(m[1])
      .then(() => nav("/", { replace: true }))
      .catch((e) => { setUser(false); toast.error(apiError(e)); nav("/login", { replace: true, state: { error: apiError(e) } }); });
  }, [completeGoogle, nav, setUser]);

  return <div className="min-h-screen flex items-center justify-center bg-[hsl(222_47%_11%)] text-slate-400 text-sm" data-testid="auth-callback">Signing you in...</div>;
}
