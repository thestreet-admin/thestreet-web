/*
 * THE STREET - TRANG QUẢN TRỊ VOUCHER
 * Quản lý chiến dịch, kênh nhận mã (hạn mức + link/QR riêng), kho mã, danh sách khách đã nhận.
 * Server: dự án Apps Script voucher RIÊNG (thestreet-appscript/voucher). KHÔNG hiển thị/link tới Google Sheet.
 */
(function loadCss() {
  var me = document.currentScript;
  if (!me || document.getElementById("ts-vadmin-css")) return;
  var link = document.createElement("link");
  link.id = "ts-vadmin-css"; link.rel = "stylesheet";
  var u = new URL("voucher-admin.css", me.src);
  u.search = new URL(me.src).search;
  link.href = u.href;
  document.head.appendChild(link);
})();
(function () {
  "use strict";
  // URL /exec của dự án Apps Script VOUCHER. Điền sau khi triển khai.
  const API_URL_DEFAULT = "";
  const XLSX_CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const QR_CDN = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
  const TOKEN_KEY = "ts_vadmin_token";

  if (window.__tsVAdminStarted) return;
  window.__tsVAdminStarted = true;
  // Elementor dựng widget 2 lần (máy tính + điện thoại, trùng id) → chọn khung đang HIỂN THỊ
  function allRoots() { return Array.from(document.querySelectorAll("#ts-voucher-admin")); }
  function isVisible(el) { return !!(el && el.isConnected && (el.offsetParent !== null || el.getClientRects().length)); }
  function pickRoot() { const all = allRoots(); return all.find(isVisible) || all[0] || null; }
  let root = pickRoot();
  if (!root) { window.__tsVAdminStarted = false; return; }
  const API_URL = root.getAttribute("data-api") || API_URL_DEFAULT;
  function claimRoot(el) {
    allRoots().forEach(o => { if (o !== el) { o.removeAttribute("data-init"); o.innerHTML = ""; } });
    el.setAttribute("data-init", "1");
  }
  claimRoot(root);

  /* ============================== TRẠNG THÁI ============================== */
  let token = ssGet(TOKEN_KEY);
  let campaigns = null, pageUrl = "";
  let tab = ssGet("ts_vadmin_tab") || "campaigns";
  let claims = null, claimsFor = null;
  let cFilter = { campaign: "", channel: "", q: "" };
  let logs = null;
  let busyCount = 0;

  /* ============================== TIỆN ÍCH ============================== */
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function $(s, el) { return (el || root).querySelector(s); }
  function $$(s, el) { return Array.from((el || root).querySelectorAll(s)); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDate(ms) { if (!ms) return ""; const d = new Date(ms); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function toInput(ms) { if (!ms) return ""; const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fromInput(v) { if (!v) return null; const t = new Date(v).getTime(); return isNaN(t) ? null : t; }
  function num(n) { return Number(n || 0).toLocaleString("vi-VN"); }
  const STATUS = { open: ["Đang mở", "b-ok"], upcoming: ["Sắp mở", "b-wait"], closed: ["Đã kết thúc", "b-mut"], paused: ["Tạm dừng", "b-bad"] };
  function findC(code) { return (campaigns || []).find(c => c.code === code); }
  function linkFor(c, k) { return (pageUrl || "https://<trang-nhan-voucher>") + "?c=" + encodeURIComponent(c.code) + "&k=" + encodeURIComponent(k.code); }

  function setBusy(on) {
    busyCount += on ? 1 : -1;
    let b = $(".busy");
    if (busyCount > 0 && !b) { b = document.createElement("div"); b.className = "busy"; root.appendChild(b); }
    if (busyCount <= 0 && b) b.remove();
  }
  async function api(action, params) {
    if (!API_URL) throw new Error("Trang chưa được cấu hình máy chủ voucher.");
    setBusy(true);
    let data;
    try {
      const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action, token }, params || {})) });
      data = await res.json();
    } catch (e) {
      throw new Error("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally { setBusy(false); }
    if (!data || data.result !== "success") {
      if (data && data.code === "AUTH") logout(true);
      const err = new Error((data && data.error) || "Máy chủ trả về lỗi không xác định.");
      err.code = data && data.code; throw err;
    }
    if (data.campaigns) campaigns = data.campaigns;
    return data;
  }
  async function run(fn) { try { return await fn(); } catch (e) { toast(e.message, true); return undefined; } }
  function toast(msg, bad) {
    const t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : ""); t.textContent = msg;
    root.appendChild(t); setTimeout(() => t.remove(), bad ? 6000 : 3000);
  }
  function loadScript(src, globalName) {
    return new Promise((resolve, reject) => {
      if (window[globalName]) return resolve();
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Không tải được thư viện. Kiểm tra mạng hoặc tắt trình chặn quảng cáo."));
      document.head.appendChild(s);
    });
  }
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Đã sao chép"); }
    catch (e) { window.prompt("Sao chép đường link:", text); }
  }

  /* ============================== MODAL ============================== */
  let modalEl = null;
  function openModal(title, body, footer) {
    closeModal();
    modalEl = document.createElement("div");
    modalEl.className = "modal-bg";
    modalEl.innerHTML = '<div class="modal"><div class="modal-h"><h3>' + esc(title) + '</h3><button class="btn sm" data-close>✕</button></div>' +
      '<div class="modal-b">' + body + '</div>' + (footer ? '<div class="modal-f">' + footer + '</div>' : "") + '</div>';
    root.appendChild(modalEl);
    modalEl.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
    return modalEl;
  }
  function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }
  function modalErr(msg) { const e = modalEl && modalEl.querySelector(".m-err"); if (e) { e.textContent = msg; e.style.display = msg ? "block" : "none"; } }

  /* ============================== ĐĂNG NHẬP ============================== */
  function renderLogin(msg) {
    root.innerHTML = '<div class="login"><div class="brand">THE STREET<small>QUẢN TRỊ VOUCHER</small></div>' +
      '<form><input type="password" name="pw" placeholder="Mật khẩu quản trị" autocomplete="current-password">' +
      (msg ? '<div class="m-err" style="display:block">' + esc(msg) + '</div>' : "") +
      '<button class="btn pri" type="submit">Đăng nhập</button></form></div>';
    const f = $("form");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const d = await api("admin.login", { password: f.pw.value });
        token = d.token; ssSet(TOKEN_KEY, token); start();
      } catch (err) { renderLogin(err.message); }
    });
    f.pw.focus();
  }
  function logout(expired) {
    if (!expired && token) api("admin.logout").catch(() => {});
    token = null; ssSet(TOKEN_KEY, null); campaigns = null; claims = null; logs = null;
    closeModal(); renderLogin(expired ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : "");
  }

  /* ============================== KHUNG CHÍNH ============================== */
  const TABS = [["campaigns", "Chiến dịch & kênh"], ["claims", "Khách đã nhận"], ["log", "Nhật ký"], ["settings", "Cài đặt"]];
  function render() {
    root.innerHTML = '<div class="wrap"><div class="top"><div class="brand">THE STREET<small>QUẢN TRỊ VOUCHER</small></div>' +
      '<div class="right"><button class="btn" data-act="refresh">↻ Tải lại</button><button class="btn" data-act="logout">Đăng xuất</button></div></div>' +
      '<div class="tabs">' + TABS.map(t => '<button class="tab' + (t[0] === tab ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>' +
      '<div id="tsv-main"></div></div>';
    $$("[data-tab]").forEach(b => b.addEventListener("click", () => { tab = b.getAttribute("data-tab"); ssSet("ts_vadmin_tab", tab); render(); }));
    $('[data-act="logout"]').addEventListener("click", () => logout(false));
    $('[data-act="refresh"]').addEventListener("click", () => run(async () => { claims = null; claimsFor = undefined; logs = null; await boot(); }));
    renderTab();
  }
  function renderTab() {
    const m = $("#tsv-main");
    if (tab === "campaigns") renderCampaigns(m);
    else if (tab === "claims") renderClaims(m);
    else if (tab === "log") renderLog(m);
    else renderSettings(m);
  }

  /* ============================== CHIẾN DỊCH ============================== */
  function renderCampaigns(m) {
    const list = campaigns || [];
    let h = '<div class="card"><div class="card-h"><h3>Chiến dịch</h3><button class="btn pri" data-act="new-c">+ Thêm chiến dịch</button></div>' +
      (!pageUrl ? '<div class="warn">Chưa nhập đường dẫn trang nhận voucher → link các kênh chưa dùng được. Vào tab <b>Cài đặt</b>.</div>' : "") +
      (list.length ? "" : '<p class="muted">Chưa có chiến dịch nào. Bấm "Thêm chiến dịch" để bắt đầu.</p>') + '</div>';
    list.forEach(c => {
      const s = STATUS[c.status] || ["", ""];
      const remainQuota = c.channels.reduce((t, k) => t + Math.max(0, k.quota - k.issued), 0);
      const lack = remainQuota - c.pool.unused;
      h += '<div class="card camp" data-c="' + esc(c.code) + '">' +
        '<div class="card-h"><div><h3>' + esc(c.name) + ' <span class="badge ' + s[1] + '">' + s[0] + '</span></h3>' +
        '<div class="muted">Mã: <b>' + esc(c.code) + '</b> · ' + (c.opensAt ? fmtDate(c.opensAt) : "Mở ngay") + ' → ' + (c.closesAt ? fmtDate(c.closesAt) : "không giới hạn") + '</div></div>' +
        '<div class="btns"><button class="btn sm" data-act="edit-c">Sửa</button><button class="btn sm" data-act="import">Nhập mã</button>' +
        '<button class="btn sm" data-act="claims-c">Khách đã nhận</button><button class="btn sm danger" data-act="del-c">Xóa</button></div></div>' +
        '<div class="stats">' +
          stat("Đã cấp", num(c.claimed) + " / " + num(c.quotaTotal), "tổng hạn mức các kênh") +
          stat("Kho mã còn", num(c.pool.unused) + " / " + num(c.pool.total), "chưa cấp / đã nhập") +
        '</div>' +
        (lack > 0 ? '<div class="warn">Kho còn thiếu <b>' + num(lack) + '</b> mã so với hạn mức còn lại của các kênh. Hãy nhập thêm mã.</div>' : "") +
        (c.offer ? '<div class="offer">' + esc(c.offer) + '</div>' : "") +
        '<div class="tbl-wrap"><table><thead><tr><th>Kênh</th><th>Mã kênh</th><th>Đã cấp / Hạn mức</th><th>Trạng thái</th><th>Link & QR</th><th></th></tr></thead><tbody>' +
        (c.channels.length ? c.channels.map(k => {
          const pct = k.quota ? Math.min(100, Math.round(k.issued * 100 / k.quota)) : 100;
          return '<tr data-k="' + esc(k.code) + '"><td><b>' + esc(k.name) + '</b></td><td><code>' + esc(k.code) + '</code></td>' +
            '<td><div class="prog"><div style="width:' + pct + '%" class="' + (k.issued >= k.quota ? "full" : "") + '"></div></div>' + num(k.issued) + ' / ' + num(k.quota) + '</td>' +
            '<td><span class="badge ' + (k.active ? (k.issued >= k.quota ? "b-bad" : "b-ok") : "b-mut") + '">' + (k.active ? (k.issued >= k.quota ? "Hết mã" : "Đang dùng") : "Tạm dừng") + '</span></td>' +
            '<td><button class="btn sm" data-act="copy-link">Sao chép link</button> <button class="btn sm" data-act="qr">QR</button></td>' +
            '<td class="num"><button class="btn sm" data-act="edit-k">Sửa</button> ' + (k.issued ? "" : '<button class="btn sm danger" data-act="del-k">Xóa</button>') + '</td></tr>';
        }).join("") : '<tr><td colspan="6" class="muted">Chưa có kênh. Thêm kênh để có link phát cho khách.</td></tr>') +
        '</tbody></table></div><button class="btn sm pri" data-act="new-k" style="margin-top:10px">+ Thêm kênh</button>' +
        (c.pool.unused ? ' <button class="btn sm" data-act="rm-unused" style="margin-top:10px">Xóa mã chưa cấp</button>' : "") + '</div>';
    });
    m.innerHTML = h;
    const newC = $('[data-act="new-c"]', m); if (newC) newC.addEventListener("click", () => campaignForm(null));
    $$(".camp", m).forEach(card => {
      const c = findC(card.getAttribute("data-c"));
      const on = (act, fn) => $$('[data-act="' + act + '"]', card).forEach(b => b.addEventListener("click", e => {
        const tr = e.target.closest("tr[data-k]");
        fn(tr ? c.channels.find(k => k.code === tr.getAttribute("data-k")) : null);
      }));
      on("edit-c", () => campaignForm(c));
      on("import", () => importForm(c));
      on("claims-c", () => { cFilter.campaign = c.code; cFilter.channel = ""; tab = "claims"; ssSet("ts_vadmin_tab", tab); render(); });
      on("del-c", () => confirmDo("Xóa chiến dịch " + c.name + "?", "Xóa luôn các kênh và " + num(c.pool.total) + " mã trong kho. Chỉ xóa được khi chưa có khách nhận mã.",
        () => api("admin.campaigns.delete", { code: c.code })));
      on("new-k", () => channelForm(c, null));
      on("edit-k", k => channelForm(c, k));
      on("del-k", k => confirmDo("Xóa kênh " + k.name + "?", "Link của kênh này sẽ không dùng được nữa.", () => api("admin.channels.delete", { campaign: c.code, code: k.code })));
      on("copy-link", k => { if (!pageUrl) return toast("Chưa nhập đường dẫn trang nhận voucher (tab Cài đặt).", true); copy(linkFor(c, k)); });
      on("qr", k => { if (!pageUrl) return toast("Chưa nhập đường dẫn trang nhận voucher (tab Cài đặt).", true); showQr(c, k); });
      on("rm-unused", () => confirmDo("Xóa " + num(c.pool.unused) + " mã chưa cấp của " + c.name + "?", "Mã đã cấp cho khách được giữ nguyên.",
        () => api("admin.codes.removeUnused", { campaign: c.code })));
    });
  }
  function stat(label, value, sub) { return '<div class="stat"><div class="muted">' + label + '</div><div class="v">' + value + '</div><div class="muted">' + sub + '</div></div>'; }

  function confirmDo(title, text, fn) {
    const md = openModal(title, '<p>' + esc(text) + '</p><div class="m-err"></div>', '<button class="btn" data-close>Hủy</button><button class="btn danger" data-ok>Đồng ý</button>');
    md.querySelector("[data-ok]").addEventListener("click", async () => {
      try { await fn(); closeModal(); toast("Đã xong"); renderTab(); } catch (e) { modalErr(e.message); }
    });
  }

  function campaignForm(c) {
    const md = openModal(c ? "Sửa chiến dịch" : "Thêm chiến dịch",
      '<form class="frm">' +
      '<label>Mã chiến dịch (dùng trong link, không dấu, ví dụ TET2027)<input name="code" type="text" maxlength="20" value="' + esc(c ? c.code : "") + '"' + (c && (c.channels.length || c.pool.total) ? " readonly" : "") + '></label>' +
      '<label>Tên chiến dịch (khách nhìn thấy)<input name="name" type="text" maxlength="120" value="' + esc(c ? c.name : "") + '"></label>' +
      '<div class="row2"><label>Mở lúc (để trống = mở ngay)<input name="opensAt" type="datetime-local" value="' + toInput(c && c.opensAt) + '"></label>' +
      '<label>Đóng lúc (để trống = không giới hạn)<input name="closesAt" type="datetime-local" value="' + toInput(c && c.closesAt) + '"></label></div>' +
      '<label>Ưu đãi hiện cho khách<textarea name="offer" maxlength="1000" placeholder="Giảm 20% tổng hóa đơn">' + esc(c ? c.offer : "") + '</textarea></label>' +
      '<label>Hướng dẫn sử dụng mã (hiện sau khi nhận mã)<textarea name="howto" maxlength="2000" placeholder="Đưa mã cho thu ngân khi thanh toán. Áp dụng tại mọi chi nhánh.">' + esc(c ? c.howto : "") + '</textarea></label>' +
      '<label>Ghi chú nội bộ<textarea name="note" maxlength="1000">' + esc(c ? c.note : "") + '</textarea></label>' +
      '<label class="chk"><input name="active" type="checkbox"' + (!c || c.active ? " checked" : "") + '> Đang chạy (bỏ tick = tạm dừng, khách mới không nhận được mã)</label>' +
      '<div class="m-err"></div></form>',
      '<button class="btn" data-close>Hủy</button><button class="btn pri" data-ok>Lưu</button>');
    md.querySelector("[data-ok]").addEventListener("click", async () => {
      const f = md.querySelector("form");
      const v = { originalCode: c ? c.code : "", code: f.code.value.trim().toUpperCase(), name: f.name.value.trim(), opensAt: fromInput(f.opensAt.value), closesAt: fromInput(f.closesAt.value),
                  offer: f.offer.value.trim(), howto: f.howto.value.trim(), note: f.note.value.trim(), active: f.active.checked };
      if (!/^[A-Z0-9-]{2,20}$/.test(v.code)) return modalErr("Mã chiến dịch gồm 2–20 ký tự chữ không dấu, số hoặc dấu gạch ngang.");
      if (!v.name) return modalErr("Vui lòng nhập tên chiến dịch.");
      if (v.opensAt && v.closesAt && v.closesAt <= v.opensAt) return modalErr("Thời gian đóng phải sau thời gian mở.");
      try { await api("admin.campaigns.save", { campaign: v }); closeModal(); toast("Đã lưu chiến dịch"); renderTab(); } catch (e) { modalErr(e.message); }
    });
  }

  function channelForm(c, k) {
    const md = openModal((k ? "Sửa kênh" : "Thêm kênh") + " · " + c.name,
      '<form class="frm">' +
      '<label>Tên kênh (khách có thể thấy)<input name="name" type="text" maxlength="80" value="' + esc(k ? k.name : "") + '" placeholder="Livestream TikTok"></label>' +
      '<label>Mã kênh (dùng trong link, chữ thường không dấu, ví dụ tiktok)<input name="code" type="text" maxlength="20" value="' + esc(k ? k.code : "") + '"' + (k && k.issued ? " readonly" : "") + '></label>' +
      '<label>Số mã tối đa cho kênh này' + (k && k.issued ? " (đã cấp " + num(k.issued) + ")" : "") + '<input name="quota" type="number" min="0" step="1" value="' + (k ? k.quota : "") + '" placeholder="800"></label>' +
      '<label class="chk"><input name="active" type="checkbox"' + (!k || k.active ? " checked" : "") + '> Đang dùng</label>' +
      '<p class="muted">Kho còn ' + num(c.pool.unused) + ' mã chưa cấp (dùng chung cho mọi kênh của chiến dịch).</p>' +
      '<div class="m-err"></div></form>',
      '<button class="btn" data-close>Hủy</button><button class="btn pri" data-ok>Lưu</button>');
    const f = md.querySelector("form");
    if (!k) f.name.addEventListener("input", () => {   // gợi ý mã kênh từ tên
      if (f.code.dataset.touched) return;
      f.code.value = f.name.value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);
    });
    f.code.addEventListener("input", () => { f.code.dataset.touched = "1"; });
    md.querySelector("[data-ok]").addEventListener("click", async () => {
      const v = { originalCode: k ? k.code : "", code: f.code.value.trim().toLowerCase(), name: f.name.value.trim(), quota: f.quota.value === "" ? null : Number(f.quota.value), active: f.active.checked };
      if (!v.name) return modalErr("Vui lòng nhập tên kênh.");
      if (!/^[a-z0-9-]{1,20}$/.test(v.code)) return modalErr("Mã kênh gồm chữ thường không dấu, số hoặc dấu gạch ngang (tối đa 20 ký tự).");
      if (v.quota === null || !Number.isInteger(v.quota) || v.quota < 0) return modalErr("Số mã tối đa phải là số nguyên từ 0 trở lên.");
      try { await api("admin.channels.save", { campaign: c.code, channel: v }); closeModal(); toast("Đã lưu kênh"); renderTab(); } catch (e) { modalErr(e.message); }
    });
  }

  /* ---------- Nhập kho mã ---------- */
  function parseCodes(text) {
    return text.split(/[\r\n,;\t]+/).map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  function importForm(c) {
    let codes = [];
    const md = openModal("Nhập mã · " + c.name,
      '<p class="muted">Dán danh sách mã (mỗi dòng 1 mã) hoặc chọn file Excel/CSV — lấy cột đầu tiên, tự bỏ dòng tiêu đề. ' +
      'Mã gồm chữ không dấu, số, - hoặc _, dài 3–40 ký tự. Có mã trùng hoặc sai thì không nhập mã nào.</p>' +
      '<input type="file" accept=".xlsx,.xls,.csv,.txt" data-file><textarea data-text rows="8" placeholder="TS-0001&#10;TS-0002"></textarea>' +
      '<div class="muted" data-count>0 mã</div><div class="m-err"></div>',
      '<button class="btn" data-close>Hủy</button><button class="btn pri" data-ok>Nhập</button>');
    const ta = md.querySelector("[data-text]"), cnt = md.querySelector("[data-count]");
    const update = () => {
      codes = parseCodes(ta.value);
      if (codes.length && /^(mã|ma|code|voucher|mã voucher|ma voucher|voucher code|mã giảm giá|coupon)$/i.test(codes[0])) codes = codes.slice(1);   // dòng tiêu đề
      const bad = codes.filter(s => !/^[A-Za-z0-9_-]{3,40}$/.test(s));
      const seen = new Set(), dup = codes.filter(s => { const u = s.toUpperCase(); if (seen.has(u)) return true; seen.add(u); return false; });
      cnt.textContent = num(codes.length) + " mã" + (bad.length ? " · " + bad.length + " mã sai định dạng: " + bad.slice(0, 5).join(", ") : "") + (dup.length ? " · " + dup.length + " mã bị lặp: " + dup.slice(0, 5).join(", ") : "");
      cnt.className = bad.length || dup.length ? "m-err-inline" : "muted";
      return !bad.length && !dup.length;
    };
    ta.addEventListener("input", update);
    md.querySelector("[data-file]").addEventListener("change", e => run(async () => {
      const file = e.target.files[0]; if (!file) return;
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        await loadScript(XLSX_CDN, "XLSX");
        const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
        const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
        ta.value = rows.map(r => String((r && r[0]) == null ? "" : r[0]).trim()).filter(Boolean).join("\n");
      } else ta.value = (await file.text()).replace(/^﻿/, "").split(/\r?\n/).map(l => l.split(/[,;\t]/)[0]).join("\n");
      update();
    }));
    md.querySelector("[data-ok]").addEventListener("click", async () => {
      if (!update()) return modalErr("Sửa các mã sai hoặc bị lặp trước khi nhập.");
      if (!codes.length) return modalErr("Chưa có mã nào.");
      if (codes.length > 5000) return modalErr("Mỗi lần nhập tối đa 5.000 mã.");
      try { await api("admin.codes.import", { campaign: c.code, codes }); closeModal(); toast("Đã nhập " + num(codes.length) + " mã"); renderTab(); } catch (e) { modalErr(e.message); }
    });
  }

  /* ---------- QR ---------- */
  async function showQr(c, k) {
    const link = linkFor(c, k);
    await run(async () => {
      await loadScript(QR_CDN, "qrcode");
      const qr = window.qrcode(0, "M"); qr.addData(link); qr.make();
      const n = qr.getModuleCount(), cell = 12, margin = 4 * cell, size = n * cell + margin * 2;
      const cv = document.createElement("canvas"); cv.width = cv.height = size;
      const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, size, size); g.fillStyle = "#000";
      for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect(margin + col * cell, margin + r * cell, cell, cell);
      const url = cv.toDataURL("image/png");
      const md = openModal("QR · " + c.name + " · " + k.name,
        '<div class="qr"><img src="' + url + '" alt="QR"><div class="muted">' + esc(link) + '</div></div>',
        '<button class="btn" data-copy>Sao chép link</button><button class="btn pri" data-dl>Tải ảnh QR</button>');
      md.querySelector("[data-copy]").addEventListener("click", () => copy(link));
      md.querySelector("[data-dl]").addEventListener("click", () => cv.toBlob(b => download(b, "QR-" + c.code + "-" + k.code + ".png")));
    });
  }

  /* ============================== KHÁCH ĐÃ NHẬN ============================== */
  async function loadClaims() {
    claims = null; claimsFor = cFilter.campaign; renderTab();
    const d = await run(() => api("admin.claims.list", { campaign: cFilter.campaign }));
    if (d && claimsFor === cFilter.campaign) { claims = d.claims; if (tab === "claims") renderTab(); }
  }
  function filteredClaims() {
    const q = cFilter.q.trim().toLowerCase();
    return (claims || []).filter(x => (!cFilter.channel || x.channel === cFilter.channel) &&
      (!q || (x.name + " " + x.phone + " " + x.code).toLowerCase().includes(q)));
  }
  function renderClaims(m) {
    if (claimsFor !== cFilter.campaign) { loadClaims(); return; }
    const c = findC(cFilter.campaign), rows = filteredClaims();
    m.innerHTML = '<div class="card"><div class="card-h"><h3>Khách đã nhận mã</h3><button class="btn" data-act="export"' + (rows.length ? "" : " disabled") + '>⬇ Xuất Excel</button></div>' +
      '<div class="bar"><select data-f="campaign"><option value="">Tất cả chiến dịch</option>' +
      (campaigns || []).map(x => '<option value="' + esc(x.code) + '"' + (x.code === cFilter.campaign ? " selected" : "") + '>' + esc(x.name) + '</option>').join("") + '</select>' +
      (c ? '<select data-f="channel"><option value="">Tất cả kênh</option>' + c.channels.map(k => '<option value="' + esc(k.code) + '"' + (k.code === cFilter.channel ? " selected" : "") + '>' + esc(k.name) + '</option>').join("") + '</select>' : "") +
      '<input type="text" data-f="q" placeholder="Tìm tên, SĐT, mã..." value="' + esc(cFilter.q) + '"></div>' +
      (claims === null ? '<p class="muted">⏳ Đang tải...</p>' :
        '<div class="muted">' + num(rows.length) + ' khách</div><div class="tbl-wrap"><table><thead><tr><th>Thời gian</th>' + (c ? "" : "<th>Chiến dịch</th>") +
        '<th>Kênh</th><th>Họ và tên</th><th>Số điện thoại</th><th>Mã voucher</th></tr></thead><tbody>' +
        rows.slice(0, 500).map(x => '<tr><td>' + fmtDate(x.time) + '</td>' + (c ? "" : '<td>' + esc(x.campaign) + '</td>') + '<td>' + esc(x.channelName || x.channel) + '</td><td>' + esc(x.name) +
          '</td><td>' + esc(x.phone) + '</td><td><code>' + esc(x.code) + '</code></td></tr>').join("") +
        (rows.length > 500 ? '<tr><td colspan="6" class="muted">Hiển thị 500 dòng mới nhất. Xuất Excel để xem đủ.</td></tr>' : "") +
        (rows.length ? "" : '<tr><td colspan="6" class="muted">Chưa có khách nào.</td></tr>') + '</tbody></table></div>') + '</div>';
    const sc = $('[data-f="campaign"]', m); sc.addEventListener("change", () => { cFilter.campaign = sc.value; cFilter.channel = ""; loadClaims(); });
    const sk = $('[data-f="channel"]', m); if (sk) sk.addEventListener("change", () => { cFilter.channel = sk.value; renderTab(); });
    const sq = $('[data-f="q"]', m);
    sq.addEventListener("input", () => { cFilter.q = sq.value; const pos = sq.selectionStart; renderTab(); const n = $('[data-f="q"]'); n.focus(); n.setSelectionRange(pos, pos); });
    const ex = $('[data-act="export"]', m);
    if (ex) ex.addEventListener("click", () => run(async () => {
      await loadScript(XLSX_CDN, "XLSX");
      const X = window.XLSX;
      const data = [["Thời gian", "Chiến dịch", "Kênh", "Họ và tên", "Số điện thoại", "Mã voucher"]]
        .concat(filteredClaims().map(x => [fmtDate(x.time), x.campaign, x.channelName || x.channel, x.name, x.phone, x.code]));
      const ws = X.utils.aoa_to_sheet(data);
      ws["!cols"] = [{ wch: 17 }, { wch: 12 }, { wch: 22 }, { wch: 26 }, { wch: 14 }, { wch: 16 }];
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Khach da nhan");
      X.writeFile(wb, "Voucher-" + (cFilter.campaign || "tat-ca") + ".xlsx");
    }));
  }

  /* ============================== NHẬT KÝ ============================== */
  function renderLog(m) {
    if (logs === null) {
      m.innerHTML = '<div class="card"><p class="muted">⏳ Đang tải...</p></div>';
      run(async () => { const d = await api("admin.log.list"); logs = d.logs; if (tab === "log") renderTab(); });
      return;
    }
    m.innerHTML = '<div class="card"><div class="card-h"><h3>Nhật ký thao tác</h3></div><div class="tbl-wrap"><table><thead><tr><th>Thời gian</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>' +
      (logs.length ? logs.map(l => '<tr><td>' + fmtDate(l.time) + '</td><td>' + esc(l.action) + '</td><td>' + esc(l.target) + '</td><td>' + esc(l.detail) + '</td></tr>').join("")
        : '<tr><td colspan="4" class="muted">Chưa có nhật ký.</td></tr>') + '</tbody></table></div></div>';
  }

  /* ============================== CÀI ĐẶT ============================== */
  function renderSettings(m) {
    m.innerHTML = '<div class="card"><div class="card-h"><h3>Đường dẫn trang nhận voucher</h3></div>' +
      '<p class="muted">Địa chỉ trang WordPress có gắn mã trang nhận voucher, ví dụ https://thestreet.vn/nhan-voucher. Dùng để tạo link và QR cho từng kênh.</p>' +
      '<div class="bar"><input type="text" data-url style="flex:1;min-width:260px" value="' + esc(pageUrl) + '" placeholder="https://..."><button class="btn pri" data-save>Lưu</button></div></div>';
    $("[data-save]", m).addEventListener("click", () => run(async () => {
      const v = $("[data-url]", m).value.trim().replace(/[?#].*$/, "");
      const d = await api("admin.settings.save", { pageUrl: v });
      pageUrl = d.pageUrl; toast("Đã lưu"); renderTab();
    }));
  }

  /* ============================== KHỞI ĐỘNG ============================== */
  async function boot() {
    const d = await api("admin.bootstrap");
    campaigns = d.campaigns; pageUrl = d.pageUrl || "";
    render();
  }
  async function start() {
    root.innerHTML = '<div class="loading">⏳ Đang tải...</div>';
    try { await boot(); } catch (e) { if (token) renderLogin(e.message); }
  }
  if (token) start(); else renderLogin("");

  // Elementor: đổi giữa bản máy tính/điện thoại khi xoay màn hình → chuyển sang khung đang hiện
  setInterval(() => {
    if (isVisible(root)) return;
    const next = pickRoot();
    if (!next || next === root || !isVisible(next)) return;
    root = next; claimRoot(root);
    if (token && campaigns) render(); else if (token) start(); else renderLogin("");
  }, 1000);
})();
