# ⚡ JobRadar

**Open-source automated job search dashboard powered by Apify + Google Sheets.**

Scrape jobs from 54+ ATS platforms daily, filter by your skills, and track everything in a clean dashboard — all for under $10/month.

![JobRadar Dashboard](https://img.shields.io/badge/status-active-22c55e) ![License](https://img.shields.io/badge/license-MIT-blue) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

## What it does

- 🔍 **Scrapes jobs daily** from Greenhouse, Lever, Workday, Ashby, and 50+ other ATS platforms
- 🎯 **Skill matching** — scores every job against YOUR skills (AWS, K8s, Terraform, etc.)
- 🏢 **Company tiers** — flag dream companies (Tier 1) vs good companies (Tier 2)
- 🛂 **Visa sponsorship detection** — AI-extracted from job descriptions
- 📧 **Hiring manager contacts** — names and emails when available
- 📊 **Google Sheets backend** — no database needed, data lands in your spreadsheet
- 🚀 **One-click scrape** — trigger Apify from the dashboard
- 🔒 **Bring your own token** — nothing stored on any server, everything in localStorage

## Architecture

```
Apify Schedule (daily cron)
    │
    ├─ fantastic-jobs/career-site-job-listing-api
    │   └─ Scrapes 54+ ATS platforms
    │
    └─ Webhook triggers lukaskrivka/google-sheets
        └─ Pushes results to your Google Sheet
            │
            └─ JobRadar frontend reads from Sheet
                └─ Filters, scores, displays in browser
```

## Quick Start

### 1. Set up the Apify pipeline (~15 min)

**a) Create a job scraper task:**
- Go to [fantastic-jobs/career-site-job-listing-api](https://apify.com/fantastic-jobs/career-site-job-listing-api)
- Click "Try for free" → "Create new task"
- Use this input config:

```json
{
  "timeRange": "24h",
  "limit": 50,
  "includeAi": true,
  "titleSearch": ["DevOps", "SRE", "Platform Engineer", "Cloud Engineer"],
  "locationSearch": ["United States"],
  "aiExperienceLevelFilter": ["2-5"],
  "aiEmploymentTypeFilter": ["FULL_TIME"],
  "removeAgency": true,
  "descriptionType": "text"
}
```

**b) Create a Google Sheets export task:**
- Go to [lukaskrivka/google-sheets](https://apify.com/lukaskrivka/google-sheets)
- Authorize your Google account
- Create a "DailyJobs" tab in your target spreadsheet

**c) Chain them with a webhook:**
- On your scraper task → Integrations → Add webhook
- Event: `ACTOR.RUN.SUCCEEDED`
- URL: `https://api.apify.com/v2/acts/lukaskrivka~google-sheets/runs?token=YOUR_TOKEN`
- Payload:
```json
{
  "datasetId": "{{resource.defaultDatasetId}}",
  "mode": "replace",
  "sheetId.eFPUdxsL7X2cdSvE2": "YOUR_OAUTH_ID",
  "oAuthAccount.eFPUdxsL7X2cdSvE2": "YOUR_GOOGLE_ACCOUNT_ID",
  "spreadsheetId": "YOUR_SHEET_ID",
  "transformFunction": "({ spreadsheetData, datasetData }) => datasetData.map(item => ({ title: item.title, organization: item.organization, url: item.url, location: Array.isArray(item.locations_derived) ? item.locations_derived.join(', ') : item.locations_derived, date_posted: item.date_posted, experience: item.ai_experience_level, work_type: item.ai_work_arrangement, salary_min: item.ai_salary_minvalue, salary_max: item.ai_salary_maxvalue, currency: item.ai_salary_currency, key_skills: Array.isArray(item.ai_key_skills) ? item.ai_key_skills.join(', ') : item.ai_key_skills, visa_sponsorship: item.ai_visa_sponsorship, hiring_manager: item.ai_hiring_manager_name, hm_email: item.ai_hiring_manager_email_address, source: item.source }))"
}
```

**d) Schedule it:**
- Apify Console → Schedules → `0 13 * * 1-5` (9 AM EST, Mon-Fri)

### 2. Share your Google Sheet

Set sharing to "Anyone with the link → Viewer" so the frontend can read it.

### 3. Deploy the frontend

**Option A: Vercel (recommended)**
```bash
npx create-react-app jobRadar
# Replace src/App.jsx with JobRadar-OpenSource.jsx
npm run build
npx vercel
```

**Option B: Use as a Claude Artifact**
Paste the JSX directly into Claude and it renders as an interactive artifact.

### 4. Configure

On first load, JobRadar asks for:
- **Google Sheet URL** — paste your sheet link
- **Apify Token** (optional) — enables "Scrape Now" button
- **Your skills** — comma-separated, used for job scoring
- **Company tiers** — your dream companies and good companies

Everything is stored in `localStorage`. Nothing leaves your browser.

## Customization

### Change job titles
Edit the `titleSearch` array in your Apify task input.

### Change experience level
Options: `"0-2"`, `"2-5"`, `"5-10"`, `"10+"`

### Change location
Replace `["United States"]` with any country or city.

### Add more ATS sources
The `fantastic-jobs/career-site-job-listing-api` covers 54 platforms. You can also add `automation-lab/multi-ats-jobs-scraper` for direct company career page scraping.

## Cost

| Component | Monthly |
|-----------|---------|
| Apify job scraper (~30 jobs/day) | ~$3.60 |
| Google Sheets Actor | Free |
| Apify platform compute | ~$1.50 |
| Frontend hosting (Vercel) | Free |
| **Total** | **~$5-8/mo** |

## Tech Stack

- **Scraping:** [Apify](https://apify.com) + [fantastic-jobs API](https://apify.com/fantastic-jobs/career-site-job-listing-api)
- **Storage:** Google Sheets (read via public CSV export)
- **Frontend:** React (single component, zero dependencies beyond React)
- **Hosting:** Vercel / Netlify / any static host

## Contributing

PRs welcome! Some ideas:
- [ ] Dark/light theme toggle
- [ ] Export filtered results to CSV
- [ ] Slack/Discord notification integration
- [ ] Resume keyword extraction for auto-skill detection
- [ ] Job application tracker (applied/interviewing/rejected columns)
- [ ] Multi-sheet support (different searches per tab)

## License

MIT

---

Built by [Meet Bhanushali](https://linkedin.com/in/meetbhanushali) with help from Claude.
