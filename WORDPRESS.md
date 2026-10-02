# Đoạn mã nhúng vào WordPress

Mỗi trang chỉ cần dán **một lần** vào widget **HTML** của Elementor (hoặc khối **HTML tùy chỉnh**).
Sau này sửa code thì chỉ đẩy lên GitHub — **không cần sửa WordPress nữa**.

> Đoạn mã không chứa ký tự `&`, `<` trong JavaScript nên WordPress không làm hỏng được.

## Trang quản trị

```html
<div id="ts-admin-app" style="min-height:60vh;padding:40px 16px;text-align:center;color:#888;font-family:sans-serif">⏳ Đang tải trang quản trị...</div>
<script src="https://thestreet-admin.github.io/thestreet-web/admin/admin.js" data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false" nowprocket onerror="this.previousElementSibling.textContent='⚠️ Không tải được trang quản trị. Kiểm tra mạng, tắt trình chặn quảng cáo rồi tải lại trang.'"></script>
```

## Trang thi (nhân viên)

```html
<div id="the-street-quiz-app"><div style="max-width:440px;margin:40px auto;padding:30px;text-align:center;color:#888;font-family:sans-serif">⏳ Đang tải bài thi...</div></div>
<script src="https://thestreet-admin.github.io/thestreet-web/quiz/quiz.js" data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false" nowprocket onerror="this.previousElementSibling.textContent='⚠️ Không tải được bài thi. Kiểm tra mạng rồi tải lại trang.'"></script>
```

## Lưu ý
- GitHub Pages lưu bộ nhớ đệm khoảng 10 phút: sau khi đẩy code mới, chờ vài phút rồi tải lại trang (Ctrl+F5).
- Nếu site dùng plugin cache (LiteSpeed, WP Rocket...), các thuộc tính `data-no-optimize`, `nowprocket`... đã báo plugin bỏ qua đoạn mã này.
- Đoạn nhúng trang thi phải giữ `<div>` và `<script>` **trong cùng một widget** (trang thi tìm khung hiển thị nằm cạnh thẻ script).
