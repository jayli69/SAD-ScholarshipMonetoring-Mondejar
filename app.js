(() => {
  "use strict";
  const cfg = window.SUPABASE_CONFIG || {};
  const configured = cfg.url && cfg.anonKey && !cfg.url.includes("YOUR-PROJECT") && !cfg.anonKey.includes("YOUR_SUPABASE");
  const $ = (id) => document.getElementById(id);
  const state = { client: null, user: null, profile: null, assignments: [], programs: [], submissions: [], activeReview: null };
  const sections = ["dashboard", "submissions", "management", "review", "history"];

  function message(id, text, kind = "") {
    const el = $(id); if (!el) return;
    el.textContent = text; el.className = `message ${kind}`.trim();
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
  }
  function badge(value) {
    const v = String(value || "Not evaluated");
    let cls = "";
    if (["Verified","Compliant","Approved"].includes(v)) cls = "green";
    else if (["Pending","Not evaluated","Held"].includes(v)) cls = "amber";
    else if (["Returned","With Deficiency"].includes(v)) cls = "red";
    return `<span class="badge ${cls}">${escapeHtml(v)}</span>`;
  }
  function showAuth() {
    $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); $("logoutBtn").classList.add("hidden");
  }
  function showApp() {
    $("authView").classList.add("hidden"); $("appView").classList.remove("hidden"); $("logoutBtn").classList.remove("hidden");
    const staff = state.profile?.role === "staff" || state.profile?.role === "admin";
    document.querySelectorAll(".staff-only").forEach(el => el.classList.toggle("hidden", !staff));
    document.querySelectorAll(".scholar-only").forEach(el => el.classList.toggle("hidden", staff));
    $("userName").textContent = state.profile?.full_name || state.user?.email || "User";
    $("userEmail").textContent = state.user?.email || "";
    $("userInitials").textContent = (state.profile?.full_name || state.user?.email || "U").trim().slice(0,1).toUpperCase();
    $("roleLabel").textContent = staff ? "STAFF WORKSPACE" : "SCHOLAR WORKSPACE";
    $("welcomeTitle").textContent = `Hello, ${(state.profile?.full_name || "there").split(" ")[0]}`;
    $("welcomeSubtitle").textContent = staff ? "Manage submissions, verify evidence, and record renewal decisions." : "Keep your semester records and scholarship status up to date.";
  }
  function go(view) {
    sections.forEach(name => $(`${name}Section`).classList.toggle("hidden", name !== view));
    document.querySelectorAll(".nav-tab").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    if (view === "dashboard") loadDashboard();
    if (view === "submissions") loadSubmissions();
    if (view === "management") loadManagement();
    if (view === "review") loadReview();
    if (view === "history") loadHistory();
  }
  function isStaff() { return ["staff","admin"].includes(state.profile?.role); }
  async function loadProfile() {
    const { data, error } = await state.client.from("profiles").select("*").eq("id", state.user.id).single();
    if (error) throw error;
    state.profile = data; showApp(); await loadBaseData(); go("dashboard");
  }
  
async function loadBaseData() {
  // 1. Load active scholarship programs
  const { data: programs, error: pErr } = await state.client
    .from("scholarship_programs")
    .select("*")
    .eq("active", true)
    .order("name");

  if (pErr) throw pErr;
  state.programs = programs || [];

  // 2. Load scholar assignments with their related profiles and programs
  const { data: assignments, error: aErr } = await state.client
    .from("scholar_assignments")
    .select(`
      id,
      scholar_id,
      program_id,
      created_at,
      profiles!scholar_assignments_scholar_id_fkey(
        id,
        full_name,
        student_id,
        email
      ),
      scholarship_programs(
        id,
        name,
        maximum_gwa,
        minimum_units,
        allowed_failed,
        allowed_incomplete,
        allowed_dropped
      )
    `)
    .order("created_at", { ascending: false });

  if (aErr) throw aErr;
  state.assignments = assignments || [];

  // 3. Load submissions without the invalid scholar_assignments relationship
  const { data: submissions, error: sErr } = await state.client
    .from("semester_submissions")
    .select(`
      *,
      profiles!semester_submissions_scholar_id_fkey(
        id,
        full_name,
        student_id,
        email
      )
    `)
    .order("submitted_at", { ascending: false });

  if (sErr) throw sErr;

  // 4. Match each submission with its scholar's assignment
  state.submissions = (submissions || []).map(sub => {
    const assignment = state.assignments.find(
      a => a.scholar_id === sub.scholar_id
    );

    return {
      ...sub,
      program_id: assignment?.program_id ?? sub.program_id ?? null,
      scholar_assignments: assignment
        ? {
            program_id: assignment.program_id,
            scholarship_programs: assignment.scholarship_programs
          }
        : null
    };
  });
  }
  function getMyAssignment() { return state.assignments.find(a => a.scholar_id === state.user.id); }
  function policyFor(sub) {
    return sub.scholar_assignments?.scholarship_programs || state.programs.find(p => p.id === sub.program_id) || null;
  }
  function evaluate(sub) {
    const p = policyFor(sub);
    if (!p) return { result: "With Deficiency", reasons: ["No active scholarship policy is assigned."], checks: [] };
    const late = new Date(sub.submitted_at).getTime() > new Date("2026-11-06T17:00:00+08:00").getTime();
    const checks = [
      ["GWA", Number(sub.gwa) <= Number(p.maximum_gwa), `GWA ${sub.gwa} (maximum ${p.maximum_gwa})`],
      ["Enrolled units", Number(sub.enrolled_units) >= Number(p.minimum_units), `${sub.enrolled_units} units (minimum ${p.minimum_units})`],
      ["Failed subjects", Number(sub.failed_count) <= Number(p.allowed_failed), `${sub.failed_count} (allowed ${p.allowed_failed})`],
      ["Incomplete grades", Number(sub.incomplete_count) <= Number(p.allowed_incomplete), `${sub.incomplete_count} (allowed ${p.allowed_incomplete})`],
      ["Dropped subjects", Number(sub.dropped_count) <= Number(p.allowed_dropped), `${sub.dropped_count} (allowed ${p.allowed_dropped})`],
      ["Deadline", !late, late ? "Submitted after Nov 6, 2026 at 5:00 PM" : "Submitted on time"]
    ];
    const reasons = checks.filter(c => !c[1]).map(c => `${c[0]}: ${c[2]}`);
    return { result: reasons.length ? "With Deficiency" : "Compliant", reasons, checks };
  }
  function renderStats() {
    const rows = state.submissions.filter(s => s.academic_year === "2026-2027" && s.semester === "1");
    const assigned = isStaff() ? state.assignments.length : (getMyAssignment() ? 1 : 0);
    const visible = isStaff() ? rows : rows.filter(s => s.scholar_id === state.user.id);
    const stats = [
      ["Assigned scholars", isStaff() ? assigned : "—", isStaff() ? "Current assignments" : "Staff-managed information"],
      ["Pending verification", visible.filter(s => s.verification_status === "Pending").length, "Awaiting evidence review"],
      ["Compliant", visible.filter(s => s.compliance_result === "Compliant").length, "All policy checks passed"],
      ["With deficiency", visible.filter(s => s.compliance_result === "With Deficiency").length, "Review reasons and next steps"]
    ];
    $("statsGrid").innerHTML = stats.map(([label,num,sub]) => `<article class="stat-card"><span>${label}</span><strong>${num}</strong><small>${sub}</small></article>`).join("");
  }
  function submissionsTable(rows, staff = false) {
    if (!rows.length) return `<div class="empty-state">No submissions to display yet.</div>`;
    return `<table><thead><tr><th>Academic period</th>${staff ? "<th>Scholar</th>" : ""}<th>GWA</th><th>Verification</th><th>Compliance</th><th>Renewal</th><th>Submitted</th>${staff ? "<th>Action</th>" : ""}</tr></thead><tbody>${rows.map(s => `<tr><td>${escapeHtml(s.academic_year)} · ${escapeHtml(s.semester)}</td>${staff ? `<td>${escapeHtml(s.profiles?.full_name || "Scholar")}<br><span class="muted">${escapeHtml(s.profiles?.student_id || "")}</span></td>` : ""}<td>${Number(s.gwa).toFixed(2)}</td><td>${badge(s.verification_status)}</td><td>${badge(s.compliance_result)}</td><td>${badge(s.renewal_decision || "Not decided")}</td><td>${escapeHtml(formatDate(s.submitted_at))}</td>${staff ? `<td><button class="mini-button" data-review="${s.id}" type="button">Review</button></td>` : ""}</tr>`).join("")}</tbody></table>`;
  }
  async function refreshData() { await loadBaseData(); }
  async function loadDashboard() {
    try {
      await refreshData(); renderStats();
      let rows = state.submissions.filter(s => s.academic_year === "2026-2027" && s.semester === "1");
      if (!isStaff()) rows = rows.filter(s => s.scholar_id === state.user.id);
      $("recentSubmissions").innerHTML = submissionsTable(rows.slice(0,5), isStaff());
    } catch (e) { message("appMessage", e.message, "error"); }
  }
  async function loadSubmissions() {
    try {
      await refreshData();
      const rows = isStaff() ? state.submissions : state.submissions.filter(s => s.scholar_id === state.user.id);
      $("mySubmissions").innerHTML = submissionsTable(rows, isStaff());
    } catch(e) { message("appMessage", e.message, "error"); }
  }
  async function loadManagement() {
    if (!isStaff()) return;
    try {
      await refreshData();
      const { data: scholars, error } = await state.client.from("profiles").select("id,full_name,student_id,email").eq("role","scholar").order("full_name");
      if (error) throw error;
      $("scholarSelect").innerHTML = `<option value="">Choose a scholar</option>` + (scholars || []).map(s => `<option value="${s.id}">${escapeHtml(s.full_name)} · ${escapeHtml(s.student_id || s.email || "")}</option>`).join("");
      $("programSelect").innerHTML = `<option value="">Choose a policy</option>` + state.programs.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
      $("assignmentsTable").innerHTML = state.assignments.length ? `<table><thead><tr><th>Scholar</th><th>Student ID</th><th>Program</th><th>Assigned</th></tr></thead><tbody>${state.assignments.map(a => `<tr><td>${escapeHtml(a.profiles?.full_name || "—")}</td><td>${escapeHtml(a.profiles?.student_id || "—")}</td><td>${escapeHtml(a.scholarship_programs?.name || "—")}</td><td>${escapeHtml(formatDate(a.created_at))}</td></tr>`).join("")}</tbody></table>` : `<div class="empty-state">No scholarship assignments yet.</div>`;
    } catch(e) { message("appMessage", e.message, "error"); }
  }
  async function loadReview() {
    if (!isStaff()) return;
    try {
      await refreshData();
      let rows = state.submissions;
      const vf = $("reviewStatusFilter").value, cf = $("reviewComplianceFilter").value;
      if (vf !== "all") rows = rows.filter(s => s.verification_status === vf);
      if (cf !== "all") rows = rows.filter(s => (s.compliance_result || "Not evaluated") === cf);
      $("reviewTable").innerHTML = submissionsTable(rows, true);
    } catch(e) { message("appMessage", e.message, "error"); }
  }
  async function loadHistory() {
    try {
      const { data, error } = await state.client.from("audit_logs").select("*,profiles!audit_logs_actor_id_fkey(full_name)").order("created_at", {ascending:false}).limit(100);
      if (error) throw error;
      $("historyTable").innerHTML = data?.length ? `<table><thead><tr><th>Time (Philippines)</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead><tbody>${data.map(log => `<tr><td>${escapeHtml(formatDate(log.created_at))}</td><td>${escapeHtml(log.profiles?.full_name || "System")}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(JSON.stringify(log.details || {}))}</td></tr>`).join("")}</tbody></table>` : `<div class="empty-state">No history records yet.</div>`;
    } catch(e) { message("appMessage", e.message, "error"); }
  }
  async function logAction(action, submissionId, details) {
    const { error } = await state.client.from("audit_logs").insert({ actor_id: state.user.id, submission_id: submissionId || null, action, details });
    if (error) throw error;
  }
  async function openReview(id) {
    const sub = state.submissions.find(s => s.id === id); if (!sub) return;
    state.activeReview = sub;
    $("reviewDialogTitle").textContent = "Review submission";
    $("reviewScholarDetails").textContent = `${sub.profiles?.full_name || "Scholar"} · ${sub.academic_year} · Semester ${sub.semester}`;
    const result = evaluate(sub);
    $("policyChecks").innerHTML = result.checks.map(c => `<div class="policy-check ${c[1] ? "pass" : "fail"}"><span>${escapeHtml(c[0])}<br><small>${escapeHtml(c[2])}</small></span><strong>${c[1] ? "PASS" : "FAIL"}</strong></div>`).join("") || `<p class="muted">Policy not found.</p>`;
    $("reviewReason").value = sub.verification_reason || "";
    const buttons = [];
    if (sub.verification_status !== "Verified") buttons.push(`<button class="button button-success" data-action="verify" type="button">Mark verified</button>`);
    buttons.push(`<button class="button button-danger" data-action="return" type="button">Return with reason</button>`);
    buttons.push(`<button class="button button-primary" data-action="evaluate" type="button">Evaluate compliance</button>`);
    if (sub.compliance_result === "Compliant") buttons.push(`<button class="button button-success" data-action="approve" type="button">Approve renewal</button>`);
    if (sub.compliance_result === "With Deficiency") buttons.push(`<button class="button button-light" data-action="hold" type="button">Hold renewal</button>`);
    $("reviewActions").innerHTML = buttons.join("");
    $("reviewDialog").showModal();
  }
  async function reviewAction(action) {
    const s = state.activeReview; if (!s) return;
    const note = $("reviewReason").value.trim();
    try {
      if (action === "verify") {
        const { error } = await state.client.from("semester_submissions").update({verification_status:"Verified", verification_reason:null, verified_by:state.user.id, verified_at:new Date().toISOString()}).eq("id",s.id);
        if(error) throw error; await logAction("VERIFIED",s.id,{note:"Evidence marked verified"});
      } else if (action === "return") {
        if (!note) { message("appMessage","Please enter a reason before returning evidence.","error"); return; }
        const { error } = await state.client.from("semester_submissions").update({verification_status:"Returned",verification_reason:note,verified_by:state.user.id,verified_at:new Date().toISOString(),compliance_result:null,deficiency_reasons:[],renewal_decision:null,decision_note:null}).eq("id",s.id);
        if(error) throw error; await logAction("RETURNED",s.id,{reason:note});
      } else if (action === "evaluate") {
        if (s.verification_status !== "Verified") throw new Error("Only verified submissions can be evaluated.");
        const result = evaluate(s);
        const { error } = await state.client.from("semester_submissions").update({compliance_result:result.result,deficiency_reasons:result.reasons,evaluated_by:state.user.id,evaluated_at:new Date().toISOString(),renewal_decision:null,decision_note:null}).eq("id",s.id);
        if(error) throw error; await logAction("EVALUATED",s.id,{result:result.result,reasons:result.reasons});
      } else if (action === "approve" || action === "hold") {
        if (s.compliance_result !== "Compliant" && action === "approve") throw new Error("Renewal approval requires a Compliant evaluation.");
        if (!note) throw new Error("Enter a decision note before saving the renewal decision.");
        const decision = action === "approve" ? "Approved" : "Held";
        const { error } = await state.client.from("semester_submissions").update({renewal_decision:decision,decision_note:note,decision_by:state.user.id,decision_at:new Date().toISOString()}).eq("id",s.id);
        if(error) throw error; await logAction("RENEWAL_"+decision.toUpperCase(),s.id,{note});
      }
      $("reviewDialog").close(); message("appMessage","Review action saved.","success"); await refreshData(); await loadReview(); renderStats();
    } catch(e) { message("appMessage",e.message,"error"); }
  }

  function setupEvents() {
    document.querySelectorAll("[data-auth-tab]").forEach(btn => btn.addEventListener("click", () => {
      const signup = btn.dataset.authTab === "signup";
      $("loginForm").classList.toggle("hidden", signup); $("signupForm").classList.toggle("hidden", !signup);
      document.querySelectorAll("[data-auth-tab]").forEach(b => b.classList.toggle("active", b === btn)); message("authMessage","");
    }));
    $("loginForm").addEventListener("submit", async e => {
      e.preventDefault(); if (!state.client) return;
      message("authMessage","Signing in…");
      const { error } = await state.client.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
      if (error) message("authMessage",error.message,"error"); else message("authMessage","Signed in.","success");
    });
    $("signupForm").addEventListener("submit", async e => {
      e.preventDefault(); if (!state.client) return;
      const name=$("signupName").value.trim(), studentId=$("signupStudentId").value.trim();
      message("authMessage","Creating account…");
      const { data, error } = await state.client.auth.signUp({email:$("signupEmail").value.trim(),password:$("signupPassword").value,options:{data:{full_name:name,student_id:studentId}}});
      if (error) message("authMessage",error.message,"error");
      else if (!data.session) message("authMessage","Account created. Check your email to confirm it, then log in. Your role is Scholar.","success");
      else message("authMessage","Account created. Loading your portal…","success");
    });
    $("logoutBtn").addEventListener("click", async () => { if (state.client) await state.client.auth.signOut(); state.user=null; state.profile=null; showAuth(); });
    document.querySelectorAll(".nav-tab").forEach(btn => btn.addEventListener("click",()=>go(btn.dataset.view)));
    document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click",()=>go(btn.dataset.go)));
    $("showSubmissionForm").addEventListener("click",()=>$("submissionForm").classList.remove("hidden"));
    $("cancelSubmission").addEventListener("click",()=>$("submissionForm").classList.add("hidden"));
    $("submissionForm").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const gwa=Number($("gwa").value), units=Number($("units").value), failed=Number($("failedCount").value), inc=Number($("incompleteCount").value), dropped=Number($("droppedCount").value);
        if (!Number.isFinite(gwa) || gwa < 1 || gwa > 5) throw new Error("GWA must be from 1.00 to 5.00.");
        if (![units,failed,inc,dropped].every(n=>Number.isInteger(n)&&n>=0)) throw new Error("Units and subject counts must be nonnegative integers.");
        if (!getMyAssignment()) throw new Error("No scholarship program has been assigned to your account. Contact staff.");
        const payload={scholar_id:state.user.id,academic_year:$("academicYear").value,semester:$("semester").value,gwa,enrolled_units:units,failed_count:failed,incomplete_count:inc,dropped_count:dropped,evidence_ref:$("evidenceRef").value.trim(),submitted_at:new Date().toISOString(),verification_status:"Pending"};
        const {error}=await state.client.from("semester_submissions").insert(payload);
        if(error) throw error;
        message("appMessage","Submission saved. It is now Pending verification.","success"); $("submissionForm").reset(); $("submissionForm").classList.add("hidden"); await refreshData(); await loadSubmissions();
      } catch(err) { message("appMessage",err.message,"error"); }
    });
    $("assignmentForm").addEventListener("submit",async e=>{
      e.preventDefault();
      try {
        const scholar_id=$("scholarSelect").value, program_id=$("programSelect").value;
        if(!scholar_id||!program_id) throw new Error("Select a scholar and a scholarship policy.");
        const {error}=await state.client.from("scholar_assignments").upsert({scholar_id,program_id,assigned_by:state.user.id},{onConflict:"scholar_id"});
        if(error) throw error;
        await logAction("ASSIGNMENT_UPDATED",null,{scholar_id,program_id}); message("appMessage","Scholarship assignment saved.","success"); await loadManagement(); await refreshData();
      }catch(err){message("appMessage",err.message,"error");}
    });
    $("reviewStatusFilter").addEventListener("change",loadReview);
    $("reviewComplianceFilter").addEventListener("change",loadReview);
    $("reviewTable").addEventListener("click",e=>{const b=e.target.closest("[data-review]");if(b)openReview(b.dataset.review);});
    $("recentSubmissions").addEventListener("click",e=>{const b=e.target.closest("[data-review]");if(b)openReview(b.dataset.review);});
    $("closeReviewDialog").addEventListener("click",()=>$("reviewDialog").close());
    $("reviewActions").addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(b)reviewAction(b.dataset.action);});
  }
  async function boot() {
    setupEvents();
    if (!configured || !window.supabase) {
      $("connectionStatus").textContent="Setup required";
      message("authMessage","Add your Supabase project URL and publishable/anon key in js/config.js, then run the SQL in supabase/schema.sql.","error");
      return;
    }
    state.client=window.supabase.createClient(cfg.url,cfg.anonKey);
    $("connectionStatus").textContent="Connecting…";
    const {data:{session}}=await state.client.auth.getSession();
    if(session){state.user=session.user;try{await loadProfile();$("connectionStatus").textContent="Connected to Supabase";}catch(e){message("appMessage",e.message,"error");$("connectionStatus").textContent="Database setup needed";}}
    else {showAuth();$("connectionStatus").textContent="Supabase configured";}
    state.client.auth.onAuthStateChange(async (_event,session)=>{
      if(session){state.user=session.user;try{await loadProfile();$("connectionStatus").textContent="Connected to Supabase";}catch(e){showAuth();message("authMessage",e.message,"error");}}
      else {state.user=null;state.profile=null;showAuth();}
    });
  }
  document.addEventListener("DOMContentLoaded",boot);
})();