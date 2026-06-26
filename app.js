const STORAGE_KEY = "leadlaju-state-v1";
const AUTH_KEY = "leadlaju-auth-v1";
const NOTIFIED_LEADS_KEY = "leadlaju-notified-leads-v1";
const SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
const RESPONSE_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_AGENT_PASSWORD = "Agent123!";
const NOTIFICATION_ICON = "/assets/icon-192.png";
const NOTIFICATION_BADGE = "/assets/badge-96.png";
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const DEFAULT_GOOGLE_SHEET_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbyXEPXT-m6YETnvOZEy0CxF82CMmMGDmgpVmDIv-a7XTEdJp92mYkOQhaBSRTPnNH7K/exec";
const LEAD_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "passed", label: "Passed" },
  { value: "rejected", label: "Rejected" },
  { value: "need_follow_up", label: "Need Follow Up" },
  { value: "potential", label: "Potential" },
  { value: "client", label: "Client" },
];
const LEAD_STATUS_LABELS = Object.fromEntries(LEAD_STATUS_OPTIONS.map((status) => [status.value, status.label]));

const defaultState = {
  currentUserId: "agent-aina",
  agents: [
    {
      id: "agent-aina",
      name: "Nur Aina",
      phone: "+60 12-345 6789",
      email: "aina@leadlaju.my",
      password: "Agent123!",
      role: "agent",
      active: true,
      leadsHandled: 8,
    },
    {
      id: "agent-hafiz",
      name: "Hafiz Rahman",
      phone: "+60 17-482 1093",
      email: "hafiz@leadlaju.my",
      password: "Agent123!",
      role: "agent",
      active: true,
      leadsHandled: 6,
    },
    {
      id: "agent-mei",
      name: "Mei Ling",
      phone: "+60 16-773 8210",
      email: "mei@leadlaju.my",
      password: "Agent123!",
      role: "agent",
      active: true,
      leadsHandled: 5,
    },
    {
      id: "admin-azlan",
      name: "Admin",
      phone: "+60173559147",
      email: "admin@leadlaju.my",
      password: "Admin123!",
      role: "admin",
      active: true,
      leadsHandled: 0,
    },
  ],
  leads: [],
  activities: [],
  roundRobinIndex: 0,
  integration: {
    endpoint: DEFAULT_GOOGLE_SHEET_ENDPOINT,
    interval: 15,
    lastSyncAt: null,
    connected: true,
  },
};

let state = loadState();
let activeView = "dashboard";
let tickTimer;
let syncTimer;
let toastTimer;
let lastRenderedActiveLeadKey = null;
let passwordResetRequest = null;
let selectedAgentId = null;
let editingAgentId = null;
let selectedContactId = null;
let remoteDatabaseClient = null;
let remoteDatabaseMode = false;
let claimingLeadId = null;
let serviceWorkerRegistrationPromise = null;
let notificationAudioContext = null;
let notifiedLeadKeys = loadNotifiedLeadKeys();

const elements = {
  sidebar: document.querySelector("#sidebar"),
  loginScreen: document.querySelector("#login-screen"),
  appShell: document.querySelector("#app-shell"),
  loginForm: document.querySelector("#login-form"),
  loginEmail: document.querySelector("#login-email"),
  loginPassword: document.querySelector("#login-password"),
  loginError: document.querySelector("#login-error"),
  passwordToggle: document.querySelector("#password-toggle"),
  forgotPasswordButton: document.querySelector("#forgot-password-button"),
  signupForm: document.querySelector("#signup-form"),
  signupToggle: document.querySelector("#signup-toggle"),
  signupName: document.querySelector("#signup-name"),
  signupPhone: document.querySelector("#signup-phone"),
  signupEmail: document.querySelector("#signup-email"),
  signupPassword: document.querySelector("#signup-password"),
  signupConfirmPassword: document.querySelector("#signup-confirm-password"),
  signupError: document.querySelector("#signup-error"),
  resetPasswordModal: document.querySelector("#reset-password-modal"),
  resetRequestForm: document.querySelector("#reset-request-form"),
  resetVerifyForm: document.querySelector("#reset-verify-form"),
  resetEmail: document.querySelector("#reset-email"),
  resetCode: document.querySelector("#reset-code"),
  resetNewPassword: document.querySelector("#reset-new-password"),
  resetConfirmPassword: document.querySelector("#reset-confirm-password"),
  resetRequestError: document.querySelector("#reset-request-error"),
  resetVerifyError: document.querySelector("#reset-verify-error"),
  resetCodeMessage: document.querySelector("#reset-code-message"),
  demoResetCode: document.querySelector("#demo-reset-code"),
  demoResetCodeValue: document.querySelector("#demo-reset-code-value"),
  resetBackButton: document.querySelector("#reset-back-button"),
  logoutButton: document.querySelector("#logout-button"),
  mobileMenu: document.querySelector("#mobile-menu"),
  viewTitle: document.querySelector("#view-title"),
  todayLabel: document.querySelector("#today-label"),
  sidebarSettings: document.querySelector("#sidebar-settings"),
  sidebarAvatar: document.querySelector("#sidebar-avatar"),
  sidebarUserName: document.querySelector("#sidebar-user-name"),
  sidebarUserRole: document.querySelector("#sidebar-user-role"),
  activeLeadContainer: document.querySelector("#active-lead-container"),
  activeLeadTemplate: document.querySelector("#active-lead-template"),
  queueLabel: document.querySelector("#queue-label"),
  navLeadCount: document.querySelector("#nav-lead-count"),
  notificationCount: document.querySelector("#notification-count"),
  notificationButton: document.querySelector("#notification-button"),
  manualLeadButtons: [
    document.querySelector("#manual-lead-button"),
    document.querySelector("#manual-lead-button-2"),
  ],
  manualLeadModal: document.querySelector("#manual-lead-modal"),
  manualLeadForm: document.querySelector("#manual-lead-form"),
  manualLeadName: document.querySelector("#manual-lead-name"),
  manualLeadPhone: document.querySelector("#manual-lead-phone"),
  manualLeadEmail: document.querySelector("#manual-lead-email"),
  manualLeadProject: document.querySelector("#manual-lead-project"),
  manualLeadSource: document.querySelector("#manual-lead-source"),
  manualLeadError: document.querySelector("#manual-lead-error"),
  activityList: document.querySelector("#activity-list"),
  teamList: document.querySelector("#team-list"),
  onlineCount: document.querySelector("#online-count"),
  leadsTableBody: document.querySelector("#leads-table-body"),
  leadSearch: document.querySelector("#lead-search"),
  leadFilter: document.querySelector("#lead-filter"),
  leadLogCount: document.querySelector("#lead-log-count"),
  contactModal: document.querySelector("#contact-modal"),
  contactForm: document.querySelector("#contact-form"),
  contactName: document.querySelector("#contact-name"),
  contactPhone: document.querySelector("#contact-phone"),
  contactEmail: document.querySelector("#contact-email"),
  contactProject: document.querySelector("#contact-project"),
  contactNotes: document.querySelector("#contact-notes"),
  contactFormError: document.querySelector("#contact-form-error"),
  contactDeleteButton: document.querySelector("#contact-delete-button"),
  agentsGrid: document.querySelector("#agents-grid"),
  addAgentButton: document.querySelector("#add-agent-button"),
  agentModal: document.querySelector("#agent-modal"),
  agentForm: document.querySelector("#agent-form"),
  agentModalKicker: document.querySelector("#agent-modal-kicker"),
  agentModalTitle: document.querySelector("#agent-modal-title"),
  agentName: document.querySelector("#agent-name"),
  agentPhone: document.querySelector("#agent-phone"),
  agentEmail: document.querySelector("#agent-email"),
  agentPassword: document.querySelector("#agent-password"),
  agentPasswordLabel: document.querySelector("#agent-password-label"),
  agentSubmitButton: document.querySelector("#agent-submit-button"),
  agentPasswordModal: document.querySelector("#agent-password-modal"),
  agentPasswordForm: document.querySelector("#agent-password-form"),
  agentPasswordDescription: document.querySelector("#agent-password-description"),
  agentNewPassword: document.querySelector("#agent-new-password"),
  agentConfirmPassword: document.querySelector("#agent-confirm-password"),
  agentPasswordError: document.querySelector("#agent-password-error"),
  integrationForm: document.querySelector("#integration-form"),
  sheetEndpoint: document.querySelector("#sheet-endpoint"),
  pollInterval: document.querySelector("#poll-interval"),
  syncNowButton: document.querySelector("#sync-now-button"),
  connectionResult: document.querySelector("#connection-result"),
  sidebarSyncText: document.querySelector("#sidebar-sync-text"),
  sidebarSyncStatus: document.querySelector("#sidebar-sync-status"),
  liveSyncLabel: document.querySelector("#live-sync-label"),
  resetCodeFields: document.querySelector("#reset-code-fields"),
  toast: document.querySelector("#toast"),
  toastTitle: document.querySelector("#toast-title"),
  toastMessage: document.querySelector("#toast-message"),
  statToday: document.querySelector("#stat-today"),
  statContacted: document.querySelector("#stat-contacted"),
  statResponse: document.querySelector("#stat-response"),
  statConversion: document.querySelector("#stat-conversion"),
  contactRate: document.querySelector("#contact-rate"),
};

function normalizeIntegration(input = {}) {
  const endpoint = String(input.endpoint || DEFAULT_GOOGLE_SHEET_ENDPOINT).trim() || DEFAULT_GOOGLE_SHEET_ENDPOINT;
  return {
    ...defaultState.integration,
    ...input,
    endpoint,
    interval: Number(input.interval) || defaultState.integration.interval,
    connected: input.connected !== false || endpoint === DEFAULT_GOOGLE_SHEET_ENDPOINT,
  };
}

function getSheetEndpoint() {
  return (
    elements.sheetEndpoint?.value?.trim() ||
    state.integration.endpoint ||
    DEFAULT_GOOGLE_SHEET_ENDPOINT
  );
}

function loadState() {
  if (new URLSearchParams(window.location.search).has("demo")) return structuredClone(defaultState);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) {
      return structuredClone(defaultState);
    }

    const merged = {
      ...structuredClone(defaultState),
      ...saved,
      integration: normalizeIntegration(saved.integration || {}),
    };
    merged.agents = merged.agents.map((agent) => ({
      ...agent,
      password: agent.password || (agent.role === "admin" ? "Admin123!" : "Agent123!"),
    }));
    merged.leads = merged.leads.map((lead) => ({
      ...lead,
      email: lead.email || "",
      project: lead.project || "Tidak dinyatakan",
      notes: lead.notes || "",
      status: lead.status === "queued" ? "queued" : lead.status || "new",
      createdAt: parseLeadTimestamp(lead.createdAt || lead.created_at, Date.now()),
      receivedAt: lead.receivedAt ? parseLeadTimestamp(lead.receivedAt, lead.createdAt || Date.now()) : null,
      expiresAt: lead.expiresAt
        ? parseLeadTimestamp(lead.expiresAt, Date.now() + RESPONSE_WINDOW_MS)
        : lead.status === "new"
          ? Date.now() + RESPONSE_WINDOW_MS
          : null,
      queuedAt:
        lead.queuedAt || lead.status === "queued"
          ? parseLeadTimestamp(lead.queuedAt || lead.createdAt || Date.now(), Date.now())
          : null,
      passCount: lead.passCount || 0,
    }));
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadRemoteDatabaseConfig() {
  return null;
}

function initRemoteDatabase() {
  remoteDatabaseClient = null;
  remoteDatabaseMode = false;
  return null;
}

function mapProfile(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    email: row.email,
    role: row.role || "agent",
    active: row.active !== false,
    leadsHandled: row.leads_handled || 0,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
  };
}

function mapLead(row) {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key || row.id,
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    project: row.project || "Tidak dinyatakan",
    source: normalizeLeadSource(row.source || "Manual Lead"),
    createdAt: new Date(row.created_at).getTime(),
    receivedAt: new Date(row.received_at || row.created_at).getTime(),
    assignedAgentId: row.assigned_agent_id,
    expiresAt: new Date(row.expires_at).getTime(),
    status: row.status || "new",
    passCount: row.pass_count || 0,
    responseMs: row.response_ms,
    contactedAt: row.contacted_at ? new Date(row.contacted_at).getTime() : null,
    notes: row.notes || "",
  };
}

function mapActivity(row) {
  return {
    id: row.id,
    type: row.type,
    leadId: row.lead_id,
    leadName: row.lead_name,
    message: row.message,
    createdAt: new Date(row.created_at).getTime(),
  };
}

async function loadRemoteState(userId) {
  if (!remoteDatabaseClient || !userId) return false;
  const previousLeadKeys = new Set(state.leads.map(leadNotificationKey));
  const shouldDetectNewLeads = false;
  try {
    const [profilesResult, leadsResult, activitiesResult, settingsResult] = await Promise.all([
      remoteDatabaseClient.from("profiles").select("*").order("created_at"),
      remoteDatabaseClient.rpc("get_visible_leads"),
      remoteDatabaseClient.from("activities").select("*").order("created_at", { ascending: false }).limit(80),
      remoteDatabaseClient.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (leadsResult.error) throw leadsResult.error;
    if (activitiesResult.error) throw activitiesResult.error;

    const profiles = profilesResult.data.map(mapProfile);
    const currentUser = profiles.find((agent) => agent.id === userId);
    if (!currentUser) throw new Error("Profil pengguna belum tersedia.");

    state = {
      ...structuredClone(defaultState),
      currentUserId: userId,
      agents: profiles,
      leads: leadsResult.data.map(mapLead),
      activities: activitiesResult.data.map(mapActivity),
      roundRobinIndex: settingsResult.data?.round_robin_index || 0,
      integration: normalizeIntegration({
        endpoint: settingsResult.data?.google_sheet_endpoint || DEFAULT_GOOGLE_SHEET_ENDPOINT,
        interval: settingsResult.data?.poll_interval || defaultState.integration.interval,
        connected: true,
        lastSyncAt: settingsResult.data?.last_sync_at
          ? new Date(settingsResult.data.last_sync_at).getTime()
          : null,
      }),
    };
    remoteDatabaseMode = true;
    saveState();
    if (shouldDetectNewLeads) {
      await notifyForNewVisibleLeads(previousLeadKeys);
    } else {
      markCurrentLeadNotificationsSeen();
    }
    return true;
  } catch (error) {
      console.error("Remote load failed", error);
    remoteDatabaseMode = false;
    return false;
  }
}

function subscribeToRemoteDatabase() {
  return null;
}

function queueRemoteReload() {
  return null;
}

async function persistProfile(agent) {
  if (!remoteDatabaseMode) return true;
  const { error } = await remoteDatabaseClient
    .from("profiles")
    .update({
      name: agent.name,
      phone: agent.phone,
      active: agent.active,
      leads_handled: agent.leadsHandled || 0,
    })
    .eq("id", agent.id);
  if (error) throw error;
  return true;
}

async function persistLead(lead) {
  if (!remoteDatabaseMode) return true;
  const { error } = await remoteDatabaseClient
    .from("leads")
    .update({
      name: lead.name,
      phone: lead.phone,
      email: lead.email || null,
      project: lead.project,
      source: lead.source,
      assigned_agent_id: lead.assignedAgentId,
      expires_at: new Date(lead.expiresAt).toISOString(),
      status: lead.status,
      pass_count: lead.passCount || 0,
      response_ms: lead.responseMs,
      contacted_at: lead.contactedAt ? new Date(lead.contactedAt).toISOString() : null,
      notes: lead.notes || "",
    })
    .eq("id", lead.id);
  if (error) throw error;
  return true;
}

async function persistNewLead(lead) {
  if (!remoteDatabaseMode) return true;
  const { error } = await remoteDatabaseClient.from("leads").insert({
    id: lead.id,
    dedupe_key: lead.dedupeKey,
    name: lead.name,
    phone: lead.phone,
    email: lead.email || null,
    project: lead.project,
    source: lead.source,
    created_at: new Date(lead.createdAt).toISOString(),
    received_at: new Date(lead.receivedAt).toISOString(),
    assigned_agent_id: lead.assignedAgentId,
    expires_at: new Date(lead.expiresAt).toISOString(),
    status: lead.status,
    pass_count: lead.passCount,
    response_ms: lead.responseMs,
    contacted_at: lead.contactedAt ? new Date(lead.contactedAt).toISOString() : null,
  });
  if (error) throw error;
  return true;
}

async function persistActivity(activity) {
  if (!remoteDatabaseMode) return true;
  const { error } = await remoteDatabaseClient.from("activities").insert({
    id: activity.id,
    type: activity.type,
    lead_id: activity.leadId,
    lead_name: activity.leadName,
    message: activity.message,
    created_at: new Date(activity.createdAt).toISOString(),
  });
  if (error) throw error;
  return true;
}

async function deleteLeads(leadIds) {
  const ids = [...new Set(leadIds)].filter(Boolean);
  if (!ids.length) return true;

  if (remoteDatabaseMode) {
    const { error } = await remoteDatabaseClient.from("leads").delete().in("id", ids);
    if (error) throw error;
  }

  state.leads = state.leads.filter((lead) => !ids.includes(lead.id));
  state.activities = state.activities.filter((activity) => !ids.includes(activity.leadId));
  activateQueuedLeads({ notify: true });
  await syncLeadHandledCountsToSheet();
  saveState();
  return true;
}

function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (!session?.userId || !session?.expiresAt || session.expiresAt <= Date.now()) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

function getSessionUser() {
  const session = loadSession();
  if (!session) return null;
  const user = state.agents.find((agent) => agent.id === session.userId);
  if (!user?.active) {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
  return user;
}

function startAuthenticatedApp(user) {
  state.currentUserId = user.id;
  saveState();
  document.body.classList.remove("auth-pending", "logged-out");
  document.body.classList.add("authenticated");
  elements.appShell.setAttribute("aria-hidden", "false");
  elements.loginError.textContent = "";
  elements.loginForm.reset();
  elements.loginPassword.type = "password";
  elements.passwordToggle.setAttribute("aria-label", "Tunjukkan kata laluan");

  window.clearInterval(tickTimer);
  tickTimer = window.setInterval(() => {
    processExpiredLeads();
    updateCountdown();
  }, 1000);
  registerServiceWorker();
  markCurrentLeadNotificationsSeen();
  scheduleSync();
  renderAll();
  if (getSheetEndpoint()) {
    syncGoogleSheet({ silent: true, notifyNewLeads: true });
  }
}

function showLogin() {
  window.clearInterval(tickTimer);
  window.clearInterval(syncTimer);
  elements.sidebar.classList.remove("open");
  elements.appShell.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-pending", "authenticated");
  document.body.classList.add("logged-out");
  showSignupForm(false);
  window.setTimeout(() => elements.loginEmail.focus(), 80);
}

function setLoginError(message) {
  elements.loginError.textContent = message;
  elements.loginEmail.closest(".login-input").classList.toggle("invalid", Boolean(message));
  elements.loginPassword.closest(".login-input").classList.toggle("invalid", Boolean(message));
}

function setSignupError(message) {
  elements.signupError.textContent = message;
}

function showSignupForm(show) {
  elements.signupForm.hidden = !show;
  elements.loginForm.hidden = show;
  elements.forgotPasswordButton.hidden = show;
  elements.signupToggle.textContent = show
    ? "Sudah ada akaun? Log masuk"
    : "Agent baru? Sign up untuk minta approval admin";
  setLoginError("");
  setSignupError("");
  if (show) {
    elements.signupForm.reset();
    window.setTimeout(() => elements.signupName.focus(), 80);
  } else {
    window.setTimeout(() => elements.loginEmail.focus(), 80);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = elements.loginEmail.value.trim().toLowerCase();
  const password = elements.loginPassword.value;
  if (!email || !password) {
    setLoginError("Masukkan emel dan kata laluan.");
    return;
  }

  if (remoteDatabaseClient) {
    const { data, error } = await remoteDatabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoginError("Emel atau kata laluan tidak betul.");
      return;
    }
    const loaded = await loadRemoteState(data.user.id);
    if (!loaded) {
      await remoteDatabaseClient.auth.signOut();
      setLoginError("Akaun berjaya disahkan tetapi data sistem tidak dapat dimuatkan.");
      return;
    }
    const signedInUser = getCurrentUser();
    if (!signedInUser?.active) {
      await remoteDatabaseClient.auth.signOut();
      setLoginError("Akaun anda sedang menunggu approval admin.");
      return;
    }
    setLoginError("");
    activeView = "dashboard";
    switchView("dashboard");
    startAuthenticatedApp(signedInUser);
    return;
  }

  const user = state.agents.find((agent) => agent.email.toLowerCase() === email);
  if (!user || user.password !== password) {
    setLoginError("Emel atau kata laluan tidak betul.");
    return;
  }
  if (!user.active) {
    setLoginError("Akaun anda sedang menunggu approval admin.");
    return;
  }

  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      userId: user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION_MS,
    }),
  );
  setLoginError("");
  activeView = "dashboard";
  switchView("dashboard");
  startAuthenticatedApp(user);
}

async function handleAgentSignup(event) {
  event.preventDefault();
  const name = elements.signupName.value.trim();
  const phone = elements.signupPhone.value.trim();
  const email = elements.signupEmail.value.trim().toLowerCase();
  const password = elements.signupPassword.value;
  const confirmation = elements.signupConfirmPassword.value;

  if (!name || !phone || !email || !password) {
    setSignupError("Lengkapkan semua maklumat pendaftaran.");
    return;
  }
  if (password.length < 8) {
    setSignupError("Kata laluan mesti sekurang-kurangnya 8 aksara.");
    return;
  }
  if (password !== confirmation) {
    setSignupError("Pengesahan kata laluan tidak sepadan.");
    return;
  }
  if (!remoteDatabaseClient && state.agents.some((agent) => agent.email.toLowerCase() === email)) {
    setSignupError("Emel ini sudah wujud dalam sistem.");
    return;
  }

  let signupAgent = null;
  if (remoteDatabaseClient) {
    const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
      body: {
        action: "signup_request",
        name,
        phone,
        email,
        password,
      },
    });
    if (error || !data?.ok) {
      setSignupError(data?.error || error?.message || "Permohonan tidak dapat dihantar.");
      return;
    }
    signupAgent = {
      id: data.userId,
      name,
      phone,
      email,
      role: "agent",
      active: false,
      leadsHandled: 0,
      createdAt: Date.now(),
    };
    state.agents = [
      ...state.agents.filter((agent) => agent.email.toLowerCase() !== email),
      signupAgent,
    ];
    saveState();
  } else {
    signupAgent = {
      id: makeId("agent"),
      name,
      phone,
      email,
      password,
      role: "agent",
      active: false,
      leadsHandled: 0,
      createdAt: Date.now(),
    };
    state.agents.push(signupAgent);
    saveState();
  }

  await upsertAgentToSheet(signupAgent);
  elements.signupForm.reset();
  showSignupForm(false);
  setLoginError("Permohonan dihantar. Tunggu admin approve, kemudian log masuk guna emel dan kata laluan ini.");
}

async function logout() {
  if (remoteDatabaseClient) {
    await remoteDatabaseClient.auth.signOut();
  }
  localStorage.removeItem(AUTH_KEY);
  remoteDatabaseMode = false;
  showLogin();
}

function togglePasswordVisibility() {
  const isVisible = elements.loginPassword.type === "text";
  elements.loginPassword.type = isVisible ? "password" : "text";
  elements.passwordToggle.setAttribute(
    "aria-label",
    isVisible ? "Tunjukkan kata laluan" : "Sembunyikan kata laluan",
  );
}

function resetPasswordFlow() {
  passwordResetRequest = null;
  elements.resetRequestForm.reset();
  elements.resetVerifyForm.reset();
  elements.resetRequestForm.hidden = false;
  elements.resetVerifyForm.hidden = true;
  elements.demoResetCode.hidden = true;
  elements.resetCodeFields.hidden = false;
  elements.resetCode.required = true;
  elements.resetRequestError.textContent = "";
  elements.resetVerifyError.textContent = "";
}

function openResetPasswordModal() {
  resetPasswordFlow();
  elements.resetEmail.value = elements.loginEmail.value.trim();
  elements.resetPasswordModal.classList.add("open");
  elements.resetPasswordModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.resetEmail.focus(), 80);
}

function openRemoteRecoveryModal() {
  resetPasswordFlow();
  passwordResetRequest = { remoteRecovery: true };
  elements.resetRequestForm.hidden = true;
  elements.resetVerifyForm.hidden = false;
  elements.resetCodeFields.hidden = true;
  elements.resetCode.required = false;
  elements.resetCodeMessage.textContent = "Tetapkan kata laluan baru untuk akaun anda.";
  elements.resetPasswordModal.classList.add("open");
  elements.resetPasswordModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.resetNewPassword.focus(), 80);
}

async function sendPasswordResetEmail(agent, code) {
  const endpoint = getSheetEndpoint();
  if (!endpoint) return false;

  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "send_reset_code",
        email: agent.email,
        name: agent.name,
        code,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

async function requestPasswordReset(event) {
  event.preventDefault();
  const email = elements.resetEmail.value.trim().toLowerCase();
  if (remoteDatabaseClient) {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await remoteDatabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      elements.resetRequestError.textContent = "Emel reset tidak dapat dihantar. Semak tetapan emel.";
      return;
    }
    closeModal(elements.resetPasswordModal);
    showToast("Semak emel anda", "Pautan untuk menetapkan kata laluan baru telah dihantar.");
    return;
  }

  const agent = state.agents.find((item) => item.email.trim().toLowerCase() === email);
  if (!agent) {
    elements.resetRequestError.textContent = "Emel ini tidak didaftarkan dalam sistem.";
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const emailSent = await sendPasswordResetEmail(agent, code);
  passwordResetRequest = {
    agentId: agent.id,
    email: agent.email,
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  elements.resetRequestForm.hidden = true;
  elements.resetVerifyForm.hidden = false;
  elements.resetCodeMessage.textContent = emailSent
    ? `Kod verifikasi telah dihantar ke ${agent.email}.`
    : `Google Apps Script emel belum disambungkan. Gunakan kod demo di bawah untuk menguji reset.`;
  elements.demoResetCode.hidden = emailSent;
  elements.demoResetCodeValue.textContent = code;
  elements.resetRequestError.textContent = "";
  window.setTimeout(() => elements.resetCode.focus(), 80);
}

async function verifyPasswordReset(event) {
  event.preventDefault();
  const code = elements.resetCode.value.trim();
  const password = elements.resetNewPassword.value;
  const confirmation = elements.resetConfirmPassword.value;

  if (!passwordResetRequest) {
    elements.resetVerifyError.textContent = "Permintaan reset tidak sah.";
    return;
  }
  if (!passwordResetRequest.remoteRecovery && passwordResetRequest.expiresAt <= Date.now()) {
    elements.resetVerifyError.textContent = "Kod telah tamat. Minta kod baru.";
    return;
  }
  if (!passwordResetRequest.remoteRecovery && code !== passwordResetRequest.code) {
    elements.resetVerifyError.textContent = "Kod verifikasi tidak betul.";
    return;
  }
  if (password.length < 8) {
    elements.resetVerifyError.textContent = "Kata laluan mesti sekurang-kurangnya 8 aksara.";
    return;
  }
  if (password !== confirmation) {
    elements.resetVerifyError.textContent = "Pengesahan kata laluan tidak sepadan.";
    return;
  }

  if (passwordResetRequest.remoteRecovery) {
    const { error } = await remoteDatabaseClient.auth.updateUser({ password });
    if (error) {
      elements.resetVerifyError.textContent = "Kata laluan tidak dapat dikemas kini.";
      return;
    }
    closeModal(elements.resetPasswordModal);
    resetPasswordFlow();
    showToast("Kata laluan dikemas kini", "Anda kini boleh menggunakan kata laluan baru.");
    return;
  }

  const agent = getAgent(passwordResetRequest.agentId);
  if (!agent) {
    elements.resetVerifyError.textContent = "Akaun tidak ditemui.";
    return;
  }
  agent.password = password;
  saveState();
  elements.loginEmail.value = agent.email;
  closeModal(elements.resetPasswordModal);
  resetPasswordFlow();
  showToast("Kata laluan dikemas kini", "Anda kini boleh log masuk menggunakan kata laluan baru.");
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function getCurrentUser() {
  return state.agents.find((agent) => agent.id === state.currentUserId) || state.agents[0];
}

function isAdmin() {
  return getCurrentUser()?.role === "admin";
}

function getActiveAgents() {
  return state.agents.filter((agent) => agent.role === "agent" && agent.active);
}

function getAgent(agentId) {
  return state.agents.find((agent) => agent.id === agentId);
}

function canAccessLead(lead) {
  return Boolean(lead) && (isAdmin() || lead.assignedAgentId === state.currentUserId);
}

function normalizeUnixTimestamp(value, fallback = Date.now()) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const absolute = Math.abs(numeric);
  if (absolute >= 1000000000000) return numeric;
  if (absolute >= 1000000000) return numeric * 1000;
  return fallback;
}

function parseMalaysiaDateTime(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute),
    Number(second),
  );
}

function parseLeadTimestamp(value, fallback = Date.now()) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : fallback;
  }
  if (typeof value === "number") return normalizeUnixTimestamp(value, fallback);

  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const numeric = raw.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numeric)) return normalizeUnixTimestamp(numeric, fallback);

  const malaysiaTime = parseMalaysiaDateTime(raw);
  if (Number.isFinite(malaysiaTime)) return malaysiaTime;

  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function malaysiaDateParts(value) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  })
    .formatToParts(new Date(parseLeadTimestamp(value)))
    .reduce((parts, part) => {
      if (part.type !== "literal") parts[part.type] = part.value;
      return parts;
    }, {});
}

function formatSheetTimestamp(value = Date.now()) {
  const parts = malaysiaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ms-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parseLeadTimestamp(value)));
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - parseLeadTimestamp(value)) / 1000));
  if (seconds < 10) return "baru sahaja";
  if (seconds < 60) return `${seconds} saat lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minit lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours} jam lalu`;
}

function todayKey(value = Date.now()) {
  const parts = malaysiaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function showToast(title, message, tone = "success") {
  elements.toastTitle.textContent = title;
  elements.toastMessage.textContent = message;
  const icon = elements.toast.querySelector(".toast-icon");
  icon.style.color = tone === "error" ? "var(--red)" : "var(--green)";
  icon.style.background = tone === "error" ? "var(--red-soft)" : "var(--green-soft)";
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

function loadNotifiedLeadKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTIFIED_LEADS_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    localStorage.removeItem(NOTIFIED_LEADS_KEY);
    return new Set();
  }
}

function saveNotifiedLeadKeys() {
  const compacted = [...notifiedLeadKeys].slice(-250);
  notifiedLeadKeys = new Set(compacted);
  localStorage.setItem(NOTIFIED_LEADS_KEY, JSON.stringify(compacted));
}

function lockViewportZoom() {
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches?.length > 1) event.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) event.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
  ["gesturestart", "gesturechange"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
  });
}

function leadNotificationKey(lead) {
  return [lead.id || lead.dedupeKey, lead.assignedAgentId || "unassigned", lead.passCount || 0, lead.status].join(":");
}

function shouldNotifyForLead(lead) {
  if (!lead || lead.status !== "new") return false;
  if (Number(lead.expiresAt) && lead.expiresAt <= Date.now()) return false;
  return isAdmin() || lead.assignedAgentId === state.currentUserId;
}

function markLeadNotificationSeen(lead) {
  notifiedLeadKeys.add(leadNotificationKey(lead));
}

function markCurrentLeadNotificationsSeen() {
  state.leads.filter(shouldNotifyForLead).forEach(markLeadNotificationSeen);
  saveNotifiedLeadKeys();
}

function getNotificationStartUrl() {
  return `${window.location.origin}${window.location.pathname || "/"}`;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return null;
  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register("/sw.js")
      .then(async (registration) => {
        await registration.update().catch(() => {});
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return navigator.serviceWorker.ready.then(() => registration);
      })
      .catch((error) => {
        console.warn("Service worker registration failed", error);
        serviceWorkerRegistrationPromise = null;
        return null;
      });
  }
  return serviceWorkerRegistrationPromise;
}

async function playNotificationSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;

  try {
    if (!notificationAudioContext) notificationAudioContext = new AudioContext();
    if (notificationAudioContext.state === "suspended") await notificationAudioContext.resume();

    const context = notificationAudioContext;
    const start = context.currentTime;
    [784, 988].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const offset = index * 0.18;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.15);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.16);
    });
    return true;
  } catch (error) {
    console.warn("Notification sound blocked", error);
    return false;
  }
}

async function notifyForNewVisibleLeads(previousKeys = new Set()) {
  const freshLeads = state.leads.filter((lead) => {
    const key = leadNotificationKey(lead);
    return shouldNotifyForLead(lead) && !previousKeys.has(key) && !notifiedLeadKeys.has(key);
  });

  for (const lead of freshLeads) {
    await sendSystemNotification(lead, { force: true, toast: true });
  }
}

function addActivity(type, lead, message) {
  const activity = {
    id: crypto.randomUUID?.() || makeId("activity"),
    type,
    leadId: lead.id,
    leadName: lead.name,
    message,
    createdAt: Date.now(),
  };
  state.activities.unshift(activity);
  state.activities = state.activities.slice(0, 80);
  persistActivity(activity).catch((error) => console.error("Activity save failed", error));
  return activity;
}

function selectNextAgent(excludeId = null) {
  const activeAgents = getActiveAgents();
  if (!activeAgents.length) return null;

  let attempts = 0;
  while (attempts < activeAgents.length) {
    const index = state.roundRobinIndex % activeAgents.length;
    const agent = activeAgents[index];
    state.roundRobinIndex = (index + 1) % activeAgents.length;
    attempts += 1;
    if (agent.id !== excludeId || activeAgents.length === 1) return agent;
  }

  return activeAgents[0];
}

function isPendingLead(lead) {
  return lead?.status === "new" || lead?.status === "queued";
}

function hasActiveLeadForAgent(agentId, excludeLeadId = null) {
  return state.leads.some(
    (lead) => lead.status === "new" && lead.assignedAgentId === agentId && lead.id !== excludeLeadId,
  );
}

function selectNextAvailableAgent(options = {}) {
  const activeAgents = getActiveAgents();
  if (!activeAgents.length) return null;

  for (let offset = 0; offset < activeAgents.length; offset += 1) {
    const index = (state.roundRobinIndex + offset) % activeAgents.length;
    const agent = activeAgents[index];
    const isPreviousAgent = options.excludeAgentId && agent.id === options.excludeAgentId;
    if (isPreviousAgent && activeAgents.length > 1) continue;
    if (hasActiveLeadForAgent(agent.id, options.ignoreLeadId || null)) continue;

    state.roundRobinIndex = (index + 1) % activeAgents.length;
    return agent;
  }

  return null;
}

function queueLead(lead, now = Date.now(), options = {}) {
  lead.status = "queued";
  lead.assignedAgentId = null;
  lead.expiresAt = null;
  lead.receivedAt = null;
  lead.queuedAt = now;
  lead.lastAgentId = options.previousAgentId || lead.lastAgentId || null;
  if (options.resetPassCount !== false) lead.passCount = 0;
  lead.statusLockedUntil = null;
}

function activateLead(lead, options = {}) {
  const now = options.now || Date.now();
  const agent = selectNextAvailableAgent({
    excludeAgentId: options.excludeAgentId || lead.lastAgentId || null,
    ignoreLeadId: lead.id,
  });
  if (!agent) return null;

  lead.status = "new";
  lead.assignedAgentId = agent.id;
  lead.receivedAt = now;
  lead.expiresAt = now + RESPONSE_WINDOW_MS;
  lead.queuedAt = null;
  lead.lastAgentId = null;
  lead.statusLockedUntil = null;
  if (options.resetPassCount) lead.passCount = 0;
  return agent;
}

function activateQueuedLeads(options = {}) {
  const activated = [];
  while (true) {
    const queuedLead = state.leads
      .filter((lead) => lead.status === "queued")
      .sort((a, b) => (a.queuedAt || a.createdAt || 0) - (b.queuedAt || b.createdAt || 0))[0];
    if (!queuedLead) break;

    const agent = activateLead(queuedLead, {
      now: options.now || Date.now(),
      resetPassCount: false,
    });
    if (!agent) break;

    addActivity("new", queuedLead, `${queuedLead.project} diberikan kepada ${agent.name}`);
    syncLeadRuntimeInSheet(queuedLead);
    if (options.notify && shouldNotifyForLead(queuedLead)) {
      sendSystemNotification(queuedLead);
    }
    activated.push(queuedLead);
  }
  return activated;
}

function activateNextQueuedLead(options = {}) {
  return activateQueuedLeads(options)[0] || null;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function whatsappLeadUrl(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function normalizeLeadSource(value, fallback = "Manual Lead") {
  const source = String(value || fallback || "Manual Lead").trim();
  const lower = source.toLowerCase();
  if (lower.includes("tiktok")) return "Tiktok Ads";
  if (lower.includes("meta") || lower.includes("facebook") || lower === "fb") return "Meta Ads";
  if (lower.includes("manual")) return "Manual Lead";
  return source || fallback;
}

function normalizeSheetStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  const compactStatus = status.replace(/[\s_-]+/g, " ");
  if (!status || compactStatus === "new" || compactStatus === "baru") return "new";
  if (
    [
      "done",
      "completed",
      "complete",
      "contacted",
      "called",
      "call",
      "dihubungi",
      "telah dihubungi",
    ].includes(compactStatus)
  ) {
    return "contacted";
  }
  if (["passed", "pass", "expired", "missed", "tamat", "terlepas", "dipindahkan"].includes(compactStatus)) {
    return "passed";
  }
  if (["rejected", "reject", "tolak", "ditolak", "tak berminat", "tidak berminat"].includes(compactStatus)) {
    return "rejected";
  }
  if (
    [
      "need follow up",
      "follow up",
      "followup",
      "follow",
      "perlu follow up",
      "perlu followup",
      "susulan",
    ].includes(compactStatus)
  ) {
    return "need_follow_up";
  }
  if (["potential", "potensi", "prospect", "prospek", "hot lead"].includes(compactStatus)) {
    return "potential";
  }
  if (["client", "customer", "pelanggan", "buyer", "pembeli"].includes(compactStatus)) {
    return "client";
  }
  return "new";
}

function getLeadVisualStatus(lead) {
  if (!lead) return "new";
  if (lead.status === "queued") return "new";
  return lead.status || "new";
}

function formatSheetStatus(status) {
  return LEAD_STATUS_LABELS[normalizeSheetStatus(status)] || "New";
}

function renderLeadStatusOptions(currentStatus) {
  return LEAD_STATUS_OPTIONS.map(
    (status) =>
      `<option value="${status.value}"${status.value === currentStatus ? " selected" : ""}>${status.label}</option>`,
  ).join("");
}

function isActiveLeadStatus(status) {
  return status === "new" || status === "queued";
}

function applySheetStatusToLead(lead, sheetStatus, now = Date.now()) {
  const nextStatus = normalizeSheetStatus(sheetStatus);
  const previousVisualStatus = getLeadVisualStatus(lead);
  if (lead.status === "contacted" && nextStatus === "new" && lead.statusLockedUntil > now) {
    return false;
  }

  if (nextStatus === "new") {
    if (lead.status === "new" || lead.status === "queued") return false;
    lead.status = "new";
    lead.passCount = 0;
    lead.contactedAt = null;
    lead.responseMs = null;
    lead.statusLockedUntil = null;
    const assignedAgent = selectNextAvailableAgent({ ignoreLeadId: lead.id });
    if (assignedAgent) {
      lead.assignedAgentId = assignedAgent.id;
      lead.receivedAt = now;
      lead.expiresAt = now + RESPONSE_WINDOW_MS;
      lead.queuedAt = null;
      lead.lastAgentId = null;
    } else {
      queueLead(lead, now, {
        resetPassCount: false,
        previousAgentId: lead.assignedAgentId || lead.lastAgentId || null,
      });
    }
  } else {
    lead.status = nextStatus;
    lead.statusLockedUntil = null;
    lead.expiresAt = null;
    lead.queuedAt = null;
    if (nextStatus === "contacted") {
      lead.passCount = lead.passCount || 0;
      lead.contactedAt = lead.contactedAt || now;
      lead.responseMs = lead.responseMs || Math.max(0, lead.contactedAt - (lead.receivedAt || now));
    } else if (nextStatus === "passed") {
      lead.passCount = Math.max(lead.passCount || 0, 1);
    }
  }

  return previousVisualStatus !== getLeadVisualStatus(lead);
}

function normalizeAgentActive(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (["inactive", "tidak aktif", "false", "0", "off", "disabled", "no", "tidak"].includes(normalized)) {
    return false;
  }
  return true;
}

function normalizeAgentRole(value) {
  return String(value || "").trim().toLowerCase() === "admin" ? "admin" : "agent";
}

function pickInputValue(input, keys) {
  for (const key of keys) {
    if (input?.[key] !== undefined && input[key] !== null && String(input[key]).trim() !== "") {
      return input[key];
    }
  }
  return "";
}

function readLeadRuntimeFromSheet(input) {
  const assignedAgentId = String(
    pickInputValue(input, ["assigned_agent_id", "assignedAgentId", "assigned_agent", "agent_id"]),
  ).trim();
  const queueState = String(
    pickInputValue(input, ["queue_state", "queueState", "runtime_state", "runtimeState"]),
  )
    .trim()
    .toLowerCase();
  const receivedRaw = pickInputValue(input, ["received_at", "receivedAt", "assigned_at", "assignedAt"]);
  const expiresRaw = pickInputValue(input, ["expires_at", "expiresAt"]);
  const passCountRaw = pickInputValue(input, ["pass_count", "passCount", "rotation_count", "rotationCount"]);
  const hasRuntime = Boolean(assignedAgentId || queueState || receivedRaw || expiresRaw || passCountRaw);

  return {
    hasRuntime,
    assignedAgentId,
    queueState,
    receivedAt: receivedRaw ? parseLeadTimestamp(receivedRaw, null) : null,
    expiresAt: expiresRaw ? parseLeadTimestamp(expiresRaw, null) : null,
    passCount: passCountRaw === "" ? null : Number(passCountRaw) || 0,
  };
}

function applyLeadRuntimeFromSheet(lead, runtime, now = Date.now()) {
  if (!runtime?.hasRuntime || !isActiveLeadStatus(lead.status)) return false;

  const before = JSON.stringify({
    status: lead.status,
    assignedAgentId: lead.assignedAgentId,
    receivedAt: lead.receivedAt,
    expiresAt: lead.expiresAt,
    queuedAt: lead.queuedAt,
    passCount: lead.passCount,
  });

  if (runtime.queueState === "queued") {
    queueLead(lead, runtime.receivedAt || lead.queuedAt || now, {
      resetPassCount: false,
      previousAgentId: lead.lastAgentId || lead.assignedAgentId || null,
    });
    if (runtime.passCount !== null) lead.passCount = runtime.passCount;
  } else if (runtime.assignedAgentId) {
    lead.status = "new";
    lead.assignedAgentId = runtime.assignedAgentId;
    lead.receivedAt = runtime.receivedAt || lead.receivedAt || now;
    lead.expiresAt = runtime.expiresAt || lead.expiresAt || lead.receivedAt + RESPONSE_WINDOW_MS;
    lead.queuedAt = null;
    lead.lastAgentId = null;
    if (runtime.passCount !== null) lead.passCount = runtime.passCount;
  }

  const after = JSON.stringify({
    status: lead.status,
    assignedAgentId: lead.assignedAgentId,
    receivedAt: lead.receivedAt,
    expiresAt: lead.expiresAt,
    queuedAt: lead.queuedAt,
    passCount: lead.passCount,
  });
  return before !== after;
}

function normalizeSheetAgent(input) {
  if (!input) return null;
  const email = String(input.email || input.emel || input.email_address || "").trim().toLowerCase();
  const name = String(input.name || input.nama || input.full_name || "").trim();
  if (!name || !email) return null;

  return {
    id: String(input.id || input.user_id || input.agent_id || "").trim(),
    name,
    phone: String(input.phone || input.phone_number || input.mobile || input.telefon || "").trim(),
    email,
    role: normalizeAgentRole(input.role || input.peranan),
    active: normalizeAgentActive(input.active ?? input.status ?? input.aktif),
    leadsHandled: Number(input.leads_handled ?? input.leadsHandled ?? 0) || 0,
    password: String(input.password || input.kata_laluan || input.temporary_password || "").trim(),
    createdAt: input.created_at || input.createdAt ? new Date(input.created_at || input.createdAt).getTime() : null,
  };
}

function sheetDedupeKey(input) {
  const sourceId = String(input.id || input.lead_id || "").trim();
  if (sourceId) return sourceId;
  const phone = input.phone || input.phone_number || input.mobile || "";
  const project =
    input.project ||
    input.projek ||
    input.project_name ||
    input.projectName ||
    input.campaign_name ||
    "Tidak dinyatakan";
  return `${normalizePhone(phone)}-${String(project).trim()}-${input.created_at || input.createdAt || ""}`;
}

async function addLead(input, options = {}) {
  const name = String(input.name || input.full_name || input.fullName || "").trim();
  const phone = String(input.phone || input.phone_number || input.mobile || "").trim();
  const email = String(input.email || input.email_address || input.emailAddress || "").trim();
  const project = String(
    input.project ||
      input.projek ||
      input.project_name ||
      input.projectName ||
      input.campaign_name ||
      "Tidak dinyatakan",
  ).trim();
  if (!name || !phone) return false;

  const dedupeKey = sheetDedupeKey(input);
  const existingLead = state.leads.find((lead) => lead.dedupeKey === dedupeKey);
  const source = normalizeLeadSource(input.source || input.sumber || input.platform, options.source || "Manual Lead");
  const createdAtValue = input.created_at || input.createdAt;
  const parsedCreatedAt = parseLeadTimestamp(createdAtValue, existingLead?.createdAt || Date.now());
  const sheetRuntime = readLeadRuntimeFromSheet(input);

  if (existingLead) {
    if (!options.updateExisting) return false;

    let changed = false;
    const updates = { name, phone, email, project, source, createdAt: parsedCreatedAt };
    Object.entries(updates).forEach(([key, value]) => {
      if (existingLead[key] !== value) {
        existingLead[key] = value;
        changed = true;
      }
    });

    if (applySheetStatusToLead(existingLead, input.status)) changed = true;
    if (applyLeadRuntimeFromSheet(existingLead, sheetRuntime)) changed = true;

    if (!changed) return false;
    saveState();
    try {
      await persistLead(existingLead);
    } catch (error) {
      showToast("Lead tidak dapat dikemas kini", "Semak sambungan Google Sheet dan cuba lagi.", "error");
      console.error(error);
      return false;
    }
    return "updated";
  }

  const initialStatus = normalizeSheetStatus(input.status);
  const now = Date.now();
  if (options.queueIfBlocked) activateQueuedLeads({ now, notify: options.notify });
  const hasSheetAssignment = Boolean(sheetRuntime.assignedAgentId || sheetRuntime.queueState === "queued");
  const shouldDistribute = initialStatus === "new";
  const assignedAgent =
    !shouldDistribute || hasSheetAssignment ? null : selectNextAvailableAgent();
  const shouldQueue =
    sheetRuntime.queueState === "queued" ||
    (options.queueIfBlocked && shouldDistribute && !assignedAgent && !sheetRuntime.assignedAgentId);
  if (!assignedAgent && !shouldQueue && shouldDistribute && !sheetRuntime.assignedAgentId) {
    showToast("Tiada ejen aktif", "Aktifkan sekurang-kurangnya seorang ejen dahulu.", "error");
    return false;
  }

  const initialPassCount = initialStatus === "passed" ? 1 : 0;
  const lead = {
    id: crypto.randomUUID?.() || makeId("lead"),
    dedupeKey,
    name,
    phone,
    email,
    project,
    source,
    createdAt: Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : now,
    receivedAt: shouldDistribute && !shouldQueue ? now : null,
    assignedAgentId: assignedAgent?.id || null,
    expiresAt: shouldDistribute && !shouldQueue ? now + RESPONSE_WINDOW_MS : null,
    status: shouldQueue ? "queued" : initialStatus,
    passCount: initialPassCount,
    responseMs: initialStatus === "contacted" ? 0 : null,
    contactedAt: initialStatus === "contacted" ? now : null,
    queuedAt: shouldQueue ? now : null,
    notes: "",
  };
  applyLeadRuntimeFromSheet(lead, sheetRuntime, now);

  state.leads.unshift(lead);
  saveState();
  try {
    await persistNewLead(lead);
  } catch (error) {
    state.leads = state.leads.filter((item) => item.id !== lead.id);
    saveState();
    showToast("Lead tidak dapat disimpan", "Semak sambungan Google Sheet dan cuba lagi.", "error");
    console.error(error);
    return false;
  }
  syncLeadRuntimeInSheet(lead);
  if (shouldQueue) {
    addActivity("new", lead, `${lead.project} disimpan dalam queue menunggu lead aktif selesai`);
  } else {
    addActivity("new", lead, `${lead.project} diberikan kepada ${assignedAgent?.name || "ejen"}`);
  }
  saveState();

  if (!options.silent) {
    showToast(
      shouldQueue ? "Lead disimpan dalam queue" : "Lead baru masuk",
      shouldQueue
        ? `${lead.name} akan dihantar selepas lead aktif selesai.`
        : `${lead.name} telah diberikan kepada ${assignedAgent?.name || "ejen"}.`,
    );
  }
  if (!shouldQueue && (!options.silent || options.notify)) sendSystemNotification(lead);
  return "added";
}

function openManualLeadModal() {
  if (!isAdmin()) {
    showToast("Admin sahaja", "Hanya admin boleh tambah manual lead baru.", "error");
    return;
  }
  elements.manualLeadForm.reset();
  elements.manualLeadSource.value = "Manual Lead";
  elements.manualLeadError.textContent = "";
  elements.manualLeadModal.classList.add("open");
  elements.manualLeadModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.manualLeadName.focus(), 100);
}

async function addManualLead(event) {
  event.preventDefault();
  if (!isAdmin()) {
    elements.manualLeadError.textContent = "Hanya admin boleh tambah manual lead baru.";
    return;
  }
  const name = elements.manualLeadName.value.trim();
  const phone = elements.manualLeadPhone.value.trim();
  const email = elements.manualLeadEmail.value.trim();
  const project = elements.manualLeadProject.value.trim();
  const source = elements.manualLeadSource.value;

  if (!name || !phone || !project) {
    elements.manualLeadError.textContent = "Masukkan nama, nombor telefon dan projek.";
    return;
  }

  const createdAt = formatSheetTimestamp();
  const leadInput = {
    id: `manual-${Date.now()}-${normalizePhone(phone)}`,
    name,
    phone,
    email,
    project,
    source,
    city: "",
    created_at: createdAt,
    status: "new",
  };

  const pushedToSheet = await pushManualLeadToSheet(leadInput);
  if (!pushedToSheet) {
    elements.manualLeadError.textContent = "Google Sheet belum dapat dikemas kini. Semak Web App URL.";
    return;
  }

  const result = await addLead(leadInput, { silent: true, updateExisting: true, notify: true, queueIfBlocked: true });
  if (!result) {
    elements.manualLeadError.textContent = "Lead sudah masuk Google Sheet, tetapi dashboard belum dapat sync. Semak ejen aktif.";
    return;
  }

  closeModal(elements.manualLeadModal);
  showToast("Manual lead disimpan", "Google Sheet dan dashboard telah diselaraskan.", "success");
  renderAll();
}

async function pushManualLeadToSheet(leadInput) {
  const endpoint = getSheetEndpoint();
  if (!endpoint) return false;

  const payload = {
    action: "add_lead",
    lead: {
      id: leadInput.id,
      created_at: leadInput.created_at,
      name: leadInput.name,
      phone: leadInput.phone,
      email: leadInput.email || "",
      city: leadInput.city || "",
      project: leadInput.project,
      status: leadInput.status || "new",
      source: leadInput.source || "Manual Lead",
    },
  };
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        endpoint,
        new Blob([body], { type: "text/plain;charset=UTF-8" }),
      );
      if (queued) {
        state.integration.connected = true;
        state.integration.lastSyncAt = Date.now();
        saveState();
        return true;
      }
    }

    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
      keepalive: true,
    });
    state.integration.connected = true;
    state.integration.lastSyncAt = Date.now();
    saveState();
    return true;
  } catch (error) {
    console.error("Manual lead push failed", error);
    return false;
  }
}

async function deleteLeadFromSheet(lead) {
  const endpoint = getSheetEndpoint();
  if (!endpoint) return false;

  const payload = {
    action: "delete_lead",
    lead: {
      id: lead.dedupeKey || lead.id,
      phone: lead.phone,
      project: lead.project,
      name: lead.name,
    },
  };
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        endpoint,
        new Blob([body], { type: "text/plain;charset=UTF-8" }),
      );
      if (queued) {
        state.integration.connected = true;
        state.integration.lastSyncAt = Date.now();
        saveState();
        return true;
      }
    }

    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
      keepalive: true,
    });
    state.integration.connected = true;
    state.integration.lastSyncAt = Date.now();
    saveState();
    return true;
  } catch (error) {
    console.error("Lead sheet delete failed", error);
    return false;
  }
}

async function postGoogleSheetAction(payload, errorLabel) {
  const endpoint = getSheetEndpoint();
  if (!endpoint) return false;

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        endpoint,
        new Blob([body], { type: "text/plain;charset=UTF-8" }),
      );
      if (queued) {
        state.integration.connected = true;
        state.integration.lastSyncAt = Date.now();
        saveState();
        return true;
      }
    }

    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
      keepalive: true,
    });
    state.integration.connected = true;
    state.integration.lastSyncAt = Date.now();
    saveState();
    return true;
  } catch (error) {
    console.error(errorLabel, error);
    return false;
  }
}

async function updateLeadStatusInSheet(lead, status) {
  if (!lead) return false;
  const sheetStatus = formatSheetStatus(normalizeSheetStatus(status));
  return postGoogleSheetAction(
    {
      action: "update_lead_status",
      lead: {
        id: lead.dedupeKey || lead.id,
        phone: lead.phone,
        project: lead.project,
        name: lead.name,
        status: sheetStatus,
      },
    },
    "Lead sheet status update failed",
  );
}

function leadRuntimePayload(lead) {
  const assignedAgent = getAgent(lead.assignedAgentId);
  return {
    id: lead.dedupeKey || lead.id,
    phone: lead.phone,
    project: lead.project,
    name: lead.name,
    assigned_agent_id: lead.assignedAgentId || "",
    assigned_agent_email: assignedAgent?.email || "",
    assigned_agent_name: assignedAgent?.name || "",
    received_at: lead.receivedAt ? formatSheetTimestamp(lead.receivedAt) : "",
    expires_at: lead.expiresAt ? formatSheetTimestamp(lead.expiresAt) : "",
    queue_state: lead.status === "queued" ? "queued" : lead.status === "new" ? "active" : lead.status || "",
    pass_count: lead.passCount || 0,
  };
}

async function updateLeadRuntimeInSheet(lead) {
  if (!lead) return false;
  return postGoogleSheetAction(
    {
      action: "update_lead_runtime",
      lead: leadRuntimePayload(lead),
    },
    "Lead sheet runtime update failed",
  );
}

function syncLeadRuntimeInSheet(lead) {
  updateLeadRuntimeInSheet(lead).catch((error) => console.error("Lead runtime sync failed", error));
}

function agentSheetPayload(agent) {
  return {
    id: agent.id,
    name: agent.name,
    phone: agent.phone || "",
    email: agent.email,
    role: agent.role || "agent",
    active: agent.active ? "active" : "inactive",
    leadsHandled: agent.leadsHandled || 0,
    password: agent.password || "",
    created_at: agent.createdAt ? new Date(agent.createdAt).toISOString() : new Date().toISOString(),
  };
}

async function upsertAgentToSheet(agent) {
  if (!agent?.name || !agent?.email) return false;
  return postGoogleSheetAction(
    {
      action: "add_agent",
      agent: agentSheetPayload(agent),
    },
    "Agent sheet upsert failed",
  );
}

async function deleteAgentFromSheet(agent) {
  if (!agent?.id && !agent?.email) return false;
  return postGoogleSheetAction(
    {
      action: "delete_agent",
      agent: {
        id: agent.id,
        email: agent.email,
      },
    },
    "Agent sheet delete failed",
  );
}

function recalculateLeadHandledCounts() {
  const handledCounts = new Map();
  state.leads.forEach((lead) => {
    if (isActiveLeadStatus(lead.status) || !lead.assignedAgentId) return;
    handledCounts.set(lead.assignedAgentId, (handledCounts.get(lead.assignedAgentId) || 0) + 1);
  });

  const changedAgents = [];
  state.agents.forEach((agent) => {
    const nextCount = handledCounts.get(agent.id) || 0;
    if ((agent.leadsHandled || 0) !== nextCount) {
      agent.leadsHandled = nextCount;
      changedAgents.push(agent);
    }
  });
  return changedAgents;
}

async function syncLeadHandledCountsToSheet() {
  const changedAgents = recalculateLeadHandledCounts();
  if (!changedAgents.length) return { updated: 0, pushed: 0 };

  saveState();
  const results = await Promise.all(changedAgents.map((agent) => upsertAgentToSheet(agent)));
  return {
    updated: changedAgents.length,
    pushed: results.filter(Boolean).length,
  };
}

async function syncAgentsFromSheet(sheetAgentRows) {
  const result = { added: 0, updated: 0, removed: 0, backfilled: 0, skipped: 0 };
  if (!Array.isArray(sheetAgentRows)) return result;

  const sheetAgents = sheetAgentRows.map(normalizeSheetAgent).filter(Boolean);
  if (!sheetAgents.length) {
    result.skipped += 1;
    return result;
  }

  const sheetEmails = new Set(sheetAgents.map((agent) => agent.email));
  let reloadRemote = false;

  for (const sheetAgent of sheetAgents) {
    const existingAgent = state.agents.find((agent) => {
      const emailMatches = agent.email?.toLowerCase() === sheetAgent.email;
      return (sheetAgent.id && agent.id === sheetAgent.id) || emailMatches;
    });

    if (existingAgent) {
      const nextActive =
        existingAgent.id === state.currentUserId && existingAgent.role === "admin" ? true : sheetAgent.active;
      const updates = {
        name: sheetAgent.name,
        phone: sheetAgent.phone,
        email: sheetAgent.email,
        active: nextActive,
        leadsHandled: sheetAgent.leadsHandled,
      };
      if (sheetAgent.password.length >= 8) {
        updates.password = sheetAgent.password;
      }
      const needsPasswordBackfill = !sheetAgent.password && Boolean(existingAgent.password);
      const changed = Object.entries(updates).some(([key, value]) => existingAgent[key] !== value);
      if (changed) {
        Object.assign(existingAgent, updates);
        await persistProfile(existingAgent);
        result.updated += 1;
      }
      if (!sheetAgent.id || needsPasswordBackfill) result.backfilled += 1;
      continue;
    }

    if (sheetAgent.role === "admin") {
      result.skipped += 1;
      continue;
    }

    state.agents.push({
      id: sheetAgent.id || makeId("agent"),
      name: sheetAgent.name,
      phone: sheetAgent.phone,
      email: sheetAgent.email,
      password: sheetAgent.password.length >= 8 ? sheetAgent.password : DEFAULT_AGENT_PASSWORD,
      role: "agent",
      active: sheetAgent.active,
      leadsHandled: sheetAgent.leadsHandled,
    });
    result.added += 1;
    result.backfilled += sheetAgent.id && sheetAgent.password ? 0 : 1;
  }

  const removedAgents = state.agents.filter(
    (agent) =>
      agent.role === "agent" &&
      agent.id !== state.currentUserId &&
      !sheetEmails.has(String(agent.email || "").toLowerCase()),
  );

  for (const agent of removedAgents) {
    state.agents = state.agents.filter((item) => item.id !== agent.id);
    result.removed += 1;
  }

  if (removedAgents.length) {
    const removedAgentIds = new Set(removedAgents.map((agent) => agent.id));
    const now = Date.now();
    const reassignedLeads = [];
    state.leads.forEach((lead) => {
      if (lead.status !== "new" || !removedAgentIds.has(lead.assignedAgentId)) return;
      queueLead(lead, now, {
        previousAgentId: lead.assignedAgentId,
        resetPassCount: false,
      });
      reassignedLeads.push(lead);
    });
    const activatedLeads = activateQueuedLeads({ now, notify: true });
    [...reassignedLeads, ...activatedLeads].forEach(syncLeadRuntimeInSheet);
  }

  saveState();
  if (remoteDatabaseMode && reloadRemote) {
    await loadRemoteState(state.currentUserId);
    for (const sheetAgent of sheetAgents) {
      const savedAgent = state.agents.find((agent) => agent.email?.toLowerCase() === sheetAgent.email);
      if (!savedAgent) continue;
      const nextActive =
        savedAgent.id === state.currentUserId && savedAgent.role === "admin" ? true : sheetAgent.active;
      if (savedAgent.active !== nextActive) {
        savedAgent.active = nextActive;
        await persistProfile(savedAgent);
      }
    }
  }

  if (isAdmin() && result.backfilled) {
    for (const sheetAgent of sheetAgents) {
      const savedAgent = state.agents.find((agent) => agent.email?.toLowerCase() === sheetAgent.email);
      if (savedAgent) await upsertAgentToSheet(savedAgent);
    }
  }

  return result;
}

async function sendSystemNotification(lead, options = {}) {
  if (!options.force && !shouldNotifyForLead(lead)) return;
  const key = leadNotificationKey(lead);
  if (!options.force && notifiedLeadKeys.has(key)) return;

  markLeadNotificationSeen(lead);
  saveNotifiedLeadKeys();
  if (options.toast) {
    showToast("Lead baru masuk", `${lead.name} menunggu tindakan dalam 5 minit.`);
  }
  await playNotificationSound();

  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const agent = getAgent(lead.assignedAgentId);
  const title = `Lead baru: ${lead.project || "Projek baru"}`;
  const notificationOptions = {
    body: `${lead.name}\nNombor dibuka selepas CALL NOW. Diberikan kepada ${agent?.name || "ejen"}.`,
    tag: key,
    renotify: true,
    requireInteraction: true,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    data: {
      leadId: lead.id,
      url: getNotificationStartUrl(),
    },
  };

  try {
    const registration = await registerServiceWorker();
    if (registration?.showNotification) {
      await registration.showNotification(title, notificationOptions);
      return;
    }
  } catch (error) {
    console.warn("Service worker notification failed", error);
  }

  try {
    const notification = new Notification(title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      switchView("dashboard");
      notification.close();
    };
  } catch (error) {
    console.warn("Browser notification failed", error);
  }
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("Tidak disokong", "Pelayar ini tidak menyokong notifikasi sistem.", "error");
    return;
  }
  await registerServiceWorker();
  await playNotificationSound();
  if (Notification.permission === "granted") {
    showToast("Notifikasi aktif", "Lead baru akan keluar notifikasi sistem dan bunyi dalam app.");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") await playNotificationSound();
  showToast(
    permission === "granted" ? "Notifikasi diaktifkan" : "Notifikasi belum aktif",
    permission === "granted"
      ? "Lead baru akan muncul sebagai notifikasi sistem dan bunyi dalam app."
      : "Benarkan notifikasi melalui tetapan pelayar untuk mengaktifkannya.",
    permission === "granted" ? "success" : "error",
  );
}

async function processExpiredLeads() {
  const now = Date.now();
  let changed = false;
  const expiredLeads = state.leads.filter((lead) => lead.status === "new" && lead.expiresAt <= now);
  expiredLeads.forEach((lead) => {
    const previousAgent = getAgent(lead.assignedAgentId);
    lead.passCount = (lead.passCount || 0) + 1;
    queueLead(lead, now, {
      previousAgentId: previousAgent?.id || null,
      resetPassCount: false,
    });
    addActivity(
      "passed",
      lead,
      `Masa ${previousAgent?.name || "ejen"} tamat, ${lead.project} masuk queue semula`,
    );
    updateLeadStatusInSheet(lead, "New");
    syncLeadRuntimeInSheet(lead);
    changed = true;
  });

  const activatedLeads = activateQueuedLeads({ now, notify: true });
  if (activatedLeads.length) changed = true;

  if (changed) {
    saveState();
    renderAll();
  }
}

function setCallButtonLoading(leadId, isLoading) {
  const article = elements.activeLeadContainer.querySelector(".lead-alert");
  if (!article || article.dataset.leadId !== leadId) return;
  const button = article.querySelector(".call-button");
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  const label = button.querySelector(".call-button-copy b");
  if (label) label.textContent = isLoading ? "CALLING..." : "CALL NOW";
}

function dialLeadPhone(phone) {
  const callablePhone = String(phone || "").replace(/[^\d+]/g, "");
  if (!callablePhone) return false;

  const link = document.createElement("a");
  link.href = `tel:${callablePhone}`;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.location.href = `tel:${callablePhone}`;
  return true;
}

async function handleCall(leadId) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead || lead.status !== "new") {
    showToast("Lead tidak tersedia", "Lead ini sudah diambil, tamat masa atau telah dikemas kini.", "error");
    return;
  }
  if (!canAccessLead(lead)) {
    showToast("Lead bukan giliran anda", "Lead ini telah diberikan kepada ejen lain.", "error");
    return;
  }
  if (claimingLeadId) return;

  claimingLeadId = leadId;
  setCallButtonLoading(leadId, true);

  try {
    let claimedLead = lead;
    let phoneToCall = lead.phone;

    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.rpc("claim_lead", { p_lead_id: leadId });
      if (error) throw error;
      if (!data?.length) {
        showToast("Lead tidak dapat dikunci", "Lead mungkin telah dipindahkan, tamat masa atau diambil ejen lain.", "error");
        await loadRemoteState(state.currentUserId);
        renderAll();
        return;
      }
      claimedLead = mapLead(data[0]);
      phoneToCall = claimedLead.phone;
      const currentLead = state.leads.find((item) => item.id === leadId);
      if (currentLead) Object.assign(currentLead, claimedLead);
    } else {
      lead.status = "contacted";
      lead.contactedAt = Date.now();
      lead.responseMs = lead.contactedAt - lead.receivedAt;
      lead.statusLockedUntil = Date.now() + 2 * 60 * 1000;
      const localAgent = getAgent(lead.assignedAgentId);
      if (localAgent) localAgent.leadsHandled = (localAgent.leadsHandled || 0) + 1;
      addActivity("contacted", lead, `${localAgent?.name || "Ejen"} CALL NOW untuk ${lead.project}`);
    }

    const agent = getAgent((claimedLead || lead).assignedAgentId);
    saveState();
    await updateLeadStatusInSheet(claimedLead || lead, "Contacted");
    await updateLeadRuntimeInSheet(claimedLead || lead);
    if (agent) await upsertAgentToSheet(agent);
    activateQueuedLeads({ notify: true });
    saveState();
    showToast(
      "Lead berjaya dikunci",
      `${lead.name} untuk projek ${lead.project} kini milik ${agent?.name || "ejen ini"}.`,
    );
    renderAll();

    if (!dialLeadPhone(phoneToCall)) {
      showToast("Nombor telefon tiada", "Lead ini belum ada nombor telefon yang boleh dipanggil.", "error");
    }
  } catch (error) {
    console.error(error);
    showToast("CALL NOW gagal", error?.message || "Semak sambungan Google Sheet dan cuba lagi.", "error");
    if (remoteDatabaseMode) {
      await loadRemoteState(state.currentUserId);
      renderAll();
    }
  } finally {
    claimingLeadId = null;
    setCallButtonLoading(leadId, false);
  }
}

function getVisibleActiveLead() {
  const newLeads = state.leads
    .filter((lead) => lead.status === "new")
    .sort((a, b) => a.expiresAt - b.expiresAt);
  if (isAdmin()) return newLeads[0] || null;
  return newLeads.find((lead) => lead.assignedAgentId === state.currentUserId) || null;
}

function canViewLeadPhone(lead) {
  if (isActiveLeadStatus(lead.status)) return false;
  return isAdmin() || lead.assignedAgentId === state.currentUserId;
}

function displayLeadPhone(lead) {
  return canViewLeadPhone(lead) && lead.phone ? lead.phone : "•••• •••• ••••";
}

function renderActiveLead() {
  const lead = getVisibleActiveLead();
  const newLeadCount = state.leads.filter(isPendingLead).length;
  elements.queueLabel.textContent = `${newLeadCount} lead menunggu`;
  elements.navLeadCount.textContent = newLeadCount;
  elements.notificationCount.textContent = newLeadCount;
  elements.notificationCount.style.display = newLeadCount ? "grid" : "none";

  if (!lead) {
    lastRenderedActiveLeadKey = null;
    elements.activeLeadContainer.innerHTML = `
      <div class="empty-lead">
        <div>
          <span class="empty-lead-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6"></path>
            </svg>
          </span>
          <h3>Tiada lead menunggu tindakan</h3>
          <p>Lead baru daripada Google Sheet akan muncul di sini secara automatik.</p>
        </div>
      </div>`;
    return;
  }

  const activeLeadKey = `${lead.id}:${lead.assignedAgentId}:${lead.name}:${lead.project}:${lead.source}`;
  if (lastRenderedActiveLeadKey !== activeLeadKey) {
    const fragment = elements.activeLeadTemplate.content.cloneNode(true);
    const article = fragment.querySelector(".lead-alert");
    const source = fragment.querySelector(".lead-source-badge");
    source.textContent = lead.source;
    const leadSource = lead.source.toLowerCase();
    source.classList.toggle("tiktok", leadSource.includes("tiktok"));
    source.classList.toggle("manual", leadSource.includes("manual"));
    source.classList.toggle("meta", leadSource.includes("meta"));
    fragment.querySelector(".lead-arrival").textContent = `Masuk ${relativeTime(lead.receivedAt)}`;
    fragment.querySelector(".lead-avatar").textContent = initials(lead.name);
    fragment.querySelector(".lead-name").textContent = lead.name;
    fragment.querySelector(".lead-project").textContent = lead.project || "Tidak dinyatakan";
    fragment.querySelector(".lead-phone").textContent = "•••• •••• ••••";
    fragment.querySelector(".call-project").textContent = lead.project || "Tidak dinyatakan";
    fragment.querySelector(".assigned-agent").textContent =
      `Assigned: ${getAgent(lead.assignedAgentId)?.name || "Tiada"}`;
    fragment.querySelector(".call-button").addEventListener("click", () => handleCall(lead.id));
    article.dataset.leadId = lead.id;
    elements.activeLeadContainer.replaceChildren(fragment);
    lastRenderedActiveLeadKey = activeLeadKey;
  }

  updateCountdown();
}

function updateCountdown() {
  const lead = getVisibleActiveLead();
  const article = elements.activeLeadContainer.querySelector(".lead-alert");
  if (!lead || !article || article.dataset.leadId !== lead.id) return;

  const remaining = Math.max(0, lead.expiresAt - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  article.querySelector(".countdown-short").textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
  article.querySelector(".countdown-full").textContent = formatted;
  article.querySelector(".lead-arrival").textContent = `Masuk ${relativeTime(lead.receivedAt)}`;
  const progress = Math.min(1, remaining / RESPONSE_WINDOW_MS);
  article.querySelector(".ring-progress").style.strokeDashoffset = String(106.8 * (1 - progress));
}

function renderStats() {
  const today = todayKey();
  const todayLeads = state.leads.filter((lead) => todayKey(lead.createdAt || lead.receivedAt) === today);
  const contacted = todayLeads.filter((lead) => lead.status === "contacted");
  const responseValues = contacted.map((lead) => lead.responseMs).filter(Number.isFinite);
  const averageResponse = responseValues.length
    ? responseValues.reduce((total, value) => total + value, 0) / responseValues.length
    : null;

  elements.statToday.textContent = todayLeads.length;
  elements.statContacted.textContent = contacted.length;
  elements.contactRate.textContent = todayLeads.length
    ? `${Math.round((contacted.length / todayLeads.length) * 100)}%`
    : "0%";
  elements.statResponse.textContent = averageResponse
    ? `${Math.floor(averageResponse / 60000)}m ${Math.floor((averageResponse % 60000) / 1000)}s`
    : "--";
  elements.statConversion.textContent = todayLeads.length
    ? `${Math.round((contacted.length / todayLeads.length) * 100)}%`
    : "0%";
}

function renderActivities() {
  const activities = state.activities.slice(0, 5);
  elements.activityList.innerHTML = activities.length
    ? activities
        .map(
          (activity) => `
            <div class="activity-item">
              <span class="activity-icon ${activity.type}">${activity.type === "contacted" ? "CALL" : activity.type === "passed" ? "PASS" : "NEW"}</span>
              <span class="activity-copy">
                <strong>${escapeHtml(activity.leadName)}</strong>
                <small>${escapeHtml(activity.message)}</small>
              </span>
              <span class="activity-time">${relativeTime(activity.createdAt)}</span>
            </div>`,
        )
        .join("")
    : `
        <div class="table-empty">
          Aktiviti lead akan direkodkan di sini.
        </div>`;
}

function renderTeam() {
  const activeAgents = getActiveAgents();
  elements.onlineCount.textContent = `${activeAgents.length} online`;
  elements.teamList.innerHTML = state.agents
    .filter((agent) => agent.role === "agent")
    .map(
      (agent, index) => `
        <div class="team-member">
          <span class="member-avatar">${initials(agent.name)}</span>
          <span>
            <strong>${escapeHtml(agent.name)}</strong>
            <small>${agent.active ? `Giliran #${activeAgents.findIndex((item) => item.id === agent.id) + 1}` : "Tidak menerima lead"}</small>
          </span>
          <span class="member-state ${agent.active ? "" : "offline"}" title="${agent.active ? "Aktif" : "Tidak aktif"}"></span>
        </div>`,
    )
    .join("");
}

function renderLeadsTable() {
  const search = elements.leadSearch.value.trim().toLowerCase();
  const filter = elements.leadFilter.value;
  const rows = state.leads
    .filter((lead) => {
      if (!isAdmin() && lead.assignedAgentId !== state.currentUserId) return false;
      const matchesSearch =
        lead.name.toLowerCase().includes(search) ||
        displayLeadPhone(lead).toLowerCase().includes(search) ||
        String(lead.email || "").toLowerCase().includes(search) ||
        String(lead.project || "").toLowerCase().includes(search) ||
        String(lead.source || "").toLowerCase().includes(search) ||
        formatSheetStatus(getLeadVisualStatus(lead)).toLowerCase().includes(search) ||
        String(lead.notes || "").toLowerCase().includes(search);
      const visualStatus = getLeadVisualStatus(lead);
      return matchesSearch && (filter === "all" || visualStatus === filter);
    })
    .sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));

  if (elements.leadLogCount) {
    elements.leadLogCount.textContent = `${rows.length} lead`;
  }
  elements.leadsTableBody.innerHTML = rows.length
    ? rows
        .map((lead) => {
          const visualStatus = getLeadVisualStatus(lead);
          const statusOptions = renderLeadStatusOptions(visualStatus);
          const contactedTime = lead.contactedAt ? `<small>Dihubungi ${formatDateTime(lead.contactedAt)}</small>` : "";
          const whatsappUrl = canViewLeadPhone(lead) ? whatsappLeadUrl(lead.phone) : "";
          const whatsappButton = whatsappUrl
            ? `<a class="contact-edit-button whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener">WhatsApp</a>`
            : "";
          const leadContactActions = whatsappButton
            ? `<span class="lead-contact-actions">${whatsappButton}</span>`
            : "";
          const editButton = canViewLeadPhone(lead)
            ? `<button class="contact-edit-button" type="button" data-lead-edit="${lead.id}">Edit</button>`
            : "";
          const deleteButton = isAdmin()
            ? `<button class="contact-edit-button danger" type="button" data-lead-delete="${lead.id}">Padam</button>`
            : "";
          const actionButtons = [editButton, deleteButton].filter(Boolean).join("");
          const assignedAgentLabel = lead.assignedAgentId
            ? getAgent(lead.assignedAgentId)?.name || "Tiada ejen"
            : "Belum diagih";
          const activeTime = lead.receivedAt
            ? `<small>Aktif ${formatDateTime(lead.receivedAt)}</small>`
            : "<small>Menunggu giliran</small>";
          return `
            <tr data-lead-row="${lead.id}">
              <td data-label="Lead">
                <strong>${escapeHtml(lead.name)}</strong>
                <small>${escapeHtml(displayLeadPhone(lead))}</small>
                <small>${canViewLeadPhone(lead) && lead.email ? escapeHtml(lead.email) : "Emel dibuka selepas CALL NOW"}</small>
                ${leadContactActions}
              </td>
              <td data-label="Projek / Sumber">
                <strong>${escapeHtml(lead.project || "Tidak dinyatakan")}</strong>
                <small>${escapeHtml(lead.source)}</small>
              </td>
              <td data-label="Ejen">${escapeHtml(assignedAgentLabel)}</td>
              <td data-label="Masa"><strong>Tarikh ${formatDateTime(lead.createdAt || lead.receivedAt)}</strong>${activeTime}${contactedTime}</td>
              <td data-label="Status">
                <select
                  class="lead-status-select ${visualStatus}"
                  data-lead-status="${lead.id}"
                  aria-label="Status ${escapeHtml(lead.name)}"
                >
                  ${statusOptions}
                </select>
              </td>
              <td class="lead-note-cell" data-label="Nota">
                <textarea
                  class="lead-note-field"
                  data-lead-note="${lead.id}"
                  rows="3"
                  placeholder="Tambah nota follow-up, minat projek, bajet atau temujanji"
                >${escapeHtml(lead.notes || "")}</textarea>
                <div class="lead-note-actions">
                  <button class="lead-note-save" type="button" data-lead-note-save="${lead.id}">Simpan nota</button>
                </div>
              </td>
              <td data-label="Tindakan"><span class="lead-actions">${actionButtons || "-"}</span></td>
            </tr>`;
        })
        .join("")
    : `<tr><td class="table-empty" colspan="7">Tiada lead ditemui.</td></tr>`;
}

function renderAgents() {
  elements.agentsGrid.innerHTML = state.agents
    .map(
      (agent) => {
        const isPendingAgent = agent.role === "agent" && !agent.active;
        const roleLabel = agent.role === "admin" ? "Administrator" : isPendingAgent ? "Menunggu approval" : "Property Agent";
        const actionButtons = isPendingAgent
          ? `
            <button class="edit-agent" type="button" data-agent-edit="${agent.id}">Edit details</button>
            <button class="approve-agent" type="button" data-agent-approve="${agent.id}">Approve</button>
            <button class="reject-agent" type="button" data-agent-reject="${agent.id}">Reject</button>`
          : `
            <button class="edit-agent" type="button" data-agent-edit="${agent.id}">Edit details</button>
            <button class="edit-password" type="button" data-agent-password="${agent.id}">Edit password</button>
            ${
              agent.id !== state.currentUserId
                ? `<button class="remove-agent" type="button" data-agent-remove="${agent.id}" aria-label="Buang ${escapeHtml(agent.name)}">×</button>`
                : ""
            }`;
        return `
        <article class="agent-card ${isPendingAgent ? "pending" : ""}">
          <div class="agent-card-top">
            <span class="agent-card-avatar">${initials(agent.name)}</span>
            <span class="agent-card-name">
              <strong>${escapeHtml(agent.name)}</strong>
              <small>${roleLabel}</small>
            </span>
            ${
              isPendingAgent
                ? ""
                : `<span class="agent-status">
                    <button
                      class="switch ${agent.active ? "active" : ""}"
                      type="button"
                      data-agent-toggle="${agent.id}"
                      aria-label="${agent.active ? "Nyahaktifkan" : "Aktifkan"} ${escapeHtml(agent.name)}"
                    ></button>
                  </span>`
            }
          </div>
          <div class="agent-card-details">
            <span>Telefon <b>${escapeHtml(agent.phone)}</b></span>
            <span>Emel <b>${escapeHtml(agent.email)}</b></span>
            <span>Lead dikendalikan <b>${agent.leadsHandled || 0}</b></span>
          </div>
          <div class="agent-card-actions">
            ${actionButtons}
          </div>
        </article>`;
      },
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderUser() {
  const user = getCurrentUser();
  if (!user) return;

  elements.sidebarAvatar.textContent = initials(user.name);
  elements.sidebarUserName.textContent = user.name;
  elements.sidebarUserRole.textContent = user.role === "admin" ? "Administrator" : "Property Agent";
  elements.viewTitle.innerHTML =
    activeView === "dashboard"
      ? `Selamat datang, <span>${escapeHtml(user.name.split(" ")[0])}</span>`
      : viewTitles[activeView] || "LeadLaju";

  document.querySelectorAll(".admin-only").forEach((item) => {
    item.style.display = isAdmin() ? "flex" : "none";
  });
  if (!isAdmin() && (activeView === "agents" || activeView === "integration")) {
    switchView("dashboard");
  }
}

function renderIntegration() {
  state.integration = normalizeIntegration(state.integration);
  const integration = state.integration;
  elements.sheetEndpoint.value = integration.endpoint || DEFAULT_GOOGLE_SHEET_ENDPOINT;
  elements.pollInterval.value = String(integration.interval);
  elements.sidebarSyncText.textContent = integration.connected ? "Disambungkan" : "Belum disambungkan";
  elements.sidebarSyncStatus.textContent = integration.connected
    ? `Sync ${integration.lastSyncAt ? relativeTime(integration.lastSyncAt) : "aktif"}`
    : "Sedia menerima lead";
  elements.liveSyncLabel.textContent = integration.connected ? "Google Sheet live" : "Google Sheet belum sync";
  elements.connectionResult.classList.remove("error");
  elements.connectionResult.innerHTML = `
    <span class="status-dot"></span>
    <span>${
      integration.connected
        ? `Disambungkan${integration.lastSyncAt ? ` • sync ${relativeTime(integration.lastSyncAt)}` : ""}`
        : "Belum disambungkan. Masukkan Google Apps Script Web App URL untuk aktifkan sync."
    }</span>`;
}

function renderAll() {
  renderUser();
  renderActiveLead();
  renderStats();
  renderActivities();
  renderTeam();
  renderLeadsTable();
  renderAgents();
  renderIntegration();
}

const viewTitles = {
  leads: "Log Lead",
  agents: "Pengurusan Ejen",
  integration: "Google Sheets Sync",
};

function switchView(viewName) {
  if ((viewName === "agents" || viewName === "integration") && !isAdmin()) return;
  activeView = viewName;
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${viewName}-view`)?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  elements.todayLabel.textContent =
    viewName === "dashboard"
      ? new Intl.DateTimeFormat("ms-MY", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date())
      : "LeadLaju";
  renderUser();
  elements.sidebar.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAgentModal(agentId = null) {
  const agent = agentId ? getAgent(agentId) : null;
  editingAgentId = agent?.id || null;
  elements.agentForm.reset();
  elements.agentModalKicker.textContent = agent ? "Kemaskini ahli pasukan" : "Ahli pasukan baru";
  elements.agentModalTitle.textContent = agent ? "Edit Ejen" : "Daftar Ejen";
  elements.agentPasswordLabel.textContent = agent ? "Kata laluan baru (optional)" : "Kata laluan sementara";
  elements.agentPassword.required = !agent;
  elements.agentPassword.placeholder = agent ? "Biarkan kosong jika tidak mahu tukar" : "Minimum 8 aksara";
  elements.agentSubmitButton.textContent = agent ? "Simpan perubahan" : "Daftar ejen";
  if (agent) {
    elements.agentName.value = agent.name;
    elements.agentPhone.value = agent.phone || "";
    elements.agentEmail.value = agent.email || "";
  }
  elements.agentModal.classList.add("open");
  elements.agentModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.agentName.focus(), 100);
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

async function addAgent(event) {
  event.preventDefault();
  const name = elements.agentName.value.trim();
  const phone = elements.agentPhone.value.trim();
  const email = elements.agentEmail.value.trim();
  const password = elements.agentPassword.value;
  const editingAgent = editingAgentId ? getAgent(editingAgentId) : null;
  if (!name || !phone || !email) return;
  if (!editingAgent && password.length < 8) return;
  if (editingAgent && password && password.length < 8) {
    showToast("Password terlalu pendek", "Kata laluan mesti sekurang-kurangnya 8 aksara.", "error");
    return;
  }
  if (
    state.agents.some(
      (agent) => agent.id !== editingAgentId && agent.email.toLowerCase() === email.toLowerCase(),
    )
  ) {
    showToast("Emel telah digunakan", "Gunakan alamat emel lain untuk ejen ini.", "error");
    return;
  }

  if (editingAgent) {
    editingAgent.name = name;
    editingAgent.phone = phone;
    editingAgent.email = email.toLowerCase();
    if (password) editingAgent.password = password;
  } else {
    state.agents.push({
      id: makeId("agent"),
      name,
      phone,
      email: email.toLowerCase(),
      password,
      role: "agent",
      active: true,
      leadsHandled: 0,
      createdAt: Date.now(),
    });
  }
  saveState();
  const savedAgent = editingAgent || state.agents.find((agent) => agent.email.toLowerCase() === email.toLowerCase());
  const agentsPushed = await upsertAgentToSheet(savedAgent);
  elements.agentForm.reset();
  editingAgentId = null;
  closeModal(elements.agentModal);
  showToast(
    agentsPushed ? (editingAgent ? "Ejen dikemaskini" : "Ejen didaftarkan") : "Ejen masuk dashboard",
    agentsPushed
      ? `${name} kini diselaraskan dalam dashboard dan Google Sheet.`
      : "Google Sheet belum dapat dikemas kini. Semak Web App URL.",
    agentsPushed ? "success" : "error",
  );
  renderAll();
}

async function approveAgent(agentId) {
  const agent = getAgent(agentId);
  if (!agent || agent.active) return;
  agent.active = true;
  saveState();
  try {
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
        body: { action: "approve", userId: agentId },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || "Akaun ejen tidak dapat diapprove.");
      }
      await loadRemoteState(state.currentUserId);
    } else {
      await persistProfile(agent);
    }
  } catch (error) {
    agent.active = false;
    saveState();
    console.error(error);
    showToast("Approval gagal", error.message || "Semak sambungan Google Sheet.", "error");
    renderAll();
    return;
  }
  const approvedAgent = getAgent(agentId) || agent;
  const agentsPushed = await upsertAgentToSheet(approvedAgent);
  showToast(
    agentsPushed ? "Ejen approved" : "Ejen approved",
    agentsPushed
      ? `${approvedAgent.name} kini aktif dan telah dimasukkan ke Google Sheet.`
      : `${approvedAgent.name} kini aktif. Google Sheet belum dapat dikemas kini.`,
    agentsPushed ? "success" : "error",
  );
  renderAll();
}

async function rejectAgent(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return;
  const confirmed = window.confirm(`Reject permohonan ${agent.name}? Akaun ini akan dipadam.`);
  if (!confirmed) return;
  await removeAgent(agentId);
}

async function toggleAgent(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return;
  agent.active = !agent.active;

  if (!agent.active) {
    const assignedLeads = state.leads.filter(
      (lead) => lead.status === "new" && lead.assignedAgentId === agent.id,
    );
    assignedLeads.forEach((lead) => {
      const nextAgent = selectNextAgent(agent.id);
      if (nextAgent && nextAgent.id !== agent.id) {
        lead.assignedAgentId = nextAgent.id;
        lead.expiresAt = Date.now() + RESPONSE_WINDOW_MS;
        lead.passCount += 1;
        addActivity("passed", lead, `${agent.name} dinyahaktifkan, dipindahkan kepada ${nextAgent.name}`);
        updateLeadStatusInSheet(lead, "Passed");
      }
    });
  }
  saveState();
  try {
    await persistProfile(agent);
    await Promise.all(
      state.leads
        .filter((lead) => lead.status === "new")
        .map((lead) => persistLead(lead)),
    );
  } catch (error) {
    console.error(error);
    showToast("Perubahan belum disimpan", "Semak sambungan Google Sheet.", "error");
  }
  const agentsPushed = await upsertAgentToSheet(agent);
  showToast(
    agentsPushed ? (agent.active ? "Ejen diaktifkan" : "Ejen dinyahaktifkan") : "Status ejen belum sync",
    agentsPushed
      ? agent.active
        ? `${agent.name} akan menerima giliran lead.`
        : `${agent.name} dikeluarkan daripada giliran.`
      : "Google Sheet belum dapat dikemas kini. Semak Web App URL.",
    agentsPushed ? "success" : "error",
  );
  renderAll();
}

async function removeAgent(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return;
  if (remoteDatabaseMode) {
    const agentsPushed = await deleteAgentFromSheet(agent);
    const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
      body: { action: "delete", userId: agentId, email: agent.email },
    });
    if (error || !data?.ok) {
      showToast("Ejen tidak dapat dibuang", data?.error || "Semak sambungan Google Sheet.", "error");
      return;
    }
    await loadRemoteState(state.currentUserId);
    showToast(
      agentsPushed ? "Ejen dibuang" : "Ejen dibuang dari dashboard",
      agentsPushed
        ? `${agent.name} telah dikeluarkan daripada dashboard dan Google Sheet.`
        : "Google Sheet belum dapat dikemas kini. Semak Web App URL.",
      agentsPushed ? "success" : "error",
    );
    renderAll();
    return;
  }
  const replacement = selectNextAgent(agentId);
  state.leads
    .filter((lead) => lead.status === "new" && lead.assignedAgentId === agentId)
    .forEach((lead) => {
      if (replacement && replacement.id !== agentId) {
        lead.assignedAgentId = replacement.id;
        lead.expiresAt = Date.now() + RESPONSE_WINDOW_MS;
      }
    });
  state.agents = state.agents.filter((item) => item.id !== agentId);
  saveState();
  const agentsPushed = await deleteAgentFromSheet(agent);
  showToast(
    agentsPushed ? "Ejen dibuang" : "Ejen dibuang dari dashboard",
    agentsPushed
      ? `${agent.name} telah dikeluarkan daripada dashboard dan Google Sheet.`
      : "Google Sheet belum dapat dikemas kini. Semak Web App URL.",
    agentsPushed ? "success" : "error",
  );
  renderAll();
}

function openAgentPasswordModal(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return;
  selectedAgentId = agentId;
  elements.agentPasswordForm.reset();
  elements.agentPasswordError.textContent = "";
  elements.agentPasswordDescription.textContent = `Tetapkan kata laluan baru untuk ${agent.name} (${agent.email}).`;
  elements.agentPasswordModal.classList.add("open");
  elements.agentPasswordModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.agentNewPassword.focus(), 80);
}

async function updateAgentPassword(event) {
  event.preventDefault();
  const agent = getAgent(selectedAgentId);
  const password = elements.agentNewPassword.value;
  const confirmation = elements.agentConfirmPassword.value;
  if (!agent) return;
  if (password.length < 8) {
    elements.agentPasswordError.textContent = "Kata laluan mesti sekurang-kurangnya 8 aksara.";
    return;
  }
  if (password !== confirmation) {
    elements.agentPasswordError.textContent = "Pengesahan kata laluan tidak sepadan.";
    return;
  }

  if (remoteDatabaseMode) {
    const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
      body: { action: "update_password", userId: agent.id, password },
    });
    if (error || !data?.ok) {
      elements.agentPasswordError.textContent =
        data?.error || "Password tidak dapat dikemas kini. Semak sambungan Google Sheet.";
      return;
    }
  } else {
    agent.password = password;
    saveState();
  }
  await upsertAgentToSheet(agent);

  closeModal(elements.agentPasswordModal);
  showToast("Kata laluan dikemas kini", `Kata laluan ${agent.name} telah ditukar.`);
}

function openContactModal(leadId) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead || !canViewLeadPhone(lead)) return;
  selectedContactId = leadId;
  elements.contactName.value = lead.name;
  elements.contactPhone.value = lead.phone;
  elements.contactEmail.value = lead.email || "";
  elements.contactProject.value = lead.project || "";
  elements.contactNotes.value = lead.notes || "";
  elements.contactFormError.textContent = "";
  elements.contactDeleteButton.hidden = !isAdmin();
  if (isAdmin()) {
    elements.contactDeleteButton.dataset.contactDelete = lead.id;
  } else {
    delete elements.contactDeleteButton.dataset.contactDelete;
  }
  elements.contactModal.classList.add("open");
  elements.contactModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.contactName.focus(), 80);
}

async function updateContact(event) {
  event.preventDefault();
  const lead = state.leads.find((item) => item.id === selectedContactId);
  if (!lead || !canViewLeadPhone(lead)) {
    elements.contactFormError.textContent = "Lead ini tidak boleh dikemas kini.";
    return;
  }
  lead.name = elements.contactName.value.trim();
  lead.phone = elements.contactPhone.value.trim();
  lead.email = elements.contactEmail.value.trim();
  lead.project = elements.contactProject.value.trim();
  lead.notes = elements.contactNotes.value.trim();
  if (!lead.name || !lead.phone || !lead.project) {
    elements.contactFormError.textContent = "Nama, nombor telefon dan projek diperlukan.";
    return;
  }
  try {
    await persistLead(lead);
    saveState();
    closeModal(elements.contactModal);
    showToast("Rekod pelanggan disimpan", `${lead.name} telah dikemas kini.`);
    renderAll();
  } catch (error) {
    console.error(error);
    elements.contactFormError.textContent = "Perubahan tidak dapat disimpan ke dashboard.";
  }
}

async function saveLeadNote(leadId, button = null) {
  const lead = state.leads.find((item) => item.id === leadId);
  const field = [...elements.leadsTableBody.querySelectorAll("[data-lead-note]")].find(
    (item) => item.dataset.leadNote === leadId,
  );
  if (!lead || !field) return;

  const nextNotes = field.value.trim();
  if (nextNotes === String(lead.notes || "").trim()) {
    showToast("Nota tiada perubahan", "Tiada nota baru untuk disimpan.");
    return;
  }

  const previousNotes = lead.notes || "";
  lead.notes = nextNotes;
  if (button) {
    button.disabled = true;
    button.textContent = "Menyimpan...";
  }

  try {
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.rpc("update_lead_notes", {
        p_lead_id: lead.id,
        p_notes: nextNotes,
      });
      if (error) throw error;
      if (data === false) throw new Error("Anda hanya boleh edit nota lead yang boleh dilihat oleh akaun ini.");
    }
    saveState();
    showToast("Nota disimpan", `Nota untuk ${lead.name} telah dikemas kini.`);
  } catch (error) {
    lead.notes = previousNotes;
    field.value = previousNotes;
    console.error(error);
    showToast("Nota gagal disimpan", error?.message || "Semak sambungan Google Sheet dan cuba lagi.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Simpan nota";
    }
  }
}

async function updateLeadStatusFromLog(leadId, nextStatus, field = null) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return;

  const normalizedStatus = normalizeSheetStatus(nextStatus);
  if (getLeadVisualStatus(lead) === normalizedStatus) return;

  const previousLead = { ...lead };
  if (field) {
    field.disabled = true;
    field.classList.add("is-saving");
  }

  try {
    applySheetStatusToLead(lead, normalizedStatus);
    activateQueuedLeads({ notify: true });
    await persistLead(lead);
    saveState();
    renderAll();

    const statusSynced = await updateLeadStatusInSheet(lead, normalizedStatus);
    await updateLeadRuntimeInSheet(lead);
    await syncLeadHandledCountsToSheet();
    if (!statusSynced) throw new Error("Status tidak dapat disimpan ke Google Sheet.");

    showToast("Status dikemas kini", `${lead.name} kini ${formatSheetStatus(normalizedStatus)}.`);
  } catch (error) {
    Object.assign(lead, previousLead);
    saveState();
    renderAll();
    console.error(error);
    showToast("Status gagal disimpan", error?.message || "Semak sambungan Google Sheet dan cuba lagi.", "error");
  } finally {
    if (field) {
      field.disabled = false;
      field.classList.remove("is-saving");
      field.value = getLeadVisualStatus(lead);
    }
  }
}

async function deleteLeadEverywhere(leadId) {
  if (!isAdmin()) {
    showToast("Admin sahaja", "Hanya admin boleh padam lead daripada dashboard.", "error");
    return;
  }
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return;

  const confirmed = window.confirm(
    `Padam lead ${lead.name}? Tindakan ini akan buang lead daripada Google Sheet dan dashboard.`,
  );
  if (!confirmed) return;

  const sheetDeleted = await deleteLeadFromSheet(lead);
  if (!sheetDeleted) {
    showToast("Lead tidak dipadam", "Google Sheet belum dapat dikemas kini. Semak Web App URL.", "error");
    return;
  }

  try {
    await deleteLeads([lead.id]);
    if (selectedContactId === lead.id) {
      selectedContactId = null;
      closeModal(elements.contactModal);
    }
    showToast("Lead dipadam", "Google Sheet dan dashboard telah diselaraskan.");
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Lead tidak dipadam", "Semak sambungan Google Sheet.", "error");
  }
}

async function syncGoogleSheet(options = {}) {
  const endpoint = getSheetEndpoint();
  if (!endpoint) {
    showToast("URL diperlukan", "Masukkan Google Apps Script Web App URL.", "error");
    return false;
  }

  elements.connectionResult.classList.remove("error");
  elements.connectionResult.innerHTML = '<span class="status-dot"></span><span>Sedang menyemak Google Sheet...</span>';

  try {
    const url = new URL(endpoint);
    url.searchParams.set("_", Date.now().toString());
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.leads || payload.data || [];
    if (!Array.isArray(payload) && payload?.ok === false) {
      throw new Error(payload.error || "Google Sheet tidak dapat dibaca");
    }
    if (!Array.isArray(rows)) throw new Error("Format JSON tidak sah");

    const agentSync = Array.isArray(payload) ? { added: 0, updated: 0, removed: 0 } : await syncAgentsFromSheet(payload.agents);
    if (options.agentsOnly) {
      state.integration.endpoint = endpoint;
      state.integration.interval = Number(elements.pollInterval.value) || state.integration.interval || 15;
      state.integration.connected = true;
      state.integration.lastSyncAt = Date.now();
      saveState();
      return true;
    }

    const shouldNotifyNewLeads = options.notifyNewLeads ?? Boolean(state.integration.lastSyncAt);
    let added = 0;
    let updated = 0;
    const sheetKeys = new Set(rows.map(sheetDedupeKey).filter(Boolean));
    for (const row of rows) {
      const result = await addLead(row, {
        silent: true,
        updateExisting: true,
        notify: shouldNotifyNewLeads,
        queueIfBlocked: true,
      });
      if (result === "added") added += 1;
      if (result === "updated") updated += 1;
    }
    const removedLeads = state.leads.filter((lead) => !sheetKeys.has(lead.dedupeKey));
    let removed = removedLeads.length;
    if (remoteDatabaseMode && isAdmin()) {
      const { data, error } = await remoteDatabaseClient.rpc("delete_leads_not_in_dedupe_keys", {
        p_dedupe_keys: [...sheetKeys],
      });
      if (error) throw error;
      removed = Number(data) || 0;
      if (removedLeads.length) {
        const removedIds = removedLeads.map((lead) => lead.id);
        state.leads = state.leads.filter((lead) => sheetKeys.has(lead.dedupeKey));
        state.activities = state.activities.filter((activity) => !removedIds.includes(activity.leadId));
        saveState();
      }
    } else if (removedLeads.length) {
      await deleteLeads(removedLeads.map((lead) => lead.id));
    }
    const activatedQueuedLeads = activateQueuedLeads({ notify: shouldNotifyNewLeads });
    const handledSync = await syncLeadHandledCountsToSheet();

    state.integration.endpoint = endpoint;
    state.integration.interval = Number(elements.pollInterval.value) || 15;
    state.integration.connected = true;
    state.integration.lastSyncAt = Date.now();
    saveState();
    if (remoteDatabaseMode) {
      await remoteDatabaseClient.from("app_settings").upsert({
        id: 1,
        google_sheet_endpoint: endpoint,
        poll_interval: state.integration.interval,
        last_sync_at: new Date(state.integration.lastSyncAt).toISOString(),
        round_robin_index: state.roundRobinIndex,
      });
    }
    scheduleSync();
    renderAll();
    const agentChanges =
      (agentSync.added || 0) +
      (agentSync.updated || 0) +
      (agentSync.removed || 0) +
      (handledSync.updated || 0);
    if (!options.silent || added || updated || removed || agentChanges) {
      const title =
        [
          added ? `${added} lead baru` : "",
          updated ? `${updated} dikemas kini` : "",
          removed ? `${removed} dibuang` : "",
          activatedQueuedLeads.length ? `${activatedQueuedLeads.length} lead queue dilepaskan` : "",
          agentSync.added ? `${agentSync.added} ejen baru` : "",
          agentSync.updated ? `${agentSync.updated} ejen dikemas kini` : "",
          agentSync.removed ? `${agentSync.removed} ejen dibuang` : "",
          handledSync.updated ? `${handledSync.updated} kiraan ejen sync` : "",
        ]
          .filter(Boolean)
          .join(", ") ||
        "Sync selesai";
      showToast(
        title,
        added || updated || removed
          ? "Dashboard telah diselaraskan dengan Google Sheet."
          : "Tiada perubahan baru ditemui.",
      );
    }
    return true;
  } catch (error) {
    state.integration.connected = false;
    saveState();
    elements.connectionResult.classList.add("error");
    elements.connectionResult.innerHTML = `
      <span class="status-dot"></span>
      <span>Gagal disambungkan. Semak URL dan akses Web App.</span>`;
    if (!options.silent) {
      showToast("Sync gagal", "Pastikan Web App URL boleh diakses oleh sesiapa sahaja.", "error");
    }
    console.error("Google Sheet sync failed", error);
    return false;
  }
}

function scheduleSync() {
  window.clearInterval(syncTimer);
  if (!getSheetEndpoint()) return;
  syncTimer = window.setInterval(
    () => syncGoogleSheet({ silent: true }),
    Math.max(15, Number(state.integration.interval) || 15) * 1000,
  );
}

async function saveIntegration(event) {
  event.preventDefault();
  state.integration.endpoint = elements.sheetEndpoint.value.trim() || DEFAULT_GOOGLE_SHEET_ENDPOINT;
  state.integration.interval = Number(elements.pollInterval.value) || 15;
  state.integration.connected = true;
  saveState();
  syncGoogleSheet();
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll("[data-view-link]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewLink));
});

elements.manualLeadButtons.forEach((button) => button.addEventListener("click", openManualLeadModal));
elements.notificationButton.addEventListener("click", requestNotifications);
elements.mobileMenu.addEventListener("click", () => elements.sidebar.classList.toggle("open"));
elements.loginForm.addEventListener("submit", handleLogin);
elements.loginEmail.addEventListener("input", () => setLoginError(""));
elements.loginPassword.addEventListener("input", () => setLoginError(""));
elements.signupForm.addEventListener("submit", handleAgentSignup);
elements.signupToggle.addEventListener("click", () => showSignupForm(elements.signupForm.hidden));
[
  elements.signupName,
  elements.signupPhone,
  elements.signupEmail,
  elements.signupPassword,
  elements.signupConfirmPassword,
].forEach((input) => input.addEventListener("input", () => setSignupError("")));
elements.passwordToggle.addEventListener("click", togglePasswordVisibility);
elements.forgotPasswordButton.addEventListener("click", openResetPasswordModal);
elements.resetRequestForm.addEventListener("submit", requestPasswordReset);
elements.resetVerifyForm.addEventListener("submit", verifyPasswordReset);
elements.resetBackButton.addEventListener("click", resetPasswordFlow);
elements.sidebarSettings.addEventListener("click", logout);
elements.logoutButton.addEventListener("click", logout);
elements.leadSearch.addEventListener("input", renderLeadsTable);
elements.leadFilter.addEventListener("change", renderLeadsTable);
elements.leadsTableBody.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-lead-edit]");
  const remove = event.target.closest("[data-lead-delete]");
  const saveNote = event.target.closest("[data-lead-note-save]");
  if (edit) openContactModal(edit.dataset.leadEdit);
  if (remove && isAdmin()) deleteLeadEverywhere(remove.dataset.leadDelete);
  if (saveNote) saveLeadNote(saveNote.dataset.leadNoteSave, saveNote);
});
elements.leadsTableBody.addEventListener("change", (event) => {
  const statusField = event.target.closest("[data-lead-status]");
  if (statusField) updateLeadStatusFromLog(statusField.dataset.leadStatus, statusField.value, statusField);
});
elements.manualLeadForm.addEventListener("submit", addManualLead);
elements.manualLeadPhone.addEventListener("input", () => {
  elements.manualLeadError.textContent = "";
});
elements.addAgentButton.addEventListener("click", () => openAgentModal());
elements.agentForm.addEventListener("submit", addAgent);
elements.agentPasswordForm.addEventListener("submit", updateAgentPassword);
elements.contactForm.addEventListener("submit", updateContact);
elements.integrationForm.addEventListener("submit", saveIntegration);
elements.syncNowButton.addEventListener("click", () => syncGoogleSheet());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "OPEN_DASHBOARD") switchView("dashboard");
  });
}

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(document.querySelector(`#${button.dataset.closeModal}`)));
});

elements.agentModal.addEventListener("click", (event) => {
  if (event.target === elements.agentModal) {
    editingAgentId = null;
    closeModal(elements.agentModal);
  }
});

elements.manualLeadModal.addEventListener("click", (event) => {
  if (event.target === elements.manualLeadModal) closeModal(elements.manualLeadModal);
});

elements.resetPasswordModal.addEventListener("click", (event) => {
  if (event.target === elements.resetPasswordModal) closeModal(elements.resetPasswordModal);
});

[elements.agentPasswordModal, elements.contactModal].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
});

elements.agentsGrid.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-agent-toggle]");
  const approve = event.target.closest("[data-agent-approve]");
  const reject = event.target.closest("[data-agent-reject]");
  const remove = event.target.closest("[data-agent-remove]");
  const password = event.target.closest("[data-agent-password]");
  const edit = event.target.closest("[data-agent-edit]");
  if (toggle) toggleAgent(toggle.dataset.agentToggle);
  if (approve) approveAgent(approve.dataset.agentApprove);
  if (reject) rejectAgent(reject.dataset.agentReject);
  if (remove) removeAgent(remove.dataset.agentRemove);
  if (password) openAgentPasswordModal(password.dataset.agentPassword);
  if (edit) openAgentModal(edit.dataset.agentEdit);
});

elements.contactDeleteButton.addEventListener("click", () => {
  if (!isAdmin()) return;
  const leadId = elements.contactDeleteButton.dataset.contactDelete || selectedContactId;
  if (leadId) deleteLeadEverywhere(leadId);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal(elements.agentModal);
    editingAgentId = null;
    closeModal(elements.manualLeadModal);
    closeModal(elements.resetPasswordModal);
    closeModal(elements.agentPasswordModal);
    closeModal(elements.contactModal);
    elements.sidebar.classList.remove("open");
  }
});

async function bootstrap() {
  state.integration = normalizeIntegration(state.integration);
  saveState();
  initRemoteDatabase();
  await syncGoogleSheet({ silent: true, agentsOnly: true });

  const sessionUser = getSessionUser();
  if (sessionUser) {
    startAuthenticatedApp(sessionUser);
  } else {
    showLogin();
  }
}

lockViewportZoom();
bootstrap();
