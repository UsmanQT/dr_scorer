"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";

// ─── Data ────────────────────────────────────────────────────────────────────
type Weight = "critical" | "high" | "medium";

type AssessmentItem = {
  id: string;
  label: string;
  why: string;
  weight: Weight;
  pts: number;
  sectionId?: string;
};

type Section = {
  id: string;
  title: string;
  icon: string;
  color: string;
  bg: string;
  items: AssessmentItem[];
};

type Grade = {
  label: string;
  sublabel: string;
  color: string;
  track: string;
};

type CommunityTip = {
  id?: string;
  item_id?: string;
  author: string;
  text: string;
  created_at?: string;
};

type CommunityData = {
  totalAssessments: number;
  avgScore: number;
  bySize: { label: string; avg: number; count: number }[];
  mostMissed: { id: string; pct: number }[];
  tips: Record<string, CommunityTip[]>;
};

type SavedAssessment = {
  id: string;
  name: string;
  score: number;
  date: string;
  checkedCount: number;
  checked?: Record<string, boolean>;
};

type CommunityTipRow = {
  id: string | number;
  item_id: string;
  tip_text: string;
  author_label: string | null;
  created_at: string | null;
};

type CommunityStatsRpc = {
  totalAssessments: number;
  avgScore: number;
  bySize: { label: string; avg: number; count: number }[];
  mostMissed: { id: string; pct: number }[];
};

const SECTIONS: Section[] = [
  {
    id: "backup",
    title: "Backup & data recovery",
    icon: "◎",
    color: "#2563EB",
    bg: "#EFF6FF",
    items: [
      { id: "b1", label: "RDS automated backups enabled with retention ≥ 7 days", why: "AWS default is 1 day — insufficient for most compliance requirements", weight: "critical", pts: 8 },
      { id: "b2", label: "Cross-region backup copy configured for RDS / Aurora", why: "Same-region backups won't protect against a full regional outage", weight: "critical", pts: 8 },
      { id: "b3", label: "S3 versioning enabled on all critical buckets", why: "Protects against accidental deletes and ransomware overwrites", weight: "high", pts: 5 },
      { id: "b4", label: "S3 cross-region replication configured", why: "Ensures object availability if the primary region goes down", weight: "high", pts: 5 },
      { id: "b5", label: "Backup restore tested in the last 90 days", why: "Untested backups are not backups — restoration can fail silently", weight: "critical", pts: 8 },
    ],
  },
  {
    id: "failover",
    title: "Failover & routing",
    icon: "⇄",
    color: "#7C3AED",
    bg: "#F5F3FF",
    items: [
      { id: "f1", label: "Route 53 health checks on all critical endpoints", why: "Without health checks, DNS won't automatically reroute on failure", weight: "critical", pts: 7 },
      { id: "f2", label: "Route 53 failover routing policy set up (primary / secondary)", why: "Manual DNS changes during an outage add minutes to your RTO", weight: "critical", pts: 7 },
      { id: "f3", label: "AWS ARC readiness checks enabled", why: "ARC validates failover resources are actually ready before you need them", weight: "high", pts: 5 },
      { id: "f4", label: "Cross-region standby environment provisioned", why: "Cold/warm standby reduces RTO from hours to minutes", weight: "high", pts: 5 },
      { id: "f5", label: "Load balancer cross-zone load balancing enabled", why: "Prevents single-AZ bottlenecks during partial failures", weight: "medium", pts: 3 },
    ],
  },
  {
    id: "rto",
    title: "RTO / RPO targets",
    icon: "◷",
    color: "#059669",
    bg: "#ECFDF5",
    items: [
      { id: "r1", label: "RTO and RPO targets formally documented", why: "Without defined targets you can't measure or improve DR performance", weight: "high", pts: 4 },
      { id: "r2", label: "RTO target is ≤ 4 hours", why: "Industry standard for production — longer RTOs indicate under-investment", weight: "high", pts: 4 },
      { id: "r3", label: "RPO target is ≤ 1 hour", why: "Anything longer risks significant data loss in a failure scenario", weight: "high", pts: 4 },
      { id: "r4", label: "Last DR test met the defined RTO target", why: "Meeting targets on paper but not in practice is a false sense of security", weight: "critical", pts: 6 },
    ],
  },
  {
    id: "testing",
    title: "DR testing",
    icon: "⬡",
    color: "#DC2626",
    bg: "#FEF2F2",
    items: [
      { id: "t1", label: "DR exercise conducted in the last 90 days", why: "Quarterly testing is minimum — systems drift between tests", weight: "critical", pts: 7 },
      { id: "t2", label: "Post-failover test suite executed after each exercise", why: "Failing over without validating services is incomplete testing", weight: "high", pts: 5 },
      { id: "t3", label: "DR test results formally documented", why: "Documentation creates accountability and tracks improvement", weight: "medium", pts: 3 },
      { id: "t4", label: "Runbook reviewed and updated after each DR test", why: "Stale runbooks cause mistakes during real incidents", weight: "medium", pts: 3 },
    ],
  },
  {
    id: "monitoring",
    title: "Monitoring & alerting",
    icon: "◈",
    color: "#D97706",
    bg: "#FFFBEB",
    items: [
      { id: "m1", label: "CloudWatch alarms on RDS replica lag", why: "Replication lag silently grows before causing failover failures", weight: "high", pts: 4 },
      { id: "m2", label: "CloudWatch alarms on cross-region replication status", why: "S3 replication failures don't surface unless explicitly alerted on", weight: "high", pts: 4 },
      { id: "m3", label: "PagerDuty or equivalent on-call routing configured", why: "Alerts with no on-call owner don't wake anyone up", weight: "critical", pts: 6 },
      { id: "m4", label: "Synthetic monitors validating critical user paths", why: "Infrastructure health ≠ application health — synthetics catch the gap", weight: "medium", pts: 3 },
    ],
  },
  {
    id: "runbook",
    title: "Runbook & process",
    icon: "▤",
    color: "#0891B2",
    bg: "#ECFEFF",
    items: [
      { id: "p1", label: "Written DR runbook exists and is accessible to the team", why: "Runbooks must be reachable when your primary systems are down", weight: "critical", pts: 5 },
      { id: "p2", label: "Runbook includes contact list and escalation path", why: "During an incident, knowing who to call saves critical minutes", weight: "high", pts: 3 },
      { id: "p3", label: "DR responsibilities assigned to named owners", why: "Shared ownership = no ownership during a real outage", weight: "high", pts: 3 },
      { id: "p4", label: "Post-incident review process defined", why: "Without blameless reviews, the same failures repeat", weight: "medium", pts: 2 },
    ],
  },
];

const ALL_ITEMS: AssessmentItem[] = SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, sectionId: s.id })));
const TOTAL_PTS = ALL_ITEMS.reduce((a, i) => a + i.pts, 0);
const COMPANY_SIZE_BUCKETS = ["Startup (1–50)", "Mid-market (51–500)", "Enterprise (500+)"];

// Fallback data used until live community data loads.
const COMMUNITY_FALLBACK: CommunityData = {
  totalAssessments: 1284,
  avgScore: 61,
  bySize: [
    { label: "Startup (1–50)", avg: 48, count: 412 },
    { label: "Mid-market (51–500)", avg: 63, count: 538 },
    { label: "Enterprise (500+)", avg: 79, count: 334 },
  ],
  mostMissed: [
    { id: "b5", pct: 71 },
    { id: "b2", pct: 64 },
    { id: "t1", pct: 59 },
    { id: "r4", pct: 53 },
    { id: "f3", pct: 48 },
  ],
  tips: {
    f2: [
      { author: "SRE @ fintech", text: "Use weighted routing with health checks — set primary weight 100, secondary 0. Health check flips it automatically. Don't forget to set TTL low." },
      { author: "DevOps @ SaaS", text: "Watch TTL — we had 300s TTL that added 5 min to RTO during first real failover. Set it to 60s for critical records." },
    ],
    b5: [
      { author: "Platform Eng @ e-commerce", text: "We run automated restore tests weekly using a Lambda that spins up a snapshot, runs a query suite, then tears it down. Total cost: ~$4/month." },
    ],
    t1: [
      { author: "SRE @ healthtech", text: "Schedule DR exercises as recurring calendar blocks a quarter ahead. Treat cancellations the same as a production incident — requires sign-off from VP Eng." },
    ],
  },
};

function normalizeCompanySize(value: string): string {
  return value.replace(/-/g, "–").trim();
}

function normalizeAssessmentName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGrade(score: number): Grade {
  if (score >= 90) return { label: "Excellent", sublabel: "Production ready", color: "#059669", track: "#D1FAE5" };
  if (score >= 75) return { label: "Good", sublabel: "Minor gaps to address", color: "#2563EB", track: "#DBEAFE" };
  if (score >= 55) return { label: "Fair", sublabel: "Significant gaps present", color: "#D97706", track: "#FEF3C7" };
  if (score >= 30) return { label: "Poor", sublabel: "High risk in a real outage", color: "#DC2626", track: "#FEE2E2" };
  return { label: "Critical", sublabel: "Not DR ready", color: "#991B1B", track: "#FEE2E2" };
}

function calcScore(checked: Record<string, boolean>): number {
  const earned = ALL_ITEMS.filter((i) => checked[i.id]).reduce((a, i) => a + i.pts, 0);
  return Math.round((earned / TOTAL_PTS) * 100);
}

function weightColor(w: Weight): { bg: string; text: string } {
  if (w === "critical") return { bg: "#FEE2E2", text: "#991B1B" };
  if (w === "high") return { bg: "#FEF3C7", text: "#92400E" };
  return { bg: "#D1FAE5", text: "#065F46" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const grade = getGrade(score);
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={grade.track} strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={grade.color} strokeWidth={8}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 700, color: grade.color, lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>{score}</span>
        <span style={{ fontSize: 10, color: "#94A3B8", letterSpacing: "0.08em", marginTop: 2 }}>/ 100</span>
      </div>
    </div>
  );
}

function CheckItem({
  item,
  checked,
  onToggle,
  onOpenTip,
  communityData,
  isMobile,
}: {
  item: AssessmentItem;
  checked: boolean;
  onToggle: (id: string) => void;
  onOpenTip: (id: string) => void;
  communityData: CommunityData;
  isMobile: boolean;
}) {
  const wc = weightColor(item.weight);
  const hasTip = communityData.tips[item.id];
  const missed = communityData.mostMissed.find((m) => m.id === item.id);
  return (
    <div onClick={() => onToggle(item.id)}
      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0",
        borderTop: "1px solid #F1F5F9", cursor: "pointer",
        opacity: checked ? 0.65 : 1, transition: "opacity 0.15s" }}>
      <div style={{ width: 20, height: 20, borderRadius: 6, border: checked ? "none" : "2px solid #CBD5E1",
        background: checked ? "#2563EB" : "white", display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0, marginTop: 1, transition: "all 0.15s" }}>
        {checked && <span style={{ color: "white", fontSize: 12, lineHeight: 1 }}>✓</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.5, textDecoration: checked ? "line-through" : "none", textDecorationColor: "#94A3B8" }}>{item.label}</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3, lineHeight: 1.4 }}>{item.why}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
          {missed && (
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#FEE2E2", color: "#991B1B" }}>
              {missed.pct}% of teams skip this
            </span>
          )}
          {hasTip && (
            <button onClick={(e) => { e.stopPropagation(); onOpenTip(item.id); }}
              style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8",
                border: "none", cursor: "pointer" }}>
              {communityData.tips[item.id].length} community tip{communityData.tips[item.id].length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "flex-start" : "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, background: wc.bg, color: wc.text, fontWeight: 500 }}>{item.weight}</span>
        <span style={{ fontSize: 10, color: "#94A3B8" }}>{item.pts}pt{item.pts !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

function TipModal({
  itemId,
  onClose,
  tipsByItem,
}: {
  itemId: string;
  onClose: () => void;
  tipsByItem: Record<string, CommunityTip[]>;
}) {
  const item = ALL_ITEMS.find((i) => i.id === itemId);
  const tips = tipsByItem[itemId] || [];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
      onClick={onClose}>
      <div style={{ background: "white", borderRadius: 16, padding: 24, maxWidth: 480, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>Community tips</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1E293B", marginBottom: 16, lineHeight: 1.4 }}>{item?.label}</div>
        {tips.map((tip, i) => (
          <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.6 }}>&quot;{tip.text}&quot;</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>— {tip.author}</div>
          </div>
        ))}
        <div style={{ marginTop: 16, padding: 12, border: "1px dashed #CBD5E1", borderRadius: 10, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>Have a tip? Sign in to contribute →</div>
        </div>
        <button onClick={onClose}
          style={{ marginTop: 12, width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid #E2E8F0",
            background: "white", fontSize: 13, color: "#64748B", cursor: "pointer" }}>Close</button>
      </div>
    </div>
  );
}

function CommunityPanel({
  userScore,
  latestSavedScore,
  companySize,
  communityData,
}: {
  userScore: number;
  latestSavedScore?: number | null;
  companySize: string;
  communityData: CommunityData;
}) {
  const tier = communityData.bySize.find((b) => b.label.startsWith(companySize)) || communityData.bySize[0] || { label: companySize, avg: 0, count: 0 };
  const missed = communityData.mostMissed.map((m) => ({ ...m, item: ALL_ITEMS.find((i) => i.id === m.id) }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "white", borderRadius: 14, padding: 18, border: "1px solid #E2E8F0" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Benchmark</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <ScoreRing score={userScore} size={72} />
          <div>
            <div style={{ fontSize: 13, color: "#64748B" }}>Your current draft</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>vs {tier.count.toLocaleString()} {tier.label} teams</div>
            {typeof latestSavedScore === "number" && (
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
                Latest saved: <span style={{ fontWeight: 600 }}>{latestSavedScore}</span>
              </div>
            )}
          </div>
        </div>
        {communityData.bySize.map((b) => {
          const isYourTier = b.label === tier.label;
          return (
            <div key={b.label} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: isYourTier ? "#1E293B" : "#94A3B8", marginBottom: 3, fontWeight: isYourTier ? 500 : 400 }}>
                <span>{b.label}</span><span>{b.avg}</span>
              </div>
              <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3 }}>
                <div style={{ height: 5, borderRadius: 3, width: b.avg + "%", background: isYourTier ? "#2563EB" : "#CBD5E1", transition: "width 0.6s" }} />
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8" }}>
          <span>Global average</span><span style={{ fontWeight: 500, color: "#64748B" }}>{communityData.avgScore}</span>
        </div>
      </div>
      <div style={{ background: "white", borderRadius: 14, padding: 18, border: "1px solid #E2E8F0" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Most skipped</div>
        {missed.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i === 0 ? "none" : "1px solid #F1F5F9" }}>
            <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 16 }}>{i + 1}</span>
            <div style={{ flex: 1, fontSize: 11, color: "#475569", lineHeight: 1.4 }}>{m.item?.label}</div>
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: m.pct > 60 ? "#FEE2E2" : "#FEF3C7", color: m.pct > 60 ? "#991B1B" : "#92400E", flexShrink: 0 }}>{m.pct}%</span>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 11, color: "#94A3B8", textAlign: "center" }}>Based on {communityData.totalAssessments.toLocaleString()} assessments</div>
      </div>
    </div>
  );
}

function SavedAssessments({
  assessments,
  onLoad,
  onNew,
  onDelete,
  deletingId,
  isMobile,
}: {
  assessments: SavedAssessment[];
  onLoad: (a: SavedAssessment) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
  isMobile: boolean;
}) {
  if (assessments.length === 0) return (
    <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8", fontSize: 13 }}>
      No saved assessments yet.<br />Complete and save your first one below.
      <div style={{ marginTop: 14 }}>
        <button
          onClick={onNew}
          style={{ fontSize: 13, padding: "8px 14px", borderRadius: 8, border: "none", background: "#1E293B", color: "white", cursor: "pointer", fontWeight: 500 }}>
          Start new assessment
        </button>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {assessments.map((a) => {
        const grade = getGrade(a.score);
        return (
          <div key={a.id} onClick={() => onLoad(a)}
            style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 14px",
              cursor: "pointer", display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 12, transition: "border-color 0.15s", flexWrap: isMobile ? "wrap" : "nowrap" }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#93C5FD"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#E2E8F0"}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: grade.track, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: grade.color, fontFamily: "'DM Mono', monospace" }}>{a.score}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{a.date} · {a.checkedCount} / {ALL_ITEMS.length} items</div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(a.id);
              }}
              disabled={deletingId === a.id}
              style={{
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #FECACA",
                background: deletingId === a.id ? "#FEE2E2" : "white",
                color: "#B91C1C",
                cursor: deletingId === a.id ? "not-allowed" : "pointer",
                fontWeight: 500,
                marginLeft: isMobile ? 56 : 0,
              }}>
              {deletingId === a.id ? "Deleting..." : "Delete"}
            </button>
            <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: grade.track, color: grade.color, fontWeight: 500, marginLeft: isMobile ? "auto" : 0 }}>{grade.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function DRScorer() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<"scorer" | "dashboard" | "community">("scorer"); // scorer | dashboard | community
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [assessmentName, setAssessmentName] = useState("My AWS DR assessment");
  const [companySize, setCompanySize] = useState("Startup (1–50)");
  const [savedAssessments, setSavedAssessments] = useState<SavedAssessment[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [communityData, setCommunityData] = useState<CommunityData>(COMMUNITY_FALLBACK);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [tipDraftItemId, setTipDraftItemId] = useState<string>(ALL_ITEMS[0].id);
  const [tipDraftText, setTipDraftText] = useState("");
  const [tipSubmitMessage, setTipSubmitMessage] = useState<string | null>(null);
  const [submittingTip, setSubmittingTip] = useState(false);
  const [activeTip, setActiveTip] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingExisting, setPendingExisting] = useState<{ id: string; name: string } | null>(null);
  const [pendingOverwriteLoading, setPendingOverwriteLoading] = useState(false);
  const [saveResultMessage, setSaveResultMessage] = useState<string | null>(null);
  const [lastUpdateResponse, setLastUpdateResponse] = useState<any>(null);
  const [lastFetchResponse, setLastFetchResponse] = useState<any>(null);
  const [activeAssessmentId, setActiveAssessmentId] = useState<string | null>(null);
  const [activeAssessmentSourceName, setActiveAssessmentSourceName] = useState<string | null>(null);
  const [pendingDeleteAssessment, setPendingDeleteAssessment] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const applyMobile = () => setIsMobile(media.matches);
    applyMobile();
    media.addEventListener("change", applyMobile);
    return () => media.removeEventListener("change", applyMobile);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      if (!data.user) {
        setSavedAssessments([]);
        setActiveAssessmentId(null);
        setActiveAssessmentSourceName(null);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        setSavedAssessments([]);
        setActiveAssessmentId(null);
        setActiveAssessmentSourceName(null);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase.auth]);

  useEffect(() => {
    let mounted = true;

    if (!user) return;

    const fetchSavedAssessments = async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, name, score, checked_items, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!mounted) return;
      if (error) {
        setSavedAssessments([]);
      } else {
        const mapped: SavedAssessment[] = (data ?? []).map((a) => {
          const checkedItems = (a.checked_items as Record<string, boolean> | null) ?? {};
          return {
            id: String(a.id),
            name: String(a.name),
            score: Number(a.score),
            date: new Date(String(a.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            checkedCount: Object.values(checkedItems).filter(Boolean).length,
            checked: checkedItems,
          };
        });
        setSavedAssessments(mapped);
      }
    };

    fetchSavedAssessments();

    return () => {
      mounted = false;
    };
  }, [user, supabase]);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      supabase.rpc("get_community_stats"),
      supabase.from("community_tips").select("id, item_id, tip_text, author_label, created_at").order("created_at", { ascending: false }),
    ]).then(([statsRes, tipsRes]) => {
      if (!mounted) return;

      if (statsRes.error || tipsRes.error) {
        setCommunityData(COMMUNITY_FALLBACK);
        setCommunityError("Could not load live community data right now.");
        setCommunityLoading(false);
        return;
      }

      const tipsByItem: Record<string, CommunityTip[]> = {};
      const tipRows = ((tipsRes.data ?? []) as CommunityTipRow[]);
      tipRows.forEach((row) => {
        const itemId = String(row.item_id);
        if (!tipsByItem[itemId]) tipsByItem[itemId] = [];
        tipsByItem[itemId].push({
          id: String(row.id),
          item_id: itemId,
          text: String(row.tip_text ?? ""),
          author: row.author_label ? String(row.author_label) : "Community member",
          created_at: row.created_at ? String(row.created_at) : undefined,
        });
      });

      const stats = (statsRes.data as CommunityStatsRpc | null) ?? null;
      const bySize = Array.isArray(stats?.bySize)
        ? stats.bySize
            .map((entry) => ({
              label: String(entry.label),
              avg: Number(entry.avg ?? 0),
              count: Number(entry.count ?? 0),
            }))
            .sort(
              (a, b) =>
                COMPANY_SIZE_BUCKETS.indexOf(normalizeCompanySize(a.label)) -
                COMPANY_SIZE_BUCKETS.indexOf(normalizeCompanySize(b.label))
            )
        : COMMUNITY_FALLBACK.bySize;

      const mostMissed = Array.isArray(stats?.mostMissed)
        ? stats.mostMissed.map((entry) => ({
            id: String(entry.id),
            pct: Number(entry.pct ?? 0),
          }))
        : COMMUNITY_FALLBACK.mostMissed;

      setCommunityData({
        totalAssessments: Number(stats?.totalAssessments ?? COMMUNITY_FALLBACK.totalAssessments),
        avgScore: Number(stats?.avgScore ?? COMMUNITY_FALLBACK.avgScore),
        bySize,
        mostMissed,
        tips: tipsByItem,
      });
      setCommunityLoading(false);
    }).catch(() => {
      if (mounted) {
        setCommunityData(COMMUNITY_FALLBACK);
        setCommunityError("Could not load live community data right now.");
        setCommunityLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const score = calcScore(checked);
  const grade = getGrade(score);
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const latestSavedAssessment = savedAssessments[0] ?? null;
  const latestSavedScore = latestSavedAssessment ? latestSavedAssessment.score : null;
  const latestSavedGrade = typeof latestSavedScore === "number" ? getGrade(latestSavedScore) : null;

  const toggle = useCallback((id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleSave = async () => {
    if (!user) {
      window.location.href = "/auth";
      return;
    }
    const trimmedName = assessmentName.trim();
    if (!trimmedName) {
      setSaveError("Assessment name cannot be empty.");
      return;
    }
    setSaveError(null);

    try {
      const normalizedName = normalizeAssessmentName(trimmedName);
      const isRenameFromLoaded =
        !!activeAssessmentId &&
        !!activeAssessmentSourceName &&
        normalizeAssessmentName(activeAssessmentSourceName) !== normalizedName;
      const conflictingByName = savedAssessments.find(
        (a) =>
          normalizeAssessmentName(a.name) === normalizedName &&
          a.id !== (isRenameFromLoaded ? null : activeAssessmentId)
      );

      if (conflictingByName) {
        setPendingExisting({ id: conflictingByName.id, name: conflictingByName.name });
        return;
      }

      // If we are editing a loaded assessment with the same name, update by id.
      // If the loaded assessment was renamed, treat save as creating a new assessment.
      if (activeAssessmentId && !isRenameFromLoaded) {
        const updatePayload = { name: trimmedName, score, checked_items: { ...checked }, company_size: companySize };
        const updateRes = await supabase
          .from("assessments")
          .update(updatePayload)
          .eq("id", activeAssessmentId)
          .eq("user_id", user.id)
          .select("id, name, score, checked_items, created_at")
          .maybeSingle();
        setLastUpdateResponse(updateRes);
        let persistedRow = updateRes.data;

        // Some RLS setups allow insert/delete but block update. In that case, emulate
        // an update by creating a replacement row, then removing the old row.
        if (updateRes.error || !persistedRow) {
          const replacementInsertRes = await supabase
            .from("assessments")
            .insert({
              user_id: user.id,
              ...updatePayload,
            })
            .select("id, name, score, checked_items, created_at")
            .maybeSingle();
          setLastUpdateResponse(replacementInsertRes);

          if (replacementInsertRes.error || !replacementInsertRes.data) {
            throw updateRes.error ?? replacementInsertRes.error ?? new Error("Could not persist assessment update.");
          }

          const replacementRow = replacementInsertRes.data;
          const deleteOldRes = await supabase
            .from("assessments")
            .delete()
            .eq("id", activeAssessmentId)
            .eq("user_id", user.id);
          if (deleteOldRes.error) {
            throw deleteOldRes.error;
          }
          persistedRow = replacementRow;
          setActiveAssessmentId(String(replacementRow.id));
        }

        const refreshRes = await supabase
          .from("assessments")
          .select("id, name, score, checked_items, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        setLastFetchResponse(refreshRes);

        if (refreshRes.error) {
          throw refreshRes.error;
        }

        const mappedAll: SavedAssessment[] = (refreshRes.data ?? []).map((a) => {
          const c = (a.checked_items as Record<string, boolean> | null) ?? {};
          return {
            id: String(a.id),
            name: String(a.name),
            score: Number(a.score),
            date: new Date(String(a.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            checkedCount: Object.values(c).filter(Boolean).length,
            checked: c,
          };
        });
        setSavedAssessments(mappedAll);
        setSaveFlash(true);
        setTimeout(() => setSaveFlash(false), 2000);
        setActiveAssessmentSourceName(trimmedName);
        setSaveResultMessage(`Updated — server score: ${Number(persistedRow?.score ?? score)}`);
        setTimeout(() => setSaveResultMessage(null), 3000);
        return;
      }

      // No existing assessment found — create a new one.
      const newAssessment = {
        user_id: user.id,
        name: trimmedName,
        score,
        checked_items: { ...checked },
        company_size: companySize,
      };
  const insertRes = await supabase.from("assessments").insert(newAssessment).select().maybeSingle();
  setLastUpdateResponse(insertRes);
  const data = insertRes.data;
  const error = insertRes.error;

  if (!error && data) {
        const checkedItems = (data.checked_items as Record<string, boolean> | null) ?? {};
        const mapped: SavedAssessment = {
          id: String(data.id),
          name: String(data.name),
          score: Number(data.score),
          date: new Date(String(data.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          checkedCount: Object.values(checkedItems).filter(Boolean).length,
          checked: checkedItems,
        };
        // Refresh the saved assessments from the DB (ensure canonical state)
        const refreshRes = await supabase
          .from("assessments")
          .select("id, name, score, checked_items, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        setLastFetchResponse(refreshRes);
        const refresh = refreshRes.data;
        const refreshErr = refreshRes.error;

        if (!refreshErr && refresh) {
          const mappedAll: SavedAssessment[] = (refresh ?? []).map((a) => {
            const c = (a.checked_items as Record<string, boolean> | null) ?? {};
            return {
              id: String(a.id),
              name: String(a.name),
              score: Number(a.score),
              date: new Date(String(a.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
              checkedCount: Object.values(c).filter(Boolean).length,
              checked: c,
            };
          });
          setSavedAssessments(mappedAll);
        } else {
          // Fallback to optimistic mapped entry
          setSavedAssessments((prev) => [mapped, ...prev]);
        }

        setSaveFlash(true);
        setTimeout(() => setSaveFlash(false), 2000);
        setActiveAssessmentId(String(data.id));
        setActiveAssessmentSourceName(String(data.name));
        setSaveResultMessage(`Saved — server score: ${mapped.score}`);
        setTimeout(() => setSaveResultMessage(null), 3000);
      }
    } catch (err) {
      console.error("Error saving assessment:", err);
    }
  };

  const handleLoad = (a: SavedAssessment) => {
    setChecked(a.checked || {});
    setAssessmentName(a.name);
    setActiveAssessmentId(a.id);
    setActiveAssessmentSourceName(a.name);
    setView("scorer");
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    setDeletingId(id);
    const { error } = await supabase.from("assessments").delete().eq("id", id).eq("user_id", user.id);
    if (!error) {
      setSavedAssessments((prev) => prev.filter((a) => a.id !== id));
      if (activeAssessmentId === id) {
        setActiveAssessmentId(null);
        setActiveAssessmentSourceName(null);
      }
    }
    setDeletingId(null);
  };

  const requestDelete = (id: string) => {
    const assessment = savedAssessments.find((a) => a.id === id);
    if (!assessment) return;
    setPendingDeleteAssessment({ id: assessment.id, name: assessment.name });
  };

  const confirmDelete = async () => {
    if (!pendingDeleteAssessment) return;
    await handleDelete(pendingDeleteAssessment.id);
    setPendingDeleteAssessment(null);
  };

  const cancelDelete = () => {
    if (deletingId) return;
    setPendingDeleteAssessment(null);
  };

  const handleShareExperience = async () => {
    if (!user) {
      window.location.href = "/auth";
      return;
    }

    const text = tipDraftText.trim();
    if (!text) {
      setTipSubmitMessage("Write a short tip before submitting.");
      return;
    }

    setSubmittingTip(true);
    setTipSubmitMessage(null);

    const author = user.email ? user.email.split("@")[0] : "Community member";
    const { data, error } = await supabase
      .from("community_tips")
      .insert({
        item_id: tipDraftItemId,
        tip_text: text,
        author_label: author,
        user_id: user.id,
      })
  .select("id, item_id, tip_text, author_label, created_at")
  .maybeSingle();

    if (error) {
      setTipSubmitMessage(error.message);
    } else if (data) {
      const tip: CommunityTip = {
        id: String(data.id),
        item_id: String(data.item_id),
        text: String(data.tip_text),
        author: data.author_label ? String(data.author_label) : "Community member",
        created_at: data.created_at ? String(data.created_at) : undefined,
      };
      setCommunityData((prev) => ({
        ...prev,
        tips: {
          ...prev.tips,
          [tipDraftItemId]: [tip, ...(prev.tips[tipDraftItemId] ?? [])],
        },
      }));
      setTipDraftText("");
      setTipSubmitMessage("Thanks for sharing your experience.");
    }

    setSubmittingTip(false);
  };

  const criticalMissed = ALL_ITEMS.filter((i) => i.weight === "critical" && !checked[i.id]).slice(0, 3);

  const confirmOverwrite = async () => {
    if (!user || !pendingExisting) return;
    const id = pendingExisting.id;
    setPendingOverwriteLoading(true);
    setSaveError(null);
    try {
      // Request the updated row back from the DB so we can use canonical values immediately
      const updateRes = await supabase
        .from("assessments")
        .update({ name: assessmentName.trim(), score, checked_items: { ...checked }, company_size: companySize })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id, name, score, checked_items, created_at")
        .maybeSingle();
      setLastUpdateResponse(updateRes);
      if (updateRes.error) {
        throw updateRes.error;
      }

      // Re-fetch the updated row to ensure we have the latest values from the DB
      const fetchRes = await supabase
        .from("assessments")
        .select("id, name, score, checked_items, created_at")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      setLastFetchResponse(fetchRes);
      const fresh = fetchRes.data;
      if (fetchRes.error || !fresh) {
        throw fetchRes.error ?? new Error("Could not fetch updated assessment");
      }

      const checkedItems = (fresh.checked_items as Record<string, boolean> | null) ?? {};
      const mapped: SavedAssessment = {
        id: String(fresh.id),
        name: String(fresh.name),
        score: Number(fresh.score),
        date: new Date(String(fresh.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        checkedCount: Object.values(checkedItems).filter(Boolean).length,
        checked: checkedItems,
      };
      // Refresh the whole list from the DB to ensure canonical state
      const { data: refreshAll, error: refreshAllErr } = await supabase
        .from("assessments")
        .select("id, name, score, checked_items, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!refreshAllErr && refreshAll) {
        const mappedAll: SavedAssessment[] = (refreshAll ?? []).map((a) => {
          const c = (a.checked_items as Record<string, boolean> | null) ?? {};
          return {
            id: String(a.id),
            name: String(a.name),
            score: Number(a.score),
            date: new Date(String(a.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            checkedCount: Object.values(c).filter(Boolean).length,
            checked: c,
          };
        });
        setSavedAssessments(mappedAll);
      } else {
        setSavedAssessments((prev) => [mapped, ...prev.filter((a) => a.id !== mapped.id)]);
      }
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2000);
      setActiveAssessmentId(mapped.id);
      setActiveAssessmentSourceName(mapped.name);
      setSaveResultMessage(`Saved — server score: ${mapped.score}`);
      setTimeout(() => setSaveResultMessage(null), 3000);
    } catch (err) {
      console.error("Error overwriting assessment:", err);
      setSaveError(String((err as Error).message ?? "Could not overwrite assessment."));
    } finally {
      setPendingOverwriteLoading(false);
      setPendingExisting(null);
    }
  };

  const cancelOverwrite = () => {
    setPendingExisting(null);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#F8FAFC", minHeight: "100vh", color: "#1E293B" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: isMobile ? "0 12px" : "0 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: isMobile ? 0 : 56, padding: isMobile ? "10px 0" : 0, gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#1E293B", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "white", fontSize: 14 }}>⬡</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#1E293B", letterSpacing: "-0.02em" }}>DRscore</span>
            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "#EFF6FF", color: "#1D4ED8", fontWeight: 500 }}>AWS</span>
          </div>
          <div style={{ display: "flex", gap: 4, width: isMobile ? "100%" : "auto", order: isMobile ? 3 : 0 }}>
            {([["scorer", "Scorer"], ["dashboard", "My assessments"], ["community", "Community"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: view === v ? "#F1F5F9" : "transparent",
                  color: view === v ? "#1E293B" : "#64748B", fontWeight: view === v ? 500 : 400, flex: isMobile ? 1 : undefined }}>
                {label}
              </button>
            ))}
          </div>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", maxWidth: isMobile ? "100%" : "none" }}>
              {typeof latestSavedScore === "number" && (
                <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: latestSavedGrade?.track, color: latestSavedGrade?.color, fontWeight: 600 }}>
                  Latest saved: {latestSavedScore}
                </span>
              )}
              <span style={{ fontSize: 12, color: "#94A3B8", maxWidth: isMobile ? 120 : 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </span>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  setUser(null);
                }}
                style={{ fontSize: 13, padding: "7px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                  background: "white", color: "#64748B", cursor: "pointer", fontWeight: 500 }}>
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => { window.location.href = "/auth"; }}
              style={{ fontSize: 13, padding: "7px 14px", borderRadius: 8, border: "none",
                background: "#1E293B", color: "white", cursor: "pointer", fontWeight: 500 }}>
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "16px 12px 28px" : "24px 24px 48px" }}>

        {/* ── Scorer view ── */}
        {view === "scorer" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 20, alignItems: "start" }}>
            <div>
              {/* Assessment meta */}
              <div style={{ background: "white", borderRadius: 14, padding: 18, border: "1px solid #E2E8F0", marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: isMobile ? "100%" : 200 }}>
                    <label style={{ fontSize: 11, color: "#94A3B8", display: "block", marginBottom: 4 }}>Assessment name</label>
                    <input value={assessmentName} onChange={(e) => { setAssessmentName(e.target.value); setSaveError(null); }}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0",
                        fontSize: 13, color: "#1E293B", outline: "none", background: "#F8FAFC" }} />
                    {saveError && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#B91C1C" }}>{saveError}</div>
                    )}
                  </div>
                  <div style={{ minWidth: isMobile ? "100%" : 160 }}>
                    <label style={{ fontSize: 11, color: "#94A3B8", display: "block", marginBottom: 4 }}>Company size</label>
                    <select value={companySize} onChange={(e) => setCompanySize(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0",
                        fontSize: 13, color: "#1E293B", outline: "none", background: "#F8FAFC", cursor: "pointer" }}>
                      <option>Startup (1–50)</option>
                      <option>Mid-market (51–500)</option>
                      <option>Enterprise (500+)</option>
                    </select>
                  </div>
                  <button onClick={handleSave}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none",
                      background: saveFlash ? "#059669" : "#1E293B", color: "white",
                      fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background 0.3s", whiteSpace: "nowrap", width: isMobile ? "100%" : "auto" }}>
                    {saveFlash ? "Saved ✓" : "Save assessment"}
                  </button>
                </div>
              </div>

              {/* Sections */}
              {SECTIONS.map((section) => {
                const sectionItems = section.items;
                const sectionChecked = sectionItems.filter((i) => checked[i.id]).length;
                return (
                  <div key={section.id} style={{ background: "white", borderRadius: 14, padding: 18, border: "1px solid #E2E8F0", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: section.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 14, color: section.color }}>{section.icon}</span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#1E293B" }}>{section.title}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 80, height: 4, background: "#F1F5F9", borderRadius: 2 }}>
                          <div style={{ height: 4, borderRadius: 2, background: section.color, width: `${(sectionChecked / sectionItems.length) * 100}%`, transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#94A3B8" }}>{sectionChecked}/{sectionItems.length}</span>
                      </div>
                    </div>
                    {sectionItems.map((item) => (
                      <CheckItem key={item.id} item={item} checked={!!checked[item.id]} onToggle={toggle} onOpenTip={setActiveTip} communityData={communityData} isMobile={isMobile} />
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Right panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, position: isMobile ? "static" : "sticky", top: 24 }}>
              {typeof latestSavedScore === "number" && (
                <div style={{ background: "white", borderRadius: 14, padding: 14, border: "1px solid #E2E8F0" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Latest saved score</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: latestSavedGrade?.color, fontFamily: "'DM Mono', monospace" }}>{latestSavedScore}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8" }}>{latestSavedAssessment?.date}</div>
                    </div>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: latestSavedGrade?.track, color: latestSavedGrade?.color, fontWeight: 600 }}>
                      {latestSavedGrade?.label}
                    </span>
                  </div>
                </div>
              )}
              {/* Score card */}
              <div style={{ background: "white", borderRadius: 14, padding: 20, border: "1px solid #E2E8F0" }}>
                <div style={{ display: "flex", alignItems: "center", flexDirection: isMobile ? "column" : "row", gap: 16, marginBottom: 16 }}>
                  <ScoreRing score={score} size={88} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: grade.color }}>{grade.label}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{grade.sublabel}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>{checkedCount} of {ALL_ITEMS.length} checked</div>
                  </div>
                </div>

                {/* Per-section mini bars */}
                {SECTIONS.map((s) => {
                  const sc = s.items.filter((i) => checked[i.id]).length;
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "#94A3B8", width: isMobile ? 92 : 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                      <div style={{ flex: 1, height: 4, background: "#F1F5F9", borderRadius: 2 }}>
                        <div style={{ height: 4, borderRadius: 2, background: s.color, width: `${(sc / s.items.length) * 100}%`, transition: "width 0.3s" }} />
                      </div>
                      <span style={{ fontSize: 10, color: "#CBD5E1", width: 24, textAlign: "right" }}>{sc}/{s.items.length}</span>
                    </div>
                  );
                })}
              </div>

              {/* Critical gaps */}
              {criticalMissed.length > 0 && (
                <div style={{ background: "#FEF2F2", borderRadius: 14, padding: 16, border: "1px solid #FECACA" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#991B1B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Critical gaps</div>
                  {criticalMissed.map((item) => (
                    <div key={item.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", marginTop: 5, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.4 }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Community teaser */}
              <div style={{ background: "#EFF6FF", borderRadius: 14, padding: 16, border: "1px solid #BFDBFE", cursor: "pointer" }}
                onClick={() => setView("community")}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1D4ED8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Community</div>
                <div style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.5 }}>
                  {communityLoading
                    ? "Loading live benchmark..."
                    : `See how your score compares to ${communityData.totalAssessments.toLocaleString()} other AWS teams →`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Dashboard view ── */}
        {view === "dashboard" && (
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 20, gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1E293B", margin: 0 }}>My assessments</h1>
                <p style={{ fontSize: 13, color: "#94A3B8", margin: "4px 0 0" }}>
                  {!user ? "Sign in to view your saved assessments" : `${savedAssessments.length} saved`}
                </p>
              </div>
              <button onClick={() => { setChecked({}); setAssessmentName("New assessment"); setActiveAssessmentId(null); setActiveAssessmentSourceName(null); setView("scorer"); }}
                style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "#1E293B", color: "white", cursor: "pointer", fontWeight: 500, width: isMobile ? "100%" : "auto" }}>
                + New assessment
              </button>
            </div>
            {user ? (
              <SavedAssessments
                assessments={savedAssessments}
                onLoad={handleLoad}
                onNew={() => setView("scorer")}
                onDelete={requestDelete}
                deletingId={deletingId}
                isMobile={isMobile}
              />
            ) : (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8", fontSize: 13 }}>
                Sign in to view and manage your saved assessments.
              </div>
            )}
          </div>
        )}

        {/* ── Community view ── */}
        {view === "community" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1E293B", margin: 0 }}>Community</h1>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "4px 0 0" }}>Anonymised data from {communityData.totalAssessments.toLocaleString()} AWS DR assessments</p>
            </div>
            {communityLoading && (
              <div style={{ marginBottom: 16, fontSize: 12, color: "#475569", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 12px" }}>
                Loading live community analytics...
              </div>
            )}
            {communityError && (
              <div style={{ marginBottom: 16, fontSize: 12, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 12px" }}>
                {communityError}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
              <CommunityPanel userScore={score} latestSavedScore={latestSavedScore} companySize={companySize} communityData={communityData} />
              <div style={{ background: "white", borderRadius: 14, padding: 18, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Community tips</div>
                {Object.entries(communityData.tips).map(([id, tips]) => {
                  const item = ALL_ITEMS.find((i) => i.id === id);
                  return (
                    <div key={id} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#1E293B", marginBottom: 8, lineHeight: 1.4 }}>{item?.label}</div>
                      {tips.map((tip, i) => (
                        <div key={i} style={{ background: "#F8FAFC", borderRadius: 8, padding: 10, marginBottom: 6 }}>
                          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>&quot;{tip.text}&quot;</div>
                          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>— {tip.author}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {Object.keys(communityData.tips).length === 0 && (
                  <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>No community tips yet. Be the first to share one.</div>
                )}
                <div style={{ padding: 14, border: "1px dashed #CBD5E1", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#1E293B", marginBottom: 8 }}>Share your experience</div>
                  {user ? (
                    <>
                      <select
                        value={tipDraftItemId}
                        onChange={(e) => setTipDraftItemId(e.target.value)}
                        style={{ width: "100%", marginBottom: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, color: "#1E293B", background: "white" }}>
                        {ALL_ITEMS.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                      <textarea
                        value={tipDraftText}
                        onChange={(e) => setTipDraftText(e.target.value)}
                        placeholder="Share a practical DR tip from your team..."
                        rows={3}
                        style={{ width: "100%", marginBottom: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, color: "#1E293B", resize: "vertical", boxSizing: "border-box" }}
                      />
                      {tipSubmitMessage && (
                        <div style={{ fontSize: 12, marginBottom: 8, color: tipSubmitMessage.startsWith("Thanks") ? "#065F46" : "#B91C1C" }}>
                          {tipSubmitMessage}
                        </div>
                      )}
                      <button
                        onClick={handleShareExperience}
                        disabled={submittingTip}
                        style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, border: "none", background: "#1E293B", color: "white", cursor: submittingTip ? "not-allowed" : "pointer", fontWeight: 500 }}>
                        {submittingTip ? "Submitting..." : "Post tip"}
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>Sign in to add tips and help the community.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {pendingExisting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onClick={cancelOverwrite}>
          <div style={{ background: "white", borderRadius: 16, padding: 20, maxWidth: 520, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1E293B", marginBottom: 8 }}>Overwrite existing assessment?</div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
              An assessment named &quot;{pendingExisting.name}&quot; already exists. Do you want to overwrite it with the current responses?
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={cancelOverwrite} disabled={pendingOverwriteLoading} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "white", color: "#64748B", cursor: pendingOverwriteLoading ? "not-allowed" : "pointer" }}>{pendingOverwriteLoading ? "Cancelling..." : "No, cancel"}</button>
              <button onClick={confirmOverwrite} disabled={pendingOverwriteLoading} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#1E293B", color: "white", cursor: pendingOverwriteLoading ? "not-allowed" : "pointer" }}>{pendingOverwriteLoading ? "Overwriting..." : "Yes, overwrite"}</button>
            </div>
          </div>
        </div>
      )}
      {pendingDeleteAssessment && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 220, padding: 16 }}
          onClick={cancelDelete}>
          <div
            style={{ background: "white", borderRadius: 16, padding: 20, maxWidth: 520, width: "100%" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1E293B", marginBottom: 8 }}>Delete assessment?</div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
              Are you sure you want to delete &quot;{pendingDeleteAssessment.name}&quot;? This action cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={cancelDelete}
                disabled={deletingId === pendingDeleteAssessment.id}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "white", color: "#64748B", cursor: deletingId === pendingDeleteAssessment.id ? "not-allowed" : "pointer" }}>
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletingId === pendingDeleteAssessment.id}
                style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#B91C1C", color: "white", cursor: deletingId === pendingDeleteAssessment.id ? "not-allowed" : "pointer" }}>
                {deletingId === pendingDeleteAssessment.id ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {activeTip && <TipModal itemId={activeTip} onClose={() => setActiveTip(null)} tipsByItem={communityData.tips} />}

      {process.env.NODE_ENV !== "production" && (
        <div style={{ position: "fixed", right: 16, bottom: 16, width: 380, maxHeight: "45vh", overflow: "auto", background: "rgba(255,255,255,0.95)", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12, fontSize: 12, zIndex: 300 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Dev debug</div>
          <div style={{ marginBottom: 8 }}><strong>Last UPDATE/INSERT response:</strong>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>{JSON.stringify(lastUpdateResponse, null, 2)}</pre>
          </div>
          <div><strong>Last SELECT/refresh response:</strong>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>{JSON.stringify(lastFetchResponse, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
