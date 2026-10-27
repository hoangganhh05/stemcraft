# EPIC-04 — Frontend React

Ngày 27/10/2026 (Asia/Saigon). Nhánh `feature/frontend`, tạo từ `develop`.
Sau kiểm tra, lưu commit feature và gộp local vào `develop`; chưa push thay đổi Epic 4.
Phạm vi: ứng dụng local nối backend Epic 3; không triển khai hosting public.

| Task | Trạng thái | Bàn giao |
|---|---|---|
| FE-01 | DONE | React/Vite/Tailwind, layout phòng thu tông sáng/tím, SVG icon, build production |
| FE-02 | DONE | File picker, drag/drop, format/size/duration validation, nghe nguồn trước upload |
| FE-03 | DONE | Polling tiến độ thật, backoff, khôi phục sau reload, hủy tác vụ |
| FE-04 | DONE | 3 player bản gốc/vocal/instrumental; play/pause/seek, không phát chồng |
| FE-05 | DONE | Download WAV xác thực, lỗi/expired/cancelled/empty/offline states |
| FE-06 | DONE trên các viewport đã kiểm tra | Responsive, keyboard/skip link/focus, reduced motion, axe checks |
| FE-07 | DEFERRED (P1) | Không mở rộng A/B model trong MVP P0 này |

## Kiểm tra

- `npm.cmd run check`: lint, format, foundation và model/profile validation.
- `npm.cmd run build:frontend`: build Vite production.
- `npm.cmd run test:frontend`: 4/4 browser tests Edge headless PASS.
  Dùng fixture API/WAV tổng hợp, không phải AI inference.
- `npm.cmd run test:backend`: 8/8 PASS, MySQL/FFprobe thật, worker giả lập;
  có thêm kiểm tra Range/type của bản gốc.
- Kiểm tra live real-backend tại 1280, 768, 375 px ghi riêng trong
  `epic-04-live.json`; ảnh trong `.cache/playwright/live-*.png`.

**Live QA: PASS** ở cả 1280/768/375 px: không tràn ngang, không có lỗi
axe WCAG 2 A/AA và 2.1 AA được phát hiện trên màn hình đã kiểm tra,
không có page error; health/limits lấy từ backend thật. Chọn tệp trên mobile
đạt, số job AI gửi trong lượt QA này là 0. Đây không phải chứng nhận toàn diện
mọi trình duyệt hoặc accessibility thủ công với screen reader.

Không chạy thêm benchmark audio hoặc model trong Epic 4. Luồng AI thật đã
được kiểm chứng riêng ở Epic 3; browser tests không tự chứng minh chất lượng AI.

## Thay đổi API cần cho giao diện

Health bổ sung giới hạn runtime: maxUploadBytes/maxDurationSeconds/ttlHours.
Preview hỗ trợ `stem=original`, cùng token/TTL/path checks và Range; MIME xác
định bằng header đã probe. Không hỗ trợ download stem tùy ý hoặc mở static storage.
Pipeline AI, checkpoint và cấu hình 8 giây được giữ nguyên.

## Streaming và các lỗi đã sửa

Audio native đi qua Service Worker để gắn Bearer header; URL không chứa token.
Không buffer toàn bộ WAV trong JavaScript hoặc cache audio. Tải file dựa vào
Content-Disposition; thuộc tính anchor.download từng khiến Chromium bypass
worker và tải HTML thay vì WAV. Đã sửa, test xác nhận RIFF/WAVE và đúng độ dài
176444 bytes của fixture 1 giây, không chỉ kiểm tra tên file.

Hai chỗ tương phản chưa đạt đã được sửa theo axe. Test ignore `.env.example`
cũng cần thêm `--no-index` sau khi repository có commit (file đã được Git theo dõi).

## Chạy và giới hạn

Xem [frontend/README.md](../../frontend/README.md). Frontend cổng 5173,
backend cổng 3000; cả hai bind loopback. Token chỉ dùng trong phiên tab;
chưa có history/account hoặc khôi phục bản nhạc local sau khi đóng trình duyệt.
Bản gốc của job còn hạn vẫn được nghe từ backend khi reload.
Giấy phép weights còn mở; chưa có release public, chưa load-test nhiều người dùng.
