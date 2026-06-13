const SHEET_NAME = "Leads";

function doGet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return jsonResponse({
      error: `Sheet "${SHEET_NAME}" tidak ditemui.`,
      leads: [],
    });
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) {
    return jsonResponse({ leads: [] });
  }

  const headers = values[0].map((header) =>
    String(header).trim().toLowerCase()
  );
  const leads = values.slice(1)
    .filter((row) => row.some((value) => String(value).trim()))
    .map((row) => {
      const lead = {};
      headers.forEach((header, columnIndex) => {
        lead[header] = row[columnIndex];
      });
      return lead;
    })
    .filter((lead) => lead.name && lead.phone);

  return jsonResponse({ leads });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    if (payload.action !== "send_reset_code") {
      return jsonResponse({ ok: false, error: "Action tidak disokong." });
    }

    const email = String(payload.email || "").trim();
    const name = String(payload.name || "Ejen").trim();
    const code = String(payload.code || "").trim();
    if (!email || !/^\d{6}$/.test(code)) {
      return jsonResponse({ ok: false, error: "Permintaan tidak sah." });
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

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
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
