# Đoạn mã nhúng vào WordPress

Mỗi trang chỉ cần dán **một lần** vào widget **HTML** của Elementor (hoặc khối **HTML tùy chỉnh**).
Sau này sửa code thì chỉ đẩy lên GitHub — **không cần sửa WordPress nữa**. Thay đổi có hiệu lực khoảng **1 phút** sau khi đẩy lên
(thời gian GitHub Pages đăng bản mới), vì đoạn nhúng tự thêm mã thời gian `?v=...` để trình duyệt không dùng bản cũ trong bộ nhớ đệm.

> Phần JavaScript trong đoạn nhúng không chứa ký tự `&`, `<`, `>` và nằm trên 1 dòng nên WordPress không làm hỏng được.

## Trang quản trị

```html
<div id="ts-admin-app" style="min-height:60vh;padding:40px 16px;text-align:center;color:#888;font-family:sans-serif">⏳ Đang tải trang quản trị...</div>
<script data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false" nowprocket>(function(){var me=document.currentScript,s=document.createElement("script");s.src="https://thestreet-admin.github.io/thestreet-web/admin/admin.js?v="+Date.now();s.onerror=function(){me.previousElementSibling.textContent="⚠️ Không tải được trang quản trị. Kiểm tra mạng, tắt trình chặn quảng cáo rồi tải lại trang."};me.parentNode.insertBefore(s,me.nextSibling)})();</script>
```

## Trang thi (nhân viên)

```html
<div id="the-street-quiz-app"><div style="max-width:440px;margin:40px auto;padding:30px;text-align:center;color:#888;font-family:sans-serif">⏳ Đang tải bài thi...</div></div>
<script data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false" nowprocket>(function(){var me=document.currentScript,s=document.createElement("script");s.src="https://thestreet-admin.github.io/thestreet-web/quiz/quiz.js?v="+Date.now();s.onerror=function(){me.previousElementSibling.textContent="⚠️ Không tải được bài thi. Kiểm tra mạng rồi tải lại trang."};me.parentNode.insertBefore(s,me.nextSibling)})();</script>
```

## Lưu ý
- Giữ nguyên `<div>` và `<script>` **trong cùng một widget**, `<div>` đứng ngay trước `<script>`.
- Các thuộc tính `data-no-optimize`, `nowprocket`... báo plugin tối ưu (LiteSpeed, WP Rocket, Cloudflare) bỏ qua đoạn mã này.
- Xem tiến trình đăng bản mới: tab **Actions** của repo → *pages build and deployment* (xanh = đã lên).
