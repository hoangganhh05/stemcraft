# Backend local — Epic 3

Express 5 + Prisma 6/MySQL 8 + Python worker. Nhánh làm việc: `develop`.
Có [giao diện React](../frontend/README.md) ở cổng 5173; API chỉ bind loopback trên máy hiện tại.

## Chạy

Từ thư mục gốc, cấu hình `.env` theo `.env.example`; URL MySQL phải percent-encode
ký tự đặc biệt. Không đưa thông tin đăng nhập vào Git hoặc log.

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:init
npm.cmd run db:migrate
npm.cmd run dev:backend
```

`db:init` chỉ tạo `vocal_studio_dev` ở MySQL local nếu chưa có, không drop database.
`db:migrate` dùng migration đã lưu; không dùng reset hoặc db push.
Đã có sẵn Python/model/FFmpeg theo hướng dẫn [setup](../docs/SETUP.md).
Startup kiểm tra binary FFmpeg/FFprobe và SHA-256 checkpoint/YAML; thiếu hoặc
sai model sẽ không nhận job. Không tự tải model hay đổi cấu hình AI.

## API

| Method | Endpoint | Đầu vào / kết quả |
|---|---|---|
| GET | `/api/v1/health` | 200 nếu DB truy cập được; 503 nếu không |
| GET | `/api/v1/models` | Model local, ghi rõ chưa xác minh giấy phép/public |
| POST | `/api/v1/jobs` | Multipart một field `file`; 202 + id + token chỉ trả lần tạo |
| GET | `/api/v1/jobs/:id` | Status, số chunk thực tế, progress, errorCode, expiry |
| GET | `/api/v1/jobs/:id/preview?stem=vocals` | WAV, hỗ trợ Range; instrumental cũng hợp lệ; original trả định dạng nguồn |
| GET | `/api/v1/jobs/:id/download?stem=instrumental` | WAV attachment |
| DELETE | `/api/v1/jobs/:id` | Hủy/xóa audio của riêng job, 202 |

Các route chứa `:id` cần `Authorization: Bearer <token>`. Không truyền token
trong URL. Sai token/id trả 404; chưa xong trả 409; hết hạn trả 410 khi tải.
File storage không được phục vụ như static directory.

Ví dụ PowerShell (terminal thứ hai):

```powershell
$taskJob = curl.exe -s -F 'file=@E:\Download\Hoa sữa - JustaTee.mp3' http://127.0.0.1:3000/api/v1/jobs | ConvertFrom-Json
$taskHeaders = @{ Authorization = "Bearer $($taskJob.token)" }
Invoke-RestMethod "http://127.0.0.1:3000/api/v1/jobs/$($taskJob.id)" -Headers $taskHeaders
# Sau khi COMPLETED:
Invoke-WebRequest "http://127.0.0.1:3000/api/v1/jobs/$($taskJob.id)/download?stem=vocals" -Headers $taskHeaders -OutFile vocals.wav
```

Giữ id/token để truy cập sau; không log token khi chia sẻ ảnh/lệnh. Không ghi
đè file tải về đã có nếu muốn giữ bản cũ.

## Giới hạn và vận hành

- Một server cho dự án (khóa `.cache/backend-server.lock`), một AI worker
  (khóa OS `.cache/backend-inference.lock`); hàng đợi MySQL lưu bền.
- Mặc định nhận tối đa 50 MiB, 600 giây, MP3/WAV/FLAC, mono hoặc stereo.
  FFprobe kiểm tra nội dung/codec; không tin extension/MIME của client.
- 600 giây là giới hạn đầu vào, không phải độ dài đã nghiệm thu chất lượng.
  Máy CPU xử lý chậm; 25 giây từng mất khoảng 24 phút 30 giây. Không hứa ETA.
- Model Mel Viperx 1143, CPU FP32/2 threads, segment 801/overlap 4/batch 1.
  Không giảm segment để tăng tốc; không gate/denoise/dereverb.
- Worker giải mã thật sang stereo PCM 44.1 kHz; progress tính từ số cửa sổ
  model đã hoàn thành, 100% chỉ sau kiểm tra cả hai WAV và publish atomically.
- Timeout tối đa mặc định 12 giờ; giới hạn RSS cây tiến trình 3500 MiB;
  dừng khi RAM khả dụng dưới 256 MiB. Không tự đóng ứng dụng khác.
- Hủy/timeout dừng cây tiến trình. Worker theo dõi PID Node để không tiếp tục
  chạy khi server mất đột ngột. Restart giữ job QUEUED và đánh dấu PROCESSING
  cũ FAILED/WORKER_INTERRUPTED; chưa hỗ trợ resume inference cho API job.
- Xóa audio lỗi/hủy; log chẩn đoán lỗi giới hạn được giữ riêng trong storage
  tới expiry. Dọn file theo TTL 24 giờ bằng timer và khi startup.
- Giới hạn request/upload, số job chờ và dung lượng đĩa. Không log token,
  mật khẩu, URL DB hoặc tên file gốc trong request logs. Chặn Origin ngoài local.
- Khởi động bằng terminal để Ctrl+C có thể dừng server và worker.

## Kiểm tra kỹ thuật

```powershell
npm.cmd run check
npm.cmd run db:validate
npm.cmd run test:backend
npm.cmd run test:worker
```

`test:backend` tạo database test tên ngẫu nhiên, deploy migration hai lần,
kiểm tra API với MySQL/FFprobe thật và worker giả lập; sau đó xóa đúng database
test vừa tạo. Không xóa database dev. Worker giả lập không chứng minh AI chạy.
`test:worker` thử timeout và RAM guard bằng subprocess ngủ, không load model.

`npm.cmd run verify:backend-ai` chủ động chạy một job AI thật trên đoạn 1 giây
từ sample sẵn có, có thể mất vài phút; là kiểm tra tích hợp, không phải đánh
giá chất lượng. Báo cáo tại `docs/reports/epic-03-real-ai.json`; attempt trước
được lưu riêng. Output ở thư mục chỉ rõ trong báo cáo nếu job thành công.

Public release chưa sẵn sàng: giấy phép weights còn mở; CORS/auth cho triển
khai public và load test nhiều người dùng ngoài phạm vi bản local hiện tại.
