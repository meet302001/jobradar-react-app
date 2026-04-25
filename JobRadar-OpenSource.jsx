import { useState, useEffect, useMemo, useCallback } from "react";

const DEFAULT_TITLES = ["DevOps","SRE","Site Reliability","Platform Engineer","Infrastructure Engineer","Cloud Engineer","MLOps","LLMOps","AI Infrastructure"];
const DEFAULT_EXCLUSIONS = ["Senior Staff","Principal","Director","VP","Head of"];

function parseCSV(text) {
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = [];
    let current = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQ = !inQ;
      else if (line[i] === "," && !inQ) { values.push(current.trim()); current = ""; }
      else current += line[i];
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || "");
    return obj;
  });
}

function skillMatch(jobSkills, mySkills) {
  if (!jobSkills || !mySkills.length) return { count: 0, matched: [], level: "LOW" };
  const jArr = jobSkills.toLowerCase().split(",").map(s => s.trim());
  const matched = jArr.filter(s => mySkills.some(m => s.includes(m.toLowerCase())));
  const count = matched.length;
  return { count, matched, level: count >= 6 ? "HIGH" : count >= 3 ? "MEDIUM" : "LOW" };
}

const STORAGE_KEY = "jobRadar_config";

function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

function saveConfig(config) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
}

// ─── Styles ───
const theme = {
  bg: "#0a0a0c",
  surface: "#111114",
  surface2: "#18181b",
  border: "#27272a",
  border2: "#3f3f46",
  text: "#fafafa",
  text2: "#a1a1aa",
  text3: "#71717a",
  text4: "#52525b",
  green: "#22c55e",
  greenLight: "#4ade80",
  greenDark: "#166534",
  yellow: "#eab308",
  yellowLight: "#fde047",
  yellowDark: "#713f12",
  blue: "#3b82f6",
  blueLight: "#60a5fa",
  purple: "#a855f7",
  purpleLight: "#c084fc",
  red: "#ef4444",
  font: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', 'Menlo', monospace",
};

const levelStyle = {
  HIGH: { bg: "#0a1f12", border: "#22c55e40", accent: "#22c55e", text: "#4ade80", badge: "#14532d" },
  MEDIUM: { bg: "#1a1708", border: "#eab30840", accent: "#eab308", text: "#fde047", badge: "#713f12" },
  LOW: { bg: "#111114", border: "#27272a", accent: "#3f3f46", text: "#a1a1aa", badge: "#27272a" },
};

export default function App() {
  const [view, setView] = useState("loading"); // loading | setup | dashboard
  const [config, setConfig] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState("ALL");
  const [filterRemote, setFilterRemote] = useState(false);
  const [sortBy, setSortBy] = useState("match");
  const [expanded, setExpanded] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Setup form state
  const [formToken, setFormToken] = useState("");
  const [formSheetId, setFormSheetId] = useState("");
  const [formSheetTab, setFormSheetTab] = useState("DailyJobs");
  const [formSkills, setFormSkills] = useState("AWS, EKS, Docker, Kubernetes, Terraform, Python, Bash, Prometheus, Grafana, CI/CD, GitHub Actions, Jenkins, Ansible, Linux");
  const [formTitles, setFormTitles] = useState(DEFAULT_TITLES.join(", "));
  const [formTier1, setFormTier1] = useState("Together AI, CoreWeave, Anthropic, OpenAI, Databricks, HuggingFace, Replicate, NVIDIA");
  const [formTier2, setFormTier2] = useState("Apple, Google, Microsoft, Meta, Netflix, Stripe, JPMorgan, Cloudflare, Datadog");

  useEffect(() => {
    const saved = loadConfig();
    if (saved && saved.sheetId) {
      setConfig(saved);
      setView("dashboard");
    } else {
      setView("setup");
    }
  }, []);

  const fetchJobs = useCallback(async (cfg) => {
    setSyncing(true);
    setError(null);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cfg.sheetTab)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Sheet returned ${res.status}. Make sure it's shared as "Anyone with the link → Viewer".`);
      const text = await res.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) throw new Error("No data found. Make sure the sheet tab name matches and has data.");
      const skills = cfg.skills.map(s => s.toLowerCase());
      const t1 = cfg.tier1.map(s => s.toLowerCase());
      const t2 = cfg.tier2.map(s => s.toLowerCase());
      const enriched = parsed.map(job => {
        const match = skillMatch(job.key_skills, skills);
        const org = (job.organization || "").toLowerCase();
        const tier = t1.some(t => org.includes(t)) ? "Tier 1" : t2.some(t => org.includes(t)) ? "Tier 2" : "Other";
        return { ...job, match, tier };
      });
      setJobs(enriched);
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (config && view === "dashboard") fetchJobs(config);
  }, [config, view, fetchJobs]);

  const handleSetup = (e) => {
    e.preventDefault();
    const cfg = {
      token: formToken.trim(),
      sheetId: formSheetId.trim(),
      sheetTab: formSheetTab.trim(),
      skills: formSkills.split(",").map(s => s.trim()).filter(Boolean),
      titles: formTitles.split(",").map(s => s.trim()).filter(Boolean),
      tier1: formTier1.split(",").map(s => s.trim()).filter(Boolean),
      tier2: formTier2.split(",").map(s => s.trim()).filter(Boolean),
    };
    // Extract sheet ID from URL if user pasted full URL
    const urlMatch = cfg.sheetId.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) cfg.sheetId = urlMatch[1];
    saveConfig(cfg);
    setConfig(cfg);
    setView("dashboard");
  };

  const triggerScrape = async () => {
    if (!config.token) { setError("No Apify token configured. Add it in settings."); return; }
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`https://api.apify.com/v2/acts/fantastic-jobs~career-site-job-listing-api/runs?token=${config.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeRange: "24h", limit: 50, includeAi: true, removeAgency: true,
          titleSearch: config.titles.length ? config.titles : DEFAULT_TITLES,
          titleExclusionSearch: DEFAULT_EXCLUSIONS,
          locationSearch: ["United States"],
          aiExperienceLevelFilter: ["2-5"],
          aiEmploymentTypeFilter: ["FULL_TIME"],
          descriptionType: "text"
        })
      });
      if (!res.ok) throw new Error("Failed to trigger scrape. Check your Apify token.");
      setError(null);
      alert("Scrape triggered! Jobs will appear in your Google Sheet in ~2 minutes once your webhook pushes the data.");
    } catch (e) { setError(e.message); }
    finally { setSyncing(false); }
  };

  const filtered = useMemo(() => {
    let result = [...jobs];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(j =>
        (j.title||"").toLowerCase().includes(s) ||
        (j.organization||"").toLowerCase().includes(s) ||
        (j.key_skills||"").toLowerCase().includes(s) ||
        (j.location||"").toLowerCase().includes(s)
      );
    }
    if (filterLevel !== "ALL") result = result.filter(j => j.match.level === filterLevel);
    if (filterRemote) result = result.filter(j => (j.work_type||"").toLowerCase().includes("remote"));
    if (sortBy === "match") result.sort((a,b) => b.match.count - a.match.count);
    else if (sortBy === "salary") result.sort((a,b) => (Number(b.salary_max)||0) - (Number(a.salary_max)||0));
    else if (sortBy === "date") result.sort((a,b) => (b.date_posted||"").localeCompare(a.date_posted||""));
    return result;
  }, [jobs, search, filterLevel, filterRemote, sortBy]);

  const stats = useMemo(() => ({
    total: jobs.length,
    high: jobs.filter(j => j.match.level === "HIGH").length,
    med: jobs.filter(j => j.match.level === "MEDIUM").length,
    t1: jobs.filter(j => j.tier === "Tier 1").length,
    remote: jobs.filter(j => (j.work_type||"").toLowerCase().includes("remote")).length,
    visa: jobs.filter(j => j.visa_sponsorship === "true").length,
  }), [jobs]);

  // ─── SETUP SCREEN ───
  if (view === "setup" || view === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <form onSubmit={handleSetup} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 32, maxWidth: 560, width: "100%" }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.text, fontFamily: theme.font, margin: "0 0 4px", letterSpacing: "-0.02em" }}>⚡ JobRadar</h1>
            <p style={{ color: theme.text3, fontSize: 13, margin: 0, fontFamily: theme.font }}>Open-source job search dashboard. Bring your own Apify token & Google Sheet.</p>
          </div>

          <Label text="Google Sheet URL or ID *" sub="Your Apify pipeline pushes jobs here" />
          <Input value={formSheetId} onChange={setFormSheetId} placeholder="https://docs.google.com/spreadsheets/d/1TAv... or just the ID" required />

          <Label text="Sheet Tab Name" sub="The tab where jobs land" />
          <Input value={formSheetTab} onChange={setFormSheetTab} placeholder="DailyJobs" />

          <Label text="Apify API Token" sub="Optional — enables 'Scrape Now' button. Get it from console.apify.com → Settings → Integrations" />
          <Input value={formToken} onChange={setFormToken} placeholder="apify_api_..." type="password" />

          <Label text="Your Skills" sub="Comma-separated. Used to match and score jobs." />
          <TextArea value={formSkills} onChange={setFormSkills} rows={2} />

          <Label text="Job Titles to Search" sub="Comma-separated. Used when triggering Apify scrape." />
          <TextArea value={formTitles} onChange={setFormTitles} rows={2} />

          <Label text="Tier 1 Companies" sub="Dream companies — highlighted in the dashboard" />
          <TextArea value={formTier1} onChange={setFormTier1} rows={2} />

          <Label text="Tier 2 Companies" sub="Good companies — also highlighted" />
          <TextArea value={formTier2} onChange={setFormTier2} rows={2} />

          <button type="submit" style={{ width: "100%", background: theme.green, color: "#000", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: theme.font, marginTop: 8 }}>
            Launch Dashboard →
          </button>

          <p style={{ color: theme.text4, fontSize: 11, textAlign: "center", marginTop: 12, fontFamily: theme.mono }}>
            All data stays in your browser. Nothing is sent to any server.
          </p>
        </form>
      </div>
    );
  }

  // ─── DASHBOARD ───
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: theme.font }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <header style={{ borderBottom: `1px solid ${theme.border}`, background: theme.surface }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em" }}>⚡ JobRadar</span>
            <span style={{ fontSize: 10, color: theme.text4, fontFamily: theme.mono, background: theme.surface2, padding: "2px 6px", borderRadius: 3 }}>open-source</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => fetchJobs(config)} disabled={syncing} style={{ ...btnStyle, background: "transparent", color: theme.text2, border: `1px solid ${theme.border}` }}>
              {syncing ? "Syncing..." : "↻ Refresh"}
            </button>
            {config.token && (
              <button onClick={triggerScrape} disabled={syncing} style={{ ...btnStyle, background: theme.green, color: "#000", border: "none", fontWeight: 700 }}>
                🚀 Scrape Now
              </button>
            )}
            <button onClick={() => { setView("setup"); const c = config; setFormToken(c.token||""); setFormSheetId(c.sheetId||""); setFormSheetTab(c.sheetTab||"DailyJobs"); setFormSkills(c.skills?.join(", ")||""); setFormTitles(c.titles?.join(", ")||""); setFormTier1(c.tier1?.join(", ")||""); setFormTier2(c.tier2?.join(", ")||""); }} style={{ ...btnStyle, background: "transparent", color: theme.text3, border: `1px solid ${theme.border}` }}>⚙</button>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ maxWidth: 1100, margin: "12px auto 0", padding: "0 20px" }}>
          <div style={{ background: "#1c0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fca5a5" }}>
            {error}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 20px 0" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { v: stats.total, l: "Total", c: theme.text2 },
            { v: stats.high, l: "High", c: theme.greenLight },
            { v: stats.med, l: "Medium", c: theme.yellowLight },
            { v: stats.t1, l: "Tier 1", c: "#818cf8" },
            { v: stats.remote, l: "Remote", c: theme.blueLight },
            { v: stats.visa, l: "Visa", c: theme.purpleLight },
          ].map(s => (
            <div key={s.l} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "6px 12px", display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: s.c, fontFamily: theme.mono }}>{s.v}</span>
              <span style={{ fontSize: 11, color: theme.text4 }}>{s.l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 20px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text" placeholder="Search jobs, companies, skills..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "7px 12px", color: theme.text, fontSize: 13, outline: "none", fontFamily: theme.font }}
        />
        {["ALL","HIGH","MEDIUM","LOW"].map(lv => (
          <button key={lv} onClick={() => setFilterLevel(lv)} style={{ ...btnStyle, background: filterLevel === lv ? theme.green : theme.surface2, color: filterLevel === lv ? "#000" : theme.text2, border: `1px solid ${filterLevel === lv ? theme.green : theme.border}`, fontWeight: filterLevel === lv ? 700 : 500 }}>
            {lv === "ALL" ? "All" : lv === "HIGH" ? "🔥 High" : lv === "MEDIUM" ? "⚡ Med" : "Low"}
          </button>
        ))}
        <button onClick={() => setFilterRemote(!filterRemote)} style={{ ...btnStyle, background: filterRemote ? theme.blue : theme.surface2, color: filterRemote ? "#fff" : theme.text2, border: `1px solid ${filterRemote ? theme.blue : theme.border}` }}>🏠 Remote</button>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, cursor: "pointer" }}>
          <option value="match">Sort: Match</option>
          <option value="salary">Sort: Salary</option>
          <option value="date">Sort: Newest</option>
        </select>
        <span style={{ fontSize: 11, color: theme.text4, fontFamily: theme.mono }}>{filtered.length} results</span>
      </div>

      {/* Job list */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4px 20px 40px" }}>
        {filtered.map((job, i) => {
          const ls = levelStyle[job.match.level];
          const isOpen = expanded === i;
          const salary = job.salary_min && job.salary_max ? `$${Number(job.salary_min).toLocaleString()}-$${Number(job.salary_max).toLocaleString()}` : job.salary_min ? `$${Number(job.salary_min).toLocaleString()}+` : "";
          const tierColor = job.tier === "Tier 1" ? "#818cf8" : job.tier === "Tier 2" ? theme.blueLight : theme.text4;

          return (
            <div key={i} onClick={() => setExpanded(isOpen ? null : i)}
              style={{ background: ls.bg, border: `1px solid ${ls.border}`, borderLeft: `3px solid ${ls.accent}`, borderRadius: 8, padding: "12px 16px", marginBottom: 6, cursor: "pointer", transition: "border-color 0.15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: theme.mono, color: ls.text, background: ls.badge, padding: "1px 7px", borderRadius: 3 }}>{job.match.level} · {job.match.count}</span>
                    <span style={{ fontSize: 10, color: tierColor, background: `${tierColor}15`, padding: "1px 7px", borderRadius: 3 }}>{job.tier}</span>
                    {job.visa_sponsorship === "true" && <span style={{ fontSize: 10, color: theme.purpleLight, background: "#3b076415", padding: "1px 7px", borderRadius: 3 }}>🛂 Visa</span>}
                    {(job.work_type||"").toLowerCase().includes("remote") && <span style={{ fontSize: 10, color: theme.blueLight, background: "#17255415", padding: "1px 7px", borderRadius: 3 }}>🏠 Remote</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, letterSpacing: "-0.01em", marginBottom: 2 }}>{job.title}</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
                    <span style={{ color: "#d4d4d8", fontWeight: 600 }}>{job.organization}</span>
                    <span style={{ color: theme.text3 }}>📍 {job.location || "US"}</span>
                    {salary && <span style={{ color: theme.greenLight, fontWeight: 600, fontFamily: theme.mono, fontSize: 11 }}>{salary}</span>}
                    {job.date_posted && <span style={{ color: theme.text4, fontFamily: theme.mono, fontSize: 10 }}>{job.date_posted.split("T")[0]}</span>}
                  </div>
                </div>
                <a href={job.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  style={{ background: theme.green, color: "#000", padding: "7px 14px", borderRadius: 5, fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0, fontFamily: theme.font }}>
                  Apply →
                </a>
              </div>

              {isOpen && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${ls.border}` }}>
                  {job.key_skills && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                      {job.key_skills.split(",").map((s, si) => {
                        const isMatch = config.skills.some(m => s.trim().toLowerCase().includes(m.toLowerCase()));
                        return <span key={si} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, fontFamily: theme.mono, background: isMatch ? theme.greenDark : theme.surface2, color: isMatch ? theme.greenLight : theme.text3 }}>{s.trim()}</span>;
                      })}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: theme.text3 }}>
                    {job.experience && <span>Exp: <b style={{ color: theme.text2 }}>{job.experience}</b></span>}
                    {job.work_type && <span>Type: <b style={{ color: theme.text2 }}>{job.work_type}</b></span>}
                    {job.source && <span>Source: <b style={{ color: theme.text2 }}>{job.source}</b></span>}
                    {job.hiring_manager && <span>HM: <b style={{ color: theme.purpleLight }}>{job.hiring_manager}</b></span>}
                    {job.hm_email && <span>Email: <a href={`mailto:${job.hm_email}`} style={{ color: theme.blueLight }} onClick={e => e.stopPropagation()}>{job.hm_email}</a></span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: 60, color: theme.text4 }}>
            <p style={{ fontSize: 32, margin: "0 0 8px" }}>∅</p>
            <p style={{ fontSize: 13 }}>No jobs match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tiny components ───
const btnStyle = { borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: "nowrap" };

function Label({ text, sub }) {
  return (
    <div style={{ marginBottom: 4, marginTop: 14 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#fafafa", fontFamily: "'IBM Plex Sans', sans-serif" }}>{text}</label>
      {sub && <p style={{ fontSize: 11, color: "#52525b", margin: "2px 0 0", fontFamily: "'IBM Plex Mono', monospace" }}>{sub}</p>}
    </div>
  );
}

function Input({ value, onChange, ...props }) {
  return <input value={value} onChange={e => onChange(e.target.value)} {...props}
    style={{ width: "100%", background: "#18181b", border: "1px solid #27272a", borderRadius: 6, padding: "8px 12px", color: "#fafafa", fontSize: 13, outline: "none", fontFamily: "'IBM Plex Sans', sans-serif", boxSizing: "border-box" }} />;
}

function TextArea({ value, onChange, rows = 2 }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
    style={{ width: "100%", background: "#18181b", border: "1px solid #27272a", borderRadius: 6, padding: "8px 12px", color: "#fafafa", fontSize: 13, outline: "none", fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box", resize: "vertical" }} />;
}
