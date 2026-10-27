# Stemcraft

Dự án tách vocal/instrumental chạy local trên Windows. Đang triển khai
**EPIC-03 — Backend Node.js** đã hoàn tất phạm vi local được kiểm tra,
nhánh làm việc **develop** (27/10/2026).
Chưa xây giao diện React.

## Trạng thái

- Epic 1: hoàn tất nền tảng trên máy hiện tại; clean venv/Node install đã kiểm tra.
- Epic 2: chốt Mel Viperx 1143, segment 801/overlap 4, CPU FP32/2 threads.
  Người dùng chấp nhận mẫu đã nghe và miễn benchmark mở rộng.
- Epic 3: có Express API, MySQL/Prisma migration, upload/FFprobe, queue,
  Python worker, status, token, Range preview/download, cancel và cleanup.
  8 API tests, 3 worker tests và một job AI thật qua API đều đạt.
  Xem [báo cáo Epic 3](docs/reports/epic-03-backend.md).
- Epic 4: chưa bắt đầu frontend.

## Chạy backend

Điền `.env` theo `.env.example`; giữ thông tin đăng nhập ngoài Git.
Cần MySQL đang chạy và môi trường Python/model/FFmpeg đã chuẩn bị.

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:init
npm.cmd run db:migrate
npm.cmd run dev:backend
```

Health: `http://127.0.0.1:3000/api/v1/health`.
API và ví dụ upload/download: [backend/README.md](backend/README.md).
Mặc định chỉ bind loopback; máy CPU xử lý chậm, không có ETA bảo đảm.

## Kiểm tra kỹ thuật

```powershell
npm.cmd run check
npm.cmd run db:validate
npm.cmd run test:backend
npm.cmd run test:worker
```

Test backend dùng database MySQL test riêng và worker giả lập; test worker
kiểm tra giám sát tài nguyên, không đánh giá chất lượng nhạc. Lệnh opt-in
`npm.cmd run verify:backend-ai` chạy một job AI thật trên đoạn kỹ thuật 1 giây.
Không tự chạy tiếp bộ benchmark chất lượng hoặc bài Hoa sữa đang tạm dừng.

## Tài liệu

- [Kế hoạch dự án](KE_HOACH_DU_AN.md)
- [Setup Windows](docs/SETUP.md)
- [Epic 1](docs/reports/epic-01-foundation.md)
- [Bàn giao Epic 2](docs/reports/epic-02-ai-handoff.md)
- [Quyết định chọn AI](docs/ADR-002-local-ai-selection.md)
- [Cấu hình AI dùng cho phát triển local](config/ai-profile.json)
- [Sửa lỗi audio và bộ nghe 25 giây](docs/reports/audio-repair-long25.md)

Các report benchmark cũ trong docs/reports giữ làm lịch sử. Cấu hình cũ
segment 64/overlap 1 chỉ dùng tái hiện lỗi, không dùng cho backend.
Không commit audio, weights, output, cache, venv hoặc secrets.
Giấy phép checkpoint vẫn chưa xác minh; chưa sẵn sàng public/redistribution.
