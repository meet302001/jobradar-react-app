import { useState, useEffect, useMemo, useCallback } from "react";

const STORAGE_KEY = "jobRadar_apify_config_v2";
const DEFAULT_TITLES = [
  "DevOps",
  "SRE",
  "Site Reliability",
  "Platform Engineer",
  "Infrastructure Engineer",
  "Cloud Engineer",
  "MLOps",
  "LLMOps",
  "AI Infrastructure",
];
const DEFAULT_EXCLUSIONS = ["Senior Staff", "Principal", "Director", "VP", "Head of"];

const theme = {
  bg: "#080b12",
  panel: "#101727",
  panel2: "#161f34",
  soft: "#202c46",
  border: "#2b3857",
  text: "#e8edf9",
  muted: "#98a4c0",
  muted2: "#6d7894",
  blue: "#5b8cff",
  blue2: "#7aa2ff",
  green: "#37d399",
  yellow: "#f6c453",
  red: "#f87171",
};

function splitList(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

function levelFromCount(count) {
  if (count >= 6) return "HIGH";
  if (count >= 3) return "MEDIUM";
  return "LOW";
}

function skillMatch(jobSkills, mySkills) {
  if (!jobSkills.length || !mySkills.length) return { count: 0, matched: [], level: "LOW" };
  const normalizedMine = mySkills.map((s) => s.toLowerCase());
  const matched = jobSkills.filter((skill) =>
    normalizedMine.some((mine) => skill.toLowerCase().includes(mine))
  );
  const unique = [...new Set(matched)];
  return { count: unique.length, matched: unique, level: levelFromCount(unique.length) };
}

function asArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((v) => String(v).trim()).filter(Boolean);
  return String(input)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeJob(item) {
  const skills = asArray(item.ai_key_skills || item.key_skills || item.skills);
  const locationRaw = pick(item.locations_derived, item.location, item.locations);
  const location = Array.isArray(locationRaw) ? locationRaw.join(", ") : String(locationRaw || "");
  const workType = String(pick(item.ai_work_arrangement, item.work_type, item.employmentType));
  const visaRaw = String(pick(item.ai_visa_sponsorship, item.visa_sponsorship, "")).toLowerCase();
  const visa = visaRaw === "true" || visaRaw === "yes";

  return {
    id: pick(item.id, item.url, `${item.title || "job"}-${item.organization || "company"}`),
    title: String(pick(item.title, item.position, "Untitled Role")),
    organization: String(pick(item.organization, item.company_name, item.company, "Unknown Company")),
    url: String(pick(item.url, item.apply_url, item.job_url, "#")),
    location,
    datePosted: String(pick(item.date_posted, item.posted_at, item.createdAt, "")),
    experience: String(pick(item.ai_experience_level, item.experience_level, item.experience, "")),
    workType,
    salaryMin: Number(pick(item.ai_salary_minvalue, item.salary_min, 0)) || 0,
    salaryMax: Number(pick(item.ai_salary_maxvalue, item.salary_max, 0)) || 0,
    salaryCurrency: String(pick(item.ai_salary_currency, item.currency, "USD")),
    visa,
    skills,
    source: String(pick(item.source, item.platform, "")),
    hiringManager: String(pick(item.ai_hiring_manager_name, item.hiring_manager, "")),
    hiringEmail: String(pick(item.ai_hiring_manager_email_address, item.hm_email, "")),
    description: String(pick(item.description_text, item.description, "")),
  };
}

function tierFor(company, tier1, tier2) {
  const org = String(company || "").toLowerCase();
  if (tier1.some((v) => org.includes(v.toLowerCase()))) return "Tier 1";
  if (tier2.some((v) => org.includes(v.toLowerCase()))) return "Tier 2";
  return "Other";
}

function formatCurrency(min, max, currency = "USD") {
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  if (min && max) return `${fmt.format(min)} - ${fmt.format(max)}`;
  if (max) return `Up to ${fmt.format(max)}`;
  if (min) return `${fmt.format(min)}+`;
  return "";
}

function statCardStyle(color) {
  return {
    background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
    border: `1px solid ${theme.border}`,
    borderTop: `2px solid ${color}`,
    borderRadius: 12,
    padding: "12px 14px",
    minWidth: 120,
  };
}

export default function App() {
  const [view, setView] = useState("loading");
  const [config, setConfig] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState("ALL");
  const [filterRemote, setFilterRemote] = useState(false);
  const [filterVisa, setFilterVisa] = useState(false);
  const [sortBy, setSortBy] = useState("match");

  const [formToken, setFormToken] = useState("");
  const [formTitles, setFormTitles] = useState(DEFAULT_TITLES.join(", "));
  const [formLocations, setFormLocations] = useState("United States");
  const [formSkills, setFormSkills] = useState(
    "AWS, Kubernetes, Terraform, Docker, Python, Bash, Prometheus, Grafana, CI/CD, Linux"
  );
  const [formTier1, setFormTier1] = useState(
    "Anthropic, OpenAI, Databricks, CoreWeave, Together AI, HuggingFace, NVIDIA"
  );
  const [formTier2, setFormTier2] = useState(
    "Cloudflare, Datadog, Stripe, Microsoft, Google, Meta, Apple, Netflix"
  );
  const [formLimit, setFormLimit] = useState("80");

  useEffect(() => {
    const saved = loadConfig();
    if (!saved || !saved.token) {
      setView("setup");
      return;
    }
    setConfig(saved);
    setFormToken(saved.token || "");
    setFormTitles((saved.titles || DEFAULT_TITLES).join(", "));
    setFormLocations((saved.locations || ["United States"]).join(", "));
    setFormSkills((saved.skills || []).join(", "));
    setFormTier1((saved.tier1 || []).join(", "));
    setFormTier2((saved.tier2 || []).join(", "));
    setFormLimit(String(saved.limit || 80));
    setView("dashboard");
  }, []);

  const runSearch = useCallback(
    async (cfg = config) => {
      if (!cfg?.token) {
        setError("Apify token is required.");
        return;
      }

      setSyncing(true);
      setError("");
      try {
        const endpoint =
          "https://api.apify.com/v2/acts/fantastic-jobs~career-site-job-listing-api/run-sync-get-dataset-items";
        const url = `${endpoint}?token=${encodeURIComponent(cfg.token)}&clean=true&format=json`;
        const payload = {
          timeRange: "24h",
          limit: Number(cfg.limit) || 80,
          includeAi: true,
          removeAgency: true,
          titleSearch: cfg.titles?.length ? cfg.titles : DEFAULT_TITLES,
          titleExclusionSearch: DEFAULT_EXCLUSIONS,
          locationSearch: cfg.locations?.length ? cfg.locations : ["United States"],
          aiEmploymentTypeFilter: ["FULL_TIME"],
          descriptionType: "text",
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const raw = await res.text();
          throw new Error(`Apify request failed (${res.status}): ${raw.slice(0, 180)}`);
        }

        const rows = await res.json();
        if (!Array.isArray(rows)) throw new Error("Unexpected Apify response format.");

        const normalizedSkills = cfg.skills || [];
        const tier1 = cfg.tier1 || [];
        const tier2 = cfg.tier2 || [];
        const prepared = rows.map((item) => {
          const job = normalizeJob(item);
          const match = skillMatch(job.skills, normalizedSkills);
          const tier = tierFor(job.organization, tier1, tier2);
          return { ...job, match, tier };
        });

        setJobs(prepared);
        setSelectedId((current) => current || (prepared[0]?.id ?? ""));
        setLastSync(new Date());
        if (prepared.length === 0) {
          setError("No jobs found from Apify for your current title/location filters.");
        }
      } catch (e) {
        setError(e.message || "Failed to fetch jobs.");
      } finally {
        setSyncing(false);
      }
    },
    [config]
  );

  useEffect(() => {
    if (view === "dashboard" && config?.token) runSearch(config);
  }, [view, config, runSearch]);

  const applySettings = (event) => {
    event.preventDefault();
    const cfg = {
      token: formToken.trim(),
      titles: splitList(formTitles),
      locations: splitList(formLocations),
      skills: splitList(formSkills),
      tier1: splitList(formTier1),
      tier2: splitList(formTier2),
      limit: Number(formLimit) || 80,
    };
    if (!cfg.token) {
      setError("Please add your Apify token.");
      return;
    }
    saveConfig(cfg);
    setConfig(cfg);
    setView("dashboard");
    setShowSettings(false);
  };

  const filtered = useMemo(() => {
    let result = [...jobs];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((job) =>
        [job.title, job.organization, job.location, job.skills.join(", ")]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (filterLevel !== "ALL") result = result.filter((job) => job.match.level === filterLevel);
    if (filterRemote) result = result.filter((job) => job.workType.toLowerCase().includes("remote"));
    if (filterVisa) result = result.filter((job) => job.visa);

    if (sortBy === "match") result.sort((a, b) => b.match.count - a.match.count);
    if (sortBy === "salary") result.sort((a, b) => b.salaryMax - a.salaryMax);
    if (sortBy === "newest") result.sort((a, b) => (b.datePosted || "").localeCompare(a.datePosted || ""));
    if (sortBy === "company") result.sort((a, b) => a.organization.localeCompare(b.organization));

    return result;
  }, [jobs, search, filterLevel, filterRemote, filterVisa, sortBy]);

  const selected = useMemo(
    () => filtered.find((job) => job.id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  const stats = useMemo(() => {
    const high = jobs.filter((j) => j.match.level === "HIGH").length;
    const remote = jobs.filter((j) => j.workType.toLowerCase().includes("remote")).length;
    const visa = jobs.filter((j) => j.visa).length;
    const tier1 = jobs.filter((j) => j.tier === "Tier 1").length;
    return { total: jobs.length, high, remote, visa, tier1 };
  }, [jobs]);

  if (view === "setup" || view === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(1200px 900px at 5% -10%, #1c2b4f 0%, #090d17 55%, #070b13 100%)",
          padding: 24,
          color: theme.text,
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        }}
      >
        <form
          onSubmit={applySettings}
          style={{
            width: "min(920px, 100%)",
            border: `1px solid ${theme.border}`,
            background: "rgba(16, 23, 39, 0.92)",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 12px 60px rgba(0, 0, 0, 0.35)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.02em" }}>JobRadar</h1>
          <p style={{ margin: "8px 0 18px", color: theme.muted }}>
            Fetch live jobs directly from Apify and review ranked matches in one dashboard.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <Field label="Apify API Token *" sub="Used to run the actor and fetch results">
              <Input value={formToken} onChange={setFormToken} placeholder="apify_api_..." type="password" required />
            </Field>
            <Field label="Result Limit" sub="How many jobs to fetch each run">
              <Input value={formLimit} onChange={setFormLimit} placeholder="80" />
            </Field>
            <Field label="Target Job Titles" sub="Comma separated">
              <TextArea value={formTitles} onChange={setFormTitles} rows={3} />
            </Field>
            <Field label="Locations" sub="Comma separated">
              <TextArea value={formLocations} onChange={setFormLocations} rows={3} />
            </Field>
            <Field label="Your Skills" sub="Used for match scoring">
              <TextArea value={formSkills} onChange={setFormSkills} rows={3} />
            </Field>
            <Field label="Tier 1 Companies" sub="Dream companies">
              <TextArea value={formTier1} onChange={setFormTier1} rows={3} />
            </Field>
            <Field label="Tier 2 Companies" sub="Target companies">
              <TextArea value={formTier2} onChange={setFormTier2} rows={3} />
            </Field>
          </div>

          {error && <Alert text={error} />}

          <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="submit" style={primaryBtn}>
              Save & Launch Dashboard
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #080b12 0%, #0c1220 100%)",
        color: theme.text,
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      <header style={{ borderBottom: `1px solid ${theme.border}`, background: "rgba(10, 15, 27, 0.9)" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em" }}>JobRadar</div>
            <div style={{ color: theme.muted2, fontSize: 12 }}>
              Direct Apify mode {lastSync ? `• synced ${lastSync.toLocaleTimeString()}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={ghostBtn} onClick={() => runSearch(config)} disabled={syncing}>
              {syncing ? "Refreshing..." : "Refresh Jobs"}
            </button>
            <button style={ghostBtn} onClick={() => setShowSettings((v) => !v)}>
              {showSettings ? "Close Settings" : "Settings"}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: 18 }}>
        {showSettings && (
          <form
            onSubmit={applySettings}
            style={{
              marginBottom: 14,
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <Field label="Apify Token">
                <Input value={formToken} onChange={setFormToken} type="password" />
              </Field>
              <Field label="Limit">
                <Input value={formLimit} onChange={setFormLimit} />
              </Field>
              <Field label="Titles">
                <TextArea value={formTitles} onChange={setFormTitles} rows={2} />
              </Field>
              <Field label="Locations">
                <TextArea value={formLocations} onChange={setFormLocations} rows={2} />
              </Field>
              <Field label="Skills">
                <TextArea value={formSkills} onChange={setFormSkills} rows={2} />
              </Field>
              <Field label="Tier 1 / Tier 2">
                <TextArea
                  value={`${formTier1}\n${formTier2}`}
                  onChange={(v) => {
                    const [a = "", b = ""] = v.split("\n");
                    setFormTier1(a);
                    setFormTier2(b);
                  }}
                  rows={2}
                />
              </Field>
            </div>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="submit" style={primaryBtn}>
                Save Settings
              </button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={statCardStyle(theme.blue)}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div>
            <div style={{ color: theme.muted, fontSize: 12 }}>Total Jobs</div>
          </div>
          <div style={statCardStyle(theme.green)}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.high}</div>
            <div style={{ color: theme.muted, fontSize: 12 }}>High Match</div>
          </div>
          <div style={statCardStyle(theme.yellow)}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.tier1}</div>
            <div style={{ color: theme.muted, fontSize: 12 }}>Tier 1</div>
          </div>
          <div style={statCardStyle("#60a5fa")}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.remote}</div>
            <div style={{ color: theme.muted, fontSize: 12 }}>Remote</div>
          </div>
          <div style={statCardStyle("#c084fc")}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.visa}</div>
            <div style={{ color: theme.muted, fontSize: 12 }}>Visa</div>
          </div>
        </div>

        {error && <Alert text={error} />}

        <div
          style={{
            border: `1px solid ${theme.border}`,
            background: theme.panel,
            borderRadius: 12,
            padding: 10,
            marginBottom: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Input
            value={search}
            onChange={setSearch}
            placeholder="Search role, company, location, skills..."
            style={{ minWidth: 260, flex: 1 }}
          />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            <option value="match">Sort: Match</option>
            <option value="salary">Sort: Salary</option>
            <option value="newest">Sort: Newest</option>
            <option value="company">Sort: Company</option>
          </select>
          {["ALL", "HIGH", "MEDIUM", "LOW"].map((lv) => (
            <button
              key={lv}
              style={{
                ...chipBtn,
                background: filterLevel === lv ? "rgba(91, 140, 255, 0.2)" : "transparent",
                color: filterLevel === lv ? theme.blue2 : theme.muted,
                borderColor: filterLevel === lv ? "#456fcb" : theme.border,
              }}
              onClick={() => setFilterLevel(lv)}
            >
              {lv}
            </button>
          ))}
          <button
            style={{
              ...chipBtn,
              background: filterRemote ? "rgba(55, 211, 153, 0.16)" : "transparent",
              color: filterRemote ? theme.green : theme.muted,
              borderColor: filterRemote ? "#2d9c73" : theme.border,
            }}
            onClick={() => setFilterRemote((v) => !v)}
          >
            Remote
          </button>
          <button
            style={{
              ...chipBtn,
              background: filterVisa ? "rgba(192, 132, 252, 0.16)" : "transparent",
              color: filterVisa ? "#d2a8ff" : theme.muted,
              borderColor: filterVisa ? "#875cb3" : theme.border,
            }}
            onClick={() => setFilterVisa((v) => !v)}
          >
            Visa
          </button>
          <span style={{ fontSize: 12, color: theme.muted2 }}>{filtered.length} results</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10 }}>
          <section
            style={{
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              borderRadius: 12,
              minHeight: 560,
              overflow: "auto",
            }}
          >
            {filtered.map((job) => {
              const active = selected?.id === job.id;
              const salary = formatCurrency(job.salaryMin, job.salaryMax, job.salaryCurrency);
              const levelColor =
                job.match.level === "HIGH" ? theme.green : job.match.level === "MEDIUM" ? theme.yellow : theme.muted2;

              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedId(job.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: 14,
                    border: "none",
                    borderBottom: `1px solid ${theme.soft}`,
                    background: active ? "rgba(91, 140, 255, 0.1)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{job.title}</div>
                      <div style={{ marginTop: 3, color: theme.muted, fontSize: 12 }}>
                        {job.organization} {job.location ? `• ${job.location}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: theme.muted2 }}>{job.datePosted?.split("T")[0] || ""}</div>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Tag text={`${job.match.level} ${job.match.count}`} color={levelColor} />
                    <Tag text={job.tier} color={job.tier === "Tier 1" ? "#7aa2ff" : job.tier === "Tier 2" ? "#8ad0ff" : "#7c89a8"} />
                    {job.workType && <Tag text={job.workType} color="#86efac" />}
                    {job.visa && <Tag text="Visa" color="#d2a8ff" />}
                    {salary && <Tag text={salary} color="#f9d976" />}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 30, textAlign: "center", color: theme.muted2 }}>No jobs match your filters.</div>
            )}
          </section>

          <aside
            style={{
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              borderRadius: 12,
              minHeight: 560,
              padding: 16,
            }}
          >
            {!selected ? (
              <div style={{ color: theme.muted2 }}>Select a job to see details.</div>
            ) : (
              <>
                <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.01em" }}>{selected.title}</h2>
                <div style={{ marginTop: 6, color: theme.muted }}>{selected.organization}</div>
                <div style={{ marginTop: 8, color: theme.muted2, fontSize: 13 }}>
                  {selected.location || "Location not specified"}
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tag text={`Match ${selected.match.count}`} color={theme.green} />
                  <Tag text={selected.tier} color={theme.blue2} />
                  {selected.workType && <Tag text={selected.workType} color="#9ae6b4" />}
                  {selected.visa && <Tag text="Visa Support" color="#d2a8ff" />}
                </div>

                <div
                  style={{
                    marginTop: 16,
                    border: `1px solid ${theme.soft}`,
                    borderRadius: 10,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <Detail label="Salary" value={formatCurrency(selected.salaryMin, selected.salaryMax, selected.salaryCurrency) || "Not listed"} />
                  <Detail label="Experience" value={selected.experience || "Not listed"} />
                  <Detail label="Source" value={selected.source || "Not listed"} />
                  <Detail label="Hiring Manager" value={selected.hiringManager || "Not available"} />
                  <Detail label="Email" value={selected.hiringEmail || "Not available"} />
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>Matched Skills</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selected.match.matched.length ? (
                      selected.match.matched.map((skill) => <Tag key={skill} text={skill} color={theme.green} />)
                    ) : (
                      <span style={{ color: theme.muted2, fontSize: 12 }}>No direct skill matches found.</span>
                    )}
                  </div>
                </div>

                {selected.description && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: theme.muted, fontSize: 12, marginBottom: 6 }}>Description Snippet</div>
                    <div
                      style={{
                        color: theme.text,
                        fontSize: 13,
                        lineHeight: 1.5,
                        maxHeight: 190,
                        overflow: "auto",
                        border: `1px solid ${theme.soft}`,
                        borderRadius: 8,
                        padding: 10,
                        background: "rgba(255,255,255,0.01)",
                      }}
                    >
                      {selected.description.slice(0, 1200)}
                    </div>
                  </div>
                )}

                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...primaryBtn,
                    marginTop: 16,
                    display: "inline-block",
                    textDecoration: "none",
                  }}
                >
                  Open Application
                </a>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

const primaryBtn = {
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(180deg, #6ea0ff 0%, #5b8cff 100%)",
  color: "#0c1427",
  padding: "10px 14px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const ghostBtn = {
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: "transparent",
  color: theme.text,
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const chipBtn = {
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  padding: "7px 9px",
  fontSize: 12,
  cursor: "pointer",
  background: "transparent",
};

const selectStyle = {
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.panel2,
  color: theme.text,
  padding: "8px 10px",
  fontSize: 12,
};

function Field({ label, sub, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ marginBottom: 6, color: theme.text, fontSize: 13, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ marginBottom: 6, color: theme.muted2, fontSize: 11 }}>{sub}</div>}
      {children}
    </label>
  );
}

function Input({ value, onChange, style, ...props }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.panel2,
        color: theme.text,
        padding: "9px 11px",
        fontSize: 13,
        outline: "none",
        ...style,
      }}
    />
  );
}

function TextArea({ value, onChange, rows = 2, style, ...props }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.panel2,
        color: theme.text,
        padding: "9px 11px",
        fontSize: 13,
        outline: "none",
        resize: "vertical",
        ...style,
      }}
    />
  );
}

function Alert({ text }) {
  return (
    <div
      style={{
        marginTop: 10,
        border: `1px solid rgba(248, 113, 113, 0.5)`,
        background: "rgba(127, 29, 29, 0.18)",
        color: theme.red,
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12,
      }}
    >
      {text}
    </div>
  );
}

function Tag({ text, color }) {
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "3px 8px",
        border: `1px solid ${color}55`,
        background: `${color}16`,
        color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  );
}

function Detail({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, marginBottom: 7 }}>
      <span style={{ color: theme.muted }}>{label}</span>
      <span style={{ color: theme.text, textAlign: "right" }}>{value}</span>
    </div>
  );
}
