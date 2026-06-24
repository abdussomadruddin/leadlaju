const SPREADSHEET_ID = "1ySHeB12lL2y4AxqpSx8dDniyujSaz2-9hoRzPlCv6TM";
const SHEET_NAME = "Sheet1";
const AGENTS_SHEET_NAME = "Agents";
const DEFAULT_SOURCE = "Google Sheet";
const SUPABASE_URL = "https://rfqwyhafvfvafiqrcmxa.supabase.co";
const SUPABASE_KEY = "sb_publishable_or7DVUc_la79KiBz4kR5uw_EIGyN3-l";
const SUPABASE_ADMIN_EMAIL = "admin@leadlaju.my";
const SUPABASE_ADMIN_PASSWORD_PROPERTY = "SUPABASE_ADMIN_PASSWORD";
const SUPABASE_SYNC_HASH_PROPERTY = "SUPABASE_SYNC_HASH";
const SUPABASE_ACCESS_TOKEN_PROPERTY = "SUPABASE_ACCESS_TOKEN";
const SUPABASE_TOKEN_EXPIRY_PROPERTY = "SUPABASE_TOKEN_EXPIRY";
const DEFAULT_AGENT_PASSWORD = "Agent123!";

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
];

function doGet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    const agentsSheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
    const headers = ensureRequiredHeaders_(sheet);
    const agentHeaders = ensureRequiredHeadersBySpec_(agentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
    ensureLeadIds_(sheet, headers);
    const leads = readLeads_(sheet);
    const agents = readAgents_(agentsSheet, agentHeaders);
    const supabaseSync = safeSyncSupabaseFromSheet_(leads, agents, {
      agentSheet: agentsSheet,
      agentHeaders,
      force: false,
    });
    return jsonResponse({
      ok: true,
      spreadsheet: spreadsheet.getName(),
      sheet: sheet.getName(),
      leads,
      agents,
      supabaseSync,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error), leads: [] });
  }
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    if (payload.action === "add_lead") {
      return jsonResponse(withSupabaseSync_(appendLead_(payload.lead || payload), true));
    }
    if (payload.action === "delete_lead") {
      return jsonResponse(withSupabaseSync_(deleteLead_(payload.lead || payload), true));
    }
    if (payload.action === "add_agent") {
      return jsonResponse(withSupabaseSync_(upsertAgent_(payload.agent || payload), true));
    }
    if (payload.action === "delete_agent") {
      return jsonResponse(withSupabaseSync_(deleteAgent_(payload.agent || payload), true));
    }
    if (payload.action === "replace_agents") {
      return jsonResponse(withSupabaseSync_(replaceAgents_(payload.agents || []), true));
    }
    if (payload.action === "send_reset_code") {
      return jsonResponse(sendResetCode_(payload));
    }

    return jsonResponse({ ok: false, error: "Action tidak disokong." });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function appendLead_(input) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  const headers = ensureRequiredHeaders_(sheet);
  const lead = {
    id: String(input.id || input.lead_id || Utilities.getUuid()).trim(),
    createdAt: String(input.created_at || input.createdAt || new Date().toISOString()).trim(),
    name: String(input.name || input.nama || input.full_name || "").trim(),
    phone: String(input.phone || input.phone_number || input.mobile || "").trim(),
    email: String(input.email || input.emel || input.email_address || "").trim(),
    city: String(input.city || input.bandar || "").trim(),
    project: String(input.project || input.projek || input.project_name || "Tidak dinyatakan").trim(),
    status: String(input.status || "new").trim(),
    source: String(input.source || input.sumber || input.platform || "Manual Lead").trim(),
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

function normalizeAgentActive_(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["inactive", "tidak aktif", "false", "0", "off", "disabled"].includes(normalized)) {
    return "inactive";
  }
  return "active";
}

function withSupabaseSync_(result, force) {
  const response = Object.assign({}, result || {});
  response.supabaseSync = safeSyncCurrentSheet_(force);
  return response;
}

function safeSyncCurrentSheet_(force) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    const agentsSheet = getOrCreateSheet_(spreadsheet, AGENTS_SHEET_NAME);
    const headers = ensureRequiredHeaders_(sheet);
    const agentHeaders = ensureRequiredHeadersBySpec_(agentsSheet, AGENT_HEADERS, AGENT_FIELD_ALIASES);
    ensureLeadIds_(sheet, headers);
    return safeSyncSupabaseFromSheet_(readLeads_(sheet), readAgents_(agentsSheet, agentHeaders), {
      agentSheet: agentsSheet,
      agentHeaders,
      force: Boolean(force),
    });
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function safeSyncSupabaseFromSheet_(leads, agents, options) {
  try {
    return syncSupabaseFromSheet_(leads, agents, options || {});
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function syncSupabaseFromSheet_(leads, agents, options) {
  const password = getSupabaseAdminPassword_();
  if (!password) {
    return {
      ok: false,
      skipped: true,
      error: `Set ${SUPABASE_ADMIN_PASSWORD_PROPERTY} di Apps Script properties untuk aktifkan Sheet -> Supabase.`,
    };
  }

  const normalizedLeads = (leads || []).map(normalizeSupabaseLead_).filter(Boolean);
  const normalizedAgents = (agents || []).map(normalizeSupabaseAgent_).filter(Boolean);
  const syncHash = computeSyncHash_(normalizedLeads, normalizedAgents);
  const properties = PropertiesService.getScriptProperties();
  if (!options.force && properties.getProperty(SUPABASE_SYNC_HASH_PROPERTY) === syncHash) {
    return { ok: true, skipped: true, unchanged: true };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { ok: false, skipped: true, error: "Sync Supabase sedang berjalan. Cuba lagi sebentar." };
  }

  try {
    const token = getSupabaseAccessToken_();
    let profiles = fetchSupabaseProfiles_(token);
    const agentResult = syncSupabaseAgents_(normalizedAgents, profiles, token, options);
    if (agentResult.changedProfiles) {
      profiles = fetchSupabaseProfiles_(token);
    }
    const leadResult = syncSupabaseLeads_(normalizedLeads, profiles, token);
    properties.setProperty(SUPABASE_SYNC_HASH_PROPERTY, syncHash);
    return {
      ok: true,
      leads: leadResult,
      agents: agentResult,
      synced_at: new Date().toISOString(),
    };
  } finally {
    lock.releaseLock();
  }
}

function syncSupabaseAgents_(sheetAgents, profiles, token, options) {
  const result = { added: 0, updated: 0, removed: 0, passwordUpdated: 0, backfilled: 0, skipped: 0, changedProfiles: false };
  if (!sheetAgents.length) {
    result.skipped += 1;
    return result;
  }

  const byId = {};
  const byEmail = {};
  profiles.forEach((profile) => {
    if (profile.id) byId[String(profile.id)] = profile;
    if (profile.email) byEmail[String(profile.email).trim().toLowerCase()] = profile;
  });

  const sheetEmails = new Set(sheetAgents.map((agent) => agent.email));

  sheetAgents.forEach((agent) => {
    const existing = (agent.id && byId[agent.id]) || byEmail[agent.email];
    if (existing) {
      const nextActive = existing.role === "admin" ? true : agent.active;
      const payload = {
        name: agent.name,
        phone: agent.phone,
        active: nextActive,
        leads_handled: agent.leadsHandled,
      };
      supabaseFetch_(`/rest/v1/profiles?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "patch",
        payload,
        headers: { Prefer: "return=minimal" },
      }, token);
      result.updated += 1;
      result.changedProfiles = true;

      if (!agent.id && existing.id && writeAgentIdByEmail_(options.agentSheet, options.agentHeaders, agent.email, existing.id)) {
        result.backfilled += 1;
      }

      if (agent.password.length >= 8 && existing.role === "agent") {
        callAdminManageAgent_({
          action: "update_password",
          userId: existing.id,
          password: agent.password,
        }, token);
        result.passwordUpdated += 1;
      }
      return;
    }

    if (agent.role === "admin") {
      result.skipped += 1;
      return;
    }

    callAdminManageAgent_({
      action: "create",
      name: agent.name,
      phone: agent.phone,
      email: agent.email,
      password: agent.password.length >= 8 ? agent.password : DEFAULT_AGENT_PASSWORD,
    }, token);
    const createdProfile = fetchSupabaseProfileByEmail_(agent.email, token);
    if (createdProfile?.id && writeAgentIdByEmail_(options.agentSheet, options.agentHeaders, agent.email, createdProfile.id)) {
      result.backfilled += 1;
    }
    result.added += 1;
    result.changedProfiles = true;
  });

  profiles
    .filter((profile) => profile.role === "agent" && !sheetEmails.has(String(profile.email || "").toLowerCase()))
    .forEach((profile) => {
      callAdminManageAgent_({ action: "delete", userId: profile.id }, token);
      result.removed += 1;
      result.changedProfiles = true;
    });

  return result;
}

function syncSupabaseLeads_(sheetLeads, profiles, token) {
  const result = { added: 0, updated: 0, removed: 0, skipped: 0 };
  const keys = sheetLeads.map((lead) => lead.dedupeKey);
  const existingRows = fetchExistingSupabaseLeads_(keys, token);
  const existingByKey = {};
  existingRows.forEach((lead) => {
    existingByKey[lead.dedupe_key] = lead;
  });

  const activeAgents = profiles.filter((profile) => profile.role === "agent" && profile.active);
  let roundRobinIndex = fetchSupabaseRoundRobinIndex_(token);

  sheetLeads.forEach((lead) => {
    const existing = existingByKey[lead.dedupeKey];
    if (existing) {
      const payload = {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        project: lead.project,
        source: lead.source,
      };
      if (existing.status !== "contacted" && lead.status === "contacted") {
        payload.status = "contacted";
        payload.contacted_at = existing.contacted_at || new Date().toISOString();
        payload.response_ms = Number(existing.response_ms || 0);
      }
      supabaseFetch_(`/rest/v1/leads?dedupe_key=eq.${encodeURIComponent(lead.dedupeKey)}`, {
        method: "patch",
        payload,
        headers: { Prefer: "return=minimal" },
      }, token);
      result.updated += 1;
      return;
    }

    const assignedAgent = activeAgents.length ? activeAgents[roundRobinIndex % activeAgents.length] : null;
    if (assignedAgent) roundRobinIndex += 1;
    const isContacted = lead.status === "contacted";
    supabaseFetch_("/rest/v1/leads", {
      method: "post",
      payload: {
        dedupe_key: lead.dedupeKey,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        project: lead.project,
        source: lead.source,
        status: lead.status,
        assigned_agent_id: assignedAgent ? assignedAgent.id : null,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        pass_count: 0,
        response_ms: isContacted ? 0 : null,
        contacted_at: isContacted ? new Date().toISOString() : null,
        notes: "",
        created_at: lead.createdAt,
        received_at: new Date().toISOString(),
      },
      headers: { Prefer: "return=minimal" },
    }, token);
    result.added += 1;
  });

  const deletedCount = supabaseFetch_("/rest/v1/rpc/delete_leads_not_in_dedupe_keys", {
    method: "post",
    payload: { p_dedupe_keys: keys },
  }, token);
  result.removed = Number(deletedCount) || 0;

  supabaseFetch_("/rest/v1/app_settings?id=eq.1", {
    method: "patch",
    payload: {
      round_robin_index: roundRobinIndex,
      last_sync_at: new Date().toISOString(),
    },
    headers: { Prefer: "return=minimal" },
  }, token);

  return result;
}

function getSupabaseAdminPassword_() {
  return String(PropertiesService.getScriptProperties().getProperty(SUPABASE_ADMIN_PASSWORD_PROPERTY) || "").trim();
}

function authorizeSupabaseSync() {
  const response = UrlFetchApp.fetch(SUPABASE_URL, { muteHttpExceptions: true });
  return response.getResponseCode();
}

function syncSupabaseFromSpreadsheet() {
  return safeSyncCurrentSheet_(true);
}

function onSheetCoreEdit() {
  return safeSyncCurrentSheet_(true);
}

function onSheetCoreChange() {
  return safeSyncCurrentSheet_(true);
}

function installSheetCoreTriggers() {
  const handlers = ["onSheetCoreEdit", "onSheetCoreChange", "syncSupabaseFromSpreadsheet"];
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (handlers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("onSheetCoreEdit").forSpreadsheet(SPREADSHEET_ID).onEdit().create();
  ScriptApp.newTrigger("onSheetCoreChange").forSpreadsheet(SPREADSHEET_ID).onChange().create();
  ScriptApp.newTrigger("syncSupabaseFromSpreadsheet").timeBased().everyMinutes(5).create();
  return { ok: true, installed: handlers };
}

function getSupabaseAccessToken_() {
  const properties = PropertiesService.getScriptProperties();
  const existingToken = properties.getProperty(SUPABASE_ACCESS_TOKEN_PROPERTY);
  const expiry = Number(properties.getProperty(SUPABASE_TOKEN_EXPIRY_PROPERTY) || 0);
  if (existingToken && expiry > Date.now() + 60000) return existingToken;

  const response = UrlFetchApp.fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { apikey: SUPABASE_KEY },
    payload: JSON.stringify({
      email: SUPABASE_ADMIN_EMAIL,
      password: getSupabaseAdminPassword_(),
    }),
  });
  const body = parseJson_(response.getContentText());
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !body.access_token) {
    throw new Error(`Supabase auth gagal: ${response.getContentText()}`);
  }

  properties.setProperty(SUPABASE_ACCESS_TOKEN_PROPERTY, body.access_token);
  properties.setProperty(
    SUPABASE_TOKEN_EXPIRY_PROPERTY,
    String(Date.now() + Math.max(Number(body.expires_in || 3600) - 60, 60) * 1000),
  );
  return body.access_token;
}

function fetchSupabaseProfiles_(token) {
  return supabaseFetch_(
    "/rest/v1/profiles?select=id,name,phone,email,role,active,leads_handled,created_at&order=created_at.asc",
    { method: "get" },
    token,
  ) || [];
}

function fetchSupabaseProfileByEmail_(email, token) {
  const rows = supabaseFetch_(
    `/rest/v1/profiles?select=id,name,phone,email,role,active,leads_handled,created_at&email=eq.${encodeURIComponent(email)}&limit=1`,
    { method: "get" },
    token,
  ) || [];
  return rows[0] || null;
}

function fetchExistingSupabaseLeads_(keys, token) {
  if (!keys.length) return [];
  const filter = `in.(${keys.map(postgrestQuote_).join(",")})`;
  return supabaseFetch_(
    `/rest/v1/leads?select=dedupe_key,status,assigned_agent_id,contacted_at,response_ms&dedupe_key=${encodeURIComponent(filter)}`,
    { method: "get" },
    token,
  ) || [];
}

function fetchSupabaseRoundRobinIndex_(token) {
  const rows = supabaseFetch_("/rest/v1/app_settings?select=round_robin_index&id=eq.1&limit=1", { method: "get" }, token) || [];
  return Number(rows[0]?.round_robin_index || 0) || 0;
}

function callAdminManageAgent_(payload, token) {
  const result = supabaseFetch_("/functions/v1/admin-manage-agent", {
    method: "post",
    payload,
  }, token);
  if (!result?.ok) {
    throw new Error(result?.error || "Edge Function admin-manage-agent gagal.");
  }
  return result;
}

function supabaseFetch_(path, options, token) {
  const request = {
    method: String(options.method || "get").toUpperCase(),
    muteHttpExceptions: true,
    headers: Object.assign(
      {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
      options.headers || {},
    ),
  };

  if (Object.prototype.hasOwnProperty.call(options, "payload")) {
    request.contentType = "application/json";
    request.payload = JSON.stringify(options.payload);
  }

  const response = UrlFetchApp.fetch(`${SUPABASE_URL}${path}`, request);
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`Supabase ${request.method} ${path} gagal (${status}): ${text}`);
  }
  if (!text) return null;
  return parseJson_(text);
}

function normalizeSupabaseLead_(input) {
  const name = String(input.name || input.nama || "").trim();
  const phone = String(input.phone || input.phone_number || input.mobile || "").trim();
  if (!name || !phone) return null;
  const project = String(input.project || input.projek || input.project_name || "Tidak dinyatakan").trim();
  const createdAt = normalizeDateIso_(input.created_at || input.createdAt);
  return {
    dedupeKey: sheetLeadDedupeKey_(input, project),
    name,
    phone,
    email: String(input.email || input.emel || input.email_address || "").trim(),
    project,
    source: normalizeLeadSourceForSupabase_(input.source || input.sumber || input.platform),
    status: normalizeLeadStatusForSupabase_(input.status),
    createdAt,
  };
}

function normalizeSupabaseAgent_(input) {
  const name = String(input.name || input.nama || "").trim();
  const email = String(input.email || input.emel || input.email_address || "").trim().toLowerCase();
  if (!name || !email) return null;
  return {
    id: String(input.id || input.user_id || input.agent_id || "").trim(),
    name,
    phone: String(input.phone || input.phone_number || input.mobile || "").trim(),
    email,
    role: String(input.role || "agent").trim().toLowerCase() === "admin" ? "admin" : "agent",
    active: normalizeAgentActive_(input.active ?? input.status ?? "active") === "active",
    leadsHandled: Number(input.leads_handled ?? input.leadsHandled ?? 0) || 0,
    password: String(input.password || input.kata_laluan || input.temporary_password || "").trim(),
  };
}

function sheetLeadDedupeKey_(input, project) {
  const id = String(input.id || input.lead_id || "").trim();
  if (id) return id;
  return `${normalizePhoneForKey_(input.phone || input.phone_number || input.mobile)}-${project}-${input.created_at || input.createdAt || ""}`;
}

function normalizeLeadSourceForSupabase_(value) {
  const source = String(value || DEFAULT_SOURCE).trim();
  const lower = source.toLowerCase();
  if (lower.includes("tiktok")) return "TikTok Ads";
  if (lower.includes("meta") || lower.includes("facebook") || lower === "fb") return "Meta Ads";
  if (lower.includes("manual")) return "Manual Lead";
  return source || DEFAULT_SOURCE;
}

function normalizeLeadStatusForSupabase_(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["done", "completed", "complete", "contacted", "called", "call", "telah dihubungi"].includes(status)) {
    return "contacted";
  }
  return "new";
}

function normalizeDateIso_(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizePhoneForKey_(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function computeSyncHash_(leads, agents) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify({ leads, agents }),
  );
  return Utilities.base64EncodeWebSafe(digest);
}

function postgrestQuote_(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseJson_(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function writeAgentIdByEmail_(sheet, headers, email, id) {
  if (!sheet || !headers || !email || !id) return false;
  const idIndex = headers.findIndex((header) => AGENT_FIELD_ALIASES.id.includes(header));
  const emailIndex = headers.findIndex((header) => AGENT_FIELD_ALIASES.email.includes(header));
  if (idIndex < 0 || emailIndex < 0) return false;

  const values = sheet.getDataRange().getDisplayValues();
  for (let rowNumber = 2; rowNumber <= values.length; rowNumber += 1) {
    const rowEmail = String(values[rowNumber - 1][emailIndex] || "").trim().toLowerCase();
    if (rowEmail === email) {
      sheet.getRange(rowNumber, idIndex + 1).setValue(id);
      return true;
    }
  }
  return false;
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
  const lead = {
    id: getCell_(headers, row, "id") || `${SHEET_NAME}-${rowNumber}`,
    name: getCell_(headers, row, "name"),
    phone: getCell_(headers, row, "phone"),
    email: getCell_(headers, row, "email"),
    city: getCell_(headers, row, "city"),
    project: getCell_(headers, row, "project"),
    source: getCell_(headers, row, "source") || DEFAULT_SOURCE,
    status: getCell_(headers, row, "status") || "new",
    created_at: getCell_(headers, row, "createdAt"),
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
