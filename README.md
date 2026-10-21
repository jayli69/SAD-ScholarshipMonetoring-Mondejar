# Scholarship Monitoring System

A browser-based SAD Laboratory Examination Section B project using **HTML, CSS, JavaScript, Supabase, and GitHub**.

## Features in this starter
- Scholar account registration and login through Supabase Auth
- Database-backed profiles and scholarship policy records
- Excellence Scholar and Access Scholar policy thresholds
- Semester submission form with numeric validation
- Duplicate semester prevention through a database unique constraint
- Staff scholarship assignment, verification, compliance evaluation, and renewal decisions
- RLS policies that restrict scholars to their own records
- Audit history and a dashboard
- Responsive layout with separate HTML, CSS, and JavaScript files

## 1. Create the Supabase project
1. Create a project at https://supabase.com/.
2. Open **SQL Editor** in the Supabase dashboard.
3. Paste and run `supabase/schema.sql`.
4. Open **Project Settings / API** (or the project's API keys page) and copy the Project URL and publishable/anon key.
5. Paste them into `js/config.js`. The browser may contain the publishable/anon key; **never expose a `service_role` key**.
6. In Authentication settings, choose whether email confirmation is required. If confirmation is enabled, users must confirm their email before logging in.

## 2. Create a staff account
1. Open the app and use **Create account** to register an account for the staff member.
2. In Supabase SQL Editor, promote that account by email:
   ```sql
   update public.profiles set role = 'staff'
   where email = 'staff@example.com';
   ```
3. Sign out and sign in again so the app reloads the profile role.
4. Register scholar accounts through the Create account tab. Accounts created there are always `scholar`.
5. In **Scholar management**, assign each registered scholar to Excellence Scholar or Access Scholar.

Do not allow users to self-assign staff or admin roles. The database trigger deliberately ignores any role sent from the browser.

## 3. Run locally
Because the app uses a JavaScript module-free setup and a CDN, it can be tested with VS Code Live Server:
1. Extract this project folder.
2. Open the folder in VS Code.
3. Set up `js/config.js`.
4. Install the VS Code **Live Server** extension if needed.
5. Right-click `index.html` and choose **Open with Live Server**.

You can also use any local static HTTP server. Directly opening the HTML file may work, but a local server is recommended.

## 4. Publish using GitHub
1. Create a GitHub repository, for example `scholarship-monitoring-system`.
2. Upload/push all project files, excluding private credentials.
3. In GitHub, open **Settings → Pages**.
4. Select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
5. Wait for GitHub Pages to publish and open the URL it provides.
6. Ensure the Supabase URL and anon/publishable key in `js/config.js` are correct.

GitHub Pages hosts only the static front end. Supabase remains the authentication and database backend. A custom domain is optional.

## Fictional examination policy
| Rule | Excellence Scholar | Access Scholar |
|---|---:|---:|
| Maximum GWA | 2.00 | 2.50 |
| Minimum enrolled units | 18 | 15 |
| Allowed failed subjects | 0 | 0 |
| Allowed incomplete grades | 0 | 0 |
| Allowed dropped subjects | 0 | 1 |
| Deadline | Nov 6, 2026, 5:00 PM Asia/Manila | Same |

GWA is valid from 1.00 to 5.00 inclusive; lower is better. Counts and units must be nonnegative integers. Compliance is evaluated only after evidence is verified. A deficiency does not automatically disqualify a scholar; staff must explicitly record a renewal decision.

## Important implementation notes / known limitations
- The UI is a course-project starter, not a production scholarship platform.
- Staff can verify/evaluate/record renewal through the interface. The SQL policy provides database-level row access isolation, but staff field-transition permissions should be moved to validated database functions or Supabase Edge Functions before production.
- This version lets scholars create an account and submit a new semester record. The returned-record correction form is not yet wired into the UI; the SQL policy supports the intended corrected-and-resubmitted transition, but the interface needs a dedicated edit flow to complete TC09.
- The deadline is set to the exam's fixed 2026 date. For later academic years, make deadline selection configurable per policy/academic year.
- The initial dashboard focuses on AY 2026–2027 Semester 1; add dynamic semester selection/search refinements if time allows.
- Email confirmation, password reset, and production account-administration flows are not customized.
- No live Registrar API, SMS, machine learning, payment module, or full appeals workflow is included, matching the stated scope.

## Suggested demo checklist
1. Create one staff account and at least two scholar accounts.
2. Assign different programs.
3. Submit records for both accounts.
4. Log in as staff and verify/return a record.
5. Evaluate a verified record and inspect deficiency reasons.
6. Approve a compliant submission and hold a deficient one.
7. Log in as a scholar and confirm another scholar's records are not visible.
8. Refresh and verify that records persist.
9. Run the tests in `docs/analysis-report.md` and save screenshots of the actual results.

## Folder structure
```text
Scholarship_Monitoring_System/
├── index.html
├── css/style.css
├── js/config.js
├── js/app.js
├── supabase/schema.sql
├── docs/analysis-report.md
├── README.md
└── .gitignore
```
