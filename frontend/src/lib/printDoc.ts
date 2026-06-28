// Open a print window with the given full HTML document and trigger print.
// Works in the Tauri WebView2 (and a browser): the native print dialog lets the
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

export interface Letterhead {
  name: string;
  address?: string | null;
  principalName?: string | null;
}

/** A4 letter on the principal's letterhead. */
export function letterHtml(s: Letterhead, l: { ref_no?: string; date: string; recipient?: string; subject: string; body: string }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(l.subject)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.55; }
    .head { text-align:center; border-bottom: 3px double #1f3a5f; padding-bottom: 10px; margin-bottom: 6px; }
    .school { font-size: 26px; font-weight: 700; color:#1f3a5f; letter-spacing:.5px; }
    .addr { font-size: 12px; color:#555; }
    .office { font-size: 12px; letter-spacing:.18em; text-transform:uppercase; color:#1f3a5f; margin-top:4px; }
    .meta { display:flex; justify-content:space-between; font-size:13px; margin:18px 0 22px; }
    .subject { text-align:center; font-weight:700; text-decoration:underline; margin: 12px 0 16px; }
    .body p { margin: 0 0 12px; text-align: justify; }
    .sign { margin-top: 48px; }
    .pname { font-weight:700; margin-top: 40px; }
  </style></head><body>
    <div class="head">
      <div class="school">${esc(s.name)}</div>
      ${s.address ? `<div class="addr">${esc(s.address)}</div>` : ''}
      <div class="office">Office of the Principal</div>
    </div>
    <div class="meta"><span>Ref: ${esc(l.ref_no ?? '—')}</span><span>Date: ${esc(l.date)}</span></div>
    ${l.recipient ? `<div>${paras(l.recipient)}</div>` : ''}
    <div class="subject">Subject: ${esc(l.subject)}</div>
    <div class="body">${paras(l.body)}</div>
    <div class="sign">
      <div>Yours sincerely,</div>
      <div class="pname">${esc(s.principalName || '')}</div>
      <div>Principal, ${esc(s.name)}</div>
    </div>
  </body></html>`;
}

/** Landscape, bordered certificate. */
export function certificateHtml(
  s: Letterhead,
  c: { serial?: string; date: string; type: string; title: string; studentName: string; body: string },
) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color:#1a1a1a; margin:0; }
    .sheet { width: 297mm; height: 209mm; box-sizing:border-box; padding: 14mm; }
    .frame { height:100%; box-sizing:border-box; border: 6px solid #b8860b; outline: 2px solid #b8860b; outline-offset: 6px; padding: 18mm; text-align:center; display:flex; flex-direction:column; justify-content:space-between; }
    .school { font-size: 24px; font-weight:700; color:#1f3a5f; letter-spacing:.5px; }
    .addr { font-size: 12px; color:#666; }
    .ctitle { font-size: 38px; font-weight:700; color:#b8860b; letter-spacing:1px; margin: 8px 0; font-variant: small-caps; }
    .intro { font-size: 16px; color:#444; }
    .name { font-size: 30px; font-weight:700; margin: 8px 0; border-bottom: 1px solid #999; display:inline-block; padding: 0 24px 4px; }
    .reason { font-size: 17px; color:#222; max-width: 80%; margin: 6px auto; }
    .foot { display:flex; justify-content:space-between; align-items:flex-end; font-size:13px; margin-top: 12px; }
    .sigline { border-top:1px solid #333; padding-top:4px; min-width: 200px; }
  </style></head><body>
    <div class="sheet"><div class="frame">
      <div>
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
        <div>Serial: ${esc(c.serial ?? '—')}<br/>Date: ${esc(c.date)}</div>
        <div class="sigline">${esc(s.principalName || '')}<br/>Principal</div>
      </div>
    </div></div>
  </body></html>`;
}
