"""
Kiểm thử giao diện trang nhận voucher + trang quản trị voucher trong Chromium thật (API giả lập, không gọi server thật).
Dùng đúng đoạn nhúng trong WORDPRESS.md, giả lập WordPress đổi '&' -> '&#038;' và Elementor dựng widget 2 lần.
Chạy:  python tests/voucher_ui_test.py   (Excel cần XLSX_LOCAL=<xlsx.full.min.js> khi không có mạng)
"""
import json, os, re, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGES = "https://thestreet-admin.github.io/thestreet-web/"
API = "https://script.google.com/macros/s/VOUCHER_TEST/exec"
md = (ROOT / "WORDPRESS.md").read_text(encoding="utf-8")
snips = re.findall(r"```html\n(.*?)```", md, re.S)
CUST = next(s for s in snips if 'id="ts-voucher-app"' in s)
ADM = next(s for s in snips if 'id="ts-voucher-admin"' in s)
def with_api(snippet, idv): return snippet.replace('id="' + idv + '"', 'id="' + idv + '" data-api="' + API + '"', 1)
def wordpress(h): return h.replace("&", "&#038;")
def elementor(w):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>.hide-desktop{{display:none}}</style></head><body>
<div class="hide-desktop">{w}</div><div class="show">{w}</div></body></html>"""
def serve_repo(route):
    path = route.request.url[len(PAGES):].split("?")[0]
    f = ROOT / path
    if not f.is_file(): return route.fulfill(status=404, body="not found")
    route.fulfill(status=200, content_type="text/css" if path.endswith(".css") else "application/javascript", body=f.read_text(encoding="utf-8"))

# ---------- server giả lập ----------
S = {}
def reset():
    S.clear()
    S.update(campaigns=[{"code": "TET27", "name": "Tết 2027", "opensAt": None, "closesAt": 1830000000000, "active": True, "status": "open", "offer": "Giảm 20% hóa đơn",
                         "howto": "Đưa mã cho thu ngân", "note": "", "channels": [
                             {"code": "tiktok", "name": "Livestream TikTok", "quota": 800, "active": True, "issued": 798},
                             {"code": "billboard", "name": "Bảng quảng cáo tòa nhà", "quota": 200, "active": True, "issued": 200}],
                         "pool": {"total": 1000, "unused": 2}, "claimed": 998, "quotaTotal": 1000}],
             pageUrl="", calls=[], busy=0, claimed={})
def public_get(c):
    if not c: return {"ok": True, "campaigns": [{"code": x["code"], "name": x["name"]} for x in S["campaigns"] if x["status"] == "open"]}
    x = next((x for x in S["campaigns"] if x["code"] == c.upper()), None)
    if not x: return {"ok": False, "code": "NOT_FOUND", "error": "Không tìm thấy"}
    return {"ok": True, "campaign": {k: x[k] for k in ("code", "name", "offer", "howto", "opensAt", "closesAt", "status")},
            "channels": [{"code": k["code"], "name": k["name"], "soldOut": k["issued"] >= k["quota"]} for k in x["channels"] if k["active"]]}
def api(route):
    req = route.request
    if req.method == "GET":
        m = re.search(r"[?&]c=([^&]+)", req.url)
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(public_get(m.group(1) if m else "")))
    b = json.loads(req.post_data or "{}"); a = b.get("action"); S["calls"].append(b)
    r = {"result": "success"}
    c = S["campaigns"][0] if S["campaigns"] else None
    if a == "claim":
        if S["busy"] > 0:
            S["busy"] -= 1; r = {"result": "error", "code": "BUSY", "error": "bận"}
        elif b["phone"] in S["claimed"]:
            r = {"result": "success", "voucher": S["claimed"][b["phone"]], "name": b["name"], "already": True, "campaign": public_get("TET27")["campaign"]}
        else:
            k = next((k for k in c["channels"] if k["code"] == b.get("channel")), None)
            if not k: r = {"result": "error", "code": "INVALID", "error": "Vui lòng chọn nơi bạn biết đến chương trình."}
            elif k["issued"] >= k["quota"]: r = {"result": "error", "code": "SOLD_OUT", "error": "Rất tiếc, mã ưu đãi dành cho " + k["name"] + " đã được nhận hết."}
            else:
                k["issued"] += 1; code = "TS-%04d" % (len(S["claimed"]) + 1); S["claimed"][b["phone"]] = code
                r = {"result": "success", "voucher": code, "name": b["name"], "already": False, "campaign": public_get("TET27")["campaign"]}
    elif a == "admin.login":
        r = {"result": "success", "token": "a" * 64, "me": {"username": "admin"}} if b.get("password") == "pw" else {"result": "error", "code": "AUTH_FAIL", "error": "Mật khẩu không đúng."}
    elif b.get("token") != "a" * 64: r = {"result": "error", "code": "AUTH", "error": "hết hạn"}
    elif a == "admin.bootstrap": r = {"result": "success", "campaigns": S["campaigns"], "pageUrl": S["pageUrl"]}
    elif a == "admin.campaigns.save":
        v = b["campaign"]; S["campaigns"].append(dict(v, status="open", channels=[], pool={"total": 0, "unused": 0}, claimed=0, quotaTotal=0))
        r = {"result": "success", "campaigns": S["campaigns"]}
    elif a == "admin.channels.save":
        x = next(x for x in S["campaigns"] if x["code"] == b["campaign"]); x["channels"].append(dict(b["channel"], issued=0))
        r = {"result": "success", "campaigns": S["campaigns"]}
    elif a == "admin.codes.import":
        x = next(x for x in S["campaigns"] if x["code"] == b["campaign"]); n = len(b["codes"])
        x["pool"] = {"total": x["pool"]["total"] + n, "unused": x["pool"]["unused"] + n}; r = {"result": "success", "campaigns": S["campaigns"]}
    elif a == "admin.claims.list":
        r = {"result": "success", "claims": [{"time": 1830000000000, "campaign": "TET27", "channel": "tiktok", "channelName": "Livestream TikTok", "name": "Nguyễn <b>An</b>", "phone": "0901234567", "code": "TS-0001"},
                                             {"time": 1830000000000, "campaign": "TET27", "channel": "billboard", "channelName": "Bảng QC", "name": "Lê Bình", "phone": "0912345678", "code": "TS-0002"}]}
    elif a == "admin.settings.save": S["pageUrl"] = b["pageUrl"]; r = {"result": "success", "pageUrl": b["pageUrl"]}
    elif a == "admin.log.list": r = {"result": "success", "logs": [{"time": 1830000000000, "username": "admin", "action": "Nhập mã", "target": "TET27", "detail": "1000 mã"}]}
    elif a == "admin.logout": pass
    route.fulfill(status=200, content_type="application/json", body=json.dumps(r))

QR_STUB = "window.qrcode=function(){return{addData:function(){},make:function(){},getModuleCount:function(){return 21},isDark:function(r,c){return (r*c)%3===0}}};"

def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        def open_page(html, query=""):
            pg = browser.new_page(viewport={"width": 1100, "height": 900})
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.route(PAGES + "**", serve_repo)
            pg.route("https://script.google.com/**", api)
            pg.route("https://cdn.jsdelivr.net/npm/qrcode-generator**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=QR_STUB))
            if os.environ.get("XLSX_LOCAL"):
                pg.route("https://cdn.jsdelivr.net/npm/xlsx**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=pathlib.Path(os.environ["XLSX_LOCAL"]).read_text(encoding="utf-8")))
            pg.route("http://site.test/**", lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=html))
            pg.goto("http://site.test/nhan-voucher" + query); pg.wait_for_timeout(1200)
            return pg

        # ===== 1. Trang khách: link kênh TikTok =====
        reset()
        pg = open_page(wordpress(elementor(with_api(CUST, "ts-voucher-app"))), "?c=tet27&k=tiktok")
        app = pg.locator(".show #ts-voucher-app")
        assert "Tết 2027" in app.inner_text() and "Giảm 20%" in app.inner_text(), app.inner_text()
        assert app.locator("select[name=channel]").count() == 0, "link kênh cố định → không hỏi kênh"
        app.locator("input[name=name]").fill("Nguyễn Văn An")
        app.locator("input[name=phone]").fill("0901 23")
        app.locator("button[type=submit]").click(); pg.wait_for_timeout(200)
        assert "Số điện thoại không hợp lệ" in app.inner_text()
        app.locator("input[name=phone]").fill("0901 234 567")
        app.locator("button[type=submit]").click(); pg.wait_for_timeout(200)
        assert "tick đồng ý" in app.inner_text()
        app.locator("input[name=agree]").check()
        S["busy"] = 1   # lần đầu server bận → tự thử lại
        app.locator("button[type=submit]").click(); pg.wait_for_timeout(4500)
        assert app.locator(".tsv-code").inner_text() == "TS-0001", app.inner_text()
        assert "Đưa mã cho thu ngân" in app.inner_text()
        claims = [c for c in S["calls"] if c["action"] == "claim"]
        assert len(claims) == 2 and claims[-1]["channel"] == "tiktok" and claims[-1]["agree"] is True and claims[-1]["website"] == ""
        pg.screenshot(path="/tmp/voucher_done.png", full_page=True)
        pg.close()

        # ===== 2. Trang khách: không có mã kênh → chọn kênh; kênh hết mã bị khóa; hết mã báo lỗi =====
        pg = open_page(elementor(with_api(CUST, "ts-voucher-app")), "?c=TET27")
        app = pg.locator(".show #ts-voucher-app")
        sel = app.locator("select[name=channel]")
        assert sel.count() == 1
        assert app.locator("option[value=billboard]").get_attribute("disabled") is not None, app.locator("select[name=channel]").inner_html()
        app.locator("input[name=name]").fill("Bình"); app.locator("input[name=phone]").fill("0912345678"); app.locator("input[name=agree]").check()
        app.locator("button[type=submit]").click(); pg.wait_for_timeout(500)
        assert "chọn nơi" in app.inner_text(), app.inner_text()
        pg.screenshot(path="/tmp/voucher_form.png", full_page=True)
        sel.select_option("tiktok"); app.locator("button[type=submit]").click(); pg.wait_for_timeout(500)
        assert "TS-0002" in app.inner_text()
        pg.screenshot(path="/tmp/voucher_pick.png", full_page=True)
        pg.close()
        pg = open_page(elementor(with_api(CUST, "ts-voucher-app")), "?c=TET27&k=tiktok")
        app = pg.locator(".show #ts-voucher-app")
        assert "đã được nhận hết" in app.inner_text(), "TikTok đã đủ 800"
        pg.close()
        pg = open_page(elementor(with_api(CUST, "ts-voucher-app")), "?c=KHONGCO")
        assert "Không tìm thấy chương trình" in pg.locator(".show #ts-voucher-app").inner_text()
        pg.close()
        pg = open_page(elementor(CUST))   # chưa cấu hình URL máy chủ
        assert "chưa được cấu hình" in pg.locator(".show #ts-voucher-app").inner_text()
        pg.close()

        # ===== 3. Trang quản trị =====
        reset()
        pg = open_page(wordpress(elementor(with_api(ADM, "ts-voucher-admin"))))
        roots = pg.locator("#ts-voucher-admin")
        assert roots.nth(0).inner_html() == "", "khung ẩn của Elementor bị bỏ trống"
        app = pg.locator(".show #ts-voucher-admin")
        app.locator("input[name=pw]").fill("sai"); app.locator("button[type=submit]").click(); pg.wait_for_timeout(400)
        assert "Mật khẩu không đúng" in app.inner_text()
        app.locator("input[name=pw]").fill("pw"); app.locator("button[type=submit]").click(); pg.wait_for_timeout(600)
        t = app.inner_text()
        assert "Tết 2027" in t and "Livestream TikTok" in t and "Chưa nhập đường dẫn" in t, t
        assert "Hết mã" in t, "kênh billboard đủ hạn mức"
        assert "Kho còn thiếu" not in t   # còn 1 mã cho TikTok
        pg.screenshot(path="/tmp/vadmin_campaigns.png", full_page=True)
        # Cài đặt
        app.locator("[data-tab=settings]").click()
        app.locator("[data-url]").fill("https://thestreet.vn/nhan-voucher?x=1"); app.locator("[data-save]").click(); pg.wait_for_timeout(400)
        assert S["pageUrl"] == "https://thestreet.vn/nhan-voucher"
        # Thêm chiến dịch
        app.locator("[data-tab=campaigns]").click()
        app.locator('[data-act="new-c"]').click()
        m = pg.locator(".modal")
        m.locator("input[name=code]").fill("he27"); m.locator("input[name=name]").fill("Hè 2027")
        m.locator("textarea[name=offer]").fill("Tặng 1 ly nước")
        m.locator("[data-ok]").click(); pg.wait_for_timeout(500)
        sv = [c for c in S["calls"] if c["action"] == "admin.campaigns.save"][-1]["campaign"]
        assert sv["code"] == "HE27" and sv["active"] is True and sv["offer"] == "Tặng 1 ly nước", sv
        assert pg.locator(".modal").count() == 0
        card = app.locator('.camp[data-c="HE27"]')
        assert "Kho còn thiếu" not in card.inner_text()
        # Thêm kênh: mã tự gợi ý từ tên
        card.locator('[data-act="new-k"]').click()
        m = pg.locator(".modal")
        m.locator("input[name=name]").fill("Bảng điện tử tòa nhà")
        assert m.locator("input[name=code]").input_value() == "bang-dien-tu-toa-nha"
        m.locator("input[name=quota]").fill("200"); m.locator("[data-ok]").click(); pg.wait_for_timeout(500)
        ch = [c for c in S["calls"] if c["action"] == "admin.channels.save"][-1]
        assert ch["campaign"] == "HE27" and ch["channel"]["quota"] == 200, ch
        assert "Kho còn thiếu 200" in card.inner_text(), card.inner_text()
        # Nhập mã: bỏ dòng tiêu đề, phát hiện mã lặp
        card.locator('[data-act="import"]').click()
        m = pg.locator(".modal")
        m.locator("[data-text]").fill("Mã voucher\nHE-001\nHE-002\nhe-001")
        assert "bị lặp" in m.inner_text()
        m.locator("[data-ok]").click(); pg.wait_for_timeout(200)
        assert not [c for c in S["calls"] if c["action"] == "admin.codes.import"], "có mã lặp thì không gửi"
        m.locator("[data-text]").fill("Mã voucher\nHE-001\nHE-002")
        assert "2 mã" in m.inner_text()
        m.locator("[data-ok]").click(); pg.wait_for_timeout(500)
        assert [c for c in S["calls"] if c["action"] == "admin.codes.import"][-1]["codes"] == ["HE-001", "HE-002"]
        # Link + QR
        card.locator('tr[data-k] [data-act="qr"]').click(); pg.wait_for_timeout(500)
        m = pg.locator(".modal")
        assert "https://thestreet.vn/nhan-voucher?c=HE27&k=bang-dien-tu-toa-nha" in m.inner_text(), m.inner_text()
        assert m.locator("img").get_attribute("src").startswith("data:image/png")
        m.locator("[data-close]").first.click()
        # Khách đã nhận: chữ có thẻ HTML được hiển thị an toàn
        app.locator('.camp[data-c="TET27"] [data-act="claims-c"]').click(); pg.wait_for_timeout(600)
        t = app.inner_text()
        assert "Nguyễn <b>An</b>" in t and "0901234567" in t and "2 khách" in t, t
        app.locator('[data-f="channel"]').select_option("billboard"); pg.wait_for_timeout(200)
        assert "1 khách" in app.inner_text()
        app.locator('[data-f="q"]').fill("không có ai"); pg.wait_for_timeout(200)
        assert "0 khách" in app.inner_text()
        if os.environ.get("XLSX_LOCAL") or os.environ.get("CI"):
            app.locator('[data-f="q"]').fill("")
            with pg.expect_download() as dl: app.locator('[data-act="export"]').click()
            assert dl.value.suggested_filename == "Voucher-TET27.xlsx"
        app.locator("[data-tab=log]").click(); pg.wait_for_timeout(400)
        assert "1000 mã" in app.inner_text()
        pg.screenshot(path="/tmp/vadmin_log.png", full_page=True)
        app.locator('[data-act="logout"]').click(); pg.wait_for_timeout(300)
        assert app.locator("input[name=pw]").count() == 1
        pg.close()
        browser.close()
    if errors: print("Lỗi JS:", errors); sys.exit(1)
    print("✅ Giao diện voucher: tất cả kiểm thử đều qua")

main()
