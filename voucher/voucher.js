/*
 * THE STREET - TRANG NHẬN VOUCHER (dành cho khách)
 * Nhúng vào WordPress bằng đoạn mã trong WORDPRESS.md. Đường link mỗi kênh: <trang>?c=<mã chiến dịch>&k=<mã kênh>
 * Server: dự án Apps Script voucher RIÊNG (repo thestreet-appscript, thư mục voucher/) — không dùng chung với trang thi.
 * QUY TẮC: không đưa mã voucher, mật khẩu hay ID Google Sheet vào file này.
 */
(function loadCss() {
  var me = document.currentScript;
  if (!me || document.getElementById("ts-voucher-css")) return;
  var link = document.createElement("link");
  link.id = "ts-voucher-css"; link.rel = "stylesheet";
  var u = new URL("voucher.css", me.src);
  u.search = new URL(me.src).search;
  link.href = u.href;
  document.head.appendChild(link);
})();
(function () {
  "use strict";

  /* ======================= CẤU HÌNH ======================= */
  // URL /exec của dự án Apps Script VOUCHER (không phải của hệ thống thi). Điền sau khi triển khai.
  const API_URL_DEFAULT = "https://script.google.com/macros/s/AKfycbw_qa14laiV2qAq_qlrDt97igV2E-XZQlpvKSS5uGAjwjfS-IBfMsMs5uGEAiDeOy4aeA/exec";

  const scriptEl = document.currentScript;
  const root = (scriptEl && scriptEl.parentNode && scriptEl.parentNode.querySelector("#ts-voucher-app")) || document.getElementById("ts-voucher-app");
  if (!root || root.getAttribute("data-ts-init")) return;
  root.setAttribute("data-ts-init", "1");
  const API_URL = root.getAttribute("data-api") || API_URL_DEFAULT;

  const params = new URLSearchParams(window.location.search);
  let st = {
    screen: "loading",          // loading | pick | form | done | error
    cd: (params.get("c") || "").trim().toUpperCase(),
    k: (params.get("k") || "").trim().toLowerCase(),
    campaign: null, channels: [], campaigns: [],
    name: "", phone: "", channel: "", agree: false,
    sending: false, err: "", errCode: "", result: null, loadErr: ""
  };

  /* ======================= TIỆN ÍCH ======================= */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function nl(s) { return esc(s).replace(/\n/g, "<br>"); }
  function $(s) { return root.querySelector(s); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDate(ms) { if (!ms) return ""; const d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + " " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function phoneOk(v) {
    let p = String(v || "").replace(/[\s.\-()]/g, "");
    if (/^\+84/.test(p)) p = "0" + p.slice(3); else if (/^84\d{9}$/.test(p)) p = "0" + p.slice(2);
    return /^0[35789]\d{8}$/.test(p);
  }

  async function getApi(cd) {
    const res = await fetch(API_URL + (cd ? "?cd=" + encodeURIComponent(cd) : ""), { method: "GET" });
    return res.json();
  }
  async function postApi(body) {
    const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    return res.json();
  }

  /* ======================= GIAO DIỆN ======================= */
  function shell(inner) {
    return '<div class="tsv-card"><div class="tsv-head"><div class="tsv-brand">THE STREET</div><div class="tsv-sub">ƯU ĐÃI DÀNH CHO BẠN</div></div>' +
      '<div class="tsv-body">' + inner + '</div></div>';
  }
  function campaignBlock(c) {
    return '<h2 class="tsv-title">' + esc(c.name) + '</h2>' +
      (c.offer ? '<div class="tsv-offer">' + nl(c.offer) + '</div>' : "");
  }
  function notice(icon, title, text) {
    return '<div class="tsv-notice"><div class="tsv-ico">' + icon + '</div><h3>' + esc(title) + '</h3>' + (text ? '<p>' + text + '</p>' : "") + '</div>';
  }

  function render() {
    let h = "";
    const c = st.campaign;
    if (st.screen === "loading") h = '<div class="tsv-loading">⏳ Đang tải chương trình...</div>';
    else if (st.screen === "error") h = notice("⚠️", "Không tải được chương trình", esc(st.loadErr) + '<br><button class="tsv-btn tsv-ghost" data-act="reload">Thử lại</button>');
    else if (st.screen === "pick") {
      h = st.campaigns.length
        ? '<h2 class="tsv-title">Chọn chương trình</h2><div class="tsv-list">' +
          st.campaigns.map(x => '<button class="tsv-btn tsv-ghost" data-pick="' + esc(x.code) + '">' + esc(x.name) + '</button>').join("") + '</div>'
        : notice("🎁", "Hiện chưa có chương trình ưu đãi", "Vui lòng quay lại sau nhé.");
    } else if (st.screen === "done") {
      const r = st.result;
      h = campaignBlock(r.campaign) +
        '<div class="tsv-done"><div class="tsv-hi">' + (r.already ? "Mã bạn đã nhận trước đó" : "Chúc mừng " + esc(r.name) + "!") + '</div>' +
        '<div class="tsv-label">Mã ưu đãi của bạn</div>' +
        '<div class="tsv-code" data-code>' + esc(r.voucher) + '</div>' +
        '<button class="tsv-btn" data-act="copy">📋 Sao chép mã</button>' +
        '<p class="tsv-hint">Hãy chụp màn hình để lưu mã. Nếu quên, nhập lại đúng số điện thoại và họ tên trên trang này để xem lại.</p></div>' +
        (r.campaign.howto ? '<div class="tsv-howto"><b>Cách sử dụng</b><br>' + nl(r.campaign.howto) + '</div>' : "") +
        (r.campaign.closesAt ? '<p class="tsv-small">Chương trình kết thúc lúc ' + fmtDate(r.campaign.closesAt) + '.</p>' : "");
    } else if (st.screen === "form") {
      const status = c.status;
      const allOut = st.channels.length > 0 && st.channels.every(x => x.soldOut);
      const fixed = st.channels.find(x => x.code === st.k);
      const blocked = status === "upcoming" ? notice("⏰", "Chương trình chưa bắt đầu", "Mở lúc " + fmtDate(c.opensAt) + ".")
        : status !== "open" ? notice("🙏", "Chương trình đã kết thúc", "Cảm ơn bạn đã quan tâm. Nếu đã nhận mã, nhập SĐT và họ tên bên dưới để xem lại.")
        : !st.channels.length ? notice("🙏", "Chương trình chưa mở nhận mã", "")
        : fixed && fixed.soldOut ? notice("😢", "Mã ưu đãi đã được nhận hết", "Mã dành cho " + esc(fixed.name) + " đã hết. Hẹn gặp bạn ở chương trình sau!")
        : allOut ? notice("😢", "Mã ưu đãi đã được nhận hết", "Hẹn gặp bạn ở chương trình sau!") : "";
      const showPick = !fixed && st.channels.length > 1 && status === "open";
      h = campaignBlock(c) + blocked +
        '<form class="tsv-form" novalidate>' +
        '<label>Họ và tên<input name="name" type="text" autocomplete="name" maxlength="80" value="' + esc(st.name) + '" placeholder="Nguyễn Văn A"></label>' +
        '<label>Số điện thoại<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="16" value="' + esc(st.phone) + '" placeholder="0901 234 567"></label>' +
        (showPick ? '<label>Bạn biết chương trình qua đâu?<select name="channel"><option value="">— Chọn —</option>' +
          st.channels.map(x => '<option value="' + esc(x.code) + '"' + (x.code === st.channel ? " selected" : "") + (x.soldOut ? " disabled" : "") + '>' +
            esc(x.name) + (x.soldOut ? " (đã hết mã)" : "") + '</option>').join("") + '</select></label>' : "") +
        '<div class="tsv-hp" aria-hidden="true"><label>Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>' +
        '<label class="tsv-check"><input name="agree" type="checkbox"' + (st.agree ? " checked" : "") + '> <span>Tôi đồng ý để THE STREET lưu họ tên và số điện thoại nhằm cấp, xác nhận mã ưu đãi và liên hệ về chương trình.</span></label>' +
        (st.err ? '<div class="tsv-err">' + esc(st.err) + '</div>' : "") +
        '<button class="tsv-btn tsv-main" type="submit"' + (st.sending ? " disabled" : "") + '>' +
          (st.sending ? "⏳ Đang xử lý..." : status === "open" ? "NHẬN MÃ ƯU ĐÃI" : "XEM LẠI MÃ ĐÃ NHẬN") + '</button>' +
        '</form>';
    }
    root.innerHTML = '<div class="tsv-wrap">' + shell(h) + '</div>';
    bind();
  }

  function bind() {
    const f = $(".tsv-form");
    if (f) {
      f.addEventListener("input", e => { const t = e.target; if (t.name === "name" || t.name === "phone") st[t.name] = t.value; });
      f.addEventListener("change", e => { const t = e.target; if (t.name === "channel") st.channel = t.value; if (t.name === "agree") st.agree = t.checked; });
      f.addEventListener("submit", e => { e.preventDefault(); submit(); });
    }
    root.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => { st.cd = b.getAttribute("data-pick"); load(); }));
    const rl = root.querySelector('[data-act="reload"]'); if (rl) rl.addEventListener("click", load);
    const cp = root.querySelector('[data-act="copy"]');
    if (cp) cp.addEventListener("click", () => {
      const code = st.result.voucher;
      const okFn = () => { cp.textContent = "✅ Đã sao chép"; setTimeout(() => { cp.textContent = "📋 Sao chép mã"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(okFn, () => selectCode());
      else selectCode();
    });
  }
  function selectCode() {
    const el = root.querySelector("[data-code]"); if (!el) return;
    const range = document.createRange(); range.selectNodeContents(el);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }

  async function submit() {
    if (st.sending) return;
    const hp = root.querySelector('input[name="website"]');
    st.err = "";
    if (st.name.trim().replace(/\s+/g, " ").length < 2) st.err = "Vui lòng nhập họ và tên.";
    else if (!phoneOk(st.phone)) st.err = "Số điện thoại không hợp lệ. Vui lòng nhập số di động 10 số, ví dụ 0901234567.";
    else if (!st.agree) st.err = "Vui lòng tick đồng ý để nhận mã.";
    if (st.err) return render();
    const fixed = st.channels.find(x => x.code === st.k);
    const channel = fixed ? fixed.code : (st.channels.length === 1 ? st.channels[0].code : st.channel);
    st.sending = true; render();
    let r = null;
    for (let i = 0; i < 4; i++) {          // nhiều người nhận cùng lúc → server báo BUSY, tự thử lại
      try { r = await postApi({ action: "claim", campaign: st.campaign.code, channel, name: st.name, phone: st.phone, agree: st.agree, website: hp ? hp.value : "" }); }
      catch (e) { r = { result: "error", code: "NET", error: "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại." }; }
      if (!(r && r.code === "BUSY")) break;
      await sleep(1500 + Math.random() * 1500);
    }
    st.sending = false;
    if (r && r.result === "success") { st.result = r; st.screen = "done"; }
    else {
      st.err = (r && r.error) || "Có lỗi xảy ra, vui lòng thử lại.";
      if (r && r.code === "SOLD_OUT") { const ch = st.channels.find(x => x.code === channel); if (ch) ch.soldOut = true; }
    }
    render();
  }

  async function load() {
    st.screen = "loading"; render();
    if (!API_URL) { st.screen = "error"; st.loadErr = "Trang chưa được cấu hình máy chủ."; return render(); }
    try {
      const d = await getApi(st.cd);
      if (!d.ok) {
        st.screen = "error";
        st.loadErr = d.code === "NOT_FOUND" ? "Không tìm thấy chương trình. Vui lòng kiểm tra lại đường link." : (d.error || "Lỗi máy chủ.");
      } else if (!st.cd) {
        st.campaigns = d.campaigns || [];
        if (st.campaigns.length === 1) { st.cd = st.campaigns[0].code; return load(); }
        st.screen = "pick";
      } else {
        st.campaign = d.campaign; st.channels = d.channels || []; st.screen = "form";
        if (st.k && !st.channels.some(x => x.code === st.k)) st.k = "";   // link kênh cũ/sai → cho khách chọn
      }
    } catch (e) {
      st.screen = "error"; st.loadErr = "Không kết nối được máy chủ. Vui lòng kiểm tra mạng.";
    }
    render();
  }
  load();
})();
