"""
Kiểm thử giao diện trong Chromium thật (không cần mạng, không gọi server thật).
- Lấy đúng đoạn nhúng trong WORDPRESS.md, giả lập WordPress đổi '&' -> '&#038;' và Elementor dựng widget 2 lần.
- Các file JS/CSS được phục vụ từ repo (chặn request tới GitHub Pages), API Apps Script được giả lập.
Chạy:  pip install playwright && python -m playwright install chromium && python tests/ui_test.py
"""
import json, os, re, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGES = "https://thestreet-admin.github.io/thestreet-web/"
md = (ROOT / "WORDPRESS.md").read_text(encoding="utf-8")
snippets = re.findall(r"```html\n(.*?)```", md, re.S)
ADMIN, QUIZ = snippets[0], snippets[1]

def wordpress(h):            # WordPress đổi ký tự & trong nội dung trang
    return h.replace("&", "&#038;")

def elementor(widget):       # Elementor: 2 bản của cùng widget, 1 bản bị ẩn
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>.hide-desktop{{display:none}}</style></head><body>
<header style="height:80px;background:#063"></header>
<div class="hide-desktop">{widget}</div><div class="show">{widget}</div></body></html>"""

def serve_repo(route):
    path = route.request.url[len(PAGES):].split("?")[0]
    f = ROOT / path
    if not f.is_file(): return route.fulfill(status=404, body="not found")
    ctype = "text/css" if path.endswith(".css") else "application/javascript"
    route.fulfill(status=200, content_type=ctype, body=f.read_text(encoding="utf-8"))

STATS = {"overall": {"count": 0, "graded": 0, "pending": 0, "passed": 0, "passRate": None, "avgPct": None, "avgMcqPct": None}, "byPosition": [], "questions": [], "essays": []}
BANK_META = {"bank": [{"positionId": "phucvu", "label": "Phục Vụ", "total": 14, "activeTN": 10, "activeTL": 4}], "bankIssues": {"noIdRows": [], "duplicateIds": []}}
PERIODS = [{"name": "Đợt dài", "opensAt": None, "closesAt": None, "duration": 60, "passPct": 70, "note": "", "mcqCount": 12, "essayCount": 4, "status": "open", "submitted": 0, "started": 0}]
SAVED = []
ACC_SAVED = []
GRADED = []
ME = {"a" * 64: {"username": "admin", "name": "Quản trị chính", "role": "quanly", "roleLabel": "Quản lý"},
      "c" * 64: {"username": "lan", "name": "Chị Lan", "role": "chamthi", "roleLabel": "Người chấm"}}
ACCOUNTS = [{"username": "lan", "name": "Chị Lan", "role": "chamthi", "roleLabel": "Người chấm", "active": True, "createdAt": 0, "lastLogin": None}]
LOGS = [{"time": 1790000000000, "username": "lan", "name": "Chị Lan", "action": "Sửa điểm", "target": "Nguyễn Văn A (001) · Phục Vụ · Quý 4/2026", "detail": "Trước: 20/40 (Không đạt, chấm bởi HR) → 30/40 điểm → Đạt"},
        {"time": 1789990000000, "username": "admin", "name": "Quản trị chính", "action": "Xóa câu hỏi", "target": "PV-TN-003", "detail": "Phục Vụ · TN · 3 điểm: \"Câu cũ\""},
        {"time": 1789980000000, "username": "admin", "name": "Quản trị chính", "action": "Đăng nhập", "target": "", "detail": ""}]
IMPORTED = []
RESET = []
BANK = [{"id": "PV-TN-001", "positionId": "phucvu", "positionLabel": "Phục Vụ", "type": "TN", "q": "Câu có sẵn", "options": ["a", "b", "c", "d"], "answer": 0, "points": 3, "active": True, "guide": ""},
        {"id": "PV-TL-001", "positionId": "phucvu", "positionLabel": "Phục Vụ", "type": "TL", "q": "Tự luận 1", "options": ["", "", "", ""], "answer": None, "points": 2, "active": True, "guide": "- Chào khách (1đ)"}]
VOIDED = {"key": "huy:2", "voided": True, "voidedAt": 1789500000000, "voidedBy": "Anh Hùng", "voidReason": "Mất điện"}
RESULT = {"key": "s1", "row": 2, "time": 1789000000000, "name": "Nguyễn Văn A", "empId": "001", "position": "Phục Vụ", "period": "Đợt dài", "mcqScore": 18, "mcqMax": 30, "correct": "6/10",
          "essayScore": None, "essayMax": 2, "total": None, "max": 32, "pct": None, "result": "", "grader": "", "note": "", "graded": False, "gradedAt": None, "sys": "", "legacy": False}
def api(route):
    req = route.request
    if req.method == "GET":   # trang thi lấy danh sách kỳ thi
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "periods": [{"name": "Quý 4/2026", "duration": 45, "mcqCount": 10, "essayCount": 4}, {"name": "Đợt ngắn", "duration": 30, "mcqCount": 5, "essayCount": 2}], "mcqCount": 10, "essayCount": 4}))
    b = json.loads(req.post_data or "{}"); a = b.get("action")
    r = {"result": "success"}
    me = ME.get(b.get("token"), ME["a" * 64])
    if a == "admin.login":
        u, pw = b.get("username", ""), b.get("password")
        tok = "a" * 64 if u in ("", "admin") and pw == "pw" else ("c" * 64 if u == "lan" and pw == "pw2" else None)
        r = {"result": "success", "token": tok, "me": ME[tok]} if tok else {"result": "error", "code": "AUTH_FAIL", "error": "Tên đăng nhập hoặc mật khẩu không đúng."}
    elif a == "admin.bootstrap": r = dict(result="success", positions=[{"id": "phucvu", "label": "Phục Vụ"}], config={"mcqCount": 10, "essayCount": 4, "defaultDuration": 60, "defaultPassPct": 70}, periods=PERIODS, pending=1, me=me, **BANK_META)
    elif me["role"] != "quanly" and a not in ("admin.results.list", "admin.results.get", "admin.results.grade", "admin.reports.pdf", "admin.account.password", "admin.logout"):
        r = {"result": "error", "code": "FORBIDDEN", "error": "Không có quyền."}
    elif a == "admin.accounts.list": r = {"result": "success", "accounts": ACCOUNTS}
    elif a == "admin.accounts.save":
        ACC_SAVED.append(b["account"]); x = dict(b["account"]); x.pop("password", None); x["lastLogin"] = None
        r = {"result": "success", "accounts": ACCOUNTS + [x]}
    elif a == "admin.log.list": r = {"result": "success", "logs": LOGS, "total": len(LOGS)}
    elif a == "admin.results.list": r = {"result": "success", "results": [dict(RESULT, **VOIDED)] if b.get("voided") else [RESULT]}
    elif a == "admin.results.get":
        item = dict(RESULT, passPct=70, essayScores=None, detail="", essaysText=[], version=0, guides={"PV-TL-001": "- Chào khách (1đ)"},
                    data={"mcq": [], "essay": [{"id": "PV-TL-001", "q": "Tự luận 1", "points": 2, "answer": "Trả lời"}]})
        if b["key"].startswith("huy:"): item.update(VOIDED)
        elif me["role"] == "chamthi": item["editing"] = {"name": "Anh Hùng", "since": 1789000000000}
        r = {"result": "success", "item": item}
    elif a == "admin.results.grade":
        GRADED.append(b)
        if me["role"] == "chamthi" and not b.get("force"):
            r = {"result": "error", "code": "CONFLICT", "error": "Bài này vừa được Anh Hùng chấm lúc 02/10/2026 08:00 (30/32 điểm → Đạt) sau khi bạn mở bài."}
        else: r = {"result": "success", "summary": dict(RESULT, graded=True, essayScore=2, total=20, result="Không đạt", grader=me["name"], gradedAt=1790000000000)}
    elif a == "admin.results.reset": RESET.append(b)
    elif a == "admin.bank.import":
        IMPORTED.append(b["questions"]); r = dict(result="success", added=1, updated=1, unchanged=0, **BANK_META)
    elif a == "admin.periods.save": SAVED.append(b["period"])
    elif a == "admin.reports.stats": r = {"result": "success", "stats": STATS}
    elif a == "admin.bank.list": r = {"result": "success", "questions": BANK}
    elif a == "start": r = {"result": "success", "sessionId": "s1", "name": b["name"], "empId": b["empId"], "positionId": "phucvu", "positionLabel": "Phục Vụ", "period": b["period"], "startedAt": 0, "endsAt": 45 * 60000, "serverNow": 0,
                            "mcq": [{"id": f"PV-TN-{i:03d}", "q": f"Câu {i}", "points": 3, "options": ["a", "b", "c", "d"]} for i in range(1, 11)],
                            "essay": [{"id": f"PV-TL-{i:03d}", "q": f"Tự luận {i}", "points": 2} for i in range(1, 5)]}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(r))

def main():
    errors = []
    with sync_playwright() as p:
        exe = os.environ.get("CHROMIUM_PATH")
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        def open_page(html):
            pg = browser.new_page(viewport={"width": 1360, "height": 850})
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.route(PAGES + "**", serve_repo)
            pg.route("https://script.google.com/**", api)
            if os.environ.get("XLSX_LOCAL"):   # máy không vào được CDN: dùng bản xlsx.full.min.js tải sẵn
                pg.route("https://cdn.jsdelivr.net/npm/xlsx**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=pathlib.Path(os.environ["XLSX_LOCAL"]).read_text(encoding="utf-8")))
            pg.route("http://site.test/", lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=html))
            pg.goto("http://site.test/"); pg.wait_for_timeout(1500)
            return pg

        # 1) Trang quản trị: WordPress đổi '&' + Elementor 2 khung
        pg = open_page(elementor(wordpress(ADMIN)))
        vis = pg.locator(".show #ts-admin-app")
        assert vis.locator("#lp").count() == 1, vis.inner_text()[:200]
        bg = pg.evaluate("getComputedStyle(document.querySelector('.show .btn.pri')).backgroundImage")
        assert "gradient" in bg, "CSS chưa nạp: " + bg
        vis.locator("#lp").fill("pw"); vis.locator("#lb").click(); pg.wait_for_timeout(1000)
        assert "Tổng quan" in vis.inner_text()
        vis.locator("[data-tab=bank]").click(); pg.wait_for_timeout(500)
        assert "Phục Vụ" in vis.inner_text()
        assert "cần tối thiểu 12 TN" in vis.inner_text(), "cảnh báo thiếu câu theo đợt thi đang mở"
        assert "Có đáp án mẫu" in vis.inner_text()
        # Nhập Excel (file CSV cũng đọc được): dòng lỗi → không cho nhập
        head = "Mã câu,Vị trí,Loại (TN/TL),Nội dung câu hỏi,Phương án A,Phương án B,Phương án C,Phương án D,Đáp án đúng,Điểm,Trạng thái,Đáp án mẫu / hướng dẫn chấm\n"
        bad = head + ",Phục Vụ,TN,Câu mới?,x,y,,,B,3,,\nPV-TN-999,Phục Vụ,TN,Mã lạ,x,y,,,A,3,,\n,Bếp,TL,Sai vị trí,,,,,,2,,\n"
        pg.locator("#bfile").set_input_files(files=[{"name": "de.csv", "mimeType": "text/csv", "buffer": bad.encode("utf-8")}]); pg.wait_for_timeout(1500)
        mt = pg.locator(".modal").inner_text()
        assert "2 dòng lỗi" in mt and "PV-TN-999" in mt and "Bếp" in mt and pg.locator("#impgo").count() == 0, mt[:600]
        pg.locator(".modal [data-close]").first.click()
        good = head + ",Phục Vụ,TN,Câu mới?,x,y,,,B,3,,\nPV-TL-001,Phục Vụ,TL,Tự luận sửa,,,,,,2,Tạm ẩn,- Ý 1\n"
        pg.locator("#bfile").set_input_files(files=[{"name": "de.csv", "mimeType": "text/csv", "buffer": good.encode("utf-8")}]); pg.wait_for_timeout(1000)
        assert "1 thêm mới" in pg.locator(".modal").inner_text() and "1 cập nhật" in pg.locator(".modal").inner_text()
        pg.locator("#impgo").click(); pg.wait_for_timeout(800)
        q1, q2 = IMPORTED[-1]
        assert q1["id"] == "" and q1["answer"] == 1 and q1["positionId"] == "phucvu" and q1["type"] == "TN", q1
        assert q2["id"] == "PV-TL-001" and q2["active"] is False and q2["guide"] == "- Ý 1", q2
        print("✓ Ngân hàng đề: nhập Excel có xem trước, chặn dòng lỗi, gửi đúng dữ liệu")
        with pg.expect_download() as dl:
            vis.locator("#bexp").click()
        assert dl.value.suggested_filename.startswith("NganHangDe_"), dl.value.suggested_filename
        xl = dl.value.path()
        pg.locator("#bfile").set_input_files(xl); pg.wait_for_timeout(1000)
        mt = pg.locator(".modal").inner_text()
        assert "2 cập nhật" in mt and "0 thêm mới" in mt and "lỗi" not in mt, mt[:400]
        pg.locator(".modal [data-close]").first.click()
        print("✓ Ngân hàng đề: xuất Excel, nhập lại chính file đó được nhận đúng (cập nhật theo mã câu)")
        # Đáp án mẫu trong form sửa câu
        vis.locator("tr[data-id='PV-TL-001'] [data-act=edit]").click(); pg.wait_for_timeout(300)
        assert pg.locator("#qguide").input_value() == "- Chào khách (1đ)"
        pg.locator(".modal [data-close]").first.click()
        vis.locator("[data-tab=periods]").click(); pg.wait_for_timeout(500)
        assert "12 TN + 4 TL" in vis.inner_text()
        vis.locator('[data-act="edit"]').click(); pg.wait_for_timeout(300)
        assert pg.locator("#pmcq").input_value() == "12" and pg.locator("#pessay").input_value() == "4"
        pg.locator("#pmcq").fill("15"); pg.locator("#pessay").fill("6"); pg.locator("#psave").click(); pg.wait_for_timeout(800)
        assert SAVED and SAVED[-1]["mcqCount"] == 15 and SAVED[-1]["essayCount"] == 6, SAVED
        print("✓ Đợt thi: hiện và lưu số câu TN/TL riêng của từng đợt")
        print("✓ Trang quản trị: chạy qua đoạn nhúng 2 dòng, chịu được WordPress đổi '&' và Elementor 2 khung")
        urls = pg.evaluate("performance.getEntriesByType('resource').map(e => e.name)")
        for f in ("admin/admin.js?v=", "admin/admin.css?v="):
            assert any(f in u for u in urls), (f, urls)
        print("✓ File JS và CSS luôn tải kèm mã phiên bản mới (?v=...), không dùng bản cũ trong bộ nhớ đệm")

        # 1b) Quản lý: tab Tài khoản + Nhật ký
        txt = vis.inner_text()
        assert "Quản trị chính" in txt and "Tài khoản" in txt and "Nhật ký" in txt, txt[:300]
        vis.locator("[data-tab=accounts]").click(); pg.wait_for_timeout(500)
        assert "Chị Lan" in vis.inner_text() and "Người chấm" in vis.inner_text()
        vis.locator("#anew").click(); pg.wait_for_timeout(300)
        pg.locator("#auser").fill("Hung"); pg.locator("#aname").fill("Anh Hùng"); pg.select_option("#arole", "quanly")
        pg.locator("#asave").click(); pg.wait_for_timeout(300)
        assert not ACC_SAVED, "chưa có mật khẩu thì không gửi"
        pg.locator("#apass").fill("matkhau1"); pg.locator("#asave").click(); pg.wait_for_timeout(800)
        assert ACC_SAVED and ACC_SAVED[-1]["username"] == "hung" and ACC_SAVED[-1]["role"] == "quanly" and ACC_SAVED[-1]["password"] == "matkhau1", ACC_SAVED
        assert "Anh Hùng" in vis.inner_text()
        vis.locator("[data-tab=log]").click(); pg.wait_for_timeout(600)
        txt = vis.inner_text()
        assert "Sửa điểm" in txt and "Xóa câu hỏi" in txt and "3 dòng" in txt, txt[:500]
        pg.select_option("#lact", "grade"); pg.wait_for_timeout(200)
        assert "1 dòng" in vis.inner_text() and "Xóa câu hỏi" not in vis.inner_text()
        pg.select_option("#lact", ""); pg.select_option("#luser", "admin"); pg.wait_for_timeout(200)
        assert "2 dòng" in vis.inner_text()
        print("✓ Quản lý: thêm tài khoản riêng, xem và lọc nhật ký thao tác")

        # 1c) Người chấm: chỉ thấy tab chấm bài, tên người chấm theo tài khoản, không có nút Cho thi lại
        pg.evaluate("sessionStorage.clear()")
        pg = open_page(elementor(wordpress(ADMIN)))
        vis = pg.locator(".show #ts-admin-app")
        vis.locator("#lu").fill("lan"); vis.locator("#lp").fill("pw2"); vis.locator("#lb").click(); pg.wait_for_timeout(1000)
        txt = vis.inner_text()
        assert "Chị Lan" in txt and "Người chấm" in txt and "Đổi mật khẩu" in txt, txt[:300]
        assert vis.locator("[data-tab]").count() == 1 and "Ngân hàng đề" not in txt and "Nhật ký" not in txt, txt[:300]
        assert "Nguyễn Văn A" in txt
        vis.locator("tr[data-key]").click(); pg.wait_for_timeout(600)
        assert pg.locator("#gname").count() == 0 and pg.locator("#greset").count() == 0
        mt = pg.locator(".modal").inner_text()
        assert "theo tài khoản đăng nhập" in mt
        assert "Đáp án mẫu" in mt and "Chào khách (1đ)" in mt, "hiện đáp án mẫu khi chấm"
        assert "Anh Hùng đang mở bài này" in mt, "báo người khác đang chấm"
        pg.locator(".qs[data-v='2']").click()
        dialogs = []
        pg.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        pg.locator("#gsave").click(); pg.wait_for_timeout(800)
        assert dialogs and "vừa được Anh Hùng chấm" in dialogs[0], dialogs
        assert len(GRADED) >= 2 and GRADED[-2]["expectVersion"] == 0 and not GRADED[-2].get("force") and GRADED[-1]["force"] is True, GRADED[-2:]
        assert GRADED[-1]["grader"] == "Chị Lan" and GRADED[-1]["essayScores"] == [2], GRADED
        print("✓ Người chấm: chỉ chấm bài, không sửa đề / cho thi lại, tên người chấm lấy theo tài khoản")
        print("✓ Chấm bài: hiện đáp án mẫu, báo người khác đang chấm, hỏi trước khi ghi đè điểm vừa được chấm")

        # 1d) Quản lý: cho thi lại có lý do, xem bài đã hủy (chỉ xem)
        pg = open_page(elementor(wordpress(ADMIN)))
        vis = pg.locator(".show #ts-admin-app")
        vis.locator("#lp").fill("pw"); vis.locator("#lb").click(); pg.wait_for_timeout(1000)
        vis.locator("[data-tab=results]").click(); pg.wait_for_timeout(600)
        vis.locator("tr[data-key]").click(); pg.wait_for_timeout(600)
        pg.once("dialog", lambda d: d.accept("Mất điện giữa giờ"))
        pg.locator("#greset").click(); pg.wait_for_timeout(800)
        assert RESET and RESET[-1]["reason"] == "Mất điện giữa giờ", RESET
        vis.locator("[data-tab=results]").click(); pg.wait_for_timeout(400)
        pg.select_option("#rst", "voided"); pg.wait_for_timeout(800)
        assert "Đã hủy" in vis.inner_text() and "Mất điện" in vis.inner_text(), vis.inner_text()[:500]
        vis.locator("tr[data-key]").click(); pg.wait_for_timeout(600)
        mt = pg.locator(".modal").inner_text()
        assert "đã bị hủy" in mt and pg.locator("#gsave").count() == 0 and pg.locator("#gpdf").count() == 1, mt[:400]
        print("✓ Cho thi lại: hỏi lý do, bài cũ xem lại được trong mục Bài đã hủy")

        # 2) Trang thi: hiện kỳ thi, bắt đầu thi được
        pg = open_page(wordpress(QUIZ))
        pg.wait_for_function("document.querySelector('#exam-period') && document.querySelector('#exam-period').options.length > 1", timeout=5000)
        pg.select_option("#exam-period", "Đợt ngắn")
        assert "5 câu trắc nghiệm + 2 câu tự luận" in pg.inner_text("#ts-count-text"), pg.inner_text("#ts-count-text")
        pg.select_option("#exam-period", "Quý 4/2026")
        assert "10 câu trắc nghiệm + 4 câu tự luận" in pg.inner_text("#ts-count-text")
        pg.select_option("#exam-period", "Quý 4/2026"); pg.fill("#candidate-name", "Nguyễn Văn A"); pg.fill("#emp-id", "001")
        pg.click(".ts-pos-btn[data-id=phucvu]"); pg.click("#start-btn"); pg.wait_for_timeout(800)
        assert "Câu 1" in pg.inner_text("#the-street-quiz-app") and "45:00" >= pg.inner_text("#ts-timer-countdown") > "44:"
        print("✓ Trang thi: tải kỳ thi, bắt đầu bài, đồng hồ 45 phút theo đợt thi")

        # 3) File JS không tải được → hiện thông báo thay vì 'Đang tải' mãi
        pg = browser.new_page(); pg.route(PAGES + "**", lambda r: r.fulfill(status=404, body=""))
        pg.route("http://site.test/", lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=wordpress(ADMIN)))
        pg.goto("http://site.test/"); pg.wait_for_timeout(800)
        assert "Không tải được" in pg.inner_text("#ts-admin-app")
        print("✓ Lỗi tải file: hiện thông báo rõ ràng")
        browser.close()
    assert not errors, errors
    print("TẤT CẢ KIỂM THỬ GIAO DIỆN ĐỀU QUA")

if __name__ == "__main__":
    main()
