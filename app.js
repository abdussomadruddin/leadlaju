const STORAGE_KEY = "leadlaju-state-v1";
const AUTH_KEY = "leadlaju-auth-v1";
const NOTIFIED_LEADS_KEY = "leadlaju-notified-leads-v1";
const FOLLOW_UP_REMINDER_KEY = "leadlaju-follow-up-reminders-v1";
const ADMIN_REMINDER_DISMISSED_KEY = "leadlaju-admin-reminder-dismissed-v2";
const ADMIN_REMINDER_NOTIFIED_KEY = "leadlaju-admin-reminder-notified-v2";
const CONTACT_OUTBOX_DB = "leadlaju-contact-outbox-v1";
const CONTACT_OUTBOX_STORE = "actions";
const SUPABASE_CACHE_RESET_KEY = "leadlaju-supabase-cache-reset-v1";
const SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
const RESPONSE_WINDOW_MS = 5 * 60 * 1000;
const AGENT_COOLDOWN_MS = 5 * 60 * 1000;
const AGENT_PRESENCE_HEARTBEAT_MS = 5 * 60 * 1000;
const DEFAULT_AGENT_PASSWORD = "Agent123!";
const NOTIFICATION_ICON = "/assets/icon-192.png";
const NOTIFICATION_BADGE = "/assets/badge-96.png";
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const DEFAULT_SYNC_INTERVAL_SECONDS = 1;
const SIGNUP_PROJECT_SYNC_INTERVAL_SECONDS = 2;
const EXPIRY_WATCHDOG_INTERVAL_MS = 2500;
const EXPIRY_RETRY_DELAY_MS = 3000;
const FOLLOW_UP_REMINDER_SLOTS = [
  { time: "09:00", label: "9 pagi" },
  { time: "15:00", label: "3 petang" },
];
const FOLLOW_UP_REMINDER_WINDOW_MINUTES = 10;
const WEB_PUSH_PUBLIC_KEY =
  "BJRcHLhmZgPSdid007nVHluQhJY4MD3IlC-t0--hq2eWToRTovU_k5GZsEmmbJK596VHrj2N5ZMdUpzJX64F5R0";
const PABBLY_INGEST_ENDPOINT = "https://zvplvrtqvsfrftnjfdsh.supabase.co/functions/v1/ingest-lead";
const INTEGRATION_PROVIDERS = [
  { id: "meta_ads", label: "Meta Ads", source: "Meta Ads" },
  { id: "tiktok_ads", label: "TikTok Ads", source: "TikTok Ads" },
];
const DEFAULT_GOOGLE_SHEET_ENDPOINT = "";
const LEAD_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "all_offer_presented", label: "All Offer Presented" },
  { value: "need_follow_up", label: "Need Follow Up" },
  { value: "potential", label: "Potential" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "client", label: "Client" },
];
const LEAD_STATUS_LABELS = Object.fromEntries(LEAD_STATUS_OPTIONS.map((status) => [status.value, status.label]));
const AGENT_NOTE_REQUIRED_STATUSES = new Set(["passed", "rejected", "cancelled"]);
const APPOINTMENT_STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "show_up", label: "Show Up" },
  { value: "no_show", label: "No Show" },
  { value: "reschedule", label: "Reschedule" },
];

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
  appointments: [],
  projects: [
    { id: "project-armani", name: "Armani Putrajaya", active: true },
    { id: "project-bbsap", name: "BBSAP Sitiawan", active: true },
  ],
  activities: [],
  bulletins: [],
  bulletinUnreadCount: 0,
  followUpDue: [],
  followUpServerNow: null,
  followUpLoadedAt: null,
  roundRobinIndex: 0,
  integration: {
    endpoint: DEFAULT_GOOGLE_SHEET_ENDPOINT,
    interval: DEFAULT_SYNC_INTERVAL_SECONDS,
    lastSyncAt: null,
    connected: true,
  },
};

function resetLegacyGoogleSheetSessionOnce() {
  if (localStorage.getItem(SUPABASE_CACHE_RESET_KEY) === "done") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(AUTH_KEY);
  Object.keys(localStorage)
    .filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))
    .forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(SUPABASE_CACHE_RESET_KEY, "done");
}

resetLegacyGoogleSheetSessionOnce();
let state = loadState();
let activeView = "dashboard";
let tickTimer;
let syncTimer;
let expiryWatchdogTimer;
let expiryAssignmentTimer;
let expiryAssignmentTimerKey = "";
let syncInProgress = false;
let syncCompletionWaiters = [];
let initialAgentSyncPromise = null;
let signupProjectSyncTimer;
let followUpReminderTimer;
let toastTimer;
let lastRenderedActiveLeadKey = null;
let passwordResetRequest = null;
let remotePasswordRecoveryPending = false;
let selectedAgentId = null;
let editingAgentId = null;
let selectedContactId = null;
let selectedAppointmentLeadId = null;
let reschedulingAppointmentId = null;
let editingAppointmentId = null;
let pendingAppointmentRequestId = null;
let remoteDatabaseClient = null;
let remoteDatabaseMode = false;
let monitorLastCanonicalSyncAt = null;
let monitorSyncFailed = false;
let remoteDatabaseRequired = false;
const REMOTE_REQUEST_TIMEOUT_MS = 12000;
let remoteRealtimeChannels = [];
let remoteReloadTimer = null;
let claimingLeadId = null;
const pendingLeadStatusUpdates = new Map();
const leadStatusWriteTimes = new Map();
const pendingLeadNoteUpdates = new Map();
const pendingAgentApprovals = new Set();
const pendingAgentDeletions = new Set();
const authoritativelyDeletedAgentIds = new Set();
let serviceWorkerRegistrationPromise = null;
let cachedAssignmentCheckInProgress = false;
let notificationAudioContext = null;
let lastAgentPresenceHeartbeatAt = 0;
let deferredInstallPrompt = null;
let agentPushAccessReady = false;
let agentPushAccessCheckInProgress = false;
let pushSubscriptionSyncPromise = null;
let notificationRequestInProgress = false;
let notificationConnectionError = "";
const expandedProjectStatusIds = new Set();
let agentPresenceSessionStartedAt = 0;
let notifiedLeadKeys = loadNotifiedLeadKeys();
let sentFollowUpReminderKeys = loadFollowUpReminderKeys();
let dismissedAdminReminderKeys = loadAdminReminderKeys(ADMIN_REMINDER_DISMISSED_KEY);
let notifiedAdminReminderKeys = loadAdminReminderKeys(ADMIN_REMINDER_NOTIFIED_KEY);
let latestAdminReminder = null;
let pendingPotentialReminder = new URLSearchParams(window.location.search).get("reminder") === "potential";
let pendingNotificationLeadId = new URLSearchParams(window.location.search).get("lead") || "";
let pendingBulletinId = new URLSearchParams(window.location.search).get("bulletin") || "";
let globalLoadingCount = 0;
const expiryRequestStates = new Map();
const leadTimingDeliveries = new Map();
const authoritativeLeadGenerations = new Map();
let authoritativeStateGeneration = 0;
const locallyExpiredAssignments = new Set();
let leadLajuIntroShown = false;
let introRevealComplete = false;
let performanceReport = null;
let performanceRequestVersion = 0;
let selectedPerformanceAgentId = "";
let performanceLoadedAt = 0;
let ownPerformanceLoadedAt = 0;
let ownPerformanceLoading = false;
let teamPerformanceDays = 7;
const teamPerformanceCache = new Map();
const teamPerformancePending = new Set();
let initialDashboardSyncState = "idle";
let resumeSyncPending = false;
let runtimeWasHidden = false;
let lifecycleIntroTimer = null;
let lifecycleHideTimer = null;
let lifecycleSyncPromise = null;
let pendingLeadImportRows = [];
let integrationStatus = [];
let activeBrandId = "";
let activeBrand = null;
let signupBrand = null;
const salesContactStates = new Map();
function isTeamSales() { return activeBrand?.distribution_mode === "team_sales"; }
function workerLabel() { return isTeamSales() ? "Team Sales" : "Ejen"; }
function signupWorkerLabel() { return signupBrand?.distribution_mode === "team_sales" ? "Team Sales" : "ejen"; }
function projectLabel() { return isTeamSales() ? "Produk" : "Projek"; }
function systemWorkerText(text, sales = isTeamSales()) {
  return sales ? String(text)
    .replace(/\bProperty Agent\b|\bEjen\b|\bejen\b|\bAgent\b|\bagent\b/g, "Team Sales")
    .replace(/\bPROJEK\b/g, "PRODUK").replace(/\bProjek\b/g, "Produk").replace(/\bprojek\b/g, "produk") : text;
}
// Capture authored labels only, never lead names, notes or account details.
const workerLabelNodes = [];
const workerLabelWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (workerLabelWalker.nextNode()) {
  const node = workerLabelWalker.currentNode;
  if (/\b(ejen|agent|projek)\b/i.test(node.nodeValue) && !node.parentElement.closest('script,style,pre,code,#master-brand-form,#sidebar-user-name')) workerLabelNodes.push({ node, original: node.nodeValue, last: node.nodeValue });
}
const projectLabelAttributes = [...document.querySelectorAll('[placeholder],[aria-label],[title]')].flatMap(node =>
  ['placeholder', 'aria-label', 'title'].filter(attribute => /\bprojek\b/i.test(node.getAttribute(attribute) || ''))
    .map(attribute => ({node, attribute, original: node.getAttribute(attribute), last: node.getAttribute(attribute)})),
);
function updateWorkerLabels() {
  const sales = !elements.signupForm.hidden && signupBrand ? signupBrand.distribution_mode === 'team_sales' : isTeamSales();
  workerLabelNodes.forEach(item => {
    if (!item.node.isConnected || item.node.nodeValue !== item.last) return;
    item.last = systemWorkerText(item.original, sales);
    item.node.nodeValue = item.last;
  });
  projectLabelAttributes.forEach(item => {
    if (!item.node.isConnected || item.node.getAttribute(item.attribute) !== item.last) return;
    item.last = systemWorkerText(item.original, sales);
    item.node.setAttribute(item.attribute, item.last);
  });
  ['#lead-agent-filter','#follow-up-agent-filter','#monitor-agent-filter','#performance-agent','#bulletin-project','#appointment-project-filter','#follow-up-project-filter','#performance-project'].forEach(selector => {
    const select = document.querySelector(selector);
    select?.querySelectorAll('option').forEach(option => {
      if (!option.value || option.value === 'all' || option.value === 'unassigned') {
        option.dataset.agentLabel ||= option.textContent;
        option.textContent = systemWorkerText(option.dataset.agentLabel);
      }
    });
  });
  const help = document.querySelector('.performance-help p');
  if (help) {
    help.dataset.agentText ||= help.textContent;
    help.textContent = isTeamSales() ? 'Jumlah mengikut assignment dalam tempoh dipilih dan status lead semasa. Appointment dijadual semula tidak dikira dua kali. Follow Up Due ialah jumlah tertunggak sekarang. Call, WhatsApp dan Follow Up ialah tindakan direkod, bukan bukti pelanggan berjaya dihubungi.' : help.dataset.agentText;
  }
}
let masterBrands = [];
let masterAdmins = [];
let brandContextVersion = 0;
let pendingBrandRequestCount = 0;
let pendingBrandConfirmation = null;
function registrationBrandSlug(location) {
  const path = location.pathname || "/";
  const legacy = new URLSearchParams(location.search).get("brand");
  if (!/^\/daftar(?:\/|$)/.test(path) && legacy === null) return null;
  let slug;
  try {
    slug = /^\/daftar(?:\/|$)/.test(path)
      ? decodeURIComponent(path.replace(/^\/daftar\/?/, "").replace(/\/$/, ""))
      : legacy;
  } catch { return ""; }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80 ? slug : "";
}

function agentRegistrationUrl(brand) {
  if (!brand?.slug) return "";
  return new URL(`/daftar/${encodeURIComponent(brand.slug)}`, window.location.origin).href;
}

const signupBrandSlug = registrationBrandSlug(window.location);
let signupProjects = [];
let signupBrandReady = false;
const integrationRawKeys = new Map();
const integrationSecretTimers = new Map();

const elements = {
  sidebar: document.querySelector("#sidebar"),
  mobileSidebarScrim: document.querySelector("#mobile-sidebar-scrim"),
  mobileSidebarClose: document.querySelector("#mobile-sidebar-close"),
  mobileMoreTab: document.querySelector("#mobile-more-tab"),
  loginScreen: document.querySelector("#login-screen"),
  appShell: document.querySelector("#app-shell"),
  loginForm: document.querySelector("#login-form"),
  loginEmail: document.querySelector("#login-email"),
  loginPassword: document.querySelector("#login-password"),
  loginError: document.querySelector("#login-error"),
  passwordToggle: document.querySelector("#password-toggle"),
  forgotPasswordButton: document.querySelector("#forgot-password-button"),
  signupForm: document.querySelector("#signup-form"),
  signupLoginButton: document.querySelector("#signup-login-button"),
  signupName: document.querySelector("#signup-name"),
  signupPhone: document.querySelector("#signup-phone"),
  signupEmail: document.querySelector("#signup-email"),
  signupProjectCheckboxes: document.querySelector("#signup-project-checkboxes"),
  signupPassword: document.querySelector("#signup-password"),
  signupConfirmPassword: document.querySelector("#signup-confirm-password"),
  signupError: document.querySelector("#signup-error"),
  signupSuccessModal: document.querySelector("#signup-success-modal"),
  closeSignupSuccess: document.querySelector("#close-signup-success"),
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
  accountMenu: document.querySelector("#account-menu"),
  editOwnDetails: document.querySelector("#edit-own-details"),
  accountLogout: document.querySelector("#account-logout"),
  ownDetailsModal: document.querySelector("#own-details-modal"),
  ownDetailsForm: document.querySelector("#own-details-form"),
  ownName: document.querySelector("#own-name"),
  ownPassword: document.querySelector("#own-password"),
  ownPasswordConfirm: document.querySelector("#own-password-confirm"),
  ownDetailsError: document.querySelector("#own-details-error"),
  logoutConfirmModal: document.querySelector("#logout-confirm-modal"),
  logoutConfirmMessage: document.querySelector("#logout-confirm-message"),
  logoutCancel: document.querySelector("#logout-cancel"),
  logoutContinue: document.querySelector("#logout-continue"),
  sidebarAvatar: document.querySelector("#sidebar-avatar"),
  sidebarUserName: document.querySelector("#sidebar-user-name"),
  sidebarUserRole: document.querySelector("#sidebar-user-role"),
  activeLeadContainer: document.querySelector("#active-lead-container"),
  activeLeadTemplate: document.querySelector("#active-lead-template"),
  queueLabel: document.querySelector("#queue-label"),
  navLeadCount: document.querySelector("#nav-lead-count"),
  navAppointmentCount: document.querySelector("#nav-appointment-count"),
  navFollowUpCount: document.querySelector("#nav-follow-up-count"),
  navBulletinCount: document.querySelector("#nav-bulletin-count"),
  notificationCount: document.querySelector("#notification-count"),
  notificationButton: document.querySelector("#notification-button"),
  refreshButton: document.querySelector("#refresh-button"),
  notificationRequiredModal: document.querySelector("#notification-required-modal"),
  potentialReminderModal: document.querySelector("#potential-reminder-modal"),
  potentialReminderTitle: document.querySelector("#potential-reminder-title"),
  potentialReminderDescription: document.querySelector("#potential-reminder-description"),
  closePotentialReminder: document.querySelector("#close-potential-reminder"),
  leadAvailabilityModal: document.querySelector("#lead-availability-modal"),
  leadAvailabilityKicker: document.querySelector("#lead-availability-kicker"),
  leadAvailabilityTitle: document.querySelector("#lead-availability-title"),
  leadAvailabilityDescription: document.querySelector("#lead-availability-description"),
  closeLeadAvailability: document.querySelector("#close-lead-availability"),
  globalLoadingOverlay: document.querySelector("#global-loading-overlay"),
  globalLoadingMessage: document.querySelector("#global-loading-message"),
  lifecycleSyncOverlay: document.querySelector("#lifecycle-sync-overlay"),
  enableRequiredNotifications: document.querySelector("#enable-required-notifications"),
  addToHomeScreen: document.querySelector("#add-to-home-screen"),
  homeScreenHelp: document.querySelector("#home-screen-help"),
  homeScreenHelpTitle: document.querySelector("#home-screen-help-title"),
  homeScreenHelpMessage: document.querySelector("#home-screen-help-message"),
  remindAgentsButton: document.querySelector("#remind-agents-button"),
  adminReminderAlert: document.querySelector("#admin-reminder-alert"),
  adminReminderTitle: document.querySelector("#admin-reminder-title"),
  adminReminderMessage: document.querySelector("#admin-reminder-message"),
  dismissAdminReminderButton: document.querySelector("#dismiss-admin-reminder"),
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
  leadReadyList: document.querySelector("#lead-ready-list"),
  leadReadyCount: document.querySelector("#lead-ready-count"),
  agentLeadControls: document.querySelector("#agent-lead-controls"),
  agentLeadStatus: document.querySelector("#agent-lead-status"),
  agentLeadStatusMessage: document.querySelector("#agent-lead-status-message"),
  getLeadButton: document.querySelector("#get-lead-button"),
  stopLeadButton: document.querySelector("#stop-lead-button"),
  leadsTableBody: document.querySelector("#leads-table-body"),
  leadSearch: document.querySelector("#lead-search"),
  leadFilter: document.querySelector("#lead-filter"),
  leadFollowUpFilter: document.querySelector("#lead-follow-up-filter"),
  leadAgentFilter: document.querySelector("#lead-agent-filter"),
  leadPeriodFilter: document.querySelector("#lead-period-filter"),
  leadLogCount: document.querySelector("#lead-log-count"),
  leadLogMoreWrap: document.querySelector("#lead-log-more-wrap"),
  leadLogMore: document.querySelector("#lead-log-more"),
  navMonitorCount: document.querySelector("#nav-monitor-count"),
  monitorHealth: document.querySelector("#monitor-health"),
  monitorCriticalCount: document.querySelector("#monitor-critical-count"),
  monitorWarningCount: document.querySelector("#monitor-warning-count"),
  monitorCheckedAt: document.querySelector("#monitor-checked-at"),
  monitorSeverityFilter: document.querySelector("#monitor-severity-filter"),
  monitorAgentFilter: document.querySelector("#monitor-agent-filter"),
  monitorResultCount: document.querySelector("#monitor-result-count"),
  monitorList: document.querySelector("#monitor-list"),
  monitorRefreshButton: document.querySelector("#monitor-refresh-button"),
  appointmentList: document.querySelector("#appointment-list"),
  appointmentCount: document.querySelector("#appointment-count"),
  appointmentStatusFilter: document.querySelector("#appointment-status-filter"),
  appointmentProjectFilter: document.querySelector("#appointment-project-filter"),
  appointmentPeriodFilter: document.querySelector("#appointment-period-filter"),
  appointmentModal: document.querySelector("#appointment-modal"),
  appointmentForm: document.querySelector("#appointment-form"),
  appointmentModalKicker: document.querySelector("#appointment-modal-kicker"),
  appointmentModalTitle: document.querySelector("#appointment-modal-title"),
  appointmentLeadSummary: document.querySelector("#appointment-lead-summary"),
  appointmentType: document.querySelector("#appointment-type"),
  appointmentScheduledAt: document.querySelector("#appointment-scheduled-at"),
  appointmentLocation: document.querySelector("#appointment-location"),
  appointmentNotes: document.querySelector("#appointment-notes"),
  appointmentFormError: document.querySelector("#appointment-form-error"),
  appointmentSubmitButton: document.querySelector("#appointment-submit-button"),
  followUpDueList: document.querySelector("#follow-up-due-list"),
  followUpCount: document.querySelector("#follow-up-count"),
  followUpAgentFilter: document.querySelector("#follow-up-agent-filter"),
  followUpProjectFilter: document.querySelector("#follow-up-project-filter"),
  followUpPeriodFilter: document.querySelector("#follow-up-period-filter"),
  contactModal: document.querySelector("#contact-modal"),
  contactForm: document.querySelector("#contact-form"),
  contactName: document.querySelector("#contact-name"),
  contactPhone: document.querySelector("#contact-phone"),
  contactEmail: document.querySelector("#contact-email"),
  contactProject: document.querySelector("#contact-project"),
  contactNotes: document.querySelector("#contact-notes"),
  contactFormError: document.querySelector("#contact-form-error"),
  contactStatus: document.querySelector("#contact-status"),
  agentsGrid: document.querySelector("#agents-grid"),
  ownPerformance: document.querySelector("#own-performance"),
  ownPerformanceStatus: document.querySelector("#own-performance-status"),
  ownPerformanceMetrics: document.querySelector("#own-performance-metrics"),
  performancePeriod: document.querySelector("#performance-period"),
  performanceFrom: document.querySelector("#performance-from"),
  performanceTo: document.querySelector("#performance-to"),
  performanceProject: document.querySelector("#performance-project"),
  performanceAgent: document.querySelector("#performance-agent"),
  performanceStatus: document.querySelector("#performance-status"),
  performanceCards: document.querySelector("#performance-cards"),
  performanceRows: document.querySelector("#performance-rows"),
  performanceDetail: document.querySelector("#performance-detail"),
  performanceDetailTitle: document.querySelector("#performance-detail-title"),
  performanceWeeks: document.querySelector("#performance-weeks"),
  performanceDownload: document.querySelector("#performance-download"),
  projectsList: document.querySelector("#projects-list"),
  projectForm: document.querySelector("#project-form"),
  projectName: document.querySelector("#project-name"),
  addAgentButton: document.querySelector("#add-agent-button"),
  getLeadAllAgentsButton: document.querySelector("#get-lead-all-agents-button"),
  stopLeadAllAgentsButton: document.querySelector("#stop-lead-all-agents-button"),
  agentModal: document.querySelector("#agent-modal"),
  agentForm: document.querySelector("#agent-form"),
  agentModalKicker: document.querySelector("#agent-modal-kicker"),
  agentModalTitle: document.querySelector("#agent-modal-title"),
  agentName: document.querySelector("#agent-name"),
  agentPhone: document.querySelector("#agent-phone"),
  agentEmail: document.querySelector("#agent-email"),
  agentPassword: document.querySelector("#agent-password"),
  agentProjectCheckboxes: document.querySelector("#agent-project-checkboxes"),
  agentPasswordLabel: document.querySelector("#agent-password-label"),
  agentSubmitButton: document.querySelector("#agent-submit-button"),
  agentPasswordModal: document.querySelector("#agent-password-modal"),
  agentPasswordForm: document.querySelector("#agent-password-form"),
  agentPasswordDescription: document.querySelector("#agent-password-description"),
  agentNewPassword: document.querySelector("#agent-new-password"),
  agentConfirmPassword: document.querySelector("#agent-confirm-password"),
  agentPasswordError: document.querySelector("#agent-password-error"),
  leadImportFile: document.querySelector("#lead-import-file"),
  leadImportStatus: document.querySelector("#lead-import-status"),
  leadImportSummary: document.querySelector("#lead-import-summary"),
  leadImportPreview: document.querySelector("#lead-import-preview"),
  leadImportCount: document.querySelector("#lead-import-count"),
  uploadLeadsButton: document.querySelector("#upload-leads-button"),
  clearLeadImport: document.querySelector("#clear-lead-import"),
  downloadSampleCsv: document.querySelector("#download-sample-csv"),
  downloadSampleXlsx: document.querySelector("#download-sample-xlsx"),
  integrationConnectors: document.querySelector("#integration-connectors"),
  integrationEndpoint: document.querySelector("#integration-endpoint"),
  integrationProjects: document.querySelector("#integration-projects"),
  refreshIntegrations: document.querySelector("#refresh-integrations"),
  copyIntegrationEndpoint: document.querySelector("#copy-integration-endpoint"),
  bulletinForm: document.querySelector("#bulletin-form"),
  bulletinId: document.querySelector("#bulletin-id"),
  bulletinTitle: document.querySelector("#bulletin-title"),
  bulletinProject: document.querySelector("#bulletin-project"),
  bulletinBody: document.querySelector("#bulletin-body"),
  bulletinCtaText: document.querySelector("#bulletin-cta-text"),
  bulletinCtaUrl: document.querySelector("#bulletin-cta-url"),
  bulletinError: document.querySelector("#bulletin-error"),
  bulletinSubmit: document.querySelector("#bulletin-submit"),
  bulletinCancelEdit: document.querySelector("#bulletin-cancel-edit"),
  bulletinFeatured: document.querySelector("#bulletin-featured"),
  bulletinHistory: document.querySelector("#bulletin-history"),
  liveSyncLabel: document.querySelector("#live-sync-label"),
  resetCodeFields: document.querySelector("#reset-code-fields"),
  toast: document.querySelector("#toast"),
  toastTitle: document.querySelector("#toast-title"),
  toastMessage: document.querySelector("#toast-message"),
  statToday: document.querySelector("#stat-today"),
  statContacted: document.querySelector("#stat-contacted"),
  statResponse: document.querySelector("#stat-response"),
  statConversion: document.querySelector("#stat-conversion"),
  pickupDetails: document.querySelector("#pickup-details"),
  contactRate: document.querySelector("#contact-rate"),
};

function normalizeIntegration(input = {}) {
  const endpoint = String(input.endpoint || DEFAULT_GOOGLE_SHEET_ENDPOINT).trim() || DEFAULT_GOOGLE_SHEET_ENDPOINT;
  return {
    ...defaultState.integration,
    ...input,
    endpoint,
    interval: DEFAULT_SYNC_INTERVAL_SECONDS,
    connected: input.connected !== false || endpoint === DEFAULT_GOOGLE_SHEET_ENDPOINT,
  };
}

function normalizeProjectIds(value) {
  const raw = Array.isArray(value) ? value : (() => {
    try { return JSON.parse(String(value || "[]")); } catch { return String(value || "").split(","); }
  })();
  return [...new Set((Array.isArray(raw) ? raw : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function sameProjectIds(first, second) {
  const left = normalizeProjectIds(first).sort();
  const right = normalizeProjectIds(second).sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function normalizeProjects(rows) {
  return (Array.isArray(rows) ? rows : []).map((project) => ({
    id: String(project.id || project.project_id || "").trim(),
    name: String(project.name || project.project || project.nama || "").trim(),
    active: project.active !== false && !["inactive", "false", "0", "off"].includes(String(project.status || "").toLowerCase()),
    createdAt: project.created_at || project.createdAt || null,
  })).filter((project) => project.id && project.name);
}

function normalizeAppointmentStatus(value) {
  const status = String(value || "scheduled").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return APPOINTMENT_STATUS_OPTIONS.some((option) => option.value === status) ? status : "scheduled";
}

function formatAppointmentStatus(value) {
  return APPOINTMENT_STATUS_OPTIONS.find((option) => option.value === normalizeAppointmentStatus(value))?.label || "Scheduled";
}

function normalizeAppointments(rows) {
  return (Array.isArray(rows) ? rows : []).map((appointment) => ({
    id: String(appointment.id || appointment.appointment_id || "").trim(),
    leadId: String(appointment.lead_id || appointment.leadId || "").trim(),
    leadName: String(appointment.lead_name || appointment.leadName || "").trim(),
    project: String(appointment.project || "").trim(),
    type: String(appointment.type || "Site Visit").trim(),
    scheduledAt: parseLeadTimestamp(appointment.scheduled_at || appointment.scheduledAt, Date.now()),
    location: String(appointment.location || "").trim(),
    notes: String(appointment.notes || "").trim(),
    status: normalizeAppointmentStatus(appointment.status),
    parentAppointmentId: String(appointment.parent_appointment_id || appointment.parentAppointmentId || "").trim(),
    assignedAgentId: String(appointment.assigned_agent_id || appointment.assignedAgentId || "").trim(),
    assignedAgentName: String(appointment.assigned_agent_name || appointment.assignedAgentName || "").trim(),
  })).filter((appointment) => appointment.id && appointment.leadId);
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
      eligibleProjectIds: normalizeProjectIds(agent.eligibleProjectIds || agent.eligible_project_ids),
    }));
    merged.projects = normalizeProjects(saved.projects).length ? normalizeProjects(saved.projects) : structuredClone(defaultState.projects);
    merged.appointments = normalizeAppointments(saved.appointments);
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

function openContactOutbox() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(CONTACT_OUTBOX_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CONTACT_OUTBOX_STORE)) {
        const store = database.createObjectStore(CONTACT_OUTBOX_STORE, { keyPath: "actionId" });
        store.createIndex("agentId", "agentId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Outbox unavailable"));
  });
}

async function writeContactOutbox(action) {
  const database = await openContactOutbox();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CONTACT_OUTBOX_STORE, "readwrite");
    transaction.objectStore(CONTACT_OUTBOX_STORE).put(action);
    transaction.oncomplete = () => { database.close(); resolve(true); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

async function deleteContactOutbox(actionId) {
  const database = await openContactOutbox();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CONTACT_OUTBOX_STORE, "readwrite");
    transaction.objectStore(CONTACT_OUTBOX_STORE).delete(actionId);
    transaction.oncomplete = () => { database.close(); resolve(true); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

async function readContactOutbox(agentId) {
  const database = await openContactOutbox();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CONTACT_OUTBOX_STORE, "readonly");
    const request = transaction.objectStore(CONTACT_OUTBOX_STORE).index("agentId").getAll(agentId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function submitContactAction(action) {
  const { data, error } = await remoteDatabaseClient.rpc(action.actionType === "team_sales_contact" ? "team_sales_contact" : "contact_assignment", {
    p_action_id: action.actionId,
    p_lead_id: action.leadId,
    p_assignment_revision: action.assignmentRevision,
    ...(action.actionType === "team_sales_contact" ? { p_channel: action.channel } : {}),
  });
  if (error) {
    if (action.actionType === "team_sales_contact" && ["42501", "P0001", "23505"].includes(error.code)) {
      error.authoritativeRejection = true;
      await writeContactOutbox({ ...action, state: "conflict", error: error.message }).catch(() => false);
    }
    throw error;
  }
  if (!data?.ok) {
    const rejection = new Error(data?.error || "CALL NOW rejected by canonical server state");
    rejection.authoritativeRejection = true;
    await writeContactOutbox({
      ...action,
      state: "conflict",
      error: rejection.message,
      resolvedAt: Date.now(),
    }).catch(() => false);
    throw rejection;
  }
  await deleteContactOutbox(action.actionId).catch(() => false);
  return data;
}

async function flushContactOutbox() {
  if (!remoteDatabaseMode || !remoteDatabaseClient || !navigator.onLine) return false;
  const user = getCurrentUser();
  if (!user?.id || (user.role !== "agent" && !isTeamSales())) return false;
  const actions = (await readContactOutbox(user.id).catch(() => []))
    .filter((action) => !action.state || action.state === "pending");
  for (const action of actions) {
    if (action.brandId && action.brandId !== activeBrandId) continue;
    await submitContactAction(action).then(() => salesContactStates.delete(action.leadId)).catch(error => {
      if (action.actionType === "team_sales_contact") salesContactStates.set(action.leadId, error.authoritativeRejection ? "failed" : "pending");
    });
  }
  if (actions.length) queueRemoteReload();
  return true;
}

async function loadRemoteDatabaseConfig() {
  try {
    const response = await fetch("/api/runtime-config", { cache: "no-store" });
    if (!response.ok) return null;
    const config = await response.json();
    if (config.backend !== "supabase" || !config.supabaseUrl || !config.supabasePublishableKey) return null;
    return config;
  } catch (error) {
    console.error("Supabase runtime config failed", error);
    return null;
  }
}

async function initRemoteDatabase() {
  remoteDatabaseClient = null;
  remoteDatabaseMode = false;
  remoteDatabaseRequired = window.location.protocol !== "file:" && !new URLSearchParams(window.location.search).has("demo");
  const config = await loadRemoteDatabaseConfig();
  if (!config) return null;
  try {
    const { createClient } = await Promise.race([
      import("https://esm.sh/@supabase/supabase-js@2.116.0"),
      new Promise((_, reject) => window.setTimeout(
        () => reject(new Error("Supabase client initialization timed out")),
        REMOTE_REQUEST_TIMEOUT_MS,
      )),
    ]);
    remoteDatabaseClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: async (url, options = {}) => {
        const headers = new Headers(options.headers);
        if (activeBrandId) headers.set("x-leadlaju-brand", activeBrandId);
        pendingBrandRequestCount++;
        const controller = new AbortController();
        const abort = () => controller.abort();
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) controller.abort();
        const timeout = window.setTimeout(abort, REMOTE_REQUEST_TIMEOUT_MS);
        try { return await fetch(url, { ...options, headers, signal: controller.signal }); }
        finally { window.clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); pendingBrandRequestCount--; }
      } },
    });
    // Keep this callback synchronous: Auth holds its initialization lock here.
    remoteDatabaseClient.auth.onAuthStateChange?.((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) remotePasswordRecoveryPending = true;
    });
    return remoteDatabaseClient;
  } catch (error) {
    console.error("Supabase client initialization failed", error);
    remoteDatabaseClient = null;
    return null;
  }
}

function mapProfile(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    email: row.email,
    role: row.role || "agent",
    brandId: row.brand_id || null,
    approvalStatus: row.approval_status || (row.active ? "approved" : "pending"),
    active: row.active !== false && row.approval_status !== "pending" && row.approval_status !== "rejected",
    leadsHandled: row.leads_handled || 0,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
    cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until).getTime() : null,
    eligibleProjectIds: normalizeProjectIds(row.eligible_project_ids),
    leadReady: Boolean(row.lead_ready),
    online: Boolean(row.presence_lease_until && new Date(row.presence_lease_until).getTime() > Date.now()),
    notificationEnabled: Boolean(row.notification_ready),
  };
}

function mapLead(row) {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key || row.id,
    brandId: row.brand_id || null,
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    project: row.project || "Tidak dinyatakan",
    source: normalizeLeadSource(row.source || "Manual Lead"),
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
    receivedAt: new Date(row.received_at || row.created_at).getTime(),
    assignedAgentId: row.assigned_agent_id,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    status: row.status || "new",
    passCount: row.pass_count || 0,
    assignmentRevision: Number(row.assignment_revision) || 0,
    statusRevision: Number(row.status_revision) || 0,
    assignmentHistory: Array.isArray(row.assignment_history) ? row.assignment_history : [],
    queueState: String(row.queue_state || "").toLowerCase(),
    responseMs: row.response_ms,
    contactedAt: row.contacted_at ? new Date(row.contacted_at).getTime() : null,
    followUpActivityAt: row.follow_up_activity_at ? new Date(row.follow_up_activity_at).getTime() : null,
    followUpCount: Number(row.follow_up_count) || 0,
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

let lastRemoteLoadError = null;
function isTransientRemoteLoadError(error) {
  return ['57014', '53300', '57P01', '08000', '08006'].includes(error?.code) ||
    [502, 503, 504].includes(Number(error?.status)) ||
    /timeout|timed out|failed to fetch|network|fetch failed|aborterror|aborted|load failed|connection.*(closed|reset)/i.test(`${error?.name || ''} ${error?.message || ''}`);
}

async function readDashboardSnapshot() {
  const controller = new AbortController();
  let timer;
  const request = remoteDatabaseClient.rpc('get_dashboard_state');
  request.abortSignal?.(controller.signal);
  try {
    return await Promise.race([request, new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        controller.abort();
        reject(new Error('Supabase dashboard request timed out'));
      }, REMOTE_REQUEST_TIMEOUT_MS);
    })]);
  } finally { window.clearTimeout(timer); }
}

async function loadRemoteState(userId, attempt = 0) {
  if (!remoteDatabaseClient || !userId) return false;
  const requestBrandVersion = brandContextVersion;
  const wasRemoteDatabaseMode = remoteDatabaseMode;
  const remoteLoadGeneration = authoritativeStateGeneration;
  const locallyCommittedLeads = state.leads.slice();
  const preserveBulletinState = state.currentUserId === userId;
  const locallyLoadedBulletins = preserveBulletinState && Array.isArray(state.bulletins) ? state.bulletins : [];
  const locallyLoadedBulletinUnreadCount = preserveBulletinState ? Number(state.bulletinUnreadCount) || 0 : 0;
  const previousLeadKeys = new Set(state.leads.map(leadNotificationKey));
  const shouldDetectNewLeads = false;
  try {
    if (!activeBrandId || state.currentUserId !== userId) {
      activeBrandId = "";
      const { data: profile, error: profileError } = await remoteDatabaseClient.from("profiles").select("id,role,brand_id").eq("id", userId).single();
      if (profileError) throw profileError;
      if (profile.role === "master") {
        const result = await remoteDatabaseClient.rpc("master_manage_brand", { p_action: "list" });
        if (result.error) throw result.error;
        masterBrands = result.data?.brands || [];
        const remembered = sessionStorage.getItem(`leadlaju-master-brand:${userId}`);
        activeBrandId = masterBrands.find(b => b.id === remembered && b.active)?.id || masterBrands.find(b => b.active)?.id || "";
        if (!activeBrandId) {
          const own = await remoteDatabaseClient.from("profiles").select("*").eq("id", userId).single();
          if (own.error) throw own.error;
          state = { ...structuredClone(defaultState), currentUserId: userId, agents: [mapProfile(own.data)], leads: [], projects: [], appointments: [], activities: [], bulletins: [], followUpDue: [] };
          activeBrand = null;
          remoteDatabaseMode = true;
          lastRemoteLoadError = null;
          return true;
        }
      } else activeBrandId = profile.brand_id;
    }
    const brandResult = await remoteDatabaseClient.from("brands").select("id,name,slug,active,distribution_mode").eq("id", activeBrandId).single();
    if (brandResult.error) throw brandResult.error;
    if (!brandResult.data?.active) throw new Error("Brand tidak aktif. Hubungi Master.");
    if (requestBrandVersion !== brandContextVersion) return false;
    activeBrand = brandResult.data;
    const { data: snapshot, error } = await readDashboardSnapshot();
    if (error) throw error;
    if (requestBrandVersion !== brandContextVersion) return false;
    const profiles = (snapshot?.profiles || []).map(mapProfile);
    const currentUser = profiles.find((agent) => agent.id === userId);
    if (!currentUser) throw new Error("Profil pengguna belum tersedia.");

    const remoteLeads = (snapshot?.leads || []).map(mapLead);
    // A request started before a push snapshot can return without that assignment.
    // Keep the newer local canonical snapshot until a later authoritative read catches up.
    locallyCommittedLeads.forEach((localLead) => {
      if (!wasLeadCommittedAfterSyncStarted(localLead, remoteLoadGeneration)) return;
      const index = remoteLeads.findIndex((remoteLead) =>
        remoteLead.id === localLead.id || remoteLead.dedupeKey === localLead.dedupeKey,
      );
      const remoteLead = index >= 0 ? remoteLeads[index] : null;
      const remoteIsOlder = !remoteLead || (
        (Number(remoteLead.assignmentRevision) || 0) <= (Number(localLead.assignmentRevision) || 0) &&
        (Number(remoteLead.statusRevision) || 0) <= (Number(localLead.statusRevision) || 0)
      );
      if (remoteIsOlder) {
        if (index >= 0) remoteLeads[index] = localLead;
        else remoteLeads.push(localLead);
      }
    });

    state = {
      ...structuredClone(defaultState),
      currentUserId: userId,
      agents: profiles,
      leads: remoteLeads,
      activities: (snapshot?.events || []).map(mapActivity),
      appointments: normalizeAppointments(snapshot?.appointments),
      projects: normalizeProjects(snapshot?.projects),
      bulletins: locallyLoadedBulletins,
      bulletinUnreadCount: locallyLoadedBulletinUnreadCount,
      roundRobinIndex: state.roundRobinIndex || 0,
      integration: normalizeIntegration({
        endpoint: "",
        interval: DEFAULT_SYNC_INTERVAL_SECONDS,
        connected: true,
        lastSyncAt: Date.now(),
      }),
    };
    remoteDatabaseMode = true;
    await loadFollowUpDueFeed();
    if (requestBrandVersion !== brandContextVersion) return false;
    monitorLastCanonicalSyncAt = Date.now();
    monitorSyncFailed = false;
    saveState();
    if (shouldDetectNewLeads) {
      await notifyForNewVisibleLeads(previousLeadKeys);
    } else {
      markCurrentLeadNotificationsSeen();
    }
    lastRemoteLoadError = null;
    return true;
  } catch (error) {
    console.error("Remote load failed", error);
    if (requestBrandVersion !== brandContextVersion) return false;
    lastRemoteLoadError = error;
    if (isTransientRemoteLoadError(error) && attempt < 2) {
      if (loginPending) setLoginError('Sambungan sementara perlahan. Mencuba semula…');
      await new Promise(resolve => window.setTimeout(resolve, attempt ? 1000 : 400));
      if (requestBrandVersion !== brandContextVersion) return false;
      return loadRemoteState(userId, attempt + 1);
    }
    monitorSyncFailed = true;
    if (activeView === "lead-monitor") renderLeadMonitor();
    remoteDatabaseMode = wasRemoteDatabaseMode;
    return false;
  }
}

async function subscribeToRemoteDatabase() {
  if (!remoteDatabaseClient || !remoteDatabaseMode || !state.currentUserId) return null;
  remoteRealtimeChannels.forEach((channel) => remoteDatabaseClient.removeChannel(channel));
  remoteRealtimeChannels = [];
  await remoteDatabaseClient.realtime.setAuth();
  const topics = [`user:${state.currentUserId}`];
  if (isAdmin() && activeBrandId) topics.push(`brand:${activeBrandId}:operations`);
  const subscriptionBrandVersion = brandContextVersion;
  topics.forEach((topic) => {
    const channel = remoteDatabaseClient.channel(topic, { config: { private: true } })
      .on("broadcast", { event: "*" }, message => { if (subscriptionBrandVersion === brandContextVersion) handleRemoteBroadcast(message); })
      .subscribe((status) => {
        if (subscriptionBrandVersion !== brandContextVersion) return;
        if (status === "SUBSCRIBED") {
          queueRemoteReload();
          loadBulletinFeed().then(() => renderBulletins()).catch((error) => console.warn("Realtime bulletin catch-up failed", error));
          loadFollowUpDueFeed().then(() => renderFollowUpDue()).catch((error) => console.warn("Realtime follow-up catch-up failed", error));
        }
      });
    remoteRealtimeChannels.push(channel);
  });
  return remoteRealtimeChannels;
}

function handleRemoteBroadcast(message) {
  if (message?.event === "brand_suspended" && !isMaster()) {
    logout();
    showToast("Brand dinyahaktifkan", "Hubungi Master untuk akses semula.", "error");
    return;
  }
  if (message?.event === "bulletin_changed") {
    loadBulletinFeed().then(() => renderBulletins()).catch((error) => console.warn("Realtime bulletin refresh failed", error));
    return;
  }
  if (message?.event !== "assignment_snapshot") {
    queueRemoteReload();
    return;
  }
  const leadSnapshot = message?.payload?.leadSnapshot;
  if (!leadSnapshot) {
    queueRemoteReload();
    return;
  }
  acceptAssignmentSnapshot(leadSnapshot)
    .catch((error) => console.warn("Realtime assignment snapshot failed", error))
    .finally(queueRemoteReload);
}

let realtimeReloadRunning = false;
let realtimeReloadRequested = false;
function queueRemoteReload() {
  realtimeReloadRequested = true;
  if (realtimeReloadRunning || !remoteDatabaseMode || !state.currentUserId) return;
  realtimeReloadRunning = true;
  return (async () => {
    try {
      while (realtimeReloadRequested && remoteDatabaseMode && state.currentUserId) {
        realtimeReloadRequested = false;
        const version = brandContextVersion;
        if (await loadRemoteState(state.currentUserId) && version === brandContextVersion) {
          teamPerformanceCache.clear();
          renderAll();
        }
      }
    } finally { realtimeReloadRunning = false; }
  })();
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

function startAuthenticatedApp(user, options = {}) {
  state.currentUserId = user.id;
  if (user.role === "agent") agentPresenceSessionStartedAt = Date.now();
  saveState();
  // Cover the login screen before swapping shells, so the first dashboard paint
  // happens behind the intro instead of briefly exposing an unrendered view.
  if (options.freshLogin) {
    elements.lifecycleSyncOverlay.classList.add("login-transition-cover");
    showLifecycleSyncOverlay("cinematic");
  }
  document.body.classList.remove("auth-pending", "logged-out");
  document.body.classList.add("authenticated");
  if (options.freshLogin) {
    window.requestAnimationFrame(() => elements.lifecycleSyncOverlay.classList.remove("login-transition-cover"));
  }
  elements.appShell.setAttribute("aria-hidden", "false");
  elements.loginError.textContent = "";
  elements.loginForm.reset();
  elements.loginPassword.type = "password";
  elements.passwordToggle.setAttribute("aria-label", "Tunjukkan kata laluan");
  if (options.restoredSession) leadLajuIntroShown = true;
  const startupSync = options.freshLogin
    ? beginColdStartSync()
    : leadLajuIntroShown ? beginResumeSync() : beginColdStartSync();

  window.clearInterval(tickTimer);
  tickTimer = window.setInterval(() => {
    clearExpiredLocalCooldowns();
    updateCountdown();
    updateSalesLeadWaitingTimes();
    if (activeView === "lead-monitor" && monitorLastCanonicalSyncAt &&
      Date.now() - monitorLastCanonicalSyncAt >= 90000 &&
      elements.monitorHealth.textContent !== "Tidak disahkan") renderLeadMonitor();
  }, 1000);
  scheduleExpiryWatchdog();
  registerServiceWorker().then(() => announceAssignmentReceiverReady());
  if (user.role === "admin") {
    syncPushSubscription().catch((error) => console.warn("Push subscription sync failed", error));
  }
  markCurrentLeadNotificationsSeen();
  scheduleSync();
  scheduleFollowUpReminders();
  loadBulletinFeed().then(() => { renderBulletins(); openRequestedBulletin(); }).catch((error) => console.warn("Bulletin feed failed", error));
  loadFollowUpDueFeed().then(renderFollowUpDue).catch((error) => console.warn("Follow-up feed failed", error));
  switchView(getRequestedStartView(), { historyMode: "replace" });
  renderAll();
  enforceAgentNotificationAccess();
  if (pendingNotificationLeadId) openNotificationLead(pendingNotificationLeadId);
  if (new URLSearchParams(window.location.search).get("reminder") === "sales-overdue") openSalesOverdueReminder();
  if (new URLSearchParams(window.location.search).get("status") === "new") {
    elements.leadFilter.value = "new";
    renderLeadsTable();
  }
  if (new URLSearchParams(window.location.search).get("setup") === "1") {
    openOwnDetails();
    elements.ownPassword.required = true;
    elements.ownPasswordConfirm.required = true;
  }
  showLatestCachedNotificationLead();
  if (getSheetEndpoint()) {
    if (pendingNotificationLeadId) {
      showCachedNotificationLead(pendingNotificationLeadId);
      syncNotificationLead(pendingNotificationLeadId);
    }
    startupSync.finally(() => {
      if (pendingPotentialReminder) openPotentialReminderModal();
    });
  } else if (pendingPotentialReminder) {
    openPotentialReminderModal();
  }
}

function showLogin() {
  elements.lifecycleSyncOverlay.classList.remove("login-transition-cover");
  performanceReport = null;
  performanceRequestVersion += 1;
  window.clearInterval(tickTimer);
  window.clearInterval(syncTimer);
  window.clearInterval(followUpReminderTimer);
  stopExpiryWatchdog();
  setMobileSidebarOpen(false);
  closeLogoutConfirmation();
  elements.appShell.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-pending", "authenticated");
  document.body.classList.add("logged-out");
  showSignupForm(false);
  window.setTimeout(() => elements.loginEmail.focus(), 80);
}

function isMobileSidebarViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function setMobileSidebarOpen(open) {
  elements.sidebar.classList.toggle("open", open);
  elements.mobileMenu.setAttribute("aria-expanded", String(open));
  elements.mobileMenu.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  elements.mobileMoreTab.setAttribute("aria-expanded", String(open));
  elements.mobileSidebarScrim.hidden = !open;
  document.body.classList.toggle("mobile-sidebar-open", open);
  if (!open) setAccountMenuOpen(false);
}

function setAccountMenuOpen(open) {
  elements.accountMenu.hidden = !open;
  elements.sidebarSettings.setAttribute("aria-expanded", String(open));
}

let logoutConfirmationStep = 0;

function closeLogoutConfirmation() {
  logoutConfirmationStep = 0;
  closeModal(elements.logoutConfirmModal);
}

function requestLogout() {
  setAccountMenuOpen(false);
  if (getCurrentUser()?.role !== "agent") {
    logout();
    return;
  }
  logoutConfirmationStep = 1;
  elements.logoutConfirmMessage.textContent = "Jika logout, anda tidak akan terima lead baru.";
  elements.logoutContinue.textContent = "Logout";
  elements.logoutConfirmModal.classList.add("open");
  elements.logoutConfirmModal.setAttribute("aria-hidden", "false");
  elements.logoutCancel.focus();
}

function continueLogout() {
  if (logoutConfirmationStep === 1) {
    logoutConfirmationStep = 2;
    elements.logoutConfirmMessage.textContent = "Pengesahan terakhir: anda pasti mahu logout dan berhenti menerima lead baru?";
    elements.logoutContinue.textContent = "Ya, logout";
    elements.logoutCancel.focus();
    return;
  }
  if (logoutConfirmationStep === 2) {
    closeLogoutConfirmation();
    logout();
  }
}

function openOwnDetails() {
  const user = getCurrentUser();
  if (!user) return;
  setAccountMenuOpen(false);
  elements.ownDetailsForm.reset();
  elements.ownName.value = user.name;
  elements.ownDetailsError.textContent = "";
  elements.ownDetailsModal.classList.add("open");
  elements.ownDetailsModal.setAttribute("aria-hidden", "false");
  elements.ownName.focus();
}

async function saveOwnDetails(event) {
  event.preventDefault();
  const user = getCurrentUser();
  if (!user) return;
  const name = elements.ownName.value.trim();
  const password = elements.ownPassword.value;
  const confirmation = elements.ownPasswordConfirm.value;
  if (!name || name.length > 120) {
    elements.ownDetailsError.textContent = "Nama mesti antara 1 hingga 120 aksara.";
    return;
  }
  if (password && password.length < 8) {
    elements.ownDetailsError.textContent = "Kata laluan mesti sekurang-kurangnya 8 aksara.";
    return;
  }
  if (password !== confirmation) {
    elements.ownDetailsError.textContent = "Pengesahan kata laluan tidak sepadan.";
    return;
  }
  const button = elements.ownDetailsForm.querySelector('button[type="submit"]');
  button.disabled = true;
  elements.ownDetailsError.textContent = "";
  let nameSaved = false;
  try {
    if (remoteDatabaseMode && remoteDatabaseClient) {
      if (name !== user.name) {
        const result = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
          body: { action: "update_self_name", name },
        });
        if (result.error || !result.data?.ok) throw result.error || new Error(result.data?.error || "Nama gagal dikemas kini.");
        user.name = name;
        nameSaved = true;
        saveState();
        renderUser();
      }
      if (password) {
        const { error } = await remoteDatabaseClient.auth.updateUser({ password });
        if (error) throw error;
      }
    } else if (password) {
      user.password = password;
    }
    user.name = name;
    saveState();
    renderUser();
    closeModal(elements.ownDetailsModal);
    if (password && new URLSearchParams(location.search).has("setup")) {
      elements.ownPassword.required = false;
      elements.ownPasswordConfirm.required = false;
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("setup");
      history.replaceState(history.state, "", cleanUrl);
    }
    showToast("Details dikemas kini", "Maklumat akaun anda berjaya disimpan.");
  } catch (error) {
    elements.ownDetailsError.textContent = nameSaved
      ? `Nama disimpan, tetapi kata laluan gagal dikemas kini: ${error.message || "Sila cuba lagi."}`
      : error.message || "Details gagal disimpan.";
  } finally {
    button.disabled = false;
  }
}

function setLoginError(message) {
  elements.loginError.textContent = message;
  elements.loginEmail.closest(".login-input").classList.toggle("invalid", Boolean(message));
  elements.loginPassword.closest(".login-input").classList.toggle("invalid", Boolean(message));
}

function setSignupError(message) {
  elements.signupError.textContent = systemWorkerText(message, signupBrand?.distribution_mode === "team_sales");
}

function renderSignupProjectOptions() {
  const selectedIds = new Set(
    [...elements.signupProjectCheckboxes.querySelectorAll('input[name="signup-project"]:checked')]
      .map((input) => input.value),
  );
  const activeProjects = signupProjects.filter((project) => project.active);
  elements.signupProjectCheckboxes.innerHTML = activeProjects.length
    ? activeProjects.map((project) => `
      <label class="project-checkbox">
        <input type="checkbox" name="signup-project" value="${escapeHtml(project.id)}" ${selectedIds.has(project.id) ? "checked" : ""} />
        <span>${escapeHtml(project.name)}</span>
      </label>`).join("")
    : `<p class="field-error">${systemWorkerText("Tiada projek aktif. Hubungi admin sebelum mendaftar.", signupBrand?.distribution_mode === "team_sales")}</p>`;
}

async function syncSignupProjects() {
  if (elements.signupForm.hidden) return false;
  const wasReady = signupBrandReady;
  try {
    if (!signupBrandSlug) throw new Error("Link daftar agent tidak sah. Minta link yang betul daripada Admin brand anda.");
    if (remoteDatabaseClient) {
      const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
        body: { action: "list_projects", brand_slug: signupBrandSlug },
      });
      if (error || !data?.ok || !Array.isArray(data.projects)) throw error || new Error(data?.error || "Senarai projek tidak sah");
      if (elements.signupForm.hidden) return false;
      signupProjects = normalizeProjects(data.projects);
      signupBrandReady = true;
      signupBrand = data.brand;
      updateWorkerLabels();
      document.querySelector(".login-card > .section-kicker").textContent = `Pendaftaran ${signupWorkerLabel()}`;
      document.querySelector("#login-title").textContent = `Daftar sebagai ${signupWorkerLabel()}`;
      document.querySelector("#signup-brand-label").textContent = `Pendaftaran ${signupBrand?.distribution_mode === "team_sales" ? "Team Sales" : "ejen"} · ${data.brand?.name || signupBrandSlug}`;
      renderSignupProjectOptions();
      if (!wasReady) setSignupError("");
      const submit = elements.signupForm.querySelector('button[type="submit"]');
      submit.disabled = submit.getAttribute("aria-busy") === "true" || !signupProjects.some(project => project.active);
      return true;
    }
    if (remoteDatabaseRequired || signupBrandSlug !== "safrich") throw new Error("Pendaftaran belum dapat disambungkan. Cuba refresh atau hubungi Admin.");
    const url = new URL(getSheetEndpoint());
    url.searchParams.set("_", Date.now().toString());
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.ok === false || !Array.isArray(payload?.projects)) {
      throw new Error(payload?.error || "Senarai projek tidak sah");
    }
    signupProjects = normalizeProjects(payload.projects);
    signupBrandReady = true;
    renderSignupProjectOptions();
    elements.signupForm.querySelector('button[type="submit"]').disabled = !signupProjects.some(project => project.active);
    return true;
  } catch (error) {
    signupBrandReady = false;
    signupProjects = [];
    elements.signupProjectCheckboxes.innerHTML = "";
    elements.signupForm.querySelector('button[type="submit"]').disabled = true;
    if (!elements.signupForm.hidden) setSignupError(error.message || "Link pendaftaran tidak tersedia. Hubungi Admin brand anda.");
    console.error("Signup project sync failed", error);
    return false;
  }
}

function showSignupForm(show) {
  window.clearInterval(signupProjectSyncTimer);
  elements.signupForm.hidden = !show;
  elements.loginForm.hidden = show;
  elements.forgotPasswordButton.hidden = show;
  elements.signupLoginButton.hidden = !show;
  document.querySelector(".login-card > .section-kicker").textContent = show ? "Pendaftaran ejen" : "Selamat kembali";
  document.querySelector(".session-note").hidden = show;
  document.querySelector("#login-title").textContent = show ? "Daftar sebagai ejen" : "Log masuk ke akaun anda";
  document.querySelector(".login-subtitle").textContent = show ? "Hantar permohonan kepada Admin brand anda." : "Gunakan emel dan kata laluan yang didaftarkan oleh admin.";
  setLoginError("");
  setSignupError("");
  if (show) {
    elements.signupForm.reset();
    signupProjects = [];
    signupBrandReady = false;
    document.querySelector("#signup-brand-label").textContent = "Pendaftaran ejen";
    elements.signupProjectCheckboxes.textContent = systemWorkerText("Memuatkan projek brand…", signupBrand?.distribution_mode === "team_sales");
    elements.signupForm.querySelector('button[type="submit"]').disabled = true;
    syncSignupProjects();
    signupProjectSyncTimer = window.setInterval(syncSignupProjects, SIGNUP_PROJECT_SYNC_INTERVAL_SECONDS * 1000);
    window.setTimeout(() => elements.signupName.focus(), 80);
  } else {
    window.setTimeout(() => elements.loginEmail.focus(), 80);
  }
}

let loginPending = false;
async function handleLogin(event) {
  event.preventDefault();
  if (loginPending) return;
  if (!elements.loginEmail.value.trim() || !elements.loginPassword.value) {
    setLoginError("Masukkan emel dan kata laluan.");
    return;
  }
  const button = elements.loginForm.querySelector('button[type="submit"]');
  const originalContent = button.innerHTML;
  loginPending = true;
  button.disabled = true;
  button.classList.add("login-pending");
  button.innerHTML = '<span class="login-spinner" aria-hidden="true"></span><span role="status">Sedang log masuk…</span>';
  elements.loginForm.setAttribute("aria-busy", "true");
  setLoginError("");
  try {
    await performLogin(event);
  } catch (error) {
    setLoginError("Log masuk belum selesai. Semak sambungan dan cuba lagi.");
  } finally {
    loginPending = false;
    button.disabled = false;
    button.classList.remove("login-pending");
    button.innerHTML = originalContent;
    elements.loginForm.removeAttribute("aria-busy");
  }
}

async function performLogin(event) {
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
      if (!isTransientRemoteLoadError(lastRemoteLoadError)) await remoteDatabaseClient.auth.signOut();
      setLoginError(isTransientRemoteLoadError(lastRemoteLoadError)
        ? 'Sesi anda masih aktif. Data belum dapat dimuatkan; tekan Log masuk untuk cuba semula.'
        : "Akaun berjaya disahkan tetapi data sistem tidak dapat dimuatkan.");
      return;
    }
    const signedInUser = getCurrentUser();
    if (!signedInUser?.active) {
      await remoteDatabaseClient.auth.signOut();
      setLoginError("Akaun anda sedang menunggu approval admin.");
      return;
    }
    setLoginError("");
    activeView = isMaster() ? "brands" : "dashboard";
    switchView(activeView, { historyMode: "replace" });
    startAuthenticatedApp(signedInUser, { freshLogin: true });
    subscribeToRemoteDatabase();
    flushContactOutbox();
    return;
  }

  let user = state.agents.find((agent) => agent.email.toLowerCase() === email);
  if (!user && initialAgentSyncPromise) {
    await initialAgentSyncPromise;
    user = state.agents.find((agent) => agent.email.toLowerCase() === email);
  }
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
  startAuthenticatedApp(user, { freshLogin: true });
}

async function handleAgentSignup(event) {
  event.preventDefault();
  if (!signupBrandSlug || !signupBrandReady) {
    setSignupError("Brand belum disahkan. Minta link daftar agent daripada Admin dan cuba lagi.");
    return;
  }
  const submitButton = elements.signupForm.querySelector('button[type="submit"]');
  const name = elements.signupName.value.trim();
  const phone = elements.signupPhone.value.trim();
  const email = elements.signupEmail.value.trim().toLowerCase();
  const eligibleProjectIds = [...elements.signupProjectCheckboxes.querySelectorAll('input[name="signup-project"]:checked')]
    .map((input) => input.value);
  const password = elements.signupPassword.value;
  const confirmation = elements.signupConfirmPassword.value;

  if (!name || !phone || !email || !password) {
    setSignupError("Lengkapkan semua maklumat pendaftaran.");
    return;
  }
  if (!eligibleProjectIds.length) {
    setSignupError("Pilih sekurang-kurangnya satu projek.");
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
  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  submitButton.setAttribute("aria-busy", "true");
  setGlobalLoading(true, `Menyimpan pendaftaran ${signupWorkerLabel()}...`);
  let signupAgent = null;
  try {
    let result;
    if (remoteDatabaseClient) {
      const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
        body: {
          action: "signup_request",
          brand_slug: signupBrandSlug,
          name,
          phone,
          email,
          password,
          eligible_project_ids: eligibleProjectIds,
        },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Permohonan tidak dapat dihantar.");
      signupAgent = {
        id: data.userId,
        name,
        phone,
        email,
        password,
        role: "agent",
        approvalStatus: "pending",
        active: false,
        leadsHandled: 0,
        createdAt: Date.now(),
        eligibleProjectIds,
      };
      result = { ok: true, agent: signupAgent };
    } else {
      signupAgent = {
        id: makeId("agent"),
        name,
        phone,
        email,
        password,
        role: "agent",
        approvalStatus: "pending",
        active: false,
        leadsHandled: 0,
        createdAt: Date.now(),
        eligibleProjectIds,
      };
      result = await submitAgentSignupToSheet(signupAgent);
    }
    const persistedAgent = result.agent || result.persisted_agent;
    if (!persistedAgent?.id || !persistedAgent?.name || !persistedAgent?.phone || !persistedAgent?.email) {
      throw new Error("Pendaftaran belum disahkan lengkap oleh server.");
    }
    state.agents = [
      ...state.agents.filter((agent) => agent.id !== signupAgent.id && agent.email.toLowerCase() !== email),
      signupAgent,
    ];
    saveState();
  } catch (error) {
    if (signupAgent) state.agents = state.agents.filter((agent) => agent.id !== signupAgent.id);
    saveState();
    setSignupError(error.message || "Permohonan tidak dapat disimpan. Semak pilihan projek dan cuba lagi.");
    await syncSignupProjects();
    return;
  } finally {
    submitButton.disabled = !signupBrandReady;
    submitButton.classList.remove("is-loading");
    submitButton.removeAttribute("aria-busy");
    setGlobalLoading(false);
  }
  elements.signupForm.reset();
  window.history.replaceState(null, "", "/");
  showSignupForm(false);
  setLoginError("");
  elements.signupSuccessModal.classList.add("open");
  elements.signupSuccessModal.setAttribute("aria-hidden", "false");
}

function sendAgentLogoutState(user) {
  if (isTeamSales()) return;
  if (!user?.id || user.role !== "agent") return;
  if (remoteDatabaseMode && remoteDatabaseClient) {
    Promise.resolve(remoteDatabaseClient.rpc("set_agent_availability", {
      p_ready: false,
      p_notification_ready: false,
    })).catch(() => {});
    return;
  }
  postGoogleSheetAction({
    action: "set_agent_lead_availability",
    agent: { id: user.id, ready: false },
  }, "Agent logout availability update failed").catch(() => {});
  postGoogleSheetAction({
    action: "update_agent_presence",
    agent: {
      id: user.id,
      online: false,
      notification_enabled: false,
      session_started_at: agentPresenceSessionStartedAt,
    },
  }, "Agent logout presence update failed").catch(() => {});
}

async function cleanUpPushAfterLogout() {
  try {
    const registration = await registerServiceWorker();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription && remoteDatabaseClient && remoteDatabaseMode) {
      await remoteDatabaseClient.rpc("unregister_push_subscription", {
        p_endpoint: subscription.endpoint,
      }).catch(() => null);
    }
    if (subscription) await subscription.unsubscribe();
    const notifications = await registration?.getNotifications();
    notifications?.forEach((notification) => notification.close());
  } catch (error) {
    console.error("Push logout cleanup failed", error);
  }
}

function logout() {
  const user = getCurrentUser();
  if (user?.role === "agent") {
    user.leadReady = false;
    user.online = false;
    user.notificationEnabled = false;
    saveState();
    sendAgentLogoutState(user);
  }
  localStorage.removeItem("leadlaju-push-subscription-owner");
  agentPushAccessReady = false;
  notificationConnectionError = "";
  document.body.classList.remove("agent-access-locked");
  localStorage.removeItem(AUTH_KEY);
  const wasRemote = remoteDatabaseMode;
  remoteRealtimeChannels.forEach((channel) => remoteDatabaseClient?.removeChannel(channel));
  remoteRealtimeChannels = [];
  integrationRawKeys.clear();
  integrationSecretTimers.forEach((timer) => window.clearTimeout(timer));
  integrationSecretTimers.clear();
  showLogin();
  brandContextVersion++;
  monitorLastCanonicalSyncAt = null;
  monitorSyncFailed = false;
  activeBrandId = ""; activeBrand = null; masterBrands = []; masterAdmins = [];
  const cleanup = cleanUpPushAfterLogout();
  if (remoteDatabaseClient && wasRemote) cleanup.finally(() => remoteDatabaseClient.auth.signOut().catch(() => {}));
  else if (remoteDatabaseClient) remoteDatabaseClient.auth.signOut().catch(() => {});
  cleanup.finally(() => { remoteDatabaseMode = false; });
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
  elements.resetRequestForm.querySelector(".reset-description").textContent = remoteDatabaseClient
    ? "Masukkan emel yang didaftarkan. Kami akan hantar pautan untuk menetapkan kata laluan baru."
    : "Masukkan emel yang didaftarkan. Kami akan hantar kod verifikasi enam digit.";
  elements.resetRequestForm.querySelector('button[type="submit"]').textContent = remoteDatabaseClient
    ? "Hantar pautan reset" : "Hantar kod verifikasi";
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
    const redirectTo = `${window.location.origin}/?reset=1`;
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
    : `Servis emel belum tersedia. Gunakan kod demo di bawah untuk menguji reset.`;
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
    const button = elements.resetVerifyForm.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    const { error } = await remoteDatabaseClient.auth.updateUser({ password })
      .catch(() => ({ error: true }));
    button.disabled = false;
    if (error) {
      elements.resetVerifyError.textContent = "Kata laluan tidak dapat dikemas kini.";
      return;
    }
    closeModal(elements.resetPasswordModal);
    resetPasswordFlow();
    remotePasswordRecoveryPending = false;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("reset");
    cleanUrl.searchParams.delete("setup");
    cleanUrl.hash = "";
    window.history.replaceState(null, "", cleanUrl);
    elements.ownPassword.required = false;
    elements.ownPasswordConfirm.required = false;
    await bootstrap();
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
  return ["admin", "master"].includes(getCurrentUser()?.role);
}

function isMaster() { return getCurrentUser()?.role === "master"; }

function getActiveAgents() {
  return state.agents.filter((agent) => agent.role === "agent" && agent.active);
}

function getAgent(agentId) {
  return state.agents.find((agent) => agent.id === agentId);
}

function currentAgentMatches(assignedAgentId, assignedAgentEmail = "", assignedAgentName = "") {
  const user = getCurrentUser();
  if (!user || user.role !== "agent") return false;
  if (assignedAgentId && assignedAgentId === user.id) return true;
  if (assignedAgentEmail && String(assignedAgentEmail).trim().toLowerCase() === String(user.email || "").trim().toLowerCase()) return true;
  return Boolean(assignedAgentName) &&
    String(assignedAgentName).trim().toLowerCase() === String(user.name || "").trim().toLowerCase();
}

function currentAgentOwnsLead(lead) {
  return Boolean(lead) && currentAgentMatches(lead.assignedAgentId, lead.assignedAgentEmail, lead.assignedAgentName);
}

function canAccessLead(lead) {
  return Boolean(lead) && (isAdmin() || currentAgentOwnsLead(lead));
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

function normalizeCooldownUntil(value, now = Date.now()) {
  if (!value) return null;
  const parsed = parseLeadTimestamp(value, null);
  return Number.isFinite(parsed) && parsed > now ? parsed : null;
}

function clearExpiredLocalCooldowns(now = Date.now()) {
  let changed = false;
  state.agents.forEach((agent) => {
    if (!agent.cooldownUntil || Number(agent.cooldownUntil) > now) return;
    agent.cooldownUntil = null;
    changed = true;
  });
  if (changed) saveState();
  return changed;
}

const MALAYSIA_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: MALAYSIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function malaysiaDateParts(value) {
  return MALAYSIA_DATE_TIME_FORMATTER
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

const MALAY_MONTH_NAMES = [
  "Januari", "Februari", "Mac", "April", "Mei", "Jun",
  "Julai", "Ogos", "September", "Oktober", "November", "Disember",
];

function updateSelectOptions(select, markup, selectedValue) {
  if (select.innerHTML !== markup) select.innerHTML = markup;
  select.value = [...select.options].some((option) => option.value === selectedValue) ? selectedValue : "all";
}

function populateMonthPeriodFilter(filter, records, getDate) {
  if (!filter) return;
  const selected = filter.value || "all";
  const periods = new Set();
  records.forEach((record) => {
    const value = getDate(record);
    if (!value) return;
    const { year, month } = malaysiaDateParts(value);
    if (year && month) periods.add(`${year}-${month}`);
  });
  const options = [
    '<option value="all">Semua tarikh</option>',
    ...[...periods].sort().reverse().map((period) => {
      const [year, month] = period.split("-");
      return `<option value="${period}">${MALAY_MONTH_NAMES[Number(month) - 1]} ${year}</option>`;
    }),
  ].join("");
  updateSelectOptions(filter, options, selected);
}

function matchesMonthPeriodFilter(value, filter) {
  if (!value) return false;
  if (!filter || filter.value === "all") return true;
  const { year, month } = malaysiaDateParts(value);
  return `${year}-${month}` === filter.value;
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
  elements.toastTitle.textContent = systemWorkerText(title);
  elements.toastMessage.textContent = message;
  const icon = elements.toast.querySelector(".toast-icon");
  icon.style.color = tone === "error" ? "var(--red)" : "var(--green)";
  icon.style.background = tone === "error" ? "var(--red-soft)" : "var(--green-soft)";
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

let lastInteractionButton = null;
let lastInteractionAt = 0;
const globalButtonFeedback = new Set();
const pendingButtonFeedback = new WeakMap();

function beginButtonFeedback(button) {
  if (!button) return () => {};
  if (pendingButtonFeedback.has(button)) return () => {};
  const previousBusy = button.getAttribute("aria-busy");
  button.dataset.actionPending = "true";
  button.setAttribute("aria-busy", "true");
  button.classList.add("is-action-pending");
  const spinner = document.createElement("span");
  spinner.className = "action-feedback-spinner";
  spinner.setAttribute("aria-hidden", "true");
  button.append(spinner);
  const finish = () => {
    spinner.remove();
    button.classList.remove("is-action-pending");
    delete button.dataset.actionPending;
    if (previousBusy === null) button.removeAttribute("aria-busy");
    else button.setAttribute("aria-busy", previousBusy);
    pendingButtonFeedback.delete(button);
  };
  pendingButtonFeedback.set(button, finish);
  return finish;
}

async function runButtonActionFeedback(button, action) {
  const finish = beginButtonFeedback(button);
  try { return await action(); } finally { finish(); }
}

function showImmediatePressFeedback(button) {
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
  lastInteractionButton = button;
  lastInteractionAt = Date.now();
  const box = button.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const ring = document.createElement("span");
  ring.className = "action-press-feedback";
  ring.setAttribute("aria-hidden", "true");
  Object.assign(ring.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: getComputedStyle(button).borderRadius });
  document.body.append(ring);
  window.setTimeout(() => ring.remove(), 280);
}

document.addEventListener("pointerdown", event => {
  showImmediatePressFeedback(event.target.closest('button, a.contact-edit-button, [role="button"]'));
}, { capture: true, passive: true });
document.addEventListener("click", event => {
  const button = event.target.closest('button, a.contact-edit-button, [role="button"]');
  if (button?.dataset.actionPending === "true") {
    event.preventDefault(); event.stopImmediatePropagation(); return;
  }
  if (event.detail === 0) showImmediatePressFeedback(button);
}, true);

function setGlobalLoading(active, message = "Sedang diproses...") {
  if (active && lastInteractionButton && Date.now() - lastInteractionAt < 750) globalButtonFeedback.add(beginButtonFeedback(lastInteractionButton));
  globalLoadingCount = Math.max(0, globalLoadingCount + (active ? 1 : -1));
  const visible = globalLoadingCount > 0;
  elements.globalLoadingMessage.textContent = message;
  elements.globalLoadingOverlay.classList.toggle("visible", visible);
  elements.globalLoadingOverlay.setAttribute("aria-hidden", String(!visible));
  if (!visible) { globalButtonFeedback.forEach(finish => finish()); globalButtonFeedback.clear(); }
}

const LIFECYCLE_INTRO_DURATION_MS = 3000;
const LIFECYCLE_RESUME_INDICATOR_DURATION_MS = 1000;
const LEAD_HANDOFF_SCHEMA_VERSION = 1;
function updateLifecycleMutationGate() {
  document.body.classList.remove("business-mutations-locked");
}

function guardLifecycleMutation() {
  return true;
}

function showLifecycleSyncOverlay(mode) {
  window.clearTimeout(lifecycleHideTimer);
  elements.lifecycleSyncOverlay.classList.remove("cinematic", "waiting", "resume");
  elements.lifecycleSyncOverlay.classList.add("visible", mode);
  elements.lifecycleSyncOverlay.setAttribute("aria-hidden", "false");
}

function hideLifecycleSyncOverlay() {
  window.clearTimeout(lifecycleHideTimer);
  elements.lifecycleSyncOverlay.classList.remove("visible");
  elements.lifecycleSyncOverlay.setAttribute("aria-hidden", "true");
  lifecycleHideTimer = window.setTimeout(() => {
    if (!elements.lifecycleSyncOverlay.classList.contains("visible")) {
      elements.lifecycleSyncOverlay.classList.remove("cinematic", "waiting", "resume");
    }
  }, 180);
}

function settleLifecyclePresentation() {
  updateLifecycleMutationGate();
  if (!introRevealComplete) return;
  hideLifecycleSyncOverlay();
}

function completeLifecycleAuthoritativeRender() {
  if (initialDashboardSyncState === "pending" || initialDashboardSyncState === "failed") {
    initialDashboardSyncState = "ready";
    resumeSyncPending = false;
    settleLifecyclePresentation();
  }
}

function failLifecycleSync() {
  if (initialDashboardSyncState !== "pending") return;
  initialDashboardSyncState = "failed";
  resumeSyncPending = false;
  updateLifecycleMutationGate();
  if (introRevealComplete) hideLifecycleSyncOverlay();
}

function runLifecycleAuthoritativeSync() {
  if (typeof remoteDatabaseMode !== "undefined" && remoteDatabaseMode) {
    return loadRemoteState(state.currentUserId)
      .then(async (success) => {
        if (success) {
          await loadBulletinFeed();
          renderAll();
          completeLifecycleAuthoritativeRender();
        } else failLifecycleSync();
        return success;
      })
      .catch((error) => {
        failLifecycleSync();
        console.error("Supabase lifecycle sync failed", error);
        return false;
      });
  }
  return syncGoogleSheetFresh({ silent: true, notifyNewLeads: true, lifecycleSync: true })
    .then((success) => {
      if (!success) failLifecycleSync();
      return success;
    })
    .catch((error) => {
      failLifecycleSync();
      console.error("Lifecycle sync failed", error);
      return false;
    });
}

function beginColdStartSync() {
  leadLajuIntroShown = true;
  introRevealComplete = false;
  initialDashboardSyncState = "pending";
  showLifecycleSyncOverlay("cinematic");
  updateLifecycleMutationGate();
  window.clearTimeout(lifecycleIntroTimer);
  lifecycleIntroTimer = window.setTimeout(() => {
    introRevealComplete = true;
    settleLifecyclePresentation();
  }, LIFECYCLE_INTRO_DURATION_MS);
  lifecycleSyncPromise = runLifecycleAuthoritativeSync();
  return lifecycleSyncPromise;
}

function beginResumeSync() {
  if (!document.body.classList.contains("authenticated")) return Promise.resolve(false);
  if (!leadLajuIntroShown || initialDashboardSyncState === "pending" || resumeSyncPending) {
    return lifecycleSyncPromise || Promise.resolve(false);
  }
  introRevealComplete = false;
  initialDashboardSyncState = "pending";
  resumeSyncPending = true;
  showLifecycleSyncOverlay("resume");
  updateLifecycleMutationGate();
  window.clearTimeout(lifecycleIntroTimer);
  lifecycleIntroTimer = window.setTimeout(() => {
    introRevealComplete = true;
    settleLifecyclePresentation();
  }, LIFECYCLE_RESUME_INDICATOR_DURATION_MS);
  lifecycleSyncPromise = runLifecycleAuthoritativeSync()
    .finally(() => {
      resumeSyncPending = false;
    });
  return lifecycleSyncPromise;
}

function openLeadAvailabilityConfirmation(ready) {
  elements.leadAvailabilityKicker.textContent = ready ? "GET LEAD aktif" : "STOP LEAD aktif";
  elements.leadAvailabilityTitle.textContent = ready ? "Anda sedang dalam queue" : "Status anda OFFLINE";
  elements.leadAvailabilityDescription.textContent = ready
    ? "Anda sedang queue tunggu giliran untuk dapatkan lead. Jika lead tersedia, anda akan menerima lead di dashboard utama."
    : "Status anda OFFLINE sekarang dan berhenti queue giliran untuk menerima lead.";
  elements.leadAvailabilityModal.classList.add("open");
  elements.leadAvailabilityModal.setAttribute("aria-hidden", "false");
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

function loadFollowUpReminderKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem(FOLLOW_UP_REMINDER_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    localStorage.removeItem(FOLLOW_UP_REMINDER_KEY);
    return new Set();
  }
}

function saveFollowUpReminderKeys() {
  const compacted = [...sentFollowUpReminderKeys].slice(-120);
  sentFollowUpReminderKeys = new Set(compacted);
  localStorage.setItem(FOLLOW_UP_REMINDER_KEY, JSON.stringify(compacted));
}

function loadAdminReminderKeys(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    localStorage.removeItem(storageKey);
    return new Set();
  }
}

function saveAdminReminderKeys(keySet, storageKey) {
  const compacted = [...keySet].slice(-120);
  const nextSet = new Set(compacted);
  localStorage.setItem(storageKey, JSON.stringify(compacted));
  return nextSet;
}

function lockViewportZoom() {
  const viewport = document.querySelector('meta[name="viewport"]');
  const updateViewport = () => {
    const installedPhone = isInstalledApp() && isPhonePushDevice();
    viewport.content = `width=device-width, initial-scale=1.0, ${installedPhone ? "maximum-scale=1.0, user-scalable=no, " : ""}viewport-fit=cover`;
    document.documentElement.classList.toggle("installed-phone-app", installedPhone);
  };
  updateViewport();
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", updateViewport);
  document.addEventListener(
    "touchmove",
    (event) => {
      if (document.documentElement.classList.contains("installed-phone-app") && event.touches?.length > 1) event.preventDefault();
    },
    { passive: false },
  );
  ["gesturestart", "gesturechange"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (document.documentElement.classList.contains("installed-phone-app")) event.preventDefault();
    }, { passive: false });
  });
}

function leadNotificationKey(lead) {
  return [lead.id || lead.dedupeKey, lead.assignedAgentId || "unassigned", lead.passCount || 0, lead.status].join(":");
}

function leadTimingKey(lead = {}) {
  const leadId = String(lead.id || lead.dedupeKey || "").trim();
  const revision = Number(lead.assignment_revision ?? lead.assignmentRevision) || 0;
  return `${leadId}:${revision}`;
}

function logLeadTiming(eventName, lead = {}, timing = {}, appEpoch = Date.now()) {
  const swPushEpoch = Number(timing.swPushEpoch) || null;
  const swBroadcastStartEpoch = Number(timing.swBroadcastStartEpoch) || null;
  const swBroadcastCompleteEpoch = Number(timing.swBroadcastCompleteEpoch) || null;
  const entry = {
    event: eventName,
    key: String(timing.key || leadTimingKey(lead)),
    swPushEpoch,
    swBroadcastStartEpoch,
    swBroadcastCompleteEpoch,
    appMessageReceivedEpoch: Number(timing.appMessageReceivedEpoch) || null,
    appEpoch,
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    controlled: Boolean(navigator.serviceWorker?.controller),
    role: getCurrentUser()?.role || "none",
  };
  if (eventName === "DELIVERY_TRACE") {
    entry.pushToBroadcastStartMs = swPushEpoch && swBroadcastStartEpoch
      ? swBroadcastStartEpoch - swPushEpoch : null;
    entry.broadcastDurationMs = swBroadcastStartEpoch && swBroadcastCompleteEpoch
      ? swBroadcastCompleteEpoch - swBroadcastStartEpoch : null;
    entry.broadcastCompleteToAppMs = swBroadcastCompleteEpoch && entry.appMessageReceivedEpoch
      ? entry.appMessageReceivedEpoch - swBroadcastCompleteEpoch : null;
    entry.pushToAppMs = swPushEpoch && entry.appMessageReceivedEpoch
      ? entry.appMessageReceivedEpoch - swPushEpoch : null;
  }
  console.log(`[LeadLajuTiming] ${JSON.stringify(entry)}`);
}

function timingSnapshotLead(leadSnapshot) {
  const sourceId = String(leadSnapshot?.id || "").trim();
  return state.leads.find((lead) => lead.dedupeKey === sourceId || lead.id === sourceId) || null;
}

function shouldNotifyForLead(lead) {
  if (!lead || lead.status !== "new") return false;
  if (Number(lead.expiresAt) && lead.expiresAt <= Date.now()) return false;
  if (Boolean(state.currentUserId) && lead.assignedAgentId === state.currentUserId) return true;
  return typeof currentAgentOwnsLead === "function" && currentAgentOwnsLead(lead);
}

function markLeadNotificationSeen(lead) {
  notifiedLeadKeys.add(leadNotificationKey(lead));
}

function markCurrentLeadNotificationsSeen() {
  state.leads.filter(shouldNotifyForLead).forEach(markLeadNotificationSeen);
  saveNotifiedLeadKeys();
}

function getNotificationStartUrl(viewName = "") {
  const url = new URL(window.location.pathname || "/", window.location.origin);
  if (viewName) url.searchParams.set("view", viewName);
  return url.href;
}

function getRequestedStartView() {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view") || window.location.hash.replace(/^#/, "");
  return ["dashboard", "leads", "appointments", "follow-up-due", "bulletins", "agents", "performance", "projects", "lead-monitor", "import-leads", "integrations", "brands"].includes(requestedView) ? requestedView : isMaster() ? "brands" : "dashboard";
}

async function openNotificationLead(leadId) {
  const requestedId = String(leadId || "").trim();
  if (!requestedId) return;
  salesLeadDrilldown = null;
  pendingNotificationLeadId = requestedId;
  if (!getCurrentUser()) return;
  let lead = state.leads.find((item) => item.id === requestedId || item.dedupeKey === requestedId);
  if (!lead && remoteDatabaseMode) {
    await loadRemoteState(state.currentUserId);
    lead = state.leads.find((item) => item.id === requestedId || item.dedupeKey === requestedId);
  }
  if (!lead || !canAccessLead(lead) || isVisuallyExpiredAssignment(lead)) {
    pendingNotificationLeadId = "";
    showToast("Lead tidak tersedia", "Lead ini mungkin sudah luput atau tidak lagi dalam akses anda.", "error");
    return;
  }
  pendingNotificationLeadId = "";
  if (!isTeamSales() && lead.status === "new" && !isAdmin()) {
    switchView("dashboard");
    renderAll();
    return;
  }
  elements.leadSearch.value = lead.name;
  [elements.leadFilter, elements.leadFollowUpFilter, elements.leadAgentFilter, elements.leadPeriodFilter].forEach((field) => { if (field) field.value = "all"; });
  expandedLeadLogIds.add(lead.id);
  leadLogVisibleLimit = Math.max(LEAD_LOG_PAGE_SIZE, state.leads.length);
  switchView("leads");
  renderLeadsTable();
  window.requestAnimationFrame(() => {
    const row = [...elements.leadsTableBody.querySelectorAll("[data-lead-row]")].find((item) => item.dataset.leadRow === lead.id);
    row?.scrollIntoView({ block: "center", behavior: "instant" });
    row?.querySelector("button")?.focus({ preventScroll: true });
  });
}

async function syncNotificationLead(leadId) {
  const requestedId = String(leadId || "").trim();
  if (!requestedId || !getSheetEndpoint()) return false;
  try {
    const url = new URL(getSheetEndpoint());
    url.searchParams.set("lead_id", requestedId);
    url.searchParams.set("_", Date.now().toString());
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload?.ok || !payload.lead) return false;
    await addLead(payload.lead, { silent: true, updateExisting: true, notify: false, queueIfBlocked: true });
    saveState();
    switchView("dashboard");
    renderAll();
    pendingNotificationLeadId = "";
    return true;
  } catch (error) {
    console.warn("Notification lead sync failed", error);
    return false;
  }
}

function assignmentSnapshotDisposition(leadSnapshot) {
  if (!leadSnapshot?.id || !currentAgentMatches(
    leadSnapshot.assigned_agent_id || leadSnapshot.assignedAgentId,
    leadSnapshot.assigned_agent_email || leadSnapshot.assignedAgentEmail,
    leadSnapshot.assigned_agent_name || leadSnapshot.assignedAgentName,
  )) return { accepted: false, terminal: false };
  const incomingRevision = Number(leadSnapshot.assignment_revision ?? leadSnapshot.assignmentRevision) || 0;
  if (isTeamSales()) {
    const existing = state.leads.find(item => item.id === leadSnapshot.id);
    const revision = Number(leadSnapshot.status_revision ?? leadSnapshot.statusRevision) || 0;
    const valid = normalizeSheetStatus(leadSnapshot.status) === "new" && (leadSnapshot.queue_state || leadSnapshot.queueState) === "sales_assigned"
      && (!existing || (incomingRevision >= existing.assignmentRevision && (existing.status === "new" || revision > existing.statusRevision)));
    return { accepted: valid, terminal: !valid };
  }
  const expiresAt = parseLeadTimestamp(leadSnapshot.expires_at || leadSnapshot.expiresAt, 0);
  const active = String(leadSnapshot.queue_state || leadSnapshot.queueState || "").toLowerCase() === "active";
  if (normalizeSheetStatus(leadSnapshot.status) !== "new" || !active || expiresAt <= Date.now()) {
    return { accepted: false, terminal: true };
  }
  const existing = state.leads.find((lead) => lead.id === leadSnapshot.id || lead.dedupeKey === leadSnapshot.id);
  if (existing && incomingRevision < (Number(existing.assignmentRevision) || 0)) {
    return { accepted: false, terminal: true };
  }
  const incomingStatusRevision = Number(leadSnapshot.status_revision ?? leadSnapshot.statusRevision) || 0;
  if (existing && existing.status !== "new" && incomingStatusRevision <= (Number(existing.statusRevision) || 0)) {
    return { accepted: false, terminal: true };
  }
  const currentActive = getVisibleActiveLead();
  if (currentActive && currentActive.id !== leadSnapshot.id && currentActive.dedupeKey !== leadSnapshot.id) {
    const incomingReceivedAt = parseLeadTimestamp(leadSnapshot.received_at || leadSnapshot.receivedAt, 0);
    if (incomingReceivedAt > Number(currentActive.receivedAt || 0)) {
      return { accepted: true, terminal: false, supersededLead: currentActive };
    }
    return { accepted: false, terminal: true, reconcile: true };
  }
  return { accepted: true, terminal: false };
}

async function acceptAssignmentSnapshot(leadSnapshot, timing = {}) {
  if (remoteDatabaseMode && leadSnapshot?.brand_id && leadSnapshot.brand_id !== activeBrandId) return { accepted: false, terminal: true };
  const disposition = assignmentSnapshotDisposition(leadSnapshot);
  if (!disposition.accepted) {
    if (disposition.reconcile) syncGoogleSheetFresh({ silent: true, notifyNewLeads: false });
    return disposition;
  }
  if (disposition.supersededLead) locallyExpiredAssignments.add(expiryAssignmentKey(disposition.supersededLead));
  if (!leadSnapshot?.id || !currentAgentMatches(
    leadSnapshot.assigned_agent_id || leadSnapshot.assignedAgentId,
    leadSnapshot.assigned_agent_email || leadSnapshot.assignedAgentEmail,
    leadSnapshot.assigned_agent_name || leadSnapshot.assignedAgentName,
  )) return { accepted: false, terminal: false };
  logLeadTiming("APP_SNAPSHOT_START", leadSnapshot, timing);
  markAuthoritativeLeadCommit({ id: leadSnapshot.id });
  // Supabase snapshots are already committed by the assignment transaction.
  // Receiving one must never insert a duplicate lead or write its runtime back.
  let savePromise;
  if (typeof remoteDatabaseMode !== "undefined" && remoteDatabaseMode) {
    const canonicalLead = mapLead(leadSnapshot);
    const index = state.leads.findIndex((lead) => lead.id === canonicalLead.id);
    if (index >= 0) {
      const current = state.leads[index];
      if ((Number(current.statusRevision) || 0) > canonicalLead.statusRevision || pendingLeadStatusUpdates.has(current.id)) {
        canonicalLead.status = current.status;
        canonicalLead.statusRevision = current.statusRevision;
        canonicalLead.statusUpdatedAt = current.statusUpdatedAt;
        canonicalLead.contactedAt = current.contactedAt;
        canonicalLead.responseMs = current.responseMs;
      }
      if (pendingLeadNoteUpdates.has(current.id)) canonicalLead.notes = current.notes;
      state.leads[index] = canonicalLead;
    } else state.leads.unshift(canonicalLead);
    saveState();
    logLeadTiming("APP_STATE_COMMIT", leadSnapshot, timing);
    savePromise = Promise.resolve(true);
  } else savePromise = addLead(leadSnapshot, {
    silent: true,
    updateExisting: true,
    notify: false,
    queueIfBlocked: true,
    onStateCommit: () => logLeadTiming("APP_STATE_COMMIT", leadSnapshot, timing),
  });
  switchView("dashboard");
  logLeadTiming("APP_RENDER_START", leadSnapshot, timing);
  renderAll();
  logLeadTiming("APP_RENDER_END", leadSnapshot, timing);
  const committedLead = timingSnapshotLead(leadSnapshot);
  const activeLead = getVisibleActiveLead();
  if (activeLead && leadTimingKey(activeLead) === leadTimingKey(leadSnapshot)) {
    logLeadTiming("APP_CALL_NOW_VISIBLE", leadSnapshot, timing);
  }
  if (committedLead && canAccessLead(committedLead) && !isVisuallyExpiredAssignment(committedLead)) {
    logLeadTiming("APP_LOG_LEAD_VISIBLE", leadSnapshot, timing);
  }
  Promise.resolve(savePromise).then((saved) => {
    if (saved) saveState();
  }).catch(() => {});
  return { accepted: true, terminal: false };
}

async function showNotificationLeadImmediately(leadSnapshot, timing = {}) {
  return (await acceptAssignmentSnapshot(leadSnapshot, timing)).accepted;
}

function postAssignmentServiceWorkerMessage(message) {
  if (!("serviceWorker" in navigator)) return false;
  const worker = navigator.serviceWorker.controller;
  if (worker) {
    worker.postMessage(message);
    return true;
  }
  navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage(message)).catch(() => {});
  return true;
}

function announceAssignmentReceiverReady() {
  const user = getCurrentUser();
  if (user?.role !== "agent" || !user.id) return false;
  return postAssignmentServiceWorkerMessage({ type: "APP_READY_FOR_LEAD_ASSIGNMENT", agentId: user.id });
}

function acknowledgeAssignmentHandoff(handoffKey) {
  if (!handoffKey) return;
  postAssignmentServiceWorkerMessage({ type: "LEAD_ASSIGNMENT_HANDOFF_ACK", handoffKey });
}

async function consumeAssignmentHandoff(data = {}, timing = {}) {
  if (data.schemaVersion != null && data.schemaVersion !== LEAD_HANDOFF_SCHEMA_VERSION) return false;
  const result = await acceptAssignmentSnapshot(data.leadSnapshot, timing);
  if (result.accepted || result.terminal) acknowledgeAssignmentHandoff(data.handoffKey);
  return result.accepted;
}

async function showCachedNotificationLead(leadId) {
  if (!("caches" in window) || !leadId) return false;
  try {
    const cache = await caches.open("leadlaju-notification-snapshots");
    const request = new Request(new URL(`/__lead_snapshot__/${encodeURIComponent(leadId)}`, window.location.origin));
    const response = await cache.match(request);
    if (!response) return false;
    await cache.delete(request);
    return showNotificationLeadImmediately(await response.json());
  } catch (error) {
    console.warn("Notification snapshot could not be opened", error);
    return false;
  }
}

async function showLatestCachedNotificationLead() {
  if (!("caches" in window) || getCurrentUser()?.role !== "agent") return false;
  try {
    const cache = await caches.open("leadlaju-notification-snapshots");
    const requests = await cache.keys();
    const snapshots = (await Promise.all(requests.map(async (request) => {
      const response = await cache.match(request);
      if (!response) return null;
      try {
        const cached = await response.json();
        if (cached.leadSnapshot && cached.schemaVersion !== LEAD_HANDOFF_SCHEMA_VERSION) return null;
        return { request, lead: cached.leadSnapshot || cached, handoffKey: cached.handoffKey || "" };
      } catch {
        await cache.delete(request);
        return null;
      }
    }))).filter((item) => item?.lead);
    const now = Date.now();
    const matching = snapshots
      .filter(({ lead }) => currentAgentMatches(
        lead.assigned_agent_id || lead.assignedAgentId,
        lead.assigned_agent_email || lead.assignedAgentEmail,
        lead.assigned_agent_name || lead.assignedAgentName,
      ))
      .filter(({ lead }) => normalizeSheetStatus(lead.status) === "new" &&
        String(lead.queue_state || lead.queueState || "").toLowerCase() === "active" &&
        parseLeadTimestamp(lead.expires_at || lead.expiresAt, 0) > now)
      .sort((left, right) =>
        parseLeadTimestamp(right.lead.received_at || right.lead.receivedAt, 0) -
        parseLeadTimestamp(left.lead.received_at || left.lead.receivedAt, 0));
    if (!matching.length) return false;
    if (!matching[0].handoffKey) await cache.delete(matching[0].request);
    const result = await acceptAssignmentSnapshot(matching[0].lead);
    if (result.accepted || result.terminal) acknowledgeAssignmentHandoff(matching[0].handoffKey);
    return result.accepted;
  } catch (error) {
    console.warn("Latest notification snapshot could not be opened", error);
    return false;
  }
}

async function checkCachedAssignmentSnapshot() {
  if (cachedAssignmentCheckInProgress) return false;
  cachedAssignmentCheckInProgress = true;
  try {
    return await showLatestCachedNotificationLead();
  } finally {
    cachedAssignmentCheckInProgress = false;
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return null;
  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register("/sw.js?v=20261008-latest-lead-activity-v144")
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

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function isPushSupported() {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.location.protocol !== "file:"
  );
}

function isPhonePushDevice() {
  const userAgent = navigator.userAgent || "";
  return /iPhone/i.test(userAgent) || (/Android/i.test(userAgent) && /Mobile/i.test(userAgent));
}

async function syncPushSubscription(force = false) {
  if (pushSubscriptionSyncPromise) {
    const previous = await pushSubscriptionSyncPromise.catch(() => false);
    if (!force) return previous;
  }
  const pending = performPushSubscriptionSync(force);
  pushSubscriptionSyncPromise = pending;
  try {
    return await pending;
  } finally {
    if (pushSubscriptionSyncPromise === pending) pushSubscriptionSyncPromise = null;
  }
}

function isPushEndpointOwnershipConflict(error) {
  return error?.code === "42501" && /row-level security/i.test(error.message || "") && /push_subscriptions/i.test(error.message || "");
}

function pushConnectionErrorMessage(error) {
  if (error?.name === "NotAllowedError" || Notification.permission === "denied") {
    return "Benarkan notifikasi LeadLaju dalam tetapan telefon, kemudian cuba semula.";
  }
  return "Notifikasi belum berjaya disambungkan. Semak internet, tutup dan buka semula aplikasi, kemudian tekan Sambung semula.";
}

async function performPushSubscriptionSync(force = false) {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  const user = getCurrentUser();
  if (!user?.id || !user.active) return false;

  const registration = await registerServiceWorker();
  if (!registration?.pushManager) return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    });
  }

  let subscriptionPayload = subscription.toJSON();
  let endpoint = subscriptionPayload.endpoint || subscription.endpoint;
  if (!endpoint) return false;

  const storageKey = "leadlaju-push-subscription-owner";
  let fingerprint = `${user.id}:${endpoint}:${subscriptionPayload.keys?.p256dh || ""}:${user.email}:${user.active}`;
  if (!force && localStorage.getItem(storageKey) === fingerprint) return true;

  let pushed;
  if (remoteDatabaseMode) {
    const register = () => remoteDatabaseClient.rpc("register_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: subscriptionPayload.keys?.p256dh || "",
      p_auth: subscriptionPayload.keys?.auth || "",
      p_user_agent: navigator.userAgent,
    });
    let { data, error } = await register();
    // A browser endpoint can belong to another brand's previous login. Keep RLS
    // intact: replace the browser subscription only on an explicit reconnect.
    if (force && isPushEndpointOwnershipConflict(error) && getCurrentUser()?.id === user.id) {
      const previousEndpoint = endpoint;
      if (!await subscription.unsubscribe()) throw new Error("Unable to replace previous push subscription");
      localStorage.removeItem(storageKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
      });
      subscriptionPayload = subscription.toJSON();
      endpoint = subscriptionPayload.endpoint || subscription.endpoint;
      if (!endpoint || endpoint === previousEndpoint || getCurrentUser()?.id !== user.id) {
        throw new Error("A fresh push subscription is required");
      }
      fingerprint = `${user.id}:${endpoint}:${subscriptionPayload.keys?.p256dh || ""}:${user.email}:${user.active}`;
      ({ data, error } = await register());
    }
    if (error) throw error;
    pushed = Boolean(data?.ok);
  } else {
    pushed = await postGoogleSheetAction(
      {
        action: "register_push_subscription",
        subscription: subscriptionPayload,
        agent: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
        },
        user_agent: navigator.userAgent,
      },
      "Push subscription sync failed",
    );
  }

  if (getCurrentUser()?.id !== user.id) return false;
  if (pushed) localStorage.setItem(storageKey, fingerprint);
  return pushed;
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
    if (Number(agent.cooldownUntil) > Date.now()) continue;
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
  lead.queueState = "queued";
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
  lead.queueState = "active";
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
  return [];
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
    return "rejected";
  }
  if (["all offer presented", "offer presented", "all offers presented", "semua tawaran dibentang"].includes(compactStatus)) {
    return "all_offer_presented";
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
  if (["cancelled", "canceled", "cancel", "batal", "dibatalkan"].includes(compactStatus)) {
    return "cancelled";
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
  if (lead.status === "passed") return "rejected";
  if (lead.status === "queued") return "new";
  return lead.status || "new";
}

function formatSheetStatus(status) {
  return LEAD_STATUS_LABELS[normalizeSheetStatus(status)] || "New";
}

function renderLeadStatusOptions(currentStatus, allowNew = isAdmin()) {
  return LEAD_STATUS_OPTIONS.filter((status) => allowNew || status.value !== "new").map(
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
    lead.passCount = 0;
    lead.contactedAt = null;
    lead.responseMs = null;
    lead.statusLockedUntil = null;
    queueLead(lead, now, {
      resetPassCount: false,
      previousAgentId: lead.assignedAgentId || lead.lastAgentId || null,
    });
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
  return ["active", "aktif", "true", "1", "on", "enabled", "yes", "ya"].includes(normalized);
}

function isAgentExplicitlyActive(value) {
  return value === true || ["active", "aktif", "true", "1", "on", "enabled", "yes", "ya"]
    .includes(String(value || "").trim().toLowerCase());
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
  const rawAssignedAgentId = String(
    pickInputValue(input, ["assigned_agent_id", "assignedAgentId", "assigned_agent", "agent_id"]),
  ).trim();
  const assignedAgentName = String(pickInputValue(input, ["assigned_agent_name", "assignedAgentName"])).trim();
  const assignedAgentEmail = String(pickInputValue(input, ["assigned_agent_email", "assignedAgentEmail"]))
    .trim()
    .toLowerCase();
  const matchedAgent = state.agents.find(
    (agent) =>
      agent.id === rawAssignedAgentId ||
      (assignedAgentEmail && agent.email.toLowerCase() === assignedAgentEmail) ||
      (assignedAgentName && agent.name.toLowerCase() === assignedAgentName.toLowerCase()),
  );
  const assignedAgentId = matchedAgent?.id || rawAssignedAgentId;
  const queueState = String(
    pickInputValue(input, ["queue_state", "queueState", "runtime_state", "runtimeState"]),
  )
    .trim()
    .toLowerCase();
  const receivedRaw = pickInputValue(input, ["received_at", "receivedAt", "assigned_at", "assignedAt"]);
  const expiresRaw = pickInputValue(input, ["expires_at", "expiresAt"]);
  const passCountRaw = pickInputValue(input, ["pass_count", "passCount", "rotation_count", "rotationCount"]);
  const assignmentRevisionRaw = pickInputValue(input, ["assignment_revision", "assignmentRevision"]);
  const assignmentHistoryRaw = pickInputValue(input, ["assignment_history", "assignmentHistory"]);
  const hasRuntime = Boolean(assignedAgentId || queueState || receivedRaw || expiresRaw || passCountRaw || assignmentRevisionRaw || assignmentHistoryRaw);

  return {
    hasRuntime,
    assignedAgentId,
    assignedAgentName: matchedAgent?.name || assignedAgentName,
    assignedAgentEmail: matchedAgent?.email || assignedAgentEmail,
    queueState,
    receivedAt: receivedRaw ? parseLeadTimestamp(receivedRaw, null) : null,
    expiresAt: expiresRaw ? parseLeadTimestamp(expiresRaw, null) : null,
    passCount: passCountRaw === "" ? null : Number(passCountRaw) || 0,
    assignmentRevision: Number(assignmentRevisionRaw) || 0,
    assignmentHistory: Array.isArray(assignmentHistoryRaw) ? assignmentHistoryRaw : [],
  };
}

function applyLeadRuntimeFromSheet(lead, runtime, now = Date.now()) {
  if (!runtime?.hasRuntime) return false;

  const before = JSON.stringify({
    status: lead.status,
    assignedAgentId: lead.assignedAgentId,
    assignedAgentName: lead.assignedAgentName,
    receivedAt: lead.receivedAt,
    expiresAt: lead.expiresAt,
    queuedAt: lead.queuedAt,
    passCount: lead.passCount,
    assignmentRevision: lead.assignmentRevision,
    queueState: lead.queueState,
  });

  if (!isActiveLeadStatus(lead.status)) {
    if (runtime.assignedAgentId) lead.assignedAgentId = runtime.assignedAgentId;
    if (runtime.assignedAgentName) lead.assignedAgentName = runtime.assignedAgentName;
    if (runtime.assignedAgentEmail) lead.assignedAgentEmail = runtime.assignedAgentEmail;
    if (runtime.receivedAt) lead.receivedAt = runtime.receivedAt;
    lead.expiresAt = null;
    lead.queuedAt = null;
    lead.queueState = runtime.queueState || "";
    if (runtime.passCount !== null) lead.passCount = runtime.passCount;
  } else if (runtime.queueState === "queued") {
    queueLead(lead, runtime.receivedAt || lead.queuedAt || now, {
      resetPassCount: false,
      previousAgentId: lead.lastAgentId || lead.assignedAgentId || null,
    });
    if (runtime.passCount !== null) lead.passCount = runtime.passCount;
    lead.queueState = "queued";
  } else if (runtime.assignedAgentId) {
    lead.status = "new";
    lead.assignedAgentId = runtime.assignedAgentId;
    lead.assignedAgentName = runtime.assignedAgentName || lead.assignedAgentName || "";
    lead.assignedAgentEmail = runtime.assignedAgentEmail || lead.assignedAgentEmail || "";
    lead.receivedAt = runtime.receivedAt || lead.receivedAt || now;
    lead.expiresAt = runtime.expiresAt || lead.expiresAt || lead.receivedAt + RESPONSE_WINDOW_MS;
    lead.queuedAt = null;
    lead.lastAgentId = null;
    lead.queueState = "active";
    if (runtime.passCount !== null) lead.passCount = runtime.passCount;
  }
  lead.assignmentRevision = runtime.assignmentRevision || 0;
  if (runtime.assignedAgentName) lead.assignedAgentName = runtime.assignedAgentName;
  lead.assignmentHistory = runtime.assignmentHistory || [];

  const after = JSON.stringify({
    status: lead.status,
    assignedAgentId: lead.assignedAgentId,
    assignedAgentName: lead.assignedAgentName,
    receivedAt: lead.receivedAt,
    expiresAt: lead.expiresAt,
    queuedAt: lead.queuedAt,
    passCount: lead.passCount,
    assignmentRevision: lead.assignmentRevision,
    assignmentHistory: lead.assignmentHistory,
    queueState: lead.queueState,
  });
  return before !== after;
}

function normalizeSheetAgent(input) {
  if (!input) return null;
  const email = String(input.email || input.emel || input.email_address || "").trim().toLowerCase();
  const name = String(input.name || input.nama || input.full_name || "").trim();
  if (!name || !email) return null;

  const hasLeadReady = Object.prototype.hasOwnProperty.call(input, "lead_ready") ||
    Object.prototype.hasOwnProperty.call(input, "leadReady");
  const leadReady = hasLeadReady ? Boolean(input.lead_ready ?? input.leadReady) : undefined;

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
    cooldownUntil: normalizeCooldownUntil(input.cooldown_until || input.cooldownUntil),
    online: hasLeadReady
      ? leadReady && Boolean(input.notification_enabled)
      : Boolean(input.online),
    notificationEnabled: Boolean(input.notification_enabled),
    leadReady,
    eligibleProjectIds: normalizeProjectIds(input.eligible_project_ids || input.eligibleProjectIds),
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

function authoritativeLeadKey(lead = {}) {
  return String(lead.dedupeKey || lead.id || "").trim();
}

function markAuthoritativeLeadCommit(lead) {
  const key = authoritativeLeadKey(lead);
  if (!key) return;
  authoritativeStateGeneration += 1;
  authoritativeLeadGenerations.set(key, authoritativeStateGeneration);
}

function wasLeadCommittedAfterSyncStarted(lead, syncStateGeneration) {
  if (!Number.isFinite(syncStateGeneration)) return false;
  return (authoritativeLeadGenerations.get(authoritativeLeadKey(lead)) || 0) > syncStateGeneration;
}

function shouldIgnoreStaleSyncRow(existingLead, input, syncStateGeneration) {
  if (!wasLeadCommittedAfterSyncStarted(existingLead, syncStateGeneration)) return false;
  const incomingAssignmentRevision = Number(input.assignment_revision ?? input.assignmentRevision) || 0;
  const incomingStatusRevision = Number(input.status_revision ?? input.statusRevision) || 0;
  return incomingAssignmentRevision <= (Number(existingLead.assignmentRevision) || 0) &&
    incomingStatusRevision <= (Number(existingLead.statusRevision) || 0);
}

function getLeadsRemovedBySync(sheetKeys, syncStateGeneration) {
  return state.leads.filter((lead) =>
    !sheetKeys.has(lead.dedupeKey) && !wasLeadCommittedAfterSyncStarted(lead, syncStateGeneration));
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
    if (shouldIgnoreStaleSyncRow(existingLead, input, options.syncStateGeneration)) return false;
    if (sheetRuntime.hasRuntime &&
      sheetRuntime.assignmentRevision < (Number(existingLead.assignmentRevision) || 0)) return false;
    if (pendingLeadStatusUpdates.has(existingLead.id)) return false;
    if ((Number(input.status_revision) || 0) < (existingLead.statusRevision || 0)) return false;
    if (options.syncStartedAt && options.syncStartedAt <= (leadStatusWriteTimes.get(existingLead.id) || 0)) return false;

    let changed = false;
    const updates = { name, phone, email, project, source, createdAt: parsedCreatedAt };
    const incomingNotes = String(input.notes ?? input.nota ?? "");
    const pendingNotes = pendingLeadNoteUpdates.get(existingLead.id)?.notes;
    const shouldMigrateLocalNotes = !incomingNotes && Boolean(String(existingLead.notes || "").trim());
    if (!shouldMigrateLocalNotes && (pendingNotes === undefined || pendingNotes === incomingNotes)) {
      updates.notes = incomingNotes;
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (existingLead[key] !== value) {
        existingLead[key] = value;
        changed = true;
      }
    });

    const pendingStatus = pendingLeadStatusUpdates.get(existingLead.id)?.status;
    const incomingStatus = normalizeSheetStatus(input.status);
    if ((!pendingStatus || pendingStatus === incomingStatus) && applySheetStatusToLead(existingLead, input.status)) {
      changed = true;
    }
    if (applyLeadRuntimeFromSheet(existingLead, sheetRuntime)) changed = true;
    existingLead.statusRevision = Number(input.status_revision) || 0;
    existingLead.statusUpdatedAt = input.status_updated_at || null;

    if (shouldMigrateLocalNotes && !pendingLeadNoteUpdates.has(existingLead.id)) {
      const migrated = await updateLeadNotesInSheet(existingLead, existingLead.notes);
      if (!migrated) console.warn("Legacy local lead note could not be migrated", existingLead.id);
    }
    if (!changed && !shouldMigrateLocalNotes) return false;
    saveState();
    options.onStateCommit?.(existingLead);
    try {
      await persistLead(existingLead);
    } catch (error) {
      showToast("Lead tidak dapat dikemas kini", "Semak sambungan Supabase dan cuba lagi.", "error");
      console.error(error);
      return false;
    }
    return "updated";
  }

  const initialStatus = normalizeSheetStatus(input.status);
  const now = Date.now();
  const hasSheetAssignment = Boolean(sheetRuntime.assignedAgentId || sheetRuntime.queueState === "queued");
  const shouldDistribute = initialStatus === "new";
  const assignedAgent = null;
  let shouldQueue =
    sheetRuntime.queueState === "queued" ||
    (shouldDistribute && !sheetRuntime.assignedAgentId);

  const initialPassCount = initialStatus === "passed" ? 1 : 0;
  const lead = {
    id: crypto.randomUUID?.() || makeId("lead"),
    dedupeKey,
    statusRevision: Number(input.status_revision) || 0,
    statusUpdatedAt: input.status_updated_at || null,
    name,
    phone,
    email,
    project,
    source,
    createdAt: Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : now,
    receivedAt: shouldDistribute && !shouldQueue ? now : null,
    assignedAgentId: assignedAgent?.id || null,
    assignedAgentName: sheetRuntime.assignedAgentName || assignedAgent?.name || "",
    expiresAt: shouldDistribute && !shouldQueue ? now + RESPONSE_WINDOW_MS : null,
    status: shouldQueue ? "queued" : initialStatus,
    passCount: initialPassCount,
    assignmentRevision: sheetRuntime.assignmentRevision || 0,
    assignmentHistory: sheetRuntime.assignmentHistory || [],
    queueState: sheetRuntime.queueState || (shouldQueue ? "queued" : "active"),
    responseMs: initialStatus === "contacted" ? 0 : null,
    contactedAt: initialStatus === "contacted" ? now : null,
    queuedAt: shouldQueue ? now : null,
    notes: String(input.notes || input.nota || ""),
  };
  applyLeadRuntimeFromSheet(lead, sheetRuntime, now);
  shouldQueue = lead.status === "queued";

  state.leads.unshift(lead);
  saveState();
  options.onStateCommit?.(lead);
  try {
    await persistNewLead(lead);
  } catch (error) {
    state.leads = state.leads.filter((item) => item.id !== lead.id);
    saveState();
    showToast("Lead tidak dapat disimpan", "Semak sambungan Supabase dan cuba lagi.", "error");
    console.error(error);
    return false;
  }
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
  const projects = state.projects.filter((project) => project.active);
  elements.manualLeadProject.innerHTML = `<option value="">${systemWorkerText("Pilih projek")}</option>` +
    projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("");
  elements.manualLeadProject.disabled = projects.length === 0;
  elements.manualLeadForm.querySelector('button[type="submit"]').disabled = projects.length === 0;
  elements.manualLeadSource.value = "Manual Lead";
  elements.manualLeadError.textContent = projects.length ? "" : systemWorkerText("Tiada projek aktif. Tambah atau aktifkan projek dahulu.");
  elements.manualLeadModal.classList.add("open");
  elements.manualLeadModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.manualLeadName.focus(), 100);
}

async function addManualLead(event) {
  event.preventDefault();
  if (!guardLifecycleMutation()) return false;
  if (!isAdmin()) {
    elements.manualLeadError.textContent = "Hanya admin boleh tambah manual lead baru.";
    return;
  }
  const name = elements.manualLeadName.value.trim();
  const phone = elements.manualLeadPhone.value.trim();
  const email = elements.manualLeadEmail.value.trim();
  const selectedProject = state.projects.find((project) => project.active && project.id === elements.manualLeadProject.value);
  const project = selectedProject?.name || "";
  const source = elements.manualLeadSource.value;

  if (!name || !phone || !project) {
    elements.manualLeadError.textContent = systemWorkerText("Masukkan nama, nombor telefon dan projek.");
    return;
  }

  const createdAt = remoteDatabaseMode ? new Date().toISOString() : formatSheetTimestamp();
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

  if (remoteDatabaseMode) {
    const { data, error } = await remoteDatabaseClient.rpc("admin_ingest_manual_lead", { p_lead: leadInput });
    if (error || !data?.ok) {
      elements.manualLeadError.textContent = error?.message || data?.error || "Lead tidak dapat disimpan ke Supabase.";
      return;
    }
    await loadRemoteState(state.currentUserId);
  } else {
    const pushedToSheet = await pushManualLeadToSheet(leadInput);
    if (!pushedToSheet) {
      elements.manualLeadError.textContent = "Supabase belum dapat dikemas kini. Cuba lagi.";
      return;
    }
    const result = await addLead(leadInput, { silent: true, updateExisting: true, notify: true, queueIfBlocked: true });
    if (!result) {
      elements.manualLeadError.textContent = systemWorkerText("Lead sudah disimpan, tetapi dashboard belum dapat sync. Semak ejen aktif.");
      return;
    }
  }

  closeModal(elements.manualLeadModal);
  showToast("Manual lead disimpan", "Supabase dan dashboard telah diselaraskan.", "success");
  renderAll();
}

const LEAD_IMPORT_HEADERS = ["name", "phone", "email", "city", "project"];

function leadImportHeader(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    nama: "name",
    nama_lead: "name",
    telefon: "phone",
    no_telefon: "phone",
    nombor_telefon: "phone",
    emel: "email",
    projek: "project",
    product: "project",
    produk: "project",
    bandar: "city",
  };
  return aliases[normalized] || normalized;
}

function parseCsvTable(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  return rows;
}

function excelImportValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    if (value.result !== undefined) return excelImportValue(value.result);
    if (value.text !== undefined) return String(value.text);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  }
  return value == null ? "" : String(value);
}

async function readLeadImportRows(file) {
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  if (extension === "csv") return parseCsvTable(await file.text());
  if (extension !== "xlsx") throw new Error("Gunakan fail .csv atau .xlsx sahaja.");
  if (!window.ExcelJS) throw new Error("Pembaca fail Excel belum tersedia. Refresh dan cuba semula.");
  const workbook = new window.ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (sheetRow) => {
    const values = [];
    for (let column = 1; column <= sheetRow.cellCount; column += 1) {
      values.push(excelImportValue(sheetRow.getCell(column).value));
    }
    rows.push(values);
  });
  return rows;
}

function normalizeLeadImportRows(table) {
  if (table.length < 2) throw new Error("Fail mesti mempunyai tajuk kolum dan sekurang-kurangnya satu lead.");
  const headers = table[0].map(leadImportHeader);
  const required = LEAD_IMPORT_HEADERS;
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Kolum wajib tiada: ${missing.map((header) => header === "project" && isTeamSales() ? "product" : header).join(", ")}.`);
  if (table.length - 1 > 1000) throw new Error("Maksimum 1,000 baris bagi setiap import.");

  const projects = new Map(state.projects
    .filter((project) => project.active)
    .map((project) => [project.name.trim().toLowerCase(), project.name]));
  return table.slice(1).map((cells, index) => {
    const raw = Object.fromEntries(headers.map((header, column) => [header, excelImportValue(cells[column]).trim()]));
    const errors = [];
    if (!raw.name) errors.push("nama tiada");
    if (!normalizePhone(raw.phone)) errors.push("telefon tiada");
    const canonicalProject = projects.get(String(raw.project || "").toLowerCase());
    if (!canonicalProject) errors.push(systemWorkerText("projek tidak aktif/tidak wujud"));
    return {
      rowNumber: index + 2,
      name: raw.name || "",
      phone: normalizePhone(raw.phone),
      email: raw.email || "",
      project: canonicalProject || raw.project || "",
      city: raw.city || "",
      errors,
    };
  });
}

function renderLeadImportPreview() {
  const invalid = pendingLeadImportRows.filter((row) => row.errors.length).length;
  elements.leadImportCount.textContent = `${pendingLeadImportRows.length} baris`;
  elements.leadImportSummary.hidden = pendingLeadImportRows.length === 0;
  elements.leadImportSummary.classList.toggle("has-errors", invalid > 0);
  elements.leadImportSummary.textContent = pendingLeadImportRows.length
    ? invalid ? `${invalid} baris perlu dibaiki sebelum upload.` : `${pendingLeadImportRows.length} lead sedia untuk diupload.`
    : "";
  elements.uploadLeadsButton.disabled = !pendingLeadImportRows.length || invalid > 0;
  elements.clearLeadImport.disabled = !pendingLeadImportRows.length;
  elements.leadImportPreview.innerHTML = pendingLeadImportRows.length
    ? pendingLeadImportRows.slice(0, 100).map((row) => `
      <tr class="${row.errors.length ? "import-row-error" : ""}">
        <td><strong>${escapeHtml(row.name || `Baris ${row.rowNumber}`)}</strong>${row.errors.length ? `<small>${escapeHtml(row.errors.join(" · "))}</small>` : ""}</td>
        <td>${escapeHtml(row.phone)}</td>
        <td>${escapeHtml(row.email)}</td>
        <td>${escapeHtml(row.city)}</td>
        <td>${escapeHtml(row.project)}</td>
      </tr>`).join("")
    : '<tr><td colspan="5" class="table-empty">Preview akan muncul selepas fail dipilih.</td></tr>';
}

async function handleLeadImportFile(event) {
  const file = event.target.files?.[0];
  resetLeadImport(false);
  if (!file) return;
  elements.leadImportStatus.textContent = `Membaca ${file.name}...`;
  try {
    pendingLeadImportRows = normalizeLeadImportRows(await readLeadImportRows(file));
    elements.leadImportStatus.textContent = `${file.name} berjaya dibaca.`;
  } catch (error) {
    elements.leadImportStatus.textContent = error.message || "Fail tidak dapat dibaca.";
    elements.leadImportStatus.classList.add("error");
  }
  renderLeadImportPreview();
}

function resetLeadImport(clearFile = true) {
  pendingLeadImportRows = [];
  if (clearFile && elements.leadImportFile) elements.leadImportFile.value = "";
  elements.leadImportStatus.classList.remove("error");
  elements.leadImportStatus.textContent = "Belum ada fail dipilih.";
  renderLeadImportPreview();
}

async function importedLeadId(row) {
  const canonical = [row.name, row.phone, row.email, row.city, row.project]
    .map((value) => String(value || "").trim().toLowerCase()).join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `upload-${hex.slice(0, 32)}`;
}

async function uploadImportedLeads() {
  if (!isAdmin() || !remoteDatabaseMode || !remoteDatabaseClient || !pendingLeadImportRows.length) return;
  elements.uploadLeadsButton.disabled = true;
  elements.clearLeadImport.disabled = true;
  elements.uploadLeadsButton.classList.add("is-loading");
  let inserted = 0;
  let duplicates = 0;
  const failures = [];
  for (let index = 0; index < pendingLeadImportRows.length; index += 1) {
    const row = pendingLeadImportRows[index];
    elements.leadImportStatus.textContent = `Mengupload ${index + 1} daripada ${pendingLeadImportRows.length}...`;
    const leadInput = {
      id: await importedLeadId(row),
      name: row.name,
      phone: row.phone,
      email: row.email,
      project: row.project,
      source: "Manual Lead",
      city: row.city,
      notes: "",
      created_at: new Date().toISOString(),
      status: "new",
    };
    const { data, error } = await remoteDatabaseClient.rpc("admin_ingest_manual_lead", { p_lead: leadInput });
    if (error || !data?.ok) failures.push({ row, message: error?.message || data?.error || "Upload gagal" });
    else if (data.result === "duplicate") duplicates += 1;
    else inserted += 1;
  }
  elements.uploadLeadsButton.classList.remove("is-loading");
  if (failures.length) {
    pendingLeadImportRows = failures.map(({ row, message }) => ({ ...row, errors: [message] }));
    elements.leadImportStatus.textContent = `${inserted} berjaya, ${duplicates} duplicate, ${failures.length} gagal.`;
    elements.leadImportStatus.classList.add("error");
    renderLeadImportPreview();
  } else {
    await loadRemoteState(state.currentUserId);
    resetLeadImport();
    elements.leadImportStatus.textContent = `${inserted} lead baharu berjaya diupload${duplicates ? `, ${duplicates} duplicate diabaikan` : ""}.`;
    showToast("Import selesai", `${inserted} lead baharu telah masuk ke Supabase.`, "success");
  }
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function leadSampleRows() {
  return [
    LEAD_IMPORT_HEADERS.map((header) => header === "project" && isTeamSales() ? "product" : header),
    ["Nama Lead", "60123456789", "lead@example.com", "Kuala Lumpur", state.projects.find((project) => project.active)?.name || systemWorkerText("Nama Projek")],
  ];
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadLeadSampleCsv() {
  const csv = leadSampleRows().map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadFile(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), "leadlaju-sample-leads.csv");
}

async function downloadLeadSampleXlsx() {
  if (!window.ExcelJS) {
    showToast("Excel belum tersedia", "Refresh halaman dan cuba semula.", "error");
    return;
  }
  const workbook = new window.ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("New Leads");
  worksheet.addRows(leadSampleRows());
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns.forEach((column) => { column.width = 20; });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "leadlaju-sample-leads.xlsx");
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

async function postGoogleSheetAction(payload, errorLabel, options = {}) {
  const endpoint = getSheetEndpoint();
  if (!endpoint) return false;

  const body = JSON.stringify(payload);
  try {
    if (!options.waitForSend && navigator.sendBeacon) {
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

async function postGoogleSheetActionWithResponse(payload, errorLabel) {
  if (!getSheetEndpoint()) throw new Error("Sambungan server belum ditetapkan.");

  try {
    const response = await fetch("/api/lead-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || `Server membalas ralat ${response.status}.`);
    if (!result?.ok) throw new Error(result?.error || "Server tidak menyimpan perubahan status.");

    state.integration.connected = true;
    state.integration.lastSyncAt = Date.now();
    saveState();
    return result;
  } catch (error) {
    console.error(errorLabel, error);
    throw error;
  }
}

async function updateLeadStatusInSheet(lead, status) {
  if (!lead) return false;
  const sheetStatus = formatSheetStatus(normalizeSheetStatus(status));
  const currentUser = getCurrentUser();
  const actingAgent = currentUser?.role === "agent" ? currentUser : null;
  const result = await postGoogleSheetActionWithResponse(
    {
      action: "update_lead_status",
      lead: {
        id: lead.dedupeKey || lead.id,
        phone: lead.phone,
        project: lead.project,
        name: lead.name,
        status: sheetStatus,
        acting_role: currentUser?.role || "",
        acting_agent_id: actingAgent?.id || "",
        acting_agent_name: actingAgent?.name || "",
        acting_agent_email: actingAgent?.email || "",
        assignment_revision: Number(lead.assignmentRevision) || 0,
      },
    },
    "Lead sheet status update failed",
  );
  lead.statusRevision = Number(result.status_revision) || lead.statusRevision || 0;
  lead.statusUpdatedAt = result.status_updated_at || lead.statusUpdatedAt || null;
  return true;
}

async function updateLeadNotesInSheet(lead, notes) {
  if (!lead) return false;
  return postGoogleSheetAction(
    {
      action: "update_lead_notes",
      lead: {
        id: lead.dedupeKey || lead.id,
        phone: lead.phone,
        project: lead.project,
        notes,
        assigned_agent_id: lead.assignedAgentId || "",
        assignment_revision: Number(lead.assignmentRevision) || 0,
      },
    },
    "Lead sheet note update failed",
    { waitForSend: true },
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
    assignment_revision: Number(lead.assignmentRevision) || 0,
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

async function expireLeadInSheet(lead) {
  if (!lead) return false;
  return postGoogleSheetActionWithResponse(
    {
      action: "expire_lead",
      lead: {
        id: lead.dedupeKey || lead.id,
        assignment_revision: Number(lead.assignmentRevision) || 0,
      },
    },
    "Lead expiry sync failed",
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
    cooldown_until: normalizeCooldownUntil(agent.cooldownUntil)
      ? new Date(normalizeCooldownUntil(agent.cooldownUntil)).toISOString()
      : "",
    lead_ready: Boolean(agent.leadReady),
    eligible_project_ids: normalizeProjectIds(agent.eligibleProjectIds),
  };
}

async function updateAgentPresence(online, force = false) {
  const user = getCurrentUser();
  if (!user?.id || user.role !== "agent") return false;
  const now = Date.now();
  if (online && !force && now - lastAgentPresenceHeartbeatAt < AGENT_PRESENCE_HEARTBEAT_MS) {
    return true;
  }
  if (remoteDatabaseMode) {
    const { data, error } = await remoteDatabaseClient.rpc("heartbeat_agent", {
      p_session_started_at: new Date(agentPresenceSessionStartedAt || now).toISOString(),
      p_notification_ready: Notification.permission === "granted",
    });
    if (error || !data?.ok) return false;
    lastAgentPresenceHeartbeatAt = online ? now : 0;
    return true;
  }
  const updated = await postGoogleSheetAction({
    action: "update_agent_presence",
    agent: {
      id: user.id,
      email: user.email,
      online,
      notification_enabled: Notification.permission === "granted",
      session_started_at: agentPresenceSessionStartedAt,
    },
  }, "Agent presence update failed", { waitForSend: true });
  if (updated) lastAgentPresenceHeartbeatAt = online ? now : 0;
  return updated;
}

async function setAgentLeadAvailability(ready) {
  if (!guardLifecycleMutation()) return false;
  const user = getCurrentUser();
  if (!user?.id || user.role !== "agent") return false;
  if (ready && !isPhonePushDevice()) {
    showToast("GET LEAD hanya di telefon", "Aktifkan loceng LeadLaju pada iPhone atau Android untuk masuk giliran lead.", "error");
    return false;
  }
  if (ready && (!("Notification" in window) || Notification.permission !== "granted")) {
    enforceAgentNotificationAccess();
    showToast("Aktifkan loceng dahulu", "Benarkan notifikasi sebelum menekan GET LEAD.", "error");
    return false;
  }

  const button = ready ? elements.getLeadButton : elements.stopLeadButton;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  setGlobalLoading(true, ready ? "Memasuki giliran lead..." : "Menghentikan agihan lead...");
  let result;
  let statusRendered = false;
  let loadingActive = true;
  const finishLoading = () => {
    if (!loadingActive) return;
    loadingActive = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    setGlobalLoading(false);
  };
  try {
    if (ready) {
      const subscribed = await syncPushSubscription(true).catch(() => false);
      if (!subscribed) {
        showToast("Notifikasi belum sedia", "Pastikan loceng dan notifikasi pelayar telah diaktifkan sebelum GET LEAD.", "error");
        return false;
      }
      await updateAgentPresence(true, true);
    }
    if (typeof remoteDatabaseMode !== "undefined" && remoteDatabaseMode) {
      const response = await remoteDatabaseClient.rpc("set_agent_availability", {
        p_ready: ready,
        p_notification_ready: Notification.permission === "granted",
      });
      if (response.error || !response.data?.ok) throw response.error || new Error(response.data?.error || "Status tidak dapat disimpan.");
      result = response.data;
    } else {
      result = await postGoogleSheetActionWithResponse({
        action: "set_agent_lead_availability",
        agent: { id: user.id, email: user.email, ready },
      }, "Lead availability update failed");
    }

    user.leadReady = Boolean(result?.lead_ready ?? ready);
    if (!(typeof remoteDatabaseMode !== "undefined" && remoteDatabaseMode)) {
      user.online = user.leadReady && Notification.permission === "granted";
    }
    saveState();
    renderAll();
    statusRendered = true;
    finishLoading();
    openLeadAvailabilityConfirmation(user.leadReady);
    if (typeof remoteDatabaseMode !== "undefined" && remoteDatabaseMode) queueRemoteReload();
    else syncGoogleSheet({ silent: true, notifyNewLeads: true });
    return true;
  } catch (error) {
    showToast("Status tidak dikemas kini", error.message || "Semak sambungan dan cuba lagi.", "error");
    return false;
  } finally {
    finishLoading();
    if (!statusRendered) button.disabled = false;
  }
}

function isInstalledApp() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function getAgentAppAccessState() {
  if (!isPhonePushDevice()) return "phone-required";
  if (!isInstalledApp()) return "install-required";
  if (!("Notification" in window) || Notification.permission !== "granted") return "permission-required";
  if (!agentPushAccessReady) return "subscription-required";
  return "ready";
}

function renderAgentAccessGate(accessState) {
  const locked = accessState !== "ready";
  document.body.classList.toggle("agent-access-locked", locked);
  elements.notificationRequiredModal.classList.toggle("open", locked);
  elements.notificationRequiredModal.setAttribute("aria-hidden", String(!locked));
  const connectionError = elements.notificationRequiredModal.querySelector("#notification-connection-error");
  connectionError.textContent = notificationConnectionError;
  connectionError.hidden = !locked || !notificationConnectionError;
  if (!locked) return;

  const title = elements.notificationRequiredModal.querySelector("#notification-required-title");
  const steps = elements.notificationRequiredModal.querySelector("#notification-required-description");
  elements.homeScreenHelp.hidden = true;

  if (accessState === "phone-required") {
    title.textContent = "Gunakan aplikasi telefon";
    steps.innerHTML = "<li><span>Buka <strong>leadlaju.vercel.app</strong> pada iPhone atau telefon Android.</span></li><li><span>Tambah LeadLaju ke Home Screen dan buka melalui ikon aplikasi.</span></li><li><span>Aktifkan loceng untuk mula menggunakan LeadLaju.</span></li>";
    elements.addToHomeScreen.hidden = true;
    elements.enableRequiredNotifications.hidden = true;
    return;
  }

  if (accessState === "install-required") {
    title.textContent = "Pasang LeadLaju";
    steps.innerHTML = "<li><span>Tekan <strong>Settings</strong> pada browser atau butang <strong>Share</strong>.</span></li><li><span>Pilih <strong>Add to Home Screen</strong>, kemudian tekan Add.</span></li><li><span>Tutup browser dan buka LeadLaju melalui ikon aplikasi.</span></li>";
    elements.addToHomeScreen.hidden = false;
    elements.enableRequiredNotifications.hidden = true;
    return;
  }

  title.textContent = accessState === "subscription-required" ? "Sediakan notifikasi" : "Aktifkan notifikasi";
  steps.innerHTML = accessState === "subscription-required"
    ? "<li><span>Notifikasi mesti disambungkan kepada peranti ini sebelum LeadLaju boleh digunakan.</span></li><li><span>Tekan <strong>Sambung semula</strong> jika proses tidak selesai.</span></li>"
    : "<li><span>Tekan <strong>Aktifkan loceng</strong>.</span></li><li><span>Pilih <strong>Allow</strong> apabila telefon meminta kebenaran.</span></li><li><span>LeadLaju dibuka selepas notifikasi berjaya disambungkan.</span></li>";
  elements.addToHomeScreen.hidden = true;
  elements.enableRequiredNotifications.hidden = false;
  elements.enableRequiredNotifications.disabled = notificationRequestInProgress;
  elements.enableRequiredNotifications.setAttribute("aria-busy", String(notificationRequestInProgress));
  elements.enableRequiredNotifications.querySelector("span").textContent = notificationRequestInProgress
    ? "Menyambungkan…"
    : accessState === "subscription-required"
    ? "Sambung semula"
    : "Aktifkan loceng";
}

async function verifyAgentPushAccess(force = false) {
  if (agentPushAccessCheckInProgress && !force) return false;
  if (!isPhonePushDevice() || !isInstalledApp()) return false;
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  agentPushAccessCheckInProgress = true;
  try {
    agentPushAccessReady = await syncPushSubscription(force).catch((error) => {
      console.warn("Agent push access check failed", error);
      notificationConnectionError = pushConnectionErrorMessage(error);
      return false;
    });
    if (agentPushAccessReady) notificationConnectionError = "";
    return agentPushAccessReady;
  } finally {
    agentPushAccessCheckInProgress = false;
    renderAgentAccessGate(getAgentAppAccessState());
  }
}

function enforceAgentNotificationAccess() {
  const user = getCurrentUser();
  if (user?.role !== "agent") {
    document.body.classList.remove("agent-access-locked");
    elements.notificationRequiredModal.classList.remove("open");
    elements.notificationRequiredModal.setAttribute("aria-hidden", "true");
    return;
  }
  const accessState = getAgentAppAccessState();
  renderAgentAccessGate(accessState);
  if (accessState === "subscription-required") verifyAgentPushAccess();
  if (accessState === "ready") updateAgentPresence(true);
}

function showHomeScreenHelp() {
  const isIos = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
  elements.homeScreenHelp.hidden = false;
  elements.homeScreenHelpTitle.textContent = isInstalledApp()
    ? "Aplikasi sudah dipasang"
    : "Tambah LeadLaju ke skrin utama";
  elements.homeScreenHelpMessage.textContent = isInstalledApp()
    ? "Buka aplikasi LeadLaju dari skrin utama, kemudian tekan loceng untuk benarkan notifikasi lead baharu."
    : isIos
      ? "1. Tekan Share. 2. Pilih Add to Home Screen. 3. Tekan Add."
      : "Buka menu pelayar dan pilih Install atau Add to Home Screen.";
}

async function addToHomeScreen() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    return;
  }
  showHomeScreenHelp();
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

async function submitAgentSignupToSheet(agent, options = {}) {
  let response;
  let result;
  try {
    response = await fetch("/api/agent-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: options.approve ? "approve_agent" : "signup_agent",
        agent: agentSheetPayload(agent),
      }),
    });
    result = await response.json().catch(() => null);
  } catch (error) {
    if (options.approve) throw error;
  }
  if (!response?.ok || !result?.ok) {
    if (!options.approve) {
      const recoveredAgent = await confirmPersistedSignupAgent(agent);
      if (recoveredAgent) return { ok: true, recovered: true, agent: recoveredAgent };
    }
    throw new Error(result?.error || "Permohonan tidak dapat disimpan di server.");
  }
  const persistedAgent = result.agent || result.persisted_agent;
  if (!persistedAgent?.id || !persistedAgent?.name || !persistedAgent?.phone || !persistedAgent?.email) {
    throw new Error("Server tidak mengesahkan maklumat ejen dengan lengkap.");
  }
  return { ...result, agent: persistedAgent };
}

async function confirmPersistedSignupAgent(agent) {
  if (!agent?.id || !getSheetEndpoint()) return null;
  try {
    const url = new URL(getSheetEndpoint());
    url.searchParams.set("_", Date.now().toString());
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    const persistedAgent = (payload.agents || []).find((item) => String(item.id || "") === String(agent.id));
    if (
      !persistedAgent?.id ||
      !persistedAgent?.name ||
      !persistedAgent?.phone ||
      !persistedAgent?.email ||
      normalizeAgentActive(persistedAgent.active ?? persistedAgent.status)
    ) return null;
    return persistedAgent;
  } catch (error) {
    console.warn("Signup confirmation read failed", error);
    return null;
  }
}

async function deleteAgentFromSheet(agent) {
  if (!agent?.id && !agent?.email) throw new Error("Identiti ejen tidak lengkap.");
  const response = await fetch("/api/agent-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "delete_agent",
      agent: {
        id: agent.id,
        email: agent.email,
      },
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || "Ejen tidak dapat dipadam daripada server.");
  }
  return result;
}

async function forceAgentOfflineInSheet(agent) {
  if (!agent?.id) return false;
  return postGoogleSheetAction(
    { action: "force_agent_offline", agent: { id: agent.id } },
    "Force offline ejen gagal",
    { waitForSend: true },
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
  const sheetEmails = new Set(sheetAgents.map((agent) => agent.email));
  let reloadRemote = false;

  for (const sheetAgent of sheetAgents) {
    if (authoritativelyDeletedAgentIds.has(sheetAgent.id)) continue;
    const existingAgent = state.agents.find((agent) => {
      const emailMatches = agent.email?.toLowerCase() === sheetAgent.email;
      return (sheetAgent.id && agent.id === sheetAgent.id) || emailMatches;
    });

    if (pendingAgentDeletions.has(existingAgent?.id || sheetAgent.id)) continue;

    if (existingAgent) {
      const nextActive =
        existingAgent.id === state.currentUserId && existingAgent.role === "admin"
          ? true
          : pendingAgentApprovals.has(existingAgent.id)
            ? existingAgent.active
            : sheetAgent.active;
      const updates = {
        name: sheetAgent.name,
        phone: sheetAgent.phone,
        email: sheetAgent.email,
        active: nextActive,
        leadsHandled: sheetAgent.leadsHandled,
        cooldownUntil: sheetAgent.cooldownUntil,
        online: sheetAgent.online,
        notificationEnabled: sheetAgent.notificationEnabled,
        eligibleProjectIds: sheetAgent.eligibleProjectIds,
      };
      if (sheetAgent.leadReady !== undefined) updates.leadReady = sheetAgent.leadReady;
      if (sheetAgent.password.length >= 8) {
        updates.password = sheetAgent.password;
      }
      const needsPasswordBackfill = !sheetAgent.password && Boolean(existingAgent.password);
      const changed = Object.entries(updates).some(([key, value]) =>
        key === "eligibleProjectIds" ? !sameProjectIds(existingAgent[key], value) : existingAgent[key] !== value,
      );
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
      cooldownUntil: sheetAgent.cooldownUntil,
      online: sheetAgent.online,
      notificationEnabled: sheetAgent.notificationEnabled,
      leadReady: sheetAgent.leadReady ?? false,
      eligibleProjectIds: sheetAgent.eligibleProjectIds,
    });
    result.added += 1;
    result.backfilled += sheetAgent.id && sheetAgent.password ? 0 : 1;
  }

  const removedAgents = state.agents.filter(
    (agent) =>
      agent.role === "agent" &&
      agent.id !== state.currentUserId &&
      !pendingAgentApprovals.has(agent.id) &&
      !pendingAgentDeletions.has(agent.id) &&
      !sheetEmails.has(String(agent.email || "").toLowerCase()),
  );

  for (const agent of removedAgents) {
    state.agents = state.agents.filter((item) => item.id !== agent.id);
    result.removed += 1;
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
  if (!shouldNotifyForLead(lead)) return;
  const key = leadNotificationKey(lead);
  if (!options.force && notifiedLeadKeys.has(key)) return;

  markLeadNotificationSeen(lead);
  saveNotifiedLeadKeys();
  if (options.toast) {
    showToast("Lead baru masuk", isTeamSales() ? `${lead.name} tersedia untuk Call atau WhatsApp.` : `${lead.name} menunggu tindakan dalam 5 minit.`);
  }
  await playNotificationSound();

  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const agent = getAgent(lead.assignedAgentId);
  const title = `Lead baru: ${lead.project || systemWorkerText("Projek baru")}`;
  const notificationOptions = {
    body: isTeamSales() ? `${lead.name}\nLead baharu tersedia untuk Call atau WhatsApp.` : `${lead.name}\nNombor dibuka selepas CALL NOW. Diberikan kepada ${agent?.name || "ejen"}.`,
    tag: `leadlaju-new-${activeBrandId}-${lead.assignedAgentId}-${lead.id}-${lead.assignmentRevision || 0}`,
    renotify: true,
    requireInteraction: true,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    data: {
      leadId: lead.id,
      url: `${getNotificationStartUrl("follow-up-due")}&section=new`,
      view: 'follow-up-due',
      reminderType: 'new-lead',
      brandId: activeBrandId,
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
      followUpSection = 'new';
      switchView('follow-up-due');
      notification.close();
    };
  } catch (error) {
    console.warn("Browser notification failed", error);
  }
}

function getDueFollowUpReminderSlot(value = Date.now()) {
  const parts = malaysiaDateParts(value);
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  return FOLLOW_UP_REMINDER_SLOTS.find((slot) => {
    const [hour, minute] = slot.time.split(":").map(Number);
    const slotMinutes = hour * 60 + minute;
    return currentMinutes >= slotMinutes && currentMinutes < slotMinutes + FOLLOW_UP_REMINDER_WINDOW_MINUTES;
  });
}

function followUpReminderKey(slot, value = Date.now()) {
  const user = getCurrentUser();
  return `${todayKey(value)}:${slot.time}:${user?.id || "guest"}`;
}

function getVisibleFollowUpReminderLeads() {
  const user = getCurrentUser();
  return state.leads.filter((lead) => {
    if (!lead?.name && !lead?.phone && !lead?.project) return false;
    return isAdmin() || lead.assignedAgentId === user?.id;
  });
}

function getAgentFollowUpLeads(agentId) {
  return state.leads.filter((lead) => {
    if (!lead?.name && !lead?.phone && !lead?.project) return false;
    return lead.assignedAgentId === agentId;
  });
}

function buildFollowUpSummary(leads) {
  const counts = new Map();
  leads.forEach((lead) => {
    const label = formatSheetStatus(getLeadVisualStatus(lead));
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => `${label}: ${count}`)
    .slice(0, 4)
    .join(" • ");
}

async function sendFollowUpReminder(slot, leads) {
  const user = getCurrentUser();
  const count = leads.length;
  const summary = buildFollowUpSummary(leads);
  const title = `Reminder follow up ${slot.label}`;
  const body = `${count} lead untuk follow up.${summary ? `\n${summary}` : ""}\nBuka Log Lead untuk update status dan nota.`;

  showToast(title, `${count} lead perlu follow up dalam Log Lead.`);
  await playNotificationSound();

  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const notificationOptions = {
    body,
    tag: `leadlaju-follow-up-${todayKey()}-${slot.time}-${user?.id || "guest"}`,
    renotify: true,
    requireInteraction: true,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    data: {
      view: "leads",
      url: getNotificationStartUrl("leads"),
    },
  };

  try {
    const registration = await registerServiceWorker();
    if (registration?.showNotification) {
      await registration.showNotification(title, notificationOptions);
      return;
    }
  } catch (error) {
    console.warn("Follow-up reminder notification failed", error);
  }

  try {
    const notification = new Notification(title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      switchView("leads");
      notification.close();
    };
  } catch (error) {
    console.warn("Browser reminder notification failed", error);
  }
}

function normalizeAdminReminder(input) {
  if (!input || typeof input !== "object") return null;
  const id = String(input.id || input.reminder_id || "").trim();
  if (!id) return null;
  return {
    id,
    createdAt: parseLeadTimestamp(input.created_at || input.createdAt || Date.now(), Date.now()),
    createdByName: String(input.created_by_name || input.createdByName || "Admin").trim() || "Admin",
    message:
      String(input.message || "").trim() ||
      "Sila follow up semua lead dalam Log Lead dan kemas kini status.",
  };
}

function adminReminderUserKey(reminder, user = getCurrentUser()) {
  return `${reminder?.id || "reminder"}:${user?.id || "guest"}`;
}

function renderAdminReminderAlert(reminder = latestAdminReminder) {
  if (!elements.adminReminderAlert) return;
  const user = getCurrentUser();
  if (!reminder || user?.role !== "agent" || !user.active) {
    elements.adminReminderAlert.hidden = true;
    return;
  }

  const key = adminReminderUserKey(reminder, user);
  if (dismissedAdminReminderKeys.has(key)) {
    elements.adminReminderAlert.hidden = true;
    return;
  }

  const leads = getAgentFollowUpLeads(user.id);
  const summary = buildFollowUpSummary(leads);
  elements.adminReminderTitle.textContent = `Admin remind follow up - ${leads.length} lead`;
  elements.adminReminderMessage.textContent = `${reminder.createdByName}: ${reminder.message}${
    summary ? ` (${summary})` : ""
  }`;
  elements.adminReminderAlert.hidden = false;
}

function dismissAdminReminder() {
  if (!latestAdminReminder) return;
  dismissedAdminReminderKeys.add(adminReminderUserKey(latestAdminReminder));
  dismissedAdminReminderKeys = saveAdminReminderKeys(
    dismissedAdminReminderKeys,
    ADMIN_REMINDER_DISMISSED_KEY,
  );
  renderAdminReminderAlert();
}

async function sendAdminFollowUpNotification(reminder) {
  const user = getCurrentUser();
  if (!user || user.role !== "agent" || !user.active) return;

  latestAdminReminder = reminder;
  renderAdminReminderAlert(reminder);

  const key = adminReminderUserKey(reminder, user);
  if (dismissedAdminReminderKeys.has(key) || notifiedAdminReminderKeys.has(key)) return;

  const leads = getAgentFollowUpLeads(user.id);
  const count = leads.length;
  const summary = buildFollowUpSummary(leads);
  const title = "Admin remind follow up";
  const body = `${reminder.createdByName}: ${reminder.message}\n${count} lead untuk disemak.${summary ? `\n${summary}` : ""}`;

  const canShowInApp = !document.hidden;
  const canSystemNotify = "Notification" in window && Notification.permission === "granted";
  if (!canShowInApp && !canSystemNotify) return;

  if (canShowInApp) showToast(title, `${count} lead perlu follow up dalam Log Lead.`);
  await playNotificationSound();

  const notificationOptions = {
    body,
    tag: `leadlaju-admin-reminder-${reminder.id}-${user.id}`,
    renotify: true,
    requireInteraction: true,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    data: {
      view: "leads",
      url: getNotificationStartUrl("leads"),
    },
  };

  let delivered = canShowInApp;
  if (canSystemNotify) {
    try {
      const registration = await registerServiceWorker();
      if (registration?.showNotification) {
        await registration.showNotification(title, notificationOptions);
        delivered = true;
      }
    } catch (error) {
      console.warn("Admin reminder notification failed", error);
    }

    if (!delivered) {
      try {
        const notification = new Notification(title, notificationOptions);
        notification.onclick = () => {
          window.focus();
          switchView("leads");
          notification.close();
        };
        delivered = true;
      } catch (error) {
        console.warn("Browser admin reminder failed", error);
      }
    }
  }

  if (delivered) {
    notifiedAdminReminderKeys.add(key);
    notifiedAdminReminderKeys = saveAdminReminderKeys(
      notifiedAdminReminderKeys,
      ADMIN_REMINDER_NOTIFIED_KEY,
    );
  }
}

async function processAdminReminderFromSheet(input) {
  if (document.body.classList.contains("logged-out")) return;
  const reminder = normalizeAdminReminder(input);
  latestAdminReminder = reminder;
  renderAdminReminderAlert(reminder);
  if (!reminder) return;
  await sendAdminFollowUpNotification(reminder);
}

function getCurrentAgentPotentialLeads() {
  const user = getCurrentUser();
  if (user?.role !== "agent") return [];
  return state.leads.filter(
    (lead) => lead.assignedAgentId === user.id && getLeadVisualStatus(lead) === "potential",
  );
}

function clearPotentialReminderRequest() {
  const url = new URL(window.location.href);
  url.searchParams.delete("reminder");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function openPotentialReminderModal() {
  const user = getCurrentUser();
  if (!pendingPotentialReminder || user?.role !== "agent" || document.body.classList.contains("logged-out")) return;
  const count = getCurrentAgentPotentialLeads().length;
  pendingPotentialReminder = false;
  clearPotentialReminderRequest();
  switchView("leads");
  elements.potentialReminderTitle.textContent = count
    ? `${count} prospek panas menunggu`
    : "Tiada prospek panas menunggu";
  elements.potentialReminderDescription.textContent = count
    ? `Anda mempunyai ${count} lead berstatus Potential. Jangan lepaskan peluang ini - follow up sekarang kerana prospek ini sudah satu langkah lagi untuk close.`
    : "Semua lead Potential anda sudah dikemas kini. Teruskan semak Log Lead untuk follow up seterusnya.";
  elements.potentialReminderModal.classList.add("open");
  elements.potentialReminderModal.setAttribute("aria-hidden", "false");
}

async function handlePotentialReminderNotification() {
  const user = getCurrentUser();
  if (user?.role !== "agent" || document.body.classList.contains("logged-out")) return;
  pendingPotentialReminder = true;
  switchView("leads");
  await syncGoogleSheet({ silent: true });
  openPotentialReminderModal();
}

async function remindAllAgentsForFollowUp() {
  if (!isAdmin()) {
    showToast("Admin sahaja", "Hanya admin boleh hantar reminder kepada semua agent.", "error");
    return;
  }

  const activeAgents = getActiveAgents();
  if (!activeAgents.length) {
    showToast("Tiada agent aktif", "Aktifkan agent dahulu sebelum hantar reminder.", "error");
    return;
  }

  if (elements.remindAgentsButton) elements.remindAgentsButton.disabled = true;
  const user = getCurrentUser();
  const reminder = {
    id: makeId("reminder"),
    created_at: formatSheetTimestamp(Date.now()),
    created_by_id: user.id,
    created_by_name: user.name || "Admin",
    target: "agents",
    message: "Sila follow up semua lead dalam Log Lead dan kemas kini status.",
  };
  let pushed = false;
  try {
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.rpc("broadcast_follow_up_reminder", {
        p_message: reminder.message,
      });
      if (error || !data?.ok) throw error || new Error(data?.error || "Reminder gagal dihantar.");
      pushed = true;
      queueRemoteReload();
    } else {
      pushed = await postGoogleSheetAction(
        { action: "broadcast_follow_up_reminder", reminder },
        "Follow-up reminder broadcast failed",
      );
    }
  } finally {
    if (elements.remindAgentsButton) elements.remindAgentsButton.disabled = false;
  }

  showToast(
    pushed ? "Reminder dihantar" : "Reminder belum sync",
    pushed
      ? `${activeAgents.length} agent aktif akan terima reminder pada sync seterusnya.`
      : "Semak sambungan server dan cuba lagi.",
    pushed ? "success" : "error",
  );
}

async function checkFollowUpReminder() {
  if (remoteDatabaseMode) return; // Production owner reminders are exclusively server-scheduled.
  if (document.body.classList.contains("logged-out")) return;
  const slot = getDueFollowUpReminderSlot();
  if (!slot) return;

  const key = followUpReminderKey(slot);
  if (sentFollowUpReminderKeys.has(key)) return;

  const leads = getVisibleFollowUpReminderLeads();
  if (!leads.length) return;

  sentFollowUpReminderKeys.add(key);
  saveFollowUpReminderKeys();
  await sendFollowUpReminder(slot, leads);
}

function scheduleFollowUpReminders() {
  window.clearInterval(followUpReminderTimer);
  checkFollowUpReminder();
  followUpReminderTimer = window.setInterval(checkFollowUpReminder, 30 * 1000);
}

async function requestNotifications() {
  if (notificationRequestInProgress) return;
  if (getCurrentUser()?.role === "agent" && (!isPhonePushDevice() || !isInstalledApp())) {
    enforceAgentNotificationAccess();
    return;
  }
  if (!("Notification" in window)) {
    showToast("Tidak disokong", "Pelayar ini tidak menyokong notifikasi sistem.", "error");
    return;
  }
  notificationRequestInProgress = true;
  notificationConnectionError = "";
  if (getCurrentUser()?.role === "agent") renderAgentAccessGate(getAgentAppAccessState());
  try {
    // Ask for permission directly inside the tap, before any unrelated awaits.
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") {
      notificationConnectionError = "Benarkan notifikasi LeadLaju dalam tetapan telefon, kemudian cuba semula.";
      showToast("Notifikasi belum aktif", notificationConnectionError, "error");
      return;
    }
    // Audio unlock can wait for another gesture on iOS; it must not block push.
    playNotificationSound().catch(() => {});
    const subscribed = isAdmin()
      ? await syncPushSubscription(true)
      : await verifyAgentPushAccess(true);
    if (!subscribed && !notificationConnectionError) notificationConnectionError = pushConnectionErrorMessage();
    if (subscribed) await updateAgentPresence(true, true);
    showToast(
      subscribed ? "Notifikasi aktif" : "Notifikasi belum disambungkan",
      subscribed ? "Lead baru dan reminder follow up akan keluar notifikasi sistem." : notificationConnectionError,
      subscribed ? "success" : "error",
    );
  } catch (error) {
    notificationConnectionError = pushConnectionErrorMessage(error);
    showToast("Notifikasi belum disambungkan", notificationConnectionError, "error");
  } finally {
    notificationRequestInProgress = false;
    // Do not immediately repeat a failed registration in the background.
    if (getCurrentUser()?.role === "agent") renderAgentAccessGate(getAgentAppAccessState());
  }
}

function expiryAssignmentKey(lead) {
  return lead ? `${lead.id}:${Number(lead.assignmentRevision) || 0}` : "";
}

function isLocallyExpiredAssignment(lead) {
  return locallyExpiredAssignments.has(expiryAssignmentKey(lead));
}

function isVisuallyExpiredAssignment(lead) {
  if (isLocallyExpiredAssignment(lead)) return true;
  return Boolean(
    lead &&
    lead.status === "new" &&
    lead.queueState === "active" &&
    Number(lead.expiresAt) > 0 &&
    Date.now() >= Number(lead.expiresAt) &&
    !currentAgentOwnsLead(lead)
  );
}

function cleanupLocallyExpiredAssignments() {
  for (const key of locallyExpiredAssignments) {
    if (!state.leads.some((lead) =>
      expiryAssignmentKey(lead) === key && lead.status === "new" && lead.queueState === "active"
    )) locallyExpiredAssignments.delete(key);
  }
  for (const [key, requestState] of expiryRequestStates) {
    if (!requestState?.authoritativeNotExpired) continue;
    const lead = state.leads.find((item) => expiryAssignmentKey(item) === key);
    if (lead && Date.now() < Number(lead.expiresAt)) expiryRequestStates.delete(key);
  }
}

function isAuthoritativeNotExpiredError(error) {
  return String(error?.message || "").toLowerCase().includes("belum tamat");
}

function isAuthoritativeStaleExpiryError(error) {
  const message = String(error?.message || "").toLowerCase();
  return Boolean(error?.response?.stale) || ["telah berubah", "bukan lagi aktif", "tidak dijumpai"].some(
    (text) => message.includes(text),
  );
}

function getCurrentExpiryAssignment() {
  const assignments = state.leads
    .filter((lead) =>
      lead.status === "new" &&
      lead.queueState === "active" &&
      lead.assignedAgentId &&
      Number(lead.expiresAt) > 0 &&
      currentAgentOwnsLead(lead),
    )
    .sort((left, right) => left.expiresAt - right.expiresAt);
  return assignments[0] || null;
}

function clearExpiryAssignmentTimer() {
  window.clearTimeout(expiryAssignmentTimer);
  expiryAssignmentTimer = null;
  expiryAssignmentTimerKey = "";
}

function syncExpiryAssignmentTimer() {
  const lead = getCurrentExpiryAssignment();
  const key = expiryAssignmentKey(lead);
  for (const trackedKey of expiryRequestStates.keys()) {
    if (!state.leads.some((item) => expiryAssignmentKey(item) === trackedKey && item.status === "new" && item.queueState === "active")) {
      expiryRequestStates.delete(trackedKey);
    }
  }
  if (!lead) {
    clearExpiryAssignmentTimer();
    return;
  }
  if (expiryAssignmentTimerKey === key) return;
  clearExpiryAssignmentTimer();
  expiryAssignmentTimerKey = key;
  expiryAssignmentTimer = window.setTimeout(
    () => requestExpiredAssignment(key),
    Math.max(0, Number(lead.expiresAt) - Date.now()),
  );
}

async function requestExpiredAssignment(expectedKey) {
  const lead = state.leads.find((item) => expiryAssignmentKey(item) === expectedKey);
  if (
    !lead ||
    lead.status !== "new" ||
    lead.queueState !== "active" ||
    !lead.assignedAgentId ||
    !currentAgentOwnsLead(lead) ||
    Date.now() < Number(lead.expiresAt)
  ) {
    syncExpiryAssignmentTimer();
    return false;
  }

  const requestState = expiryRequestStates.get(expectedKey);
  if (requestState?.inFlight || Number(requestState?.retryAfter) > Date.now() || requestState?.completed) return false;
  const suppressLocalExpiry = Boolean(requestState?.authoritativeNotExpired);
  if (!suppressLocalExpiry) {
    locallyExpiredAssignments.add(expectedKey);
    renderAll();
  }
  expiryRequestStates.set(expectedKey, {
    inFlight: true,
    retryAfter: 0,
    completed: false,
    authoritativeNotExpired: suppressLocalExpiry,
  });
  try {
    await expireLeadInSheet({ ...lead });
    if (suppressLocalExpiry) {
      locallyExpiredAssignments.add(expectedKey);
      renderAll();
    }
    expiryRequestStates.set(expectedKey, { inFlight: false, retryAfter: 0, completed: true });
    await syncGoogleSheetFresh({ silent: true, notifyNewLeads: true });
    return true;
  } catch (error) {
    const notExpiredYet = isAuthoritativeNotExpiredError(error);
    expiryRequestStates.set(expectedKey, {
      inFlight: false,
      retryAfter: Date.now() + EXPIRY_RETRY_DELAY_MS,
      completed: false,
      authoritativeNotExpired: suppressLocalExpiry || notExpiredYet,
    });
    if (notExpiredYet) {
      if (locallyExpiredAssignments.delete(expectedKey)) renderAll();
      await syncGoogleSheetFresh({ silent: true, notifyNewLeads: true });
    } else if (isAuthoritativeStaleExpiryError(error)) {
      await syncGoogleSheetFresh({ silent: true, notifyNewLeads: true });
    }
    console.warn("Lead expiry sync failed", error);
    return false;
  } finally {
    syncExpiryAssignmentTimer();
  }
}

function processExpiredLeads() {
  const lead = getCurrentExpiryAssignment();
  if (!lead || Date.now() < Number(lead.expiresAt)) {
    syncExpiryAssignmentTimer();
    return false;
  }
  requestExpiredAssignment(expiryAssignmentKey(lead));
  return true;
}

function scheduleExpiryWatchdog() {
  window.clearInterval(expiryWatchdogTimer);
  expiryWatchdogTimer = window.setInterval(() => {
    if (!document.hidden) processExpiredLeads();
  }, EXPIRY_WATCHDOG_INTERVAL_MS);
  syncExpiryAssignmentTimer();
}

function stopExpiryWatchdog() {
  window.clearInterval(expiryWatchdogTimer);
  expiryWatchdogTimer = null;
  clearExpiryAssignmentTimer();
}

function setCallButtonLoading(leadId, isLoading) {
  const article = elements.activeLeadContainer.querySelector(".lead-alert");
  const buttons = [...document.querySelectorAll(`[data-lead-call="${CSS.escape(leadId)}"], [data-follow-up-call="${CSS.escape(leadId)}"]`)];
  if (article?.dataset.leadId === leadId) {
    const dashboardButton = article.querySelector(".call-button");
    if (dashboardButton) buttons.push(dashboardButton);
  }
  buttons.forEach((button) => {
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
    const label = button.querySelector(".call-button-copy b");
    if (label) label.textContent = isLoading ? "CALLING..." : "CALL NOW";
    else button.textContent = isLoading ? "CALLING..." : "CALL NOW";
  });
}

function dialLeadPhone(phone) {
  const callablePhone = String(phone || "").replace(/[^\d+]/g, "");
  if (!callablePhone) return false;

  window.location.href = `tel:${callablePhone}`;
  return true;
}

async function handleCall(leadId) {
  if (!guardLifecycleMutation()) return false;
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

  const previousLead = { ...lead };
  claimingLeadId = leadId;
  const updateToken = Symbol("call-now-status-update");
  pendingLeadStatusUpdates.set(leadId, { status: "contacted", token: updateToken });
  leadStatusWriteTimes.set(leadId, Date.now());
  setCallButtonLoading(leadId, true);
  let remoteCapturePromise = null;

  try {
    let claimedLead = lead;
    let phoneToCall = lead.phone;

    let remoteContactAction = null;
    let remoteWritePromise = null;
    if (remoteDatabaseMode) {
      remoteContactAction = {
        actionId: crypto.randomUUID(),
        agentId: state.currentUserId,
        leadId: lead.id,
        assignmentRevision: Number(lead.assignmentRevision) || 0,
        actionType: "contacted",
        createdAt: Date.now(),
        state: "pending",
      };
      // Begin durable capture without awaiting so the direct tap still opens tel:.
      remoteCapturePromise = writeContactOutbox(remoteContactAction)
        .then(() => true)
        .catch((error) => {
          console.error("CALL NOW durable capture failed", error);
          return false;
        });
      lead.status = "contacted";
      lead.contactedAt = Date.now();
      lead.responseMs = Math.max(0, lead.contactedAt - lead.receivedAt);
      lead.pendingContactAction = true;
      remoteWritePromise = remoteCapturePromise.then(() => submitContactAction(remoteContactAction));
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
    if (agent) agent.cooldownUntil = Date.now() + AGENT_COOLDOWN_MS;
    saveState();
    renderAll();

    // Start the durable Sheet write while the page is still foregrounded. The
    // keepalive request continues when tel: moves the browser to the Phone app.
    const statusUpdatePromise = remoteDatabaseMode
      ? remoteWritePromise
      : updateLeadStatusInSheet(claimedLead || lead, "Contacted");
    const callablePhone = String(phoneToCall || "").replace(/[^\d+]/g, "");
    if (callablePhone) {
      const callLink = document.querySelector("#dial-phone-link");
      callLink.href = `tel:${callablePhone}`;
      callLink.textContent = `Call ${callablePhone}`;
      document.querySelector("#dial-lead-name").textContent = lead.name;
      const dialModal = document.querySelector("#dial-phone-modal");
      dialModal.classList.add("open");
      dialModal.setAttribute("aria-hidden", "false");
      callLink.focus();
      // Open before Sheet requests can consume the tap's activation window.
      dialLeadPhone(callablePhone);
    } else {
      showToast("Nombor telefon tiada", "Lead ini belum ada nombor telefon yang boleh dipanggil.", "error");
    }
    await statusUpdatePromise;
    if (remoteDatabaseMode) {
      lead.pendingContactAction = false;
      queueRemoteReload();
    } else if (agent) await upsertAgentToSheet(agent);
    saveState();
    showToast(
      "Lead berjaya dikunci",
      `${lead.name} ${systemWorkerText("untuk projek")} ${lead.project} kini milik ${agent?.name || systemWorkerText("ejen ini")}.`,
    );
    renderAll();

  } catch (error) {
    console.error(error);
    if (!remoteDatabaseMode) {
      Object.assign(lead, previousLead);
      saveState();
      renderAll();
    }
    showToast("CALL NOW gagal", error?.message || "Semak sambungan Supabase dan cuba lagi.", "error");
    if (remoteDatabaseMode) {
      lead.pendingContactAction = true;
      const captured = await remoteCapturePromise?.catch(() => false);
      showToast(
        error?.authoritativeRejection ? "Tindakan belum diterima server" : captured ? "CALL NOW direkod" : "CALL NOW belum disimpan",
        error?.authoritativeRejection
          ? "Panggilan direkod pada peranti tetapi status canonical telah berubah."
          : captured
            ? "Tindakan disimpan pada peranti dan akan dihantar semula apabila sambungan pulih."
            : "Panggilan telah dibuka, tetapi tindakan tidak dapat disimpan pada peranti. Sambung internet dan kemas kini status.",
        "error",
      );
    }
  } finally {
    leadStatusWriteTimes.set(leadId, Date.now());
    if (pendingLeadStatusUpdates.get(leadId)?.token === updateToken) {
      pendingLeadStatusUpdates.delete(leadId);
    }
    claimingLeadId = null;
    setCallButtonLoading(leadId, false);
  }
}

function getVisibleActiveLead() {
  if (isTeamSales()) return null;
  const newLeads = state.leads
    .filter((lead) =>
      lead.status === "new" &&
      lead.queueState !== "queued" &&
      !isVisuallyExpiredAssignment(lead),
    )
    .sort((a, b) => a.expiresAt - b.expiresAt);
  if (isAdmin()) return newLeads[0] || null;
  return newLeads.find(currentAgentOwnsLead) || null;
}

function canViewLeadPhone(lead) {
  if (isTeamSales()) return canAccessLead(lead);
  if (isActiveLeadStatus(lead.status)) return false;
  return isAdmin() || lead.assignedAgentId === state.currentUserId;
}

function displayLeadPhone(lead) {
  return canRevealLeadContact(lead) && lead.phone ? lead.phone : "•••• •••• ••••";
}

// Keep Team Sales contact actions available without revealing a New lead's
// contact details in the card before the server confirms the first action.
function canRevealLeadContact(lead) {
  return canViewLeadPhone(lead) && lead.status !== "new";
}

function countsTowardLeadBadge(lead) {
  if (isTeamSales() && getLeadVisualStatus(lead) === "new") return true;
  return ["contacted", "all_offer_presented", "need_follow_up", "potential"].includes(getLeadVisualStatus(lead));
}

function renderSalesContactButton(lead, channel) {
  const label = channel === "call" ? "Call" : "WhatsApp";
  const url = channel === "call" ? `tel:${String(lead.phone || "").replace(/[^+\d]/g, "")}` : whatsappLeadUrl(lead.phone);
  if (!canViewLeadPhone(lead) || !lead.phone || !lead.assignedAgentId) return `<button class="contact-edit-button sales-contact-${channel}" disabled>${label}</button>`;
  return `<a class="contact-edit-button sales-contact-${channel}" href="${escapeHtml(url)}" data-sales-contact="${channel}" data-sales-lead="${escapeHtml(lead.id)}">${channel === "whatsapp" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a9 9 0 0 1-13.3 8L3 21l1.5-4.7A9 9 0 1 1 21 11.5Z"/><path d="M8 7c0 5 4 9 9 9l1-3-3-1-1 1-3-3 1-1-1-3Z"/></svg>' : ""}${label}</a>`;
}
function renderSalesContactState(lead) {
  const status = salesContactStates.get(lead.id);
  return status ? `<small class="sales-contact-state ${status}" role="status">${status === "failed" ? "Gagal disimpan — tekan semula untuk cuba lagi" : "Belum disahkan server — menunggu sync"}</small>` : "";
}
async function handleSalesContact(leadId, channel, destination) {
  const lead = state.leads.find(item => item.id === leadId);
  if (!isTeamSales() || !lead || !canViewLeadPhone(lead) || !guardLifecycleMutation()) return;
  const brandVersion = brandContextVersion;
  const existing = (await readContactOutbox(state.currentUserId).catch(() => [])).find(item => item.leadId === leadId && item.brandId === activeBrandId && item.state === "pending");
  const action = existing || { actionId: crypto.randomUUID(), agentId: state.currentUserId, brandId: activeBrandId, leadId, assignmentRevision: lead.assignmentRevision, actionType: "team_sales_contact", channel, createdAt: Date.now(), state: "pending" };
  try {
    await writeContactOutbox(action);
  } catch (error) {
    salesContactStates.set(leadId, "failed"); renderAll();
    showToast("Tindakan belum disimpan", "Storan peranti tidak tersedia. Cuba semula.", "error");
    return;
  }
  if (brandVersion !== brandContextVersion) return;
  salesContactStates.set(leadId, "pending");
  // The durable action is recorded before handing off to the phone/WhatsApp.
  // Do not optimistically claim Contacted before the RPC confirms it.
  // Hand off immediately after the durable write, without repainting the page
  // or waiting for network work that may pause when the external app opens.
  window.location.assign(destination);
  const submission = submitContactAction(action).then(async () => {
    if (brandVersion !== brandContextVersion) return;
    salesContactStates.delete(leadId);
    await loadRemoteState(state.currentUserId);
  }).catch(error => {
    if (brandVersion !== brandContextVersion) return;
    salesContactStates.set(leadId, error.authoritativeRejection ? "failed" : "pending"); renderAll();
    if (error.authoritativeRejection) showToast("Tindakan gagal disimpan", "Sync dan cuba semula.", "error");
  });
  await submission;
}

function compareLeadLogOrder(left, right) {
  if (isTeamSales()) {
    const priority = Number(right.status === "new") - Number(left.status === "new");
    if (priority) return priority;
    if (left.status === "new" && right.status === "new") return (left.createdAt || left.receivedAt || 0) - (right.createdAt || right.receivedAt || 0);
  }
  const bottomStatuses = ["passed", "rejected", "cancelled"];
  const leftBottom = Number(bottomStatuses.includes(getLeadVisualStatus(left)));
  const rightBottom = Number(bottomStatuses.includes(getLeadVisualStatus(right)));
  return leftBottom - rightBottom || (right.receivedAt || 0) - (left.receivedAt || 0);
}

function compareLeadLatestActivity(left, right) {
  const latest = lead => Math.max(...[lead.updatedAt, lead.statusUpdatedAt, lead.followUpActivityAt, lead.contactedAt, lead.receivedAt, lead.createdAt].map(value => {
    const time = typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }));
  return latest(right) - latest(left) || String(left.id || "").localeCompare(String(right.id || ""));
}

function leadDisplayNotes(lead, value = lead.notes) {
  let notes = String(value || "").trim();
  if (!canRevealLeadContact(lead)) {
    notes = notes.replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[Emel dibuka selepas CALL NOW]")
      .replace(/(?:\+?60|0)[ \t]*1[\d \t().-]{7,20}\d/g, "[Telefon dibuka selepas CALL NOW]");
    // Also mask the canonical number with arbitrary formatting, including
    // international numbers that do not use the Malaysian mobile prefix.
    const digits = String(lead.phone || "").replace(/\D/g, "");
    if (digits.length >= 7) {
      const pattern = digits.split("").join("[ \\t().-]*");
      notes = notes.replace(new RegExp(`\\+?${pattern}`, "g"), "[Telefon dibuka selepas CALL NOW]");
    }
    if (isTeamSales()) notes = notes.replaceAll("selepas CALL NOW", "selepas Call atau WhatsApp");
  }
  return notes;
}

function salesLeadWaitingTime(lead, now = Date.now()) {
  const startedAt = Number(lead.createdAt || lead.receivedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return "—";
  const elapsed = Math.floor(Math.max(0, now - startedAt) / 1000);
  const days = Math.floor(elapsed / 86400);
  const hours = Math.floor((elapsed % 86400) / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  return `${days} hari ${hours} jam ${String(minutes).padStart(2, "0")} minit ${String(seconds).padStart(2, "0")} saat`;
}

function renderSalesLeadWaitingTime(lead) {
  if (!isTeamSales() || lead.status !== "new") return "";
  return `<span class="sales-lead-waiting">Belum contact <strong data-sales-waiting-lead="${escapeHtml(lead.id)}">${salesLeadWaitingTime(lead)}</strong></span>`;
}

function updateSalesLeadWaitingTimes() {
  if (!isTeamSales() || document.hidden) return;
  const now = Date.now();
  const leads = new Map(state.leads.map(lead => [lead.id, lead]));
  document.querySelectorAll("[data-sales-waiting-lead]").forEach(counter => {
    const lead = leads.get(counter.dataset.salesWaitingLead);
    counter.parentElement.hidden = !lead || lead.status !== "new";
    if (lead?.status === "new") counter.textContent = salesLeadWaitingTime(lead, now);
  });
}

function renderNewLeadNotes(lead) {
  const notes = leadDisplayNotes(lead);
  if (!notes) return "";
  return `<div class="new-lead-notes"><small>NOTA</small><p>${escapeHtml(notes)}</p></div>`;
}

function renderActiveLead() {
  const lead = getVisibleActiveLead();
  elements.activeLeadContainer.classList.toggle("has-active-lead", Boolean(lead));
  const visibleLeads = isAdmin()
    ? state.leads.filter((item) => !isVisuallyExpiredAssignment(item))
    : state.leads.filter((item) => item.assignedAgentId === state.currentUserId && !isVisuallyExpiredAssignment(item));
  const newLeadCount = visibleLeads.filter(isPendingLead).length;
  elements.queueLabel.textContent = `${newLeadCount} lead menunggu`;
  const badgeCount = visibleLeads.filter(countsTowardLeadBadge).length;
  elements.navLeadCount.textContent = badgeCount;
  elements.navLeadCount.hidden = badgeCount === 0;
  elements.notificationCount.textContent = newLeadCount;
  elements.notificationCount.style.display = newLeadCount ? "grid" : "none";
  renderAgentLeadControls();

  if (isTeamSales()) {
    const salesLeads = visibleLeads.filter(item => item.status === "new" && item.assignedAgentId).sort(compareLeadLogOrder);
    elements.activeLeadContainer.classList.toggle("has-active-lead", salesLeads.length > 0);
    elements.activeLeadContainer.innerHTML = salesLeads.length ? `<div class="sales-new-leads"><h3>Lead baharu <small>${salesLeads.length}</small></h3>${salesLeads.map(item => `<article class="sales-lead-card"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.project)}</span><small>${escapeHtml(displayLeadPhone(item))}</small></div><span class="lead-status-badge new">New</span>${renderSalesLeadWaitingTime(item)}${renderNewLeadNotes(item)}${isAdmin() ? "" : `<div class="sales-lead-actions">${renderSalesContactButton(item, "call")}${renderSalesContactButton(item, "whatsapp")}${renderLeadCopyButton(item)}</div>${renderSalesContactState(item)}`}</article>`).join("")}</div>` : '<div class="empty-lead"><h3>Tiada lead baharu</h3><p>Lead akan diagih secara automatik kepada Team Sales aktif yang layak.</p></div>';
    return;
  }

  if (isAdmin()) {
    renderAdminActiveLeads();
    return;
  }

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
          <p>Lead baharu akan muncul di sini secara automatik.</p>
        </div>
      </div>`;
    return;
  }

  const activeLeadKey = `${lead.id}:${lead.assignedAgentId}:${lead.name}:${lead.project}:${lead.source}:${lead.notes}`;
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
    const notes = document.createElement("div");
    notes.innerHTML = renderNewLeadNotes(lead);
    if (notes.firstElementChild) fragment.querySelector(".countdown-block").before(notes.firstElementChild);
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

function getAdminActiveLeads() {
  return state.leads
    .filter((lead) =>
      lead.status === "new" &&
      lead.queueState !== "queued" &&
      Boolean(lead.assignedAgentId) &&
      Number(lead.expiresAt) > Date.now() &&
      !isVisuallyExpiredAssignment(lead),
    )
    .sort((a, b) => a.expiresAt - b.expiresAt);
}

function renderAdminActiveLeads() {
  const leads = getAdminActiveLeads();
  lastRenderedActiveLeadKey = null;

  if (!leads.length) {
    elements.activeLeadContainer.innerHTML = `
      <div class="empty-lead">
        <div>
          <span class="empty-lead-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6"></path>
            </svg>
          </span>
          <h3>Tiada lead sedang aktif</h3>
          <p>Semua lead aktif ejen akan dipaparkan di sini.</p>
        </div>
      </div>`;
    return;
  }

  elements.activeLeadContainer.innerHTML = `
    <div class="admin-active-lead-list" aria-label="Lead aktif">
      ${leads.map((lead) => `
        <article class="admin-active-lead" data-lead-id="${escapeHtml(lead.id)}">
          <span class="admin-active-lead-name">${escapeHtml(lead.name || "Tanpa nama")}</span>
          <span class="admin-active-lead-agent">${escapeHtml(getAgent(lead.assignedAgentId)?.name || "Tiada ejen")}</span>
          ${renderNewLeadNotes(lead)}
          <strong class="admin-active-lead-timer">00:00</strong>
        </article>`).join("")}
    </div>`;
  updateAdminActiveLeadCountdowns(leads);
}

function updateAdminActiveLeadCountdowns(leads = getAdminActiveLeads()) {
  const leadById = new Map(leads.map((lead) => [String(lead.id), lead]));
  elements.activeLeadContainer.querySelectorAll(".admin-active-lead").forEach((article) => {
    const lead = leadById.get(String(article.dataset.leadId));
    if (!lead) return;
    const remaining = Math.max(0, Number(lead.expiresAt) - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    article.querySelector(".admin-active-lead-timer").textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  });
}

function renderAgentLeadControls() {
  const user = getCurrentUser();
  const isAgent = user?.role === "agent" && !isTeamSales();
  elements.agentLeadControls.hidden = !isAgent;
  if (!isAgent) return;
  const ready = Boolean(user.leadReady);
  elements.agentLeadControls.classList.toggle("is-ready", ready);
  elements.agentLeadControls.classList.toggle("is-stopped", !ready);
  elements.getLeadButton.disabled = ready;
  elements.stopLeadButton.disabled = !ready;
  elements.getLeadButton.setAttribute("aria-pressed", String(ready));
  elements.stopLeadButton.setAttribute("aria-pressed", String(!ready));
  elements.agentLeadStatus.textContent = ready ? "Sedang menerima lead" : "Agihan lead dihentikan";
  elements.agentLeadStatusMessage.textContent = ready
    ? "Anda berada dalam giliran agihan. STOP LEAD hanya menghentikan lead baharu."
    : "Tekan GET LEAD untuk masuk giliran agihan lead baharu.";
}

function updateCountdown() {
  if (isTeamSales()) return;
  if (isAdmin()) {
    updateAdminActiveLeadCountdowns();
    return;
  }
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
  const user = getCurrentUser();
  const assignments = state.leads.flatMap((lead) => {
    const history = Array.isArray(lead.assignmentHistory) ? lead.assignmentHistory : [];
    if (history.length) return history.map((assignment) => ({ ...assignment, leadId: lead.id }));
    if (!lead.assignedAgentId) return [];
    return [{
      leadId: lead.id,
      agentId: lead.assignedAgentId,
      assignedAt: new Date(lead.receivedAt || lead.createdAt).toISOString(),
      outcome: lead.status === "contacted" ? "contacted" : lead.status === "passed" ? "missed" : "pending",
      resolvedAt: lead.contactedAt ? new Date(lead.contactedAt).toISOString() : "",
    }];
  }).filter((assignment) =>
    (isAdmin() || assignment.agentId === user?.id) && todayKey(new Date(assignment.assignedAt).getTime()) === today,
  );
  const contacted = assignments.filter((assignment) => assignment.outcome === "contacted");
  const missed = assignments.filter((assignment) => assignment.outcome === "missed");
  const resolvedAssignments = assignments.filter((assignment) =>
    assignment.outcome === "contacted" || assignment.outcome === "missed",
  );
  const responseValues = contacted.map((assignment) =>
    new Date(assignment.resolvedAt).getTime() - new Date(assignment.assignedAt).getTime(),
  ).filter((value) => Number.isFinite(value) && value >= 0);
  const averageResponse = responseValues.length
    ? responseValues.reduce((total, value) => total + value, 0) / responseValues.length
    : null;

  elements.statToday.textContent = isTeamSales() ? assignments.length : resolvedAssignments.length;
  elements.statContacted.textContent = missed.length;
  elements.contactRate.textContent = resolvedAssignments.length
    ? `${Math.round((contacted.length / resolvedAssignments.length) * 100)}%`
    : "0%";
  elements.statResponse.textContent = averageResponse !== null
    ? `${Math.floor(averageResponse / 60000)}m ${Math.floor((averageResponse % 60000) / 1000)}s`
    : "--";
  elements.statConversion.textContent = resolvedAssignments.length
    ? `${Math.round((contacted.length / resolvedAssignments.length) * 100)}%`
    : "0%";
  elements.pickupDetails.textContent = `${contacted.length} call / ${missed.length} missed`;
}

function renderActivities() {
  const visibleLeadIds = new Set(state.leads
    .filter((lead) => lead.assignedAgentId === state.currentUserId)
    .map((lead) => lead.id));
  const activities = state.activities
    .filter((activity) => isAdmin() || visibleLeadIds.has(activity.leadId))
    .slice(0, 5);
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
  const agents = state.agents.filter((agent) => agent.role === "agent" && agent.active !== false);
  const activeAgents = agents.filter((agent) => agent.online);
  const leadReadyAgents = agents.filter((agent) => agent.leadReady && agent.online);
  const notificationBell = (agent) => {
    const enabled = Boolean(agent.notificationEnabled);
    const label = enabled ? "Notifikasi aktif" : "Notifikasi belum aktif";
    return `
      <span class="member-notification${enabled ? " enabled" : ""}" title="${label}" aria-label="${label}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      </span>`;
  };

  elements.onlineCount.textContent = `${activeAgents.length} online`;
  elements.teamList.innerHTML = activeAgents.length
    ? activeAgents
    .map(
      (agent) => `
        <div class="team-member">
          <span class="member-avatar">${initials(agent.name)}</span>
          <span>
            <strong>${escapeHtml(agent.name)}</strong>
            <small>Sedang aktif</small>
          </span>
          ${notificationBell(agent)}
        </div>`,
    )
    .join("")
    : `<div class="table-empty">${systemWorkerText("Tiada ejen sedang aktif.")}</div>`;

  elements.leadReadyCount.textContent = `${leadReadyAgents.length} dalam giliran`;
  elements.leadReadyList.innerHTML = leadReadyAgents.length
    ? leadReadyAgents
      .map(
        (agent, index) => `
          <div class="team-member">
            <span class="member-avatar">${initials(agent.name)}</span>
            <span>
              <strong>${escapeHtml(agent.name)}</strong>
              <small>Giliran #${index + 1}</small>
            </span>
            <span class="member-state${agent.online ? "" : " offline"}" title="${agent.online ? "Online" : "Tidak aktif"}"></span>
          </div>`,
      )
      .join("")
    : '<div class="table-empty">Tiada ejen dalam giliran dapat lead.</div>';
}

const leadNoteDrafts = new Map();

function leadNoteDraftKey(leadId) {
  return `${state.currentUserId}:${leadId}`;
}

const expandedLeadLogIds = new Set();
const LEAD_LOG_PAGE_SIZE = 30;
let leadLogVisibleLimit = LEAD_LOG_PAGE_SIZE;
let leadLogSearchTimer = 0;

function renderLeadFollowUpButton(lead, actionAttribute = "data-lead-follow-up") {
  const followUpCount = Math.min(6, Math.max(0, Number(lead?.followUpCount) || 0));
  const whatsappUrl = lead && canViewLeadPhone(lead) && !(isTeamSales() && lead.status === "new") ? whatsappLeadUrl(lead.phone) : "";
  const title = followUpCount >= 6
    ? "Maksimum Follow Up 6"
    : !lead ? "Data lead belum tersedia"
      : !whatsappUrl ? isTeamSales() ? "Tekan Call atau WhatsApp dahulu" : "Tekan CALL NOW dahulu"
        : `Rekod Follow Up ${followUpCount + 1} dan buka WhatsApp`;
  const icon = `<svg class="lead-follow-up-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.3-4.3a8.5 8.5 0 1 1 15.7-4.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.3 8.2c-.4.4-.7 1-.7 1.5 0 2.8 3.1 5.9 5.9 6.2.6.1 1.2-.2 1.6-.6l.7-.8-2.1-1.1-.9.9a7.4 7.4 0 0 1-3.1-3.1l.9-.9-1.1-2.1-.8.7Z" fill="currentColor"/></svg>`;
  return `<button class="contact-edit-button lead-follow-up-button follow-up-stage-${followUpCount}" type="button" ${actionAttribute}="${escapeHtml(lead?.id || "")}" ${!whatsappUrl || followUpCount >= 6 ? "disabled" : ""} title="${title}">${icon}<span>Follow Up${followUpCount ? ` ${followUpCount}` : ""}</span></button>`;
}

function renderLeadCopyButton(lead, actionAttribute = "data-lead-copy") {
  const available = lead && canAccessLead(lead) && canRevealLeadContact(lead);
  return `<button class="contact-edit-button lead-copy-button" type="button" ${actionAttribute}="${escapeHtml(lead?.id || "")}" ${available ? "" : "disabled"} title="${available ? "Copy details lead" : isTeamSales() ? "Tekan Call atau WhatsApp dahulu" : "Tekan CALL NOW dahulu"}" aria-label="Copy details ${escapeHtml(lead?.name || "lead")}">Copy</button>`;
}

function leadDetailsCopyText(lead) {
  const project = String(lead.project || "Tidak dinyatakan").trim();
  const rawSource = String(lead.sourceSystem || lead.source_system || lead.source || "Manual Lead").trim();
  const source = /tik[\s_-]*tok/i.test(rawSource) ? "Tiktok"
    : /meta|facebook|instagram/i.test(rawSource) ? "Meta"
    : /^manual(?:[\s_-]+lead)?$/i.test(rawSource) ? "Meta/Tiktok" : rawSource;
  return [
    `*Inquiry For ${project} From ${source}*`,
    "",
    `Nama: ${String(lead.name || "-").trim()}`,
    `No Phone: ${String(lead.phone || "").replace(/\D/g, "") || "-"}`,
    `Email: ${String(lead.email || "-").trim()}`,
    "Nota Lain:",
    String(lead.notes || "-").trim() || "-",
  ].join("\n");
}

async function copyLeadDetails(leadId) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead || !canAccessLead(lead) || !canRevealLeadContact(lead)) return false;
  const finishFeedback = beginButtonFeedback(lastInteractionButton);
  try {
    await navigator.clipboard.writeText(leadDetailsCopyText(lead));
    showToast("Details disalin", `${lead.name} telah disalin.`, "success");
    return true;
  } catch {
    showToast("Copy gagal", "Benarkan akses clipboard dan cuba lagi.", "error");
    return false;
  } finally {
    finishFeedback();
  }
}

let salesPerformanceRange = null;
let salesLeadDrilldown = null;

function openSalesOverdueReminder(brandId = new URLSearchParams(window.location.search).get("brand")) {
  if (!isTeamSales() || !isAdmin()) return;
  if (brandId && brandId !== activeBrandId) return;
  elements.leadSearch.value = "";
  leadLogVisibleLimit = LEAD_LOG_PAGE_SIZE;
  [elements.leadFilter, elements.leadFollowUpFilter, elements.leadAgentFilter, elements.leadPeriodFilter].forEach(select => { if (select) select.value = "all"; });
  salesLeadDrilldown = { brandId: activeBrandId, overdue: true };
  switchView("leads");
  renderLeadsTable();
  elements.leadFilter.value = "new";
  renderLeadsTable();
}

function matchesSalesDrilldown(lead) {
  if (!salesLeadDrilldown || !isTeamSales() || salesLeadDrilldown.brandId !== activeBrandId) return true;
  if (salesLeadDrilldown.overdue) return lead.status === "new" && lead.assignedAgentId && Number(lead.createdAt || lead.receivedAt) <= Date.now() - 3600000;
  if (salesLeadDrilldown.agentIds && !salesLeadDrilldown.agentIds.includes(lead.assignedAgentId)) return false;
  return (lead.assignmentHistory || []).some(item => item.agentId === lead.assignedAgentId && todayKey(new Date(item.assignedAt).getTime()) >= salesLeadDrilldown.from && todayKey(new Date(item.assignedAt).getTime()) <= salesLeadDrilldown.to);
}

function openSalesPerformance(status) {
  if (!isTeamSales()) return;
  elements.leadSearch.value = "";
  leadLogVisibleLimit = LEAD_LOG_PAGE_SIZE;
  [elements.leadFilter, elements.leadFollowUpFilter, elements.leadAgentFilter, elements.leadPeriodFilter].forEach(select => { if (select) select.value = "all"; });
  if (status === "due") {
    salesLeadDrilldown = null;
    leadLogVisibleLimit = LEAD_LOG_PAGE_SIZE;
    [elements.followUpAgentFilter, elements.followUpProjectFilter, elements.followUpPeriodFilter].forEach(select => { if (select) select.value = "all"; });
    switchView("follow-up-due");
    return;
  }
  salesLeadDrilldown = { ...salesPerformanceRange, brandId: activeBrandId };
  switchView("leads");
  renderLeadsTable();
  if (['group_follow_up', 'group_cancelled_rejected'].includes(status)) {
    const option = new Option(status === 'group_follow_up' ? 'Need Follow Up + All Offer Presented' : 'Cancelled + Rejected', status);
    option.hidden = true;
    elements.leadFilter.add(option);
  }
  elements.leadFilter.value = status;
  renderLeadsTable();
}

document.addEventListener("click", event => {
  const card = event.target.closest("[data-sales-performance]");
  if (card) openSalesPerformance(card.dataset.salesPerformance);
  if (event.target.closest("[data-sales-filter-reset]")) {
    salesLeadDrilldown = null;
    leadLogVisibleLimit = LEAD_LOG_PAGE_SIZE;
    elements.leadSearch.value = "";
    [elements.leadFilter, elements.leadFollowUpFilter, elements.leadAgentFilter, elements.leadPeriodFilter].forEach(select => { if (select) select.value = "all"; });
    renderLeadsTable();
  }
});

function renderLeadsTable() {
  const focusedNote = document.activeElement;
  if (focusedNote?.matches("[data-lead-note]") && elements.leadsTableBody.contains(focusedNote)) {
    const lead = state.leads.find((item) => item.id === focusedNote.dataset.leadNote);
    if (lead && canAccessLead(lead) && !isVisuallyExpiredAssignment(lead)) return;
  }
  const search = elements.leadSearch.value.trim().toLowerCase();
  const selectedStatus = elements.leadFilter.value || "all";
  const selectedFollowUp = elements.leadFollowUpFilter.value || "all";
  const selectedAgentId = elements.leadAgentFilter?.value || "all";
  const visibleLeads = (isAdmin()
    ? state.leads.filter((lead) => !isVisuallyExpiredAssignment(lead))
    : state.leads.filter((lead) => lead.assignedAgentId === state.currentUserId && !isVisuallyExpiredAssignment(lead))).filter(matchesSalesDrilldown);
  const statusCounts = Object.fromEntries(LEAD_STATUS_OPTIONS.map((status) => [status.value, 0]));
  const followUpCounts = new Map();
  const agentCounts = new Map();
  let unassignedCount = 0;
  visibleLeads.forEach((lead) => {
    const visualStatus = getLeadVisualStatus(lead);
    statusCounts[visualStatus] = (statusCounts[visualStatus] || 0) + 1;
    const followUpCount = Math.min(6, Number(lead.followUpCount) || 0);
    if (followUpCount > 0) followUpCounts.set(followUpCount, (followUpCounts.get(followUpCount) || 0) + 1);
    if (lead.assignedAgentId) {
      agentCounts.set(lead.assignedAgentId, (agentCounts.get(lead.assignedAgentId) || 0) + 1);
    } else {
      unassignedCount += 1;
    }
  });
  const statusOptionsMarkup = [
    `<option value="all">Semua status (${visibleLeads.length})</option>`,
    ...(['group_follow_up', 'group_cancelled_rejected'].includes(selectedStatus) ? [`<option hidden value="${selectedStatus}">${selectedStatus === 'group_follow_up' ? 'Need Follow Up + All Offer Presented' : 'Cancelled + Rejected'}</option>`] : []),
    ...LEAD_STATUS_OPTIONS.map(
      (status) => `<option value="${status.value}">${status.label} (${statusCounts[status.value] || 0})</option>`,
    ),
  ].join("");
  updateSelectOptions(elements.leadFilter, statusOptionsMarkup, selectedStatus);
  const filter = elements.leadFilter.value || "all";
  const followUpOptionsMarkup = [
    '<option value="all">Semua Follow Up</option>',
    `<option value="follow_up">Follow Up (${[...followUpCounts.values()].reduce((sum, count) => sum + count, 0)})</option>`,
    ...[1, 2, 3, 4, 5, 6].map((count) => `<option value="follow_up_${count}">Follow Up ${count} (${followUpCounts.get(count) || 0})</option>`),
  ].join("");
  updateSelectOptions(elements.leadFollowUpFilter, followUpOptionsMarkup, selectedFollowUp);
  const followUpFilter = elements.leadFollowUpFilter.value || "all";
  if (elements.leadAgentFilter && isAdmin()) {
    const agentOptionsMarkup = [
      `<option value="all">Semua ejen (${visibleLeads.length})</option>`,
      ...state.agents
        .filter((agent) => agent.role === "agent")
        .map(
          (agent) =>
            `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)} (${agentCounts.get(agent.id) || 0})</option>`,
        ),
      `<option value="unassigned">Belum / tiada ejen (${unassignedCount})</option>`,
    ].join("");
    updateSelectOptions(elements.leadAgentFilter, agentOptionsMarkup, selectedAgentId);
  }
  const agentFilter = elements.leadAgentFilter?.value || "all";
  populateMonthPeriodFilter(elements.leadPeriodFilter, visibleLeads, (lead) => lead.createdAt || lead.receivedAt);
  const rows = state.leads
    .filter((lead) => {
      if (!matchesSalesDrilldown(lead)) return false;
      if (isVisuallyExpiredAssignment(lead)) return false;
      if (!isAdmin() && lead.assignedAgentId !== state.currentUserId) return false;
      const matchesAgent =
        !isAdmin() ||
        agentFilter === "all" ||
        (agentFilter === "unassigned" ? !lead.assignedAgentId : lead.assignedAgentId === agentFilter);
      const matchesSearch =
        lead.name.toLowerCase().includes(search) ||
        displayLeadPhone(lead).toLowerCase().includes(search) ||
        String(lead.email || "").toLowerCase().includes(search) ||
        String(lead.project || "").toLowerCase().includes(search) ||
        String(lead.source || "").toLowerCase().includes(search) ||
        formatSheetStatus(getLeadVisualStatus(lead)).toLowerCase().includes(search) ||
        String(lead.notes || "").toLowerCase().includes(search);
      const visualStatus = getLeadVisualStatus(lead);
      return matchesAgent && matchesSearch &&
        (filter === "all" || visualStatus === filter || (filter === "group_follow_up" && ["need_follow_up", "all_offer_presented"].includes(visualStatus)) || (filter === "group_cancelled_rejected" && ["cancelled", "rejected"].includes(visualStatus))) &&
        (followUpFilter === "all" || (followUpFilter === "follow_up" && Number(lead.followUpCount) > 0) || (followUpFilter.startsWith("follow_up_") && Number(lead.followUpCount) === Number(followUpFilter.slice(10)))) &&
        matchesMonthPeriodFilter(lead.createdAt || lead.receivedAt, elements.leadPeriodFilter);
    })
    .sort(filter === "all" ? compareLeadLatestActivity : compareLeadLogOrder);

  if (elements.leadLogCount) {
    elements.leadLogCount.textContent = `${rows.length} lead`;
  }
  let drilldownNotice = document.querySelector("#sales-drilldown-notice");
  if (!drilldownNotice && elements.leadLogCount) {
    drilldownNotice = document.createElement("div");
    drilldownNotice.id = "sales-drilldown-notice";
    elements.leadLogCount.parentElement.insertAdjacentElement("afterend", drilldownNotice);
  }
  if (drilldownNotice) {
    const active = isTeamSales() && salesLeadDrilldown?.brandId === activeBrandId;
    drilldownNotice.hidden = !active;
    const statusLabel = ({ all: "Semua status", group_follow_up: "Need Follow Up + All Offer Presented", group_cancelled_rejected: "Cancelled + Rejected" })[filter] || LEAD_STATUS_OPTIONS.find(item => item.value === filter)?.label || filter;
    drilldownNotice.innerHTML = active ? `<small>Penapis aktif: ${escapeHtml(statusLabel)} · ${salesLeadDrilldown.overdue ? "New melebihi 1 jam" : `Assignment ${escapeHtml(salesLeadDrilldown.from)} hingga ${escapeHtml(salesLeadDrilldown.to)}`}</small> <button type="button" data-sales-filter-reset>Reset penapis</button>` : "";
  }
  const shownRows = rows.slice(0, leadLogVisibleLimit);
  elements.leadLogMoreWrap.hidden = shownRows.length >= rows.length;
  if (!elements.leadLogMoreWrap.hidden) elements.leadLogMore.textContent = `Muat lagi ${Math.min(LEAD_LOG_PAGE_SIZE, rows.length - shownRows.length)} lead · ${shownRows.length}/${rows.length}`;
  elements.leadsTableBody.innerHTML = rows.length
    ? shownRows
        .map((lead) => {
          const visualStatus = getLeadVisualStatus(lead);
          const requiresCallNow = !isTeamSales() && !isAdmin() && visualStatus === "new";
          const statusOptions = renderLeadStatusOptions(visualStatus, isAdmin() || requiresCallNow || isTeamSales());
          const contactedTime = lead.contactedAt ? `<small>Dihubungi ${formatDateTime(lead.contactedAt)}</small>` : "";
          const phoneVisible = canRevealLeadContact(lead);
          const callButton = isTeamSales() ? renderSalesContactButton(lead, "call") : requiresCallNow
            ? `<button class="log-call-now-button" type="button" data-lead-call="${lead.id}">CALL NOW</button>`
            : phoneVisible && lead.phone
              ? `<a class="contact-edit-button sales-contact-call" href="tel:${escapeHtml(String(lead.phone).replace(/[^+\d]/g, ""))}">Call</a>`
              : `<button class="contact-edit-button sales-contact-call" type="button" disabled title="Nombor telefon belum tersedia">Call</button>`;
          const followUpButton = (isTeamSales() && visualStatus === "new"
            ? renderSalesContactButton(lead, "whatsapp")
            : renderLeadFollowUpButton(lead)) + (isTeamSales() ? renderSalesContactState(lead) : "");
          const editButton = canViewLeadPhone(lead)
            ? `<button class="contact-edit-button" type="button" data-lead-edit="${lead.id}">Edit</button>`
            : "";
          const deleteButton = isAdmin()
            ? `<button class="contact-edit-button danger" type="button" data-lead-delete="${lead.id}">Padam</button>`
            : "";
          const appointmentButton = canAccessLead(lead) && lead.assignedAgentId
            ? `<button class="contact-edit-button appointment" type="button" data-lead-appointment="${lead.id}">Appointment</button>`
            : "";
          const actionButtons = [editButton, appointmentButton, deleteButton].filter(Boolean).join("");
          const assignedAgentLabel = lead.assignedAgentId
            ? getAgent(lead.assignedAgentId)?.name || lead.assignedAgentName || systemWorkerText("Tiada ejen")
            : "Belum diagih";
          const activeTime = lead.receivedAt
            ? `<small>Aktif ${formatDateTime(lead.receivedAt)}</small>`
            : "<small>Menunggu giliran</small>";
          const expanded = expandedLeadLogIds.has(lead.id);
          return `
            <tr class="lead-log-summary" data-lead-row="${lead.id}">
              <td data-label="Nama"><strong>${escapeHtml(lead.name)}</strong>${renderSalesLeadWaitingTime(lead)}${renderNewLeadNotes(lead)}</td>
              <td data-label="${projectLabel()}"><strong>${escapeHtml(lead.project || "Tidak dinyatakan")}</strong></td>
              <td data-label="Status"><select class="lead-status-select ${visualStatus}" data-lead-status="${lead.id}" aria-label="Status ${escapeHtml(lead.name)}">${statusOptions}</select></td>
              <td data-label="Call">${callButton}</td>
              <td data-label="${isTeamSales() && visualStatus === "new" ? "WhatsApp" : "Follow Up"}" class="lead-message-action">${followUpButton}</td>
              <td data-label="Copy">${renderLeadCopyButton(lead)}</td>
              <td data-label="Butiran"><button class="lead-log-toggle" type="button" data-lead-expand="${lead.id}" aria-expanded="${expanded}" aria-controls="lead-log-detail-${lead.id}" aria-label="${expanded ? "Tutup" : "Buka"} butiran ${escapeHtml(lead.name)}"><span>${expanded ? "Tutup" : "Lihat"}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></td>
            </tr>
            <tr class="lead-log-detail" id="lead-log-detail-${lead.id}" ${expanded ? "" : "hidden"}>
              <td colspan="7"><div class="lead-log-detail-grid">
                <div><span class="lead-detail-label">Telefon / Emel</span><strong>${escapeHtml(displayLeadPhone(lead))}</strong><small>${phoneVisible ? escapeHtml(lead.email || "Tiada emel") : isTeamSales() ? "Telefon & emel dibuka selepas Call atau WhatsApp" : "No Phone, Whatsapp & Emel dibuka selepas CALL NOW"}</small></div>
                <div><span class="lead-detail-label">Sumber</span><strong>${escapeHtml(lead.source || "-")}</strong></div>
                <div><span class="lead-detail-label">${workerLabel()}</span><strong>${escapeHtml(assignedAgentLabel)}</strong></div>
                <div><span class="lead-detail-label">Masa</span><strong>Tarikh ${formatDateTime(lead.createdAt || lead.receivedAt)}</strong>${activeTime}${contactedTime}</div>
                <div class="lead-note-cell"><span class="lead-detail-label">Nota</span>
                <textarea
                  class="lead-note-field"
                  data-lead-note="${lead.id}"
                  rows="3"
                  ${phoneVisible ? "" : "disabled"}
                  placeholder="${systemWorkerText("Tambah nota follow-up, minat projek, bajet atau temujanji")}"
                >${escapeHtml(leadDisplayNotes(lead, leadNoteDrafts.get(leadNoteDraftKey(lead.id)) ?? lead.notes))}</textarea>
                <div class="lead-note-actions">
                  <button class="lead-note-save" type="button" data-lead-note-save="${lead.id}" ${phoneVisible ? "" : "disabled"}>Simpan nota</button>
                </div>
                </div>
                <div><span class="lead-detail-label">Tindakan</span><span class="lead-actions">${actionButtons || "-"}</span></div>
              </div></td>
            </tr>`;
        })
        .join("")
    : `<tr><td class="table-empty" colspan="7">Tiada lead ditemui.</td></tr>`;
}

function appointmentDateTimeLocalValue(value) {
  const parts = malaysiaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function malaysiaAppointmentTimestamp(value) {
  const localValue = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue)) return "";
  return `${localValue}:00+08:00`;
}

function findLeadForAppointment(appointment) {
  if (!appointment) return null;
  const appointmentLeadId = String(appointment.leadId || "").trim();
  const direct = state.leads.find((lead) =>
    [lead.id, lead.dedupeKey].some((id) => String(id || "").trim() === appointmentLeadId),
  );
  if (direct) return direct;
  const matches = state.leads.filter((lead) =>
    String(lead.name || "").trim().toLowerCase() === String(appointment.leadName || "").trim().toLowerCase() &&
    String(lead.project || "").trim().toLowerCase() === String(appointment.project || "").trim().toLowerCase(),
  );
  return matches.find((lead) => lead.assignedAgentId === appointment.assignedAgentId) || (matches.length === 1 ? matches[0] : null);
}

function renderAppointments() {
  if (!elements.appointmentList) return;
  const selectedStatus = elements.appointmentStatusFilter.value || "all";
  const selectedProject = elements.appointmentProjectFilter.value || "all";
  const visible = state.appointments
    .filter((appointment) => {
      const lead = findLeadForAppointment(appointment);
      return isAdmin() || currentAgentOwnsLead(lead) ||
        currentAgentMatches(appointment.assignedAgentId, "", appointment.assignedAgentName);
    })
    .sort((left, right) => left.scheduledAt - right.scheduledAt);
  const upcomingCount = visible.filter((appointment) => appointment.status === "scheduled" && appointment.scheduledAt > Date.now()).length;
  elements.navAppointmentCount.textContent = upcomingCount;
  elements.navAppointmentCount.hidden = upcomingCount === 0;
  const projects = [...new Set(visible.map((appointment) => appointment.project).filter(Boolean))].sort();
  elements.appointmentProjectFilter.innerHTML = [
    `<option value="all">${systemWorkerText("Semua projek")}</option>`,
    ...projects.map((project) => `<option value="${escapeHtml(project)}">${escapeHtml(project)}</option>`),
  ].join("");
  elements.appointmentProjectFilter.value = projects.includes(selectedProject) ? selectedProject : "all";
  populateMonthPeriodFilter(elements.appointmentPeriodFilter, visible, (appointment) => appointment.scheduledAt);
  const filtered = visible.filter((appointment) =>
    (selectedStatus === "all" || appointment.status === selectedStatus) &&
    (elements.appointmentProjectFilter.value === "all" || appointment.project === elements.appointmentProjectFilter.value) &&
    matchesMonthPeriodFilter(appointment.scheduledAt, elements.appointmentPeriodFilter),
  );
  elements.appointmentCount.textContent = `${filtered.length} appointment`;
  elements.appointmentList.innerHTML = filtered.length
    ? filtered.map((appointment) => {
      const lead = findLeadForAppointment(appointment);
      const owner = lead?.assignedAgentId
        ? getAgent(lead.assignedAgentId)?.name || lead.assignedAgentName || appointment.assignedAgentName || systemWorkerText("Tiada ejen")
        : appointment.assignedAgentName || systemWorkerText("Tiada ejen");
      const statusButtons = appointment.status === "scheduled"
        ? `
            <button class="contact-edit-button success" type="button" data-appointment-status="show_up" data-appointment-id="${appointment.id}">Show Up</button>
            <button class="contact-edit-button danger" type="button" data-appointment-status="no_show" data-appointment-id="${appointment.id}">No Show</button>
            <button class="contact-edit-button" type="button" data-appointment-reschedule="${appointment.id}">Reschedule</button>`
        : "";
      const actionButtons = `<div class="appointment-actions">
          ${statusButtons}
          <button class="contact-edit-button" type="button" data-appointment-edit="${appointment.id}">Edit</button>
          <button class="contact-edit-button danger" type="button" data-appointment-delete="${appointment.id}">Padam</button>
        </div>`;
      return `<article class="appointment-item">
        <div class="appointment-item-heading">
          <span class="status-badge appointment-${appointment.status}">${formatAppointmentStatus(appointment.status)}</span>
          <small>${escapeHtml(appointment.type)}</small>
        </div>
        <div class="appointment-item-main">
          <div>
            <strong>${escapeHtml(appointment.leadName || lead?.name || "Lead")}</strong>
            <small>${escapeHtml(appointment.project || lead?.project || "Tidak dinyatakan")}</small>
          </div>
          <div>
            <strong>${formatDateTime(appointment.scheduledAt)}</strong>
            <small>${escapeHtml(appointment.location || "Lokasi belum ditetapkan")}</small>
          </div>
          <div>
            <strong>${escapeHtml(owner)}</strong>
            <small>${workerLabel()} bertanggungjawab</small>
          </div>
        </div>
        ${appointment.notes ? `<p class="appointment-notes">${escapeHtml(appointment.notes)}</p>` : ""}
        ${actionButtons}
      </article>`;
    }).join("")
    : '<p class="empty-state">Tiada appointment untuk dipaparkan.</p>';
}

function openAppointmentModal(leadId, appointmentId = null, mode = "create") {
  const appointment = appointmentId ? state.appointments.find((item) => item.id === appointmentId) : null;
  const lead = appointment ? findLeadForAppointment(appointment) : state.leads.find((item) => item.id === leadId);
  if (!lead?.assignedAgentId || !canAccessLead(lead)) {
    showToast("Lead belum layak", "Appointment hanya boleh dibuat untuk lead yang telah diagihkan kepada anda.", "error");
    return;
  }
  selectedAppointmentLeadId = lead.id;
  reschedulingAppointmentId = mode === "reschedule" ? appointment?.id || null : null;
  editingAppointmentId = mode === "edit" ? appointment?.id || null : null;
  pendingAppointmentRequestId = `appointment-${crypto.randomUUID?.() || makeId("request")}`;
  elements.appointmentForm.reset();
  elements.appointmentModalKicker.textContent = mode === "reschedule" ? "Jadual baharu" : "Susulan lead";
  elements.appointmentModalTitle.textContent = mode === "edit" ? "Edit Appointment" : mode === "reschedule" ? "Reschedule Appointment" : "Tambah Appointment";
  elements.appointmentLeadSummary.textContent = `${lead.name} · ${lead.project}`;
  elements.appointmentType.value = appointment?.type || "Site Visit";
  elements.appointmentScheduledAt.value = appointmentDateTimeLocalValue(appointment?.scheduledAt || Date.now() + 24 * 60 * 60 * 1000);
  elements.appointmentScheduledAt.min = appointmentDateTimeLocalValue(Date.now() + 60 * 1000);
  elements.appointmentLocation.value = appointment?.location || "";
  elements.appointmentNotes.value = appointment?.notes || "";
  elements.appointmentFormError.textContent = "";
  elements.appointmentSubmitButton.textContent = mode === "edit" ? "Simpan perubahan" : mode === "reschedule" ? "Simpan jadual baharu" : "Simpan appointment";
  elements.appointmentModal.classList.add("open");
  elements.appointmentModal.setAttribute("aria-hidden", "false");
}

function appointmentActionPayload(appointment = {}) {
  const user = getCurrentUser();
  return {
    ...appointment,
    acting_role: user?.role || "",
    acting_agent_id: user?.role === "agent" ? user.id : "",
  };
}

async function saveAppointment(event) {
  event.preventDefault();
  if (!guardLifecycleMutation()) return false;
  const lead = state.leads.find((item) => item.id === selectedAppointmentLeadId);
  if (!lead?.assignedAgentId || !canAccessLead(lead)) {
    elements.appointmentFormError.textContent = "Lead ini sudah tidak ditugaskan kepada anda.";
    return;
  }
  const appointment = appointmentActionPayload({
    id: editingAppointmentId || reschedulingAppointmentId || "",
    request_id: pendingAppointmentRequestId,
    lead_id: remoteDatabaseMode ? lead.id : (lead.dedupeKey || lead.id),
    type: elements.appointmentType.value,
    scheduled_at: remoteDatabaseMode
      ? malaysiaAppointmentTimestamp(elements.appointmentScheduledAt.value)
      : elements.appointmentScheduledAt.value,
    location: elements.appointmentLocation.value.trim(),
    notes: elements.appointmentNotes.value.trim(),
  });
  const action = editingAppointmentId ? "update_appointment" : reschedulingAppointmentId ? "reschedule_appointment" : "create_appointment";
  elements.appointmentSubmitButton.disabled = true;
  setGlobalLoading(true, "Menyimpan appointment...");
  try {
    if (remoteDatabaseMode) {
      const remoteAction = editingAppointmentId ? "update" : reschedulingAppointmentId ? "reschedule" : "create";
      const { data, error } = await remoteDatabaseClient.rpc("manage_appointment", {
        p_action: remoteAction,
        p_appointment: appointment,
      });
      if (error || !data?.ok) throw error || new Error(data?.error || "Appointment gagal disimpan.");
    } else {
      await postGoogleSheetActionWithResponse({ action, appointment }, "Appointment update failed");
    }
    pendingAppointmentRequestId = null;
    closeModal(elements.appointmentModal);
    if (remoteDatabaseMode) await loadRemoteState(state.currentUserId);
    else await syncGoogleSheet({ silent: true });
    showToast(reschedulingAppointmentId ? "Appointment dijadual semula" : editingAppointmentId ? "Appointment dikemas kini" : "Appointment disimpan", `${lead.name} telah dikemas kini.`);
  } catch (error) {
    elements.appointmentFormError.textContent = error?.message || "Appointment tidak dapat disimpan.";
  } finally {
    elements.appointmentSubmitButton.disabled = false;
    setGlobalLoading(false);
  }
}

async function updateAppointmentStatus(appointmentId, status) {
  if (!guardLifecycleMutation()) return false;
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  const lead = findLeadForAppointment(appointment);
  if (!appointment || !lead || !canAccessLead(lead)) return;
  setGlobalLoading(true, "Mengemas kini appointment...");
  try {
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.rpc("manage_appointment", {
        p_action: "status",
        p_appointment: { id: appointmentId, status },
      });
      if (error || !data?.ok) throw error || new Error(data?.error || "Status appointment gagal disimpan.");
      await loadRemoteState(state.currentUserId);
    } else {
      await postGoogleSheetActionWithResponse({
        action: "update_appointment_status",
        appointment: appointmentActionPayload({ id: appointmentId, status }),
      }, "Appointment status update failed");
      await syncGoogleSheet({ silent: true });
    }
    showToast("Appointment dikemas kini", `${lead.name}: ${formatAppointmentStatus(status)}.`);
  } catch (error) {
    showToast("Status gagal disimpan", error?.message || "Cuba lagi.", "error");
  } finally {
    setGlobalLoading(false);
  }
}

async function deleteAppointment(appointmentId) {
  if (!guardLifecycleMutation()) return false;
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  const lead = findLeadForAppointment(appointment);
  if (!appointment || !lead || !canAccessLead(lead)) return;
  if (!confirmPermanentDelete("appointment", `${appointment.leadName || lead.name} pada ${formatDateTime(appointment.scheduledAt)}`)) return;
  setGlobalLoading(true, "Memadam appointment...");
  try {
    if (remoteDatabaseMode) {
      const { data, error } = isAdmin()
        ? await remoteDatabaseClient.rpc("admin_delete_appointment", { p_appointment_id: appointmentId })
        : await remoteDatabaseClient.rpc("manage_appointment", {
          p_action: "delete",
          p_appointment: { id: appointmentId },
        });
      if (error || !data?.ok || (isAdmin() && Number(data?.deleted) !== 1)) {
        throw error || new Error(data?.error || "Appointment gagal dipadam.");
      }
      await loadRemoteState(state.currentUserId);
    } else {
      await postGoogleSheetActionWithResponse({
        action: "delete_appointment",
        appointment: appointmentActionPayload({ id: appointmentId }),
      }, "Appointment delete failed");
      await syncGoogleSheet({ silent: true });
    }
    showToast("Appointment dipadam", `${lead.name} telah dikemas kini.`);
  } catch (error) {
    showToast("Appointment gagal dipadam", error?.message || "Cuba lagi.", "error");
  } finally {
    setGlobalLoading(false);
  }
}

function renderAgents() {
  elements.agentsGrid.innerHTML = state.agents
    .filter((agent) => agent.role !== "master" && agent.approvalStatus !== "rejected")
    .map(
      (agent) => {
        const isPendingAgent = agent.role === "agent" && agent.approvalStatus === "pending";
        const roleLabel = agent.role === "admin" ? "Administrator" : isPendingAgent ? "Menunggu approval" : isTeamSales() ? "Team Sales" : "Agent";
        const projectNames = normalizeProjectIds(agent.eligibleProjectIds)
          .map((projectId) => state.projects.find((project) => project.id === projectId)?.name)
          .filter(Boolean);
        const leadAvailabilityAction = !isTeamSales() && agent.role === "agent" && agent.active && agent.approvalStatus === "approved"
          ? agent.leadReady
            ? `<button class="agent-lead-availability stop" type="button" data-agent-lead-availability="stop" data-agent-id="${agent.id}">STOP LEAD</button>`
            : agent.online && agent.notificationEnabled
              ? `<button class="agent-lead-availability get" type="button" data-agent-lead-availability="get" data-agent-id="${agent.id}">GET LEAD</button>`
              : ""
          : "";
        const actionButtons = isPendingAgent
          ? `
            <button class="edit-agent" type="button" data-agent-edit="${agent.id}">Edit details</button>
            <button class="approve-agent" type="button" data-agent-approve="${agent.id}">Approve</button>
            <button class="reject-agent" type="button" data-agent-reject="${agent.id}">Reject</button>`
          : `
            <button class="edit-agent" type="button" data-agent-edit="${agent.id}">Edit details</button>
            <button class="edit-password" type="button" data-agent-password="${agent.id}">Edit password</button>
            ${leadAvailabilityAction}
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
            <span>${projectLabel()} <b>${escapeHtml(projectNames.join(", ") || "Belum dipilih")}</b></span>
          </div>
          <div class="agent-card-actions">
            ${actionButtons}
          </div>
        </article>`;
      },
    )
    .join("");
}

function renderProjects() {
  if (!elements.projectsList) return;
  const projects = state.projects || [];
  elements.projectsList.innerHTML = projects.length
    ? projects.map((project) => {
      const projectKey = String(project.name || "").trim().replace(/\s+/g, " ").toLowerCase();
      const projectLeads = state.leads.filter((lead) =>
        String(lead.project || "").trim().replace(/\s+/g, " ").toLowerCase() === projectKey,
      );
      const statusCounts = Object.fromEntries(LEAD_STATUS_OPTIONS.map((status) => [status.value, 0]));
      projectLeads.forEach((lead) => {
        statusCounts[getLeadVisualStatus(lead)] = (statusCounts[getLeadVisualStatus(lead)] || 0) + 1;
      });
      return `
      <article class="project-row">
        <div class="project-row-heading">
          <span>
            <strong>${escapeHtml(project.name)}</strong>
            <small>${project.active ? "Aktif untuk agihan" : "Tidak menerima lead baharu"}</small>
          </span>
          <button class="switch ${project.active ? "active" : ""}" type="button"
            data-project-toggle="${project.id}" aria-label="${project.active ? "Nyahaktifkan" : "Aktifkan"} ${escapeHtml(project.name)}"></button>
        </div>
        <details class="project-status-dropdown" data-project-status="${project.id}" ${expandedProjectStatusIds.has(project.id) ? "open" : ""}>
          <summary>
            <span>${systemWorkerText("Status lead mengikut projek")}</span>
            <b>${projectLeads.length} lead</b>
          </summary>
          <div class="project-status-list">
            ${LEAD_STATUS_OPTIONS.map((status) => `
              <span class="project-status-item status-${status.value}">
                <small>${status.label}</small>
                <b>${statusCounts[status.value] || 0}</b>
              </span>`).join("")}
          </div>
          <details class="project-danger-menu">
            <summary>Pilihan lanjut</summary>
            <div class="project-danger-actions">
              <small>${systemWorkerText("Hanya projek tanpa lead, buletin atau ejen yang dipautkan boleh dipadam.")}</small>
              <button class="text-button danger-text" type="button" data-project-delete="${escapeHtml(project.id)}">${systemWorkerText("Padam projek")}</button>
            </div>
          </details>
        </details>
      </article>`;
    }).join("")
    : `<p class="empty-state">${systemWorkerText("Belum ada projek. Tambah projek sebelum meluluskan ejen.")}</p>`;
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

  document.querySelector("#dashboard-view")?.classList.toggle("agent-dashboard", user.role === "agent");
  const salesDashboard = user.role === "agent" && isTeamSales();
  document.querySelector("#dashboard-view")?.classList.toggle("team-admin-dashboard", isAdmin() && isTeamSales());
  document.querySelector("#dashboard-view")?.classList.toggle("team-sales-dashboard", salesDashboard);
  const newLeadSection = document.querySelector("#dashboard-view .new-lead-section");
  // Move the existing panel, preserving its controls and restoring Agent ordering.
  if (salesDashboard && elements.ownPerformance.nextElementSibling !== newLeadSection) newLeadSection.before(elements.ownPerformance);
  else if (!salesDashboard && newLeadSection.nextElementSibling !== elements.ownPerformance) newLeadSection.after(elements.ownPerformance);
  document.body.classList.toggle("master-account", isMaster());
  document.body.classList.toggle("team-sales-brand", isTeamSales());
  elements.sidebarAvatar.textContent = initials(user.name);
  elements.sidebarUserName.textContent = user.name;
  elements.sidebarUserRole.textContent = user.role === "admin" ? "Administrator" : isTeamSales() ? "Team Sales" : "Agent";
  if (isMaster()) elements.sidebarUserRole.textContent = "Master";
  document.querySelector("#active-brand-label").textContent = activeBrand?.name || (isMaster() ? "Tiada brand aktif" : "Safrich");
  document.querySelector("#copy-agent-registration-link").disabled = !isAdmin() || !activeBrand?.slug || activeBrand.active === false;
  const brandSwitcher = document.querySelector("#master-brand-switcher");
  brandSwitcher.hidden = !isMaster();
  brandSwitcher.innerHTML = masterBrands.filter(b => b.active).map(b => `<option value="${escapeHtml(b.id)}" ${b.id === activeBrandId ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("");
  document.querySelectorAll(".master-only").forEach(item => { item.hidden = !isMaster(); });
  elements.logoutButton.hidden = true;
  if (elements.ownPerformance) elements.ownPerformance.hidden = isAdmin();
  document.querySelector("#team-performance").hidden = !isAdmin() || !isTeamSales();
  elements.viewTitle.innerHTML =
    activeView === "dashboard"
      ? `<span class="desktop-greeting">Selamat datang, </span><span class="mobile-dashboard-brand"><span class="mobile-dashboard-brand-mark"><img src="assets/icon.svg" alt="" /></span><span>LeadLaju</span></span><span class="user-name">${escapeHtml(user.name.split(" ")[0])}</span>`
      : systemWorkerText(viewTitles[activeView] || "LeadLaju");

  document.querySelectorAll(".admin-only").forEach((item) => {
    item.style.display = isAdmin() ? (item.classList.contains("admin-only-block") ? "block" : "flex") : "none";
  });
  [elements.getLeadAllAgentsButton, elements.stopLeadAllAgentsButton].forEach(item => { item.hidden = isTeamSales(); });
  updateWorkerLabels();
  if (!isAdmin() && ["agents", "performance", "projects", "lead-monitor", "import-leads", "integrations"].includes(activeView)) {
    switchView("dashboard");
  }
}

function inspectLeadMovement(now = Date.now()) {
  const issues = [];
  const agentsById = new Map(state.agents.map((agent) => [String(agent.id), agent]));
  const activeByAgent = new Map();
  const addIssue = (lead, severity, code, title, detail, expected) => issues.push({
    id: `${lead.id}-${code}`,
    lead,
    severity,
    code,
    title: systemWorkerText(title),
    detail: systemWorkerText(detail),
    expected: systemWorkerText(expected),
    agentId: String(lead.assignedAgentId || ""),
  });

  state.leads.forEach((lead) => {
    const status = getLeadVisualStatus(lead);
    const assignedAgent = lead.assignedAgentId ? agentsById.get(String(lead.assignedAgentId)) : null;
    const history = Array.isArray(lead.assignmentHistory) ? lead.assignmentHistory : [];
    const latestAssignment = history.at(-1);
    const isNew = status === "new" || lead.status === "queued";
    const isAssignedNew = status === "new" && Boolean(lead.assignedAgentId);

    if (lead.assignedAgentId && !assignedAgent) {
      addIssue(lead, "critical", "unknown-agent", "Rujukan ejen tidak sah",
        "Lead masih merujuk kepada ejen yang tiada dalam senarai ejen.",
        "Padankan semula ejen atau kosongkan assignment ini.");
    }
    if (isAssignedNew) {
      const active = activeByAgent.get(lead.assignedAgentId) || [];
      active.push(lead);
      activeByAgent.set(lead.assignedAgentId, active);
      if (!isTeamSales() && (!Number.isFinite(lead.receivedAt) || !Number.isFinite(lead.expiresAt))) {
        addIssue(lead, "critical", "missing-runtime", "Masa assignment tidak lengkap",
          "Lead New mempunyai ejen tetapi tiada masa diterima atau masa tamat yang sah.",
          "Server perlu membina semula runtime assignment 5 minit.");
      } else if (!isTeamSales() && lead.expiresAt <= now) {
        addIssue(lead, "critical", "expired-active", "Assignment sudah tamat tetapi masih aktif",
          `Masa CALL NOW tamat ${relativeTime(lead.expiresAt)}, tetapi lead masih berada pada ejen.`,
          "Lead perlu ditanda missed, dikeluarkan daripada ejen ini dan masuk semula ke queue.");
      }
      if (String(lead.queueState || "").toLowerCase() === "queued") {
        addIssue(lead, "critical", "queued-assigned", "Queue dan assignment bercanggah",
          "Lead ditanda queued tetapi masih mempunyai ejen aktif.",
          "Gunakan satu state sahaja: queued tanpa ejen atau active dengan ejen.");
      }
      if (latestAssignment?.outcome === "contacted") {
        addIssue(lead, "critical", "called-still-new", "Sudah CALL tetapi status masih New",
          "Sejarah assignment terakhir sudah Contacted tetapi status utama belum berubah.",
          "Status perlu diselaraskan kepada Contacted pada dashboard dan Sheet.");
      }
    }
    if (!isNew && latestAssignment?.outcome === "pending") {
      addIssue(lead, "warning", "resolved-pending", "Sejarah assignment belum ditutup",
        `Status lead sudah ${formatSheetStatus(status)}, tetapi outcome terakhir masih pending.`,
        "Tutup outcome assignment mengikut status terkini.");
    }
    if (!isNew && Number.isFinite(lead.expiresAt) && lead.expiresAt > 0) {
      addIssue(lead, "warning", "terminal-runtime", "Timer masih melekat pada lead selesai",
        `Lead ${formatSheetStatus(status)} masih menyimpan masa tamat CALL NOW.`,
        "Kosongkan runtime timer selepas lead dihubungi atau diselesaikan.");
    }
  });

  activeByAgent.forEach((leads, agentId) => {
    if (isTeamSales() || leads.length < 2) return;
    leads.forEach((lead) => addIssue(lead, "critical", "multiple-active", "Ejen memegang lebih satu lead aktif",
      `${agentsById.get(String(agentId))?.name || "Ejen"} sedang memegang ${leads.length} lead New serentak.`,
      "Kekalkan satu lead aktif sahaja dan pulangkan selebihnya ke queue."));
  });
  return issues.sort((left, right) =>
    (left.severity === "critical" ? 0 : 1) - (right.severity === "critical" ? 0 : 1) ||
    (right.lead.receivedAt || right.lead.createdAt || 0) - (left.lead.receivedAt || left.lead.createdAt || 0));
}

function leadMonitorDataVerified(now = Date.now()) {
  return Boolean(remoteDatabaseMode && !monitorSyncFailed && monitorLastCanonicalSyncAt &&
    now - monitorLastCanonicalSyncAt < 90000);
}

function renderLeadMonitor() {
  if (!elements.monitorList) return;
  const canVerify = leadMonitorDataVerified();
  const issues = inspectLeadMovement();
  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const warning = issues.length - critical;
  elements.monitorCriticalCount.textContent = canVerify ? critical : "-";
  elements.monitorWarningCount.textContent = canVerify ? warning : "-";
  elements.monitorHealth.textContent = !canVerify ? "Tidak disahkan" : critical ? "Bermasalah" : warning ? "Perlu semak" : "Sihat";
  elements.monitorHealth.closest(".monitor-stat")?.classList.toggle("has-issue", !canVerify || Boolean(issues.length));
  elements.monitorCheckedAt.textContent = monitorLastCanonicalSyncAt ? new Intl.DateTimeFormat("ms-MY", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(monitorLastCanonicalSyncAt)) : "Belum berjaya";
  elements.navMonitorCount.textContent = canVerify ? issues.length : "";
  elements.navMonitorCount.hidden = !canVerify || issues.length === 0;

  const selectedAgent = elements.monitorAgentFilter.value || "all";
  elements.monitorAgentFilter.innerHTML = [
    `<option value="all">${systemWorkerText("Semua ejen")}</option>`,
    ...state.agents.filter((agent) => agent.role === "agent")
      .map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`),
    `<option value="unassigned">${systemWorkerText("Tiada ejen")}</option>`,
  ].join("");
  elements.monitorAgentFilter.value = [...elements.monitorAgentFilter.options]
    .some((option) => option.value === selectedAgent) ? selectedAgent : "all";
  const severity = elements.monitorSeverityFilter.value || "all";
  const agentFilter = elements.monitorAgentFilter.value || "all";
  const filtered = issues.filter((issue) =>
    (severity === "all" || issue.severity === severity) &&
    (agentFilter === "all" || (agentFilter === "unassigned" ? !issue.agentId : issue.agentId === agentFilter)));
  elements.monitorResultCount.textContent = canVerify ? `${filtered.length} isu` : "Belum disahkan";
  elements.monitorList.innerHTML = !canVerify ? `<div class="monitor-empty">
    <strong>${monitorSyncFailed ? "Semakan Supabase gagal" : "Data belum disahkan"}</strong>
    <small>Tekan Semak semula untuk membaca keadaan server terkini.</small>
  </div>` : filtered.length ? filtered.map((issue) => {
    const agent = issue.agentId ? getAgent(issue.agentId) : null;
    return `<article class="monitor-issue ${issue.severity}">
      <span class="monitor-severity">${issue.severity === "critical" ? "Kritikal" : "Perlu semak"}</span>
      <div class="monitor-issue-main">
        <strong>${escapeHtml(issue.title)}</strong>
        <small>${escapeHtml(issue.detail)}</small>
      </div>
      <div class="monitor-lead-meta">
        <strong>${escapeHtml(issue.lead.name)}</strong>
        <small>${escapeHtml(issue.lead.project)} · ${escapeHtml(agent?.name || issue.lead.assignedAgentName || "Tiada ejen")}</small>
      </div>
      <div class="monitor-expected"><small>Sepatutnya</small><span>${escapeHtml(issue.expected)}</span></div>
      <button class="text-button" type="button" data-monitor-lead="${escapeHtml(issue.lead.id)}">Buka lead</button>
    </article>`;
  }).join("") : `<div class="monitor-empty">
    <strong>${issues.length ? "Tiada isu untuk filter ini" : "Tiada masalah dikesan"}</strong>
    <small>${issues.length ? "Tukar filter untuk melihat isu lain." : "Queue, assignment dan status lead semasa berada dalam keadaan konsisten."}</small>
  </div>`;
}

function enforceSingleActiveLead() {
  if (isTeamSales()) return [];
  const occupied = new Set();
  const overflow = [];
  const active = state.leads.filter((lead) => lead.status === "new")
    .sort((a, b) => (a.receivedAt || a.createdAt || 0) - (b.receivedAt || b.createdAt || 0)
      || String(a.id).localeCompare(String(b.id)));
  for (const lead of active) {
    if (lead.assignedAgentId && !occupied.has(lead.assignedAgentId)) {
      occupied.add(lead.assignedAgentId);
      continue;
    }
    overflow.push(lead);
  }
  return overflow;
}

function renderIntegrationProjects() {
  if (!elements.integrationProjects) return;
  const projects = state.projects.filter((project) => project.active);
  elements.integrationProjects.innerHTML = projects.length
    ? `<span>${systemWorkerText("Nama projek aktif:")}</span>${projects.map((project) => `<code>${escapeHtml(project.name)}</code>`).join("")}`
    : `<span class="integration-warning">${systemWorkerText("Tiada projek aktif. Lead Pabbly akan ditolak sehingga projek diaktifkan.")}</span>`;
}

function formatIntegrationTime(value) {
  if (!value) return "Belum pernah";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Belum pernah" : formatDateTime(parsed.getTime());
}

function integrationResultLabel(result) {
  return ({ inserted: "Lead baharu diterima", duplicate: "Duplicate diabaikan", failed: "Penghantaran gagal" })[result] || "Belum diuji";
}

function renderIntegrationConnectors() {
  if (!elements.integrationConnectors) return;
  const statusByProvider = new Map(integrationStatus.map((item) => [item.provider, item]));
  elements.integrationConnectors.innerHTML = INTEGRATION_PROVIDERS.map((provider) => {
    const integration = statusByProvider.get(provider.id) || {};
    const key = integration.key || null;
    const rawKey = integrationRawKeys.get(provider.id) || "";
    const resultClass = key?.last_result === "failed" ? "error" : key?.last_result ? "success" : "neutral";
    const payload = integrationPayload(provider.id);
    return `
      <article class="panel integration-card" data-provider="${provider.id}">
        <div class="integration-card-heading">
          <span class="integration-provider-mark ${provider.id}">${provider.id === "meta_ads" ? "M" : "T"}</span>
          <span><small>Connector</small><h3>${provider.label}</h3></span>
          <span class="integration-status ${key ? "active" : "inactive"}">${key ? "Aktif" : "Belum disambung"}</span>
        </div>
        <div class="integration-key-meta">
          <span><small>Dicipta</small><strong>${key ? formatIntegrationTime(key.created_at) : "-"}</strong></span>
          <span><small>Digunakan</small><strong>${key ? formatIntegrationTime(key.last_used_at) : "-"}</strong></span>
          <span class="${resultClass}"><small>Status terakhir</small><strong>${integrationResultLabel(key?.last_result)}</strong></span>
        </div>
        ${key?.last_error ? `<p class="integration-error">${escapeHtml(key.last_error)}</p>` : ""}
        ${rawKey ? `
          <div class="integration-secret" role="status">
            <span><small>API key baharu, dipaparkan sementara</small><code>${escapeHtml(rawKey)}</code></span>
            <button class="icon-button" data-integration-copy-key="${provider.id}" type="button" aria-label="Salin API key" title="Salin API key">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            </button>
          </div>` : ""}
        <div class="integration-card-actions">
          <button class="primary-button" data-integration-rotate="${provider.id}" type="button">${key ? "Rotate API key" : "Jana API key"}</button>
          <button class="secondary-button danger" data-integration-revoke="${provider.id}" type="button" ${key ? "" : "disabled"}>Revoke</button>
        </div>
        <details class="integration-payload">
          <summary>Payload JSON ${provider.label}</summary>
          <pre><code>${escapeHtml(payload)}</code></pre>
          <button class="secondary-button compact" data-integration-copy-payload="${provider.id}" type="button">Salin payload</button>
        </details>
      </article>`;
  }).join("");
}

async function loadIntegrationStatus() {
  if (!isAdmin() || !remoteDatabaseMode || !remoteDatabaseClient || !elements.integrationConnectors) return;
  elements.refreshIntegrations.disabled = true;
  const requestBrandVersion = brandContextVersion;
  try {
    const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-integration", {
      body: { action: "list" },
    });
    if (error || !data?.ok) throw error || new Error(data?.error || "Status integration tidak tersedia.");
    if (requestBrandVersion !== brandContextVersion) return;
    integrationStatus = Array.isArray(data.integrations) ? data.integrations : [];
    renderIntegrationConnectors();
    renderIntegrationProjects();
  } catch (error) {
    if (requestBrandVersion !== brandContextVersion) return;
    elements.integrationConnectors.innerHTML = `<p class="empty-state">${escapeHtml(error?.message || "Status integration gagal dimuatkan.")}</p>`;
  } finally {
    elements.refreshIntegrations.disabled = false;
  }
}

async function copyIntegrationText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    showToast("Berjaya disalin", label, "success");
  } catch {
    showToast("Tidak dapat disalin", "Pilih dan salin nilai ini secara manual.", "error");
  }
}

async function rotateIntegrationKey(provider) {
  if (!isAdmin() || !INTEGRATION_PROVIDERS.some((item) => item.id === provider)) return;
  const current = integrationStatus.find((item) => item.provider === provider)?.key;
  if (current && !confirm("Rotate API key ini? Key lama akan berhenti berfungsi serta-merta.")) return;
  try {
    const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-integration", {
      body: { action: "rotate", provider },
    });
    if (error || !data?.ok || !data.apiKey) throw error || new Error(data?.error || "API key tidak dapat dijana.");
    integrationRawKeys.set(provider, data.apiKey);
    window.clearTimeout(integrationSecretTimers.get(provider));
    integrationSecretTimers.set(provider, window.setTimeout(() => {
      integrationRawKeys.delete(provider);
      renderIntegrationConnectors();
    }, 60000));
    await loadIntegrationStatus();
    showToast("API key tersedia", "Salin ke Pabbly sekarang. Key ini akan disembunyikan selepas 60 saat.", "success");
  } catch (error) {
    showToast("API key gagal dijana", error?.message || "Cuba semula.", "error");
  }
}

async function revokeIntegrationKey(provider) {
  if (!isAdmin() || !confirm("Revoke API key ini? Pabbly akan berhenti menghantar lead sehingga key baharu dipasang.")) return;
  try {
    const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-integration", {
      body: { action: "revoke", provider },
    });
    if (error || !data?.ok) throw error || new Error(data?.error || "API key tidak dapat direvoke.");
    integrationRawKeys.delete(provider);
    await loadIntegrationStatus();
    showToast("API key direvoke", "Connector ini tidak lagi menerima request.", "success");
  } catch (error) {
    showToast("Revoke gagal", error?.message || "Cuba semula.", "error");
  }
}

function integrationPayload(provider) {
  const item = INTEGRATION_PROVIDERS.find((entry) => entry.id === provider);
  if (!item) return "";
  if (provider === "tiktok_ads") return JSON.stringify({
    source_system: item.id,
    source_lead_id: `{{${item.label} Lead ID}}`,
    details_from_notes: true,
    notes: "{{Semua jawapan borang, satu jawapan setiap baris}}",
    project: state.projects.find((project) => project.active)?.name || systemWorkerText("Nama projek aktif"),
    source: item.source,
  }, null, 2);
  return JSON.stringify({
    source_system: item.id,
    source_lead_id: `{{${item.label} Lead ID}}`,
    name: "{{Full Name}}",
    phone: "{{Phone Number}}",
    email: "{{Email}}",
    city: "{{City}}",
    project: state.projects.find((project) => project.active)?.name || systemWorkerText("Nama projek aktif"),
    source: item.source,
    created_at: "{{Created Time}}",
  }, null, 2);
}

function normalizeBulletin(row = {}) {
  return { id: String(row.id || ""), title: String(row.title || ""), body: String(row.body || ""), status: String(row.status || "published"), projectId: row.project_id || row.projectId || "", projectName: String(row.project_name || row.projectName || "General"), ctaText: String(row.cta_text || row.ctaText || ""), ctaUrl: String(row.cta_url || row.ctaUrl || ""), publishedAt: parseLeadTimestamp(row.published_at || row.publishedAt, Date.now()), readAt: row.read_at || row.readAt || null, recipientCount: Number(row.recipient_count ?? row.recipientCount) || 0, readCount: Number(row.read_count ?? row.readCount) || 0 };
}

function validBulletinUrl(value) {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
}

async function loadBulletinFeed() {
  if (!remoteDatabaseMode || !remoteDatabaseClient || !state.currentUserId) return false;
  const requestBrandVersion = brandContextVersion;
  const { data, error } = await remoteDatabaseClient.rpc("get_bulletin_feed");
  if (error) throw error;
  if (requestBrandVersion !== brandContextVersion) return false;
  state.bulletins = (data?.bulletins || []).map(normalizeBulletin);
  state.bulletinUnreadCount = Number(data?.unread_count) || 0;
  return true;
}

async function markBulletinRead(id) {
  const bulletin = state.bulletins.find((item) => item.id === id);
  if (!bulletin || isAdmin() || bulletin.readAt || !remoteDatabaseMode) return true;
  const { error } = await remoteDatabaseClient.rpc("mark_bulletin_read", { p_bulletin_id: id });
  if (error) throw error;
  bulletin.readAt = new Date().toISOString();
  state.bulletinUnreadCount = Math.max(0, state.bulletinUnreadCount - 1);
  renderBulletins();
  return true;
}

function bulletinCard(bulletin, featured = false) {
  const ctaUrl = validBulletinUrl(bulletin.ctaUrl);
  const unreadCount = Math.max(0, bulletin.recipientCount - bulletin.readCount);
  const stats = isAdmin() ? `<small>${bulletin.readCount} dibaca / ${bulletin.recipientCount} penerima</small>` : bulletin.readAt ? '<small class="bulletin-read">Sudah dibaca</small>' : '<small class="bulletin-unread">Belum dibaca</small>';
  return `<article class="bulletin-card ${featured ? "featured" : ""} ${bulletin.status === "archived" ? "archived" : ""}" data-bulletin-open="${bulletin.id}"><span class="section-kicker">${escapeHtml(bulletin.projectName || "General")}</span><h3>${escapeHtml(bulletin.title)}</h3><p>${escapeHtml(bulletin.body).replace(/\n/g, "<br>")}</p><div class="bulletin-card-footer"><small>${formatDateTime(bulletin.publishedAt)}</small>${stats}</div>${ctaUrl ? `<a class="secondary-button compact bulletin-cta" href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(bulletin.ctaText)}</a>` : ""}${isAdmin() && bulletin.status === "published" ? `<div class="bulletin-admin-actions"><button class="secondary-button compact bulletin-remind" type="button" data-bulletin-remind="${bulletin.id}" ${unreadCount ? "" : "disabled"}>Remind Again${unreadCount ? ` (${unreadCount})` : ""}</button><button class="text-button" type="button" data-bulletin-edit="${bulletin.id}">Edit</button><button class="text-button danger-text" type="button" data-bulletin-archive="${bulletin.id}">Archive</button></div>` : ""}</article>`;
}

function renderBulletins() {
  if (!elements.bulletinFeatured || !elements.bulletinHistory) return;
  const rows = state.bulletins || [];
  const visible = isAdmin() ? rows : rows.filter((bulletin) => bulletin.status === "published");
  const latest = visible.find((bulletin) => bulletin.status === "published") || visible[0];
  elements.navBulletinCount.hidden = !state.bulletinUnreadCount;
  elements.navBulletinCount.textContent = state.bulletinUnreadCount || 0;
  elements.bulletinFeatured.innerHTML = latest ? bulletinCard(latest, true) : '<div class="empty-state">Tiada hebahan buat masa ini.</div>';
  elements.bulletinHistory.innerHTML = visible.filter((bulletin) => bulletin.id !== latest?.id).map((bulletin) => bulletinCard(bulletin)).join("") || '<p class="empty-state">Belum ada hebahan lama.</p>';
  if (isAdmin() && elements.bulletinProject) {
    const current = elements.bulletinProject.value;
    elements.bulletinProject.innerHTML = '<option value="">General - semua ejen aktif</option>' + state.projects.filter((project) => project.active).map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("");
    elements.bulletinProject.value = [...elements.bulletinProject.options].some((option) => option.value === current) ? current : "";
  }
  syncMobileNavigation();
}

async function openBulletin(id) {
  const bulletin = state.bulletins.find((item) => item.id === id);
  if (!bulletin) return;
  await markBulletinRead(id).catch(() => false);
  showToast(bulletin.title, bulletin.body.slice(0, 160), "success");
}

async function openRequestedBulletin() {
  if (!pendingBulletinId) return;
  const id = pendingBulletinId; pendingBulletinId = "";
  await openBulletin(id);
}

function resetBulletinForm() {
  elements.bulletinForm?.reset(); elements.bulletinId.value = ""; elements.bulletinProject.disabled = false; elements.bulletinError.textContent = ""; elements.bulletinSubmit.textContent = "Publish hebahan"; elements.bulletinCancelEdit.hidden = true;
}

async function saveBulletin(event) {
  event.preventDefault();
  const id = elements.bulletinId.value;
  const title = elements.bulletinTitle.value.trim(); const body = elements.bulletinBody.value.trim(); const ctaText = elements.bulletinCtaText.value.trim(); const ctaUrl = elements.bulletinCtaUrl.value.trim();
  if ((ctaText || ctaUrl) && (!ctaText || !validBulletinUrl(ctaUrl))) { elements.bulletinError.textContent = "CTA memerlukan teks dan URL https:// yang sah."; return; }
  elements.bulletinSubmit.disabled = true; elements.bulletinError.textContent = "";
  try {
    const args = id ? { p_bulletin_id: id, p_title: title, p_body: body, p_cta_text: ctaText || null, p_cta_url: ctaUrl || null } : { p_title: title, p_body: body, p_project_id: elements.bulletinProject.value || null, p_cta_text: ctaText || null, p_cta_url: ctaUrl || null };
    const { error } = await remoteDatabaseClient.rpc(id ? "update_bulletin" : "publish_bulletin", args);
    if (error) throw error;
    resetBulletinForm(); await loadBulletinFeed(); renderBulletins(); showToast(id ? "Buletin dikemas kini" : "Buletin diterbitkan", "Hebahan telah dihantar kepada penerima.", "success");
  } catch (error) { elements.bulletinError.textContent = error?.message || "Buletin gagal disimpan."; } finally { elements.bulletinSubmit.disabled = false; }
}

async function remindUnreadBulletin(id, button) {
  if (!isAdmin() || !remoteDatabaseMode || !id || button?.disabled) return;
  const originalLabel = button?.textContent || "Remind Again";
  if (button) { button.disabled = true; button.textContent = "Menghantar..."; }
  try {
    const { data, error } = await remoteDatabaseClient.rpc("remind_bulletin_unread", { p_bulletin_id: id });
    if (error) throw error;
    const count = Number(data?.enqueued_count) || 0;
    await loadBulletinFeed();
    renderBulletins();
    showToast(count ? "Reminder dihantar" : "Semua sudah baca", count ? `Push dihantar semula kepada ${count} penerima yang belum baca.` : "Tiada penerima belum baca untuk diingatkan.", "success");
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = originalLabel; }
    showToast("Reminder gagal", error?.message || "Push reminder tidak dapat dihantar.", "error");
  }
}

function normalizeFollowUpDue(row) {
  return {
    id: String(row.id || ""),
    name: String(row.name || "Lead"),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    city: String(row.city || ""),
    notes: String(row.notes || ""),
    projectId: String(row.project_id || ""),
    project: String(row.project || "Tidak dinyatakan"),
    assignedAgentId: String(row.assigned_agent_id || ""),
    assignedAgentName: String(row.assigned_agent_name || systemWorkerText("Tiada ejen")),
    assignmentRevision: Number(row.assignment_revision) || 0,
    statusRevision: Number(row.status_revision) || 0,
    contactedAt: row.contacted_at ? new Date(row.contacted_at).getTime() : null,
    followUpActivityAt: row.follow_up_activity_at ? new Date(row.follow_up_activity_at).getTime() : null,
    dueAt: row.due_at ? new Date(row.due_at).getTime() : null,
    notificationDueAt: row.notification_due_at ? new Date(row.notification_due_at).getTime() : null,
  };
}

async function loadFollowUpDueFeed() {
  if (!remoteDatabaseClient || !remoteDatabaseMode || !state.currentUserId) return false;
  const requestBrandVersion = brandContextVersion;
  const { data, error } = await remoteDatabaseClient.rpc("get_follow_up_due");
  if (error) throw error;
  if (requestBrandVersion !== brandContextVersion) return false;
  state.followUpDue = (data?.leads || []).map(normalizeFollowUpDue);
  state.followUpServerNow = data?.server_now ? new Date(data.server_now).getTime() : Date.now();
  state.followUpLoadedAt = Date.now();
  return true;
}

function followUpCanonicalNow() {
  if (!state.followUpServerNow || !state.followUpLoadedAt) return Date.now();
  return state.followUpServerNow + Math.max(0, Date.now() - state.followUpLoadedAt);
}

function followUpOverdueLabel(item) {
  const elapsed = Math.max(0, followUpCanonicalNow() - Number(item.dueAt || followUpCanonicalNow()));
  const hours = Math.floor(elapsed / (60 * 60 * 1000));
  if (hours < 24) return `${hours} jam overdue`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} hari ${remainingHours} jam overdue` : `${days} hari overdue`;
}

let followUpSection = "due";
let pendingFollowUpSection = new URLSearchParams(window.location.search).get("section");

function followUpSectionRows(section) {
  if (section === "due") return Array.isArray(state.followUpDue) ? state.followUpDue : [];
  return state.leads.filter(lead => lead.status === section &&
    (isAdmin() || lead.assignedAgentId === state.currentUserId) && !isVisuallyExpiredAssignment(lead))
    .sort((a, b) => section === "new" ? new Date(a.createdAt || a.receivedAt) - new Date(b.createdAt || b.receivedAt) : new Date(b.createdAt || b.receivedAt) - new Date(a.createdAt || a.receivedAt))
    .map(lead => ({ ...lead, assignedAgentName: getAgent(lead.assignedAgentId)?.name || lead.assignedAgentName || "Belum diagih", followUpActivityAt: lead.createdAt || lead.receivedAt }));
}

function followUpNavigationCount() {
  return new Set(["new", "contacted", "due"].flatMap(section => followUpSectionRows(section).map(lead => lead.id))).size;
}

function renderFollowUpDue() {
  if (!elements.followUpDueList) return;
  const rows = Array.isArray(state.followUpDue) ? state.followUpDue : [];
  const sectionRows = followUpSectionRows(followUpSection);
  elements.followUpDueList.dataset.section = followUpSection;
  document.querySelectorAll("[data-follow-up-section]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.followUpSection === followUpSection));
    const count = followUpSectionRows(button.dataset.followUpSection).length;
    button.querySelector("b").textContent = count || "";
    button.querySelector("b").hidden = count === 0;
  });
  document.querySelector("#follow-up-description").textContent = followUpSection === "new" ? "Lead baharu yang belum dihubungi." : followUpSection === "contacted" ? "Lead yang sudah dihubungi." : "Lead Contacted tanpa kemas kini remark selama 24 jam.";
  const dashboardPanel = document.querySelector("#dashboard-follow-up");
  if (dashboardPanel) {
    dashboardPanel.hidden = isAdmin() || getCurrentUser()?.role !== "agent";
    const ownRows = rows.filter((item) => item.assignedAgentId === state.currentUserId);
    document.querySelector("#dashboard-follow-up-count").textContent = `${ownRows.length} lead`;
    document.querySelector("#dashboard-follow-up-list").innerHTML = ownRows.length ? ownRows.map((item) => {
      const lead = state.leads.find((row) => row.id === item.id);
      return `<article class="dashboard-follow-up-item"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.project)} · ${followUpOverdueLabel(item)}</small></div><div class="follow-up-due-actions">${renderLeadFollowUpButton(lead, "data-follow-up-due-action")}${renderLeadCopyButton(lead, "data-follow-up-due-copy")}</div></article>`;
    }).join("") : '<p class="dashboard-follow-up-empty">Tiada lead Follow Up Due buat masa ini.</p>';
  }
  const selectedAgent = elements.followUpAgentFilter?.value || "all";
  const selectedProject = elements.followUpProjectFilter?.value || "all";

  if (isAdmin() && elements.followUpAgentFilter) {
    const agents = [...new Map(sectionRows.map((item) => [item.assignedAgentId, item.assignedAgentName])).entries()];
    elements.followUpAgentFilter.innerHTML = '<option value="all">Semua ejen</option>' + agents
      .map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");
    elements.followUpAgentFilter.value = agents.some(([id]) => id === selectedAgent) ? selectedAgent : "all";
  }
  if (isAdmin() && elements.followUpProjectFilter) {
    const projects = [...new Set(sectionRows.map((item) => item.project).filter(Boolean))].sort();
    elements.followUpProjectFilter.innerHTML = `<option value="all">${systemWorkerText("Semua projek")}</option>` + projects
      .map((project) => `<option value="${escapeHtml(project)}">${escapeHtml(project)}</option>`).join("");
    elements.followUpProjectFilter.value = projects.includes(selectedProject) ? selectedProject : "all";
  }

  populateMonthPeriodFilter(elements.followUpPeriodFilter, sectionRows, (item) => item.followUpActivityAt);
  const filtered = sectionRows.filter((item) =>
    (!isAdmin() || elements.followUpAgentFilter?.value === "all" || item.assignedAgentId === elements.followUpAgentFilter.value) &&
    (!isAdmin() || elements.followUpProjectFilter?.value === "all" || item.project === elements.followUpProjectFilter.value) &&
    matchesMonthPeriodFilter(item.followUpActivityAt, elements.followUpPeriodFilter)
  );

  const navigationCount = followUpNavigationCount();
  elements.navFollowUpCount.hidden = navigationCount === 0;
  elements.navFollowUpCount.textContent = navigationCount;
  elements.followUpCount.textContent = `${filtered.length} lead`;
  if (followUpSection !== "due") {
    elements.followUpDueList.innerHTML = filtered.length ? filtered.map(item => {
      const lead = state.leads.find(row => row.id === item.id);
      const call = isTeamSales() ? renderSalesContactButton(lead, "call") : canRevealLeadContact(lead) && lead.phone
        ? `<a class="contact-edit-button sales-contact-call" href="tel:${escapeHtml(String(lead.phone).replace(/[^+\d]/g, ""))}">Call</a>`
        : `<button class="log-call-now-button" type="button" data-follow-up-call="${escapeHtml(lead.id)}" ${canAccessLead(lead) && lead.assignedAgentId ? "" : "disabled"}>CALL NOW</button>`;
      return `<article class="follow-up-due-item"><div class="follow-up-lead"><span class="member-avatar">${initials(item.name)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.project)}</small></span></div><div class="follow-up-owner"><small>${workerLabel()}</small><strong>${escapeHtml(item.assignedAgentName)}</strong></div><div class="follow-up-note"><small>Nota / Remark</small><p>${escapeHtml(leadDisplayNotes(lead) || "Belum ada remark")}</p></div><div class="follow-up-time"><strong>${followUpSection === "new" ? "New" : "Contacted"}</strong>${renderSalesLeadWaitingTime(lead)}</div><div class="follow-up-due-actions">${call}${isTeamSales() && lead.status === "new" ? renderSalesContactButton(lead, "whatsapp") : renderLeadFollowUpButton(lead, "data-follow-up-due-action")}${renderLeadCopyButton(lead, "data-follow-up-due-copy")}</div></article>`;
    }).join("") : `<div class="follow-up-empty"><strong>Tiada lead ${followUpSection === "new" ? "New" : "Contacted"}</strong><p>Tiada lead yang sepadan dengan penapis ini.</p></div>`;
    syncMobileNavigation();
    return;
  }
  elements.followUpDueList.innerHTML = filtered.length ? filtered.map((item) => {
    const lead = state.leads.find((row) => row.id === item.id);
    return `
    <article class="follow-up-due-item">
      <div class="follow-up-lead">
        <span class="member-avatar">${initials(item.name)}</span>
        <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.project)}</small></span>
      </div>
      <div class="follow-up-owner"><small>${workerLabel()}</small><strong>${escapeHtml(item.assignedAgentName)}</strong></div>
      <div class="follow-up-note"><small>Remark terakhir</small><p>${escapeHtml(item.notes || "Belum ada remark")}</p></div>
      <div class="follow-up-time"><strong>${followUpOverdueLabel(item)}</strong><small>Dikemas kini ${formatDateTime(item.followUpActivityAt)}</small></div>
      <div class="follow-up-due-actions">
        ${renderLeadFollowUpButton(lead, "data-follow-up-due-action")}
        ${renderLeadCopyButton(lead, "data-follow-up-due-copy")}
      </div>
    </article>`;
  }).join("") : '<div class="follow-up-empty"><span aria-hidden="true">✓</span><strong>Semua follow up terkawal</strong><p>Tiada lead Contacted yang melebihi 24 jam tanpa kemas kini.</p></div>';
  syncMobileNavigation();
}

function performanceDateOffset(days) {
  const date = new Date(`${todayKey()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function salesNewLeadCount(report, agentIds = (report?.rows || []).map(row => row.agent_id)) {
  return (state.leads || []).filter(lead => lead.status === "new" && agentIds.includes(lead.assignedAgentId) &&
    (lead.assignmentHistory || []).some(item => item.agentId === lead.assignedAgentId &&
      todayKey(new Date(item.assignedAt).getTime()) >= report.from && todayKey(new Date(item.assignedAt).getTime()) <= report.to)).length;
}

function refreshSalesNewMetric() {
  if (!isTeamSales() || !salesPerformanceRange) return;
  const metric = document.querySelector(`${isAdmin() ? "#team-performance-metrics" : "#own-performance-metrics"} [data-sales-performance="new"] strong`);
  if (metric) metric.textContent = salesNewLeadCount(salesPerformanceRange, salesPerformanceRange.agentIds);
}

function renderTeamPerformance(report) {
  salesPerformanceRange = { from: report.from, to: report.to, agentIds: (report.rows || []).map(row => row.agent_id) };
  const rows = report?.rows || [];
  const total = (key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  document.querySelector("#team-performance-status").textContent = `${report.from} hingga ${report.to} · ${rows.length} Team Sales${total("assignments") === 0 ? " · Tiada lead ditugaskan dalam tempoh ini" : ""}`;
  document.querySelector("#team-performance-metrics").innerHTML = [
    performanceMetric("Lead ditugaskan", total("assignments"), "", "lead"),
    performanceMetric("New", salesNewLeadCount(report), "Belum contact", "lead"),
    performanceMetric("Contacted", total("total_contacted"), "", "call"),
    performanceMetric("Follow Up", total("total_follow_up"), "", "due"),
    performanceMetric("Potential", total("total_potential"), "", "lead"),
    performanceMetric("Cancelled / Rejected", total("total_cancelled_rejected"), "", "due"),
    performanceMetric("Client", total("total_client"), "", "show"),
    performanceMetric("Appointment", total("appointments"), "", "appointment"),
    performanceMetric("Follow Up Due", total("due_now"), "Tertunggak sekarang", "due"),
  ].join("");
}

async function loadTeamPerformance() {
  if (!isAdmin() || !isTeamSales()) return;
  const panel = document.querySelector("#team-performance");
  const status = document.querySelector("#team-performance-status");
  panel.querySelectorAll("[data-team-performance-days]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.teamPerformanceDays) === teamPerformanceDays)));
  if (!remoteDatabaseMode || !remoteDatabaseClient) {
    status.textContent = "Prestasi memerlukan sambungan Supabase.";
    return;
  }
  const days = teamPerformanceDays;
  const from = performanceDateOffset(1 - days);
  const to = todayKey();
  const brandVersion = brandContextVersion;
  const userId = state.currentUserId;
  const key = `${brandVersion}:${userId}:${days}:${to}`;
  const cached = teamPerformanceCache.get(key);
  if (cached && Date.now() - cached.loadedAt < 300000) {
    renderTeamPerformance(cached.report);
    panel.setAttribute("aria-busy", "false");
    return;
  }
  if (teamPerformancePending.has(key)) return;
  teamPerformancePending.add(key);
  status.textContent = "Memuatkan prestasi...";
  panel.setAttribute("aria-busy", "true");
  // Keep the previous cards readable while the new range loads; no blank flash.
  const stillCurrent = () => brandVersion === brandContextVersion && userId === state.currentUserId && days === teamPerformanceDays && isAdmin() && isTeamSales();
  try {
    const { data, error } = await remoteDatabaseClient.rpc("get_agent_performance_report", { p_from: from, p_to: to, p_agent_id: null, p_project_id: null });
    if (error) throw error;
    if (brandVersion !== brandContextVersion || userId !== state.currentUserId) return;
    teamPerformanceCache.set(key, { report: data, loadedAt: Date.now() });
    if (stillCurrent()) renderTeamPerformance(data);
  } catch (error) {
    if (stillCurrent()) status.textContent = "Prestasi gagal dimuatkan. Tekan tempoh sekali lagi untuk cuba semula.";
    console.error("Team performance load failed", error);
  } finally {
    teamPerformancePending.delete(key);
    if (stillCurrent()) panel.setAttribute("aria-busy", "false");
  }
}

function performanceRange() {
  const period = elements.performancePeriod?.value || "7";
  if (period === "custom") {
    const from = elements.performanceFrom?.value;
    const to = elements.performanceTo?.value;
    if (!from || !to || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) return null;
    return { from, to };
  }
  return { from: performanceDateOffset(1 - Number(period)), to: todayKey() };
}

function performanceRate(row) {
  return Number(row.assignments) ? Number(row.within_five) / Number(row.assignments) : null;
}

function performanceRateLabel(row) {
  const rate = performanceRate(row);
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function performanceMetric(label, value, detail = "", icon = "lead") {
  const action = isTeamSales() ? ({ New: "new", Contacted: "contacted", "Total Contacted": "contacted", "Follow Up": "group_follow_up", Potential: "potential", "Cancelled / Rejected": "group_cancelled_rejected", Client: "client", "Follow Up Due": "due" })[label] : null;
  const icons = {
    lead: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
    call: '<path d="M7 3h4l1 5-2 2a14 14 0 0 0 4 4l2-2 5 1v4c0 2-2 3-4 3C10 20 4 14 4 7c0-2 1-4 3-4Z"/>',
    appointment: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m5 6 2 2 4-4"/>',
    show: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    due: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  return `<${action ? 'button type="button" data-sales-performance="' + action + '"' : "div"} class="performance-metric metric-${icon}"><small>${escapeHtml(label)}</small><span class="performance-metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[icon] || icons.lead}</svg></span><strong>${escapeHtml(value)}</strong>${detail ? `<span class="performance-metric-detail">${escapeHtml(detail)}</span>` : ""}</${action ? "button" : "div"}>`;
}

function renderOwnPerformance(current, previous) {
  if (isTeamSales()) salesPerformanceRange = { from: current.from, to: current.to, agentIds: [state.currentUserId] };
  const row = current?.rows?.find((item) => item.agent_id === state.currentUserId);
  const prior = previous?.rows?.find((item) => item.agent_id === state.currentUserId);
  if (!row) {
    elements.ownPerformanceStatus.textContent = "Prestasi belum tersedia.";
    elements.ownPerformanceMetrics.innerHTML = "";
    return;
  }
  elements.ownPerformanceStatus.textContent = `${current.from} hingga ${current.to} · Dibandingkan dengan 7 hari sebelumnya`;
  elements.ownPerformanceMetrics.innerHTML = [
    performanceMetric("Lead ditugaskan", row.assignments, `Sebelumnya ${prior?.assignments || 0}`, "lead"),
    ...(isTeamSales() ? [performanceMetric("New", salesNewLeadCount(current, [state.currentUserId]), "Belum contact", "lead")] : []),
    isTeamSales() ? performanceMetric("Total Contacted", row.total_contacted || 0, `Sebelumnya ${prior?.total_contacted || 0}`, "call") : performanceMetric("CALL NOW ≤5 min", performanceRateLabel(row), `Sebelumnya ${prior ? performanceRateLabel(prior) : "—"}`, "call"),
    ...(isTeamSales() ? [["Follow Up", "total_follow_up", "due"], ["Potential", "total_potential", "lead"], ["Cancelled / Rejected", "total_cancelled_rejected", "due"], ["Client", "total_client", "show"]].map(([label, key, icon]) => performanceMetric(label, row[key] || 0, `Sebelumnya ${prior?.[key] || 0}`, icon)) : []),
    performanceMetric("Appointment", row.appointments, `Sebelumnya ${prior?.appointments || 0}`, "appointment"),
    ...(!isTeamSales() ? [performanceMetric("Show Up", row.show_ups, `Sebelumnya ${prior?.show_ups || 0}`, "show")] : []),
    performanceMetric("Follow Up Due", row.due_now, "Perlu tindakan", "due"),
  ].join("");
}

async function loadOwnPerformance() {
  if (isAdmin() || !elements.ownPerformance || !remoteDatabaseMode || !remoteDatabaseClient) {
    if (!isAdmin() && elements.ownPerformanceStatus) elements.ownPerformanceStatus.textContent = "Prestasi hanya tersedia apabila tersambung ke Supabase.";
    return;
  }
  if (ownPerformanceLoading) return;
  ownPerformanceLoading = true;
  ownPerformanceLoadedAt = Date.now();
  const currentUserId = state.currentUserId;
  const currentFrom = performanceDateOffset(-6);
  const previousFrom = performanceDateOffset(-13);
  try {
    const [currentResult, previousResult] = await Promise.all([
      remoteDatabaseClient.rpc("get_agent_performance_report", { p_from: currentFrom, p_to: todayKey(), p_agent_id: currentUserId }),
      remoteDatabaseClient.rpc("get_agent_performance_report", { p_from: previousFrom, p_to: performanceDateOffset(-7), p_agent_id: currentUserId }),
    ]);
    if (currentResult.error || previousResult.error) throw currentResult.error || previousResult.error;
    if (state.currentUserId === currentUserId && !isAdmin()) renderOwnPerformance(currentResult.data, previousResult.data);
  } catch (error) {
    console.error("Agent performance load failed", error);
    elements.ownPerformanceStatus.textContent = "Prestasi belum dapat dimuatkan. Cuba refresh.";
  } finally {
    ownPerformanceLoading = false;
  }
}

async function loadMasterManagement() {
  if (!isMaster() || !remoteDatabaseClient) return;
  const status = document.querySelector("#master-management-status");
  try {
    const [brands, admins] = await Promise.all([
      remoteDatabaseClient.rpc("master_manage_brand", { p_action: "list" }),
      remoteDatabaseClient.functions.invoke("master-manage-account", { body: { action: "list_admins" } }),
    ]);
    if (brands.error || admins.error || !admins.data?.ok) throw brands.error || admins.error || new Error(admins.data?.error);
    if (!isMaster()) return;
    masterBrands = brands.data?.brands || [];
    masterAdmins = admins.data?.admins || [];
    status.textContent = `${masterBrands.length} brand · ${masterAdmins.length} Admin`;
    document.querySelector("#master-admin-brand").innerHTML = masterBrands.filter(b => b.active).map(b => `<option value="${escapeHtml(b.id)}" ${b.id === activeBrandId ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("");
    document.querySelector("#master-brand-list").innerHTML = masterBrands.map(b => `<article class="panel master-card">
      <div class="master-card-heading"><div class="master-card-identity"><span class="master-card-avatar" aria-hidden="true">${escapeHtml(initials(b.name))}</span><h3>${escapeHtml(b.name)}</h3></div><span class="integration-status ${b.active ? "active" : "inactive"}">${b.active ? "Aktif" : "Tidak aktif"}</span></div>
      <p class="master-mode-label">${b.distribution_mode === "team_sales" ? "Sistem Team Sales" : "Sistem Ejen"} · Mod dikunci</p>
      <div class="master-registration-link"><small>Link pendaftaran</small><p>${escapeHtml(agentRegistrationUrl(b))}</p></div>
      <div class="master-card-actions"><button class="primary-button" data-master-open="${b.id}" ${b.active ? "" : "disabled"}>Buka brand</button><button class="secondary-button" data-master-copy="${b.id}">Salin link daftar</button><button class="secondary-button" data-master-rename="${b.id}">Edit nama</button></div>
      <details class="master-card-details"><summary>Kawalan brand</summary><div class="master-card-actions"><button class="secondary-button ${b.active ? "danger" : ""}" data-master-toggle="${b.id}">${b.active ? "Nyahaktif brand" : "Aktifkan semula"}</button></div></details></article>`).join("");
    document.querySelector("#master-admin-list").innerHTML = masterAdmins.length ? masterAdmins.map(a => `<article class="panel master-card">
      <div class="master-card-heading"><div class="master-card-identity"><span class="master-card-avatar master-admin-avatar" aria-hidden="true">${escapeHtml(initials(a.name))}</span><h3>${escapeHtml(a.name)}</h3></div><span class="integration-status ${a.active ? "active" : "inactive"}">${a.active ? "Aktif" : "Tidak aktif"}</span></div>
      <div class="master-admin-meta"><span>${escapeHtml(masterBrands.find(b => b.id === a.brand_id)?.name || "")}</span><p>${escapeHtml(a.email)}</p></div>
      <details class="master-card-details"><summary>Edit Admin</summary><form class="master-admin-edit" data-master-admin="${a.id}"><label>Nama<input name="name" value="${escapeHtml(a.name)}" maxlength="120" required /></label><label>Telefon<input name="phone" type="tel" value="${escapeHtml(a.phone || "")}" /></label><label class="master-active-label"><input type="checkbox" name="active" ${a.active ? "checked" : ""} />Akaun aktif</label><button class="primary-button" type="submit">Simpan</button></form><button class="secondary-button" data-master-reset="${a.id}" type="button">Hantar reset kata laluan</button></details></article>`).join("") : '<p class="panel master-empty-state">Belum ada Admin. Hantar jemputan untuk mula membina pasukan.</p>';
    renderUser();
  } catch (e) { status.textContent = e?.message || "Pengurusan Master belum dapat dimuatkan."; }
}

function clearBrandOperationalState() {
  salesLeadDrilldown = null;
  salesPerformanceRange = null;
  const current = getCurrentUser();
  const integration = state.integration;
  brandContextVersion++;
  teamPerformanceCache.clear();
  teamPerformancePending.clear();
  document.querySelector("#team-performance-metrics").replaceChildren();
  document.querySelector("#team-performance-status").textContent = "Memuatkan prestasi...";
  document.querySelector("#team-performance").setAttribute("aria-busy", "false");
  monitorLastCanonicalSyncAt = null;
  monitorSyncFailed = false;
  salesContactStates.clear();
  performanceRequestVersion++;
  performanceReport = null;
  performanceLoadedAt = ownPerformanceLoadedAt = 0;
  integrationStatus = [];
  integrationRawKeys.clear();
  integrationSecretTimers.forEach(timer => clearTimeout(timer));
  integrationSecretTimers.clear();
  pendingLeadImportRows = [];
  pendingLeadStatusUpdates.clear(); pendingLeadNoteUpdates.clear(); leadStatusWriteTimes.clear();
  authoritativeLeadGenerations.clear(); locallyExpiredAssignments.clear(); expandedProjectStatusIds.clear();
  selectedContactId = selectedAgentId = editingAgentId = selectedAppointmentLeadId = reschedulingAppointmentId = editingAppointmentId = null;
  selectedPerformanceAgentId = "";
  latestAdminReminder = null;
  clearTimeout(remoteReloadTimer);
  remoteRealtimeChannels.forEach(channel => remoteDatabaseClient.removeChannel(channel));
  remoteRealtimeChannels = [];
  document.querySelectorAll(".modal.open").forEach(closeModal);
  state = { ...structuredClone(defaultState), integration, currentUserId: current?.id, agents: current ? [current] : [], leads: [], projects: [], appointments: [], activities: [], bulletins: [], followUpDue: [] };
  // Remove old rows and dropdown choices before fetching the next brand.
  for (const id of ["performance-rows", "performance-cards", "performance-weeks", "integration-connectors"]) document.getElementById(id)?.replaceChildren();
  for (const id of ["lead-status-filter", "lead-agent-filter", "lead-period-filter", "follow-up-agent-filter", "follow-up-period-filter", "appointment-agent-filter", "appointment-period-filter", "performance-project", "performance-agent"]) {
    const select=document.getElementById(id); if(select) select.value="";
  }
  renderAll();
}

async function changeMasterBrand(id) {
  if (!isMaster() || id === activeBrandId) return;
  if (globalLoadingCount || pendingBrandRequestCount || syncInProgress) { renderUser(); showToast("Tunggu sebentar", "Operasi semasa masih berjalan.", "error"); return; }
  const brand = masterBrands.find(b => b.id === id && b.active);
  if (!brand) return;
  clearBrandOperationalState();
  activeBrandId = brand.id; activeBrand = brand;
  sessionStorage.setItem(`leadlaju-master-brand:${state.currentUserId}`, id);
  setGlobalLoading(true, "Menukar brand...");
  try {
    if (!await loadRemoteState(state.currentUserId)) throw new Error("Data brand belum dapat dimuatkan.");
    await subscribeToRemoteDatabase();
    switchView("dashboard", { historyMode: "replace" });
    renderAll();
    await Promise.all([loadBulletinFeed(),loadFollowUpDueFeed()]); renderAll();
  } catch (e) { switchView("brands", { historyMode: "replace" }); showToast("Brand belum dimuatkan", e.message, "error"); }
  finally { setGlobalLoading(false); }
}

async function masterOperation(operation) {
  if (!isMaster() || !remoteDatabaseClient) return;
  setGlobalLoading(true,"Menyimpan perubahan...");
  try { await operation(); await loadMasterManagement(); }
  catch(e) { showToast("Perubahan tidak disimpan", e?.message || "Cuba lagi.", "error"); }
  finally { setGlobalLoading(false); }
}

document.querySelector("#master-brand-switcher").addEventListener("change",event=>changeMasterBrand(event.target.value));
document.querySelector("#master-brand-form").addEventListener("submit",event=>{
  event.preventDefault(); const form=event.currentTarget; const fields=new FormData(form);
  masterOperation(async()=>{const result=await remoteDatabaseClient.rpc("master_manage_brand",{p_action:"create",p_brand:{name:fields.get("name"),slug:fields.get("slug"),distribution_mode:fields.get("distribution_mode")}});if(result.error)throw result.error;form.reset();});
});
document.querySelector("#master-admin-form").addEventListener("submit",event=>{
  event.preventDefault(); const form=event.currentTarget; const fields=Object.fromEntries(new FormData(form));
  masterOperation(async()=>{const result=await remoteDatabaseClient.functions.invoke("master-manage-account",{body:{action:"create_admin",...fields}});if(result.error||!result.data?.ok)throw result.error||new Error(result.data?.error);form.reset();showToast("Jemputan dihantar","Admin boleh menetapkan kata laluan melalui emel.","success");});
});
document.querySelector("#master-admin-list").addEventListener("submit",event=>{
  event.preventDefault(); const form=event.target.closest("[data-master-admin]"); if(!form)return;
  masterOperation(async()=>{const result=await remoteDatabaseClient.functions.invoke("master-manage-account",{body:{action:"update_admin",userId:form.dataset.masterAdmin,...Object.fromEntries(new FormData(form)),active:form.elements.active.checked}});if(result.error||!result.data?.ok)throw result.error||new Error(result.data?.error);});
});
document.querySelector("#master-admin-list").addEventListener("click",event=>{
  const button=event.target.closest("[data-master-reset]");if(!button)return;
  masterOperation(async()=>{const result=await remoteDatabaseClient.functions.invoke("master-manage-account",{body:{action:"reset_admin_password",userId:button.dataset.masterReset}});if(result.error||!result.data?.ok)throw result.error||new Error(result.data?.error);showToast("Emel dihantar","Pautan reset dihantar kepada Admin.","success");});
});
document.querySelector("#master-brand-list").addEventListener("click",async event=>{
  if(!isMaster())return;const button=event.target.closest("button");if(!button)return;
  if(button.dataset.masterOpen){await changeMasterBrand(button.dataset.masterOpen);return;}
  if(button.dataset.masterCopy){const brand=masterBrands.find(b=>b.id===button.dataset.masterCopy);await copyIntegrationText(agentRegistrationUrl(brand),`Link daftar agent · ${brand.name}`);return;}
  if(button.dataset.masterRename){const brand=masterBrands.find(b=>b.id===button.dataset.masterRename);const name=window.prompt("Nama brand",brand.name);if(name?.trim())masterOperation(async()=>{const result=await remoteDatabaseClient.rpc("master_manage_brand",{p_action:"update",p_brand:{id:brand.id,name:name.trim()}});if(result.error)throw result.error;if(activeBrandId===brand.id)activeBrand={...activeBrand,name:name.trim()};});return;}
  if(button.dataset.masterToggle){
    pendingBrandConfirmation={brand:masterBrands.find(b=>b.id===button.dataset.masterToggle),step:1};
    const sales=pendingBrandConfirmation.brand.distribution_mode === "team_sales";
    document.querySelector("#brand-confirm-message").textContent=pendingBrandConfirmation.brand.active
      ? `Semua Admin dan ${sales ? "Team Sales" : "Ejen"} brand ini hilang akses. Ingestion, agihan dan push baharu dihentikan. Data tidak dipadam.`
      : sales ? "Akses brand dibuka semula. Agihan automatik diteruskan kepada Team Sales aktif dan layak." : "Akses brand dibuka semula. Ejen perlu mengaktifkan GET LEAD semula.";
    document.querySelector("#brand-confirm-next").textContent="Teruskan";document.querySelector("#brand-confirm-dialog").showModal();
  }
});
document.querySelector("#brand-confirm-cancel").addEventListener("click",()=>{pendingBrandConfirmation=null;document.querySelector("#brand-confirm-dialog").close();});
document.querySelector("#brand-confirm-next").addEventListener("click",()=>{
  if(!pendingBrandConfirmation)return; const {brand,step}=pendingBrandConfirmation;
  if(step===1){pendingBrandConfirmation.step=2;document.querySelector("#brand-confirm-message").textContent=`Pengesahan terakhir: ${brand.active?"nyahaktifkan":"aktifkan semula"} ${brand.name}?`;document.querySelector("#brand-confirm-next").textContent="Sahkan perubahan";return;}
  pendingBrandConfirmation=null;document.querySelector("#brand-confirm-dialog").close();
  masterOperation(async()=>{const result=await remoteDatabaseClient.rpc("master_manage_brand",{p_action:"set_active",p_brand:{id:brand.id,active:!brand.active,confirmation:brand.id}});if(result.error)throw result.error;
    if(brand.id===activeBrandId&&brand.active){clearBrandOperationalState();activeBrandId="";activeBrand=null;switchView("brands",{historyMode:"replace"});}
  });
});

function populatePerformanceFilters() {
  if (!isAdmin()) return;
  const project = elements.performanceProject.value;
  const agent = elements.performanceAgent.value;
  elements.performanceProject.innerHTML = `<option value="">${systemWorkerText("Semua projek")}</option>` + state.projects
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  elements.performanceAgent.innerHTML = '<option value="">Semua ejen</option>' + state.agents
    .filter((item) => item.role === "agent" && item.approvalStatus !== "rejected")
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  elements.performanceProject.value = project;
  elements.performanceAgent.value = agent;
  updateWorkerLabels();
}

function renderPerformanceReport() {
  if (!isAdmin() || !performanceReport) return;
  const rows = performanceReport.rows || [];
  elements.performanceStatus.textContent = `${performanceReport.from} hingga ${performanceReport.to} · ${rows.length} ${isTeamSales() ? "Team Sales" : "ejen"} · Data semasa ${formatDateTime(new Date(performanceReport.generated_at).getTime())}`;
  elements.performanceDownload.disabled = false;
  elements.performanceRows.innerHTML = rows.length ? rows.map((row) => `<tr>
    <td><button type="button" class="performance-agent-link" data-performance-agent="${escapeHtml(row.agent_id)}">${escapeHtml(row.agent_name)}</button></td>
    <td>${Number(row.assignments) || 0}</td>
    <td>${Number(row.total_contacted) || 0}</td><td>${Number(row.total_follow_up) || 0}</td>
    <td>${Number(row.total_potential) || 0}</td><td>${Number(row.total_cancelled_rejected) || 0}</td><td>${Number(row.total_client) || 0}</td>
    ${isTeamSales() ? "" : `<td>${performanceRateLabel(row)} <small>(${Number(row.within_five) || 0}/${Number(row.assignments) || 0})</small></td>`}
    <td>${Number(row.appointments) || 0}</td><td>${Number(row.show_ups) || 0}</td><td>${Number(row.due_now) || 0}</td>
  </tr>`).join("") : `<tr><td colspan="11">${systemWorkerText("Tiada ejen untuk penapis ini.")}</td></tr>`;
  const cardMetric = (label, value) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
  const cardSummary = (name, meta) => `<summary><span class="performance-card-name">${escapeHtml(name)}</span><span class="performance-card-summary">${escapeHtml(meta)}</span><span class="performance-card-toggle"><span class="when-closed">Butiran</span><span class="when-open">Tutup</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></summary>`;
  elements.performanceCards.innerHTML = rows.length ? rows.map((row) => `<details class="performance-card">
    ${cardSummary(row.agent_name, `${Number(row.assignments) || 0} lead · ${Number(row.due_now) || 0} due`)}
    <div class="performance-card-content">
    <div class="performance-card-grid">${cardMetric("Total Contacted", Number(row.total_contacted) || 0)}${cardMetric("Total Follow Up", Number(row.total_follow_up) || 0)}${cardMetric("Total Potential", Number(row.total_potential) || 0)}${cardMetric("Total Cancelled & Rejected", Number(row.total_cancelled_rejected) || 0)}${cardMetric("Total Client", Number(row.total_client) || 0)}${isTeamSales() ? "" : cardMetric("CALL NOW ≤5 min", performanceRateLabel(row))}${cardMetric("Appointment", Number(row.appointments) || 0)}${cardMetric("Show Up", Number(row.show_ups) || 0)}</div>
    <button type="button" class="performance-agent-link" data-performance-agent="${escapeHtml(row.agent_id)}">Lihat trend mingguan</button>
    </div>
  </details>`).join("") : `<p>Tiada ${workerLabel()} untuk penapis ini.</p>`;
  const selected = rows.find((row) => row.agent_id === selectedPerformanceAgentId);
  elements.performanceDetail.hidden = !selected;
  if (!selected) return;
  elements.performanceDetailTitle.textContent = selected.agent_name;
  const weeks = (performanceReport.weeks || []).filter((item) => item.agent_id === selected.agent_id);
  elements.performanceWeeks.innerHTML = weeks.length
    ? `<div class="performance-table-wrap"><table class="performance-table"><thead><tr><th>Minggu bermula</th><th>Lead ditugaskan</th><th>Total Contacted</th><th>Total Follow Up</th><th>Total Potential</th><th>Total Cancelled &amp; Rejected</th><th>Total Client</th>${isTeamSales() ? "" : "<th>CALL NOW ≤5 min</th>"}<th>Appointment</th><th>Show Up</th></tr></thead><tbody>${weeks.map((week) => `<tr><td>${escapeHtml(week.week_start)}</td><td>${week.assignments}</td><td>${week.total_contacted || 0}</td><td>${week.total_follow_up || 0}</td><td>${week.total_potential || 0}</td><td>${week.total_cancelled_rejected || 0}</td><td>${week.total_client || 0}</td>${isTeamSales() ? "" : `<td>${performanceRateLabel(week)} (${week.within_five}/${week.assignments})</td>`}<td>${week.appointments}</td><td>${week.show_ups}</td></tr>`).join("")}</tbody></table></div>`
    : '<p>Tiada aktiviti dalam tempoh ini.</p>';
  if (weeks.length) elements.performanceWeeks.innerHTML += `<div class="performance-week-cards">${weeks.map((week) => `<details class="performance-card">${cardSummary(week.week_start, `${Number(week.assignments) || 0} lead`)}<div class="performance-card-content"><div class="performance-card-grid">${cardMetric("Total Contacted", Number(week.total_contacted) || 0)}${cardMetric("Total Follow Up", Number(week.total_follow_up) || 0)}${cardMetric("Total Potential", Number(week.total_potential) || 0)}${cardMetric("Total Cancelled & Rejected", Number(week.total_cancelled_rejected) || 0)}${cardMetric("Total Client", Number(week.total_client) || 0)}${isTeamSales() ? "" : cardMetric("CALL NOW ≤5 min", performanceRateLabel(week))}${cardMetric("Appointment", Number(week.appointments) || 0)}${cardMetric("Show Up", Number(week.show_ups) || 0)}</div></div></details>`).join("")}</div>`;
}

async function loadPerformanceReport() {
  if (!isAdmin() || !elements.performanceStatus) return;
  const range = performanceRange();
  if (!range) {
    performanceReport = null;
    elements.performanceStatus.textContent = "Pilih julat tarikh yang sah, maksimum 366 hari.";
    elements.performanceDownload.disabled = true;
    elements.performanceRows.innerHTML = "";
    elements.performanceCards.innerHTML = "";
    elements.performanceDetail.hidden = true;
    return;
  }
  if (!remoteDatabaseMode || !remoteDatabaseClient) {
    elements.performanceStatus.textContent = "Laporan memerlukan sambungan Supabase.";
    return;
  }
  const requestVersion = ++performanceRequestVersion;
  performanceReport = null;
  elements.performanceDownload.disabled = true;
  elements.performanceStatus.textContent = "Memuatkan laporan...";
  try {
    const { data, error } = await remoteDatabaseClient.rpc("get_agent_performance_report", {
      p_from: range.from, p_to: range.to,
      p_project_id: elements.performanceProject.value || null,
      p_agent_id: elements.performanceAgent.value || null,
    });
    if (error) throw error;
    if (requestVersion !== performanceRequestVersion || !isAdmin()) return;
    performanceReport = data;
    performanceLoadedAt = Date.now();
    renderPerformanceReport();
  } catch (error) {
    if (requestVersion !== performanceRequestVersion) return;
    console.error("Performance report load failed", error);
    elements.performanceStatus.textContent = "Laporan gagal dimuatkan. Cuba semula.";
    elements.performanceRows.innerHTML = "";
    elements.performanceCards.innerHTML = "";
  }
}

async function downloadPerformanceReport() {
  if (!isAdmin() || !performanceReport || !window.ExcelJS) return;
  const report = performanceReport;
  const workbook = new window.ExcelJS.Workbook();
  const summary = workbook.addWorksheet(`Ringkasan ${workerLabel()}`);
  const trend = workbook.addWorksheet("Trend Mingguan");
  const safeName = (value) => /^[=+@-]/.test(String(value || "")) ? `'${value}` : String(value || "");
  summary.addRow([`Prestasi ${workerLabel()} Lead Laju`, `${report.from} hingga ${report.to}`]);
  summary.addRow([projectLabel(), elements.performanceProject.selectedOptions[0]?.textContent || systemWorkerText("Semua projek"), workerLabel(), elements.performanceAgent.selectedOptions[0]?.textContent || `Semua ${workerLabel()}`]);
  summary.addRow([workerLabel(), "Lead ditugaskan", "Total Contacted", "Total Follow Up", "Total Potential", "Total Cancelled & Rejected", "Total Client", ...(isTeamSales() ? [] : ["CALL NOW ≤5 min", "Kadar ≤5 min"]), "Appointment", "Show Up", "Follow Up Due sekarang"]);
  (report.rows || []).forEach((row) => summary.addRow([safeName(row.agent_name), row.assignments, row.total_contacted, row.total_follow_up, row.total_potential, row.total_cancelled_rejected, row.total_client, ...(isTeamSales() ? [] : [row.within_five, performanceRate(row)]), row.appointments, row.show_ups, row.due_now]));
  trend.addRow(["Minggu bermula", workerLabel(), "Lead ditugaskan", "Total Contacted", "Total Follow Up", "Total Potential", "Total Cancelled & Rejected", "Total Client", ...(isTeamSales() ? [] : ["CALL NOW ≤5 min", "Kadar ≤5 min"]), "Appointment", "Show Up"]);
  (report.weeks || []).forEach((week) => {
    const agent = (report.rows || []).find((row) => row.agent_id === week.agent_id);
    trend.addRow([new Date(`${week.week_start}T00:00:00Z`), safeName(agent?.agent_name || ""), week.assignments, week.total_contacted, week.total_follow_up, week.total_potential, week.total_cancelled_rejected, week.total_client, ...(isTeamSales() ? [] : [week.within_five, performanceRate(week)]), week.appointments, week.show_ups]);
  });
  summary.getRow(3).font = { bold: true };
  trend.getRow(1).font = { bold: true };
  if (!isTeamSales()) { summary.getColumn(9).numFmt = "0.0%"; trend.getColumn(10).numFmt = "0.0%"; }
  trend.getColumn(1).numFmt = "dd/mm/yyyy";
  [summary, trend].forEach((sheet) => sheet.columns.forEach((column) => { column.width = 22; }));
  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `leadlaju-prestasi-${isTeamSales() ? "team-sales" : "ejen"}-${report.from}-${report.to}.xlsx`);
}

function renderAll() {
  refreshSalesNewMetric();
  document.querySelector("#lead-import-column-hint").textContent = `Isi name, phone, email, city dan ${isTeamSales() ? "product" : "project"}. Maklumat lain diisi automatik oleh sistem.`;
  enforceSingleActiveLead();
  syncExpiryAssignmentTimer();
  renderUser();
  renderAdminReminderAlert();
  renderActiveLead();
  renderStats();
  renderActivities();
  renderTeam();
  renderLeadsTable();
  renderAppointments();
  renderAgents();
  renderProjects();
  renderIntegrationProjects();
  renderBulletins();
  renderFollowUpDue();
  if (activeView === "performance" && isAdmin()) populatePerformanceFilters();
  renderLeadMonitor();
  updateLifecycleMutationGate();
  syncMobileNavigation();
  updateWorkerLabels();
  if (remoteDatabaseMode && activeView === "dashboard" && !isAdmin() && Date.now() - ownPerformanceLoadedAt > 300000) loadOwnPerformance();
  if (remoteDatabaseMode && activeView === "dashboard" && isAdmin() && isTeamSales()) loadTeamPerformance();
  if (remoteDatabaseMode && activeView === "performance" && isAdmin() && performanceReport && Date.now() - performanceLoadedAt > 300000) loadPerformanceReport();
}

const viewTitles = {
  brands: "Pengurusan Brand",
  leads: "Log Lead",
  appointments: "Appointment Tracker",
  "follow-up-due": "Follow Up",
  agents: "Pengurusan Ejen",
  performance: "Prestasi Ejen",
  projects: "Projek",
  "lead-monitor": "Monitor Pergerakan Lead",
  "import-leads": "Import Lead",
  integrations: "Integration",
  bulletins: "Buletin News",
};

const primaryMobileViews = new Set(["dashboard", "leads", "follow-up-due", "appointments"]);

function syncMobileNavigation() {
  const counts = {
    leads: elements.navLeadCount,
    "follow-up-due": elements.navFollowUpCount,
    appointments: elements.navAppointmentCount,
  };
  document.querySelectorAll("[data-mobile-badge]").forEach((badge) => {
    const source = counts[badge.dataset.mobileBadge];
    badge.textContent = source?.textContent || "";
    badge.hidden = !source || source.hidden || !Number(source.textContent);
  });
  const needsAttention = [elements.navBulletinCount, elements.navMonitorCount]
    .some((badge) => badge && !badge.hidden && Number(badge.textContent) > 0);
  document.querySelector("#mobile-more-dot").hidden = !needsAttention;
  document.querySelectorAll(".mobile-tab[data-view]").forEach((tab) => {
    const selected = tab.dataset.view === activeView;
    tab.classList.toggle("active", selected);
    if (selected) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  const moreSelected = !primaryMobileViews.has(activeView);
  elements.mobileMoreTab.classList.toggle("active", moreSelected);
  if (moreSelected) elements.mobileMoreTab.setAttribute("aria-current", "page");
  else elements.mobileMoreTab.removeAttribute("aria-current");
}

function switchView(viewName, { historyMode = "push" } = {}) {
  const targetView = document.getElementById(`${viewName}-view`);
  if (!targetView) return;
  if (viewName === "brands" && !isMaster()) return;
  if (["agents", "performance", "projects", "lead-monitor", "import-leads", "integrations"].includes(viewName) && !isAdmin()) return;
  const changed = activeView !== viewName;
  if (changed && document.body.classList.contains("authenticated") && historyMode !== "none") {
    window.history[historyMode === "replace" ? "replaceState" : "pushState"](
      { ...window.history.state, leadLajuView: viewName }, "", window.location.href,
    );
  } else if (historyMode === "replace" && document.body.classList.contains("authenticated")) {
    window.history.replaceState({ ...window.history.state, leadLajuView: viewName }, "", window.location.href);
  }
  if (!changed && historyMode !== "replace") {
    setMobileSidebarOpen(false);
    return;
  }
  activeView = viewName;
  if (viewName === "follow-up-due") { followUpSection = pendingFollowUpSection === "new" ? "new" : "due"; pendingFollowUpSection = null; renderFollowUpDue(); }
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  targetView.classList.add("active");
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  syncMobileNavigation();
  elements.todayLabel.textContent =
    viewName === "dashboard"
      ? new Intl.DateTimeFormat("ms-MY", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date())
      : "LeadLaju";
  renderUser();
  if (viewName === "performance") {
    populatePerformanceFilters();
    if (!performanceReport || Date.now() - performanceLoadedAt > 300000) loadPerformanceReport();
  }
  if (viewName === "lead-monitor") renderLeadMonitor();
  if (viewName === "dashboard" && !isAdmin() && Date.now() - ownPerformanceLoadedAt > 300000) loadOwnPerformance();
  if (viewName === "dashboard" && isAdmin() && isTeamSales()) loadTeamPerformance();
  if (viewName === "integrations") loadIntegrationStatus();
  if (viewName === "brands") loadMasterManagement();
  if (viewName === "bulletins") {
    openRequestedBulletin();
    const latest = state.bulletins.find((bulletin) => bulletin.status === "published");
    if (latest) markBulletinRead(latest.id).catch(() => false);
  }
  if (viewName === "follow-up-due" && Date.now() - state.followUpLoadedAt > 30000) {
    loadFollowUpDueFeed().then(renderFollowUpDue).catch((error) => console.warn("Follow-up feed failed", error));
  }
  setMobileSidebarOpen(false);
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function openAgentModal(agentId = null) {
  const agent = agentId ? getAgent(agentId) : null;
  editingAgentId = agent?.id || null;
  elements.agentForm.reset();
  elements.agentModalKicker.textContent = agent ? "Kemaskini ahli pasukan" : "Ahli pasukan baru";
  elements.agentModalTitle.textContent = `${agent ? "Edit" : "Daftar"} ${workerLabel()}`;
  elements.agentPasswordLabel.textContent = agent ? "Kata laluan baru (optional)" : "Kata laluan sementara";
  elements.agentPassword.required = !agent;
  elements.agentPassword.placeholder = agent ? "Biarkan kosong jika tidak mahu tukar" : "Minimum 8 aksara";
  elements.agentSubmitButton.textContent = agent ? "Simpan perubahan" : systemWorkerText("Daftar ejen");
  const selectedProjectIds = new Set(normalizeProjectIds(agent?.eligibleProjectIds));
  const activeProjects = state.projects.filter((project) => project.active);
  elements.agentProjectCheckboxes.innerHTML = activeProjects.length
    ? activeProjects.map((project) => `
      <label class="project-checkbox">
        <input type="checkbox" name="agent-project" value="${project.id}" ${selectedProjectIds.has(project.id) ? "checked" : ""} />
        <span>${escapeHtml(project.name)}</span>
      </label>`).join("")
    : `<p class="field-error">${systemWorkerText("Tambah projek aktif dahulu.")}</p>`;
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
  if (!guardLifecycleMutation()) return false;
  const name = elements.agentName.value.trim();
  const phone = elements.agentPhone.value.trim();
  const email = elements.agentEmail.value.trim();
  const password = elements.agentPassword.value;
  const eligibleProjectIds = [...elements.agentProjectCheckboxes.querySelectorAll('input[name="agent-project"]:checked')]
    .map((input) => input.value);
  const editingAgent = editingAgentId ? getAgent(editingAgentId) : null;
  if (!name || !phone || !email) return;
  if (!editingAgent && password.length < 8) return;
  if (!eligibleProjectIds.length) {
    showToast("Pilih projek", systemWorkerText("Pilih sekurang-kurangnya satu projek untuk ejen ini."), "error");
    return;
  }
  if (editingAgent && password && password.length < 8) {
    showToast("Password terlalu pendek", "Kata laluan mesti sekurang-kurangnya 8 aksara.", "error");
    return;
  }
  if (
    state.agents.some(
      (agent) => agent.id !== editingAgentId && agent.email.toLowerCase() === email.toLowerCase(),
    )
  ) {
    showToast("Emel telah digunakan", systemWorkerText("Gunakan alamat emel lain untuk ejen ini."), "error");
    return;
  }

  if (remoteDatabaseMode) {
    setGlobalLoading(true, systemWorkerText(editingAgent ? "Mengemas kini ejen..." : "Mendaftarkan ejen..."));
    try {
      if (editingAgent) {
        const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
          body: {
            action: "update_details",
            userId: editingAgent.id,
            name,
            phone,
            email: email.toLowerCase(),
            active: editingAgent.active,
            eligible_project_ids: eligibleProjectIds,
          },
        });
        if (error || !data?.ok) throw error || new Error(data?.error || "Ejen gagal dikemas kini.");
        if (password) {
          const passwordResult = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
            body: { action: "update_password", userId: editingAgent.id, password },
          });
          if (passwordResult.error || !passwordResult.data?.ok) {
            throw passwordResult.error || new Error(passwordResult.data?.error || "Kata laluan gagal dikemas kini.");
          }
        }
      } else {
        const signup = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
          body: { action: "signup_request", brand_slug: activeBrand?.slug || "safrich", name, phone, email: email.toLowerCase(), password, eligible_project_ids: eligibleProjectIds },
        });
        if (signup.error || !signup.data?.ok) throw signup.error || new Error(signup.data?.error || "Ejen gagal didaftarkan.");
      }
      await loadRemoteState(state.currentUserId);
      elements.agentForm.reset();
      editingAgentId = null;
      closeModal(elements.agentModal);
      renderAll();
      showToast(
        editingAgent ? "Ejen dikemaskini" : "Permohonan dihantar",
        editingAgent ? `${name} telah disimpan dalam Supabase.` : `${name} sedang menunggu approval admin.`,
        "success",
      );
      return true;
    } catch (error) {
      showToast("Ejen tidak disimpan", error?.message || "Semak sambungan Supabase.", "error");
      return false;
    } finally {
      setGlobalLoading(false);
    }
  }

  if (editingAgent) {
    editingAgent.name = name;
    editingAgent.phone = phone;
    editingAgent.email = email.toLowerCase();
    if (password) editingAgent.password = password;
    editingAgent.eligibleProjectIds = eligibleProjectIds;
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
      eligibleProjectIds,
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
      ? `${name} kini diselaraskan dalam dashboard dan Supabase.`
      : "Supabase belum dapat dikemas kini. Cuba lagi.",
    agentsPushed ? "success" : "error",
  );
  renderAll();
}

async function approveAgent(agentId) {
  if (!guardLifecycleMutation()) return false;
  const agent = getAgent(agentId);
  if (!agent || agent.approvalStatus !== "pending" || pendingAgentApprovals.has(agentId)) return;
  if (!normalizeProjectIds(agent.eligibleProjectIds).length) {
    showToast("Pilih projek dahulu", `Edit ${agent.name} ${systemWorkerText("dan tick sekurang-kurangnya satu projek sebelum approve.")}`, "error");
    openAgentModal(agentId);
    return;
  }
  const approveButton = [...elements.agentsGrid.querySelectorAll("[data-agent-approve]")]
    .find((button) => button.dataset.agentApprove === agentId);
  pendingAgentApprovals.add(agentId);
  if (approveButton) {
    approveButton.disabled = true;
    approveButton.classList.add("is-loading");
    approveButton.setAttribute("aria-busy", "true");
  }
  setGlobalLoading(true, `Sedang approve ${agent.name}...`);
  try {
    await waitForCurrentSync();
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
        body: { action: "approve", userId: agentId },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || "Akaun ejen tidak dapat diapprove.");
      }
      await loadRemoteState(state.currentUserId);
    } else {
      const result = await submitAgentSignupToSheet({ ...agent, active: true }, { approve: true });
      if (!result?.ok || !isAgentExplicitlyActive(result.agent?.active)) {
        throw new Error(result?.error || "Status aktif ejen belum disahkan oleh server.");
      }
    }
    const approvedAgent = getAgent(agentId) || agent;
    approvedAgent.active = true;
    saveState();
    if (remoteDatabaseMode) await loadRemoteState(state.currentUserId);
    else await syncGoogleSheetFresh({ silent: true, agentsOnly: true });
    const confirmedAgent = getAgent(agentId) || approvedAgent;
    confirmedAgent.active = true;
    saveState();
    renderAll();
    showToast("Ejen approved", `${confirmedAgent.name} kini aktif dan dipaparkan dalam dashboard.`, "success");
  } catch (error) {
    // An Edge Function can return a generic non-2xx error even when its body
    // says that a stale pending card no longer has a canonical profile. Reload
    // before retaining that card in the admin dashboard.
    let canonicalReloaded = false;
    if (remoteDatabaseMode) {
      canonicalReloaded = await loadRemoteState(state.currentUserId);
    }
    const isMissingCanonicalAgent = remoteDatabaseMode && canonicalReloaded && !getAgent(agentId);
    if (isMissingCanonicalAgent) {
      authoritativelyDeletedAgentIds.add(agentId);
      state.agents = state.agents.filter((item) => item.id !== agentId);
      saveState();
    }
    const currentAgent = getAgent(agentId);
    if (currentAgent) currentAgent.active = false;
    saveState();
    console.error(error);
    showToast(
      isMissingCanonicalAgent ? "Kad ejen dikemas kini" : "Approval gagal",
      isMissingCanonicalAgent ? "Ejen ini sudah tiada dalam Supabase dan telah dibuang daripada dashboard." : (error.message || "Semak sambungan Supabase."),
      isMissingCanonicalAgent ? "success" : "error",
    );
    renderAll();
  } finally {
    pendingAgentApprovals.delete(agentId);
    setGlobalLoading(false);
    const currentButton = [...elements.agentsGrid.querySelectorAll("[data-agent-approve]")]
      .find((button) => button.dataset.agentApprove === agentId);
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.classList.remove("is-loading");
      currentButton.removeAttribute("aria-busy");
    }
  }
}

async function saveProject(project) {
  if (remoteDatabaseMode) {
    const { data, error } = await remoteDatabaseClient.rpc("admin_upsert_project", {
      p_project: {
        id: project.id,
        name: project.name,
        active: project.active,
        created_at: new Date(project.createdAt || Date.now()).toISOString(),
      },
    });
    if (error || !data?.ok) return false;
    if (data.project?.id) project.id = data.project.id;
    return true;
  }
  return postGoogleSheetAction(
    { action: project.id ? "update_project" : "add_project", project },
    "Project sheet sync failed",
    { waitForSend: true },
  );
}

async function addProject(event) {
  event.preventDefault();
  if (!guardLifecycleMutation()) return false;
  if (!isAdmin()) return;
  const name = elements.projectName.value.trim().replace(/\s+/g, " ");
  if (!name) return;
  if (state.projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
    showToast("Projek sudah ada", systemWorkerText("Gunakan nama projek lain."), "error");
    return;
  }
  // Supabase generates UUID project IDs; the local ID format is not a UUID.
  const project = { id: remoteDatabaseMode ? null : makeId("project"), name, active: true, createdAt: Date.now() };
  if (!await saveProject(project)) {
    showToast("Projek tidak disimpan", "Semak sambungan Supabase.", "error");
    return;
  }
  state.projects.push(project);
  elements.projectForm.reset();
  saveState();
  renderAll();
  showToast("Projek ditambah", `${name} ${systemWorkerText("kini boleh dipilih untuk ejen.")}`);
}

async function toggleProject(projectId) {
  if (!guardLifecycleMutation()) return false;
  if (!isAdmin()) return;
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  const previous = project.active;
  project.active = !project.active;
  if (!await saveProject(project)) {
    project.active = previous;
    showToast("Status projek gagal", "Semak sambungan Supabase.", "error");
    return;
  }
  saveState();
  renderAll();
  showToast(project.active ? "Projek diaktifkan" : "Projek dinyahaktifkan", project.active ? `${project.name} menerima lead baharu.` : `${project.name} tidak menerima assignment baharu.`);
}

async function deleteProject(projectId, button) {
  if (!guardLifecycleMutation() || !isAdmin()) return;
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || !remoteDatabaseMode) return;
  if (!confirmPermanentDelete(systemWorkerText("projek"), project.name)) return;

  button.disabled = true;
  const finishFeedback = beginButtonFeedback(button);
  try {
    const { data, error } = await remoteDatabaseClient.rpc("admin_delete_project", { p_project_id: projectId });
    if (error) throw error;
    if (!data?.ok) {
      const reasons = {
        has_leads: systemWorkerText("Projek ini masih mempunyai lead. Nyahaktifkan projek jika tidak mahu menerima lead baharu."),
        has_bulletins: systemWorkerText("Projek ini masih digunakan oleh buletin. Alihkan atau arkibkan buletin dahulu."),
        has_agents: systemWorkerText("Projek ini masih dipautkan kepada ejen. Buang projek daripada ejen dahulu."),
        not_found: systemWorkerText("Projek ini sudah tiada. Muat semula senarai projek."),
      };
      showToast("Projek tidak dipadam", reasons[data?.code] || systemWorkerText("Cuba lagi selepas menyemak pautan projek."), "error");
      return;
    }
    state.projects = state.projects.filter((item) => item.id !== projectId);
    expandedProjectStatusIds.delete(projectId);
    saveState();
    renderAll();
    showToast("Projek dipadam", `${project.name} telah dibuang.`);
  } catch (error) {
    console.error("Project deletion failed", error);
    showToast("Projek tidak dipadam", "Server belum dapat mengesahkan pemadaman. Cuba lagi.", "error");
  } finally {
    finishFeedback();
    button.disabled = false;
  }
}

async function rejectAgent(agentId) {
  const agent = getAgent(agentId);
  if (!agent || agent.active) return;
  await deleteAgentWithLoading(agent, { rejection: true });
}

async function deleteAgentWithLoading(agent, options = {}) {
  if (!guardLifecycleMutation()) return false;
  if (!agent || pendingAgentDeletions.has(agent.id)) return false;
  const rejectButton = [...elements.agentsGrid.querySelectorAll("[data-agent-reject]")]
    .find((button) => button.dataset.agentReject === agent.id);
  const removeButton = [...elements.agentsGrid.querySelectorAll("[data-agent-remove]")]
    .find((button) => button.dataset.agentRemove === agent.id);
  const actionButton = rejectButton || removeButton;
  pendingAgentDeletions.add(agent.id);
  if (actionButton) {
    actionButton.disabled = true;
    actionButton.classList.add("is-loading");
    actionButton.setAttribute("aria-busy", "true");
  }
  setGlobalLoading(true, options.rejection ? `Sedang reject ${agent.name}...` : `Sedang memadam ${agent.name}...`);
  try {
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.functions.invoke("admin-manage-agent", {
        body: { action: "delete", userId: agent.id, email: agent.email },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Ejen tidak dapat dibuang.");
    } else {
      const result = await deleteAgentFromSheet(agent);
      if (!result?.ok) {
        throw new Error(result?.error || "Server belum mengesahkan ejen telah dipadam.");
      }
    }
    authoritativelyDeletedAgentIds.add(agent.id);
    state.agents = state.agents.filter((item) => item.id !== agent.id);
    saveState();
    renderAll();
    showToast(
      options.rejection ? "Permohonan ditolak" : "Ejen dibuang",
      remoteDatabaseMode
        ? `${agent.name} telah dipadam daripada dashboard Supabase.`
        : `${agent.name} telah dipadam daripada dashboard dan server.`,
      "success",
    );
    return true;
  } catch (error) {
    console.error(error);
    showToast(options.rejection ? "Reject gagal" : "Ejen tidak dapat dibuang", error.message || "Semak sambungan Supabase.", "error");
    return false;
  } finally {
    pendingAgentDeletions.delete(agent.id);
    setGlobalLoading(false);
  }
}

async function toggleAgent(agentId) {
  if (!guardLifecycleMutation()) return false;
  const agent = getAgent(agentId);
  if (!agent) return;
  agent.active = !agent.active;

  saveState();
  let agentsPushed = false;
  if (remoteDatabaseMode) {
    const { data, error } = await remoteDatabaseClient.rpc("admin_update_agent", {
      p_agent_id: agent.id,
      p_name: agent.name,
      p_phone: agent.phone,
      p_email: agent.email,
      p_active: agent.active,
      p_project_ids: normalizeProjectIds(agent.eligibleProjectIds),
    });
    agentsPushed = !error && Boolean(data?.ok);
    if (agentsPushed) await loadRemoteState(state.currentUserId);
  } else {
    try {
      await persistProfile(agent);
    } catch (error) {
      console.error(error);
    }
    agentsPushed = await upsertAgentToSheet(agent);
    if (agentsPushed) await syncGoogleSheet({ silent: true, notifyNewLeads: true });
  }
  showToast(
    agentsPushed ? (agent.active ? "Ejen diaktifkan" : "Ejen dinyahaktifkan") : "Status ejen belum sync",
    agentsPushed
      ? agent.active
        ? `${agent.name} akan menerima giliran lead.`
        : `${agent.name} dikeluarkan daripada giliran.`
      : "Server belum dapat dikemas kini. Cuba lagi.",
    agentsPushed ? "success" : "error",
  );
  renderAll();
}

async function removeAgent(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return;
  if (!confirmPermanentDelete(systemWorkerText("ejen"), agent.name)) return;
  await deleteAgentWithLoading(agent);
}

function confirmPermanentDelete(itemType, itemName) {
  const firstConfirmed = window.confirm(
    `Padam ${itemType} ${itemName}? Data ini akan dibuang daripada dashboard dan Supabase.`,
  );
  if (!firstConfirmed) return false;
  return window.confirm(
    `Pengesahan terakhir: anda pasti mahu padam ${itemType} ${itemName} secara kekal? Tindakan ini tidak boleh dibatalkan.`,
  );
}

async function forceAgentOffline(agentId) {
  if (!guardLifecycleMutation()) return false;
  if (!isAdmin()) return;
  const agent = getAgent(agentId);
  if (!agent || agent.role !== "agent") return;
  if (!window.confirm(`Paksa ${agent.name} keluar daripada semua sesi aktif?`)) return;
  let forced;
  if (remoteDatabaseMode) {
    const { data, error } = await remoteDatabaseClient.rpc("force_agent_offline", { p_agent_id: agent.id });
    forced = !error && Boolean(data?.ok);
  } else {
    forced = await forceAgentOfflineInSheet(agent);
  }
  if (!forced) {
    showToast("Force offline gagal", "Semak sambungan Supabase dan cuba semula.", "error");
    return;
  }
  agent.online = false;
  agent.notificationEnabled = false;
  saveState();
  renderAll();
  if (remoteDatabaseMode) await loadRemoteState(state.currentUserId);
  else await syncGoogleSheet({ silent: true, agentsOnly: true });
  showToast("Ejen dipaksa offline", `${agent.name} perlu login semula dan aktifkan loceng.`);
}

async function setAdminAgentLeadAvailability(agentId, ready) {
  if (!guardLifecycleMutation() || !isAdmin() || !remoteDatabaseMode) return false;
  const agent = getAgent(agentId);
  if (!agent || agent.role !== "agent") return false;

  const actionLabel = ready ? "masukkan ke giliran GET LEAD" : "keluarkan daripada giliran lead";
  if (!window.confirm(`${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)} untuk ${agent.name}?`)) return false;

  setGlobalLoading(true, ready ? "Memasukkan ejen ke giliran..." : "Menghentikan agihan lead...");
  try {
    const { data, error } = await remoteDatabaseClient.rpc("admin_set_agent_lead_readiness", {
      p_agent_id: agent.id,
      p_ready: ready,
    });
    if (error || !data?.ok) throw error || new Error(data?.error || "Status giliran tidak dapat dikemas kini.");

    await loadRemoteState(state.currentUserId);
    showToast(
      ready ? "GET LEAD diaktifkan" : "STOP LEAD diaktifkan",
      ready ? `${agent.name} kini berada dalam giliran agihan.` : `${agent.name} tidak lagi menerima lead baharu.`,
      "success",
    );
    return true;
  } catch (error) {
    showToast("Status giliran gagal dikemas kini", error?.message || "Cuba lagi.", "error");
    return false;
  } finally {
    setGlobalLoading(false);
  }
}

async function setAdminAllAgentLeadAvailability(ready) {
  if (!guardLifecycleMutation() || !isAdmin() || !remoteDatabaseMode) return false;
  const actionLabel = ready ? "masukkan semua ejen yang mempunyai notifikasi aktif ke giliran GET LEAD" : "hentikan agihan lead untuk semua ejen";
  if (!window.confirm(`${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)}?`)) return false;

  const button = ready ? elements.getLeadAllAgentsButton : elements.stopLeadAllAgentsButton;
  button.disabled = true;
  setGlobalLoading(true, ready ? "Mengaktifkan giliran semua ejen..." : "Menghentikan agihan semua ejen...");
  try {
    const { data, error } = await remoteDatabaseClient.rpc("admin_set_all_agent_lead_readiness", {
      p_ready: ready,
    });
    if (error || !data?.ok) throw error || new Error(data?.error || "Status giliran tidak dapat dikemas kini.");

    await loadRemoteState(state.currentUserId);
    const updated = Number(data.updated || 0);
    showToast(
      ready ? "GET LEAD ALL AGENT diaktifkan" : "STOP LEAD ALL AGENT diaktifkan",
      ready
        ? `${updated} ejen dengan notifikasi aktif dimasukkan ke giliran.`
        : `${updated} ejen dikeluarkan daripada giliran lead.`,
      "success",
    );
    return true;
  } catch (error) {
    showToast("Status giliran semua ejen gagal", error?.message || "Cuba lagi.", "error");
    return false;
  } finally {
    button.disabled = false;
    setGlobalLoading(false);
  }
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
  if (!guardLifecycleMutation()) return false;
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
        data?.error || "Password tidak dapat dikemas kini. Semak sambungan Supabase.";
      return;
    }
  } else {
    agent.password = password;
    saveState();
  }
  if (!remoteDatabaseMode) await upsertAgentToSheet(agent);

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
  elements.contactStatus.innerHTML = renderLeadStatusOptions(getLeadVisualStatus(lead));
  elements.contactStatus.value = getLeadVisualStatus(lead);
  elements.contactNotes.value = lead.notes || "";
  elements.contactFormError.textContent = "";
  elements.contactModal.classList.add("open");
  elements.contactModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.contactName.focus(), 80);
}

async function updateContact(event) {
  event.preventDefault();
  if (!guardLifecycleMutation()) return false;
  const lead = state.leads.find((item) => item.id === selectedContactId);
  if (!lead || !canViewLeadPhone(lead)) {
    elements.contactFormError.textContent = "Lead ini tidak boleh dikemas kini.";
    return;
  }
  const previousLead = { ...lead };
  const nextStatus = normalizeSheetStatus(elements.contactStatus.value);
  lead.name = elements.contactName.value.trim();
  lead.phone = elements.contactPhone.value.trim();
  lead.email = elements.contactEmail.value.trim();
  lead.project = elements.contactProject.value.trim();
  lead.notes = elements.contactNotes.value.trim();
  if (!lead.name || !lead.phone || !lead.project) {
    elements.contactFormError.textContent = systemWorkerText("Nama, nombor telefon dan projek diperlukan.");
    return;
  }
  setGlobalLoading(true, "Menyimpan perubahan lead...");
  try {
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.rpc("admin_update_lead_details", {
        p_lead_id: lead.id,
        p_name: lead.name,
        p_phone: lead.phone,
        p_email: lead.email,
        p_project_name: lead.project,
        p_notes: lead.notes,
      });
      if (error || !data?.ok) throw error || new Error(data?.error || "Lead gagal dikemas kini.");
    } else {
      await persistLead(lead);
      const noteSynced = await updateLeadNotesInSheet(lead, lead.notes);
      if (!noteSynced) throw new Error("Nota tidak dapat disimpan ke server.");
    }
    if (normalizeSheetStatus(previousLead.status) !== nextStatus) {
      const statusSynced = await updateLeadStatusFromLog(lead.id, nextStatus, elements.contactStatus);
      if (!statusSynced) throw new Error("Status tidak dapat disahkan oleh server.");
    }
    if (remoteDatabaseMode) await loadRemoteState(state.currentUserId);
    saveState();
    closeModal(elements.contactModal);
    showToast("Rekod pelanggan disimpan", `${lead.name} telah dikemas kini.`);
    renderAll();
  } catch (error) {
    Object.assign(lead, previousLead);
    console.error(error);
    elements.contactFormError.textContent = "Perubahan tidak dapat disimpan ke dashboard.";
  } finally {
    setGlobalLoading(false);
  }
}

async function saveLeadNote(leadId, button = null) {
  if (!guardLifecycleMutation()) return false;
  const lead = state.leads.find((item) => item.id === leadId);
  const field = [...elements.leadsTableBody.querySelectorAll("[data-lead-note]")].find(
    (item) => item.dataset.leadNote === leadId,
  );
  if (!lead || !field) return;

  const nextNotes = field.value.trim();
  const draftKey = leadNoteDraftKey(leadId);
  const submittedDraft = field.value;
  leadNoteDrafts.set(draftKey, submittedDraft);
  if (nextNotes === String(lead.notes || "").trim()) {
    showToast("Nota tiada perubahan", "Tiada nota baru untuk disimpan.");
    return;
  }

  const previousNotes = lead.notes || "";
  lead.notes = nextNotes;
  const updateToken = Symbol("lead-note-update");
  pendingLeadNoteUpdates.set(leadId, { notes: nextNotes, token: updateToken });
  if (button) {
    button.disabled = true;
    button.textContent = "Menyimpan...";
  }
  setGlobalLoading(true, "Menyimpan nota...");

  try {
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.rpc("update_lead_notes", {
        p_lead_id: lead.id,
        p_notes: nextNotes,
        p_expected_status_revision: Number(lead.statusRevision) || 0,
      });
      if (error || !data?.ok) throw error || new Error(data?.error || "Nota ditolak oleh server.");
    } else {
      const noteSynced = await updateLeadNotesInSheet(lead, nextNotes);
      if (!noteSynced) throw new Error("Nota tidak dapat disimpan ke server.");
    }
    lead.updatedAt = Date.now();
    saveState();
    if (leadNoteDrafts.get(draftKey) === submittedDraft) leadNoteDrafts.delete(draftKey);
    showToast("Nota disimpan", `Nota untuk ${lead.name} telah dikemas kini.`);
  } catch (error) {
    lead.notes = previousNotes;
    console.error(error);
    showToast("Nota gagal disimpan", error?.message || "Semak sambungan Supabase dan cuba lagi.", "error");
  } finally {
    if (pendingLeadNoteUpdates.get(leadId)?.token === updateToken) pendingLeadNoteUpdates.delete(leadId);
    if (button) {
      button.disabled = false;
      button.textContent = "Simpan nota";
    }
    setGlobalLoading(false);
  }
}

async function recordLeadFollowUp(leadId, button) {
  if (!guardLifecycleMutation()) return false;
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead || !canAccessLead(lead) || !canViewLeadPhone(lead)) return false;
  const whatsappUrl = whatsappLeadUrl(lead.phone);
  if (!whatsappUrl || Number(lead.followUpCount) >= 6) return false;
  const previousCount = Number(lead.followUpCount) || 0;
  const previousStatus = lead.status;
  if (remoteDatabaseRequired && !remoteDatabaseMode) {
    showToast("Follow Up belum tersedia", "Sambungan Supabase diperlukan sebelum WhatsApp dibuka.", "error");
    return false;
  }
  button.disabled = true;
  const finishFeedback = beginButtonFeedback(button);
  try {
    if (remoteDatabaseMode) {
      const { data, error } = await remoteDatabaseClient.rpc("record_lead_follow_up", {
        p_lead_id: leadId,
        p_expected_count: previousCount,
      });
      if (error || !data?.ok) throw error || new Error(data?.error || "Follow Up tidak dapat disimpan.");
      lead.followUpCount = Number(data.follow_up_count);
      lead.status = data.status;
      lead.statusRevision = Number(data.status_revision) || lead.statusRevision;
      if (lead.status !== "contacted") state.followUpDue = state.followUpDue.filter((item) => item.id !== leadId);
      queueRemoteReload();
    } else {
      lead.followUpCount = previousCount + 1;
      if (lead.followUpCount === 3) applySheetStatusToLead(lead, "all_offer_presented");
      saveState();
    }
    lead.updatedAt = Date.now();
    saveState();
    renderAll();
    showToast("Follow Up direkod", `${lead.name}: Follow Up ${lead.followUpCount}.`);
    window.location.assign(whatsappUrl);
    return true;
  } catch (error) {
    lead.followUpCount = previousCount;
    lead.status = previousStatus;
    console.error(error);
    showToast("Follow Up gagal", error?.message || "Semak sambungan dan cuba lagi.", "error");
    return false;
  } finally {
    finishFeedback();
    button.disabled = false;
  }
}

async function updateLeadStatusFromLog(leadId, nextStatus, field = null) {
  if (!guardLifecycleMutation()) return false;
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return false;

  const normalizedStatus = normalizeSheetStatus(nextStatus);
  if (getCurrentUser()?.role === "agent" && getLeadVisualStatus(lead) === "new" && normalizedStatus !== "new") {
    if (field) field.value = "new";
    showToast(isTeamSales() ? "Call atau WhatsApp diperlukan" : "CALL NOW diperlukan", isTeamSales() ? "Tekan Call atau WhatsApp sebelum menukar status lead." : "Tekan CALL NOW sebelum menukar status lead.", "error");
    return false;
  }
  if (getCurrentUser()?.role === "agent" && normalizedStatus === "new") {
    if (field) field.value = getLeadVisualStatus(lead);
    showToast(isTeamSales() ? "Status New tidak dibenarkan" : "CALL NOW diperlukan", systemWorkerText("Ejen tidak boleh menukar status lead kembali kepada New."), "error");
    return false;
  }
  if (getLeadVisualStatus(lead) === normalizedStatus) return true;
  if (
    getCurrentUser()?.role === "agent" &&
    AGENT_NOTE_REQUIRED_STATUSES.has(normalizedStatus) &&
    !String(lead.notes || "").trim()
  ) {
    if (field) field.value = getLeadVisualStatus(lead);
    showToast(
      "Simpan nota dahulu",
      `Nota diperlukan sebelum status ditukar kepada ${formatSheetStatus(normalizedStatus)}.`,
      "error",
    );
    return false;
  }
  if (pendingLeadStatusUpdates.has(leadId)) {
    if (field) field.value = pendingLeadStatusUpdates.get(leadId).status;
    showToast("Status sedang disimpan", "Tunggu kemas kini semasa selesai sebelum memilih status lain.");
    return false;
  }

  const previousLead = { ...lead };
  const updateToken = Symbol("lead-status-update");
  pendingLeadStatusUpdates.set(leadId, { status: normalizedStatus, token: updateToken });
  leadStatusWriteTimes.set(leadId, Date.now());
  if (field) {
    field.disabled = true;
    field.classList.add("is-saving");
  }
  setGlobalLoading(true, "Menyimpan status lead...");

  try {
    applySheetStatusToLead(lead, normalizedStatus);
    saveState();
    renderAll();
    if (remoteDatabaseMode) {
      const revisionParams = {
        p_action_id: crypto.randomUUID(),
        p_lead_id: lead.id,
        p_expected_assignment_revision: Number(previousLead.assignmentRevision) || 0,
        p_expected_status_revision: Number(previousLead.statusRevision) || 0,
      };
      const { data, error } = isAdmin() && normalizedStatus === "new"
        ? await remoteDatabaseClient.rpc("admin_reset_lead_to_new", revisionParams)
        : await remoteDatabaseClient.rpc("update_lead_status", {
          ...revisionParams,
          p_status: normalizedStatus,
        });
      if (error || !data?.ok) throw error || new Error(data?.error || "Status ditolak oleh server.");
      lead.assignmentRevision = Number(data.assignment_revision) || lead.assignmentRevision;
      lead.statusRevision = Number(data.status_revision) || lead.statusRevision;
      queueRemoteReload();
    } else {
      await persistLead(lead);
      const statusSynced = await updateLeadStatusInSheet(lead, normalizedStatus);
      if (!statusSynced) throw new Error("Status tidak dapat disimpan ke server.");
    }

    showToast("Status dikemas kini", `${lead.name} kini ${formatSheetStatus(normalizedStatus)}.`);
    return true;
  } catch (error) {
    Object.assign(lead, previousLead);
    saveState();
    renderAll();
    console.error(error);
    showToast("Status gagal disimpan", error?.message || "Semak sambungan Supabase dan cuba lagi.", "error");
    return false;
  } finally {
    leadStatusWriteTimes.set(leadId, Date.now());
    if (pendingLeadStatusUpdates.get(leadId)?.token === updateToken) pendingLeadStatusUpdates.delete(leadId);
    if (field) {
      field.disabled = false;
      field.classList.remove("is-saving");
      field.value = getLeadVisualStatus(lead);
    }
    setGlobalLoading(false);
  }
}

async function deleteLeadEverywhere(leadId) {
  if (!guardLifecycleMutation()) return false;
  if (!isAdmin()) {
    showToast("Admin sahaja", "Hanya admin boleh padam lead daripada dashboard.", "error");
    return;
  }
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return;

  if (!confirmPermanentDelete("lead", lead.name)) return;

  let deletionConfirmed;
  if (remoteDatabaseMode) {
    const { data, error } = await remoteDatabaseClient.rpc("admin_delete_lead", { p_lead_id: lead.id });
    deletionConfirmed = !error && Boolean(data?.ok) && Number(data?.deleted) === 1;
    if (!deletionConfirmed) {
      showToast("Lead tidak dipadam", error?.message || data?.error || "Supabase belum mengesahkan pemadaman.", "error");
      return;
    }
  } else {
    deletionConfirmed = await deleteLeadFromSheet(lead);
  }
  if (!deletionConfirmed) {
    showToast("Lead tidak dipadam", "Server belum mengesahkan pemadaman.", "error");
    return;
  }

  try {
    if (remoteDatabaseMode) {
      state.leads = state.leads.filter((item) => item.id !== lead.id);
      state.activities = state.activities.filter((activity) => activity.leadId !== lead.id);
      saveState();
    } else {
      await deleteLeads([lead.id]);
    }
    if (selectedContactId === lead.id) {
      selectedContactId = null;
      closeModal(elements.contactModal);
    }
    showToast("Lead dipadam", "Supabase dan dashboard telah diselaraskan.");
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Lead tidak dipadam", "Semak sambungan Supabase.", "error");
  }
}

async function syncGoogleSheet(options = {}) {
  if (remoteDatabaseMode) {
    if (syncInProgress) return false;
    syncInProgress = true;
    try {
      const loaded = await loadRemoteState(state.currentUserId);
      if (!loaded) return false;
      renderAll();
      if (
        options.lifecycleSync ||
        (typeof initialDashboardSyncState !== "undefined" && initialDashboardSyncState === "failed")
      ) {
        completeLifecycleAuthoritativeRender();
      }
      return true;
    } finally {
      syncInProgress = false;
      const waiters = syncCompletionWaiters;
      syncCompletionWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }
  const syncStartedAt = Date.now();
  const endpoint = getSheetEndpoint();
  if (!endpoint) {
    showToast("Sambungan diperlukan", "Supabase belum tersedia.", "error");
    return false;
  }
  if (syncInProgress) return false;
  syncInProgress = true;
  const syncStateGeneration = authoritativeStateGeneration;

  elements.connectionResult.classList.remove("error");
  elements.connectionResult.innerHTML = '<span class="status-dot"></span><span>Sedang menyemak server...</span>';

  try {
    const url = new URL(endpoint);
    url.searchParams.set("_", Date.now().toString());
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.leads || payload.data || [];
    if (!Array.isArray(payload) && payload?.ok === false) {
      throw new Error(payload.error || "Server tidak dapat dibaca");
    }
    if (!Array.isArray(rows)) throw new Error("Format JSON tidak sah");

    const agentSync = Array.isArray(payload) ? { added: 0, updated: 0, removed: 0 } : await syncAgentsFromSheet(payload.agents);
    if (!Array.isArray(payload)) {
      const projects = normalizeProjects(payload.projects);
      if (projects.length) state.projects = projects;
      state.appointments = normalizeAppointments(payload.appointments);
    }
    if (options.agentsOnly) {
      state.integration.endpoint = endpoint;
      state.integration.interval = DEFAULT_SYNC_INTERVAL_SECONDS;
      state.integration.connected = true;
      state.integration.lastSyncAt = Date.now();
      saveState();
      elements.connectionResult.classList.remove("error");
      elements.connectionResult.innerHTML = '<span class="status-dot"></span><span>Disambungkan. Sync baru sahaja.</span>';
      return true;
    }

    const shouldNotifyNewLeads = options.notifyNewLeads ?? Boolean(state.integration.lastSyncAt);
    let added = 0;
    let updated = 0;
    const sheetKeys = new Set(rows.map(sheetDedupeKey).filter(Boolean));
    for (const row of rows) {
      const result = await addLead(row, {
        syncStartedAt,
        syncStateGeneration,
        silent: true,
        updateExisting: true,
        notify: shouldNotifyNewLeads,
        queueIfBlocked: true,
      });
      if (result === "added") added += 1;
      if (result === "updated") updated += 1;
    }
    const removedLeads = getLeadsRemovedBySync(sheetKeys, syncStateGeneration);
    let removed = removedLeads.length;
    if (remoteDatabaseMode && isAdmin()) {
      const { data, error } = await remoteDatabaseClient.rpc("delete_leads_not_in_dedupe_keys", {
        p_dedupe_keys: [...sheetKeys],
      });
      if (error) throw error;
      removed = Number(data) || 0;
      if (removedLeads.length) {
        const removedIds = removedLeads.map((lead) => lead.id);
        state.leads = state.leads.filter((lead) => !removedIds.includes(lead.id));
        state.activities = state.activities.filter((activity) => !removedIds.includes(activity.leadId));
        saveState();
      }
    } else if (removedLeads.length) {
      await deleteLeads(removedLeads.map((lead) => lead.id));
    }
    removedLeads.forEach((lead) => authoritativeLeadGenerations.delete(authoritativeLeadKey(lead)));
    const activatedQueuedLeads = [];
    // A scheduled read must never write agent totals back to the server. Runtime
    // Counts and queue ownership remain authoritative on the canonical server.
    const handledSync = { updated: 0, pushed: 0 };

    cleanupLocallyExpiredAssignments();

    state.integration.endpoint = endpoint;
    state.integration.interval = DEFAULT_SYNC_INTERVAL_SECONDS;
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
    if (
      options.lifecycleSync ||
      (typeof initialDashboardSyncState !== "undefined" && initialDashboardSyncState === "failed")
    ) {
      completeLifecycleAuthoritativeRender();
    }
    elements.connectionResult.classList.remove("error");
    elements.connectionResult.innerHTML = '<span class="status-dot"></span><span>Disambungkan. Sync baru sahaja.</span>';
    enforceAgentNotificationAccess();
    const agentChanges =
      (agentSync.added || 0) +
      (agentSync.updated || 0) +
      (agentSync.removed || 0) +
      (handledSync.updated || 0);
    if (isAdmin() && (!options.silent || added || updated || removed || agentChanges)) {
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
          ? "Dashboard telah diselaraskan dengan server."
          : "Tiada perubahan baru ditemui.",
      );
    }
    if (!Array.isArray(payload)) {
      await processAdminReminderFromSheet(
        payload.follow_up_reminder || payload.latest_reminder || payload.latestReminder || payload.reminder,
      );
    }
    if (getCurrentUser()?.role === "agent" && Notification.permission === "granted") {
      await updateAgentPresence(true);
    }
    return true;
  } catch (error) {
    if (options.lifecycleSync) failLifecycleSync();
    state.integration.connected = false;
    saveState();
    elements.connectionResult.classList.add("error");
    elements.connectionResult.innerHTML = `
      <span class="status-dot"></span>
      <span>Gagal disambungkan. Semak URL dan akses Web App.</span>`;
    if (!options.silent) {
      showToast("Sync gagal", "Pastikan Web App URL boleh diakses oleh sesiapa sahaja.", "error");
    }
    console.error("Server sync failed", error);
    return false;
  } finally {
    syncInProgress = false;
    const waiters = syncCompletionWaiters;
    syncCompletionWaiters = [];
    waiters.forEach((resolve) => resolve());
  }
}

function scheduleSync() {
  window.clearInterval(syncTimer);
  if (remoteDatabaseMode) {
    syncTimer = window.setInterval(() => queueRemoteReload(), 30000);
    return;
  }
  if (!getSheetEndpoint()) return;
  syncTimer = window.setInterval(
    () => {
      checkCachedAssignmentSnapshot();
      syncGoogleSheet({ silent: true });
    },
    DEFAULT_SYNC_INTERVAL_SECONDS * 1000,
  );
}

function waitForCurrentSync() {
  if (!syncInProgress) return Promise.resolve();
  return new Promise((resolve) => syncCompletionWaiters.push(resolve));
}

async function syncGoogleSheetFresh(options = {}) {
  if (syncInProgress) await waitForCurrentSync();
  return syncGoogleSheet(options);
}

function setIntegrationButtonLoading(button, loading, label) {
  if (!button) return;
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent.trim();
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  button.textContent = loading ? label : button.dataset.defaultLabel;
}

async function runIntegrationSync(button, loadingLabel, successTitle) {
  setIntegrationButtonLoading(button, true, loadingLabel);
  setGlobalLoading(true, loadingLabel);
  try {
    if (syncInProgress) {
      elements.connectionResult.innerHTML = '<span class="status-dot"></span><span>Menunggu sync semasa selesai...</span>';
      await waitForCurrentSync();
    }
    const success = await syncGoogleSheet({ silent: true });
    if (!success) throw new Error("Server tidak dapat diselaraskan.");
    showToast(successTitle, "Dashboard telah diselaraskan dengan server.", "success");
    return true;
  } catch (error) {
    showToast("Sync gagal", error?.message || "Semak URL dan cuba semula.", "error");
    return false;
  } finally {
    setIntegrationButtonLoading(button, false, loadingLabel);
    setGlobalLoading(false);
  }
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll("[data-view-link]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewLink));
});

elements.refreshIntegrations?.addEventListener("click", loadIntegrationStatus);
elements.copyIntegrationEndpoint?.addEventListener("click", () => {
  copyIntegrationText(PABBLY_INGEST_ENDPOINT, "Endpoint ingestion Pabbly telah disalin.");
});
elements.integrationConnectors?.addEventListener("click", (event) => {
  const rotateButton = event.target.closest("[data-integration-rotate]");
  if (rotateButton) {
    rotateIntegrationKey(rotateButton.dataset.integrationRotate);
    return;
  }
  const revokeButton = event.target.closest("[data-integration-revoke]");
  if (revokeButton) {
    revokeIntegrationKey(revokeButton.dataset.integrationRevoke);
    return;
  }
  const keyButton = event.target.closest("[data-integration-copy-key]");
  if (keyButton) {
    const rawKey = integrationRawKeys.get(keyButton.dataset.integrationCopyKey);
    if (rawKey) copyIntegrationText(rawKey, "API key telah disalin.");
    return;
  }
  const payloadButton = event.target.closest("[data-integration-copy-payload]");
  if (payloadButton) {
    copyIntegrationText(integrationPayload(payloadButton.dataset.integrationCopyPayload), "Payload JSON telah disalin.");
  }
});

elements.manualLeadButtons.forEach((button) => button.addEventListener("click", openManualLeadModal));
elements.notificationButton.addEventListener("click", requestNotifications);
elements.getLeadButton?.addEventListener("click", () => setAgentLeadAvailability(true));
elements.stopLeadButton?.addEventListener("click", () => setAgentLeadAvailability(false));
elements.enableRequiredNotifications.addEventListener("click", requestNotifications);
elements.addToHomeScreen?.addEventListener("click", addToHomeScreen);
elements.remindAgentsButton?.addEventListener("click", remindAllAgentsForFollowUp);
elements.dismissAdminReminderButton?.addEventListener("click", dismissAdminReminder);
elements.mobileMenu.addEventListener("click", () => {
  setMobileSidebarOpen(!elements.sidebar.classList.contains("open"));
});
elements.mobileMoreTab.addEventListener("click", () => setMobileSidebarOpen(!elements.sidebar.classList.contains("open")));
elements.mobileSidebarClose.addEventListener("click", () => setMobileSidebarOpen(false));
elements.mobileSidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
window.addEventListener("popstate", (event) => {
  if (!document.body.classList.contains("authenticated")) return;
  switchView(event.state?.leadLajuView || getRequestedStartView(), { historyMode: "none" });
});
document.addEventListener("click", (event) => {
  if (!isMobileSidebarViewport() || !elements.sidebar.classList.contains("open")) return;
  if (Date.now() - mobileSidebarLastGestureAt < 500) return;
  if (elements.sidebar.contains(event.target) || elements.mobileMenu.contains(event.target) || elements.mobileMoreTab.contains(event.target)) return;
  setMobileSidebarOpen(false);
});

let mobileSidebarTouchStart = null;
let mobileSidebarLastGestureAt = 0;
document.addEventListener("touchstart", (event) => {
  if (!isMobileSidebarViewport() || event.touches.length !== 1) return;
  const touch = event.touches[0];
  mobileSidebarTouchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
document.addEventListener("touchend", (event) => {
  if (!mobileSidebarTouchStart || !isMobileSidebarViewport() || event.changedTouches.length !== 1) {
    mobileSidebarTouchStart = null;
    return;
  }
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - mobileSidebarTouchStart.x;
  const deltaY = touch.clientY - mobileSidebarTouchStart.y;
  mobileSidebarTouchStart = null;
  if (Math.abs(deltaX) < 64 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.4) return;
  if (deltaX < 0 && elements.sidebar.classList.contains("open")) {
    mobileSidebarLastGestureAt = Date.now();
    setMobileSidebarOpen(false);
  }
}, { passive: true });
elements.loginForm.addEventListener("submit", handleLogin);
elements.loginEmail.addEventListener("input", () => setLoginError(""));
elements.loginPassword.addEventListener("input", () => setLoginError(""));
elements.signupForm.addEventListener("submit", handleAgentSignup);
elements.signupLoginButton.addEventListener("click", () => {
  // Return to the canonical login URL; refresh must not reopen registration.
  window.history.replaceState(null, "", "/");
  showSignupForm(false);
});
elements.closeSignupSuccess.addEventListener("click", () => closeModal(elements.signupSuccessModal));
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
elements.sidebarSettings.addEventListener("click", () => setAccountMenuOpen(elements.accountMenu.hidden));
elements.editOwnDetails.addEventListener("click", openOwnDetails);
elements.accountLogout.addEventListener("click", requestLogout);
elements.logoutButton.addEventListener("click", requestLogout);
elements.logoutCancel.addEventListener("click", closeLogoutConfirmation);
elements.logoutContinue.addEventListener("click", continueLogout);
elements.ownDetailsForm.addEventListener("submit", saveOwnDetails);
elements.logoutConfirmModal.addEventListener("click", (event) => {
  if (event.target === elements.logoutConfirmModal) closeLogoutConfirmation();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".sidebar-account")) setAccountMenuOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setAccountMenuOpen(false);
  if (logoutConfirmationStep) closeLogoutConfirmation();
});
function resetLeadLogPage() {
  leadLogVisibleLimit = LEAD_LOG_PAGE_SIZE;
  window.clearTimeout(leadLogSearchTimer);
  renderLeadsTable();
}
elements.leadSearch.addEventListener("input", () => {
  window.clearTimeout(leadLogSearchTimer);
  leadLogSearchTimer = window.setTimeout(resetLeadLogPage, 120);
});
elements.leadFilter.addEventListener("change", resetLeadLogPage);
elements.leadFollowUpFilter.addEventListener("change", resetLeadLogPage);
elements.leadAgentFilter?.addEventListener("change", resetLeadLogPage);
elements.leadPeriodFilter?.addEventListener("change", resetLeadLogPage);
elements.leadLogMore?.addEventListener("click", () => {
  leadLogVisibleLimit += LEAD_LOG_PAGE_SIZE;
  renderLeadsTable();
});
elements.appointmentStatusFilter?.addEventListener("change", renderAppointments);
elements.appointmentProjectFilter?.addEventListener("change", renderAppointments);
elements.appointmentPeriodFilter?.addEventListener("change", renderAppointments);
elements.followUpAgentFilter?.addEventListener("change", renderFollowUpDue);
elements.followUpProjectFilter?.addEventListener("change", renderFollowUpDue);
elements.followUpPeriodFilter?.addEventListener("change", renderFollowUpDue);
elements.monitorSeverityFilter?.addEventListener("change", renderLeadMonitor);
elements.monitorAgentFilter?.addEventListener("change", renderLeadMonitor);
elements.monitorRefreshButton?.addEventListener("click", async () => {
  elements.monitorRefreshButton.disabled = true;
  setGlobalLoading(true, "Memeriksa pergerakan lead...");
  try {
    await waitForCurrentSync();
    const synced = await syncGoogleSheet({ silent: true });
    if (!synced) {
      monitorSyncFailed = true;
      renderLeadMonitor();
      showToast("Pemeriksaan gagal", "Data Supabase tidak dapat disahkan. Cuba semula.", "error");
      return;
    }
    renderLeadMonitor();
    showToast("Pemeriksaan selesai", systemWorkerText("Status queue, assignment dan ejen telah diperiksa."));
  } finally {
    elements.monitorRefreshButton.disabled = false;
    setGlobalLoading(false);
  }
});
elements.monitorList?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-monitor-lead]");
  if (!target) return;
  elements.leadSearch.value = target.dataset.monitorLead;
  const lead = state.leads.find((item) => item.id === target.dataset.monitorLead);
  if (lead) elements.leadSearch.value = lead.name;
  switchView("leads");
  renderLeadsTable();
});
elements.leadsTableBody.addEventListener("click", (event) => {
  const copy = event.target.closest("[data-lead-copy]");
  if (copy) { copyLeadDetails(copy.dataset.leadCopy); return; }
  const followUp = event.target.closest("[data-lead-follow-up]");
  if (followUp) {
    recordLeadFollowUp(followUp.dataset.leadFollowUp, followUp);
    return;
  }
  const expand = event.target.closest("[data-lead-expand]");
  if (expand) {
    const leadId = expand.dataset.leadExpand;
    if (expandedLeadLogIds.has(leadId)) expandedLeadLogIds.delete(leadId);
    else expandedLeadLogIds.add(leadId);
    renderLeadsTable();
    return;
  }
  const edit = event.target.closest("[data-lead-edit]");
  const remove = event.target.closest("[data-lead-delete]");
  const saveNote = event.target.closest("[data-lead-note-save]");
  const appointment = event.target.closest("[data-lead-appointment]");
  const callNow = event.target.closest("[data-lead-call]");
  if (edit) openContactModal(edit.dataset.leadEdit);
  if (remove && isAdmin()) deleteLeadEverywhere(remove.dataset.leadDelete);
  if (saveNote) saveLeadNote(saveNote.dataset.leadNoteSave, saveNote);
  if (appointment) openAppointmentModal(appointment.dataset.leadAppointment);
  if (callNow) handleCall(callNow.dataset.leadCall);
});
elements.appointmentForm?.addEventListener("submit", saveAppointment);
elements.appointmentList?.addEventListener("click", (event) => {
  const status = event.target.closest("[data-appointment-status]");
  const reschedule = event.target.closest("[data-appointment-reschedule]");
  const edit = event.target.closest("[data-appointment-edit]");
  const remove = event.target.closest("[data-appointment-delete]");
  if (status) updateAppointmentStatus(status.dataset.appointmentId, status.dataset.appointmentStatus);
  if (reschedule) {
    const appointment = state.appointments.find((item) => item.id === reschedule.dataset.appointmentReschedule);
    if (appointment) openAppointmentModal(appointment.leadId, appointment.id, "reschedule");
  }
  if (edit) {
    const appointment = state.appointments.find((item) => item.id === edit.dataset.appointmentEdit);
    if (appointment) openAppointmentModal(appointment.leadId, appointment.id, "edit");
  }
  if (remove) deleteAppointment(remove.dataset.appointmentDelete);
});
function handleFollowUpDueClick(event) {
  const call = event.target.closest("[data-follow-up-call]");
  if (call) { handleCall(call.dataset.followUpCall); return; }
  const copy = event.target.closest("[data-follow-up-due-copy]");
  if (copy) { copyLeadDetails(copy.dataset.followUpDueCopy); return; }
  const action = event.target.closest("[data-follow-up-due-action]");
  if (action) recordLeadFollowUp(action.dataset.followUpDueAction, action);
}
elements.followUpDueList?.addEventListener("click", handleFollowUpDueClick);
document.querySelector(".follow-up-sections")?.addEventListener("click", event => {
  const button = event.target.closest("[data-follow-up-section]");
  if (!button) return;
  followUpSection = button.dataset.followUpSection;
  [elements.followUpAgentFilter, elements.followUpProjectFilter, elements.followUpPeriodFilter].forEach(filter => { if (filter) filter.value = "all"; });
  renderFollowUpDue();
});
document.querySelector("#dashboard-follow-up-list")?.addEventListener("click", handleFollowUpDueClick);
elements.leadsTableBody.addEventListener("change", (event) => {
  const statusField = event.target.closest("[data-lead-status]");
  if (statusField) updateLeadStatusFromLog(statusField.dataset.leadStatus, statusField.value, statusField);
});
elements.manualLeadForm.addEventListener("submit", event => runButtonActionFeedback(event.submitter, () => addManualLead(event)));
elements.manualLeadPhone.addEventListener("input", () => {
  elements.manualLeadError.textContent = "";
});
elements.addAgentButton.addEventListener("click", () => openAgentModal());
document.querySelector("#copy-agent-registration-link").addEventListener("click", () => {
  if (!isAdmin() || !activeBrand?.slug || activeBrand.active === false) return;
  copyIntegrationText(agentRegistrationUrl(activeBrand), `${systemWorkerText("Link daftar agent")} · ${activeBrand.name}`);
});
elements.getLeadAllAgentsButton?.addEventListener("click", () => setAdminAllAgentLeadAvailability(true));
elements.stopLeadAllAgentsButton?.addEventListener("click", () => setAdminAllAgentLeadAvailability(false));
elements.agentForm.addEventListener("submit", addAgent);
elements.projectForm?.addEventListener("submit", addProject);
elements.agentPasswordForm.addEventListener("submit", updateAgentPassword);
elements.contactForm.addEventListener("submit", updateContact);
elements.leadImportFile?.addEventListener("change", handleLeadImportFile);
elements.uploadLeadsButton?.addEventListener("click", uploadImportedLeads);
elements.clearLeadImport?.addEventListener("click", resetLeadImport);
elements.downloadSampleCsv?.addEventListener("click", downloadLeadSampleCsv);
elements.downloadSampleXlsx?.addEventListener("click", downloadLeadSampleXlsx);
elements.performancePeriod?.addEventListener("change", () => {
  const custom = elements.performancePeriod.value === "custom";
  document.querySelectorAll(".performance-custom-date").forEach((field) => { field.hidden = !custom; });
  if (custom) {
    elements.performanceFrom.value ||= performanceDateOffset(-6);
    elements.performanceTo.value ||= todayKey();
  }
  loadPerformanceReport();
});
[elements.performanceFrom, elements.performanceTo, elements.performanceProject, elements.performanceAgent]
  .forEach((field) => field?.addEventListener("change", loadPerformanceReport));
elements.performanceDownload?.addEventListener("click", () => {
  downloadPerformanceReport().catch((error) => {
    console.error("Performance Excel download failed", error);
    showToast("Excel gagal", "Cuba muat turun semula.", "error");
  });
});
function openPerformanceAgent(event) {
  const button = event.target.closest("[data-performance-agent]");
  if (!button) return;
  selectedPerformanceAgentId = button.dataset.performanceAgent;
  renderPerformanceReport();
  elements.performanceDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
elements.performanceRows?.addEventListener("click", openPerformanceAgent);
elements.performanceCards?.addEventListener("click", openPerformanceAgent);
elements.bulletinForm?.addEventListener("submit", saveBulletin);
elements.bulletinCancelEdit?.addEventListener("click", resetBulletinForm);
document.querySelector("#bulletins-view")?.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-bulletin-edit]");
  const archive = event.target.closest("[data-bulletin-archive]");
  const remind = event.target.closest("[data-bulletin-remind]");
  const open = event.target.closest("[data-bulletin-open]");
  if (remind) { remindUnreadBulletin(remind.dataset.bulletinRemind, remind); return; }
  if (edit) { const item = state.bulletins.find((bulletin) => bulletin.id === edit.dataset.bulletinEdit); if (!item) return; elements.bulletinId.value=item.id; elements.bulletinTitle.value=item.title; elements.bulletinBody.value=item.body; elements.bulletinCtaText.value=item.ctaText; elements.bulletinCtaUrl.value=item.ctaUrl; elements.bulletinProject.value=item.projectId || ""; elements.bulletinProject.disabled=true; elements.bulletinSubmit.textContent="Simpan perubahan"; elements.bulletinCancelEdit.hidden=false; window.scrollTo({top: 0, behavior: "smooth"}); return; }
  if (archive) { remoteDatabaseClient.rpc("archive_bulletin", { p_bulletin_id: archive.dataset.bulletinArchive }).then(({error}) => { if (error) throw error; return loadBulletinFeed(); }).then(() => renderBulletins()).catch((error) => showToast("Archive gagal", error.message, "error")); return; }
  if (open && !event.target.closest("a,button")) openBulletin(open.dataset.bulletinOpen);
});
elements.closePotentialReminder?.addEventListener("click", () => closeModal(elements.potentialReminderModal));
elements.closeLeadAvailability?.addEventListener("click", () => closeModal(elements.leadAvailabilityModal));
elements.refreshButton?.addEventListener("click", async () => {
  const button = elements.refreshButton;
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.classList.add("is-syncing");
  try {
    const refreshed = await syncGoogleSheetFresh({ silent: true });
    if (refreshed && isAdmin() && isTeamSales()) {
      teamPerformanceCache.clear();
      await loadTeamPerformance();
    }
    if (!refreshed) showToast("Refresh gagal", "Data belum dapat disegerakkan. Cuba lagi sebentar.", "error");
  } catch (error) {
    console.error("Manual refresh failed", error);
    showToast("Refresh gagal", "Data belum dapat disegerakkan. Cuba lagi sebentar.", "error");
  } finally {
    // Finish as soon as sync is done; CSS supplies the smooth transition.
    button.classList.remove("is-syncing");
    button.removeAttribute("aria-busy");
    button.disabled = false;
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "LEAD_SNAPSHOT") {
      const appMessageReceivedEpoch = Date.now();
      const timing = { ...(event.data.timing || {}), appMessageReceivedEpoch };
      logLeadTiming("APP_MESSAGE_RECEIVED", event.data.leadSnapshot || {}, timing, appMessageReceivedEpoch);
      if (timing.key) leadTimingDeliveries.set(timing.key, { leadSnapshot: event.data.leadSnapshot || {}, timing });
      consumeAssignmentHandoff(event.data, timing).then((ready) => {
        event.ports?.[0]?.postMessage({ ready });
      }).catch(() => {
        event.ports?.[0]?.postMessage({ ready: false });
      });
    }
    if (event.data?.type === "LEAD_ASSIGNMENT_HANDOFF") consumeAssignmentHandoff(event.data);
    if (event.data?.type === "LEAD_SNAPSHOT_TIMING") {
      const timing = event.data.timing || {};
      const pending = timing.key ? leadTimingDeliveries.get(timing.key) : null;
      if (pending) {
        const completedTiming = { ...pending.timing, ...timing };
        logLeadTiming("DELIVERY_TRACE", pending.leadSnapshot, completedTiming, pending.timing.appMessageReceivedEpoch);
        leadTimingDeliveries.delete(timing.key);
      }
    }
    if (event.data?.type === "OPEN_LEAD") {
      (async () => {
        if (event.data.leadSnapshot) await consumeAssignmentHandoff(event.data);
        await openNotificationLead(event.data.leadId);
      })().catch(() => showToast("Lead belum dimuatkan", "Semak sambungan dan cuba lagi.", "error"));
    }
    if (event.data?.type === "OPEN_DASHBOARD") {
      switchView("dashboard");
      if (event.data.leadSnapshot) consumeAssignmentHandoff(event.data);
      if (event.data.leadId) syncNotificationLead(event.data.leadId);
    }
    if (event.data?.type === "OPEN_VIEW") {
      if (["new-lead", "sales_new_daily", "sales_due_daily"].includes(event.data.reminderType)) {
        switchView("follow-up-due");
        followUpSection = event.data.reminderType === "sales_due_daily" ? "due" : "new";
        if (event.data.leadSnapshot) consumeAssignmentHandoff(event.data);
        [elements.followUpAgentFilter, elements.followUpProjectFilter, elements.followUpPeriodFilter].forEach(filter => { if (filter) filter.value = "all"; });
        renderFollowUpDue();
        return;
      }
      if (event.data.reminderType === "sales-overdue") { openSalesOverdueReminder(event.data.brandId); return; }
      if (event.data.view === "leads" && event.data.leadIds?.length > 1) {
        salesLeadDrilldown = null;
        elements.leadSearch.value = "";
        elements.leadFilter.value = "new";
        [elements.leadFollowUpFilter, elements.leadAgentFilter, elements.leadPeriodFilter].forEach((field) => { if (field) field.value = "all"; });
      }
      switchView(event.data.view || "dashboard");
    }
    if (event.data?.type === "OPEN_BULLETIN") { pendingBulletinId = event.data.bulletinId || ""; switchView("bulletins"); loadBulletinFeed().then(openRequestedBulletin); }
    if (event.data?.type === "OPEN_POTENTIAL_REMINDER") handlePotentialReminderNotification();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  showToast("LeadLaju dipasang", "Buka aplikasi dari skrin utama dan aktifkan loceng untuk notifikasi lead baharu.", "success");
  enforceAgentNotificationAccess();
});

window.addEventListener("focus", () => {
  enforceAgentNotificationAccess();
  processExpiredLeads();
  checkFollowUpReminder();
  if (latestAdminReminder) sendAdminFollowUpNotification(latestAdminReminder);
  beginResumeSync();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateSalesLeadWaitingTimes();
  if (document.hidden) {
    runtimeWasHidden = true;
  } else {
    enforceAgentNotificationAccess();
    processExpiredLeads();
    checkFollowUpReminder();
    if (latestAdminReminder) sendAdminFollowUpNotification(latestAdminReminder);
    if (runtimeWasHidden) {
      runtimeWasHidden = false;
      beginResumeSync();
    }
  }
});

window.addEventListener("pagehide", (event) => {
  if (event.persisted) runtimeWasHidden = true;
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted && runtimeWasHidden) {
    runtimeWasHidden = false;
    beginResumeSync();
  }
});

elements.leadsTableBody.addEventListener("input", (event) => {
  const field = event.target.closest("[data-lead-note]");
  if (field) leadNoteDrafts.set(leadNoteDraftKey(field.dataset.leadNote), field.value);
});

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

[elements.agentPasswordModal, elements.contactModal, elements.appointmentModal, elements.potentialReminderModal, elements.leadAvailabilityModal].forEach((modal) => {
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
  const forceOffline = event.target.closest("[data-agent-force-offline]");
  const leadAvailability = event.target.closest("[data-agent-lead-availability]");
  const edit = event.target.closest("[data-agent-edit]");
  if (toggle) toggleAgent(toggle.dataset.agentToggle);
  if (approve) approveAgent(approve.dataset.agentApprove);
  if (reject) rejectAgent(reject.dataset.agentReject);
  if (remove) removeAgent(remove.dataset.agentRemove);
  if (password) openAgentPasswordModal(password.dataset.agentPassword);
  if (forceOffline) forceAgentOffline(forceOffline.dataset.agentForceOffline);
  if (leadAvailability) {
    setAdminAgentLeadAvailability(
      leadAvailability.dataset.agentId,
      leadAvailability.dataset.agentLeadAvailability === "get",
    );
  }
  if (edit) openAgentModal(edit.dataset.agentEdit);
});

elements.projectsList?.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-project-toggle]");
  if (toggle) toggleProject(toggle.dataset.projectToggle);
  const remove = event.target.closest("[data-project-delete]");
  if (remove) deleteProject(remove.dataset.projectDelete, remove);
});

elements.projectsList?.addEventListener("toggle", (event) => {
  const dropdown = event.target.closest("[data-project-status]");
  if (!dropdown) return;
  if (dropdown.open) expandedProjectStatusIds.add(dropdown.dataset.projectStatus);
  else expandedProjectStatusIds.delete(dropdown.dataset.projectStatus);
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal(elements.agentModal);
    editingAgentId = null;
    closeModal(elements.manualLeadModal);
    closeModal(elements.resetPasswordModal);
    closeModal(elements.agentPasswordModal);
    closeModal(elements.contactModal);
    closeModal(elements.appointmentModal);
    closeModal(elements.potentialReminderModal);
    closeModal(elements.leadAvailabilityModal);
    setMobileSidebarOpen(false);
  }
});

async function bootstrap() {
  // Capture before the SDK consumes and removes the Auth URL fragment.
  const authFragment = new URLSearchParams(window.location.hash.slice(1));
  const recoveryRequested = remotePasswordRecoveryPending
    || authFragment.get("type") === "recovery"
    || new URLSearchParams(window.location.search).get("reset") === "1";
  const authLinkFailed = authFragment.has("error") || authFragment.has("error_code");
  state.integration = normalizeIntegration(state.integration);
  saveState();
  if (!remoteDatabaseClient) await initRemoteDatabase();

  if (remoteDatabaseClient) {
    const { data } = await remoteDatabaseClient.auth.getSession();
    if (authLinkFailed || ((recoveryRequested || remotePasswordRecoveryPending) && !data.session?.user)) {
      showLogin();
      openResetPasswordModal();
      elements.resetRequestError.textContent = "Pautan reset tidak sah atau telah tamat. Minta pautan baru.";
      return;
    }
    if ((recoveryRequested || remotePasswordRecoveryPending) && data.session?.user) {
      showLogin();
      openRemoteRecoveryModal();
      return;
    }
    if (registrationBrandSlug(window.location) !== null) {
      showLogin();
      showSignupForm(true);
      return;
    }
    if (data.session?.user) {
      const loaded = await loadRemoteState(data.session.user.id);
      if (loaded) {
        const sessionUser = getCurrentUser();
        if (sessionUser?.active) {
          startAuthenticatedApp(sessionUser, { restoredSession: true });
          subscribeToRemoteDatabase();
          flushContactOutbox();
          return;
        }
      }
      if (loaded || !isTransientRemoteLoadError(lastRemoteLoadError)) await remoteDatabaseClient.auth.signOut();
    }
    showLogin();
    return;
  }

  if (remoteDatabaseRequired) {
    showLogin();
    if (registrationBrandSlug(window.location) !== null) showSignupForm(true);
    showToast("Supabase belum tersambung", "Cuba refresh. Operasi server lama tidak akan digunakan.", "error");
    return;
  }

  const sessionUser = getSessionUser();
  if (sessionUser) {
    startAuthenticatedApp(sessionUser, { restoredSession: true });
    return;
  } else {
    showLogin();
  }

  // The login screen must never wait on the comparatively slow Sheet endpoint.
  // A first-time user still waits for this promise only after submitting credentials.
  initialAgentSyncPromise = syncGoogleSheet({ silent: true, agentsOnly: true })
    .catch(() => false)
    .finally(() => {
      initialAgentSyncPromise = null;
    });
}

function initializeFloatingNavigation() {
  const nav = document.querySelector("#mobile-bottom-nav");
  if (!nav) return;
  let drag = null;
  let suppressClick = false;
  let previousY = window.scrollY;
  let direction = 0;
  let distance = 0;
  const phone = () => window.matchMedia("(max-width: 850px)").matches;
  const preview = (x, y) => {
    const rect = nav.getBoundingClientRect();
    const tabs = [...nav.querySelectorAll(".mobile-tab")];
    const tab = y >= rect.top - 28 && y <= rect.bottom + 28 && x >= rect.left && x <= rect.right
      ? tabs.find((item) => { const box = item.getBoundingClientRect(); return x >= box.left && x <= box.right; }) : null;
    tabs.forEach((item) => item.classList.toggle("is-gesture-target", item === tab));
    if (tab) {
      const box = tab.getBoundingClientRect();
      nav.style.setProperty("--glass-x", `${box.left - rect.left}px`);
      nav.style.setProperty("--glass-width", `${box.width}px`);
    }
    nav.classList.toggle("has-gesture-target", Boolean(tab));
    return tab;
  };
  nav.addEventListener("pointerdown", (event) => {
    if (!phone() || event.button !== 0 || !event.target.closest(".mobile-tab")) return;
    drag = { id: event.pointerId, target: preview(event.clientX, event.clientY) };
    nav.setPointerCapture(event.pointerId);
    nav.classList.add("is-selecting");
    suppressClick = false;
  });
  nav.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.target = preview(event.clientX, event.clientY);
  });
  const finishDrag = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const target = event.type === "pointerup" ? preview(event.clientX, event.clientY) : null;
    suppressClick = true;
    drag = null;
    nav.classList.remove("is-selecting", "has-gesture-target");
    nav.querySelectorAll(".is-gesture-target").forEach((item) => item.classList.remove("is-gesture-target"));
    if (target?.dataset.view) switchView(target.dataset.view);
    else if (target === elements.mobileMoreTab) setMobileSidebarOpen(!elements.sidebar.classList.contains("open"));
    window.setTimeout(() => { suppressClick = false; }, 400);
  };
  nav.addEventListener("pointerup", finishDrag);
  nav.addEventListener("pointercancel", finishDrag);
  nav.addEventListener("click", (event) => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener("scroll", () => {
    const y = Math.max(0, window.scrollY);
    const delta = y - previousY;
    previousY = y;
    if (!phone() || drag || Math.abs(delta) < 1) return;
    const nextDirection = Math.sign(delta);
    distance = nextDirection === direction ? distance + Math.abs(delta) : Math.abs(delta);
    direction = nextDirection;
    if (y < 24 || (direction < 0 && distance >= 8)) nav.classList.remove("is-scroll-hidden");
    else if (direction > 0 && distance >= 20) nav.classList.add("is-scroll-hidden");
  }, { passive: true });
  window.addEventListener("resize", () => {
    nav.removeAttribute("style");
    nav.classList.remove("is-scroll-hidden");
  });
}

initializeFloatingNavigation();
document.querySelector("#team-performance").addEventListener("click", event => {
  const button = event.target.closest("[data-team-performance-days]");
  if (!button || !isAdmin() || !isTeamSales()) return;
  teamPerformanceDays = Number(button.dataset.teamPerformanceDays) === 1 ? 1 : 7;
  loadTeamPerformance();
});
lockViewportZoom();
window.addEventListener("online", flushContactOutbox);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && isTeamSales()) flushContactOutbox();
});
document.addEventListener("click", event => {
  const link = event.target.closest("[data-sales-contact]");
  if (!link || !isTeamSales()) return;
  event.preventDefault();
  runButtonActionFeedback(link, () => handleSalesContact(link.dataset.salesLead, link.dataset.salesContact, link.href))
    .catch(error => { console.error("Contact action failed", error); showToast("Tindakan belum selesai", "Semak sambungan dan cuba lagi.", "error"); });
});
bootstrap();
