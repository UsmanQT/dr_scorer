"use client";
import { useCallback, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { AWS_ACCOUNT_ID_RE, DEFAULT_REGION } from "@/utils/aws/scannerRole";

// ─── Types ───────────────────────────────────────────────────────────────────

type ConnectionStatus = "pending" | "verified" | "error";

type AwsConnection = {
  id: string;
  account_alias: string | null;
  role_arn: string;
  external_id: string;
  regions: string[];
  status: ConnectionStatus;
  last_verified_at: string | null;
  created_at: string;
};

type ConnectResponse = {
  connection: AwsConnection;
  reused?: boolean;
  scannerAccountArn: string;
  policyDocument: unknown;
  trustPolicy: unknown;
  cloudFormationTemplate: string;
};

const COMMON_REGIONS = [
  DEFAULT_REGION,
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchConnectionsFromApi(): Promise<{ data: AwsConnection[] } | { error: string }> {
  try {
    const res = await fetch("/api/aws/connect");
    const json = await res.json();
    if (!res.ok) return { error: json.error ?? "Could not load connections." };
    return { data: json.connections ?? [] };
  } catch {
    return { error: "Network error — please try again." };
  }
}

function isConnectResponse(json: unknown): json is ConnectResponse {
  if (!json || typeof json !== "object") return false;
  const r = json as Partial<ConnectResponse>;
  return (
    !!r.connection &&
    typeof r.connection === "object" &&
    typeof (r.connection as AwsConnection).external_id === "string" &&
    typeof r.cloudFormationTemplate === "string" &&
    !!r.trustPolicy &&
    !!r.policyDocument
  );
}

function statusColor(status: ConnectionStatus): { bg: string; text: string } {
  if (status === "verified") return { bg: "#D1FAE5", text: "#065F46" };
  if (status === "error") return { bg: "#FEE2E2", text: "#991B1B" };
  return { bg: "#FEF3C7", text: "#92400E" };
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #E2E8F0",
        background: copied ? "#059669" : "white", color: copied ? "white" : "#64748B",
        cursor: "pointer", fontWeight: 500, transition: "all 0.15s",
      }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre style={{
      background: "#0F172A", color: "#E2E8F0", borderRadius: 10, padding: 14,
      fontSize: 11, lineHeight: 1.6, overflowX: "auto", fontFamily: "'DM Mono', monospace",
      margin: 0, maxHeight: 280,
    }}>
      {children}
    </pre>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 14, padding: 18, border: "1px solid #E2E8F0", marginBottom: 16 }}>
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AwsConnect({ user, isMobile }: { user: User | null; isMobile: boolean }) {
  const [connections, setConnections] = useState<AwsConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  const [accountAlias, setAccountAlias] = useState("");
  const [awsAccountId, setAwsAccountId] = useState("");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([DEFAULT_REGION]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [setupResult, setSetupResult] = useState<ConnectResponse | null>(null);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<Record<string, string>>({});

  const userId = user?.id ?? null;

  const loadConnections = useCallback(async () => {
    if (!userId) return;
    setLoadingConnections(true);
    const result = await fetchConnectionsFromApi();
    if ("data" in result) {
      setConnections(result.data);
      setConnectionsError(null);
    } else {
      setConnectionsError(result.error);
    }
    setLoadingConnections(false);
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    if (!userId) return;

    (async () => {
      setLoadingConnections(true);
      const result = await fetchConnectionsFromApi();
      if (!mounted) return;
      if ("data" in result) {
        setConnections(result.data);
        setConnectionsError(null);
      } else {
        setConnectionsError(result.error);
      }
      setLoadingConnections(false);
    })();

    return () => {
      mounted = false;
    };
    // Keyed on the stable user id, not the `user` object — Supabase hands
    // back a new object reference on every auth event (including periodic
    // token refreshes for a long-lived session), which would otherwise
    // re-fetch on every one of those instead of on actual sign-in/out.
  }, [userId]);

  const toggleRegion = (region: string) => {
    setSelectedRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]
    );
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!AWS_ACCOUNT_ID_RE.test(awsAccountId.trim())) {
      setFormError("Enter your 12-digit AWS account ID.");
      return;
    }
    if (selectedRegions.length === 0) {
      setFormError("Select at least one region.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/aws/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountAlias: accountAlias.trim(),
          awsAccountId: awsAccountId.trim(),
          regions: selectedRegions,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "Could not create connection.");
        return;
      }
      if (!isConnectResponse(json)) {
        setFormError("Unexpected response from server — please try again.");
        return;
      }
      setSetupResult(json);
      setAccountAlias("");
      setAwsAccountId("");
      await loadConnections();
    } catch {
      setFormError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (connectionId: string) => {
    setVerifyingId(connectionId);
    setVerifyMessage((prev) => ({ ...prev, [connectionId]: "" }));
    try {
      const res = await fetch("/api/aws/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const json = await res.json();
      setVerifyMessage((prev) => ({
        ...prev,
        [connectionId]: res.ok ? "Verified ✓" : json.error ?? "Verification failed.",
      }));
      if (res.ok) await loadConnections();
    } catch {
      setVerifyMessage((prev) => ({ ...prev, [connectionId]: "Network error — please try again." }));
    } finally {
      setVerifyingId(null);
    }
  };

  if (!user) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "24px 0", color: "#94A3B8", fontSize: 13 }}>
          Sign in to connect an AWS account for live scanning.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, alignItems: "start" }}>
      <div>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
            Connect AWS account
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16, lineHeight: 1.5 }}>
            DRscore never asks for AWS access keys. You create a read-only IAM role in your
            account that trusts our scanner identity — nothing long-lived is stored on our side.
          </div>

          <label style={{ fontSize: 11, color: "#94A3B8", display: "block", marginBottom: 4 }}>Account alias (optional)</label>
          <input
            value={accountAlias}
            onChange={(e) => setAccountAlias(e.target.value)}
            placeholder="Production"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0",
              fontSize: 13, color: "#1E293B", outline: "none", background: "#F8FAFC", marginBottom: 12 }}
          />

          <label style={{ fontSize: 11, color: "#94A3B8", display: "block", marginBottom: 4 }}>AWS account ID</label>
          <input
            value={awsAccountId}
            onChange={(e) => setAwsAccountId(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="123456789012"
            maxLength={12}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0",
              fontSize: 13, color: "#1E293B", outline: "none", background: "#F8FAFC", marginBottom: 12,
              fontFamily: "'DM Mono', monospace" }}
          />

          <label style={{ fontSize: 11, color: "#94A3B8", display: "block", marginBottom: 6 }}>Regions to scan</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {COMMON_REGIONS.map((region) => {
              const active = selectedRegions.includes(region);
              return (
                <button
                  key={region}
                  onClick={() => toggleRegion(region)}
                  style={{
                    fontSize: 11, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                    border: active ? "1px solid #2563EB" : "1px solid #E2E8F0",
                    background: active ? "#EFF6FF" : "white",
                    color: active ? "#1D4ED8" : "#64748B",
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  {region}
                </button>
              );
            })}
          </div>

          {formError && <div style={{ fontSize: 12, color: "#B91C1C", marginBottom: 12 }}>{formError}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: "none",
              background: "#1E293B", color: "white", fontSize: 13, fontWeight: 500,
              cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? "Creating connection…" : "Create connection"}
          </button>
        </Card>

        <Card>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
            Your connections
          </div>
          {loadingConnections && <div style={{ fontSize: 12, color: "#94A3B8" }}>Loading…</div>}
          {!loadingConnections && connectionsError && (
            <div style={{ fontSize: 12, color: "#B91C1C", marginBottom: 10 }}>
              {connectionsError}{" "}
              <button onClick={loadConnections} style={{ border: "none", background: "none", color: "#B91C1C", textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0 }}>
                Retry
              </button>
            </div>
          )}
          {!loadingConnections && !connectionsError && connections.length === 0 && (
            <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: "16px 0" }}>
              No AWS accounts connected yet.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {connections.map((c) => {
              const sc = statusColor(c.status);
              return (
                <div key={c.id} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>
                      {c.account_alias || c.role_arn.split("::")[1]?.split(":")[0] || "Unnamed"}
                    </div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: sc.bg, color: sc.text, fontWeight: 500, textTransform: "capitalize" }}>
                      {c.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, fontFamily: "'DM Mono', monospace", wordBreak: "break-all" }}>
                    {c.role_arn}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    Regions: {c.regions.join(", ")}
                  </div>
                  {c.status !== "verified" && (
                    <button
                      onClick={() => handleVerify(c.id)}
                      disabled={verifyingId === c.id}
                      style={{ marginTop: 8, fontSize: 12, padding: "6px 12px", borderRadius: 8,
                        border: "1px solid #E2E8F0", background: "white", color: "#1E293B",
                        cursor: verifyingId === c.id ? "default" : "pointer", fontWeight: 500 }}
                    >
                      {verifyingId === c.id ? "Verifying…" : "Verify connection"}
                    </button>
                  )}
                  {verifyMessage[c.id] && (
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>{verifyMessage[c.id]}</div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div>
        {setupResult ? (
          <>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#059669", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                {setupResult.reused ? "Existing connection found" : "Connection created — status: pending"}
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.5 }}>
                {setupResult.reused
                  ? "You already have a connection for this AWS account — reusing its external ID instead of creating a duplicate. If you haven't deployed the role yet, follow the steps below."
                  : <>Follow the steps below in your AWS account, then come back and click
                    &quot;Verify connection&quot; in the list on the left.</>}
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>
                Step 1 — Launch the CloudFormation template
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10, lineHeight: 1.5 }}>
                Creates the <code>{"DRscoreScannerRole"}</code> role with the trust policy and
                permissions below already filled in.
              </div>
              <button
                onClick={() => downloadTextFile("drscore-scanner-role.yaml", setupResult.cloudFormationTemplate)}
                style={{ fontSize: 13, padding: "8px 14px", borderRadius: 8, border: "none",
                  background: "#1E293B", color: "white", cursor: "pointer", fontWeight: 500 }}
              >
                Download CloudFormation template
              </button>
            </Card>

            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>External ID (required)</div>
                <CopyButton text={setupResult.connection.external_id} />
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8, lineHeight: 1.5 }}>
                Unique to this connection. The trust policy requires it on every AssumeRole call —
                without it, the role cannot be assumed even by our scanner identity.
              </div>
              <CodeBlock>{setupResult.connection.external_id}</CodeBlock>
            </Card>

            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Trust policy</div>
                <CopyButton text={JSON.stringify(setupResult.trustPolicy, null, 2)} />
              </div>
              <CodeBlock>{JSON.stringify(setupResult.trustPolicy, null, 2)}</CodeBlock>
            </Card>

            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Permissions policy (read-only)</div>
                <CopyButton text={JSON.stringify(setupResult.policyDocument, null, 2)} />
              </div>
              <CodeBlock>{JSON.stringify(setupResult.policyDocument, null, 2)}</CodeBlock>
            </Card>
          </>
        ) : (
          <Card>
            <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: "24px 0", lineHeight: 1.6 }}>
              Create a connection on the left to see the IAM role setup instructions,
              CloudFormation template, and required external ID.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
