const STORAGE_KEY = "leadlaju-state-v1";
const AUTH_KEY = "leadlaju-auth-v1";
const SUPABASE_CONFIG_KEY = "leadlaju-supabase-config-v1";
const SUPABASE_DISABLED_KEY = "leadlaju-supabase-disabled-v1";
const NOTIFIED_LEADS_KEY = "leadlaju-notified-leads-v1";
const DEFAULT_SUPABASE_CONFIG = Object.freeze({
  url: "https://rfqwyhafvfvafiqrcmxa.supabase.co",
  key: "sb_publishable_or7DVUc_la79KiBz4kR5uw_EIGyN3-l",
});
const SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
const RESPONSE_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_AGENT_PASSWORD = "Agent123!";
const NOTIFICATION_ICON = "/assets/icon-192.png";
const NOTIFICATION_BADGE = "/assets/badge-96.png";

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
    endpoint: "https://script.google.com/macros/s/AKfycbyXEPXT-m6YETnvOZEy0CxF82CMmMGDmgpVmDIv-a7XTEdJp92mYkOQhaBSRTPnNH7K/exec",
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
let selectedContactId = null;
let supabaseClient = null;
let supabaseChannel = null;
let supabaseMode = false;
let remoteReloadTimer = null;
let claimingLeadId = null;
let remoteStateLoadedOnce = false;
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
  supabaseForm: document.querySelector("#supabase-form"),
  supabaseUrl: document.querySelector("#supabase-url"),
  supabaseKey: document.querySelector("#supabase-key"),
  supabaseResult: document.querySelector("#supabase-result"),
  supabaseDisconnect: document.querySelector("#supabase-disconnect"),
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
      integration: {
        ...defaultState.integration,
        ...(saved.integration || {}),
      },
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
    }));
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadSupabaseConfig() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("demo")) return null;
  if (localStorage.getItem(SUPABASE_DISABLED_KEY) === "true") return null;
  try {
    const config = JSON.parse(localStorage.getItem(SUPABASE_CONFIG_KEY));
    if (config?.url && config?.key) return config;
  } catch {
    // Fall through to the production project configuration.
  }
  return DEFAULT_SUPABASE_CONFIG;
}

function initSupabase() {
  const config = loadSupabaseConfig();
  if (!config || !window.supabase?.createClient) return null;
  supabaseClient = window.supabase.createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return supabaseClient;
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
    source: normalizeLeadSource(row.source || "Google Sheet"),
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
  if (!supabaseClient) return false;
  const previousLeadKeys = new Set(state.leads.map(leadNotificationKey));
  const shouldDetectNewLeads = remoteStateLoadedOnce;
  try {
    const [profilesResult, leadsResult, activitiesResult, settingsResult] = await Promise.all([
      supabaseClient.from("profiles").select("*").order("created_at"),
      supabaseClient.rpc("get_visible_leads"),
      supabaseClient.from("activities").select("*").order("created_at", { ascending: false }).limit(80),
      supabaseClient.from("app_settings").select("*").eq("id", 1).maybeSingle(),
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
      integration: {
        ...defaultState.integration,
        endpoint: settingsResult.data?.google_sheet_endpoint || "",
        interval: settingsResult.data?.poll_interval || 15,
        connected: Boolean(settingsResult.data?.google_sheet_endpoint),
        lastSyncAt: settingsResult.data?.last_sync_at
          ? new Date(settingsResult.data.last_sync_at).getTime()
          : null,
      },
    };
    supabaseMode = true;
    saveState();
    subscribeToSupabase();
    if (shouldDetectNewLeads) {
      await notifyForNewVisibleLeads(previousLeadKeys);
    } else {
      markCurrentLeadNotificationsSeen();
    }
    remoteStateLoadedOnce = true;
    return true;
  } catch (error) {
    console.error("Supabase load failed", error);
    supabaseMode = false;
    return false;
  }
}

function subscribeToSupabase() {
  if (!supabaseClient || supabaseChannel) return;
  supabaseChannel = supabaseClient
    .channel("leadlaju-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, queueRemoteReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, queueRemoteReload)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, queueRemoteReload)
    .subscribe();
}

function queueRemoteReload() {
  window.clearTimeout(remoteReloadTimer);
  remoteReloadTimer = window.setTimeout(async () => {
    if (!supabaseMode) return;
    await loadRemoteState(state.currentUserId);
    renderAll();
  }, 250);
}

async function persistProfile(agent) {
  if (!supabaseMode) return true;
  const { error } = await supabaseClient
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
  if (!supabaseMode) return true;
  const { error } = await supabaseClient
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
  if (!supabaseMode) return true;
  const { error } = await supabaseClient.from("leads").insert({
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
  if (!supabaseMode) return true;
  const { error } = await supabaseClient.from("activities").insert({
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

  if (supabaseMode) {
    const { error } = await supabaseClient.from("leads").delete().in("id", ids);
    if (error) throw error;
  }

  state.leads = state.leads.filter((lead) => !ids.includes(lead.id));
  state.activities = state.activities.filter((activity) => !ids.includes(activity.leadId));
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
}

function showLogin() {
  window.clearInterval(tickTimer);
  window.clearInterval(syncTimer);
  elements.sidebar.classList.remove("open");
  elements.appShell.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-pending", "authenticated");
  document.body.classList.add("logged-out");
  window.setTimeout(() => elements.loginEmail.focus(), 80);
}

function setLoginError(message) {
  elements.loginError.textContent = message;
  elements.loginEmail.closest(".login-input").classList.toggle("invalid", Boolean(message));
  elements.loginPassword.closest(".login-input").classList.toggle("invalid", Boolean(message));
}

async function handleLogin(event) {
  event.preventDefault();
  const email = elements.loginEmail.value.trim().toLowerCase();
  const password = elements.loginPassword.value;
  if (!email || !password) {
    setLoginError("Masukkan emel dan kata laluan.");
    return;
  }

  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoginError("Emel atau kata laluan tidak betul.");
      return;
    }
    const loaded = await loadRemoteState(data.user.id);
    if (!loaded) {
      await supabaseClient.auth.signOut();
      setLoginError("Akaun berjaya disahkan tetapi data sistem tidak dapat dimuatkan.");
      return;
    }
    setLoginError("");
    activeView = "dashboard";
    switchView("dashboard");
    startAuthenticatedApp(getCurrentUser());
    return;
  }

  const user = state.agents.find((agent) => agent.email.toLowerCase() === email);
  if (!user || user.password !== password) {
    setLoginError("Emel atau kata laluan tidak betul.");
    return;
  }
  if (!user.active) {
    setLoginError("Akaun ini tidak aktif. Sila hubungi admin.");
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

async function logout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  localStorage.removeItem(AUTH_KEY);
  supabaseMode = false;
  remoteStateLoadedOnce = false;
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

function openSupabaseRecoveryModal() {
  resetPasswordFlow();
  passwordResetRequest = { supabaseRecovery: true };
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
  const endpoint = state.integration.endpoint.trim();
  if (!endpoint || !state.integration.connected) return false;

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
  if (supabaseClient) {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      elements.resetRequestError.textContent = "Emel reset tidak dapat dihantar. Semak tetapan Supabase Auth.";
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
  if (!passwordResetRequest.supabaseRecovery && passwordResetRequest.expiresAt <= Date.now()) {
    elements.resetVerifyError.textContent = "Kod telah tamat. Minta kod baru.";
    return;
  }
  if (!passwordResetRequest.supabaseRecovery && code !== passwordResetRequest.code) {
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

  if (passwordResetRequest.supabaseRecovery) {
    const { error } = await supabaseClient.auth.updateUser({ password });
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

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "baru sahaja";
  if (seconds < 60) return `${seconds} saat lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minit lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours} jam lalu`;
}

function todayKey(value = Date.now()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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
      .then((registration) => navigator.serviceWorker.ready.then(() => registration))
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

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function normalizeLeadSource(value, fallback = "Google Sheet") {
  const source = String(value || fallback || "Google Sheet").trim();
  const lower = source.toLowerCase();
  if (lower.includes("tiktok")) return "TikTok Ads";
  if (lower.includes("meta") || lower.includes("facebook") || lower === "fb") return "Meta Ads";
  if (lower.includes("manual")) return "Manual Lead";
  return source || fallback;
}

function normalizeSheetStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!status || status === "new" || status === "baru") return "new";
  if (["done", "completed", "complete", "contacted", "called", "call", "telah dihubungi"].includes(status)) {
    return "contacted";
  }
  return "new";
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
  const source = normalizeLeadSource(input.source || input.sumber || input.platform, options.source || "Google Sheet");
  const createdAtValue = input.created_at || input.createdAt;
  const parsedCreatedAt = createdAtValue ? new Date(createdAtValue).getTime() : Date.now();

  if (existingLead) {
    if (!options.updateExisting) return false;

    let changed = false;
    const updates = { name, phone, email, project, source };
    Object.entries(updates).forEach(([key, value]) => {
      if (existingLead[key] !== value) {
        existingLead[key] = value;
        changed = true;
      }
    });

    const incomingStatus = normalizeSheetStatus(input.status);
    if (incomingStatus === "contacted" && existingLead.status !== "contacted") {
      existingLead.status = "contacted";
      existingLead.contactedAt = existingLead.contactedAt || Date.now();
      existingLead.responseMs = existingLead.responseMs || existingLead.contactedAt - existingLead.receivedAt;
      changed = true;
    }

    if (!changed) return false;
    saveState();
    try {
      await persistLead(existingLead);
    } catch (error) {
      showToast("Lead tidak dapat dikemas kini", "Semak sambungan dan polisi Supabase.", "error");
      console.error(error);
      return false;
    }
    return "updated";
  }

  const assignedAgent = selectNextAgent();
  if (!assignedAgent) {
    showToast("Tiada ejen aktif", "Aktifkan sekurang-kurangnya seorang ejen dahulu.", "error");
    return false;
  }

  const now = Date.now();
  const initialStatus = normalizeSheetStatus(input.status);
  const lead = {
    id: crypto.randomUUID?.() || makeId("lead"),
    dedupeKey,
    name,
    phone,
    email,
    project,
    source,
    createdAt: Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : now,
    receivedAt: now,
    assignedAgentId: assignedAgent.id,
    expiresAt: now + RESPONSE_WINDOW_MS,
    status: initialStatus,
    passCount: 0,
    responseMs: initialStatus === "contacted" ? 0 : null,
    contactedAt: initialStatus === "contacted" ? now : null,
    notes: "",
  };

  state.leads.unshift(lead);
  saveState();
  try {
    await persistNewLead(lead);
  } catch (error) {
    state.leads = state.leads.filter((item) => item.id !== lead.id);
    saveState();
    showToast("Lead tidak dapat disimpan", "Semak sambungan dan polisi Supabase.", "error");
    console.error(error);
    return false;
  }
  addActivity("new", lead, `${lead.project} diberikan kepada ${assignedAgent.name}`);
  saveState();

  if (!options.silent) {
    showToast("Lead baru masuk", `${lead.name} telah diberikan kepada ${assignedAgent.name}.`);
  }
  if (!options.silent || options.notify) sendSystemNotification(lead);
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

  const createdAt = new Date().toISOString();
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

  const result = await addLead(leadInput, { silent: true, updateExisting: true, notify: true });
  if (!result) {
    elements.manualLeadError.textContent = "Lead sudah masuk Google Sheet, tetapi dashboard belum dapat sync. Semak ejen aktif.";
    return;
  }

  closeModal(elements.manualLeadModal);
  showToast("Manual lead disimpan", "Google Sheet, dashboard dan Supabase telah diselaraskan.", "success");
  renderAll();
}

async function pushManualLeadToSheet(leadInput) {
  const endpoint = elements.sheetEndpoint.value.trim() || state.integration.endpoint;
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
  const endpoint = elements.sheetEndpoint.value.trim() || state.integration.endpoint;
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
  const endpoint = elements.sheetEndpoint.value.trim() || state.integration.endpoint;
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

function agentSheetPayload(agent) {
  return {
    id: agent.id,
    name: agent.name,
    phone: agent.phone || "",
    email: agent.email,
    role: agent.role || "agent",
    active: agent.active ? "active" : "inactive",
    leadsHandled: agent.leadsHandled || 0,
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

async function syncAgentsFromSheet(sheetAgentRows) {
  const result = { added: 0, updated: 0, removed: 0, backfilled: 0, skipped: 0 };
  if (!Array.isArray(sheetAgentRows)) return result;
  if (!isAdmin()) {
    result.skipped += sheetAgentRows.length;
    return result;
  }

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
        active: nextActive,
        leadsHandled: sheetAgent.leadsHandled,
      };
      const changed = Object.entries(updates).some(([key, value]) => existingAgent[key] !== value);
      if (changed) {
        Object.assign(existingAgent, updates);
        await persistProfile(existingAgent);
        result.updated += 1;
      }
      if (!sheetAgent.id) result.backfilled += 1;
      continue;
    }

    if (sheetAgent.role === "admin") {
      result.skipped += 1;
      continue;
    }

    if (supabaseMode) {
      const { data, error } = await supabaseClient.functions.invoke("admin-manage-agent", {
        body: {
          action: "create",
          name: sheetAgent.name,
          phone: sheetAgent.phone,
          email: sheetAgent.email,
          password: sheetAgent.password.length >= 8 ? sheetAgent.password : DEFAULT_AGENT_PASSWORD,
        },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || "Ejen dari Google Sheet tidak dapat dicipta di Supabase.");
      }
      reloadRemote = true;
    } else {
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
    }
    result.added += 1;
    result.backfilled += sheetAgent.id ? 0 : 1;
  }

  const removedAgents = state.agents.filter(
    (agent) =>
      agent.role === "agent" &&
      agent.id !== state.currentUserId &&
      !sheetEmails.has(String(agent.email || "").toLowerCase()),
  );

  for (const agent of removedAgents) {
    if (supabaseMode) {
      const { data, error } = await supabaseClient.functions.invoke("admin-manage-agent", {
        body: { action: "delete", userId: agent.id },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || `Ejen ${agent.name} tidak dapat dibuang dari Supabase.`);
      }
      reloadRemote = true;
    } else {
      state.agents = state.agents.filter((item) => item.id !== agent.id);
    }
    result.removed += 1;
  }

  saveState();
  if (supabaseMode && reloadRemote) {
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

  if (result.backfilled) {
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
  state.leads
    .filter((lead) => lead.status === "new" && lead.expiresAt <= now)
    .forEach((lead) => {
      const previousAgent = getAgent(lead.assignedAgentId);
      const nextAgent = selectNextAgent(lead.assignedAgentId);
      if (!nextAgent || nextAgent.id === lead.assignedAgentId) {
        lead.expiresAt = now + RESPONSE_WINDOW_MS;
        return;
      }

      lead.assignedAgentId = nextAgent.id;
      lead.expiresAt = now + RESPONSE_WINDOW_MS;
      lead.passCount += 1;
      addActivity(
        "passed",
        lead,
        `Masa ${previousAgent?.name || "ejen"} tamat, dipindahkan kepada ${nextAgent.name}`,
      );
      changed = true;
      if (supabaseMode) {
        supabaseClient
          .rpc("pass_expired_lead", {
            p_lead_id: lead.id,
            p_next_agent_id: nextAgent.id,
          })
          .then(({ error }) => {
            if (error) console.error("Lead pass save failed", error);
          });
      }

      if (nextAgent.id === state.currentUserId) {
        showToast("Lead dipindahkan kepada anda", `${lead.name} menunggu tindakan dalam 5 minit.`);
        sendSystemNotification(lead);
      }
    });

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

    if (supabaseMode) {
      const { data, error } = await supabaseClient.rpc("claim_lead", { p_lead_id: leadId });
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
      const localAgent = getAgent(lead.assignedAgentId);
      if (localAgent) localAgent.leadsHandled = (localAgent.leadsHandled || 0) + 1;
      addActivity("contacted", lead, `${localAgent?.name || "Ejen"} CALL NOW untuk ${lead.project}`);
    }

    const agent = getAgent((claimedLead || lead).assignedAgentId);
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
    showToast("CALL NOW gagal", error?.message || "Semak sambungan Supabase dan cuba lagi.", "error");
    if (supabaseMode) {
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
  if (lead.status !== "contacted") return false;
  return isAdmin() || lead.assignedAgentId === state.currentUserId;
}

function displayLeadPhone(lead) {
  return canViewLeadPhone(lead) && lead.phone ? lead.phone : "•••• •••• ••••";
}

function renderActiveLead() {
  const lead = getVisibleActiveLead();
  const newLeadCount = state.leads.filter((item) => item.status === "new").length;
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
  const todayLeads = state.leads.filter((lead) => todayKey(lead.receivedAt) === today);
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
        String(lead.notes || "").toLowerCase().includes(search);
      const visualStatus = lead.status === "new" && lead.passCount > 0 ? "passed" : lead.status;
      return matchesSearch && (filter === "all" || visualStatus === filter);
    })
    .sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));

  if (elements.leadLogCount) {
    elements.leadLogCount.textContent = `${rows.length} lead`;
  }
  elements.leadsTableBody.innerHTML = rows.length
    ? rows
        .map((lead) => {
          const visualStatus = lead.status === "new" && lead.passCount > 0 ? "passed" : lead.status;
          const statusLabel =
            visualStatus === "contacted" ? "Contacted" : visualStatus === "passed" ? "Passed" : "New";
          const contactedTime = lead.contactedAt ? `<small>Dihubungi ${formatDateTime(lead.contactedAt)}</small>` : "";
          const editButton = canViewLeadPhone(lead)
            ? `<button class="contact-edit-button" type="button" data-lead-edit="${lead.id}">Edit</button>`
            : "";
          const deleteButton = isAdmin()
            ? `<button class="contact-edit-button danger" type="button" data-lead-delete="${lead.id}">Padam</button>`
            : "";
          const actionButtons = [editButton, deleteButton].filter(Boolean).join("");
          return `
            <tr data-lead-row="${lead.id}">
              <td>
                <strong>${escapeHtml(lead.name)}</strong>
                <small>${escapeHtml(displayLeadPhone(lead))}</small>
                <small>${canViewLeadPhone(lead) && lead.email ? escapeHtml(lead.email) : "Emel dibuka selepas CALL NOW"}</small>
              </td>
              <td>
                <strong>${escapeHtml(lead.project || "Tidak dinyatakan")}</strong>
                <small>${escapeHtml(lead.source)}</small>
              </td>
              <td>${escapeHtml(getAgent(lead.assignedAgentId)?.name || "Tiada ejen")}</td>
              <td><strong>Masuk ${formatDateTime(lead.receivedAt)}</strong>${contactedTime}</td>
              <td><span class="status-badge ${visualStatus}">${statusLabel}</span></td>
              <td class="lead-note-cell">
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
              <td><span class="lead-actions">${actionButtons || "-"}</span></td>
            </tr>`;
        })
        .join("")
    : `<tr><td class="table-empty" colspan="7">Tiada lead ditemui.</td></tr>`;
}

function renderAgents() {
  elements.agentsGrid.innerHTML = state.agents
    .map(
      (agent) => `
        <article class="agent-card">
          <div class="agent-card-top">
            <span class="agent-card-avatar">${initials(agent.name)}</span>
            <span class="agent-card-name">
              <strong>${escapeHtml(agent.name)}</strong>
              <small>${agent.role === "admin" ? "Administrator" : "Property Agent"}</small>
            </span>
            <span class="agent-status">
              <button
                class="switch ${agent.active ? "active" : ""}"
                type="button"
                data-agent-toggle="${agent.id}"
                aria-label="${agent.active ? "Nyahaktifkan" : "Aktifkan"} ${escapeHtml(agent.name)}"
              ></button>
            </span>
          </div>
          <div class="agent-card-details">
            <span>Telefon <b>${escapeHtml(agent.phone)}</b></span>
            <span>Emel <b>${escapeHtml(agent.email)}</b></span>
            <span>Lead dikendalikan <b>${agent.leadsHandled || 0}</b></span>
          </div>
          <div class="agent-card-actions">
            <button class="edit-password" type="button" data-agent-password="${agent.id}">Edit password</button>
            ${
              agent.id !== state.currentUserId
                ? `<button class="remove-agent" type="button" data-agent-remove="${agent.id}" aria-label="Buang ${escapeHtml(agent.name)}">×</button>`
                : ""
            }
          </div>
        </article>`,
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
  const integration = state.integration;
  const supabaseConfig = loadSupabaseConfig();
  elements.sheetEndpoint.value = integration.endpoint;
  elements.pollInterval.value = String(integration.interval);
  elements.supabaseUrl.value = supabaseConfig?.url || "";
  elements.supabaseKey.value = supabaseConfig?.key || "";
  elements.supabaseResult.classList.toggle("error", Boolean(supabaseConfig && !supabaseMode));
  elements.supabaseResult.innerHTML = `
    <span class="status-dot"></span>
    <span>${
      supabaseMode
        ? "Supabase aktif. Akaun, lead dan aktiviti sedang diselaraskan secara live."
        : supabaseConfig
          ? "Konfigurasi disimpan tetapi sambungan belum aktif. Semak schema dan akaun Auth."
          : "Belum dikonfigurasi. Data tempatan sedang digunakan."
    }</span>`;
  elements.sidebarSyncText.textContent = integration.connected ? "Disambungkan" : "Mod demo";
  elements.sidebarSyncStatus.textContent = integration.connected
    ? `Sync ${integration.lastSyncAt ? relativeTime(integration.lastSyncAt) : "aktif"}`
    : "Sedia menerima lead";
  elements.liveSyncLabel.textContent = integration.connected ? "Google Sheet live" : "Live sync demo";
  elements.connectionResult.classList.remove("error");
  elements.connectionResult.innerHTML = `
    <span class="status-dot"></span>
    <span>${
      integration.connected
        ? `Disambungkan${integration.lastSyncAt ? ` • sync ${relativeTime(integration.lastSyncAt)}` : ""}`
        : "Belum disambungkan. Mod demo sedang aktif."
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
  leads: "Lead Log",
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

function openAgentModal() {
  elements.agentModal.classList.add("open");
  elements.agentModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => document.querySelector("#agent-name").focus(), 100);
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

async function addAgent(event) {
  event.preventDefault();
  const name = document.querySelector("#agent-name").value.trim();
  const phone = document.querySelector("#agent-phone").value.trim();
  const email = document.querySelector("#agent-email").value.trim();
  const password = document.querySelector("#agent-password").value;
  if (!name || !phone || !email || password.length < 8) return;
  if (state.agents.some((agent) => agent.email.toLowerCase() === email.toLowerCase())) {
    showToast("Emel telah digunakan", "Gunakan alamat emel lain untuk ejen ini.", "error");
    return;
  }

  if (supabaseMode) {
    const { data, error } = await supabaseClient.functions.invoke("admin-manage-agent", {
      body: { action: "create", name, phone, email, password },
    });
    if (error || !data?.ok) {
      showToast(
        "Ejen tidak dapat didaftarkan",
        data?.error || "Deploy Edge Function admin-manage-agent dan semak akses admin.",
        "error",
      );
      return;
    }
    await loadRemoteState(state.currentUserId);
  } else {
    state.agents.push({
      id: makeId("agent"),
      name,
      phone,
      email,
      password,
      role: "agent",
      active: true,
      leadsHandled: 0,
    });
    saveState();
  }
  const savedAgent = state.agents.find((agent) => agent.email.toLowerCase() === email.toLowerCase());
  const agentsPushed = await upsertAgentToSheet(savedAgent);
  elements.agentForm.reset();
  closeModal(elements.agentModal);
  showToast(
    agentsPushed ? "Ejen didaftarkan" : "Ejen masuk dashboard",
    agentsPushed
      ? `${name} kini termasuk dalam dashboard, Supabase dan Google Sheet.`
      : "Google Sheet belum dapat dikemas kini. Semak Web App URL.",
    agentsPushed ? "success" : "error",
  );
  renderAll();
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
    showToast("Perubahan belum disimpan", "Semak polisi database Supabase.", "error");
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
  if (supabaseMode) {
    const { data, error } = await supabaseClient.functions.invoke("admin-manage-agent", {
      body: { action: "delete", userId: agentId },
    });
    if (error || !data?.ok) {
      showToast("Ejen tidak dapat dibuang", data?.error || "Semak Edge Function Supabase.", "error");
      return;
    }
    await loadRemoteState(state.currentUserId);
    const agentsPushed = await deleteAgentFromSheet(agent);
    showToast(
      agentsPushed ? "Ejen dibuang" : "Ejen dibuang dari dashboard",
      agentsPushed
        ? `${agent.name} telah dikeluarkan daripada dashboard, Supabase dan Google Sheet.`
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
      ? `${agent.name} telah dikeluarkan daripada dashboard, Supabase dan Google Sheet.`
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

  if (supabaseMode) {
    const { data, error } = await supabaseClient.functions.invoke("admin-manage-agent", {
      body: { action: "update_password", userId: agent.id, password },
    });
    if (error || !data?.ok) {
      elements.agentPasswordError.textContent =
        data?.error || "Password tidak dapat dikemas kini. Semak Edge Function Supabase.";
      return;
    }
  } else {
    agent.password = password;
    saveState();
  }

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
  elements.contactDeleteButton.dataset.contactDelete = lead.id;
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
    elements.contactFormError.textContent = "Perubahan tidak dapat disimpan ke Supabase.";
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
    if (supabaseMode) {
      const { data, error } = await supabaseClient.rpc("update_lead_notes", {
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
    showToast("Nota gagal disimpan", error?.message || "Semak sambungan Supabase dan cuba lagi.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Simpan nota";
    }
  }
}

async function deleteLeadEverywhere(leadId) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return;

  const confirmed = window.confirm(
    `Padam lead ${lead.name}? Tindakan ini akan buang lead daripada Google Sheet, dashboard dan Supabase.`,
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
    showToast("Lead dipadam", "Google Sheet, dashboard dan Supabase telah diselaraskan.");
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Lead tidak dipadam", "Semak sambungan dan polisi Supabase.", "error");
  }
}

async function syncGoogleSheet(options = {}) {
  const endpoint = elements.sheetEndpoint.value.trim() || state.integration.endpoint;
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
    const shouldNotifyNewLeads = options.notifyNewLeads ?? Boolean(state.integration.lastSyncAt);
    let added = 0;
    let updated = 0;
    const sheetKeys = new Set(rows.map(sheetDedupeKey).filter(Boolean));
    for (const row of rows) {
      const result = await addLead(row, { silent: true, updateExisting: true, notify: shouldNotifyNewLeads });
      if (result === "added") added += 1;
      if (result === "updated") updated += 1;
    }
    const removedLeads = state.leads.filter((lead) => !sheetKeys.has(lead.dedupeKey));
    let removed = removedLeads.length;
    if (supabaseMode && isAdmin()) {
      const { data, error } = await supabaseClient.rpc("delete_leads_not_in_dedupe_keys", {
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

    state.integration.endpoint = endpoint;
    state.integration.interval = Number(elements.pollInterval.value) || 15;
    state.integration.connected = true;
    state.integration.lastSyncAt = Date.now();
    saveState();
    if (supabaseMode) {
      await supabaseClient.from("app_settings").upsert({
        id: 1,
        google_sheet_endpoint: endpoint,
        poll_interval: state.integration.interval,
        last_sync_at: new Date(state.integration.lastSyncAt).toISOString(),
        round_robin_index: state.roundRobinIndex,
      });
    }
    scheduleSync();
    renderAll();
    const agentChanges = (agentSync.added || 0) + (agentSync.updated || 0) + (agentSync.removed || 0);
    if (!options.silent || added || updated || removed || agentChanges) {
      const title =
        [
          added ? `${added} lead baru` : "",
          updated ? `${updated} dikemas kini` : "",
          removed ? `${removed} dibuang` : "",
          agentSync.added ? `${agentSync.added} ejen baru` : "",
          agentSync.updated ? `${agentSync.updated} ejen dikemas kini` : "",
          agentSync.removed ? `${agentSync.removed} ejen dibuang` : "",
        ]
          .filter(Boolean)
          .join(", ") ||
        "Sync selesai";
      showToast(
        title,
        added || updated || removed
          ? "Dashboard dan Supabase telah diselaraskan dengan Google Sheet."
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
  if (!state.integration.endpoint || !isAdmin()) return;
  syncTimer = window.setInterval(
    () => syncGoogleSheet({ silent: true }),
    Math.max(15, Number(state.integration.interval) || 15) * 1000,
  );
}

async function saveIntegration(event) {
  event.preventDefault();
  state.integration.endpoint = elements.sheetEndpoint.value.trim();
  state.integration.interval = Number(elements.pollInterval.value) || 15;
  if (!state.integration.endpoint) {
    state.integration.connected = false;
    state.integration.lastSyncAt = null;
    saveState();
    if (supabaseMode) {
      await supabaseClient.from("app_settings").upsert({
        id: 1,
        google_sheet_endpoint: null,
        poll_interval: state.integration.interval,
        last_sync_at: null,
        round_robin_index: state.roundRobinIndex,
      });
    }
    scheduleSync();
    renderIntegration();
    showToast("Sambungan dipadam", "App kembali menggunakan mod demo.");
    return;
  }
  saveState();
  syncGoogleSheet();
}

function saveSupabaseConfig(event) {
  event.preventDefault();
  const url = elements.supabaseUrl.value.trim().replace(/\/+$/, "");
  const key = elements.supabaseKey.value.trim();
  if (!/^https:\/\/.+\.supabase\.co$/i.test(url) || !key) {
    elements.supabaseResult.classList.add("error");
    elements.supabaseResult.innerHTML =
      '<span class="status-dot"></span><span>Masukkan Project URL dan publishable / anon key yang sah.</span>';
    return;
  }
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, key }));
  localStorage.removeItem(SUPABASE_DISABLED_KEY);
  showToast("Konfigurasi Supabase disimpan", "App akan dimuat semula untuk mengaktifkan database.");
  window.setTimeout(() => window.location.reload(), 500);
}

async function disconnectSupabase() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  localStorage.removeItem(SUPABASE_CONFIG_KEY);
  localStorage.setItem(SUPABASE_DISABLED_KEY, "true");
  supabaseClient = null;
  supabaseMode = false;
  showToast("Supabase diputuskan", "App kembali menggunakan data tempatan.");
  window.setTimeout(() => window.location.reload(), 400);
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
  if (remove) deleteLeadEverywhere(remove.dataset.leadDelete);
  if (saveNote) saveLeadNote(saveNote.dataset.leadNoteSave, saveNote);
});
elements.manualLeadForm.addEventListener("submit", addManualLead);
elements.manualLeadPhone.addEventListener("input", () => {
  elements.manualLeadError.textContent = "";
});
elements.addAgentButton.addEventListener("click", openAgentModal);
elements.agentForm.addEventListener("submit", addAgent);
elements.agentPasswordForm.addEventListener("submit", updateAgentPassword);
elements.contactForm.addEventListener("submit", updateContact);
elements.integrationForm.addEventListener("submit", saveIntegration);
elements.syncNowButton.addEventListener("click", () => syncGoogleSheet());
elements.supabaseForm.addEventListener("submit", saveSupabaseConfig);
elements.supabaseDisconnect.addEventListener("click", disconnectSupabase);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "OPEN_DASHBOARD") switchView("dashboard");
  });
}

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(document.querySelector(`#${button.dataset.closeModal}`)));
});

elements.agentModal.addEventListener("click", (event) => {
  if (event.target === elements.agentModal) closeModal(elements.agentModal);
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
  const remove = event.target.closest("[data-agent-remove]");
  const password = event.target.closest("[data-agent-password]");
  if (toggle) toggleAgent(toggle.dataset.agentToggle);
  if (remove) removeAgent(remove.dataset.agentRemove);
  if (password) openAgentPasswordModal(password.dataset.agentPassword);
});

elements.contactDeleteButton.addEventListener("click", () => {
  const leadId = elements.contactDeleteButton.dataset.contactDelete || selectedContactId;
  if (leadId) deleteLeadEverywhere(leadId);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal(elements.agentModal);
    closeModal(elements.manualLeadModal);
    closeModal(elements.resetPasswordModal);
    closeModal(elements.agentPasswordModal);
    closeModal(elements.contactModal);
    elements.sidebar.classList.remove("open");
  }
});

async function bootstrap() {
  saveState();
  initSupabase();
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        window.setTimeout(openSupabaseRecoveryModal, 0);
      }
    });
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (session?.user) {
      const loaded = await loadRemoteState(session.user.id);
      if (loaded) {
        startAuthenticatedApp(getCurrentUser());
        return;
      }
    }
    showLogin();
    return;
  }

  const sessionUser = getSessionUser();
  if (sessionUser) {
    startAuthenticatedApp(sessionUser);
  } else {
    showLogin();
  }
}

bootstrap();
