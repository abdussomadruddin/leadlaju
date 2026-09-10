const SPREADSHEET_ID = "1ySHeB12lL2y4AxqpSx8dDniyujSaz2-9hoRzPlCv6TM";
const SHEET_NAME = "Sheet1";
const AGENTS_SHEET_NAME = "Agents";
const PROJECTS_SHEET_NAME = "Projects";
const REMINDERS_SHEET_NAME = "Reminders";
const PUSH_SUBSCRIPTIONS_SHEET_NAME = "PushSubscriptions";
const DEFAULT_SOURCE = "Manual Lead";
const DEFAULT_AGENT_PASSWORD = "Agent123!";
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const PUSH_API_URL = "https://leadlaju.vercel.app/api/push";
const PUSH_NOTIFY_SECRET = "leadlaju-push-notify-v1";
const RESPONSE_WINDOW_MINUTES = 5;
const AGENT_PRESENCE_TIMEOUT_MINUTES = 60;
const LEAD_STATUS_VALUES = [
  "New",
  "Contacted",
  "Passed",
  "All Offer Presented",
  "Need Follow Up",
  "Potential",
  "Rejected",
  "Cancelled",
  "Client",
];
const LEAD_QUEUE_STATE_VALUES = [
  "active",
  "queued",
  "contacted",
  "passed",
  "all_offer_presented",
  "need_follow_up",
  "potential",
  "rejected",
  "cancelled",
  "client",
];
const LEAD_VALIDATION_VERSION = "lead-status-queue-v2";
// Used only when a legacy sheet has no lead rows to seed the first project list.
const INITIAL_PROJECT_NAMES = ["Armani Putrajaya", "BBSAP Sitiawan"];

const FIELD_ALIASES = {
  id: ["id", "lead id", "lead_id", "tiktok lead id", "meta lead id"],
  createdAt: ["tarikh & masa", "tarikh masa", "time", "timestamp", "created_at", "created at", "date"],
  name: ["nama", "name", "full name", "full_name"],
  phone: ["no phone", "phone", "phone number", "phone_number", "nombor telefon", "telefon", "mobile", "whatsapp"],
  email: ["emel", "email", "e-mail", "email address", "email_address"],
  city: ["bandar", "city", "location"],
  project: ["projek", "project", "nama projek", "project name", "project_name", "campaign", "campaign name"],
  status: ["status"],
  statusRevision: ["status revision", "status_revision"],
  statusUpdatedAt: ["status updated at", "status_updated_at"],
  source: ["source", "sumber", "platform"],
  notes: ["nota", "notes", "catatan"],
  assignedAgentId: ["assigned agent id", "assigned_agent_id", "agent id", "agent_id", "id ejen"],
  assignedAgentEmail: ["assigned agent email", "assigned_agent_email", "agent email", "email ejen"],
  assignedAgentName: ["assigned agent name", "assigned_agent_name", "agent name", "nama ejen"],
  receivedAt: ["received at", "received_at", "assigned at", "assigned_at", "masa aktif"],
  expiresAt: ["expires at", "expires_at", "tamat pada", "masa tamat"],
  queueState: ["queue state", "queue_state", "runtime state", "runtime_state"],
  queuedAt: ["queued at", "queued_at", "masa queue"],
  passCount: ["pass count", "pass_count", "rotation count", "rotation_count"],
  retryAfterCycle: ["retry after cycle", "retry_after_cycle", "pusingan retry selepas"],
  assignmentRevision: ["assignment revision", "assignment_revision", "runtime revision", "runtime_revision"],
  assignmentHistory: ["assignment history", "assignment_history", "sejarah assignment"],
};

const REQUIRED_HEADERS = [
  { field: "createdAt", label: "Tarikh & Masa" },
  { field: "name", label: "Nama" },
  { field: "phone", label: "No Phone" },
  { field: "email", label: "Emel" },
  { field: "city", label: "Bandar" },
  { field: "project", label: "Projek" },
  { field: "status", label: "Status" },
  { field: "statusRevision", label: "Status Revision" },
  { field: "statusUpdatedAt", label: "Status Updated At" },
  { field: "source", label: "Sumber" },
  { field: "notes", label: "Nota" },
  { field: "id", label: "ID" },
  { field: "assignedAgentId", label: "Assigned Agent ID" },
  { field: "assignedAgentEmail", label: "Assigned Agent Email" },
  { field: "assignedAgentName", label: "Assigned Agent Name" },
  { field: "receivedAt", label: "Received At" },
  { field: "expiresAt", label: "Expires At" },
  { field: "queueState", label: "Queue State" },
  { field: "queuedAt", label: "Queued At" },
  { field: "passCount", label: "Pass Count" },
  { field: "retryAfterCycle", label: "Retry After Cycle" },
  { field: "assignmentRevision", label: "Assignment Revision" },
  { field: "assignmentHistory", label: "Assignment History" },
];

const AGENT_FIELD_ALIASES = {
  id: ["id", "agent id", "agent_id", "user id", "user_id"],
  name: ["nama", "name", "full name", "full_name"],
  phone: ["no phone", "phone", "phone number", "phone_number", "nombor telefon", "telefon", "mobile", "whatsapp"],
  email: ["emel", "email", "e-mail", "email address", "email_address"],
  role: ["role", "peranan"],
  active: ["status", "active", "aktif"],
  leadsHandled: ["leads handled", "lead dikendalikan", "leads_handled"],
  createdAt: ["created at", "created_at", "tarikh daftar", "tarikh & masa"],
  password: ["password", "kata laluan", "kata_laluan", "temporary password", "temporary_password"],
  cooldownUntil: ["cooldown until", "cooldown_until", "rehat sehingga"],
  notificationEnabled: ["notification enabled", "notification_enabled", "loceng aktif"],
  lastSeenAt: ["last seen at", "last_seen_at", "terakhir online"],
  presenceNotBefore: ["presence not before", "presence_not_before", "sesi online selepas"],
  eligibleProjectIds: ["eligible projects", "eligible_project_ids", "projek layak", "project ids"],
};

const AGENT_HEADERS = [
  { field: "id", label: "ID" },
  { field: "name", label: "Nama" },
  { field: "phone", label: "No Phone" },
  { field: "email", label: "Emel" },
  { field: "role", label: "Role" },
  { field: "active", label: "Status" },
  { field: "leadsHandled", label: "Leads Handled" },
  { field: "createdAt", label: "Tarikh Daftar" },
  { field: "password", label: "Password" },
  { field: "cooldownUntil", label: "Cooldown Until" },
  { field: "notificationEnabled", label: "Notification Enabled" },
  { field: "lastSeenAt", label: "Last Seen At" },
  { field: "presenceNotBefore", label: "Presence Not Before" },
  { field: "eligibleProjectIds", label: "Eligible Projects" },
];

const PROJECT_FIELD_ALIASES = {
  id: ["id", "project id", "project_id"],
  name: ["nama projek", "project", "project name", "project_name", "nama"],
  active: ["status", "active", "aktif"],
  createdAt: ["tarikh dibuat", "created at", "created_at"],
};

const PROJECT_HEADERS = [
  { field: "id", label: "ID" },
  { field: "name", label: "Nama Projek" },
  { field: "active", label: "Status" },
  { field: "createdAt", label: "Tarikh Dibuat" },
];

const REMINDER_FIELD_ALIASES = {
  id: ["id", "reminder id", "reminder_id"],
  createdAt: ["tarikh & masa", "created at", "created_at", "time"],
  createdById: ["created by id", "created_by_id", "admin id", "admin_id"],
  createdByName: ["created by name", "created_by_name", "admin name", "admin_name"],
  target: ["target", "sasaran"],
  message: ["message", "mesej", "reminder"],
};

const REMINDER_HEADERS = [
  { field: "id", label: "ID" },
  { field: "createdAt", label: "Tarikh & Masa" },
  { field: "createdById", label: "Created By ID" },
  { field: "createdByName", label: "Created By Name" },
  { field: "target", label: "Target" },
  { field: "message", label: "Message" },
];

const PUSH_FIELD_ALIASES = {
  endpoint: ["endpoint", "push endpoint"],
  p256dh: ["p256dh", "push p256dh"],
  auth: ["auth", "push auth"],
  agentId: ["agent id", "agent_id", "id ejen"],
  agentEmail: ["agent email", "agent_email", "email ejen", "emel"],
  agentName: ["agent name", "agent_name", "nama ejen", "nama"],
  role: ["role", "peranan"],
  active: ["status", "active", "aktif"],
  userAgent: ["user agent", "user_agent", "device"],
  updatedAt: ["updated at", "updated_at", "tarikh kemaskini"],
};

const PUSH_HEADERS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "p256dh", label: "P256DH" },
  { field: "auth", label: "Auth" },
  { field: "agentId", label: "Agent ID" },
  { field: "agentEmail", label: "Agent Email" },
  { field: "agentName", label: "Agent Name" },
  { field: "role", label: "Role" },
  { field: "active", label: "Status" },
  { field: "userAgent", label: "User Agent" },
  { field: "updatedAt", label: "Updated At" },
];

function doGet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    const agentsSheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
    const projectsSheet = getOrCreateSheet_(spreadsheet, PROJECTS_SHEET_NAME);
    const remindersSheet = getOrCreateSheet_(spreadsheet, REMINDERS_SHEET_NAME);
    const pushSheet = getOrCreateSheet_(spreadsheet, PUSH_SUBSCRIPTIONS_SHEET_NAME);
    const headers = ensureRequiredHeaders_(sheet);
    const agentHeaders = ensureRequiredHeadersBySpec_(agentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
    const projectHeaders = ensureRequiredHeadersBySpec_(projectsSheet, PROJECT_HEADERS, PROJECT_FIELD_ALIASES);
    const reminderHeaders = ensureRequiredHeadersBySpec_(remindersSheet, REMINDER_HEADERS, REMINDER_FIELD_ALIASES);
    ensureRequiredHeadersBySpec_(pushSheet, PUSH_HEADERS, PUSH_FIELD_ALIASES);
    ensureLeadIds_(sheet, headers);
    ensureLeadTimestamps_(sheet, headers);
    ensureLeadSources_(sheet, headers);
    normalizeLegacyLeadStatuses_(sheet, headers);
    ensureLeadValidations_(sheet, headers);
    let leads = readLeads_(sheet);
    const projects = ensureProjectsFromLeads_(projectsSheet, projectHeaders, leads);
    ensureAgentProjectEligibility_(agentsSheet, agentHeaders, projects);
    clearExpiredAgentCooldowns_(agentsSheet, agentHeaders);
    let agents = readAgents_(agentsSheet, agentHeaders);
    if (reconcileLeadAgentReferences_(sheet, headers, agents)) leads = readLeads_(sheet);
    if (syncAgentHandledCounts_(leads, agentsSheet, agentHeaders)) {
      agents = readAgents_(agentsSheet, agentHeaders);
    }
    const followUpReminder = readLatestReminder_(remindersSheet, reminderHeaders);
    return jsonResponse({
      ok: true,
      spreadsheet: spreadsheet.getName(),
      sheet: sheet.getName(),
      leads,
      agents,
      projects,
      follow_up_reminder: followUpReminder,
      push_subscription_count: Math.max(pushSheet.getLastRow() - 1, 0),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error), leads: [] });
  }
}

function reconcileLeadAgentReferences_(sheet, headers, agents) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return 0;
  const agentsById = new Map(agents.map((agent) => [String(agent.id || "").trim(), agent]));
  const agentsByEmail = new Map(
    agents.filter((agent) => agent.email).map((agent) => [String(agent.email).trim().toLowerCase(), agent]),
  );
  const agentsByName = new Map(
    agents.filter((agent) => agent.name).map((agent) => [normalizeProjectName_(agent.name), agent]),
  );
  let updated = 0;

  for (let rowNumber = 2; rowNumber <= values.length; rowNumber += 1) {
    const row = values[rowNumber - 1];
    const assignedId = getCell_(headers, row, "assignedAgentId");
    const nextRow = row.slice(0, headers.length);
    let changed = false;
    if (assignedId && !agentsById.has(assignedId)) {
      const assignedEmail = getCell_(headers, row, "assignedAgentEmail").toLowerCase();
      const assignedName = normalizeProjectName_(getCell_(headers, row, "assignedAgentName"));
      const matchedAgent = agentsByEmail.get(assignedEmail) || agentsByName.get(assignedName);
      if (matchedAgent) {
        setRowValue_(headers, nextRow, "assignedAgentId", matchedAgent.id);
        setRowValue_(headers, nextRow, "assignedAgentName", matchedAgent.name);
        setRowValue_(headers, nextRow, "assignedAgentEmail", matchedAgent.email);
        changed = true;
      }
    }
    const history = parseAssignmentHistory_(headers, nextRow);
    history.forEach((entry) => {
      if (!entry.agentId || agentsById.has(String(entry.agentId))) return;
      const matchedAgent = agentsByName.get(normalizeProjectName_(entry.agentName));
      if (!matchedAgent) return;
      entry.agentId = matchedAgent.id;
      entry.agentName = matchedAgent.name;
      changed = true;
    });
    if (!changed) continue;
    setRowValue_(headers, nextRow, "assignmentHistory", JSON.stringify(history));
    sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);
    updated += 1;
  }
  return updated;
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    if (payload.action === "add_lead") {
      return jsonResponse(appendLead_(payload.lead || payload));
    }
    if (payload.action === "delete_lead") {
      const result = deleteLead_(payload.lead || payload);
      if (result.ok) rebalanceLeadQueue_();
      return jsonResponse(result);
    }
    if (payload.action === "update_lead_status") {
      return jsonResponse(updateLeadStatus_(payload.lead || payload));
    }
    if (payload.action === "update_lead_notes") {
      return jsonResponse(updateLeadNotes_(payload.lead || payload));
    }
    if (payload.action === "update_lead_runtime") {
      return jsonResponse(updateLeadRuntime_(payload.lead || payload));
    }
    if (payload.action === "expire_lead") {
      return jsonResponse(expireLead_(payload.lead || payload));
    }
    if (payload.action === "add_agent") {
      const result = upsertAgent_(payload.agent || payload);
      if (result.ok) rebalanceLeadQueue_();
      return jsonResponse(result);
    }
    if (payload.action === "add_project") {
      const result = upsertProject_(payload.project || payload);
      if (result.ok) rebalanceLeadQueue_();
      return jsonResponse(result);
    }
    if (payload.action === "update_project") {
      const result = upsertProject_(payload.project || payload);
      if (result.ok) rebalanceLeadQueue_();
      return jsonResponse(result);
    }
    if (payload.action === "delete_agent") {
      const result = deleteAgent_(payload.agent || payload);
      if (result.ok) rebalanceLeadQueue_();
      return jsonResponse(result);
    }
    if (payload.action === "replace_agents") {
      const result = replaceAgents_(payload.agents || []);
      if (result.ok) rebalanceLeadQueue_();
      return jsonResponse(result);
    }
    if (payload.action === "update_agent_presence") {
      return jsonResponse(updateAgentPresence_(payload.agent || payload));
    }
    if (payload.action === "force_agent_offline") {
      const result = forceAgentOffline_(payload.agent || payload);
      if (result.ok) rebalanceLeadQueue_();
      return jsonResponse(result);
    }
    if (payload.action === "send_reset_code") {
      return jsonResponse(sendResetCode_(payload));
    }
    if (payload.action === "broadcast_follow_up_reminder") {
      return jsonResponse(appendReminder_(payload.reminder || payload));
    }
    if (payload.action === "register_push_subscription") {
      return jsonResponse(registerPushSubscription_(payload));
    }

    return jsonResponse({ ok: false, error: "Action tidak disokong." });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function appendReminder_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, REMINDERS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, REMINDER_HEADERS, REMINDER_FIELD_ALIASES);
  const reminder = {
    id: String(input.id || input.reminder_id || Utilities.getUuid()).trim(),
    createdAt: canonicalLeadTimestamp_(input.created_at || input.createdAt || new Date()),
    createdById: String(input.created_by_id || input.createdById || "").trim(),
    createdByName: String(input.created_by_name || input.createdByName || "Admin").trim() || "Admin",
    target: String(input.target || "agents").trim() || "agents",
    message:
      String(input.message || "").trim() ||
      "Sila follow up semua lead dalam Log Lead dan kemas kini status.",
  };

  const row = new Array(headers.length).fill("");
  setRowValueBySpec_(headers, row, REMINDER_FIELD_ALIASES, "id", reminder.id);
  setRowValueBySpec_(headers, row, REMINDER_FIELD_ALIASES, "createdAt", reminder.createdAt);
  setRowValueBySpec_(headers, row, REMINDER_FIELD_ALIASES, "createdById", reminder.createdById);
  setRowValueBySpec_(headers, row, REMINDER_FIELD_ALIASES, "createdByName", reminder.createdByName);
  setRowValueBySpec_(headers, row, REMINDER_FIELD_ALIASES, "target", reminder.target);
  setRowValueBySpec_(headers, row, REMINDER_FIELD_ALIASES, "message", reminder.message);
  sheet.appendRow(row);

  const maxRowsToKeep = 80;
  const extraRows = sheet.getLastRow() - 1 - maxRowsToKeep;
  if (extraRows > 0) {
    sheet.deleteRows(2, extraRows);
  }

  sendFollowUpReminderPush_(spreadsheet, reminder);
  return { ok: true, reminder };
}

function registerPushSubscription_(payload) {
  const subscription = payload.subscription || {};
  const keys = subscription.keys || {};
  const endpoint = String(subscription.endpoint || "").trim();
  const p256dh = String(keys.p256dh || subscription.p256dh || "").trim();
  const auth = String(keys.auth || subscription.auth || "").trim();
  const agent = payload.agent || {};

  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: "Push subscription tidak lengkap." };
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, PUSH_SUBSCRIPTIONS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, PUSH_HEADERS, PUSH_FIELD_ALIASES);
  const values = sheet.getDataRange().getDisplayValues();
  const endpointIndex = headers.findIndex((header) => PUSH_FIELD_ALIASES.endpoint.includes(header));
  let rowNumber = 0;

  for (let index = 1; index < values.length; index += 1) {
    const rowEndpoint = endpointIndex >= 0 ? String(values[index][endpointIndex] || "").trim() : "";
    if (rowEndpoint === endpoint) {
      rowNumber = index + 1;
      break;
    }
  }

  const row = rowNumber ? values[rowNumber - 1].slice(0, headers.length) : new Array(headers.length).fill("");
  while (row.length < headers.length) row.push("");
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "endpoint", endpoint);
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "p256dh", p256dh);
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "auth", auth);
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "agentId", String(agent.id || agent.agent_id || "").trim());
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "agentEmail", String(agent.email || agent.emel || "").trim().toLowerCase());
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "agentName", String(agent.name || agent.nama || "").trim());
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "role", String(agent.role || "agent").trim());
  setRowValueBySpec_(
    headers,
    row,
    PUSH_FIELD_ALIASES,
    "active",
    normalizeAgentActive_(agent.active ?? agent.status ?? "active"),
  );
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "userAgent", String(payload.user_agent || payload.userAgent || "").trim());
  setRowValueBySpec_(headers, row, PUSH_FIELD_ALIASES, "updatedAt", canonicalLeadTimestamp_(new Date()));

  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { ok: true, updated: true };
  }

  sheet.appendRow(row);
  return { ok: true, registered: true };
}

function appendLead_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  const headers = ensureRequiredHeaders_(sheet);
  const lead = {
    id: String(input.id || input.lead_id || Utilities.getUuid()).trim(),
    createdAt: canonicalLeadTimestamp_(input.created_at || input.createdAt || new Date()),
    name: String(input.name || input.nama || input.full_name || "").trim(),
    phone: String(input.phone || input.phone_number || input.mobile || "").trim(),
    email: String(input.email || input.emel || input.email_address || "").trim(),
    city: String(input.city || input.bandar || "").trim(),
    project: String(input.project || input.projek || input.project_name || "Tidak dinyatakan").trim(),
    status: canonicalSheetStatus_(input.status || "new"),
    source: canonicalLeadSource_(input.source || input.sumber || input.platform || "Manual Lead"),
  };

  if (!lead.name || !lead.phone) {
    return { ok: false, error: "Nama dan nombor telefon diperlukan." };
  }

  const duplicate = readLeads_(sheet).some((item) => String(item.id || "").trim() === lead.id);
  if (duplicate) return { ok: true, duplicate: true, lead };

  const row = new Array(headers.length).fill("");
  setRowValue_(headers, row, "createdAt", lead.createdAt);
  setRowValue_(headers, row, "name", lead.name);
  setRowValue_(headers, row, "phone", lead.phone);
  setRowValue_(headers, row, "email", lead.email);
  setRowValue_(headers, row, "city", lead.city);
  setRowValue_(headers, row, "project", lead.project);
  setRowValue_(headers, row, "status", lead.status);
  setRowValue_(headers, row, "source", lead.source);
  setRowValue_(headers, row, "id", lead.id);
  sheet.appendRow(row);
  notifyUnsentLeadPushes_(spreadsheet, sheet, headers);

  return { ok: true, lead };
}

function deleteLead_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  const headers = ensureRequiredHeaders_(sheet);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { ok: true, deleted: 0 };

  const id = String(input.id || input.lead_id || "").trim();
  const phone = String(input.phone || input.phone_number || "").trim();
  const project = String(input.project || input.projek || "").trim();
  const idIndex = headers.findIndex((header) => FIELD_ALIASES.id.includes(header));
  const phoneIndex = headers.findIndex((header) => FIELD_ALIASES.phone.includes(header));
  const projectIndex = headers.findIndex((header) => FIELD_ALIASES.project.includes(header));
  let deleted = 0;

  for (let rowNumber = values.length; rowNumber >= 2; rowNumber -= 1) {
    const row = values[rowNumber - 1];
    const rowId = idIndex >= 0 ? String(row[idIndex] || "").trim() : "";
    const rowPhone = phoneIndex >= 0 ? String(row[phoneIndex] || "").trim() : "";
    const rowProject = projectIndex >= 0 ? String(row[projectIndex] || "").trim() : "";
    const idMatches = id && rowId === id;
    const fallbackMatches = !id && phone && project && rowPhone === phone && rowProject === project;

    if (idMatches || fallbackMatches) {
      sheet.deleteRow(rowNumber);
      deleted += 1;
    }
  }

  return { ok: true, deleted };
}

function updateLeadStatus_(input) {
  // Status edits are independent from assignment revisions and must not wait for
  // push delivery. The minute queue trigger will release or assign the next lead.
  return updateLeadStatusLocked_(input);
}

function updateLeadNotes_(input) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: "Agihan lead sedang berjalan." };
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    const headers = ensureRequiredHeaders_(sheet);
    const values = sheet.getDataRange().getDisplayValues();
    const id = String(input.id || input.lead_id || "").trim();
    const phone = String(input.phone || input.phone_number || "").trim();
    const project = String(input.project || input.projek || "").trim();
    const requestedAgentId = String(input.assigned_agent_id || input.assignedAgentId || "").trim();
    const requestedRevision = Number(input.assignment_revision ?? input.assignmentRevision);

    for (let rowNumber = 2; rowNumber <= values.length; rowNumber += 1) {
      const row = values[rowNumber - 1];
      const rowId = getCell_(headers, row, "id");
      const fallbackMatches = !id && phone && project && getCell_(headers, row, "phone") === phone &&
        getCell_(headers, row, "project") === project;
      if (!(id && rowId === id) && !fallbackMatches) continue;

      const currentRevision = Number(getCell_(headers, row, "assignmentRevision")) || 0;
      if (Number.isFinite(requestedRevision) && requestedRevision !== currentRevision) {
        return { ok: false, stale: true, error: "Assignment lead telah berubah." };
      }
      const currentAgentId = getCell_(headers, row, "assignedAgentId");
      if (requestedAgentId && currentAgentId && requestedAgentId !== currentAgentId) {
        return { ok: false, error: "Lead ini milik ejen lain." };
      }

      const nextRow = row.slice(0, headers.length);
      setRowValue_(headers, nextRow, "notes", String(input.notes ?? input.nota ?? "").trim());
      sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);
      return { ok: true, updated: 1 };
    }
    return { ok: false, error: "Lead tidak dijumpai." };
  } finally {
    lock.releaseLock();
  }
}

function rebalanceLeadQueue_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  return notifyUnsentLeadPushes_(spreadsheet, sheet, ensureRequiredHeaders_(sheet));
}

function updateLeadStatusLocked_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  const headers = ensureRequiredHeaders_(sheet);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { ok: true, updated: 0 };

  const status = canonicalSheetStatus_(input.status || "new");
  const id = String(input.id || input.lead_id || "").trim();
  const phone = String(input.phone || input.phone_number || "").trim();
  const project = String(input.project || input.projek || "").trim();
  const idIndex = headers.findIndex((header) => FIELD_ALIASES.id.includes(header));
  const phoneIndex = headers.findIndex((header) => FIELD_ALIASES.phone.includes(header));
  const projectIndex = headers.findIndex((header) => FIELD_ALIASES.project.includes(header));
  const statusIndex = headers.findIndex((header) => FIELD_ALIASES.status.includes(header));
  const actingAgentId = String(input.acting_agent_id || input.actingAgentId || "").trim();
  const actingAgentName = String(input.acting_agent_name || input.actingAgentName || "").trim();
  const actingAgentEmail = String(input.acting_agent_email || input.actingAgentEmail || "").trim().toLowerCase();
  const actingRole = String(input.acting_role || input.actingRole || "").trim().toLowerCase();
  if (statusIndex < 0) return { ok: false, error: "Kolum Status tidak dijumpai." };

  let updated = 0;
  let latestStatusRevision = 0;
  let latestStatusUpdatedAt = "";
  for (let rowNumber = 2; rowNumber <= values.length; rowNumber += 1) {
    const row = values[rowNumber - 1];
    const rowId = idIndex >= 0 ? String(row[idIndex] || "").trim() : "";
    const rowPhone = phoneIndex >= 0 ? String(row[phoneIndex] || "").trim() : "";
    const rowProject = projectIndex >= 0 ? String(row[projectIndex] || "").trim() : "";
    const idMatches = id && rowId === id;
    const fallbackMatches = !id && phone && project && rowPhone === phone && rowProject === project;

    if (idMatches || fallbackMatches) {
      const stage = normalizeLeadStage_(status);
      const requiresAgentNote = ["passed", "rejected", "cancelled"].includes(stage);
      const isAgentAction = actingRole === "agent" || Boolean(actingAgentId);
      if (isAgentAction && requiresAgentNote && !getCell_(headers, row, "notes").trim()) {
        return {
          ok: false,
          note_required: true,
          error: `Simpan nota dahulu sebelum status ditukar kepada ${status}.`,
        };
      }
      // Status has its own revision. Assignment revisions only protect runtime actions
      // such as expiring or reassigning a lead, so a valid status edit from another
      // signed-in device cannot be discarded after the lead's assignment changes.
      const nextRow = row.slice(0, headers.length);
      nextRow[statusIndex] = status;
      const statusRevision = (Number(getCell_(headers, row, "statusRevision")) || 0) + 1;
      const statusUpdatedAt = new Date().toISOString();
      setRowValue_(headers, nextRow, "statusRevision", String(statusRevision));
      setRowValue_(headers, nextRow, "statusUpdatedAt", statusUpdatedAt);
      latestStatusRevision = statusRevision;
      latestStatusUpdatedAt = statusUpdatedAt;
      if (normalizeLeadStage_(status) === "new") {
        holdLeadRuntimeRow_(sheet, headers, rowNumber, nextRow);
        updated += 1;
        if (idMatches) break;
        continue;
      } else {
        if (normalizeLeadStage_(status) === "contacted") {
          const currentAgentId = getCell_(headers, nextRow, "assignedAgentId");
          if (actingAgentId && currentAgentId && actingAgentId !== currentAgentId) {
            return { ok: false, error: "Lead ini telah dimiliki ejen lain." };
          }
          if (actingAgentId) {
            setRowValue_(headers, nextRow, "assignedAgentId", actingAgentId);
            if (actingAgentName) setRowValue_(headers, nextRow, "assignedAgentName", actingAgentName);
            if (actingAgentEmail) setRowValue_(headers, nextRow, "assignedAgentEmail", actingAgentEmail);
          }
          markLatestAssignmentOutcome_(headers, nextRow, "contacted", new Date());
        }
        setRowValue_(headers, nextRow, "expiresAt", "");
        setRowValue_(headers, nextRow, "queueState", normalizeLeadStage_(status));
      }
      sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);
      updated += 1;
      if (idMatches) break;
    }
  }

  if (!updated) return { ok: false, error: "Lead tidak dijumpai." };
  return {
    ok: true,
    updated,
    status,
    status_revision: latestStatusRevision,
    status_updated_at: latestStatusUpdatedAt,
  };
}

function expireLead_(input) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: "Agihan lead sedang berjalan." };
  let result;
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    const headers = ensureRequiredHeaders_(sheet);
    const values = sheet.getDataRange().getDisplayValues();
    const id = String(input.id || input.lead_id || "").trim();
    const requestedRevision = Number(input.assignment_revision ?? input.assignmentRevision);
    for (let index = 1; index < values.length; index += 1) {
      const lead = mapRow_(headers, values[index], index + 1);
      if (lead.id !== id) continue;
      const currentRevision = Number(lead.assignment_revision) || 0;
      if (!Number.isFinite(requestedRevision) || requestedRevision !== currentRevision) {
        result = { ok: false, stale: true, error: "Assignment lead telah berubah." };
        break;
      }
      if (normalizeLeadStage_(lead.status) !== "new" || lead.queue_state === "queued") {
        result = { ok: false, stale: true, error: "Lead bukan lagi aktif." };
        break;
      }
      const row = values[index].slice(0, headers.length);
      const currentQueueCycle = Number(
        PropertiesService.getScriptProperties().getProperty("leadlaju_queue_cycle") || 0,
      );
      markLatestAssignmentOutcome_(headers, row, "missed", new Date(), currentQueueCycle);
      setRowValue_(headers, row, "passCount", String((Number(lead.pass_count) || 0) + 1));
      const retryAfterCycle = currentQueueCycle + 1;
      setRowValue_(headers, row, "retryAfterCycle", String(retryAfterCycle));
      holdLeadRuntimeRow_(sheet, headers, index + 1, row, { queuedAt: new Date() });
      result = { ok: true, expired: 1 };
      break;
    }
    if (!result) result = { ok: false, error: "Lead tidak dijumpai." };
  } finally {
    lock.releaseLock();
  }
  if (result.ok) {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    notifyUnsentLeadPushes_(spreadsheet, sheet, ensureRequiredHeaders_(sheet));
  }
  return result;
}

function updateLeadRuntime_(input) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: "Agihan lead sedang berjalan." };
  try {
    return updateLeadRuntimeLocked_(input);
  } finally {
    lock.releaseLock();
  }
}

function updateLeadRuntimeLocked_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  const headers = ensureRequiredHeaders_(sheet);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { ok: true, updated: 0 };

  const id = String(input.id || input.lead_id || "").trim();
  const phone = String(input.phone || input.phone_number || "").trim();
  const project = String(input.project || input.projek || "").trim();
  const idIndex = headers.findIndex((header) => FIELD_ALIASES.id.includes(header));
  const phoneIndex = headers.findIndex((header) => FIELD_ALIASES.phone.includes(header));
  const projectIndex = headers.findIndex((header) => FIELD_ALIASES.project.includes(header));

  let updated = 0;
  for (let rowNumber = 2; rowNumber <= values.length; rowNumber += 1) {
    const row = values[rowNumber - 1];
    const rowId = idIndex >= 0 ? String(row[idIndex] || "").trim() : "";
    const rowPhone = phoneIndex >= 0 ? String(row[phoneIndex] || "").trim() : "";
    const rowProject = projectIndex >= 0 ? String(row[projectIndex] || "").trim() : "";
    const idMatches = id && rowId === id;
    const fallbackMatches = phone && project && rowPhone === phone && rowProject === project;

    if (idMatches || fallbackMatches) {
      const currentRevision = Number(getCell_(headers, row, "assignmentRevision")) || 0;
      const requestedRevision = Number(input.assignment_revision ?? input.assignmentRevision);
      if (!Number.isFinite(requestedRevision) || requestedRevision !== currentRevision) {
        return { ok: false, stale: true, error: "Assignment lead telah berubah." };
      }
      const nextRow = row.slice(0, headers.length);
      setRowValue_(headers, nextRow, "assignedAgentId", String(input.assigned_agent_id || input.assignedAgentId || "").trim());
      setRowValue_(headers, nextRow, "assignedAgentEmail", String(input.assigned_agent_email || input.assignedAgentEmail || "").trim());
      setRowValue_(headers, nextRow, "assignedAgentName", String(input.assigned_agent_name || input.assignedAgentName || "").trim());
      setRowValue_(headers, nextRow, "receivedAt", input.received_at || input.receivedAt ? canonicalLeadTimestamp_(input.received_at || input.receivedAt) : "");
      setRowValue_(headers, nextRow, "expiresAt", input.expires_at || input.expiresAt ? canonicalLeadTimestamp_(input.expires_at || input.expiresAt) : "");
      setRowValue_(headers, nextRow, "queueState", String(input.queue_state || input.queueState || "").trim());
      setRowValue_(headers, nextRow, "passCount", String(input.pass_count ?? input.passCount ?? 0).trim());
      setRowValue_(headers, nextRow, "assignmentRevision", String(currentRevision + 1));
      const candidate = mapRow_(headers, nextRow, rowNumber);
      if (candidate.queue_state === "active" && values.some((otherRow, index) => {
        if (index === 0 || index === rowNumber - 1) return false;
        const other = mapRow_(headers, otherRow, index + 1);
        return normalizeLeadStage_(other.status) === "new" && other.queue_state !== "queued" &&
          Boolean(findLeadAgent_([{
            id: candidate.assigned_agent_id,
            email: candidate.assigned_agent_email,
            name: candidate.assigned_agent_name,
          }], other));
      })) {
        holdLeadRuntimeRow_(sheet, headers, rowNumber, nextRow);
        updated += 1;
        continue;
      }
      sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);
      updated += 1;
    }
  }

  reconcileSingleActiveLead_(sheet, headers);
  return { ok: true, updated };
}

function leadAgentKey_(lead) {
  const id = String(lead.assigned_agent_id || "").trim();
  if (id) return `id:${id}`;
  const email = String(lead.assigned_agent_email || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(lead.assigned_agent_name || "").trim().toLowerCase();
  return name ? `name:${name}` : "";
}

function reconcileSingleActiveLead_(sheet, headers) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { queued: 0 };

  const candidates = [];
  for (let index = 1; index < values.length; index += 1) {
    const lead = mapRow_(headers, values[index], index + 1);
    const agentKey = leadAgentKey_(lead);
    if (!agentKey || normalizeLeadStage_(lead.status) !== "new" || lead.queue_state === "queued") continue;
    candidates.push({
      agentKey,
      rowNumber: index + 1,
      row: values[index].slice(0, headers.length),
      receivedAt: lead.received_at ? parseLeadTimestamp_(lead.received_at).getTime() : Number.MAX_SAFE_INTEGER,
    });
  }

  candidates.sort((a, b) => a.receivedAt - b.receivedAt || a.rowNumber - b.rowNumber);
  const occupied = new Set();
  let queued = 0;
  candidates.forEach((candidate) => {
    if (!occupied.has(candidate.agentKey)) {
      occupied.add(candidate.agentKey);
      return;
    }
    holdLeadRuntimeRow_(sheet, headers, candidate.rowNumber, candidate.row);
    queued += 1;
  });
  return { queued };
}

function replaceAgents_(agentsInput) {
  if (!Array.isArray(agentsInput)) {
    return { ok: false, error: "Senarai ejen tidak sah." };
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  const rows = agentsInput
    .map((input) => ({
      id: String(input.id || input.user_id || input.agent_id || "").trim(),
      name: String(input.name || input.nama || input.full_name || "").trim(),
      phone: String(input.phone || input.phone_number || input.mobile || "").trim(),
      email: String(input.email || input.emel || input.email_address || "").trim(),
      role: String(input.role || "agent").trim(),
      active: normalizeAgentActive_(input.active ?? input.status ?? "active"),
      leadsHandled: String(input.leads_handled ?? input.leadsHandled ?? 0).trim(),
      createdAt: String(input.created_at || input.createdAt || new Date().toISOString()).trim(),
      password: String(input.password || input.kata_laluan || input.temporary_password || "").trim(),
      cooldownUntil: String(input.cooldown_until || input.cooldownUntil || "").trim(),
      eligibleProjectIds: normalizeProjectIds_(input.eligible_project_ids || input.eligibleProjectIds),
    }))
    .filter((agent) => agent.id && agent.name && agent.email)
    .map((agent) => buildAgentRow_(headers, agent));

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  return { ok: true, count: rows.length };
}

function upsertAgent_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  const projectsSheet = getOrCreateSheet_(spreadsheet, PROJECTS_SHEET_NAME);
  const projectHeaders = ensureRequiredHeadersBySpec_(projectsSheet, PROJECT_HEADERS, PROJECT_FIELD_ALIASES);
  const agent = {
    id: String(input.id || input.user_id || input.agent_id || "").trim(),
    name: String(input.name || input.nama || input.full_name || "").trim(),
    phone: String(input.phone || input.phone_number || input.mobile || "").trim(),
    email: String(input.email || input.emel || input.email_address || "").trim(),
    role: String(input.role || "agent").trim(),
    active: normalizeAgentActive_(input.active ?? input.status ?? "active"),
    leadsHandled: String(input.leads_handled ?? input.leadsHandled ?? 0).trim(),
    createdAt: String(input.created_at || input.createdAt || new Date().toISOString()).trim(),
    password: String(input.password || input.kata_laluan || input.temporary_password || "").trim(),
    cooldownUntil: String(input.cooldown_until || input.cooldownUntil || "").trim(),
    eligibleProjectIds: normalizeProjectIds_(input.eligible_project_ids || input.eligibleProjectIds),
  };

  if (!agent.name || !agent.email) {
    return { ok: false, error: "Nama dan emel ejen diperlukan." };
  }
  if (agent.role !== "admin" && !agent.eligibleProjectIds.length) {
    return { ok: false, error: "Pilih sekurang-kurangnya satu projek untuk ejen." };
  }
  if (agent.role !== "admin") {
    const activeProjectIds = new Set(readProjects_(projectsSheet, projectHeaders)
      .filter((project) => project.active)
      .map((project) => project.id));
    if (agent.eligibleProjectIds.some((projectId) => !activeProjectIds.has(projectId))) {
      return { ok: false, error: "Pilihan projek tidak sah atau projek sudah dinyahaktifkan." };
    }
  }

  const values = sheet.getDataRange().getDisplayValues();
  const idIndex = headers.findIndex((header) => AGENT_FIELD_ALIASES.id.includes(header));
  const emailIndex = headers.findIndex((header) => AGENT_FIELD_ALIASES.email.includes(header));
  let rowNumber = 0;

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index];
    const rowId = idIndex >= 0 ? String(row[idIndex] || "").trim() : "";
    const rowEmail = emailIndex >= 0 ? String(row[emailIndex] || "").trim().toLowerCase() : "";
    if (rowId === agent.id || rowEmail === agent.email.toLowerCase()) {
      rowNumber = index + 1;
      break;
    }
  }

  const row = buildAgentRow_(headers, agent, rowNumber ? values[rowNumber - 1] : null);
  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { ok: true, updated: true, agent };
  }

  sheet.appendRow(row);
  return { ok: true, agent };
}

function deleteAgent_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { ok: true, deleted: 0 };

  const id = String(input.id || input.user_id || input.agent_id || "").trim();
  const email = String(input.email || input.emel || "").trim().toLowerCase();
  const idIndex = headers.findIndex((header) => AGENT_FIELD_ALIASES.id.includes(header));
  const emailIndex = headers.findIndex((header) => AGENT_FIELD_ALIASES.email.includes(header));
  let deleted = 0;

  for (let rowNumber = values.length; rowNumber >= 2; rowNumber -= 1) {
    const row = values[rowNumber - 1];
    const rowId = idIndex >= 0 ? String(row[idIndex] || "").trim() : "";
    const rowEmail = emailIndex >= 0 ? String(row[emailIndex] || "").trim().toLowerCase() : "";
    if ((id && rowId === id) || (email && rowEmail === email)) {
      sheet.deleteRow(rowNumber);
      deleted += 1;
    }
  }

  return { ok: true, deleted };
}

function buildAgentRow_(headers, agent, existingRow) {
  const row = existingRow ? existingRow.slice(0, headers.length) : new Array(headers.length).fill("");
  while (row.length < headers.length) row.push("");
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "id", agent.id);
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "name", agent.name);
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "phone", agent.phone);
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "email", agent.email);
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "role", agent.role || "agent");
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "active", agent.active);
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "leadsHandled", agent.leadsHandled || "0");
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "createdAt", agent.createdAt);
  if (agent.password) {
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "password", agent.password);
  }
  setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "cooldownUntil", agent.cooldownUntil || "");
  if (agent.eligibleProjectIds !== undefined) {
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "eligibleProjectIds", JSON.stringify(agent.eligibleProjectIds));
  }
  if (agent.notificationEnabled !== undefined) setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "notificationEnabled", agent.notificationEnabled ? "yes" : "no");
  if (agent.lastSeenAt !== undefined) setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "lastSeenAt", agent.lastSeenAt || "");
  if (agent.presenceNotBefore !== undefined) setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "presenceNotBefore", agent.presenceNotBefore || "");
  return row;
}

function updateAgentPresence_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  const values = sheet.getDataRange().getDisplayValues();
  const id = String(input.id || "").trim();
  for (let index = 1; index < values.length; index += 1) {
    if (getCellBySpec_(headers, values[index], AGENT_FIELD_ALIASES, "id") !== id) continue;
    const row = values[index].slice(0, headers.length);
    const online = Boolean(input.online);
    const sessionStartedRaw = String(input.session_started_at || input.sessionStartedAt || "").trim();
    const sessionStartedAt = sessionStartedRaw ? parseLeadTimestamp_(sessionStartedRaw).getTime() : 0;
    const presenceNotBefore = getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "presenceNotBefore");
    if (online && presenceNotBefore && (!sessionStartedAt || sessionStartedAt < parseLeadTimestamp_(presenceNotBefore).getTime())) {
      return { ok: false, revoked: true, error: "Sesi ini telah dipaksa offline oleh admin." };
    }
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "notificationEnabled", input.notification_enabled ? "yes" : "no");
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "lastSeenAt", online ? canonicalLeadTimestamp_(new Date()) : "");
    sheet.getRange(index + 1, 1, 1, row.length).setValues([row]);
    return { ok: true, online };
  }
  return { ok: false, error: "Ejen tidak dijumpai." };
}

function forceAgentOffline_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  const values = sheet.getDataRange().getDisplayValues();
  const id = String(input.id || "").trim();
  for (let index = 1; index < values.length; index += 1) {
    if (getCellBySpec_(headers, values[index], AGENT_FIELD_ALIASES, "id") !== id) continue;
    const row = values[index].slice(0, headers.length);
    const now = canonicalLeadTimestamp_(new Date());
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "notificationEnabled", "no");
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "lastSeenAt", "");
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "presenceNotBefore", now);
    sheet.getRange(index + 1, 1, 1, row.length).setValues([row]);
    return { ok: true, id, forced_offline_at: now };
  }
  return { ok: false, error: "Ejen tidak dijumpai." };
}

function readAgents_(sheet, headers) {
  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  return values.slice(1)
    .map((row) => ({
      id: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "id"),
      name: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "name"),
      phone: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "phone"),
      email: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "email"),
      role: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "role") || "agent",
      active: normalizeAgentActive_(getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "active")),
      leads_handled: Number(getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "leadsHandled")) || 0,
      created_at: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "createdAt"),
      password: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "password"),
      cooldown_until: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "cooldownUntil"),
      eligible_project_ids: normalizeProjectIds_(getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "eligibleProjectIds")),
      notification_enabled: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "notificationEnabled") === "yes",
      last_seen_at: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "lastSeenAt"),
      online: getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "notificationEnabled") === "yes" &&
        Boolean(getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "lastSeenAt")) &&
        Date.now() - parseLeadTimestamp_(getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "lastSeenAt")).getTime() < AGENT_PRESENCE_TIMEOUT_MINUTES * 60 * 1000,
    }))
    .filter((agent) => agent.name && agent.email);
}

function countHandledLeadsByAgent_(leads) {
  const counts = new Map();
  (Array.isArray(leads) ? leads : []).forEach((lead) => {
    const agentId = String(lead.assigned_agent_id || "").trim();
    if (!agentId || normalizeLeadStage_(lead.status) === "new") return;
    counts.set(agentId, (counts.get(agentId) || 0) + 1);
  });
  return counts;
}

function syncAgentHandledCounts_(leads, sheet, headers) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const handledIndex = headers.findIndex((header) => AGENT_FIELD_ALIASES.leadsHandled.includes(header));
  if (handledIndex < 0) return 0;

  const values = sheet.getDataRange().getDisplayValues();
  const counts = countHandledLeadsByAgent_(leads);
  let changed = 0;
  const nextValues = values.slice(1).map((row) => {
    const role = getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "role") || "agent";
    const agentId = getCellBySpec_(headers, row, AGENT_FIELD_ALIASES, "id");
    const current = Number(row[handledIndex]) || 0;
    const next = role === "agent" ? counts.get(agentId) || 0 : current;
    if (next !== current) changed += 1;
    return [next];
  });
  if (changed) sheet.getRange(2, handledIndex + 1, nextValues.length, 1).setValues(nextValues);
  return changed;
}

function clearExpiredAgentCooldowns_(sheet, headers, now) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getDataRange().getDisplayValues();
  const currentTime = now instanceof Date ? now.getTime() : Date.now();
  let cleared = 0;
  values.slice(1).forEach((value, index) => {
    const cooldown = getCellBySpec_(headers, value, AGENT_FIELD_ALIASES, "cooldownUntil");
    if (!cooldown || parseLeadTimestamp_(cooldown).getTime() > currentTime) return;
    const row = value.slice(0, headers.length);
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "cooldownUntil", "");
    sheet.getRange(index + 2, 1, 1, row.length).setValues([row]);
    cleared += 1;
  });
  return cleared;
}

function normalizeProjectIds_(value) {
  const raw = Array.isArray(value) ? value : (() => {
    try { return JSON.parse(String(value || "[]")); } catch (error) { return String(value || "").split(","); }
  })();
  return Array.from(new Set((Array.isArray(raw) ? raw : []).map((id) => String(id || "").trim()).filter(Boolean)));
}

function normalizeProjectName_(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function readProjects_(sheet, headers) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  return values.slice(1).map((row) => ({
    id: getCellBySpec_(headers, row, PROJECT_FIELD_ALIASES, "id"),
    name: getCellBySpec_(headers, row, PROJECT_FIELD_ALIASES, "name"),
    active: normalizeAgentActive_(getCellBySpec_(headers, row, PROJECT_FIELD_ALIASES, "active")) === "active",
    created_at: getCellBySpec_(headers, row, PROJECT_FIELD_ALIASES, "createdAt"),
  })).filter((project) => project.id && project.name);
}

function ensureProjectsFromLeads_(sheet, headers, leads) {
  const existing = readProjects_(sheet, headers);
  // Seed only the first time. New project names require an explicit admin action.
  if (existing.length) return existing;
  const knownNames = new Set(existing.map((project) => normalizeProjectName_(project.name)));
  const additions = [];
  (leads || []).forEach((lead) => {
    const name = String(lead.project || "").trim().replace(/\s+/g, " ");
    const key = normalizeProjectName_(name);
    if (!name || knownNames.has(key)) return;
    knownNames.add(key);
    additions.push({ id: `project-${Utilities.getUuid()}`, name, active: true, created_at: canonicalLeadTimestamp_(new Date()) });
  });
  // The original rollout has two known projects. Keep the migration usable even
  // when a legacy sheet was cleared before this version is first opened.
  if (!additions.length) {
    INITIAL_PROJECT_NAMES.forEach((name) => {
      const key = normalizeProjectName_(name);
      if (knownNames.has(key)) return;
      knownNames.add(key);
      additions.push({ id: `project-${Utilities.getUuid()}`, name, active: true, created_at: canonicalLeadTimestamp_(new Date()) });
    });
  }
  if (additions.length) {
    const rows = additions.map((project) => buildProjectRow_(headers, project));
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }
  return existing.concat(additions);
}

function buildProjectRow_(headers, project, existingRow) {
  const row = existingRow ? existingRow.slice(0, headers.length) : new Array(headers.length).fill("");
  setRowValueBySpec_(headers, row, PROJECT_FIELD_ALIASES, "id", project.id);
  setRowValueBySpec_(headers, row, PROJECT_FIELD_ALIASES, "name", project.name);
  setRowValueBySpec_(headers, row, PROJECT_FIELD_ALIASES, "active", project.active ? "active" : "inactive");
  setRowValueBySpec_(headers, row, PROJECT_FIELD_ALIASES, "createdAt", project.created_at || canonicalLeadTimestamp_(new Date()));
  return row;
}

function upsertProject_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, PROJECTS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, PROJECT_HEADERS, PROJECT_FIELD_ALIASES);
  const name = String(input.name || input.project || input.nama || "").trim().replace(/\s+/g, " ");
  const id = String(input.id || input.project_id || "").trim() || `project-${Utilities.getUuid()}`;
  if (!name) return { ok: false, error: "Nama projek diperlukan." };
  const values = sheet.getDataRange().getDisplayValues();
  let rowNumber = 0;
  for (let index = 1; index < values.length; index += 1) {
    const rowId = getCellBySpec_(headers, values[index], PROJECT_FIELD_ALIASES, "id");
    const rowName = getCellBySpec_(headers, values[index], PROJECT_FIELD_ALIASES, "name");
    if (rowId === id || (!input.id && normalizeProjectName_(rowName) === normalizeProjectName_(name))) {
      rowNumber = index + 1;
      break;
    }
  }
  const project = { id, name, active: normalizeAgentActive_(input.active ?? input.status ?? "active") === "active", created_at: canonicalLeadTimestamp_(input.created_at || new Date()) };
  const row = buildProjectRow_(headers, project, rowNumber ? values[rowNumber - 1] : null);
  if (rowNumber) sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true, project };
}

function ensureAgentProjectEligibility_(sheet, headers, projects) {
  const projectIds = projects.filter((project) => project.active).map((project) => project.id);
  if (!projectIds.length || sheet.getLastRow() < 2) return;
  const values = sheet.getDataRange().getDisplayValues();
  values.slice(1).forEach((value, index) => {
    const role = getCellBySpec_(headers, value, AGENT_FIELD_ALIASES, "role");
    const active = normalizeAgentActive_(getCellBySpec_(headers, value, AGENT_FIELD_ALIASES, "active"));
    if (roleIsAdmin_(role) || active !== "active") return;
    const eligible = normalizeProjectIds_(getCellBySpec_(headers, value, AGENT_FIELD_ALIASES, "eligibleProjectIds"));
    if (eligible.length) return;
    const row = value.slice(0, headers.length);
    setRowValueBySpec_(headers, row, AGENT_FIELD_ALIASES, "eligibleProjectIds", JSON.stringify(projectIds));
    sheet.getRange(index + 2, 1, 1, row.length).setValues([row]);
  });
}

function readLatestReminder_(sheet, headers) {
  if (!sheet) return null;

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return null;

  for (let index = values.length - 1; index >= 1; index -= 1) {
    const row = values[index];
    const id = getCellBySpec_(headers, row, REMINDER_FIELD_ALIASES, "id");
    if (!id) continue;
    return {
      id,
      created_at: getCellBySpec_(headers, row, REMINDER_FIELD_ALIASES, "createdAt"),
      created_by_id: getCellBySpec_(headers, row, REMINDER_FIELD_ALIASES, "createdById"),
      created_by_name: getCellBySpec_(headers, row, REMINDER_FIELD_ALIASES, "createdByName") || "Admin",
      target: getCellBySpec_(headers, row, REMINDER_FIELD_ALIASES, "target") || "agents",
      message: getCellBySpec_(headers, row, REMINDER_FIELD_ALIASES, "message"),
    };
  }

  return null;
}

function readPushSubscriptions_(spreadsheet, options) {
  const sheet = getOrCreateSheet_(spreadsheet, PUSH_SUBSCRIPTIONS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, PUSH_HEADERS, PUSH_FIELD_ALIASES);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const agentsSheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
  const agentHeaders = ensureRequiredHeadersBySpec_(agentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  const activeAgents = readAgents_(agentsSheet, agentHeaders).filter(
    (agent) => agent.active === "active",
  );
  const activeAgentIds = new Set(activeAgents.map((agent) => String(agent.id || "").trim()).filter(Boolean));
  const activeAgentEmails = new Set(activeAgents.map((agent) => String(agent.email || "").trim().toLowerCase()).filter(Boolean));

  return values.slice(1)
    .map((row) => {
      const agentId = getCellBySpec_(headers, row, PUSH_FIELD_ALIASES, "agentId");
      const agentEmail = getCellBySpec_(headers, row, PUSH_FIELD_ALIASES, "agentEmail").toLowerCase();
      const role = getCellBySpec_(headers, row, PUSH_FIELD_ALIASES, "role") || "agent";
      const active = normalizeAgentActive_(getCellBySpec_(headers, row, PUSH_FIELD_ALIASES, "active"));
      return {
        endpoint: getCellBySpec_(headers, row, PUSH_FIELD_ALIASES, "endpoint"),
        p256dh: getCellBySpec_(headers, row, PUSH_FIELD_ALIASES, "p256dh"),
        auth: getCellBySpec_(headers, row, PUSH_FIELD_ALIASES, "auth"),
        agentId,
        agentEmail,
        agentName: getCellBySpec_(headers, row, PUSH_FIELD_ALIASES, "agentName"),
        role,
        active,
      };
    })
    .filter((item) => {
      if (!item.endpoint || !item.p256dh || !item.auth) return false;
      if (item.active !== "active") return false;
      if (options && options.agentOnly && roleIsAdmin_(item.role)) return false;
      if (item.agentId && activeAgentIds.has(item.agentId)) return true;
      if (item.agentEmail && activeAgentEmails.has(item.agentEmail)) return true;
      return roleIsAdmin_(item.role) && !options?.agentOnly;
    });
}

function roleIsAdmin_(role) {
  return String(role || "").trim().toLowerCase() === "admin";
}

function subscriptionForApi_(item) {
  return {
    endpoint: item.endpoint,
    keys: {
      p256dh: item.p256dh,
      auth: item.auth,
    },
  };
}

function sendPushViaApi_(spreadsheet, subscriptions, notification) {
  if (!subscriptions.length) return { ok: true, sent: 0, failed: 0 };
  try {
    const response = UrlFetchApp.fetch(PUSH_API_URL, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        secret: PUSH_NOTIFY_SECRET,
        subscriptions: subscriptions.map(subscriptionForApi_),
        notification,
      }),
    });
    const result = JSON.parse(response.getContentText() || "{}");
    if (Array.isArray(result.expired) && result.expired.length) {
      deleteExpiredPushSubscriptions_(spreadsheet, result.expired);
    }
    return result;
  } catch (error) {
    console.warn("Push notification failed", error);
    return { ok: false, error: String(error), sent: 0, failed: subscriptions.length };
  }
}

function deleteExpiredPushSubscriptions_(spreadsheet, endpoints) {
  const expired = new Set(endpoints.map((endpoint) => String(endpoint || "").trim()).filter(Boolean));
  if (!expired.size) return 0;
  const sheet = getOrCreateSheet_(spreadsheet, PUSH_SUBSCRIPTIONS_SHEET_NAME);
  const headers = ensureRequiredHeadersBySpec_(sheet, PUSH_HEADERS, PUSH_FIELD_ALIASES);
  const values = sheet.getDataRange().getDisplayValues();
  const endpointIndex = headers.findIndex((header) => PUSH_FIELD_ALIASES.endpoint.includes(header));
  if (endpointIndex < 0 || values.length < 2) return 0;

  let deleted = 0;
  for (let rowNumber = values.length; rowNumber >= 2; rowNumber -= 1) {
    const endpoint = String(values[rowNumber - 1][endpointIndex] || "").trim();
    if (expired.has(endpoint)) {
      sheet.deleteRow(rowNumber);
      deleted += 1;
    }
  }
  return deleted;
}

function sendFollowUpReminderPush_(spreadsheet, reminder) {
  const subscriptions = readPushSubscriptions_(spreadsheet, { agentOnly: true });
  const notification = {
    title: "Admin remind follow up",
    body: `${reminder.createdByName}: ${reminder.message}`,
    tag: `leadlaju-admin-reminder-${reminder.id}`,
    view: "leads",
    url: "/?view=leads",
    requireInteraction: true,
  };
  return sendPushViaApi_(spreadsheet, subscriptions, notification);
}

function getLeadPushKeys_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty("leadlaju_notified_push_leads") || "[]";
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveLeadPushKeys_(keys) {
  const compacted = Array.from(keys).slice(-500);
  PropertiesService.getScriptProperties().setProperty("leadlaju_notified_push_leads", JSON.stringify(compacted));
}

function getActiveAgentsForPush_(spreadsheet) {
  const agentsSheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
  const agentHeaders = ensureRequiredHeadersBySpec_(agentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  return readAgents_(agentsSheet, agentHeaders).filter(
    (agent) => agent.active === "active" && !roleIsAdmin_(agent.role) &&
      agent.online &&
      (!agent.cooldown_until || parseLeadTimestamp_(agent.cooldown_until).getTime() <= Date.now()),
  );
}

function activeProjectForLead_(projects, lead) {
  const projectName = normalizeProjectName_(lead.project);
  return (projects || []).find((project) => project.active && normalizeProjectName_(project.name) === projectName) || null;
}

function eligibleAgentsForLead_(agents, projects, lead) {
  const project = activeProjectForLead_(projects, lead);
  if (!project) return [];
  return agents.filter((agent) => {
    if (!Array.isArray(agent.eligible_project_ids)) return true;
    return agent.eligible_project_ids.includes(project.id);
  });
}

function findLeadAgent_(agents, lead) {
  const id = String(lead.assigned_agent_id || "").trim();
  const email = String(lead.assigned_agent_email || "").trim().toLowerCase();
  const name = String(lead.assigned_agent_name || "").trim().toLowerCase();
  return agents.find((agent) => {
    if (id && String(agent.id || "").trim() === id) return true;
    if (email && String(agent.email || "").trim().toLowerCase() === email) return true;
    return name && String(agent.name || "").trim().toLowerCase() === name;
  }) || null;
}

function filterSubscriptionsForAgent_(subscriptions, agent) {
  const agentId = String(agent.id || "").trim();
  const agentEmail = String(agent.email || "").trim().toLowerCase();
  return subscriptions.filter((subscription) => {
    if (subscription.agentId) return Boolean(agentId) && subscription.agentId === agentId;
    return Boolean(agentEmail) && subscription.agentEmail === agentEmail;
  });
}

function assignLeadRuntimeRow_(sheet, headers, rowNumber, row, agent, now, retryCycle) {
  const receivedAt = canonicalLeadTimestamp_(now);
  const expiresAt = canonicalLeadTimestamp_(new Date(now.getTime() + RESPONSE_WINDOW_MINUTES * 60 * 1000));
  const nextRow = row.slice(0, headers.length);
  while (nextRow.length < headers.length) nextRow.push("");
  setRowValue_(headers, nextRow, "assignedAgentId", agent.id);
  setRowValue_(headers, nextRow, "assignedAgentEmail", agent.email);
  setRowValue_(headers, nextRow, "assignedAgentName", agent.name);
  setRowValue_(headers, nextRow, "receivedAt", receivedAt);
  setRowValue_(headers, nextRow, "expiresAt", expiresAt);
  setRowValue_(headers, nextRow, "queueState", "active");
  setRowValue_(headers, nextRow, "queuedAt", "");
  setRowValue_(headers, nextRow, "retryAfterCycle", "");
  if (!getCell_(headers, nextRow, "passCount")) setRowValue_(headers, nextRow, "passCount", "0");
  const assignmentRevision = (Number(getCell_(headers, nextRow, "assignmentRevision")) || 0) + 1;
  setRowValue_(headers, nextRow, "assignmentRevision", String(assignmentRevision));
  const history = parseAssignmentHistory_(headers, nextRow);
  history.push({
    agentId: agent.id,
    agentName: agent.name,
    assignedAt: now.toISOString(),
    outcome: "pending",
    resolvedAt: "",
    retryCycle: Number(getCell_(headers, row, "passCount")) > 0 ? Number(retryCycle || 0) : 0,
  });
  setRowValue_(headers, nextRow, "assignmentHistory", JSON.stringify(history));
  sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);
  return {
    assigned_agent_id: agent.id,
    assigned_agent_email: agent.email,
    assigned_agent_name: agent.name,
    received_at: receivedAt,
    expires_at: expiresAt,
    assignment_revision: assignmentRevision,
  };
}

function parseAssignmentHistory_(headers, row) {
  try {
    const parsed = JSON.parse(getCell_(headers, row, "assignmentHistory") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function markLatestAssignmentOutcome_(headers, row, outcome, resolvedAt, retryCycle) {
  const history = parseAssignmentHistory_(headers, row);
  const agentId = getCell_(headers, row, "assignedAgentId");
  const agentName = getCell_(headers, row, "assignedAgentName");
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].agentId === agentId && history[index].outcome === "pending") {
      history[index].outcome = outcome;
      history[index].resolvedAt = resolvedAt.toISOString();
      if (outcome === "missed") history[index].retryCycle = Number(retryCycle || 0);
      setRowValue_(headers, row, "assignmentHistory", JSON.stringify(history));
      return;
    }
  }
  if (agentId) {
    history.push({
      agentId,
      agentName,
      assignedAt: parseLeadTimestamp_(getCell_(headers, row, "receivedAt")).toISOString(),
      outcome,
      resolvedAt: resolvedAt.toISOString(),
      retryCycle: outcome === "missed" ? Number(retryCycle || 0) : 0,
    });
    setRowValue_(headers, row, "assignmentHistory", JSON.stringify(history));
  }
}

function holdLeadRuntimeRow_(sheet, headers, rowNumber, row, options) {
  const nextRow = row.slice(0, headers.length);
  while (nextRow.length < headers.length) nextRow.push("");
  ["assignedAgentId", "assignedAgentEmail", "assignedAgentName", "receivedAt", "expiresAt"].forEach(
    (field) => setRowValue_(headers, nextRow, field, ""),
  );
  setRowValue_(headers, nextRow, "queueState", "queued");
  const queuedAt = options?.queuedAt || getCell_(headers, nextRow, "queuedAt") || new Date();
  setRowValue_(headers, nextRow, "queuedAt", canonicalLeadTimestamp_(queuedAt));
  setRowValue_(
    headers,
    nextRow,
    "assignmentRevision",
    String((Number(getCell_(headers, nextRow, "assignmentRevision")) || 0) + 1),
  );
  sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);
}

function missedAgentIdsForRetryCycle_(lead, queueCycle) {
  return new Set(
    (lead.assignment_history || [])
      .filter((assignment) => assignment.outcome === "missed" && Number(assignment.retryCycle || 0) === queueCycle)
      .map((assignment) => String(assignment.agentId || "").trim())
      .filter(Boolean),
  );
}

function nextAvailableAgentForLead_(lead, agents, occupied, roundRobinIndex, queueCycle) {
  const ordered = [];
  for (let offset = 0; offset < agents.length; offset += 1) {
    const index = (roundRobinIndex + offset) % agents.length;
    const agent = agents[index];
    if (!occupied.has(agent.id)) ordered.push({ agent, index });
  }
  if (!ordered.length) return null;

  if ((Number(lead.pass_count) || 0) > 0) {
    const missedAgentIds = missedAgentIdsForRetryCycle_(lead, queueCycle);
    const untried = ordered.find(({ agent }) => !missedAgentIds.has(agent.id));
    if (untried) return untried;
    if (queueCycle < (Number(lead.retry_after_cycle) || 0)) return null;
  }

  return ordered[0];
}

function notifyUnsentLeadPushes_(spreadsheet, sheet, headers) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: "Push sync sedang berjalan." };

  try {
    reconcileSingleActiveLead_(sheet, headers);
    const values = sheet.getDataRange().getDisplayValues();
    if (values.length < 2) return { ok: true, sent: 0 };

    const projectsSheet = getOrCreateSheet_(spreadsheet, PROJECTS_SHEET_NAME);
    const projectHeaders = ensureRequiredHeadersBySpec_(projectsSheet, PROJECT_HEADERS, PROJECT_FIELD_ALIASES);
    const projects = ensureProjectsFromLeads_(projectsSheet, projectHeaders, readLeads_(sheet));
    const queueAgentsSheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
    const queueAgentHeaders = ensureRequiredHeadersBySpec_(queueAgentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
    ensureAgentProjectEligibility_(queueAgentsSheet, queueAgentHeaders, projects);
    clearExpiredAgentCooldowns_(queueAgentsSheet, queueAgentHeaders);
    const agents = getActiveAgentsForPush_(spreadsheet);

    const subscriptions = readPushSubscriptions_(spreadsheet, { agentOnly: true });

    const notifiedKeys = getLeadPushKeys_();
    const properties = PropertiesService.getScriptProperties();
    let roundRobinIndexes;
    try { roundRobinIndexes = JSON.parse(properties.getProperty("leadlaju_project_round_robin_indexes") || "{}"); } catch (error) { roundRobinIndexes = {}; }
    let queueCycle = Number(properties.getProperty("leadlaju_queue_cycle") || 0);
    let sent = 0;
    let changedKeys = false;

    // Reserve existing assignments before distributing any waiting rows.
    const occupied = new Map();
    for (let index = 1; index < values.length; index += 1) {
      const lead = mapRow_(headers, values[index], index + 1);
      if (!lead.name || !lead.phone || normalizeLeadStage_(lead.status) !== "new") continue;
      const agent = lead.queue_state !== "queued" && findLeadAgent_(agents, lead);
      if (agent && !occupied.has(agent.id)) {
        occupied.set(agent.id, index);
      }
    }

    const candidates = values.slice(1)
      .map((row, index) => ({ rowNumber: index + 2, row: row.slice(0, headers.length), lead: mapRow_(headers, row, index + 2) }))
      .filter(({ lead }) => lead.name && lead.phone && normalizeLeadStage_(lead.status) === "new")
      .sort((a, b) => {
        const aAssigned = a.lead.queue_state !== "queued" && Boolean(a.lead.assigned_agent_id);
        const bAssigned = b.lead.queue_state !== "queued" && Boolean(b.lead.assigned_agent_id);
        const aPriority = aAssigned ? 0 : (Number(a.lead.pass_count) || 0) > 0 ? 2 : 1;
        const bPriority = bAssigned ? 0 : (Number(b.lead.pass_count) || 0) > 0 ? 2 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aTime = aPriority === 2 ? parseLeadTimestamp_(a.lead.queued_at).getTime() : parseLeadTimestamp_(a.lead.created_at).getTime();
        const bTime = bPriority === 2 ? parseLeadTimestamp_(b.lead.queued_at).getTime() : parseLeadTimestamp_(b.lead.created_at).getTime();
        return aTime - bTime || a.rowNumber - b.rowNumber;
      });

    for (const candidate of candidates) {
      const { rowNumber, row, lead } = candidate;
      if (!lead.name || !lead.phone) continue;

      const eligibleAgents = eligibleAgentsForLead_(agents, projects, lead);
      let agent = lead.queue_state !== "queued" && findLeadAgent_(agents, lead);
      if (agent && occupied.get(agent.id) !== rowNumber - 1) agent = null;
      let runtime = {
        assigned_agent_id: lead.assigned_agent_id,
        assigned_agent_email: lead.assigned_agent_email,
        assigned_agent_name: lead.assigned_agent_name,
        received_at: lead.received_at,
        expires_at: lead.expires_at,
      };
      if (!agent) {
        const project = activeProjectForLead_(projects, lead);
        const roundRobinIndex = Number(roundRobinIndexes[project?.id] || 0);
        const next = nextAvailableAgentForLead_(lead, eligibleAgents, occupied, roundRobinIndex, queueCycle);
        agent = next?.agent || null;
        if (next && project) roundRobinIndexes[project.id] = (next.index + 1) % eligibleAgents.length;
        if (!agent) {
          holdLeadRuntimeRow_(sheet, headers, rowNumber, row);
          continue;
        }
        if ((Number(lead.pass_count) || 0) === 0) queueCycle += 1;
        runtime = assignLeadRuntimeRow_(sheet, headers, rowNumber, row, agent, new Date(), queueCycle);
        occupied.set(agent.id, rowNumber - 1);
      }

      const notificationKey = `${lead.id}:${agent.id}:${runtime.received_at || ""}`;
      if (notifiedKeys.has(notificationKey)) continue;

      const targetSubscriptions = filterSubscriptionsForAgent_(subscriptions, agent);
      if (!targetSubscriptions.length) continue;

      const result = sendPushViaApi_(spreadsheet, targetSubscriptions, {
        title: `Lead baru: ${lead.project || "Projek baru"}`,
        body: `${lead.name}\nNombor dibuka selepas CALL NOW. Diberikan kepada ${agent.name}.`,
        tag: `leadlaju-active-${agent.id}`,
        leadId: lead.id,
        url: "/",
        requireInteraction: true,
      });
      if (result.ok !== false) {
        notifiedKeys.add(notificationKey);
        changedKeys = true;
        sent += Number(result.sent || targetSubscriptions.length || 0);
      }
    }

    properties.setProperty("leadlaju_project_round_robin_indexes", JSON.stringify(roundRobinIndexes));
    properties.setProperty("leadlaju_queue_cycle", String(queueCycle));
    if (changedKeys) saveLeadPushKeys_(notifiedKeys);
    return { ok: true, sent };
  } finally {
    lock.releaseLock();
  }
}

function normalizeAgentActive_(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["inactive", "tidak aktif", "false", "0", "off", "disabled"].includes(normalized)) {
    return "inactive";
  }
  return "active";
}

function normalizeLeadStage_(value) {
  const status = String(value || "").trim().toLowerCase();
  const compactStatus = status.replace(/[\s_-]+/g, " ");
  if (["done", "completed", "complete", "contacted", "called", "call", "dihubungi", "telah dihubungi"].includes(compactStatus)) {
    return "contacted";
  }
  if (["passed", "pass", "expired", "missed", "tamat", "terlepas", "dipindahkan"].includes(compactStatus)) {
    return "passed";
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

function canonicalSheetStatus_(value) {
  const stage = normalizeLeadStage_(value);
  if (stage === "contacted") return "Contacted";
  if (stage === "passed") return "Passed";
  if (stage === "all_offer_presented") return "All Offer Presented";
  if (stage === "rejected") return "Rejected";
  if (stage === "need_follow_up") return "Need Follow Up";
  if (stage === "potential") return "Potential";
  if (stage === "cancelled") return "Cancelled";
  if (stage === "client") return "Client";
  return "New";
}

function normalizeLegacyLeadStatuses_(sheet, headers) {
  const statusIndex = headers.findIndex((header) => FIELD_ALIASES.status.includes(header));
  if (statusIndex < 0 || sheet.getLastRow() < 2) return 0;

  const rowCount = sheet.getLastRow() - 1;
  const statusRange = sheet.getRange(2, statusIndex + 1, rowCount, 1);
  const values = statusRange.getDisplayValues();
  let changed = false;
  const normalized = values.map(([value]) => {
    const nextStatus = canonicalSheetStatus_(value);
    if (nextStatus !== String(value || "").trim()) changed = true;
    return [nextStatus];
  });
  if (changed) statusRange.setValues(normalized);
  return changed ? rowCount : 0;
}

function syncLeadStatusValidation_(sheet, headers) {
  const statusIndex = headers.findIndex((header) => FIELD_ALIASES.status.includes(header));
  if (statusIndex < 0) return false;
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(LEAD_STATUS_VALUES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, statusIndex + 1, rowCount, 1).setDataValidation(rule);
  return true;
}

function syncLeadQueueStateValidation_(sheet, headers) {
  const queueStateIndex = headers.findIndex((header) => FIELD_ALIASES.queueState.includes(header));
  if (queueStateIndex < 0) return false;
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(LEAD_QUEUE_STATE_VALUES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, queueStateIndex + 1, rowCount, 1).setDataValidation(rule);
  return true;
}

function ensureLeadValidations_(sheet, headers) {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty("leadlaju_validation_version") === LEAD_VALIDATION_VERSION) return false;
  syncLeadStatusValidation_(sheet, headers);
  syncLeadQueueStateValidation_(sheet, headers);
  properties.setProperty("leadlaju_validation_version", LEAD_VALIDATION_VERSION);
  return true;
}

function canonicalLeadSource_(value) {
  const source = String(value || DEFAULT_SOURCE).trim();
  const lower = source.toLowerCase();
  if (lower.includes("manual")) return "Manual Lead";
  if (lower.includes("tiktok")) return "Tiktok Ads";
  if (lower.includes("meta") || lower.includes("facebook") || lower === "fb") return "Meta Ads";
  return source || DEFAULT_SOURCE;
}

function canonicalLeadTimestamp_(value) {
  const parsed = parseLeadTimestamp_(value);
  return Utilities.formatDate(parsed || new Date(), MALAYSIA_TIME_ZONE, "yyyy-MM-dd HH:mm:ss");
}

function parseLeadTimestamp_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const raw = String(value || "").trim();
  if (!raw) return new Date();

  const numeric = Number(raw.replace(/,/g, ""));
  if (isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(raw.replace(/,/g, ""))) {
    const milliseconds = Math.abs(numeric) >= 1000000000000 ? numeric : numeric * 1000;
    return new Date(milliseconds);
  }

  const malaysiaMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (malaysiaMatch) {
    const year = Number(malaysiaMatch[1]);
    const month = Number(malaysiaMatch[2]) - 1;
    const day = Number(malaysiaMatch[3]);
    const hour = Number(malaysiaMatch[4] || 0);
    const minute = Number(malaysiaMatch[5] || 0);
    const second = Number(malaysiaMatch[6] || 0);
    return new Date(Date.UTC(year, month, day, hour - 8, minute, second));
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function authorizeSheetTemplate() {
  return refreshSheetTemplate_();
}

function syncSheetTemplate() {
  return refreshSheetTemplate_();
}

function onSheetCoreEdit() {
  return refreshSheetTemplate_();
}

function onSheetCoreChange() {
  return refreshSheetTemplate_();
}

function installSheetCoreTriggers() {
  const handlers = ["onSheetCoreEdit", "onSheetCoreChange", "syncSheetTemplate"];
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (handlers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("onSheetCoreEdit").forSpreadsheet(SPREADSHEET_ID).onEdit().create();
  ScriptApp.newTrigger("onSheetCoreChange").forSpreadsheet(SPREADSHEET_ID).onChange().create();
  ScriptApp.newTrigger("syncSheetTemplate").timeBased().everyMinutes(1).create();
  return { ok: true, installed: ["onSheetCoreEdit", "onSheetCoreChange", "syncSheetTemplate"] };
}

function refreshSheetTemplate_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  const agentsSheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
  const remindersSheet = getOrCreateSheet_(spreadsheet, REMINDERS_SHEET_NAME);
  const pushSheet = getOrCreateSheet_(spreadsheet, PUSH_SUBSCRIPTIONS_SHEET_NAME);
  const headers = ensureRequiredHeaders_(sheet);
  const agentHeaders = ensureRequiredHeadersBySpec_(agentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  ensureRequiredHeadersBySpec_(remindersSheet, REMINDER_HEADERS, REMINDER_FIELD_ALIASES);
  ensureRequiredHeadersBySpec_(pushSheet, PUSH_HEADERS, PUSH_FIELD_ALIASES);
  ensureLeadIds_(sheet, headers);
  ensureLeadTimestamps_(sheet, headers);
  ensureLeadSources_(sheet, headers);
  normalizeLegacyLeadStatuses_(sheet, headers);
  ensureLeadValidations_(sheet, headers);
  syncAgentHandledCounts_(readLeads_(sheet), agentsSheet, agentHeaders);
  const pushResult = notifyUnsentLeadPushes_(spreadsheet, sheet, headers);
  return { ok: true, refreshed_at: new Date().toISOString(), push: pushResult };
}

function sendResetCode_(payload) {
  const email = String(payload.email || "").trim();
  const name = String(payload.name || "Ejen").trim();
  const code = String(payload.code || "").trim();
  if (!email || !/^\d{6}$/.test(code)) {
    return { ok: false, error: "Permintaan tidak sah." };
  }

  MailApp.sendEmail({
    to: email,
    subject: "Kod reset kata laluan LeadLaju",
    htmlBody:
      `<p>Hai ${escapeHtml(name)},</p>` +
      "<p>Gunakan kod berikut untuk menetapkan kata laluan baru:</p>" +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>` +
      "<p>Kod ini sah selama 10 minit. Abaikan emel ini jika anda tidak meminta reset.</p>",
  });

  return { ok: true };
}

function readLeads_(sheet) {
  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader_);
  return values.slice(1)
    .map((row, index) => mapRow_(headers, row, index + 2))
    .filter((lead) => lead.name && lead.phone);
}

function mapRow_(headers, row, rowNumber) {
  const receivedAt = getCell_(headers, row, "receivedAt");
  const expiresAt = getCell_(headers, row, "expiresAt");
  const lead = {
    id: getCell_(headers, row, "id") || `${SHEET_NAME}-${rowNumber}`,
    row_number: rowNumber,
    name: getCell_(headers, row, "name"),
    phone: getCell_(headers, row, "phone"),
    email: getCell_(headers, row, "email"),
    city: getCell_(headers, row, "city"),
    project: getCell_(headers, row, "project"),
    source: canonicalLeadSource_(getCell_(headers, row, "source") || DEFAULT_SOURCE),
    notes: getCell_(headers, row, "notes"),
    status: getCell_(headers, row, "status") || "new",
    status_revision: Number(getCell_(headers, row, "statusRevision")) || 0,
    status_updated_at: getCell_(headers, row, "statusUpdatedAt"),
    created_at: canonicalLeadTimestamp_(getCell_(headers, row, "createdAt")),
    assigned_agent_id: getCell_(headers, row, "assignedAgentId"),
    assigned_agent_email: getCell_(headers, row, "assignedAgentEmail"),
    assigned_agent_name: getCell_(headers, row, "assignedAgentName"),
    received_at: receivedAt ? canonicalLeadTimestamp_(receivedAt) : "",
    expires_at: expiresAt ? canonicalLeadTimestamp_(expiresAt) : "",
    queue_state: getCell_(headers, row, "queueState"),
    queued_at: getCell_(headers, row, "queuedAt"),
    pass_count: getCell_(headers, row, "passCount"),
    retry_after_cycle: Number(getCell_(headers, row, "retryAfterCycle")) || 0,
    assignment_revision: Number(getCell_(headers, row, "assignmentRevision")) || 0,
    assignment_history: parseAssignmentHistory_(headers, row),
  };

  return lead;
}

function getCell_(headers, row, field) {
  const aliases = FIELD_ALIASES[field] || [];
  const index = headers.findIndex((header) => aliases.includes(header));
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function setRowValue_(headers, row, field, value) {
  const aliases = FIELD_ALIASES[field] || [];
  const index = headers.findIndex((header) => aliases.includes(header));
  if (index >= 0) row[index] = value;
}

function ensureRequiredHeaders_(sheet) {
  return ensureRequiredHeadersBySpec_(sheet, REQUIRED_HEADERS, FIELD_ALIASES);
}

function ensureRequiredHeadersBySpec_(sheet, requiredHeaders, aliasesByField) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headerValues = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const hasAnyHeader = headerValues.some((value) => String(value || "").trim());

  if (!hasAnyHeader) {
    headerValues = requiredHeaders.map((header) => header.label);
    sheet.getRange(1, 1, 1, headerValues.length).setValues([headerValues]);
    return headerValues.map(normalizeHeader_);
  }

  const missingHeaders = [];
  let normalizedHeaders = headerValues.map(normalizeHeader_);
  requiredHeaders.forEach(({ field, label }) => {
    const aliases = aliasesByField[field] || [];
    const exists = normalizedHeaders.some((header) => aliases.includes(header));
    if (!exists) {
      missingHeaders.push(label);
      normalizedHeaders.push(normalizeHeader_(label));
    }
  });

  if (missingHeaders.length) {
    sheet
      .getRange(1, headerValues.length + 1, 1, missingHeaders.length)
      .setValues([missingHeaders]);
    headerValues = headerValues.concat(missingHeaders);
  }

  return headerValues.map(normalizeHeader_);
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function getCellBySpec_(headers, row, aliasesByField, field) {
  const aliases = aliasesByField[field] || [];
  const index = headers.findIndex((header) => aliases.includes(header));
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function setRowValueBySpec_(headers, row, aliasesByField, field, value) {
  const aliases = aliasesByField[field] || [];
  const index = headers.findIndex((header) => aliases.includes(header));
  if (index >= 0) row[index] = value;
}

function ensureLeadIds_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const idIndex = headers.findIndex((header) => FIELD_ALIASES.id.includes(header));
  const nameIndex = headers.findIndex((header) => FIELD_ALIASES.name.includes(header));
  const phoneIndex = headers.findIndex((header) => FIELD_ALIASES.phone.includes(header));
  if (idIndex < 0 || nameIndex < 0 || phoneIndex < 0) return;

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
  const ids = [];
  let changed = false;

  values.forEach((row) => {
    const hasLead = String(row[nameIndex] || "").trim() && String(row[phoneIndex] || "").trim();
    let id = String(row[idIndex] || "").trim();
    if (hasLead && !id) {
      id = `sheet-${Utilities.getUuid()}`;
      changed = true;
    }
    ids.push([id]);
  });

  if (changed) {
    sheet.getRange(2, idIndex + 1, ids.length, 1).setValues(ids);
  }
}

function ensureLeadTimestamps_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const timestampIndex = headers.findIndex((header) => FIELD_ALIASES.createdAt.includes(header));
  const nameIndex = headers.findIndex((header) => FIELD_ALIASES.name.includes(header));
  const phoneIndex = headers.findIndex((header) => FIELD_ALIASES.phone.includes(header));
  if (timestampIndex < 0 || nameIndex < 0 || phoneIndex < 0) return;

  const range = sheet.getRange(2, timestampIndex + 1, lastRow - 1, 1);
  const timestampValues = range.getDisplayValues();
  const rowValues = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
  let changed = false;
  const nextValues = timestampValues.map((value, index) => {
    const row = rowValues[index];
    const hasLead = String(row[nameIndex] || "").trim() && String(row[phoneIndex] || "").trim();
    if (!hasLead) return [value[0]];
    const canonical = canonicalLeadTimestamp_(value[0]);
    if (canonical !== String(value[0] || "").trim()) changed = true;
    return [canonical];
  });

  if (changed) {
    range.setValues(nextValues);
  }
}

function ensureLeadSources_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const sourceIndex = headers.findIndex((header) => FIELD_ALIASES.source.includes(header));
  const nameIndex = headers.findIndex((header) => FIELD_ALIASES.name.includes(header));
  const phoneIndex = headers.findIndex((header) => FIELD_ALIASES.phone.includes(header));
  if (sourceIndex < 0 || nameIndex < 0 || phoneIndex < 0) return;

  const range = sheet.getRange(2, sourceIndex + 1, lastRow - 1, 1);
  const sourceValues = range.getDisplayValues();
  const rowValues = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
  let changed = false;
  const nextValues = sourceValues.map((value, index) => {
    const row = rowValues[index];
    const hasLead = String(row[nameIndex] || "").trim() && String(row[phoneIndex] || "").trim();
    if (!hasLead) return [value[0]];
    const canonical = canonicalLeadSource_(value[0]);
    if (canonical !== String(value[0] || "").trim()) changed = true;
    return [canonical];
  });

  if (changed) {
    range.setValues(nextValues);
  }
}

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
