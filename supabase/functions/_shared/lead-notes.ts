// Deterministic parsing: never infer identity from salary/employment answers.
export function normalizeNotesPhone(value: unknown) {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  // Malaysian country code followed by an accidental domestic trunk zero.
  const corrected = digits.startsWith("6001") ? `60${digits.slice(3)}` : digits;
  const normalized = corrected.startsWith("0") ? `60${corrected.slice(1)}` : corrected;
  return /^601\d{8,9}$/.test(normalized) ? normalized : "";
}

export function parseLeadNotes(notes: unknown, projects: Array<{ id: string; name: string }>, explicitProject = "") {
  const lines = String(notes || "").split(/\r?\n|\\n|\\|\|/).map(line => line.trim()).filter(Boolean);
  const unlabel = (line: string) => line.replace(/^(?:nama(?: penuh)?|full name|name|no(?:mbor)?\s*(?:phone|telefon)|phone(?: number)?|telefon|email|e-mail|emel|projek|project|produk|product)\s*[:=]\s*/i, "").trim();
  const values = lines.map(unlabel);
  const excluded = /^(?:ya|tidak|kerja kerajaan|kerja swasta|berniaga\s*\/\s*freelance|rm\s*\d.*)$/i;
  const phones = [...new Set(values.filter(value => /^[+\d][\d\s()+.-]+$/.test(value)).map(normalizeNotesPhone).filter(Boolean))];
  const emails = [...new Set(values.flatMap(value => value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi) || []).map(value => value.toLowerCase()))];
  const projectMatches = projects.filter(project => values.some(value => value.toLowerCase() === project.name.toLowerCase()) || explicitProject.toLowerCase() === project.name.toLowerCase());
  const projectNames = new Set(projects.map(project => project.name.toLowerCase()));
  const candidates = values.filter(value => !excluded.test(value) && !projectNames.has(value.toLowerCase()) && !normalizeNotesPhone(value) && !value.includes('@') && /^[\p{L}\p{M}][\p{L}\p{M}\s.'’@/-]{1,119}$/u.test(value));
  // A form name can be a handle. Only infer it from unlabelled notes
  // when it matches the email username, avoiding alphanumeric survey answers.
  const emailHandle = emails[0]?.split("@")[0];
  const handles = values.filter(value =>
    /^[\p{L}][\p{L}\p{Nd}._-]{1,119}$/u.test(value) &&
    /\p{Nd}/u.test(value) && value.toLowerCase() === emailHandle &&
    !projectNames.has(value.toLowerCase()),
  );
  const names = [...new Set(candidates.length ? candidates : handles)];
  if (phones.length !== 1) throw new Error("NOTA mesti mengandungi satu nombor telefon Malaysia yang sah.");
  if (values.some(value => value.includes('@')) && emails.length === 0) throw new Error("Emel dalam NOTA tidak sah.");
  if (emails.length > 1) throw new Error("NOTA mengandungi lebih daripada satu emel. Sila semak.");
  if (projectMatches.length !== 1) throw new Error("NOTA mesti sepadan dengan satu projek/produk aktif dalam brand ini.");
  if (names.length !== 1) throw new Error("Nama dalam NOTA tidak jelas. Gunakan satu nama sahaja bersama jawapan borang.");
  return { name: names[0], phone: phones[0], email: emails[0] || "", project: projectMatches[0].name };
}

export function repairNotesPhoneText(value) {
  return String(value || "").replace(/(?<![\w+])\+?60[ \t().-]*0[ \t().-]*1(?:[ \t().-]*\d){8,9}(?![ \t().-]*\d)/g, (phone) => {
    const digits = phone.replace(/\D/g, "");
    return `${phone.startsWith("+") ? "+" : ""}60${digits.slice(3)}`;
  });
}
