/*
 * THE STREET - TRANG QUẢN TRỊ THI TĂNG CẤP
 * Nhúng vào WordPress bằng đoạn mã trong WORDPRESS.md (chỉ 2 dòng, dán 1 lần).
 * Sửa file này rồi đẩy lên nhánh main → GitHub Pages tự cập nhật sau vài phút, không cần sửa WordPress.
 * QUY TẮC: không đưa thông tin bí mật (ID Google Sheet, mật khẩu...) vào file này — repo này công khai.
 */
(function loadCss() {
  var me = document.currentScript;
  if (!me || document.getElementById("ts-admin-css")) return;
  var link = document.createElement("link");
  link.id = "ts-admin-css"; link.rel = "stylesheet";
  var u = new URL("admin.css", me.src);
  u.search = new URL(me.src).search;   // cùng mã phiên bản với file JS → luôn lấy CSS mới nhất
  link.href = u.href;
  document.head.appendChild(link);
})();
(function () {
  "use strict";

  /* ============================== CẤU HÌNH ============================== */
  const API_URL = "https://script.google.com/macros/s/AKfycbyaItGOm4q_G22pymVGrkEptNuburhYpj4xc1cZu4i0InXqOypQ9iZrRiQxw4XBJP_cPw/exec";
  const XLSX_CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const TOKEN_KEY = "ts_admin_token";
  const LABELS = ["A", "B", "C", "D"];

  // Elementor có thể dựng widget 2 lần (bản máy tính + bản điện thoại, 1 bản bị ẩn) với cùng id.
  // Luôn gắn vào khung đang HIỂN THỊ; khung còn lại được làm trống.
  if (window.__tsAdminStarted) return;
  window.__tsAdminStarted = true;
  function allRoots() { return Array.from(document.querySelectorAll("#ts-admin-app")); }
  function isVisible(el) { return !!(el && el.isConnected && (el.offsetParent !== null || el.getClientRects().length)); }
  function pickRoot() { const all = allRoots(); return all.find(isVisible) || all[0] || null; }
  let root = pickRoot();
  if (!root) { window.__tsAdminStarted = false; return; }
  function claim(el) {
    allRoots().forEach(o => { if (o !== el) { o.removeAttribute("data-init"); o.innerHTML = ""; } });
    el.setAttribute("data-init", "1");
  }
  claim(root);

  /* ============================== TRẠNG THÁI ============================== */
  let token = ssGet(TOKEN_KEY);
  let boot = null;                     // cấu hình, đợt thi, tóm tắt ngân hàng đề
  let tab = ssGet("ts_admin_tab") || "overview";
  let period = ssGet("ts_admin_period") || "";   // lọc đợt thi dùng chung cho Tổng quan & Bài thi
  let stats = null, statsFor = null;
  let qFilter = { position: "", showAll: false };
  let results = null, resultsFor = null;
  let voids = null, voidsFor = null;   // bài đã hủy khi cho thi lại
  let rFilter = { position: "", status: "", q: "" };
  let bank = null;
  let bFilter = { position: "", type: "", status: "", q: "" };
  let accounts = null;
  let logs = null, logTotal = 0;
  let lFilter = { user: "", action: "", q: "", limit: 100 };
  let busyCount = 0;

  /* ============================== TIỆN ÍCH ============================== */
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function $(s, el) { return (el || root).querySelector(s); }
  function $$(s, el) { return Array.from((el || root).querySelectorAll(s)); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDate(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function toInput(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fromInput(v) { if (!v) return null; const t = new Date(v).getTime(); return isNaN(t) ? null : t; }
  function fmtNum(n, d) { if (n === null || n === undefined || n === "") return "—"; return (Math.round(n * 100) / 100).toLocaleString("vi-VN", { maximumFractionDigits: d === undefined ? 2 : d }); }
  function pctText(n) { return n === null || n === undefined ? "—" : fmtNum(n, 1) + "%"; }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"); }
  function meter(pct, title) {
    if (pct === null || pct === undefined) return '<span class="muted">—</span>';
    const w = Math.max(0, Math.min(100, pct));
    return `<div class="meter" title="${esc(title || pctText(pct))}"><div class="trk"><div class="fil" style="width:${w}%"></div></div><span class="t">${pctText(pct)}</span></div>`;
  }
  function resultBadge(r) {
    if (!r.graded) return '<span class="badge b-wait">⏳ Chờ chấm</span>';
    return r.result === "Đạt" ? '<span class="badge b-ok">✓ Đạt</span>' : '<span class="badge b-bad">✗ Không đạt</span>';
  }
  function periodStatusBadge(s) {
    if (s === "open") return '<span class="badge b-ok">● Đang mở</span>';
    if (s === "upcoming") return '<span class="badge b-wait">◷ Chưa mở</span>';
    return '<span class="badge b-gray">■ Đã đóng</span>';
  }
  // Người đang đăng nhập (server cũ chưa trả "me" → coi như quản trị chính)
  function me() { return (boot && boot.me) || { username: "admin", name: "Quản trị chính", role: "quanly", roleLabel: "Quản lý" }; }
  function isMgr() { return me().role === "quanly"; }
  function isMaster() { return me().username === "admin"; }
  function posLabel(id) { const p = (boot && boot.positions || []).find(x => x.id === id); return p ? p.label : id; }

  function toast(msg, bad) {
    const t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => t.remove(), bad ? 5000 : 2500);
  }
  function setBusy(on) {
    busyCount += on ? 1 : -1;
    let b = $(".busy");
    if (busyCount > 0 && !b) { b = document.createElement("div"); b.className = "busy"; root.appendChild(b); }
    if (busyCount <= 0 && b) b.remove();
  }

  async function api(action, params) {
    setBusy(true);
    let data;
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 60000) : null;
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ action, token }, params || {})),
          signal: ctrl ? ctrl.signal : undefined
        });
        data = await res.json();
      } finally { if (timer) clearTimeout(timer); }
    } catch (e) {
      throw new Error(e && e.name === "AbortError" ? "Máy chủ phản hồi quá lâu (trên 60 giây). Vui lòng thử lại." : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally { setBusy(false); }
    if (!data || data.result !== "success") {
      if (data && data.code === "AUTH") { logout(true); }
      const err = new Error((data && data.error) || "Máy chủ trả về lỗi không xác định.");
      err.code = data && data.code; err.data = data;
      throw err;
    }
    return data;
  }
  async function run(fn) {
    try { return await fn(); } catch (e) { toast(e.message, true); return undefined; }
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function b64ToBlob(b64, type) {
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve();
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Không tải được thư viện xuất Excel."));
      document.head.appendChild(s);
    });
  }

  /* ============================== MODAL ============================== */
  let modalEl = null;
  function openModal(title, body, footer, wide) {
    closeModal();
    modalEl = document.createElement("div");
    modalEl.className = "modal-bg";
    modalEl.innerHTML = `<div class="modal${wide ? " wide" : ""}" role="dialog" aria-modal="true">
      <div class="modal-h"><h3>${title}</h3><button type="button" class="x" data-close aria-label="Đóng">×</button></div>
      <div class="modal-b">${body}</div>${footer ? `<div class="modal-f">${footer}</div>` : ""}</div>`;
    root.appendChild(modalEl);
    modalEl.addEventListener("mousedown", e => { if (e.target === modalEl) closeModal(); });
    $$("[data-close]", modalEl).forEach(b => b.onclick = closeModal);
    document.body.style.overflow = "hidden";
    return modalEl;
  }
  let onModalClose = null;   // việc cần làm khi đóng modal (vd: báo server thôi mở bài để chấm)
  function closeModal() {
    if (modalEl) { modalEl.remove(); modalEl = null; document.body.style.overflow = ""; }
    if (onModalClose) { const f = onModalClose; onModalClose = null; f(); }
  }
  // Gọi API không chờ kết quả, không hiện vòng xoay (dùng cho việc dọn dẹp)
  function fireAndForget(action, params) {
    fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ action, token }, params || {})) }).catch(() => {});
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && modalEl) closeModal(); });

  /* ============================== ĐĂNG NHẬP ============================== */
  function renderLogin(msg) {
    root.innerHTML = `<div class="wrap"><div class="card login">
      <div class="brand">THE STREET<small>NHẬU CÓ CHẤT</small></div>
      <h3 style="margin-top:14px;color:var(--g)">Quản trị thi tăng cấp</h3>
      <form id="lf" autocomplete="off">
        <input type="text" id="lu" placeholder="Tên đăng nhập" value="${esc(lsGet("ts_admin_user") || "")}" autocapitalize="off" spellcheck="false">
        <input type="password" id="lp" placeholder="Mật khẩu">
        <button class="btn pri" type="submit" id="lb">ĐĂNG NHẬP</button>
      </form>
      <div class="err" id="le">${esc(msg || "")}</div>
      <p class="muted" style="margin-top:12px">Quản trị chính: tên đăng nhập <b>admin</b>. Chưa có tài khoản? Liên hệ quản lý.</p>
    </div></div>`;
    (lsGet("ts_admin_user") ? $("#lp") : $("#lu")).focus();
    $("#lf").onsubmit = async e => {
      e.preventDefault();
      const pw = $("#lp").value;
      const user = $("#lu").value.trim().toLowerCase();
      if (!pw) return;
      $("#lb").disabled = true; $("#le").textContent = "";
      try {
        const d = await api("admin.login", { username: user, password: pw });
        lsSet("ts_admin_user", user);
        token = d.token; ssSet(TOKEN_KEY, token);
        await loadBoot();
      } catch (err) {
        $("#le").textContent = err.message;
        $("#lb").disabled = false;
      }
    };
  }

  function logout(expired) {
    if (token && !expired) { fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "admin.logout", token }) }).catch(() => {}); }
    token = null; ssSet(TOKEN_KEY, null);
    boot = stats = results = bank = accounts = logs = null;
    closeModal();
    renderLogin(expired ? "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại." : "");
  }

  async function loadBoot() {
    boot = await api("admin.bootstrap");
    if (period && !boot.periods.some(p => p.name === period)) { period = ""; ssSet("ts_admin_period", ""); }
    renderShell();
  }

  /* ============================== KHUNG TRANG ============================== */
  function allowedTabs() {
    const all = [["overview", "📊 Tổng quan & Báo cáo"], ["results", "📝 Bài thi & Chấm điểm"], ["bank", "📚 Ngân hàng đề"], ["periods", "🗓️ Đợt thi"],
      ["accounts", "👤 Tài khoản"], ["log", "📜 Nhật ký"]];
    return isMgr() ? all : all.filter(t => t[0] === "results");   // Người chấm chỉ chấm bài
  }
  function renderShell() {
    const tabs = allowedTabs();
    if (!tabs.some(t => t[0] === tab)) { tab = tabs[0][0]; ssSet("ts_admin_tab", tab); }
    const u = me();
    root.innerHTML = `<div class="wrap">
      <div class="top">
        <div class="brand">THE STREET<small>QUẢN TRỊ THI TĂNG CẤP</small></div>
        <div class="right">
          <span class="badge ${boot.pending ? "b-wait" : "b-ok"}">${boot.pending ? "⏳ " + boot.pending + " bài chờ chấm" : "✓ Đã chấm hết"}</span>
          <span class="who" title="Tên đăng nhập: ${esc(u.username)}">👤 <b>${esc(u.name)}</b> · ${esc(u.roleLabel || "")}</span>
          ${isMaster() ? "" : '<button class="btn sm" id="pw">Đổi mật khẩu</button>'}
          <button class="btn sm" id="rf">↻ Tải lại</button>
          <button class="btn sm danger" id="lo">Đăng xuất</button>
        </div>
      </div>
      <div class="tabs">${tabs.map(t => `<button class="tab${tab === t[0] ? " on" : ""}" data-tab="${t[0]}">${t[1]}</button>`).join("")}</div>
      <div id="main"></div>
    </div>`;
    $$("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; ssSet("ts_admin_tab", tab); renderShell(); });
    $("#lo").onclick = () => logout(false);
    const pwb = $("#pw"); if (pwb) pwb.onclick = changePassword;
    $("#rf").onclick = () => run(async () => { stats = results = bank = accounts = logs = null; await loadBoot(); });
    renderTab();
  }

  function renderTab() {
    if (tab === "overview") return renderOverview();
    if (tab === "results") return renderResults();
    if (tab === "bank") return renderBank();
    if (tab === "accounts") return renderAccounts();
    if (tab === "log") return renderLog();
    return renderPeriods();
  }

  function periodSelectHTML(id) {
    return `<select id="${id}"><option value="">Tất cả kỳ thi</option>${boot.periods.map(p =>
      `<option value="${esc(p.name)}"${p.name === period ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`;
  }
  function bindPeriodSelect(id, after) {
    $("#" + id).onchange = e => { period = e.target.value; ssSet("ts_admin_period", period); after(); };
  }

  /* ============================== TỔNG QUAN & BÁO CÁO ============================== */
  async function renderOverview() {
    const main = $("#main");
    main.innerHTML = `<div class="bar">${periodSelectHTML("ovp")}<button class="btn pri" id="xl">⬇ Xuất Excel tổng hợp</button></div><div id="ovc"><div class="card empty">⏳ Đang tính thống kê...</div></div>`;
    bindPeriodSelect("ovp", renderOverview);
    $("#xl").onclick = exportExcel;
    if (!stats || statsFor !== period) {
      const d = await run(() => api("admin.reports.stats", { period }));
      if (!d) return;
      stats = d.stats; statsFor = period;
    }
    if (tab !== "overview") return;
    drawOverview();
  }

  function drawOverview() {
    const o = stats.overall;
    const qs = stats.questions.filter(q => !qFilter.position || q.position === qFilter.position);
    const shownQ = qFilter.showAll ? qs : qs.slice(0, 15);
    const posOpts = boot.positions.map(p => `<option${qFilter.position === p.label ? " selected" : ""}>${esc(p.label)}</option>`).join("");

    $("#ovc").innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="l">Bài đã nộp</div><div class="v">${o.count}</div><div class="s">${period ? esc(period) : "Tất cả kỳ thi"}</div></div>
        <div class="kpi"><div class="l">Chờ chấm tự luận</div><div class="v" style="color:${o.pending ? "var(--amb)" : "var(--ink)"}">${o.pending}</div><div class="s">${o.graded} bài đã chấm</div></div>
        <div class="kpi"><div class="l">Tỉ lệ đạt</div><div class="v">${pctText(o.passRate)}</div><div class="s">${o.passed}/${o.graded} bài đã chấm</div></div>
        <div class="kpi"><div class="l">Điểm trung bình</div><div class="v">${pctText(o.avgPct)}</div><div class="s">% tổng điểm, bài đã chấm</div></div>
      </div>

      <div class="card">
        <div class="card-h"><h3>Kết quả theo vị trí</h3><span class="muted">Tỉ lệ đạt và điểm TB chỉ tính bài đã chấm tự luận</span></div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Vị trí</th><th class="num">Số bài</th><th class="num">Chờ chấm</th><th class="num">Đạt</th><th>Tỉ lệ đạt</th><th>Điểm TB (tổng)</th><th>Điểm TB trắc nghiệm</th></tr></thead>
          <tbody>${stats.byPosition.map(p => `<tr>
            <td><b>${esc(p.label)}</b></td><td class="num">${p.count}</td><td class="num">${p.pending}</td><td class="num">${p.passed}/${p.graded}</td>
            <td>${meter(p.passRate, p.label + ": " + p.passed + "/" + p.graded + " đạt")}</td>
            <td>${meter(p.avgPct)}</td><td>${meter(p.avgMcqPct)}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-h"><h3>Câu trắc nghiệm hay sai</h3>
          <div class="bar" style="margin:0"><select id="qpos"><option value="">Mọi vị trí</option>${posOpts}</select></div></div>
        ${qs.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Mã</th><th>Vị trí</th><th>Câu hỏi</th><th class="num">Lượt thi</th><th>Tỉ lệ đúng</th><th>Số lần chọn A · B · C · D</th></tr></thead>
          <tbody>${shownQ.map(q => `<tr>
            <td class="num" style="text-align:left">${esc(q.id)}</td><td>${esc(q.position)}</td>
            <td><div class="clip" title="${esc(q.q)}">${esc(q.q)}</div></td><td class="num">${q.asked}</td>
            <td>${meter(q.rate, q.correct + "/" + q.asked + " lượt trả lời đúng")}</td>
            <td class="opt-dist">${q.optionCounts.map((c, i) => q.options[i] ? `<span class="${i === q.answer ? "ans" : ""}" title="${esc(LABELS[i] + ". " + q.options[i])}">${LABELS[i]}${i === q.answer ? "✓" : ""} ${c}</span>` : "").join("")}</td></tr>`).join("")}</tbody>
        </table></div>
        ${qs.length > 15 ? `<div style="margin-top:10px"><button class="btn sm" id="qall">${qFilter.showAll ? "Thu gọn" : "Xem tất cả " + qs.length + " câu"}</button></div>` : ""}
        <p class="muted" style="margin-top:8px">Đáp án đúng có dấu ✓. Nếu nhiều người cùng chọn một phương án sai, nên xem lại nội dung đào tạo hoặc câu chữ của đề.</p>`
        : '<div class="empty">Chưa có dữ liệu bài thi.</div>'}
      </div>

      <div class="card">
        <div class="card-h"><h3>Câu tự luận điểm thấp</h3><span class="muted">Chỉ tính bài đã chấm</span></div>
        ${stats.essays.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Mã</th><th>Vị trí</th><th>Câu hỏi</th><th class="num">Số bài chấm</th><th>Điểm TB (% điểm câu)</th></tr></thead>
          <tbody>${stats.essays.slice(0, 15).map(e => `<tr><td>${esc(e.id)}</td><td>${esc(e.position)}</td><td><div class="clip" title="${esc(e.q)}">${esc(e.q)}</div></td><td class="num">${e.count}</td><td>${meter(e.avgPct)}</td></tr>`).join("")}</tbody>
        </table></div>` : '<div class="empty">Chưa có bài tự luận nào được chấm.</div>'}
      </div>`;

    $("#qpos").onchange = e => { qFilter.position = e.target.value; qFilter.showAll = false; drawOverview(); };
    const qa = $("#qall"); if (qa) qa.onclick = () => { qFilter.showAll = !qFilter.showAll; drawOverview(); };
  }

  async function exportExcel() {
    await run(async () => {
      const [d] = await Promise.all([api("admin.reports.export", { period }), loadScript(XLSX_CDN)]);
      const X = window.XLSX;
      const wb = X.utils.book_new();

      const head1 = ["STT", "Thời gian nộp", "Họ và tên", "Mã NV", "Vị trí", "Kỳ thi", "Điểm TN", "Số câu đúng", "Điểm TL", "Tổng điểm", "Điểm tối đa", "Tỉ lệ (%)", "Kết quả", "Người chấm", "Thời gian chấm", "Nhận xét", "Điểm TL từng câu", "Ghi chú hệ thống"];
      const rows1 = d.rows.map((r, i) => [
        i + 1, fmtDate(r.time), r.name, r.empId, r.position, r.period, r.mcqScore, r.correct,
        r.graded ? r.essayScore : "", r.graded ? r.total : "", r.max, r.pct === null ? "" : r.pct,
        r.graded ? r.result : "Chờ chấm", r.grader, fmtDate(r.gradedAt), r.note,
        (r.essayQuestions || []).map((q, k) => q.id + ": " + (Array.isArray(r.essayScores) ? r.essayScores[k] : "?") + "/" + q.points).join("; "),
        r.sys
      ]);
      const ws1 = X.utils.aoa_to_sheet([head1].concat(rows1));
      ws1["!cols"] = [5, 17, 24, 11, 11, 22, 8, 10, 8, 9, 9, 9, 11, 16, 17, 36, 40, 26].map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws1, "Tổng hợp");

      const s = d.stats;
      const rows2 = [["Vị trí", "Số bài", "Đã chấm", "Chờ chấm", "Đạt", "Tỉ lệ đạt (%)", "Điểm TB tổng (%)", "Điểm TB trắc nghiệm (%)"]]
        .concat(s.byPosition.map(p => [p.label, p.count, p.graded, p.pending, p.passed, p.passRate ?? "", p.avgPct ?? "", p.avgMcqPct ?? ""]))
        .concat([["TẤT CẢ", s.overall.count, s.overall.graded, s.overall.pending, s.overall.passed, s.overall.passRate ?? "", s.overall.avgPct ?? "", s.overall.avgMcqPct ?? ""]]);
      const ws2 = X.utils.aoa_to_sheet(rows2);
      ws2["!cols"] = [14, 9, 9, 9, 7, 13, 16, 22].map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws2, "Theo vị trí");

      const rows3 = [["Mã câu", "Vị trí", "Câu hỏi", "Số lượt", "Số đúng", "Tỉ lệ đúng (%)", "Đáp án đúng", "Chọn A", "Chọn B", "Chọn C", "Chọn D"]]
        .concat(s.questions.map(q => [q.id, q.position, q.q, q.asked, q.correct, q.rate, LABELS[q.answer]].concat(q.optionCounts)));
      const ws3 = X.utils.aoa_to_sheet(rows3);
      ws3["!cols"] = [11, 11, 70, 8, 8, 13, 11, 7, 7, 7, 7].map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws3, "Câu TN hay sai");

      const rows4 = [["Mã câu", "Vị trí", "Câu hỏi", "Số bài đã chấm", "Điểm TB (% điểm câu)"]]
        .concat(s.essays.map(e => [e.id, e.position, e.q, e.count, e.avgPct]));
      const ws4 = X.utils.aoa_to_sheet(rows4);
      ws4["!cols"] = [11, 11, 70, 14, 18].map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws4, "Câu tự luận");

      const now = new Date();
      const name = "BaoCao_" + (period || "TatCa").replace(/[\\\/:*?"<>|\s]+/g, "_") + "_" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + ".xlsx";
      X.writeFile(wb, name);
      toast("Đã xuất " + d.rows.length + " bài thi ra Excel.");
    });
  }

  /* ============================== BÀI THI & CHẤM ĐIỂM ============================== */
  async function renderResults() {
    const main = $("#main");
    const posOpts = boot.positions.map(p => `<option${rFilter.position === p.label ? " selected" : ""}>${esc(p.label)}</option>`).join("");
    main.innerHTML = `<div class="card">
      <div class="bar">${periodSelectHTML("rsp")}
        <select id="rpos"><option value="">Mọi vị trí</option>${posOpts}</select>
        <select id="rst"><option value="">Mọi trạng thái</option><option value="pending"${rFilter.status === "pending" ? " selected" : ""}>Chờ chấm</option><option value="graded"${rFilter.status === "graded" ? " selected" : ""}>Đã chấm</option><option value="pass"${rFilter.status === "pass" ? " selected" : ""}>Đạt</option><option value="fail"${rFilter.status === "fail" ? " selected" : ""}>Không đạt</option><option value="voided"${rFilter.status === "voided" ? " selected" : ""}>🗑 Bài đã hủy (cho thi lại)</option></select>
        <input type="text" id="rq" placeholder="Tìm tên hoặc mã NV..." value="${esc(rFilter.q)}">
      </div>
      <div id="rlist"><div class="empty">⏳ Đang tải danh sách bài thi...</div></div></div>`;
    bindPeriodSelect("rsp", () => { results = voids = null; renderResults(); });
    $("#rpos").onchange = e => { rFilter.position = e.target.value; drawResults(); };
    $("#rst").onchange = e => { const was = rFilter.status === "voided"; rFilter.status = e.target.value; if (was !== (rFilter.status === "voided")) renderResults(); else drawResults(); };
    $("#rq").oninput = e => { rFilter.q = e.target.value; drawResults(); };
    if (rFilter.status === "voided") {
      if (!voids || voidsFor !== period) {
        const d = await run(() => api("admin.results.list", { period, voided: true }));
        if (!d) return;
        voids = d.results; voidsFor = period;
      }
    } else if (!results || resultsFor !== period) {
      const d = await run(() => api("admin.results.list", { period }));
      if (!d) return;
      results = d.results; resultsFor = period;
    }
    if (tab !== "results") return;
    drawResults();
  }

  function filteredResults() {
    const q = norm(rFilter.q.trim());
    if (rFilter.status === "voided") return (voids || []).filter(r =>
      (!rFilter.position || r.position === rFilter.position) && (!q || norm(r.name).includes(q) || norm(r.empId).includes(q)));
    return (results || []).filter(r =>
      (!rFilter.position || r.position === rFilter.position) &&
      (!rFilter.status || (rFilter.status === "pending" && !r.graded) || (rFilter.status === "graded" && r.graded) ||
        (rFilter.status === "pass" && r.graded && r.result === "Đạt") || (rFilter.status === "fail" && r.graded && r.result !== "Đạt")) &&
      (!q || norm(r.name).includes(q) || norm(r.empId).includes(q)));
  }

  function drawResults() {
    const list = filteredResults();
    const el = $("#rlist");
    if (!el) return;
    if (!list.length) { el.innerHTML = `<div class="empty">${rFilter.status === "voided" ? "Chưa có bài nào bị hủy để thi lại." : "Không có bài thi nào khớp bộ lọc."}</div>`; return; }
    el.innerHTML = `<p class="muted" style="margin:0 0 8px">${rFilter.status === "voided"
        ? list.length + " bài đã hủy khi cho thi lại. Bài đã hủy chỉ để tra cứu, không tính vào thống kê."
        : list.length + " bài thi · " + list.filter(r => !r.graded).length + " chờ chấm. Bấm vào một dòng để xem và chấm."}</p>
      <div class="tbl-wrap"><table>
      <thead><tr><th>Thời gian nộp</th><th>Họ và tên</th><th>Mã NV</th><th>Vị trí</th><th>Kỳ thi</th><th class="num">Trắc nghiệm</th><th class="num">Tự luận</th><th class="num">Tổng</th><th>Kết quả</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr class="click" data-key="${esc(r.key)}">
        <td style="white-space:nowrap">${fmtDate(r.time)}</td><td><b>${esc(r.name)}</b>${r.sys ? `<div class="muted" style="color:var(--red)">${esc(r.sys)}</div>` : ""}${r.voided ? `<div class="muted">Hủy ${fmtDate(r.voidedAt)} bởi ${esc(r.voidedBy)}${r.voidReason ? " · " + esc(r.voidReason) : ""}</div>` : ""}</td>
        <td>${esc(r.empId)}</td><td>${esc(r.position)}</td><td>${esc(r.period)}</td>
        <td class="num">${fmtNum(r.mcqScore)}/${fmtNum(r.mcqMax)}</td>
        <td class="num">${r.graded ? fmtNum(r.essayScore) + "/" + fmtNum(r.essayMax) : "—"}</td>
        <td class="num">${r.graded ? `<b>${fmtNum(r.total)}</b>/${fmtNum(r.max)}` : "—"}</td>
        <td>${r.voided ? '<span class="badge b-gray">🗑 Đã hủy</span>' : resultBadge(r)}</td>
        <td><button class="btn sm ${r.graded || r.voided ? "" : "pri"}">${r.graded || r.voided ? "Xem" : "Chấm"}</button></td></tr>`).join("")}</tbody></table></div>`;
    $$("tr[data-key]", el).forEach(tr => tr.onclick = () => openResult(tr.dataset.key));
  }

  async function openResult(key) {
    const summary = (results || []).concat(voids || []).find(r => r.key === key);
    const d = await run(() => api("admin.results.get", { key, empId: summary ? summary.empId : undefined }));
    if (!d) return;
    showResultModal(d.item);
  }

  function showResultModal(it) {
    const data = it.data;
    const essays = data ? data.essay : [{ q: "Tự luận (bài thi phiên bản cũ — chấm tổng điểm tự luận)", points: 10, answer: it.essaysText.filter(Boolean).join("\n\n———\n\n") || "(không có dữ liệu)" }];
    const scores = Array.isArray(it.essayScores) ? it.essayScores.slice() : (it.graded && !data ? [it.essayScore] : essays.map(() => null));
    const guides = it.guides || {};
    const ro = !!it.voided;            // bài đã hủy: chỉ xem
    let version = it.version;          // thời gian chấm gần nhất lúc mở bài — để phát hiện người khác vừa chấm
    const grader = it.grader || lsGet("ts_admin_grader") || "";
    // Tài khoản riêng: người chấm là chủ tài khoản. Quản trị chính (dùng chung) gõ tên người chấm.
    const graderField = isMaster()
      ? `<input type="text" id="gname" value="${esc(grader)}" placeholder="Tên người chấm">`
      : `<div style="padding-top:6px"><b>${esc(me().name)}</b> <span class="muted">(theo tài khoản đăng nhập)</span></div>`;

    const mcqHTML = data ? data.mcq.map((q, i) => {
      const ok = q.chosen === q.correct;
      return `<div class="mcq-item ${ok ? "ok" : "bad"}"><div><b>Câu ${i + 1}</b> <span class="muted">${esc(q.id)} · ${q.points} điểm</span> ${ok ? '<span class="badge b-ok">✓ Đúng</span>' : '<span class="badge b-bad">✗ Sai</span>'}</div>
        <div style="margin-top:4px;white-space:pre-wrap">${esc(q.q)}</div>
        <div class="opts">${q.options.map((o, k) => o ? `<div class="${k === q.correct ? "c" : (k === q.chosen ? "w" : "")}">${LABELS[k]}. ${esc(o)}${k === q.correct ? " ✓ (đáp án)" : ""}${k === q.chosen ? " ← thí sinh chọn" : ""}</div>` : "").join("")}
        ${q.chosen === null ? '<div class="w">(Thí sinh bỏ trống)</div>' : ""}</div></div>`;
    }).join("") : `<div class="muted" style="white-space:pre-wrap">${esc(it.detail || "Không có chi tiết.")}</div>`;

    const essayHTML = essays.map((q, i) => {
      const steps = []; for (let v = 0; v <= q.points; v += (q.points <= 4 ? 0.5 : 1)) steps.push(v);
      return `<div class="essay" data-i="${i}">
        <div class="muted">Câu tự luận ${i + 1}${q.id ? " · " + esc(q.id) : ""} · tối đa ${q.points} điểm</div>
        <div class="q">${esc(q.q)}</div>
        <div class="a">${esc(q.answer || "(Thí sinh bỏ trống)")}</div>
        ${q.id && guides[q.id] ? `<details class="guide" open><summary>📋 Đáp án mẫu / hướng dẫn chấm</summary><div>${esc(guides[q.id])}</div></details>` : ""}
        <div class="score-row"><span class="muted">Điểm:</span>
          ${steps.map(v => `<button type="button" class="qs" data-v="${v}"${ro ? " disabled" : ""}>${fmtNum(v)}</button>`).join("")}
          <input type="number" class="sc" min="0" max="${q.points}" step="0.25" value="${scores[i] === null || scores[i] === undefined ? "" : scores[i]}" aria-label="Điểm câu ${i + 1}"${ro ? " disabled" : ""}> / ${q.points}
        </div></div>`;
    }).join("");

    const body = `
      <div class="info-grid">
        <div><div class="l">Họ và tên</div><div class="v">${esc(it.name)}</div></div>
        <div><div class="l">Mã NV</div><div class="v">${esc(it.empId)}</div></div>
        <div><div class="l">Vị trí · Kỳ thi</div><div class="v">${esc(it.position)} · ${esc(it.period)}</div></div>
        <div><div class="l">Nộp lúc</div><div class="v">${fmtDate(it.time)}</div></div>
      </div>
      ${it.voided ? `<div class="sumbox" style="background:#eef0ee;color:#444">🗑 Bài này đã bị hủy để nhân viên thi lại: ${fmtDate(it.voidedAt)} bởi <b>${esc(it.voidedBy)}</b>${it.voidReason ? ". Lý do: " + esc(it.voidReason) : ""}. Chỉ xem, không chấm được.</div>` : ""}
      ${it.editing ? `<div class="sumbox warnbox">⚠️ <b>${esc(it.editing.name)}</b> đang mở bài này để chấm (từ ${fmtDate(it.editing.since)}). Nên chờ họ chấm xong để tránh hai người chấm cùng một bài.</div>` : ""}
      ${it.sys ? `<div class="sumbox" style="background:var(--redl);color:var(--red)">⚠️ ${esc(it.sys)}</div>` : ""}
      <details${data ? "" : " open"}><summary>Phần trắc nghiệm: ${fmtNum(it.mcqScore)}/${fmtNum(it.mcqMax)} điểm (${esc(it.correct)} câu đúng) — bấm để xem chi tiết</summary>${mcqHTML}</details>
      <h4 style="margin:14px 0 10px;color:#e67e22">Phần tự luận</h4>
      ${essayHTML}
      <div class="sumbox" id="sumbox"></div>
      <div class="row2">
        <div class="field"><label>Người chấm${ro ? "" : " *"}</label>${ro ? `<div style="padding-top:6px">${esc(it.grader || "—")}</div>` : graderField}</div>
        <div class="field"><label>Kết quả hiện tại</label><div style="padding-top:6px">${resultBadge(it)}${it.gradedAt ? ` <span class="muted">chấm lúc ${fmtDate(it.gradedAt)} bởi ${esc(it.grader)}</span>` : ""}</div></div>
      </div>
      <div class="field"><label>Nhận xét</label><textarea id="gnote" placeholder="Nhận xét chi tiết cho nhân viên..."${ro ? " disabled" : ""}>${esc(it.note)}</textarea></div>`;

    const footer = ro ? `<button class="btn" id="gpdf">⬇ Phiếu điểm PDF</button><button class="btn" data-close>Đóng</button>` : `
      ${isMgr() ? '<button class="btn danger" id="greset" style="margin-right:auto">Cho thi lại</button>' : '<span style="margin-right:auto"></span>'}
      <button class="btn" id="gpdf">⬇ Phiếu điểm PDF</button>
      <button class="btn" id="gsave">Lưu điểm</button>
      <button class="btn pri" id="gnext">Lưu & bài chờ chấm tiếp →</button>`;

    const m = openModal((ro ? "Bài đã hủy: " : "Bài thi: ") + esc(it.name), body, footer, true);
    $("#gpdf", m).onclick = () => downloadPdf(it);
    if (ro) return;
    onModalClose = () => fireAndForget("admin.results.release", { key: it.key });

    function readScores() {
      return $$(".essay", m).map(el => { const v = $(".sc", el).value.trim(); return v === "" ? null : Number(v); });
    }
    function updateSum() {
      const sc = readScores();
      $$(".essay", m).forEach((el, i) => {
        $$(".qs", el).forEach(b => b.classList.toggle("on", sc[i] !== null && Number(b.dataset.v) === sc[i]));
      });
      const filled = sc.every(v => v !== null && !isNaN(v));
      const essaySum = sc.reduce((a, v) => a + (v || 0), 0);
      const total = it.mcqScore + essaySum;
      const pct = it.max ? total / it.max * 100 : 0;
      const pass = pct >= it.passPct;
      $("#sumbox", m).innerHTML = filled
        ? `Trắc nghiệm ${fmtNum(it.mcqScore)} + Tự luận ${fmtNum(essaySum)} = <b>${fmtNum(total)}/${fmtNum(it.max)}</b> điểm (${pctText(pct)}) → ${pass ? '<span class="badge b-ok">✓ Đạt</span>' : '<span class="badge b-bad">✗ Không đạt</span>'} <span class="muted">(điểm đạt ${it.passPct}%)</span>`
        : `<span class="muted">Nhập đủ điểm các câu tự luận để xem tổng điểm (điểm đạt của kỳ thi: ${it.passPct}% tổng điểm).</span>`;
    }
    $$(".essay", m).forEach(el => {
      $$(".qs", el).forEach(b => b.onclick = () => { $(".sc", el).value = b.dataset.v; updateSum(); });
      $(".sc", el).oninput = updateSum;
    });
    updateSum();

    async function save(goNext) {
      const sc = readScores();
      const gname = isMaster() ? $("#gname", m).value.trim() : me().name;
      if (!gname) { toast("Vui lòng nhập tên người chấm.", true); $("#gname", m).focus(); return; }
      for (let i = 0; i < sc.length; i++) {
        if (sc[i] === null || isNaN(sc[i]) || sc[i] < 0 || sc[i] > essays[i].points) { toast(`Điểm câu tự luận ${i + 1} phải từ 0 đến ${essays[i].points}.`, true); return; }
      }
      if (isMaster()) lsSet("ts_admin_grader", gname);
      const payload = { key: it.key, empId: it.empId, essayScores: sc, grader: gname, note: $("#gnote", m).value, expectVersion: version };
      let d;
      try { d = await api("admin.results.grade", payload); }
      catch (e) {
        if (e.code !== "CONFLICT") { toast(e.message, true); return; }
        // Người khác vừa chấm bài này: hỏi trước khi ghi đè
        if (!confirm(e.message + "\n\nBấm OK để vẫn lưu điểm của bạn (ghi đè điểm của họ).\nBấm Hủy để tải lại bài và xem điểm mới.")) { openResult(it.key); return; }
        try { d = await api("admin.results.grade", Object.assign(payload, { force: true })); }
        catch (e2) { toast(e2.message, true); return; }
      }
      version = d.summary.gradedAt;
      const idx = (results || []).findIndex(r => r.key === it.key);
      const wasPending = !it.graded;
      if (idx >= 0) results[idx] = d.summary;
      if (wasPending && boot.pending) boot.pending--;
      stats = null; logs = null;
      toast("Đã lưu điểm cho " + it.name + ".");
      const top = $(".top .badge"); if (top) top.outerHTML = `<span class="badge ${boot.pending ? "b-wait" : "b-ok"}">${boot.pending ? "⏳ " + boot.pending + " bài chờ chấm" : "✓ Đã chấm hết"}</span>`;
      drawResults();
      if (goNext) {
        const list = filteredResults();
        const cur = list.findIndex(r => r.key === it.key);
        const next = list.slice(cur + 1).concat(list.slice(0, Math.max(cur, 0))).find(r => !r.graded && r.key !== it.key);
        if (next) return openResult(next.key);
        toast("Đã chấm hết các bài trong danh sách đang lọc.");
      }
      closeModal();
    }
    $("#gsave", m).onclick = () => save(false);
    $("#gnext", m).onclick = () => save(true);
    if ($("#greset", m)) $("#greset", m).onclick = async () => {
      const reason = prompt(`Cho ${it.name} (${it.empId}) thi lại?\n\nBài này được chuyển sang mục "Bài đã hủy" (vẫn xem và tải PDF được), nhân viên sẽ làm bài mới.\n\nLý do (không bắt buộc), rồi bấm OK:`, "");
      if (reason === null) return;
      const d = await run(() => api("admin.results.reset", { key: it.key, empId: it.empId, reason }));
      if (!d) return;
      results = (results || []).filter(r => r.key !== it.key);
      voids = null;
      if (!it.graded && boot.pending) boot.pending--;
      stats = null;
      closeModal();
      toast("Đã chuyển bài cũ sang mục Bài đã hủy. " + it.name + " có thể vào thi lại.");
      renderShell();
    };
  }

  async function downloadPdf(it) {
    toast("Đang tạo phiếu điểm PDF (khoảng 5–10 giây)...");
    const d = await run(() => api("admin.reports.pdf", { key: it.key, empId: it.empId }));
    if (!d) return;
    downloadBlob(b64ToBlob(d.base64, "application/pdf"), d.fileName);
  }

  /* ============================== NGÂN HÀNG ĐỀ ============================== */
  async function renderBank() {
    const main = $("#main");
    const need = bankNeed();
    main.innerHTML = `
      <div id="bmeta">${bankMetaHTML()}</div>
      <div class="card">
        <div class="card-h"><h3>Ngân hàng đề</h3><div class="bar" style="margin:0">
          <button class="btn" id="bexp">⬇ Xuất Excel</button>
          <button class="btn" id="bimp">⬆ Nhập Excel</button><input type="file" id="bfile" accept=".xlsx,.xls,.csv" style="display:none">
          <button class="btn pri" id="bnew">+ Thêm câu hỏi</button></div></div>
        <p class="muted" style="margin:-4px 0 12px">Mỗi lượt thi, hệ thống rút ngẫu nhiên số câu trắc nghiệm và tự luận đang dùng của vị trí đó theo cài đặt của đợt thi (mặc định ${boot.config.mcqCount} TN + ${boot.config.essayCount} TL; các đợt chưa đóng hiện cần tối đa ${need.mcqCount} TN + ${need.essayCount} TL). Kho càng nhiều câu, đề giữa các nhân viên càng khác nhau.</p>
        <div class="bar">
          <select id="bpos"><option value="">Mọi vị trí</option>${boot.positions.map(p => `<option value="${p.id}"${bFilter.position === p.id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select>
          <select id="btype"><option value="">Mọi loại</option><option value="TN"${bFilter.type === "TN" ? " selected" : ""}>Trắc nghiệm</option><option value="TL"${bFilter.type === "TL" ? " selected" : ""}>Tự luận</option></select>
          <select id="bst"><option value="">Mọi trạng thái</option><option value="on"${bFilter.status === "on" ? " selected" : ""}>Đang dùng</option><option value="off"${bFilter.status === "off" ? " selected" : ""}>Tạm ẩn</option></select>
          <input type="text" id="bq" placeholder="Tìm nội dung hoặc mã câu..." value="${esc(bFilter.q)}">
        </div>
        <div id="blist"><div class="empty">⏳ Đang tải ngân hàng đề...</div></div>
      </div>`;
    $("#bnew").onclick = () => editQuestion(null);
    $("#bexp").onclick = exportBank;
    $("#bimp").onclick = () => { $("#bfile").value = ""; $("#bfile").click(); };
    $("#bfile").onchange = e => { const f = e.target.files && e.target.files[0]; if (f) importBank(f); };
    $("#bpos").onchange = e => { bFilter.position = e.target.value; drawBank(); };
    $("#btype").onchange = e => { bFilter.type = e.target.value; drawBank(); };
    $("#bst").onchange = e => { bFilter.status = e.target.value; drawBank(); };
    $("#bq").oninput = e => { bFilter.q = e.target.value; drawBank(); };
    if (!bank) {
      const d = await run(() => api("admin.bank.list"));
      if (!d) return;
      bank = d.questions;
    }
    if (tab !== "bank") return;
    drawBank();
  }

  function bankIssuesHTML() {
    const bi = boot.bankIssues;
    if (!bi || (!bi.noIdRows.length && !bi.duplicateIds.length)) return "";
    const parts = [];
    if (bi.noIdRows.length) parts.push(`<li>Có <b>${bi.noIdRows.length} câu hỏi thiếu mã câu</b> trong cơ sở dữ liệu nên đang bị bỏ qua, không được dùng để thi.</li>`);
    if (bi.duplicateIds.length) parts.push(`<li>Các mã câu bị <b>trùng</b>: <b>${bi.duplicateIds.map(d => esc(d.id)).join(", ")}</b>. Hệ thống tạm khóa sửa / ẩn / xóa các câu này để tránh thao tác nhầm.</li>`);
    return `<div class="card" style="border:1.5px solid #f0b3ae;background:var(--redl)"><b style="color:var(--red)">⚠️ Ngân hàng đề có dữ liệu cần xử lý — vui lòng báo người quản lý hệ thống</b><ul style="margin:8px 0 0 18px;padding:0">${parts.join("")}</ul></div>`;
  }

  function drawBank() {
    const el = $("#blist");
    if (!el) return;
    const q = norm(bFilter.q.trim());
    const list = bank.filter(x =>
      (!bFilter.position || x.positionId === bFilter.position) && (!bFilter.type || x.type === bFilter.type) &&
      (!bFilter.status || (bFilter.status === "on") === x.active) &&
      (!q || norm(x.q).includes(q) || norm(x.id).includes(q)));
    if (!list.length) { el.innerHTML = '<div class="empty">Không có câu hỏi nào khớp bộ lọc.</div>'; return; }
    el.innerHTML = `<p class="muted" style="margin:0 0 8px">${list.length} câu hỏi</p><div class="tbl-wrap"><table>
      <thead><tr><th>Mã</th><th>Vị trí</th><th>Loại</th><th>Nội dung</th><th>Đáp án</th><th class="num">Điểm</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${list.map(x => `<tr data-id="${esc(x.id)}" style="${x._pending ? "background:#fffbea" : (x.active ? "" : "opacity:.6")}">
        <td style="white-space:nowrap">${x._pending && !x._hasId ? '<span class="muted">(chờ mã)</span>' : esc(x.id)}</td><td>${esc(x.positionLabel)}</td>
        <td>${x.type === "TN" ? '<span class="badge b-ok">TN</span>' : '<span class="badge b-wait">TL</span>'}</td>
        <td><div class="clip" title="${esc(x.q)}">${esc(x.q)}</div>${x.guide ? '<div class="muted" title="' + esc(x.guide) + '">📋 Có đáp án mẫu</div>' : ""}</td>
        <td>${x.type === "TN" ? (x.answer === null ? '<span class="badge b-bad">Thiếu</span>' : `<span title="${esc(x.options[x.answer])}"><b>${LABELS[x.answer]}</b></span>`) : "—"}</td>
        <td class="num">${fmtNum(x.points)}</td>
        <td>${x._pending ? '<span class="badge b-wait">⏳ Đang lưu...</span>' : (x.active ? '<span class="badge b-ok">Đang dùng</span>' : '<span class="badge b-gray">Tạm ẩn</span>')}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-act="edit"${x._pending ? " disabled" : ""}>Sửa</button> <button class="btn sm" data-act="toggle"${x._pending ? " disabled" : ""}>${x.active ? "Ẩn" : "Dùng"}</button> <button class="btn sm danger" data-act="del"${x._pending ? " disabled" : ""}>Xóa</button></td></tr>`).join("")}</tbody></table></div>`;
    $$("tr[data-id]", el).forEach(tr => {
      const item = bank.find(x => x.id === tr.dataset.id);
      $('[data-act="edit"]', tr).onclick = () => editQuestion(item);
      $('[data-act="toggle"]', tr).onclick = async () => {
        const target = !item.active;
        item.active = target; item._pending = true; item._hasId = true; drawBank();
        try {
          const d = await api("admin.bank.toggle", { id: item.id, active: target });
          applyBankMeta(d);
          toast(target ? "Đã đưa câu " + item.id + " vào sử dụng." : "Đã tạm ẩn câu " + item.id + ".");
        } catch (e) { item.active = !target; toast(e.message, true); }
        item._pending = false; drawBank();
      };
      $('[data-act="del"]', tr).onclick = async () => {
        if (!confirm("Xóa vĩnh viễn câu " + item.id + "?\n\nBài thi đã nộp vẫn giữ nguyên nội dung câu hỏi. Nếu chỉ muốn ngừng dùng, hãy bấm \"Ẩn\".")) return;
        const at = bank.indexOf(item);
        bank.splice(at, 1); drawBank();
        try {
          const d = await api("admin.bank.delete", { id: item.id });
          applyBankMeta(d);
          toast("Đã xóa câu " + item.id + ".");
        } catch (e) { bank.splice(at, 0, item); drawBank(); toast(e.message, true); }
      };
    });
  }

  // Số câu tối thiểu mỗi vị trí cần có: lớn nhất trong các đợt thi chưa đóng (không có đợt nào thì lấy mặc định)
  function bankNeed() {
    const live = boot.periods.filter(p => p.status !== "closed");
    if (!live.length) return { mcqCount: boot.config.mcqCount, essayCount: boot.config.essayCount };
    return {
      mcqCount: Math.max(...live.map(p => p.mcqCount || boot.config.mcqCount)),
      essayCount: Math.max(...live.map(p => p.essayCount || boot.config.essayCount))
    };
  }

  function bankMetaHTML() {
    const need = bankNeed();
    return `<div class="chips">${boot.bank.map(b => {
        const warn = b.activeTN < need.mcqCount || b.activeTL < need.essayCount;
        return `<div class="chip${warn ? " warn" : ""}"><b>${esc(b.label)}</b>: ${b.activeTN} TN · ${b.activeTL} TL đang dùng${warn ? ` — ⚠️ cần tối thiểu ${need.mcqCount} TN và ${need.essayCount} TL` : ""}</div>`;
      }).join("")}</div>${bankIssuesHTML()}`;
  }
  // Số liệu tổng do server trả kèm sau mỗi thao tác — không cần gọi thêm lượt nào
  function applyBankMeta(d) {
    if (d && d.bank) { boot.bank = d.bank; boot.bankIssues = d.bankIssues; }
    const el = $("#bmeta"); if (el) el.innerHTML = bankMetaHTML();
  }
  let tmpSeq = 0;

  function editQuestion(item, draft) {
    const x = draft || item || { positionId: bFilter.position || boot.positions[0].id, type: bFilter.type || "TN", q: "", options: ["", "", "", ""], answer: null, points: (bFilter.type === "TL" ? 2 : 3), active: true, guide: "" };
    const body = `
      <div class="row2">
        <div class="field"><label>Vị trí *</label><select id="qpos2">${boot.positions.map(p => `<option value="${p.id}"${p.id === x.positionId ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select></div>
        <div class="field"><label>Loại câu hỏi *</label><select id="qtype"${item ? " disabled" : ""}><option value="TN"${x.type === "TN" ? " selected" : ""}>Trắc nghiệm</option><option value="TL"${x.type === "TL" ? " selected" : ""}>Tự luận</option></select></div>
      </div>
      <div class="field"><label>Nội dung câu hỏi *</label><textarea id="qtext" rows="3">${esc(x.q)}</textarea></div>
      <div id="qopts">
        <label style="display:block;font-weight:700;font-size:12px;color:var(--ink2);margin-bottom:6px">Phương án (chọn đáp án đúng ở ô tròn) *</label>
        ${LABELS.map((L, i) => `<div class="opt-row"><b style="width:18px">${L}</b><input type="text" class="qo" value="${esc(x.options[i] || "")}" placeholder="Phương án ${L}${i >= 2 ? " (có thể bỏ trống)" : ""}"><label><input type="radio" name="qans" value="${i}"${x.answer === i ? " checked" : ""}> Đúng</label></div>`).join("")}
      </div>
      <div class="row2">
        <div class="field"><label>Điểm *</label><input type="number" id="qpts" min="0.5" step="0.5" value="${x.points}"></div>
        <div class="field"><label>Trạng thái</label><select id="qact"><option value="1"${x.active ? " selected" : ""}>Đang dùng</option><option value="0"${x.active ? "" : " selected"}>Tạm ẩn</option></select></div>
      </div>
      <div class="field"><label id="qguide-l">Đáp án mẫu / hướng dẫn chấm <span class="muted">(chỉ người chấm thấy, nhân viên đi thi không thấy)</span></label>
        <textarea id="qguide" rows="3" placeholder="VD: - Chào khách, giới thiệu tên (1 điểm)&#10;- Mời ngồi, đưa thực đơn (1 điểm)">${esc(x.guide || "")}</textarea></div>
      ${item ? `<p class="muted">Sửa câu hỏi chỉ ảnh hưởng các lượt thi bắt đầu sau khi lưu. Bài đã nộp giữ nguyên nội dung lúc thi.</p>` : ""}`;
    const m = openModal(item ? "Sửa câu " + esc(item.id) : "Thêm câu hỏi mới", body,
      `<button class="btn" data-close>Hủy</button><button class="btn pri" id="qsave">Lưu câu hỏi</button>`);
    $$("[data-close]", m).forEach(b => b.onclick = closeModal);
    const syncType = () => { $("#qopts", m).style.display = $("#qtype", m).value === "TN" ? "" : "none"; };
    $("#qtype", m).onchange = () => { syncType(); if (!item) $("#qpts", m).value = $("#qtype", m).value === "TL" ? 2 : 3; };
    syncType();
    $("#qsave", m).onclick = async () => {
      const type = $("#qtype", m).value;
      const ansEl = $('input[name="qans"]:checked', m);
      const q = {
        id: item ? item.id : "", positionId: $("#qpos2", m).value, type,
        q: $("#qtext", m).value.trim(), options: $$(".qo", m).map(i => i.value.trim()),
        answer: ansEl ? Number(ansEl.value) : null, points: Number($("#qpts", m).value), active: $("#qact", m).value === "1",
        guide: $("#qguide", m).value.trim()
      };
      // Kiểm tra giống server để báo lỗi ngay, không phải chờ
      let err = "";
      if (!q.q) err = "Vui lòng nhập nội dung câu hỏi.";
      else if (q.q.length > 3000) err = "Nội dung câu hỏi quá dài (tối đa 3000 ký tự).";
      else if (q.guide.length > 3000) err = "Đáp án mẫu quá dài (tối đa 3000 ký tự).";
      else if (!(q.points > 0 && q.points <= 100)) err = "Điểm phải lớn hơn 0.";
      else if (type === "TN" && q.options.filter(o => o).length < 2) err = "Câu trắc nghiệm cần ít nhất 2 phương án.";
      else if (type === "TN" && (q.answer === null || !q.options[q.answer])) err = "Vui lòng chọn đáp án đúng (phương án đó không được để trống).";
      if (err) { toast(err, true); return; }

      // Hiện ngay trong danh sách, đóng form, lưu ngầm
      const original = item ? Object.assign({}, item) : null;
      const view = Object.assign({}, q, {
        id: item ? item.id : "tmp-" + (++tmpSeq), positionLabel: posLabel(q.positionId),
        answer: type === "TN" ? q.answer : null, options: type === "TN" ? q.options : ["", "", "", ""],
        _pending: true, _hasId: !!item
      });
      const idx = item ? bank.indexOf(item) : -1;
      if (idx >= 0) bank[idx] = view; else bank.unshift(view);
      closeModal();
      drawBank();
      try {
        const d = await api("admin.bank.save", { question: q });
        view.id = d.id; view._pending = false; view._hasId = true;
        applyBankMeta(d);
        drawBank();
        toast((item ? "Đã cập nhật câu " : "Đã thêm câu ") + d.id + ".");
      } catch (e) {
        const at = bank.indexOf(view);
        if (at >= 0) { if (original) bank[at] = Object.assign(item, original); else bank.splice(at, 1); }
        drawBank();
        toast("Chưa lưu được: " + e.message, true);
        editQuestion(item, Object.assign({}, q, { id: item ? item.id : "" }));   // mở lại form, giữ nguyên nội dung đã nhập
      }
    };
  }

  /* ---------- Xuất / nhập ngân hàng đề bằng Excel ---------- */
  const BANK_COLS = ["Mã câu", "Vị trí", "Loại (TN/TL)", "Nội dung câu hỏi", "Phương án A", "Phương án B", "Phương án C", "Phương án D",
    "Đáp án đúng", "Điểm", "Trạng thái", "Đáp án mẫu / hướng dẫn chấm"];

  function bankFiltered() {
    const q = norm(bFilter.q.trim());
    return (bank || []).filter(x => !x._pending &&
      (!bFilter.position || x.positionId === bFilter.position) && (!bFilter.type || x.type === bFilter.type) &&
      (!bFilter.status || (bFilter.status === "on") === x.active) &&
      (!q || norm(x.q).includes(q) || norm(x.id).includes(q)));
  }

  async function exportBank() {
    await run(async () => {
      if (!bank) return;
      await loadScript(XLSX_CDN);
      const X = window.XLSX;
      const list = bankFiltered();
      const rows = [BANK_COLS].concat(list.map(x => [x.id, x.positionLabel, x.type, x.q,
        x.options[0] || "", x.options[1] || "", x.options[2] || "", x.options[3] || "",
        x.type === "TN" && x.answer !== null ? LABELS[x.answer] : "", x.points, x.active ? "Đang dùng" : "Tạm ẩn", x.guide || ""]));
      const ws = X.utils.aoa_to_sheet(rows);
      ws["!cols"] = [12, 11, 8, 60, 24, 24, 24, 24, 9, 7, 11, 50].map(w => ({ wch: w }));
      const guide = X.utils.aoa_to_sheet([
        ["CÁCH NHẬP LẠI FILE NÀY VÀO TRANG QUẢN TRỊ (Ngân hàng đề → ⬆ Nhập Excel)"],
        ["• Giữ nguyên dòng tiêu đề và thứ tự cột của trang \"Ngân hàng đề\"."],
        ["• Có Mã câu → cập nhật đúng câu đó. Để trống Mã câu → thêm câu mới (hệ thống tự cấp mã)."],
        ["• Vị trí: " + boot.positions.map(p => p.label).join(", ") + ". Loại: TN (trắc nghiệm) hoặc TL (tự luận)."],
        ["• Câu TN cần ít nhất 2 phương án và Đáp án đúng là A, B, C hoặc D. Câu TL để trống phương án và đáp án."],
        ["• Trạng thái: Đang dùng hoặc Tạm ẩn (để trống = Đang dùng). Đáp án mẫu chỉ người chấm thấy."],
        ["• Muốn xóa câu: không xóa trong file, hãy bấm Xóa (hoặc Ẩn) trên trang quản trị."],
        ["• Nếu có dòng lỗi, hệ thống không nhập dòng nào cho đến khi sửa xong."]
      ]);
      guide["!cols"] = [{ wch: 110 }];
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, "Ngân hàng đề");
      X.utils.book_append_sheet(wb, guide, "Hướng dẫn");
      const now = new Date();
      X.writeFile(wb, "NganHangDe_" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + ".xlsx");
      toast("Đã xuất " + list.length + " câu hỏi ra Excel.");
    });
  }

  // Đọc 1 dòng Excel thành câu hỏi + kiểm tra giống server. Trả { q, error, kind }.
  function parseBankRow(get, rowNo) {
    const id = String(get("id")).trim();
    const posTxt = norm(String(get("pos")).trim());
    const p = boot.positions.find(x => norm(x.label) === posTxt || x.id === posTxt);
    const t = norm(String(get("type")).trim());
    const type = (t === "tn" || t.startsWith("trac")) ? "TN" : ((t === "tl" || t.startsWith("tu luan")) ? "TL" : "");
    const options = ["a", "b", "c", "d"].map(k => String(get(k)).trim());
    const ansTxt = String(get("ans")).trim().toUpperCase();
    const answer = LABELS.indexOf(ansTxt);
    const ptsRaw = String(get("pts")).trim().replace(",", ".");
    const points = ptsRaw === "" ? (type === "TL" ? 2 : 3) : Number(ptsRaw);
    const st = norm(String(get("status")).trim());
    const q = {
      rowNo, id, positionId: p ? p.id : "", type, q: String(get("q")).trim(),
      options: type === "TN" ? options : ["", "", "", ""], answer: type === "TN" && answer >= 0 ? answer : null,
      points, active: !(st === "tam an" || st === "an" || st === "tat" || st === "khong"), guide: String(get("guide")).trim()
    };
    let error = "";
    if (!p) error = "Vị trí \"" + get("pos") + "\" không hợp lệ.";
    else if (!type) error = "Loại phải là TN hoặc TL.";
    else if (!q.q) error = "Thiếu nội dung câu hỏi.";
    else if (q.q.length > 3000) error = "Nội dung câu hỏi quá dài.";
    else if (!(points > 0 && points <= 100)) error = "Điểm phải lớn hơn 0.";
    else if (type === "TN" && options.filter(o => o).length < 2) error = "Câu trắc nghiệm cần ít nhất 2 phương án.";
    else if (type === "TN" && (answer < 0 || !options[answer])) error = "Đáp án đúng phải là A–D và phương án đó không được trống.";
    else if (q.guide.length > 3000) error = "Đáp án mẫu quá dài.";
    else if (id && !bank.some(x => x.id === id)) error = "Không có câu mã " + id + " trong ngân hàng đề. Để trống Mã câu nếu muốn thêm câu mới.";
    return { q, error, kind: id ? "update" : "add" };
  }

  async function importBank(file) {
    await run(async () => {
      if (!bank) { const d = await api("admin.bank.list"); bank = d.questions; }
      await loadScript(XLSX_CDN);
      const X = window.XLSX;
      // CSV đọc dạng chữ UTF-8 để giữ tiếng Việt có dấu; xlsx/xls đọc dạng nhị phân
      const wb = /\.csv$/i.test(file.name) ? X.read(await file.text(), { type: "string" }) : X.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
      // Tìm cột theo tiêu đề (không phân biệt dấu, hoa thường)
      const head = (aoa[0] || []).map(h => norm(String(h)));
      const find = (test) => head.findIndex(test);
      const col = {
        id: find(h => h.startsWith("ma")), pos: find(h => h.startsWith("vi tri")), type: find(h => h.startsWith("loai")),
        q: find(h => h.startsWith("noi dung")), a: find(h => /phuong an a$/.test(h)), b: find(h => /phuong an b$/.test(h)),
        c: find(h => /phuong an c$/.test(h)), d: find(h => /phuong an d$/.test(h)), ans: find(h => h.startsWith("dap an dung")),
        pts: find(h => h.startsWith("diem")), status: find(h => h.startsWith("trang thai")), guide: find(h => h.startsWith("dap an mau"))
      };
      const missing = ["pos", "type", "q"].filter(k => col[k] < 0);
      if (missing.length) throw new Error("File thiếu cột Vị trí / Loại / Nội dung câu hỏi. Hãy bấm ⬇ Xuất Excel để lấy file mẫu đúng định dạng.");
      const items = [], seen = {};
      for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r || r.every(v => String(v).trim() === "")) continue;
        const it = parseBankRow(k => col[k] >= 0 ? (r[col[k]] === undefined ? "" : r[col[k]]) : "", i + 1);
        if (!it.error && it.q.id) {
          if (seen[it.q.id]) it.error = "Mã câu " + it.q.id + " lặp lại (đã có ở dòng " + seen[it.q.id] + ").";
          else seen[it.q.id] = i + 1;
        }
        items.push(it);
      }
      if (!items.length) throw new Error("File không có dòng câu hỏi nào.");
      showImportPreview(file.name, items);
    });
  }

  function showImportPreview(fileName, items) {
    const errs = items.filter(i => i.error);
    const nAdd = items.filter(i => !i.error && i.kind === "add").length, nUpd = items.filter(i => !i.error && i.kind === "update").length;
    const tooMany = items.length > 300;
    const shown = (errs.length ? errs.concat(items.filter(i => !i.error)) : items).slice(0, 200);
    const body = `
      <p><b>${esc(fileName)}</b>: ${items.length} dòng · <span class="badge b-ok">${nAdd} thêm mới</span> <span class="badge b-wait">${nUpd} cập nhật</span>${errs.length ? ` <span class="badge b-bad">${errs.length} dòng lỗi</span>` : ""}</p>
      ${errs.length ? '<div class="sumbox" style="background:var(--redl);color:var(--red)">Có dòng lỗi nên chưa nhập được. Sửa các dòng bên dưới trong file Excel rồi chọn lại file.</div>' : ""}
      ${tooMany ? '<div class="sumbox" style="background:var(--redl);color:var(--red)">Mỗi lần nhập tối đa 300 câu. Hãy chia file thành nhiều phần.</div>' : ""}
      ${!errs.length && !tooMany ? '<p class="muted">Câu có Mã câu sẽ được cập nhật (bài thi đã nộp không bị ảnh hưởng). Câu không có mã sẽ được thêm mới. Câu giống hệt hiện tại được bỏ qua.</p>' : ""}
      <div class="tbl-wrap"><table>
        <thead><tr><th class="num">Dòng</th><th>Kết quả</th><th>Mã</th><th>Vị trí</th><th>Loại</th><th>Nội dung</th><th>Đáp án</th><th class="num">Điểm</th></tr></thead>
        <tbody>${shown.map(i => `<tr${i.error ? ' class="row-err"' : ""}>
          <td class="num">${i.q.rowNo}</td>
          <td>${i.error ? `<span class="badge b-bad">Lỗi</span><div class="muted" style="color:var(--red)">${esc(i.error)}</div>` : (i.kind === "add" ? '<span class="badge b-ok">Thêm mới</span>' : '<span class="badge b-wait">Cập nhật</span>')}</td>
          <td>${esc(i.q.id || "—")}</td><td>${esc(posLabel(i.q.positionId) || "")}</td><td>${esc(i.q.type)}</td>
          <td><div class="clip" title="${esc(i.q.q)}">${esc(i.q.q)}</div></td>
          <td>${i.q.type === "TN" && i.q.answer !== null ? LABELS[i.q.answer] : "—"}</td><td class="num">${fmtNum(i.q.points)}</td></tr>`).join("")}</tbody>
      </table></div>
      ${items.length > shown.length ? `<p class="muted">… và ${items.length - shown.length} dòng nữa.</p>` : ""}`;
    const ok = !errs.length && !tooMany;
    const m = openModal("Nhập ngân hàng đề từ Excel", body,
      `<button class="btn" data-close>${ok ? "Hủy" : "Đóng"}</button>${ok ? `<button class="btn pri" id="impgo">Nhập ${items.length} câu</button>` : ""}`, true);
    if (!ok) return;
    $("#impgo", m).onclick = async () => {
      $("#impgo", m).disabled = true;
      try {
        const d = await api("admin.bank.import", { questions: items.map(i => i.q) });
        closeModal();
        toast(`Đã nhập: ${d.added} câu mới, ${d.updated} câu cập nhật${d.unchanged ? ", " + d.unchanged + " câu không đổi" : ""}.`);
        applyBankMeta(d);
        bank = null; logs = null;
        renderBank();
      } catch (e) {
        if (e.data && Array.isArray(e.data.errors)) {
          const byRow = {}; e.data.errors.forEach(x => byRow[x.row] = x.error);
          items.forEach(i => { if (byRow[i.q.rowNo]) i.error = byRow[i.q.rowNo]; });
          showImportPreview(fileName, items);
        }
        toast(e.message, true);
        const b = $("#impgo"); if (b) b.disabled = false;
      }
    };
  }

  /* ============================== ĐỢT THI ============================== */
  function renderPeriods() {
    const main = $("#main");
    const list = boot.periods;
    main.innerHTML = `<div class="card">
      <div class="card-h"><h3>Đợt thi</h3><button class="btn pri" id="pnew">+ Thêm đợt thi</button></div>
      <p class="muted" style="margin:-4px 0 12px">Trang thi chỉ hiện các đợt <b>đang mở</b>. Để trống giờ mở/đóng nghĩa là không giới hạn. Nhân viên đã bắt đầu trước giờ đóng vẫn được làm đủ thời gian.</p>
      ${list.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Tên kỳ thi</th><th>Mở lúc</th><th>Đóng lúc</th><th class="num">Số câu</th><th class="num">Thời gian</th><th class="num">Điểm đạt</th><th>Trạng thái</th><th class="num">Đã nộp</th><th></th></tr></thead>
        <tbody>${list.map((p, i) => `<tr data-i="${i}">
          <td><b>${esc(p.name)}</b>${p.note ? `<div class="muted">${esc(p.note)}</div>` : ""}</td>
          <td style="white-space:nowrap">${p.opensAt ? fmtDate(p.opensAt) : '<span class="muted">Không giới hạn</span>'}</td>
          <td style="white-space:nowrap">${p.closesAt ? fmtDate(p.closesAt) : '<span class="muted">Không giới hạn</span>'}</td>
          <td class="num" style="white-space:nowrap">${p.mcqCount || boot.config.mcqCount} TN + ${p.essayCount || boot.config.essayCount} TL</td>
          <td class="num">${p.duration} phút</td><td class="num">${p.passPct}%</td>
          <td>${periodStatusBadge(p.status)}</td>
          <td class="num">${p.submitted}${p.started > p.submitted ? ` <span class="muted">(+${p.started - p.submitted} đang thi)</span>` : ""}</td>
          <td style="white-space:nowrap"><button class="btn sm" data-act="edit">Sửa</button> ${p.started ? "" : '<button class="btn sm danger" data-act="del">Xóa</button>'}</td></tr>`).join("")}</tbody></table></div>`
        : '<div class="empty">Chưa có đợt thi nào. Bấm "+ Thêm đợt thi" để tạo.</div>'}
    </div>`;
    $("#pnew").onclick = () => editPeriod(null);
    $$("tr[data-i]").forEach(tr => {
      const p = list[Number(tr.dataset.i)];
      $('[data-act="edit"]', tr).onclick = () => editPeriod(p);
      const del = $('[data-act="del"]', tr);
      if (del) del.onclick = () => run(async () => {
        if (!confirm("Xóa đợt thi \"" + p.name + "\"?")) return;
        await api("admin.periods.delete", { name: p.name });
        toast("Đã xóa đợt thi.");
        await loadBoot();
      });
    });
  }

  function editPeriod(p) {
    const x = p || { name: "", opensAt: null, closesAt: null, duration: boot.config.defaultDuration, passPct: boot.config.defaultPassPct,
      mcqCount: boot.config.mcqCount, essayCount: boot.config.essayCount, note: "", started: 0 };
    const lockName = p && p.started > 0;
    const body = `
      <div class="field"><label>Tên kỳ thi *</label><input type="text" id="pname" value="${esc(x.name)}" maxlength="100" placeholder="VD: Thi tăng cấp Quý 4/2026"${lockName ? " disabled" : ""}>
        ${lockName ? '<div class="muted">Đã có nhân viên thi nên không đổi được tên.</div>' : ""}</div>
      <div class="row2">
        <div class="field"><label>Mở lúc</label><input type="datetime-local" id="popen" value="${toInput(x.opensAt)}"></div>
        <div class="field"><label>Đóng lúc</label><input type="datetime-local" id="pclose" value="${toInput(x.closesAt)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Thời gian làm bài (phút) *</label><input type="number" id="pdur" min="5" max="300" step="1" value="${x.duration}"></div>
        <div class="field"><label>Điểm đạt (% tổng điểm) *</label><input type="number" id="ppass" min="0" max="100" step="1" value="${x.passPct}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Số câu trắc nghiệm *</label><input type="number" id="pmcq" min="1" max="100" step="1" value="${x.mcqCount || boot.config.mcqCount}"></div>
        <div class="field"><label>Số câu tự luận *</label><input type="number" id="pessay" min="1" max="20" step="1" value="${x.essayCount || boot.config.essayCount}"></div>
      </div>
      <p class="muted" style="margin-top:-6px">Mỗi vị trí cần có đủ số câu đang dùng trong ngân hàng đề. Đổi số câu chỉ áp dụng cho lượt thi bắt đầu sau khi lưu.</p>
      <div class="field"><label>Ghi chú</label><input type="text" id="pnote" value="${esc(x.note)}" maxlength="300"></div>
      ${p ? '<p class="muted">Đổi điểm đạt sẽ tự cập nhật lại cột Kết quả của các bài đã chấm trong đợt này.</p>' : ""}`;
    const m = openModal(p ? "Sửa đợt thi" : "Thêm đợt thi", body, `<button class="btn" data-close>Hủy</button><button class="btn pri" id="psave">Lưu đợt thi</button>`);
    $$("[data-close]", m).forEach(b => b.onclick = closeModal);
    $("#psave", m).onclick = () => run(async () => {
      const period_ = {
        originalName: p ? p.name : "", name: $("#pname", m).value.trim(),
        opensAt: fromInput($("#popen", m).value), closesAt: fromInput($("#pclose", m).value),
        duration: Number($("#pdur", m).value), passPct: Number($("#ppass", m).value),
        mcqCount: Number($("#pmcq", m).value), essayCount: Number($("#pessay", m).value), note: $("#pnote", m).value.trim()
      };
      if (!period_.name) throw new Error("Vui lòng nhập tên kỳ thi.");
      await api("admin.periods.save", { period: period_ });
      if (p && period === p.name) { period = period_.name; ssSet("ts_admin_period", period); }
      stats = results = null;
      closeModal();
      toast("Đã lưu đợt thi.");
      await loadBoot();
    });
  }

  /* ============================== TÀI KHOẢN ============================== */
  async function renderAccounts() {
    const main = $("#main");
    main.innerHTML = `<div class="card">
      <div class="card-h"><h3>Tài khoản quản trị</h3><button class="btn pri" id="anew">+ Thêm tài khoản</button></div>
      <p class="muted" style="margin:-4px 0 12px">Mỗi người dùng một tài khoản riêng để biết chính xác ai chấm bài, ai sửa đề.
        <b>Quản lý</b> dùng được mọi chức năng. <b>Người chấm</b> chỉ xem, chấm bài tự luận và tải phiếu điểm.
        Tài khoản <b>admin</b> (quản trị chính) dùng mật khẩu cài trong Apps Script, không hiện ở đây.</p>
      <div id="alist"><div class="empty">⏳ Đang tải danh sách tài khoản...</div></div></div>`;
    $("#anew").onclick = () => editAccount(null);
    if (!accounts) {
      const d = await run(() => api("admin.accounts.list"));
      if (!d) return;
      accounts = d.accounts;
    }
    if (tab !== "accounts") return;
    drawAccounts();
  }

  function drawAccounts() {
    const el = $("#alist");
    if (!el) return;
    if (!accounts.length) { el.innerHTML = '<div class="empty">Chưa có tài khoản riêng nào. Bấm "+ Thêm tài khoản" để tạo cho từng người chấm / quản lý.</div>'; return; }
    el.innerHTML = `<div class="tbl-wrap"><table>
      <thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th></th></tr></thead>
      <tbody>${accounts.map((a, i) => `<tr data-i="${i}" style="${a.active ? "" : "opacity:.6"}">
        <td><b>${esc(a.username)}</b>${a.username === me().username ? ' <span class="muted">(bạn)</span>' : ""}</td><td>${esc(a.name)}</td>
        <td>${a.role === "quanly" ? '<span class="badge b-ok">Quản lý</span>' : '<span class="badge b-wait">Người chấm</span>'}</td>
        <td>${a.active ? '<span class="badge b-ok">Đang dùng</span>' : '<span class="badge b-gray">Đã khóa</span>'}</td>
        <td style="white-space:nowrap">${a.lastLogin ? fmtDate(a.lastLogin) : '<span class="muted">Chưa đăng nhập</span>'}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-act="edit">Sửa</button>${a.username === me().username ? "" : ` <button class="btn sm" data-act="lock">${a.active ? "Khóa" : "Mở khóa"}</button> <button class="btn sm danger" data-act="del">Xóa</button>`}</td></tr>`).join("")}</tbody></table></div>`;
    $$("tr[data-i]", el).forEach(tr => {
      const a = accounts[Number(tr.dataset.i)];
      $('[data-act="edit"]', tr).onclick = () => editAccount(a);
      const lock = $('[data-act="lock"]', tr);
      if (lock) lock.onclick = () => run(async () => {
        if (a.active && !confirm(`Khóa tài khoản ${a.username} (${a.name})?\n\nNgười này bị đăng xuất ngay và không đăng nhập được nữa cho đến khi mở khóa.`)) return;
        const d = await api("admin.accounts.save", { account: { originalUsername: a.username, username: a.username, name: a.name, role: a.role, active: !a.active } });
        accounts = d.accounts; drawAccounts();
        toast(a.active ? "Đã khóa tài khoản " + a.username + "." : "Đã mở khóa tài khoản " + a.username + ".");
      });
      const del = $('[data-act="del"]', tr);
      if (del) del.onclick = () => run(async () => {
        if (!confirm(`Xóa vĩnh viễn tài khoản ${a.username} (${a.name})?\n\nNhật ký và các bài đã chấm vẫn giữ tên người này. Nếu chỉ muốn tạm ngừng, hãy bấm "Khóa".`)) return;
        const d = await api("admin.accounts.delete", { username: a.username });
        accounts = d.accounts; drawAccounts();
        toast("Đã xóa tài khoản " + a.username + ".");
      });
    });
  }

  function editAccount(a, draft) {
    const x = draft || a || { username: "", name: "", role: "chamthi", active: true };
    const self = a && a.username === me().username;
    const body = `
      <div class="row2">
        <div class="field"><label>Tên đăng nhập *</label><input type="text" id="auser" value="${esc(x.username)}" maxlength="30" placeholder="VD: lan.nguyen" autocapitalize="off" spellcheck="false">
          <div class="muted">Chữ không dấu, số và dấu . _ -</div></div>
        <div class="field"><label>Họ tên *</label><input type="text" id="aname" value="${esc(x.name)}" maxlength="100" placeholder="Tên hiện trên bài chấm và nhật ký"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Vai trò *</label><select id="arole"${self ? " disabled" : ""}>
          <option value="chamthi"${x.role === "chamthi" ? " selected" : ""}>Người chấm — chỉ xem và chấm bài</option>
          <option value="quanly"${x.role === "quanly" ? " selected" : ""}>Quản lý — dùng mọi chức năng</option></select></div>
        <div class="field"><label>Trạng thái</label><select id="aact"${self ? " disabled" : ""}><option value="1"${x.active ? " selected" : ""}>Đang dùng</option><option value="0"${x.active ? "" : " selected"}>Khóa</option></select></div>
      </div>
      <div class="field"><label>${a ? "Đặt lại mật khẩu (để trống nếu không đổi)" : "Mật khẩu *"}</label><input type="password" id="apass" autocomplete="new-password" placeholder="Ít nhất 6 ký tự"></div>
      ${a ? '<p class="muted">Đổi vai trò, khóa hoặc đặt lại mật khẩu sẽ đăng xuất người này khỏi mọi thiết bị.</p>' : '<p class="muted">Gửi tên đăng nhập và mật khẩu cho người dùng. Họ có thể tự đổi mật khẩu sau khi đăng nhập.</p>'}`;
    const m = openModal(a ? "Sửa tài khoản " + esc(a.username) : "Thêm tài khoản", body,
      `<button class="btn" data-close>Hủy</button><button class="btn pri" id="asave">Lưu tài khoản</button>`);
    $("#asave", m).onclick = async () => {
      const acc = {
        originalUsername: a ? a.username : "", username: $("#auser", m).value.trim().toLowerCase(), name: $("#aname", m).value.trim(),
        role: $("#arole", m).value, active: $("#aact", m).value === "1", password: $("#apass", m).value
      };
      let err = "";
      if (!/^[a-z0-9._-]{3,30}$/.test(acc.username)) err = "Tên đăng nhập 3–30 ký tự, chỉ gồm chữ không dấu, số và dấu . _ -";
      else if (acc.username === "admin") err = "Tên \"admin\" dành cho quản trị chính, hãy chọn tên khác.";
      else if (!acc.name) err = "Vui lòng nhập họ tên.";
      else if (!a && !acc.password) err = "Vui lòng đặt mật khẩu cho tài khoản mới.";
      else if (acc.password && acc.password.length < 6) err = "Mật khẩu cần ít nhất 6 ký tự.";
      if (err) { toast(err, true); return; }
      $("#asave", m).disabled = true;
      try {
        const d = await api("admin.accounts.save", { account: acc });
        accounts = d.accounts;
        closeModal(); drawAccounts();
        toast(a ? "Đã cập nhật tài khoản " + acc.username + "." : "Đã tạo tài khoản " + acc.username + ".");
      } catch (e) {
        toast(e.message, true);
        $("#asave", m).disabled = false;
      }
    };
  }

  function changePassword() {
    const body = `
      <div class="field"><label>Mật khẩu hiện tại *</label><input type="password" id="opw" autocomplete="current-password"></div>
      <div class="field"><label>Mật khẩu mới *</label><input type="password" id="npw" autocomplete="new-password" placeholder="Ít nhất 6 ký tự"></div>
      <div class="field"><label>Nhập lại mật khẩu mới *</label><input type="password" id="npw2" autocomplete="new-password"></div>
      <p class="muted">Các thiết bị khác đang đăng nhập tài khoản này sẽ bị đăng xuất.</p>`;
    const m = openModal("Đổi mật khẩu", body, `<button class="btn" data-close>Hủy</button><button class="btn pri" id="pwsave">Đổi mật khẩu</button>`);
    $("#opw", m).focus();
    $("#pwsave", m).onclick = async () => {
      const o = $("#opw", m).value, n = $("#npw", m).value;
      if (!o) return toast("Vui lòng nhập mật khẩu hiện tại.", true);
      if (n.length < 6) return toast("Mật khẩu mới cần ít nhất 6 ký tự.", true);
      if (n !== $("#npw2", m).value) return toast("Hai lần nhập mật khẩu mới không khớp.", true);
      $("#pwsave", m).disabled = true;
      try {
        await api("admin.account.password", { oldPassword: o, newPassword: n });
        closeModal(); toast("Đã đổi mật khẩu.");
      } catch (e) { toast(e.message, true); $("#pwsave", m).disabled = false; }
    };
  }

  /* ============================== NHẬT KÝ ============================== */
  const LOG_GROUPS = [
    ["", "Mọi hành động"], ["grade", "Chấm / sửa điểm"], ["reset", "Cho thi lại"], ["bank", "Ngân hàng đề"],
    ["period", "Đợt thi"], ["account", "Tài khoản & mật khẩu"], ["login", "Đăng nhập / đăng xuất"], ["export", "Xuất Excel / PDF"]
  ];
  function logGroup(action) {
    if (/điểm|Chấm bài/.test(action) && !/phiếu/.test(action)) return "grade";
    if (/thi lại/.test(action)) return "reset";
    if (/câu hỏi/.test(action)) return "bank";
    if (/đợt thi/.test(action)) return "period";
    if (/tài khoản|mật khẩu/i.test(action)) return "account";
    if (/Đăng/.test(action)) return "login";
    if (/Xuất|Tải/.test(action)) return "export";
    return "";
  }
  function logBadge(action) {
    const g = logGroup(action);
    const cls = /Xóa|thi lại|sai|Khóa/.test(action) ? "b-bad" : (g === "grade" ? "b-ok" : (g === "login" || g === "export" ? "b-gray" : "b-wait"));
    return `<span class="badge ${cls}">${esc(action)}</span>`;
  }

  async function renderLog() {
    const main = $("#main");
    main.innerHTML = `<div class="card">
      <div class="card-h"><h3>Nhật ký thao tác</h3><button class="btn" id="lxl">⬇ Xuất Excel</button></div>
      <p class="muted" style="margin:-4px 0 12px">Ghi lại ai làm gì, lúc nào: chấm bài, sửa điểm, cho thi lại, sửa đề, sửa đợt thi, tài khoản, đăng nhập. Nhật ký không sửa hay xóa được từ trang quản trị.</p>
      <div class="bar">
        <select id="luser"><option value="">Mọi người</option></select>
        <select id="lact">${LOG_GROUPS.map(g => `<option value="${g[0]}"${lFilter.action === g[0] ? " selected" : ""}>${g[1]}</option>`).join("")}</select>
        <input type="text" id="lq" placeholder="Tìm tên nhân viên, mã câu, kỳ thi..." value="${esc(lFilter.q)}">
      </div>
      <div id="llist"><div class="empty">⏳ Đang tải nhật ký...</div></div></div>`;
    $("#lact").onchange = e => { lFilter.action = e.target.value; lFilter.limit = 100; drawLog(); };
    $("#lq").oninput = e => { lFilter.q = e.target.value; lFilter.limit = 100; drawLog(); };
    $("#luser").onchange = e => { lFilter.user = e.target.value; lFilter.limit = 100; drawLog(); };
    $("#lxl").onclick = exportLog;
    // Luôn tải mới khi mở tab để thấy thao tác vừa làm
    const d = await run(() => api("admin.log.list"));
    if (!d) return;
    logs = d.logs; logTotal = d.total;
    if (tab !== "log") return;
    const users = {};
    logs.forEach(l => { if (l.username && !users[l.username]) users[l.username] = l.name || l.username; });
    $("#luser").innerHTML = '<option value="">Mọi người</option>' + Object.keys(users).sort().map(u =>
      `<option value="${esc(u)}"${lFilter.user === u ? " selected" : ""}>${esc(users[u])}${users[u] !== u ? " (" + esc(u) + ")" : ""}</option>`).join("");
    drawLog();
  }

  function filteredLogs() {
    const q = norm(lFilter.q.trim());
    return (logs || []).filter(l =>
      (!lFilter.user || l.username === lFilter.user) && (!lFilter.action || logGroup(l.action) === lFilter.action) &&
      (!q || norm(l.target + " " + l.detail + " " + l.name + " " + l.action).includes(q)));
  }

  function drawLog() {
    const el = $("#llist");
    if (!el || !logs) return;
    const list = filteredLogs();
    if (!list.length) { el.innerHTML = '<div class="empty">Không có dòng nhật ký nào khớp bộ lọc.</div>'; return; }
    const shown = list.slice(0, lFilter.limit);
    el.innerHTML = `<p class="muted" style="margin:0 0 8px">${list.length} dòng${logTotal > logs.length ? ` · đang xem ${logs.length} dòng gần nhất trên tổng ${logTotal}` : ""}</p>
      <div class="tbl-wrap"><table>
      <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
      <tbody>${shown.map(l => `<tr>
        <td style="white-space:nowrap">${fmtDate(l.time)}</td>
        <td><b>${esc(l.name || l.username)}</b>${l.name && l.name !== l.username ? `<div class="muted">${esc(l.username)}</div>` : ""}</td>
        <td>${logBadge(l.action)}</td><td>${esc(l.target)}</td>
        <td><div class="log-detail">${esc(l.detail)}</div></td></tr>`).join("")}</tbody></table></div>
      ${list.length > shown.length ? `<div style="margin-top:10px"><button class="btn sm" id="lmore">Xem thêm ${Math.min(100, list.length - shown.length)} dòng</button></div>` : ""}`;
    const more = $("#lmore"); if (more) more.onclick = () => { lFilter.limit += 100; drawLog(); };
  }

  async function exportLog() {
    await run(async () => {
      if (!logs) return;
      await loadScript(XLSX_CDN);
      const X = window.XLSX;
      const rows = [["Thời gian", "Tên đăng nhập", "Họ tên", "Hành động", "Đối tượng", "Chi tiết"]]
        .concat(filteredLogs().map(l => [fmtDate(l.time), l.username, l.name, l.action, l.target, l.detail]));
      const ws = X.utils.aoa_to_sheet(rows);
      ws["!cols"] = [17, 16, 22, 20, 40, 80].map(w => ({ wch: w }));
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, "Nhật ký");
      const now = new Date();
      X.writeFile(wb, "NhatKy_" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + ".xlsx");
      toast("Đã xuất " + (rows.length - 1) + " dòng nhật ký ra Excel.");
    });
  }

  /* ============================== KHỞI ĐỘNG ============================== */
  function renderCurrent() {
    if (boot && token) renderShell(); else renderLogin();
  }
  if (token) {
    root.innerHTML = '<div class="wrap"><div class="card empty">⏳ Đang kết nối máy chủ và tải dữ liệu...</div></div>';
    run(loadBoot).then(() => { if (!boot) renderLogin(token ? "Không tải được dữ liệu. Vui lòng đăng nhập lại." : ""); });
  } else renderLogin();

  // Nếu khung đang dùng bị ẩn/bị dựng lại (đổi cỡ màn hình, Elementor render lại) → chuyển sang khung đang hiển thị
  setInterval(() => {
    if (isVisible(root)) return;
    const next = pickRoot();
    if (!next || next === root || !isVisible(next)) return;
    closeModal();
    root = next;
    claim(root);
    renderCurrent();
  }, 1000);
})();
