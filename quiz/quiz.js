/*
 * THE STREET - TRANG THI TĂNG CẤP (dành cho nhân viên)
 * Nhúng vào WordPress bằng đoạn mã trong WORDPRESS.md (chỉ 2 dòng, dán 1 lần).
 * QUY TẮC: không đưa đáp án hay thông tin bí mật vào file này — đáp án nằm trong Google Sheet, server tự chấm.
 */
(function loadCss() {
  var me = document.currentScript;
  if (!me || document.getElementById("ts-quiz-css")) return;
  var link = document.createElement("link");
  link.id = "ts-quiz-css"; link.rel = "stylesheet";
  var u = new URL("quiz.css", me.src);
  u.search = new URL(me.src).search;   // cùng mã phiên bản với file JS → luôn lấy CSS mới nhất
  link.href = u.href;
  document.head.appendChild(link);
})();
(function () {
    "use strict";

    /* ======================= CẤU HÌNH ======================= */
    const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyaItGOm4q_G22pymVGrkEptNuburhYpj4xc1cZu4i0InXqOypQ9iZrRiQxw4XBJP_cPw/exec";
    const DEFAULT_DURATION = 60;
    const STORAGE_KEY = "ts_quiz_state_v3";
    const LABELS = ["A", "B", "C", "D"];

    // Câu hỏi & đáp án nằm trong Google Sheet (tab CauHoi), server rút đề khi bấm "Bắt đầu thi"
    const positions = [
        { id: "phucvu", label: "Phục Vụ" },
        { id: "tiepthuc", label: "Tiếp Thực" },
        { id: "letan", label: "Lễ Tân" },
        { id: "phache", label: "Pha Chế" }
    ];

    const scriptEl = document.currentScript;
    let appContainer = (scriptEl && scriptEl.parentNode && scriptEl.parentNode.querySelector("#the-street-quiz-app"))
                       || document.getElementById("the-street-quiz-app");
    if (!appContainer || appContainer.getAttribute("data-ts-init")) return;
    appContainer.setAttribute("data-ts-init", "1");

    /* ======================= TRẠNG THÁI ======================= */
    function freshState() {
        return {
            screen: "home", name: "", empId: "", examPeriod: "", selectedPosition: null, positionLabel: "",
            currentQuestionIdx: 0, mcqAnswers: [], essayAnswers: [],
            activeMcqs: [], activeEssays: [], endTime: 0, hasReachedReview: false,
            sessionId: "", finalResult: null, submitError: "", submitErrorCode: ""
        };
    }

    let appState = freshState();
    let periods = null;          // null = đang tải, "error" = lỗi, mảng = [{name, duration}]
    let examConfig = { mcqCount: 10, essayCount: 4 };
    let timerHandle = null;
    let submitting = false;
    let starting = false;
    let timeoutHandled = false;

    /* ======================= TIỆN ÍCH ======================= */
    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function $(sel) { return appContainer.querySelector(sel); }
    function $all(sel) { return appContainer.querySelectorAll(sel); }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }
    function selectedPeriod() {
        return Array.isArray(periods) ? periods.find(p => p.name === appState.examPeriod) : null;
    }

    async function postApi(body) {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(body)
        });
        return res.json();
    }

    function saveState() {
        try {
            if (appState.screen === "home" || appState.screen === "result") localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        } catch (e) {}
    }
    function loadState() {
        try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
        catch (e) { return null; }
    }
    function clearState() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }

    /* ======================= ĐỒNG HỒ ======================= */
    function getTimeLeft() { return Math.max(0, Math.ceil((appState.endTime - Date.now()) / 1000)); }
    function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
    function startTimer() { stopTimer(); timerHandle = setInterval(tick, 1000); tick(); }

    function tick() {
        if (appState.screen !== "quiz" && appState.screen !== "review") { stopTimer(); return; }
        updateTimerDOM();
        if (getTimeLeft() <= 0 && !timeoutHandled) {
            timeoutHandled = true;
            stopTimer();
            alert("⏳ ĐÃ HẾT GIỜ LÀM BÀI! Hệ thống tự động khóa và nộp bài.");
            appState.screen = "submitting";
            render();
            setTimeout(submitResults, Math.floor(Math.random() * 5000));
        }
    }

    function updateTimerDOM() {
        const timerEl = $("#ts-timer-countdown");
        if (!timerEl) return;
        const t = getTimeLeft();
        const m = Math.floor(t / 60), s = t % 60;
        timerEl.innerText = (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
        if (t < 300) timerEl.style.color = "#ff4d4f";
    }

    document.addEventListener("visibilitychange", () => { if (!document.hidden && timerHandle) tick(); });
    window.addEventListener("beforeunload", e => {
        if (appState.screen === "quiz" || appState.screen === "review") { e.preventDefault(); e.returnValue = ""; }
    });

    /* ======================= ĐIỀU HƯỚNG ======================= */
    function render() {
        switch (appState.screen) {
            case "home": renderHome(); break;
            case "quiz": renderQuiz(); break;
            case "review": renderReview(); break;
            case "submitting": renderSubmitting(); break;
            case "submit_error": renderSubmitError(); break;
            case "result": renderResult(); break;
        }
        saveState();
    }

    /* ======================= TRANG CHỦ ======================= */
    function periodOptionsHTML() {
        if (periods === null) return '<option value="">⏳ Đang đồng bộ danh sách đợt thi...</option>';
        if (periods === "error") return '<option value="">⚠️ Không tải được danh sách kỳ thi – vui lòng tải lại trang</option>';
        if (!periods.length) return '<option value="">Hiện chưa có kỳ thi nào đang mở</option>';
        return '<option value="">-- Chọn Kỳ thi của bạn --</option>' +
            periods.map(p => `<option value="${esc(p.name)}"${p.name === appState.examPeriod ? " selected" : ""}>${esc(p.name)}</option>`).join("");
    }

    function durationText() {
        const p = selectedPeriod();
        return (p ? p.duration : DEFAULT_DURATION) + " phút";
    }

    function canStart() {
        return !!(appState.selectedPosition && appState.name.trim() && appState.empId.trim() && appState.examPeriod && !starting);
    }
    function updateStartBtn() {
        const b = $("#start-btn");
        if (b) {
            b.disabled = !canStart();
            b.innerText = starting ? "⏳ ĐANG TẠO ĐỀ THI..." : "BẮT ĐẦU THI →";
        }
        const d = $("#ts-duration-text");
        if (d) d.innerText = durationText();
    }

    function renderHome() {
        const posBtns = positions.map(p =>
            `<button type="button" class="ts-pos-btn${p.id === appState.selectedPosition ? " selected" : ""}" data-id="${p.id}">${esc(p.label)}</button>`
        ).join("");

        appContainer.innerHTML = `
            <div class="ts-container" style="text-align:center;" data-ts-home="1">
                <div style="font-weight:900; font-size:26px; color:#1a5c2a; letter-spacing:2px;">THE STREET</div>
                <div style="font-weight:700; font-size:11px; color:#e8282e; letter-spacing:3px; margin-top:2px; margin-bottom: 20px;">NHẬU CÓ CHẤT</div>

                <h2 style="color:#1a5c2a; font-weight:800; font-size:20px; margin:0 0 6px;">BÀI THI TĂNG CẤP</h2>
                <p id="ts-count-text" style="color:#666; font-size:13px; margin:0 0 24px;">Hoàn thành ${examConfig.mcqCount} câu trắc nghiệm + ${examConfig.essayCount} câu tự luận</p>
                <p style="color:#e8282e; font-size:13px; font-weight:bold; margin:-14px 0 24px;">⏱️ Thời gian giới hạn: <span id="ts-duration-text">${durationText()}</span></p>

                <label class="ts-label">Kỳ thi</label>
                <select id="exam-period" class="ts-input" style="background: #fff; height: 46px !important; padding: 10px 12px !important; line-height: normal !important;">
                    ${periodOptionsHTML()}
                </select>

                <label class="ts-label">Họ và tên nhân viên</label>
                <input type="text" id="candidate-name" class="ts-input" placeholder="Nhập họ và tên..." value="${esc(appState.name)}" maxlength="100">

                <label class="ts-label">Mã nhân viên</label>
                <input type="text" id="emp-id" class="ts-input" placeholder="Nhập mã nhân viên..." value="${esc(appState.empId)}" maxlength="50">

                <label class="ts-label">Chọn vị trí thi</label>
                <div class="ts-grid-2">${posBtns}</div>

                <button type="button" id="start-btn" class="ts-btn ts-btn-primary" ${canStart() ? "" : "disabled"}>BẮT ĐẦU THI →</button>
            </div>
        `;

        $("#exam-period").onchange = e => { appState.examPeriod = e.target.value; updateStartBtn(); };
        $("#candidate-name").oninput = e => { appState.name = e.target.value; updateStartBtn(); };
        $("#emp-id").oninput = e => { appState.empId = e.target.value; updateStartBtn(); };
        $all(".ts-pos-btn").forEach(btn => {
            btn.onclick = e => {
                appState.selectedPosition = e.currentTarget.getAttribute("data-id");
                $all(".ts-pos-btn").forEach(b => b.classList.toggle("selected", b.getAttribute("data-id") === appState.selectedPosition));
                updateStartBtn();
            };
        });
        $("#start-btn").onclick = startExam;
        updateStartBtn();
    }

    function refreshPeriodSelect() {
        if (appState.screen !== "home") return;
        const sel = $("#exam-period"), cnt = $("#ts-count-text");
        if (!sel || !cnt) { renderHome(); return; }
        sel.innerHTML = periodOptionsHTML();
        sel.value = appState.examPeriod;
        cnt.innerText = `Hoàn thành ${examConfig.mcqCount} câu trắc nghiệm + ${examConfig.essayCount} câu tự luận`;
        updateStartBtn();
    }

    async function startExam() {
        if (!canStart()) return;
        starting = true;
        updateStartBtn();
        let res = null, lastErr = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                res = await postApi({
                    action: "start", name: appState.name.trim(), empId: appState.empId.trim(),
                    period: appState.examPeriod, positionId: appState.selectedPosition
                });
                if (res && res.result === "success") break;
                lastErr = (res && res.error) || "Máy chủ trả về lỗi không xác định.";
                if (res && res.code !== "BUSY") break;
            } catch (e) {
                lastErr = "Không kết nối được tới máy chủ. Vui lòng kiểm tra lại mạng (Wi-Fi/4G).";
            }
            res = null;
            if (attempt < 3) await sleep(1500 * attempt + Math.random() * 1500);
        }
        starting = false;
        if (!res || res.result !== "success") {
            updateStartBtn();
            alert("⚠️ " + lastErr);
            return;
        }

        // Xáo thứ tự phương án trên máy, nhớ vị trí gốc để gửi về server chấm
        appState.activeMcqs = res.mcq.map(q => ({
            id: q.id, q: q.q, points: q.points,
            options: shuffle(q.options.map((t, j) => ({ text: t, origIdx: j })).filter(o => o.text))
        }));
        appState.activeEssays = res.essay.map(q => ({ id: q.id, q: q.q, points: q.points }));
        appState.mcqAnswers = Array(appState.activeMcqs.length).fill(null);
        appState.essayAnswers = Array(appState.activeEssays.length).fill("");
        appState.sessionId = res.sessionId;
        appState.name = res.name;
        appState.selectedPosition = res.positionId;
        appState.positionLabel = res.positionLabel;
        appState.examPeriod = res.period;
        // Giờ hết hạn do server quyết định, quy đổi sang đồng hồ của máy
        appState.endTime = Date.now() + (res.endsAt - res.serverNow);
        appState.currentQuestionIdx = 0;
        appState.hasReachedReview = false;
        appState.screen = "quiz";
        timeoutHandled = false;
        if (res.resumed) {
            alert("Bạn đã bắt đầu bài thi này trước đó. Hệ thống mở lại đúng đề thi (vị trí " + res.positionLabel + ") và thời gian còn lại của bạn.");
        }
        render();
        startTimer();
    }

    /* ======================= LÀM BÀI ======================= */
    function renderQuiz() {
        const nMcq = appState.activeMcqs.length;
        const totalQ = nMcq + appState.activeEssays.length;
        const current = appState.currentQuestionIdx;
        const isMcq = current < nMcq;
        const essayIdx = current - nMcq;
        const progressPct = (current / totalQ) * 100;
        const sectionLabel = isMcq ? "TRẮC NGHIỆM" : "TỰ LUẬN";
        const questionNum = isMcq ? current + 1 : essayIdx + 1;
        const questionTotal = isMcq ? nMcq : appState.activeEssays.length;
        const currentQ = isMcq ? appState.activeMcqs[current] : appState.activeEssays[essayIdx];
        const nextText = (current + 1 === totalQ) ? "Xem lại bài làm →" : "Câu tiếp theo →";

        let contentHTML = "";
        if (isMcq) {
            const chosen = appState.mcqAnswers[current];
            const optionsHTML = currentQ.options.map((opt, i) => {
                const style = chosen === i ? "background:#e8f5ec; border-color:#1a5c2a;" : "";
                const lblStyle = chosen === i ? "background:#1a5c2a; color:#fff;" : "";
                return `<button type="button" class="ts-option-btn" data-idx="${i}" style="${style}"><span class="ts-opt-label" style="${lblStyle}">${LABELS[i]}</span><span style="line-height:1.5;">${esc(opt.text)}</span></button>`;
            }).join("");
            contentHTML = `<div class="ts-grid-options">${optionsHTML}</div><div style="margin-top:15px;"><button type="button" id="next-btn" class="ts-btn ts-btn-primary" ${chosen === null ? "disabled" : ""}>${nextText}</button></div>`;
        } else {
            contentHTML = `<textarea id="essay-ans" class="ts-textarea" placeholder="Nhập câu trả lời của bạn tại đây...">${esc(appState.essayAnswers[essayIdx])}</textarea><p style="font-size:12px; color:#aaa; margin:6px 0 14px;">Câu tự luận sẽ được Nhân sự chấm điểm sau.</p><button type="button" id="next-btn" class="ts-btn ts-btn-primary">${nextText}</button>`;
        }

        const jumpToReviewHTML = appState.hasReachedReview
            ? `<button type="button" id="jump-review-btn" class="ts-btn ts-btn-secondary">📋 Xem lại bài thi</button>` : "";

        appContainer.innerHTML = `
            <div class="ts-header">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div><div style="color:rgba(255,255,255,0.7); font-size:11px; letter-spacing:1px;">${esc(appState.positionLabel.toUpperCase())} - ${sectionLabel}</div><div style="color:#fff; font-weight:700; font-size:13px;">${esc(appState.name)}</div></div>
                    <div style="text-align:right; display:flex; gap:15px; align-items:center;">
                        <div style="text-align:right;"><div style="color:rgba(255,255,255,0.7); font-size:10px;">CÂU HỎI</div><div style="color:#fff; font-weight:800; font-size:16px;">${questionNum}/${questionTotal}</div></div>
                        <div style="text-align:right; border-left:1px solid rgba(255,255,255,0.3); padding-left:15px;"><div style="color:rgba(255,255,255,0.7); font-size:10px;">THỜI GIAN</div><div id="ts-timer-countdown" style="color:#fff; font-weight:800; font-size:16px;">--:--</div></div>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.25); border-radius:99px; height:6px; overflow:hidden;"><div style="height:100%; width:${progressPct}%; background:#fff; border-radius:99px;"></div></div>
            </div>
            <div style="display:inline-block; background:${isMcq ? '#1a5c2a' : '#e67e22'}; color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:99px; margin-bottom:12px;">${sectionLabel} • ${currentQ.points} điểm</div>
            <div style="background:#fff; border-radius:14px; padding:20px 18px; margin-bottom:16px; box-shadow:0 2px 12px rgba(0,0,0,0.06);"><p style="font-weight:700; font-size:15px; margin:0; line-height:1.6; white-space:pre-wrap;"><span style="color:#1a5c2a;">Câu ${questionNum}.</span> ${esc(currentQ.q)}</p></div>
            ${contentHTML}
            ${jumpToReviewHTML}
        `;
        updateTimerDOM();

        if (isMcq) {
            $all(".ts-option-btn").forEach(btn => {
                btn.onclick = e => {
                    appState.mcqAnswers[current] = parseInt(e.currentTarget.getAttribute("data-idx"), 10);
                    render();
                };
            });
        } else {
            $("#essay-ans").oninput = e => { appState.essayAnswers[essayIdx] = e.target.value; saveState(); };
        }

        $("#next-btn").onclick = () => {
            if (isMcq && appState.mcqAnswers[current] === null) return;
            if (current + 1 >= totalQ) {
                appState.hasReachedReview = true;
                appState.screen = "review";
            } else {
                appState.currentQuestionIdx++;
            }
            render();
        };

        const jumpBtn = $("#jump-review-btn");
        if (jumpBtn) jumpBtn.onclick = () => { appState.screen = "review"; render(); };
    }

    /* ======================= XEM LẠI ======================= */
    function renderReview() {
        const mcqReviewHTML = appState.activeMcqs.map((q, i) => {
            const sel = appState.mcqAnswers[i];
            const answerText = sel !== null ? `${LABELS[sel]}. ${q.options[sel].text}` : "⚠️ Chưa chọn đáp án";
            return `
                <div class="review-item">
                    <button type="button" class="btn-edit-q" data-goto="${i}">Sửa</button>
                    <div class="review-q">Câu ${i + 1} (TN): ${esc(q.q)}</div>
                    <div class="review-a" style="${sel === null ? 'color:#e8282e;font-weight:bold;' : ''}">Bạn chọn: ${esc(answerText)}</div>
                </div>`;
        }).join("");

        const essayReviewHTML = appState.activeEssays.map((q, i) => {
            const text = (appState.essayAnswers[i] || "").trim();
            return `
                <div class="review-item">
                    <button type="button" class="btn-edit-q" data-goto="${appState.activeMcqs.length + i}">Sửa</button>
                    <div class="review-q">Câu ${i + 1} (TL): ${esc(q.q)}</div>
                    <div class="review-a" style="${text === "" ? 'color:#e8282e;font-weight:bold;' : ''}">Bài làm: ${esc(text !== "" ? text : "⚠️ Chưa làm câu hỏi này")}</div>
                </div>`;
        }).join("");

        appContainer.innerHTML = `
            <div class="ts-header" style="padding-bottom:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="color:rgba(255,255,255,0.7); font-size:11px; letter-spacing:1px;">BƯỚC CUỐI CÙNG</div>
                        <div style="color:#fff; font-weight:800; font-size:18px;">KIỂM TRA LẠI BÀI THI</div>
                    </div>
                    <div style="text-align:right; border-left:1px solid rgba(255,255,255,0.3); padding-left:15px;">
                        <div style="color:rgba(255,255,255,0.7); font-size:10px;">THỜI GIAN CÒN LẠI</div>
                        <div id="ts-timer-countdown" style="color:#fff; font-weight:800; font-size:16px;">--:--</div>
                    </div>
                </div>
            </div>

            <p style="font-size:13px; color:#555; text-align:left; margin: 15px 5px 10px;">Hãy đọc lại kỹ các câu trả lời dưới đây. Bạn có thể bấm nút <b>Sửa</b> để thay đổi đáp án của từng câu.</p>

            <div style="max-height: 45vh; overflow-y: auto; padding-right: 5px; margin-bottom: 20px;">
                <h4 style="color:#1a5c2a; text-align:left; margin:10px 0 8px;">I. Phần Trắc Nghiệm</h4>
                ${mcqReviewHTML}
                <h4 style="color:#e67e22; text-align:left; margin:20px 0 8px;">II. Phần Tự Luận</h4>
                ${essayReviewHTML}
            </div>

            <button type="button" id="final-submit-btn" class="ts-btn ts-btn-primary">✓ XÁC NHẬN NỘP BÀI</button>
        `;
        updateTimerDOM();

        $all(".btn-edit-q").forEach(btn => {
            btn.onclick = e => {
                appState.currentQuestionIdx = parseInt(e.currentTarget.getAttribute("data-goto"), 10);
                appState.screen = "quiz";
                render();
            };
        });

        $("#final-submit-btn").onclick = () => {
            const incomplete = appState.mcqAnswers.some(x => x === null) || appState.essayAnswers.some(x => !x || x.trim() === "");
            if (incomplete && !confirm("Bạn vẫn còn câu hỏi chưa hoàn thành. Bạn có chắc chắn muốn nộp bài luôn không?")) return;
            submitResults();
        };
    }

    /* ======================= NỘP BÀI ======================= */
    function buildPayload() {
        const mcqAnswers = {}, essayAnswers = {};
        appState.activeMcqs.forEach((q, i) => {
            const sel = appState.mcqAnswers[i];
            mcqAnswers[q.id] = (sel === null || sel === undefined) ? null : q.options[sel].origIdx;
        });
        appState.activeEssays.forEach((q, i) => { essayAnswers[q.id] = appState.essayAnswers[i] || ""; });
        return { action: "submit", sessionId: appState.sessionId, mcqAnswers, essayAnswers };
    }

    async function submitResults() {
        if (submitting) return;
        submitting = true;
        stopTimer();
        appState.screen = "submitting";
        appState.submitError = "";
        render();

        const payload = buildPayload();
        let lastErr = "", lastCode = "";

        for (let attempt = 1; attempt <= 4; attempt++) {
            try {
                const data = await postApi(payload);
                if (data && data.result === "success") {
                    appState.finalResult = {
                        candidateName: appState.name, positionLabel: appState.positionLabel, examPeriod: appState.examPeriod,
                        mcqScore: data.mcqScore, correctCount: data.correctCount, total: data.mcqTotal,
                        maxScore: data.mcqMax, essayMax: data.essayMax
                    };
                    appState.screen = "result";
                    submitting = false;
                    clearState();
                    render();
                    return;
                }
                lastErr = (data && data.error) || "Máy chủ trả về lỗi không xác định.";
                lastCode = (data && data.code) || "";
                if (lastCode === "DUPLICATE" || lastCode === "INVALID") break;
            } catch (err) {
                lastErr = "Không kết nối được tới máy chủ. Vui lòng kiểm tra lại mạng (Wi-Fi/4G).";
                lastCode = "NETWORK";
            }
            if (attempt < 4) await sleep(2000 * attempt + Math.random() * 3000);
        }

        submitting = false;
        appState.screen = "submit_error";
        appState.submitError = lastErr;
        appState.submitErrorCode = lastCode;
        render();
    }

    function renderSubmitting() {
        appContainer.innerHTML = `<div class="ts-container" style="text-align:center; padding:40px 20px;"><div style="font-size:40px; margin-bottom:20px;">⏳</div><h3 style="color:#1a5c2a; font-weight:800;">Đang nộp bài lên hệ thống...</h3><p style="color:#666; font-size:14px;">Vui lòng không đóng trình duyệt lúc này.</p></div>`;
    }

    function renderSubmitError() {
        const canRetry = appState.submitErrorCode !== "DUPLICATE" && appState.submitErrorCode !== "INVALID";
        appContainer.innerHTML = `
            <div class="ts-container" style="text-align:center; padding:40px 20px;">
                <div style="font-size:40px; margin-bottom:20px;">⚠️</div>
                <h3 style="color:#e8282e; font-weight:800;">CHƯA NỘP ĐƯỢC BÀI</h3>
                <p style="color:#666; font-size:14px;">${esc(appState.submitError)}</p>
                ${canRetry
                    ? `<p style="color:#1a5c2a; font-size:13px; font-weight:bold; margin-bottom:20px;">Bài làm của bạn vẫn được lưu trên thiết bị này. Đừng đóng trình duyệt, hãy bấm nút bên dưới để thử lại.</p>
                       <button type="button" id="retry-btn" class="ts-btn ts-btn-primary">↻ THỬ NỘP LẠI</button>`
                    : `<button type="button" id="home-btn" class="ts-btn ts-btn-secondary">← Quay lại trang chủ</button>`}
            </div>`;
        const retry = $("#retry-btn");
        if (retry) retry.onclick = submitResults;
        const home = $("#home-btn");
        if (home) home.onclick = () => { clearState(); appState = freshState(); render(); };
    }

    /* ======================= KẾT QUẢ ======================= */
    function renderResult() {
        const res = appState.finalResult;
        const pct = res.maxScore ? Math.round((res.mcqScore / res.maxScore) * 100) : 0;
        appContainer.innerHTML = `
            <div style="background:#1a5c2a; border-radius:16px; padding:24px 20px; margin-bottom:20px; text-align:center; color:#fff;"><div style="font-size:48px; margin-bottom:8px;">🎉</div><div style="font-weight:800; font-size:20px;">NỘP BÀI THÀNH CÔNG!</div><div style="color:rgba(255,255,255,0.8); font-size:14px; margin-top:4px;">${esc(res.candidateName)} • ${esc(res.positionLabel)} <br> <small>(${esc(res.examPeriod)})</small></div></div>
            <div style="background:#fff; border-radius:14px; padding:24px 20px; margin-bottom:16px; box-shadow:0 2px 12px rgba(0,0,0,0.06);">
                <h3 style="color:#1a5c2a; font-weight:800; font-size:16px; margin:0 0 16px;">KẾT QUẢ TRẮC NGHIỆM</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px;">
                    <div class="ts-stat-box"><div style="color:#1a5c2a; font-weight:900; font-size:22px;">${res.mcqScore}/${res.maxScore}</div><div style="color:#888; font-size:11px;">Điểm</div><div style="color:#555; font-size:12px; font-weight:600;">Điểm Trắc nghiệm</div></div>
                    <div class="ts-stat-box"><div style="color:#2196F3; font-weight:900; font-size:22px;">${res.correctCount}/${res.total}</div><div style="color:#888; font-size:11px;">câu</div><div style="color:#555; font-size:12px; font-weight:600;">Số câu đúng</div></div>
                    <div class="ts-stat-box"><div style="color:${pct >= 70 ? '#1a5c2a' : '#e8282e'}; font-weight:900; font-size:22px;">${pct}%</div><div style="color:#888; font-size:11px;">Tỉ lệ</div><div style="color:#555; font-size:12px; font-weight:600;">Chính xác</div></div>
                </div>
            </div>
            <div style="background:#fff8e1; border:1px solid #f5c518; border-radius:12px; padding:14px 16px; margin-bottom:16px;">
                <div style="font-weight:700; color:#b8860b; font-size:14px; margin-bottom:6px;">📝 Phần Tự Luận (${res.essayMax} điểm)</div>
                <p style="margin:0; color:#666; font-size:13px;">Dữ liệu bài làm đã được chuyển về cho bộ phận Nhân sự. Kết quả cuối cùng sẽ được thông báo sau khi hoàn tất chấm điểm tự luận.</p>
            </div>
            <button type="button" id="restart-btn" class="ts-btn" style="border:2px solid #1a5c2a; background:#fff; color:#1a5c2a;">← Quay lại trang chủ</button>
        `;
        $("#restart-btn").onclick = () => { clearState(); location.reload(); };
    }

    /* ======================= TẢI KỲ THI ======================= */
    async function loadPeriods() {
        for (let attempt = 1; attempt <= 3 && periods === null; attempt++) {
            try {
                const res = await fetch(GOOGLE_SCRIPT_URL);
                const data = await res.json();
                if (data && data.ok && Array.isArray(data.periods)) {
                    periods = data.periods.map(p => typeof p === "string" ? { name: p, duration: DEFAULT_DURATION } : p);
                    if (data.mcqCount) examConfig = { mcqCount: data.mcqCount, essayCount: data.essayCount };
                }
            } catch (e) { console.error("Lỗi đồng bộ đợt thi:", e); }
            if (periods === null && attempt < 3) await sleep(1500 * attempt);
        }
        if (periods === null) periods = "error";
        if (appState.examPeriod && !selectedPeriod()) appState.examPeriod = "";
        refreshPeriodSelect();
    }

    /* ======================= KHỞI ĐỘNG ======================= */
    const saved = loadState();
    if (saved && saved.screen && saved.screen !== "home" && saved.screen !== "result"
        && saved.sessionId && Array.isArray(saved.activeMcqs) && saved.activeMcqs.length) {
        appState = Object.assign(freshState(), saved);
        if (appState.screen === "submitting") submitResults();
        else if (appState.screen === "submit_error") render();
        else { render(); startTimer(); }
    } else {
        clearState();
        render();
    }
    loadPeriods();

    setInterval(() => {
        if (!document.contains(appContainer)) {
            const again = document.getElementById("the-street-quiz-app");
            if (!again) return;
            appContainer = again;
            render();
            return;
        }
        if (appState.screen === "home" && !$("[data-ts-home]")) renderHome();
    }, 1000);
})();

