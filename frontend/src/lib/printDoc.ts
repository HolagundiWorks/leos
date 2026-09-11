// Open a print window with the given full HTML document and trigger print.
// Works in Electron (and a browser): the native print dialog lets the
// user save as PDF or print to paper. Mirrors the pattern in IdCardScreen/FeeScreen.
export function printHtml(html: string) {
  const w = window.open('', '_blank', 'width=900,height=720');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the new document a tick to lay out before printing.
  setTimeout(() => {
    try { w.print(); } catch { /* user can print manually */ }
  }, 250);
}

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const paras = (body: string) =>
  esc(body).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');

interface Letterhead {
  name: string;
  address?: string | null;
  principalName?: string | null;
  logo?: string | null;
  signature?: string | null;
  certBg?: string | null;
}

export interface DisclosureData {
  school: {
    name?: string | null; academic_year?: string | null; address?: string | null;
    principal_name?: string | null; affiliation_no?: string | null;
    school_code?: string | null; udise_code?: string | null;
  };
  logo?: string | null;
  general: [string, string][];
  documents: { cert_type: string; authority: string; reference_no: string; validity: string; status: string }[];
  staffStudents: [string, string | number][];
}

/** CBSE-style Mandatory Public Disclosure document (A4, printable). */
export function publicDisclosureHtml(d: DisclosureData): string {
  const s = d.school;
  const row = (k: string, v: string | number) =>
    `<tr><td class="k">${esc(k)}</td><td>${esc(String(v ?? '—')) || '—'}</td></tr>`;
  const docRows = d.documents.length
    ? d.documents.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.cert_type)}</td><td>${esc(c.authority) || '—'}</td><td>${esc(c.reference_no) || '—'}</td><td>${esc(c.validity) || '—'}</td><td>${esc(c.status)}</td></tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#888">No certificates recorded yet — add them under Compliance → Certificates &amp; Safety.</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mandatory Public Disclosure</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 12px; }
    .head { display:flex; align-items:center; gap:14px; border-bottom:3px solid #11365f; padding-bottom:10px; }
    .head img { height:54px; }
    .head h1 { margin:0; font-size:20px; color:#11365f; }
    .head .sub { color:#555; font-size:12px; }
    h2 { font-size:13px; color:#11365f; margin:18px 0 6px; text-transform:uppercase; letter-spacing:.3px; border-left:4px solid #9a7b1f; padding-left:8px; }
    table { width:100%; border-collapse:collapse; margin-bottom:6px; }
    td, th { border:1px solid #ccc; padding:5px 8px; text-align:left; vertical-align:top; }
    th { background:#f0f3f7; font-size:11px; }
    td.k { width:38%; font-weight:600; background:#fafbfc; }
    .note { color:#888; font-size:10px; margin-top:14px; }
    .foot { margin-top:26px; display:flex; justify-content:space-between; font-size:11px; color:#555; }
  </style></head><body>
    <div class="head">${d.logo ? `<img src="${d.logo}" alt="logo"/>` : ''}
      <div><h1>${esc(s.name ?? 'School')}</h1><div class="sub">${esc(s.address ?? '')}</div>
      <div class="sub"><b>Mandatory Public Disclosure</b> · ${esc(s.academic_year ?? '')}</div></div>
    </div>
    <h2>A — General Information</h2>
    <table>${d.general.map(([k, v]) => row(k, v)).join('')}</table>
    <h2>B — Documents &amp; Statutory Certificates</h2>
    <table><tr><th>#</th><th>Certificate</th><th>Issuing authority</th><th>Reference</th><th>Valid upto</th><th>Status</th></tr>${docRows}</table>
    <h2>C — Staff &amp; Students</h2>
    <table>${d.staffStudents.map(([k, v]) => row(k, v)).join('')}</table>
    <div class="note">Generated from the LEOS school database. Figures are live as of generation; verify against source records before publication on the school website (CBSE Mandatory Public Disclosure requirement).</div>
    <div class="foot"><span>Principal: ${esc(s.principal_name ?? '')}</span><span>Affiliation No: ${esc(s.affiliation_no ?? '—')}</span></div>
  </body></html>`;
}

/** A4 letter on the principal's letterhead. */
export function letterHtml(
  s: Letterhead,
  l: { ref_no?: string; date: string; recipient?: string; subject: string; body: string; qr?: string },
) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(l.subject)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: 'Garamond', Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.6; }
    .head { display:flex; align-items:center; gap:14px; padding-bottom: 8px; }
    .head .logo { width:74px; flex-shrink:0; }
    .head .logo img { width:74px; height:auto; }
    .masthead { flex:1; text-align:center; }
    .school { font-size: 27px; font-weight: 700; color:#11365f; letter-spacing:.6px; }
    .addr { font-size: 11.5px; color:#555; margin-top:2px; }
    .office { font-size: 11px; letter-spacing:.22em; text-transform:uppercase; color:#9a7b1f; margin-top:5px; font-weight:600; }
    .head .qr { width:74px; flex-shrink:0; text-align:right; }
    .head .qr img { width:64px; height:64px; }
    .rule { height:3px; background: linear-gradient(90deg,#11365f 0%,#9a7b1f 55%,#11365f 100%); border-radius:2px; margin: 4px 0 2px; }
    .rule.thin { height:1px; background:#c9b878; margin-top:3px; }
    .meta { display:flex; justify-content:space-between; font-size:12.5px; color:#333; margin:20px 0 22px; }
    .subject { text-align:center; font-weight:700; margin: 14px 0 16px; }
    .subject u { text-decoration-color:#9a7b1f; }
    .body p { margin: 0 0 12px; text-align: justify; }
    .sign { margin-top: 46px; }
    .pname { font-weight:700; margin-top: 40px; }
    .foot { position: fixed; bottom: 8mm; left:0; right:0; text-align:center; font-size:10px; color:#888; border-top:1px solid #e3dcc4; padding-top:4px; }
  </style></head><body>
    <div class="head">
      <div class="logo">${s.logo ? `<img src="${s.logo}" alt="logo"/>` : ''}</div>
      <div class="masthead">
        <div class="school">${esc(s.name)}</div>
        ${s.address ? `<div class="addr">${esc(s.address)}</div>` : ''}
        <div class="office">Office of the Principal</div>
      </div>
      <div class="qr">${l.qr ? `<img src="${l.qr}" alt="verify"/>` : ''}</div>
    </div>
    <div class="rule"></div><div class="rule thin"></div>
    <div class="meta"><span><b>Ref:</b> ${esc(l.ref_no ?? '—')}</span><span><b>Date:</b> ${esc(l.date)}</span></div>
    ${l.recipient ? `<div>${paras(l.recipient)}</div>` : ''}
    <div class="subject"><u>Subject: ${esc(l.subject)}</u></div>
    <div class="body">${paras(l.body)}</div>
    <div class="sign">
      <div>Yours sincerely,</div>
      ${s.signature ? `<img src="${s.signature}" style="height:46px;display:block;margin-top:8px" alt="signature"/>` : ''}
      <div class="pname"${s.signature ? ' style="margin-top:6px"' : ''}>${esc(s.principalName || '')}</div>
      <div>Principal, ${esc(s.name)}</div>
    </div>
    ${l.ref_no ? `<div class="foot">This is a computer-generated letter from ${esc(s.name)}. Scan the QR to verify · Ref ${esc(l.ref_no)}</div>` : ''}
  </body></html>`;
}

/** A5 fee receipt on the school letterhead. */
export function receiptHtml(
  s: Letterhead,
  r: { receipt_no: string; date: string; student: string; fee_head: string; amount: number; mode: string; reference?: string },
) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(r.receipt_no)}</title>
  <style>
    @page { size: A5; margin: 12mm; }
    body { font-family: Georgia, 'Times New Roman', serif; color:#1a1a1a; }
    .head { text-align:center; border-bottom: 2px solid #1f3a5f; padding-bottom: 8px; }
    .school { font-size: 20px; font-weight:700; color:#1f3a5f; }
    .addr { font-size: 11px; color:#666; }
    .title { text-align:center; font-weight:700; letter-spacing:.1em; margin:10px 0; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; font-size:14px; margin-top:8px; }
    td { padding:6px 4px; border-bottom:1px solid #eee; }
    .k { color:#666; width:42%; }
    .amt { font-size:18px; font-weight:700; }
    .sign { margin-top:36px; text-align:right; font-size:13px; }
  </style></head><body>
    <div class="head">
      ${s.logo ? `<img src="${s.logo}" style="height:48px" alt="logo"/>` : ''}
      <div class="school">${esc(s.name)}</div>
      ${s.address ? `<div class="addr">${esc(s.address)}</div>` : ''}
    </div>
    <div class="title">Fee Receipt</div>
    <table>
      <tr><td class="k">Receipt No.</td><td>${esc(r.receipt_no)}</td></tr>
      <tr><td class="k">Date</td><td>${esc(r.date)}</td></tr>
      <tr><td class="k">Received from</td><td>${esc(r.student)}</td></tr>
      <tr><td class="k">Towards</td><td>${esc(r.fee_head)}</td></tr>
      <tr><td class="k">Mode</td><td>${esc(r.mode)}${r.reference ? ` (${esc(r.reference)})` : ''}</td></tr>
      <tr><td class="k">Amount</td><td class="amt">₹ ${r.amount.toFixed(2)}</td></tr>
    </table>
    <div class="sign">${s.signature ? `<img src="${s.signature}" style="height:38px;display:block;margin-left:auto"/>` : ''}${esc(s.principalName || 'Authorised Signatory')}</div>
  </body></html>`;
}

export interface AttendanceReportRow {
  name: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  pct: number;
}

/** A4 attendance report for one section over a date range (printable → PDF). */
export function attendanceReportHtml(
  s: Letterhead,
  meta: { section: string; from: string; to: string; academicYear?: string | null },
  rows: AttendanceReportRow[],
): string {
  const withData = rows.filter((r) => r.total > 0);
  const avg = withData.length
    ? Math.round((withData.reduce((a, r) => a + r.pct, 0) / withData.length) * 10) / 10
    : 0;
  const below = withData.filter((r) => r.pct < 75).length;
  const body = rows.length
    ? rows
        .map((r, i) => {
          const marked = r.total > 0;
          const low = marked && r.pct < 75;
          const pct = marked ? `${r.pct}%` : '—';
          return `<tr${low ? ' class="low"' : ''}><td class="c">${i + 1}</td><td>${esc(r.name) || '—'}</td>` +
            `<td class="c">${r.present}</td><td class="c">${r.absent}</td><td class="c">${r.late}</td>` +
            `<td class="c">${r.excused}</td><td class="c">${r.total}</td><td class="c pct">${pct}</td></tr>`;
        })
        .join('')
    : `<tr><td colspan="8" style="text-align:center;color:#888">No attendance records for this period.</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Attendance Report — ${esc(meta.section)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 12px; }
    .head { display:flex; align-items:center; gap:14px; border-bottom:3px solid #11365f; padding-bottom:10px; }
    .head img { height:54px; }
    .head h1 { margin:0; font-size:20px; color:#11365f; }
    .head .sub { color:#555; font-size:12px; }
    .title { font-size:14px; color:#11365f; margin:16px 0 4px; text-transform:uppercase; letter-spacing:.3px; font-weight:700; }
    .meta { color:#555; font-size:11.5px; margin-bottom:8px; }
    .meta b { color:#1a1a1a; }
    table { width:100%; border-collapse:collapse; margin-top:4px; }
    td, th { border:1px solid #ccc; padding:5px 8px; text-align:left; }
    th { background:#f0f3f7; font-size:11px; }
    td.c, th.c { text-align:center; }
    td.pct { font-weight:600; }
    tr.low td { background:#fbecec; }
    tr.low td.pct { color:#b02020; }
    .stats { display:flex; gap:22px; margin-top:12px; font-size:12px; }
    .stats .n { font-size:18px; font-weight:700; color:#11365f; }
    .note { color:#888; font-size:10px; margin-top:14px; }
    .foot { margin-top:30px; display:flex; justify-content:space-between; align-items:flex-end; font-size:11px; color:#555; }
    .sigline { text-align:center; }
    .sigline .line { border-top:1px solid #333; padding-top:4px; min-width:180px; margin-top:34px; }
  </style></head><body>
    <div class="head">${s.logo ? `<img src="${s.logo}" alt="logo"/>` : ''}
      <div><h1>${esc(s.name)}</h1>${s.address ? `<div class="sub">${esc(s.address)}</div>` : ''}</div>
    </div>
    <div class="title">Attendance Report</div>
    <div class="meta"><b>Section:</b> ${esc(meta.section)} &nbsp;·&nbsp; <b>Period:</b> ${esc(meta.from)} to ${esc(meta.to)}${meta.academicYear ? ` &nbsp;·&nbsp; <b>Academic Year:</b> ${esc(meta.academicYear)}` : ''}</div>
    <table>
      <tr><th class="c">#</th><th>Student</th><th class="c">Present</th><th class="c">Absent</th><th class="c">Late</th><th class="c">Excused</th><th class="c">Marked</th><th class="c">%</th></tr>
      ${body}
    </table>
    <div class="stats">
      <div><div class="n">${rows.length}</div>Students</div>
      <div><div class="n">${avg}%</div>Class average</div>
      <div><div class="n">${below}</div>Below 75%</div>
    </div>
    <div class="note">Attendance % counts present and late sessions as attended. Generated from the LEOS school database; figures are live as of generation.</div>
    <div class="foot">
      <span>Generated ${esc(new Date().toISOString().slice(0, 10))}</span>
      <div class="sigline">${s.signature ? `<img src="${s.signature}" style="height:40px;display:block;margin:0 auto 2px" alt="signature"/>` : ''}<div class="line">${esc(s.principalName || 'Class Teacher / Principal')}</div></div>
    </div>
  </body></html>`;
}

/** Landscape, bordered certificate. */
export function certificateHtml(
  s: Letterhead,
  c: { serial?: string; date: string; type: string; title: string; studentName: string; body: string; qr?: string },
) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color:#1a1a1a; margin:0; }
    .sheet { width: 297mm; height: 209mm; box-sizing:border-box; padding: 14mm; position: relative; }
    .bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.16; z-index:0; }
    .frame { position:relative; z-index:1; height:100%; box-sizing:border-box; border: 6px solid #b8860b; outline: 2px solid #b8860b; outline-offset: 6px; padding: 18mm; text-align:center; display:flex; flex-direction:column; justify-content:space-between; }
    .school { font-size: 24px; font-weight:700; color:#1f3a5f; letter-spacing:.5px; }
    .addr { font-size: 12px; color:#666; }
    .ctitle { font-size: 38px; font-weight:700; color:#b8860b; letter-spacing:1px; margin: 8px 0; font-variant: small-caps; }
    .intro { font-size: 16px; color:#444; }
    .name { font-size: 30px; font-weight:700; margin: 8px 0; border-bottom: 1px solid #999; display:inline-block; padding: 0 24px 4px; }
    .reason { font-size: 17px; color:#222; max-width: 80%; margin: 6px auto; }
    .foot { display:flex; justify-content:space-between; align-items:flex-end; font-size:13px; margin-top: 12px; }
    .sigline { border-top:1px solid #333; padding-top:4px; min-width: 200px; }
  </style></head><body>
    <div class="sheet">
      ${s.certBg ? `<img class="bg" src="${s.certBg}" alt=""/>` : ''}
      <div class="frame">
      <div>
        ${s.logo ? `<img src="${s.logo}" style="height:54px;margin-bottom:4px" alt="logo"/>` : ''}
        <div class="school">${esc(s.name)}</div>
        ${s.address ? `<div class="addr">${esc(s.address)}</div>` : ''}
      </div>
      <div>
        <div class="ctitle">${esc(c.title)}</div>
        <div class="intro">This is to certify that</div>
        <div class="name">${esc(c.studentName)}</div>
        <div class="reason">${esc(c.body)}</div>
      </div>
      <div class="foot">
        <div style="text-align:left">Serial: ${esc(c.serial ?? '—')}<br/>Date: ${esc(c.date)}</div>
        ${c.qr ? `<div style="text-align:center"><img src="${c.qr}" style="width:70px;height:70px" alt="verify"/><div style="font-size:9px;color:#777">Scan to verify</div></div>` : ''}
        <div class="sigline">${s.signature ? `<img src="${s.signature}" style="height:40px;display:block;margin:0 auto 2px" alt="signature"/>` : ''}${esc(s.principalName || '')}<br/>Principal</div>
      </div>
    </div></div>
  </body></html>`;
}
