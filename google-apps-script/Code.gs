const SPREADSHEET_ID = "1ySHeB12lL2y4AxqpSx8dDniyujSaz2-9hoRzPlCv6TM";
const SHEET_NAME = "Sheet1";
const AGENTS_SHEET_NAME = "Agents";
const REMINDERS_SHEET_NAME = "Reminders";
const PUSH_SUBSCRIPTIONS_SHEET_NAME = "PushSubscriptions";
const DEFAULT_SOURCE = "Manual Lead";
const DEFAULT_AGENT_PASSWORD = "Agent123!";
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const PUSH_API_URL = "https://leadlaju.vercel.app/api/push";
const PUSH_NOTIFY_SECRET = "leadlaju-push-notify-v1";
const RESPONSE_WINDOW_MINUTES = 5;

const FIELD_ALIASES = {
  id: ["id", "lead id", "lead_id", "tiktok lead id", "meta lead id"],
  createdAt: ["tarikh & masa", "tarikh masa", "time", "timestamp", "created_at", "created at", "date"],
  name: ["nama", "name", "full name", "full_name"],
  phone: ["no phone", "phone", "phone number", "phone_number", "nombor telefon", "telefon", "mobile", "whatsapp"],
  email: ["emel", "email", "e-mail", "email address", "email_address"],
  city: ["bandar", "city", "location"],
  project: ["projek", "project", "nama projek", "project name", "project_name", "campaign", "campaign name"],
  status: ["status"],
  source: ["source", "sumber", "platform"],
  assignedAgentId: ["assigned agent id", "assigned_agent_id", "agent id", "agent_id", "id ejen"],
  assignedAgentEmail: ["assigned agent email", "assigned_agent_email", "agent email", "email ejen"],
  assignedAgentName: ["assigned agent name", "assigned_agent_name", "agent name", "nama ejen"],
  receivedAt: ["received at", "received_at", "assigned at", "assigned_at", "masa aktif"],
  expiresAt: ["expires at", "expires_at", "tamat pada", "masa tamat"],
  queueState: ["queue state", "queue_state", "runtime state", "runtime_state"],
  passCount: ["pass count", "pass_count", "rotation count", "rotation_count"],
};

const REQUIRED_HEADERS = [
  { field: "createdAt", label: "Tarikh & Masa" },
  { field: "name", label: "Nama" },
  { field: "phone", label: "No Phone" },
  { field: "email", label: "Emel" },
  { field: "city", label: "Bandar" },
  { field: "project", label: "Projek" },
  { field: "status", label: "Status" },
  { field: "source", label: "Sumber" },
  { field: "id", label: "ID" },
  { field: "assignedAgentId", label: "Assigned Agent ID" },
  { field: "assignedAgentEmail", label: "Assigned Agent Email" },
  { field: "assignedAgentName", label: "Assigned Agent Name" },
  { field: "receivedAt", label: "Received At" },
  { field: "expiresAt", label: "Expires At" },
  { field: "queueState", label: "Queue State" },
  { field: "passCount", label: "Pass Count" },
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
    const remindersSheet = getOrCreateSheet_(spreadsheet, REMINDERS_SHEET_NAME);
    const pushSheet = getOrCreateSheet_(spreadsheet, PUSH_SUBSCRIPTIONS_SHEET_NAME);
    const headers = ensureRequiredHeaders_(sheet);
    const agentHeaders = ensureRequiredHeadersBySpec_(agentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
    const reminderHeaders = ensureRequiredHeadersBySpec_(remindersSheet, REMINDER_HEADERS, REMINDER_FIELD_ALIASES);
    ensureRequiredHeadersBySpec_(pushSheet, PUSH_HEADERS, PUSH_FIELD_ALIASES);
    ensureLeadIds_(sheet, headers);
    ensureLeadTimestamps_(sheet, headers);
    ensureLeadSources_(sheet, headers);
    const leads = readLeads_(sheet);
    const agents = readAgents_(agentsSheet, agentHeaders);
    const followUpReminder = readLatestReminder_(remindersSheet, reminderHeaders);
    return jsonResponse({
      ok: true,
      spreadsheet: spreadsheet.getName(),
      sheet: sheet.getName(),
      leads,
      agents,
      follow_up_reminder: followUpReminder,
      push_subscription_count: Math.max(pushSheet.getLastRow() - 1, 0),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error), leads: [] });
  }
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    if (payload.action === "add_lead") {
      return jsonResponse(appendLead_(payload.lead || payload));
    }
    if (payload.action === "delete_lead") {
      return jsonResponse(deleteLead_(payload.lead || payload));
    }
    if (payload.action === "update_lead_status") {
      return jsonResponse(updateLeadStatus_(payload.lead || payload));
    }
    if (payload.action === "update_lead_runtime") {
      return jsonResponse(updateLeadRuntime_(payload.lead || payload));
    }
    if (payload.action === "add_agent") {
      return jsonResponse(upsertAgent_(payload.agent || payload));
    }
    if (payload.action === "delete_agent") {
      return jsonResponse(deleteAgent_(payload.agent || payload));
    }
    if (payload.action === "replace_agents") {
      return jsonResponse(replaceAgents_(payload.agents || []));
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
  if (statusIndex < 0) return { ok: false, error: "Kolum Status tidak dijumpai." };

  let updated = 0;
  for (let rowNumber = 2; rowNumber <= values.length; rowNumber += 1) {
    const row = values[rowNumber - 1];
    const rowId = idIndex >= 0 ? String(row[idIndex] || "").trim() : "";
    const rowPhone = phoneIndex >= 0 ? String(row[phoneIndex] || "").trim() : "";
    const rowProject = projectIndex >= 0 ? String(row[projectIndex] || "").trim() : "";
    const idMatches = id && rowId === id;
    const fallbackMatches = phone && project && rowPhone === phone && rowProject === project;

    if (idMatches || fallbackMatches) {
      sheet.getRange(rowNumber, statusIndex + 1).setValue(status);
      updated += 1;
    }
  }

  return { ok: true, updated, status };
}

function updateLeadRuntime_(input) {
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
      const nextRow = row.slice(0, headers.length);
      setRowValue_(headers, nextRow, "assignedAgentId", String(input.assigned_agent_id || input.assignedAgentId || "").trim());
      setRowValue_(headers, nextRow, "assignedAgentEmail", String(input.assigned_agent_email || input.assignedAgentEmail || "").trim());
      setRowValue_(headers, nextRow, "assignedAgentName", String(input.assigned_agent_name || input.assignedAgentName || "").trim());
      setRowValue_(headers, nextRow, "receivedAt", input.received_at || input.receivedAt ? canonicalLeadTimestamp_(input.received_at || input.receivedAt) : "");
      setRowValue_(headers, nextRow, "expiresAt", input.expires_at || input.expiresAt ? canonicalLeadTimestamp_(input.expires_at || input.expiresAt) : "");
      setRowValue_(headers, nextRow, "queueState", String(input.queue_state || input.queueState || "").trim());
      setRowValue_(headers, nextRow, "passCount", String(input.pass_count ?? input.passCount ?? 0).trim());
      sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);
      updated += 1;
    }
  }

  return { ok: true, updated };
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
  };

  if (!agent.name || !agent.email) {
    return { ok: false, error: "Nama dan emel ejen diperlukan." };
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
  return row;
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
    }))
    .filter((agent) => agent.name && agent.email);
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
    (agent) => agent.active === "active" && !roleIsAdmin_(agent.role),
  );
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
    if (agentId && subscription.agentId === agentId) return true;
    return agentEmail && subscription.agentEmail === agentEmail;
  });
}

function assignLeadRuntimeRow_(sheet, headers, rowNumber, row, agent, now) {
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
  if (!getCell_(headers, nextRow, "passCount")) setRowValue_(headers, nextRow, "passCount", "0");
  sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);
  return {
    assigned_agent_id: agent.id,
    assigned_agent_email: agent.email,
    assigned_agent_name: agent.name,
    received_at: receivedAt,
    expires_at: expiresAt,
  };
}

function notifyUnsentLeadPushes_(spreadsheet, sheet, headers) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: "Push sync sedang berjalan." };

  try {
    const values = sheet.getDataRange().getDisplayValues();
    if (values.length < 2) return { ok: true, sent: 0 };

    const agents = getActiveAgentsForPush_(spreadsheet);
    if (!agents.length) return { ok: true, sent: 0, reason: "no_agents" };

    const subscriptions = readPushSubscriptions_(spreadsheet, { agentOnly: true });

    const notifiedKeys = getLeadPushKeys_();
    const properties = PropertiesService.getScriptProperties();
    let roundRobinIndex = Number(properties.getProperty("leadlaju_push_round_robin_index") || 0);
    let sent = 0;
    let changedKeys = false;

    for (let index = 1; index < values.length; index += 1) {
      const rowNumber = index + 1;
      const row = values[index].slice(0, headers.length);
      const lead = mapRow_(headers, row, rowNumber);
      if (!lead.name || !lead.phone) continue;
      if (normalizeLeadStage_(lead.status) !== "new") continue;

      let agent = findLeadAgent_(agents, lead);
      let runtime = {
        assigned_agent_id: lead.assigned_agent_id,
        assigned_agent_email: lead.assigned_agent_email,
        assigned_agent_name: lead.assigned_agent_name,
        received_at: lead.received_at,
        expires_at: lead.expires_at,
      };
      if (!agent) {
        agent = agents[roundRobinIndex % agents.length];
        roundRobinIndex = (roundRobinIndex + 1) % agents.length;
        runtime = assignLeadRuntimeRow_(sheet, headers, rowNumber, row, agent, new Date());
      }

      const notificationKey = `${lead.id}:${agent.id}:${runtime.received_at || ""}`;
      if (notifiedKeys.has(notificationKey)) continue;

      const targetSubscriptions = filterSubscriptionsForAgent_(subscriptions, agent);
      if (!targetSubscriptions.length) continue;

      const result = sendPushViaApi_(spreadsheet, targetSubscriptions, {
        title: `Lead baru: ${lead.project || "Projek baru"}`,
        body: `${lead.name}\nNombor dibuka selepas CALL NOW. Diberikan kepada ${agent.name}.`,
        tag: `leadlaju-lead-${lead.id}-${agent.id}`,
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

    properties.setProperty("leadlaju_push_round_robin_index", String(roundRobinIndex));
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

function canonicalSheetStatus_(value) {
  const stage = normalizeLeadStage_(value);
  if (stage === "contacted") return "Contacted";
  if (stage === "passed") return "Passed";
  if (stage === "rejected") return "Rejected";
  if (stage === "need_follow_up") return "Need Follow Up";
  if (stage === "potential") return "Potential";
  if (stage === "client") return "Client";
  return "New";
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
  ensureRequiredHeadersBySpec_(agentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
  ensureRequiredHeadersBySpec_(remindersSheet, REMINDER_HEADERS, REMINDER_FIELD_ALIASES);
  ensureRequiredHeadersBySpec_(pushSheet, PUSH_HEADERS, PUSH_FIELD_ALIASES);
  ensureLeadIds_(sheet, headers);
  ensureLeadTimestamps_(sheet, headers);
  ensureLeadSources_(sheet, headers);
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
    status: getCell_(headers, row, "status") || "new",
    created_at: canonicalLeadTimestamp_(getCell_(headers, row, "createdAt")),
    assigned_agent_id: getCell_(headers, row, "assignedAgentId"),
    assigned_agent_email: getCell_(headers, row, "assignedAgentEmail"),
    assigned_agent_name: getCell_(headers, row, "assignedAgentName"),
    received_at: receivedAt ? canonicalLeadTimestamp_(receivedAt) : "",
    expires_at: expiresAt ? canonicalLeadTimestamp_(expiresAt) : "",
    queue_state: getCell_(headers, row, "queueState"),
    pass_count: getCell_(headers, row, "passCount"),
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
