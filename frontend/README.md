# Stemcraft — giao diện local

React 19 + Vite 8 + Tailwind 4. Giao diện tiếng Việt gồm upload, trạng thái
xử lý và nghe/tải bản gốc, vocal, instrumental. Chưa có đăng nhập hoặc lịch sử.

## Chạy

Từ thư mục gốc, cài dependency bằng `npm.cmd ci`. Mở hai terminal:

```powershell
# Terminal 1 — backend đã được setup MySQL/Python/model
npm.cmd run dev:backend
```

```powershell
# Terminal 2 — giao diện
npm.cmd run dev:frontend
```

Mở **http://127.0.0.1:5173**. Dùng Chrome hoặc Edge mới. Nếu báo chưa kết nối,
kiểm tra backend tại cổng 3000. Không tạo thêm server backend khi một server
đang chạy; dừng terminal cũ bằng Ctrl+C trước khi khởi động lại.

Vite proxy `/api` tới `http://127.0.0.1:3000`. Frontend lấy giới hạn dung lượng,
thời lượng và TTL từ health API. Bản build không chứa `.env` backend.

## Hành vi

- Chọn/kéo thả một MP3, WAV hoặc FLAC, kiểm tra size và duration nếu trình
  duyệt đọc được; backend vẫn xác thực nội dung bằng FFprobe.
- Phần trăm tải lên lấy từ XHR upload; tiến độ AI lấy từ số chunk hoàn tất
  mà API trả về. Không giả lập tiến độ theo thời gian, không hứa ETA.
- Polling nối tiếp, có backoff khi mất kết nối; không tự gửi lại POST upload.
- Id/token tác vụ được giữ trong sessionStorage của tab để reload khôi phục;
  không đặt token trong URL/log. Phiên chỉ giữ tác vụ hiện tại, chưa có history.
- Ba player native hỗ trợ play/pause/seek; phát một player sẽ dừng player khác.
  Bản gốc trước upload dùng Blob URL của file chọn, được revoke khi thay/xóa.
- Stem và bản gốc sau reload được phát qua Service Worker gắn Bearer header,
  giữ nguyên Range/If-Range. Response được stream, không đọc toàn WAV thành Blob.
  Worker không lưu audio hoặc token xuống cache/IndexedDB; token chỉ ở bộ nhớ,
  khi worker restart sẽ hỏi lại tab đang có phiên hợp lệ.
- Download dùng Content-Disposition của response đã xác thực. Không dùng
  thuộc tính anchor.download vì có thể bỏ qua Service Worker trên Chromium.
- Hủy, hết hạn, lỗi RAM/timeout, file lỗi và mất kết nối có trạng thái phục hồi.
  Tải stem cần tác vụ COMPLETED và chưa hết hạn; đổi bài sẽ bỏ phiên hiện tại
  trong tab, hãy tải kết quả cần giữ trước khi đổi.

Service Worker cần localhost/loopback hoặc HTTPS. Bản local chưa hỗ trợ base
path dưới thư mục con, chưa cấu hình hosting public hoặc xác minh license weights.
Không mở thư mục dist bằng file://.

## Build và kiểm tra

```powershell
npm.cmd run check
npm.cmd run build:frontend
npm.cmd run test:frontend
```

`test:frontend` dùng Edge đã cài trên Windows, frontend test ở 5174 và fixture
API ở 3101. Fixture tạo PCM WAV tổng hợp, không dùng MySQL/model, không tách
nhạc. Test kiểm tra upload, progress, player/seek, download đúng bytes WAV,
token header, reload, hủy, lỗi/hết hạn, keyboard, overflow và axe accessibility.

Ảnh QA ở `.cache/playwright/`. Chạy `node scripts/verify-frontend-live.mjs`
khi cả hai server thật đang mở để kiểm tra health/limits, bố cục 1280/768/375,
accessibility và file picker. Script này cần fixture WAV đã được UI test tạo;
không nhấn tách và không gửi job AI. Báo cáo tại `docs/reports/epic-04-live.json`.

```powershell
# Xem bản build local; dừng dev:frontend trước vì dùng cùng cổng 5173
npm.cmd run preview:frontend
```

FE-07 A/B so sánh model là P1, chưa triển khai. Không bật denoise hoặc thay
cấu hình AI đã được người dùng chấp nhận.
