"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();

  const handleAuth = async () => {
    setLoading(true);
    setMessage("");
    const response = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } })
      : await supabase.auth.signInWithPassword({ email, password });

    if (response.error) {
      setMessage(response.error.message);
    } else if (isSignUp) {
      if (response.data.session) {
        window.location.href = "/";
      } else {
        setMessage("Check your email to confirm your account.");
      }
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100vh", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #E2E8F0", padding: 32, width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#1E293B", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: 14 }}>⬡</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1E293B" }}>DRscore</span>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E293B", margin: "0 0 6px" }}>
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p style={{ fontSize: 13, color: "#94A3B8", margin: "0 0 24px" }}>
          {isSignUp ? "Start tracking your DR readiness" : "Sign in to your DRscore account"}
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 4 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 4 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {message && (
          <div style={{ fontSize: 12, padding: "10px 12px", borderRadius: 8, marginBottom: 16,
            background: message.includes("Check") ? "#ECFDF5" : "#FEF2F2",
            color: message.includes("Check") ? "#065F46" : "#991B1B" }}>
            {message}
          </div>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
            background: loading ? "#94A3B8" : "#1E293B", color: "white", fontSize: 13,
            fontWeight: 500, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
        </button>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            onClick={() => { setIsSignUp(!isSignUp); setMessage(""); }}
            style={{ fontSize: 12, color: "#64748B", background: "none", border: "none", cursor: "pointer" }}>
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
