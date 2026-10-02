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
def api(route):
    req = route.request
    if req.method == "GET":   # trang thi lấy danh sách kỳ thi
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "periods": [{"name": "Quý 4/2026", "duration": 45}], "mcqCount": 10, "essayCount": 4}))
    b = json.loads(req.post_data or "{}"); a = b.get("action")
    r = {"result": "success"}
    if a == "admin.login": r = {"result": "success", "token": "a" * 64} if b.get("password") == "pw" else {"result": "error", "code": "AUTH_FAIL", "error": "Mật khẩu không đúng."}
    elif a == "admin.bootstrap": r = dict(result="success", positions=[{"id": "phucvu", "label": "Phục Vụ"}], config={"mcqCount": 10, "essayCount": 4, "defaultDuration": 60, "defaultPassPct": 70}, periods=[], pending=0, **BANK_META)
    elif a == "admin.reports.stats": r = {"result": "success", "stats": STATS}
    elif a == "admin.bank.list": r = {"result": "success", "questions": []}
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
        print("✓ Trang quản trị: chạy qua đoạn nhúng 2 dòng, chịu được WordPress đổi '&' và Elementor 2 khung")
        urls = pg.evaluate("performance.getEntriesByType('resource').map(e => e.name)")
        for f in ("admin/admin.js?v=", "admin/admin.css?v="):
            assert any(f in u for u in urls), (f, urls)
        print("✓ File JS và CSS luôn tải kèm mã phiên bản mới (?v=...), không dùng bản cũ trong bộ nhớ đệm")

        # 2) Trang thi: hiện kỳ thi, bắt đầu thi được
        pg = open_page(wordpress(QUIZ))
        pg.wait_for_function("document.querySelector('#exam-period') && document.querySelector('#exam-period').options.length > 1", timeout=5000)
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
