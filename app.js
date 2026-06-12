const STORAGE_KEY = "leadlaju-state-v1";
const AUTH_KEY = "leadlaju-auth-v1";
const SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
const RESPONSE_WINDOW_MS = 5 * 60 * 1000;

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
      name: "Azlan Malik",
      phone: "+60 19-880 1142",
      email: "azlan@leadlaju.my",
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
    endpoint: "",
    interval: 30,
    lastSyncAt: null,
    connected: false,
  },
};

const demoNames = [
  ["Muhammad Faris", "+60 12-887 2341"],
  ["Siti Hajar", "+60 11-2098 7654"],
  ["Daniel Wong", "+60 16-543 9012"],
  ["Nurul Izzati", "+60 17-662 1180"],
  ["Arif Zulkifli", "+60 13-778 4501"],
  ["Priya Nair", "+60 18-920 3372"],
];

let state = loadState();
let activeView = "dashboard";
let tickTimer;
let syncTimer;
let toastTimer;
let lastRenderedActiveLeadKey = null;

const elements = {
  sidebar: document.querySelector("#sidebar"),
  loginScreen: document.querySelector("#login-screen"),
  appShell: document.querySelector("#app-shell"),
  loginForm: document.querySelector("#login-form"),
  loginEmail: document.querySelector("#login-email"),
  loginPassword: document.querySelector("#login-password"),
  loginError: document.querySelector("#login-error"),
  passwordToggle: document.querySelector("#password-toggle"),
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
  demoLeadButtons: [
    document.querySelector("#demo-lead-button"),
    document.querySelector("#demo-lead-button-2"),
  ],
  activityList: document.querySelector("#activity-list"),
  teamList: document.querySelector("#team-list"),
  onlineCount: document.querySelector("#online-count"),
  leadsTableBody: document.querySelector("#leads-table-body"),
  leadSearch: document.querySelector("#lead-search"),
  leadFilter: document.querySelector("#lead-filter"),
  agentsGrid: document.querySelector("#agents-grid"),
  addAgentButton: document.querySelector("#add-agent-button"),
  agentModal: document.querySelector("#agent-modal"),
  agentForm: document.querySelector("#agent-form"),
  integrationForm: document.querySelector("#integration-form"),
  sheetEndpoint: document.querySelector("#sheet-endpoint"),
  pollInterval: document.querySelector("#poll-interval"),
  syncNowButton: document.querySelector("#sync-now-button"),
  connectionResult: document.querySelector("#connection-result"),
  sidebarSyncText: document.querySelector("#sidebar-sync-text"),
  sidebarSyncStatus: document.querySelector("#sidebar-sync-status"),
  liveSyncLabel: document.querySelector("#live-sync-label"),
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
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function handleLogin(event) {
  event.preventDefault();
  const email = elements.loginEmail.value.trim().toLowerCase();
  const password = elements.loginPassword.value;
  if (!email || !password) {
    setLoginError("Masukkan emel dan kata laluan.");
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

function logout() {
  localStorage.removeItem(AUTH_KEY);
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

function addActivity(type, lead, message) {
  state.activities.unshift({
    id: makeId("activity"),
    type,
    leadId: lead.id,
    leadName: lead.name,
    message,
    createdAt: Date.now(),
  });
  state.activities = state.activities.slice(0, 80);
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

function addLead(input, options = {}) {
  const name = String(input.name || input.full_name || input.fullName || "").trim();
  const phone = String(input.phone || input.phone_number || input.mobile || "").trim();
  if (!name || !phone) return false;

  const sourceId = String(input.id || input.lead_id || "").trim();
  const dedupeKey = sourceId || `${normalizePhone(phone)}-${input.created_at || input.createdAt || ""}`;
  if (state.leads.some((lead) => lead.dedupeKey === dedupeKey)) return false;

  const assignedAgent = selectNextAgent();
  if (!assignedAgent) {
    showToast("Tiada ejen aktif", "Aktifkan sekurang-kurangnya seorang ejen dahulu.", "error");
    return false;
  }

  const createdAtValue = input.created_at || input.createdAt;
  const parsedCreatedAt = createdAtValue ? new Date(createdAtValue).getTime() : Date.now();
  const now = Date.now();
  const lead = {
    id: makeId("lead"),
    dedupeKey,
    name,
    phone,
    source: String(input.source || input.platform || "Google Sheet"),
    createdAt: Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : now,
    receivedAt: now,
    assignedAgentId: assignedAgent.id,
    expiresAt: now + RESPONSE_WINDOW_MS,
    status: "new",
    passCount: 0,
    responseMs: null,
  };

  state.leads.unshift(lead);
  addActivity("new", lead, `Lead baru diberikan kepada ${assignedAgent.name}`);
  saveState();

  if (!options.silent) {
    showToast("Lead baru masuk", `${lead.name} telah diberikan kepada ${assignedAgent.name}.`);
    sendSystemNotification(lead);
  }
  return true;
}

function addDemoLead() {
  const item = demoNames[Math.floor(Math.random() * demoNames.length)];
  addLead({
    id: makeId("demo"),
    name: item[0],
    phone: item[1],
    source: Math.random() > 0.5 ? "Meta Ads" : "TikTok Ads",
    created_at: new Date().toISOString(),
  });
  renderAll();
}

async function sendSystemNotification(lead) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const agent = getAgent(lead.assignedAgentId);
  new Notification("Lead baru perlu dihubungi", {
    body: `${lead.name} • ${lead.phone}\nDiberikan kepada ${agent?.name || "ejen"}.`,
    tag: lead.id,
  });
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("Tidak disokong", "Pelayar ini tidak menyokong notifikasi sistem.", "error");
    return;
  }
  if (Notification.permission === "granted") {
    showToast("Notifikasi aktif", "Anda akan dimaklumkan apabila lead baru masuk.");
    return;
  }
  const permission = await Notification.requestPermission();
  showToast(
    permission === "granted" ? "Notifikasi diaktifkan" : "Notifikasi belum aktif",
    permission === "granted"
      ? "Lead baru akan muncul sebagai notifikasi sistem."
      : "Benarkan notifikasi melalui tetapan pelayar untuk mengaktifkannya.",
    permission === "granted" ? "success" : "error",
  );
}

function processExpiredLeads() {
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

function handleCall(leadId) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead || lead.status !== "new") return;

  lead.status = "contacted";
  lead.contactedAt = Date.now();
  lead.responseMs = lead.contactedAt - lead.receivedAt;
  const agent = getAgent(lead.assignedAgentId);
  if (agent) agent.leadsHandled = (agent.leadsHandled || 0) + 1;
  addActivity("contacted", lead, `${agent?.name || "Ejen"} menekan CALL NOW`);
  saveState();
  showToast("Lead berjaya dikunci", `${lead.name} kini milik ${agent?.name || "ejen ini"}.`);
  renderAll();

  const callablePhone = lead.phone.replace(/[^\d+]/g, "");
  window.setTimeout(() => {
    window.location.href = `tel:${callablePhone}`;
  }, 250);
}

function getVisibleActiveLead() {
  const newLeads = state.leads
    .filter((lead) => lead.status === "new")
    .sort((a, b) => a.expiresAt - b.expiresAt);
  if (isAdmin()) return newLeads[0] || null;
  return newLeads.find((lead) => lead.assignedAgentId === state.currentUserId) || null;
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

  const activeLeadKey = `${lead.id}:${lead.assignedAgentId}`;
  if (lastRenderedActiveLeadKey !== activeLeadKey) {
    const fragment = elements.activeLeadTemplate.content.cloneNode(true);
    const article = fragment.querySelector(".lead-alert");
    const source = fragment.querySelector(".lead-source-badge");
    source.textContent = lead.source;
    source.classList.toggle("tiktok", lead.source.toLowerCase().includes("tiktok"));
    fragment.querySelector(".lead-arrival").textContent = `Masuk ${relativeTime(lead.receivedAt)}`;
    fragment.querySelector(".lead-avatar").textContent = initials(lead.name);
    fragment.querySelector(".lead-name").textContent = lead.name;
    fragment.querySelector(".lead-phone").textContent = lead.phone;
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
  const rows = state.leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(search) || lead.phone.toLowerCase().includes(search);
    const visualStatus = lead.status === "new" && lead.passCount > 0 ? "passed" : lead.status;
    return matchesSearch && (filter === "all" || visualStatus === filter);
  });

  elements.leadsTableBody.innerHTML = rows.length
    ? rows
        .map((lead) => {
          const visualStatus = lead.status === "new" && lead.passCount > 0 ? "passed" : lead.status;
          const statusLabel =
            visualStatus === "contacted" ? "Contacted" : visualStatus === "passed" ? "Passed" : "New";
          return `
            <tr>
              <td><strong>${escapeHtml(lead.name)}</strong><small>${escapeHtml(lead.phone)}</small></td>
              <td>${escapeHtml(lead.source)}</td>
              <td>${escapeHtml(getAgent(lead.assignedAgentId)?.name || "Tiada ejen")}</td>
              <td>${formatDateTime(lead.receivedAt)}</td>
              <td><span class="status-badge ${visualStatus}">${statusLabel}</span></td>
            </tr>`;
        })
        .join("")
    : `<tr><td class="table-empty" colspan="5">Tiada lead ditemui.</td></tr>`;
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
            <button type="button">${agent.active ? "Aktif menerima lead" : "Tidak aktif"}</button>
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
  elements.sheetEndpoint.value = integration.endpoint;
  elements.pollInterval.value = String(integration.interval);
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
  leads: "Semua Leads",
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

function addAgent(event) {
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
  elements.agentForm.reset();
  closeModal(elements.agentModal);
  showToast("Ejen didaftarkan", `${name} kini termasuk dalam giliran lead.`);
  renderAll();
}

function toggleAgent(agentId) {
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
  showToast(
    agent.active ? "Ejen diaktifkan" : "Ejen dinyahaktifkan",
    agent.active ? `${agent.name} akan menerima giliran lead.` : `${agent.name} dikeluarkan daripada giliran.`,
  );
  renderAll();
}

function removeAgent(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return;
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
  showToast("Ejen dibuang", `${agent.name} telah dikeluarkan daripada sistem.`);
  renderAll();
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
    if (!Array.isArray(rows)) throw new Error("Format JSON tidak sah");

    let added = 0;
    rows.forEach((row) => {
      if (addLead(row, { silent: true })) added += 1;
    });

    state.integration.endpoint = endpoint;
    state.integration.interval = Number(elements.pollInterval.value) || 30;
    state.integration.connected = true;
    state.integration.lastSyncAt = Date.now();
    saveState();
    scheduleSync();
    renderAll();
    if (!options.silent || added) {
      showToast(
        added ? `${added} lead baru` : "Sync selesai",
        added ? "Lead telah dimasukkan ke giliran pasukan." : "Tiada lead baru ditemui.",
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
    return false;
  }
}

function scheduleSync() {
  window.clearInterval(syncTimer);
  if (!state.integration.endpoint) return;
  syncTimer = window.setInterval(
    () => syncGoogleSheet({ silent: true }),
    Math.max(15, Number(state.integration.interval) || 30) * 1000,
  );
}

function saveIntegration(event) {
  event.preventDefault();
  state.integration.endpoint = elements.sheetEndpoint.value.trim();
  state.integration.interval = Number(elements.pollInterval.value) || 30;
  saveState();
  syncGoogleSheet();
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll("[data-view-link]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewLink));
});

elements.demoLeadButtons.forEach((button) => button.addEventListener("click", addDemoLead));
elements.notificationButton.addEventListener("click", requestNotifications);
elements.mobileMenu.addEventListener("click", () => elements.sidebar.classList.toggle("open"));
elements.loginForm.addEventListener("submit", handleLogin);
elements.loginEmail.addEventListener("input", () => setLoginError(""));
elements.loginPassword.addEventListener("input", () => setLoginError(""));
elements.passwordToggle.addEventListener("click", togglePasswordVisibility);
elements.sidebarSettings.addEventListener("click", logout);
elements.logoutButton.addEventListener("click", logout);
elements.leadSearch.addEventListener("input", renderLeadsTable);
elements.leadFilter.addEventListener("change", renderLeadsTable);
elements.addAgentButton.addEventListener("click", openAgentModal);
elements.agentForm.addEventListener("submit", addAgent);
elements.integrationForm.addEventListener("submit", saveIntegration);
elements.syncNowButton.addEventListener("click", () => syncGoogleSheet());

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(document.querySelector(`#${button.dataset.closeModal}`)));
});

elements.agentModal.addEventListener("click", (event) => {
  if (event.target === elements.agentModal) closeModal(elements.agentModal);
});

elements.agentsGrid.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-agent-toggle]");
  const remove = event.target.closest("[data-agent-remove]");
  if (toggle) toggleAgent(toggle.dataset.agentToggle);
  if (remove) removeAgent(remove.dataset.agentRemove);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal(elements.agentModal);
    elements.sidebar.classList.remove("open");
  }
});

saveState();
const sessionUser = getSessionUser();
if (sessionUser) {
  startAuthenticatedApp(sessionUser);
} else {
  showLogin();
}
