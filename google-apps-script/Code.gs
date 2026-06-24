const SPREADSHEET_ID = "1ySHeB12lL2y4AxqpSx8dDniyujSaz2-9hoRzPlCv6TM";
const SHEET_NAME = "Sheet1";
const AGENTS_SHEET_NAME = "Agents";
const DEFAULT_SOURCE = "Google Sheet";

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
    return jsonResponse({
      ok: true,
      spreadsheet: spreadsheet.getName(),
      sheet: sheet.getName(),
      leads,
      agents,
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
