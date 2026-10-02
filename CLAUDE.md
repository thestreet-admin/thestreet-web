# THE STREET — Mã giao diện website thi tăng cấp (repo CÔNG KHAI)

## Hệ thống gồm 3 phần
| Phần | Ở đâu | Repo |
|---|---|---|
| Trang thi (nhân viên) + Trang quản trị | GitHub Pages, nhúng vào WordPress/Elementor bằng 2 dòng | **repo này** (`thestreet-web`, công khai) |
| Server API | Google Apps Script (web app `/exec`) | `thestreet-appscript` (riêng tư) |
| Database | Google Sheet (tab CauHoi, KyThi, LuotThi, KetQuaThi) | không nằm trong repo |

URL công khai: `https://thestreet-admin.github.io/thestreet-web/admin/admin.js` và `.../quiz/quiz.js`.
Đẩy lên nhánh `main` → GitHub Pages đăng bản mới sau ~1 phút; đoạn nhúng thêm `?v=Date.now()` nên trình duyệt luôn lấy bản mới (file CSS dùng cùng mã `?v`). **Không cần sửa WordPress.**

## Cấu trúc
- `admin/admin.js`, `admin/admin.css` — trang quản trị (đăng nhập bằng tên + mật khẩu; Quản lý thấy 6 tab: Tổng quan, Bài thi & Chấm điểm, Ngân hàng đề, Đợt thi, Tài khoản, Nhật ký; Người chấm chỉ thấy tab Bài thi & Chấm điểm).
- `quiz/quiz.js`, `quiz/quiz.css` — trang thi.
- `WORDPRESS.md` — đoạn nhúng dán vào widget HTML của Elementor (đã dán, hiếm khi đổi).
- `preview/` — mở thử trên máy (gọi API thật).
- `tests/ui_test.py` — kiểm thử giao diện trong Chromium, API giả lập. **Chạy sau mỗi thay đổi.**

## Quy tắc BẮT BUỘC (bài học từ lỗi thật)
1. **Repo công khai: KHÔNG đưa bí mật vào đây** — không ID Google Sheet, không mật khẩu, không đáp án câu hỏi. Đáp án nằm trong Sheet, server tự chấm.
2. **Không bao giờ hiển thị/link tới Google Sheet** trong trang quản trị (chủ sở hữu yêu cầu người quản trị không được vào database).
3. **Elementor dựng widget 2 lần** (bản máy tính + điện thoại, 1 bản ẩn, trùng id). Không dùng `document.getElementById` để chọn khung gốc:
   - admin.js: chọn khung đang HIỂN THỊ (`pickRoot`/`isVisible`), theo dõi mỗi giây và chuyển khung khi cần; chặn chạy 2 lần bằng `window.__tsAdminStarted`.
   - quiz.js: chọn khung nằm cạnh thẻ script (`document.currentScript.parentNode`).
4. **WordPress đổi `&` thành `&#038;`** nếu mã nằm trong nội dung trang → mã JS phải nằm trong file .js. Đoạn JS nạp file trong WORDPRESS.md phải viết trên 1 dòng, không chứa `&`, `<`, `>`. File .js được chèn động nên `document.currentScript` vẫn dùng được trong admin.js/quiz.js.
5. Mọi selector CSS của trang quản trị bắt đầu bằng `#ts-admin-app` để không phá theme WordPress.
6. Luôn `esc()` dữ liệu trước khi chèn vào `innerHTML` (nội dung câu hỏi, câu trả lời của nhân viên...).
7. Gọi API bằng `fetch(POST, Content-Type: text/plain)` để không bị chặn CORS và đọc được kết quả; không dùng `mode: "no-cors"` (sẽ không biết lưu thành công hay thất bại).
8. Thao tác trên trang quản trị nên cập nhật giao diện ngay (lạc quan) rồi lưu ngầm; lỗi thì hoàn tác và giữ lại dữ liệu người dùng đã nhập.
9. Viết giao diện và thông báo bằng **tiếng Việt có dấu**.

## API (Apps Script) — các action
Trang thi: `GET` (danh sách đợt thi đang mở), `start`, `submit`.
Quản trị (cần `token` từ `admin.login {username, password}`; tên `admin` hoặc để trống = quản trị chính): `admin.bootstrap` (trả kèm `me` = người đang đăng nhập), `admin.bank.list|save|toggle|delete`, `admin.periods.save|delete`,
`admin.results.list|get|grade|reset|release`, `admin.bank.import`, `admin.reports.stats|export|pdf`, `admin.accounts.list|save|delete`, `admin.account.password`, `admin.log.list`, `admin.logout`.
- `admin.results.list {voided: true}` = bài đã hủy khi cho thi lại (mã `huy:…`, chỉ xem/PDF). `admin.results.reset` gửi kèm `reason`.
- `admin.results.get` trả `guides` (đáp án mẫu theo mã câu tự luận), `version`, `editing` (người khác đang mở bài). `admin.results.grade` gửi `expectVersion`; lỗi `CONFLICT` → hỏi người dùng, đồng ý thì gửi lại với `force: true`. Đóng modal chấm → `admin.results.release`.
- Nhập Excel ngân hàng đề đọc file ở trình duyệt (thư viện xlsx từ CDN; file .csv đọc dạng chữ UTF-8), kiểm tra từng dòng, có lỗi thì không gửi. Kiểm thử chạy offline: đặt `XLSX_LOCAL=<đường dẫn xlsx.full.min.js>`.
Người chấm gọi chức năng khác sẽ nhận lỗi `FORBIDDEN` → giao diện ẩn luôn các tab/nút đó (`isMgr()`). Tên người chấm: tài khoản riêng lấy theo tài khoản, chỉ quản trị chính mới gõ tay (`isMaster()`).
Các thao tác ngân hàng đề trả kèm `bank` + `bankIssues` để không phải gọi lại `admin.bootstrap`.
Khi thêm action mới: sửa cả repo `thestreet-appscript` và bổ sung giả lập trong `tests/ui_test.py`.

## Kiểm thử
```bash
pip install playwright && python -m playwright install chromium
python tests/ui_test.py
```
GitHub Actions tự chạy kiểm thử này mỗi lần đẩy code (`.github/workflows/test.yml`).
