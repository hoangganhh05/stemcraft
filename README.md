# Stemcraft

Dự án tách vocal/instrumental chạy local trên Windows. Đang triển khai
**EPIC-04 — Frontend React** (27/10/2026), triển khai ở `feature/frontend`
và gộp local vào `develop`. Giao diện local kết nối backend Epic 3.

## Trạng thái

- Epic 1: hoàn tất nền tảng trên máy hiện tại; clean venv/Node install đã kiểm tra.
- Epic 2: chốt Mel Viperx 1143, segment 801/overlap 4, CPU FP32/2 threads.
  Người dùng chấp nhận mẫu đã nghe và miễn benchmark mở rộng.
- Epic 3: có Express API, MySQL/Prisma migration, upload/FFprobe, queue,
  Python worker, status, token, Range preview/download, cancel và cleanup.
  8 API tests, 3 worker tests và một job AI thật qua API đều đạt.
  Xem [báo cáo Epic 3](docs/reports/epic-03-backend.md).
- Epic 4: có giao diện upload → xử lý → nghe/tải WAV; xem
  [báo cáo frontend](docs/reports/epic-04-frontend.md).

## Mở giao diện

Chạy backend như bên dưới, rồi mở terminal thứ hai:

```powershell
npm.cmd run dev:frontend
```

Mở **http://127.0.0.1:5173**. [Hướng dẫn frontend](frontend/README.md).
Build: `npm.cmd run build:frontend`; kiểm tra UI: `npm.cmd run test:frontend`.

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

## Regression Epic 5

```powershell
npm.cmd run test:qa
```

Chạy check, API/MySQL fixture, supervisor, xác thực WAV, UI và build tuần tự;
không nạp model. Test dùng database/storage/lock riêng, không cần tắt server dev.
Báo cáo: [Epic 5](docs/reports/epic-05-quality-security.md).
So sánh CPU/GPU chưa hoàn tất vì máy hiện tại không có CUDA.

## Chạy local và kiểm tra phát hành

```powershell
npm.cmd run doctor
npm.cmd run dev
```

`dev` chạy frontend/backend cùng terminal; Ctrl+C dừng hai server do lệnh tạo.
Nếu đã chạy hai server riêng, dừng terminal cũ trước. Hướng dẫn cài máy mới và
troubleshooting: [Setup Windows](docs/SETUP.md).

```powershell
npm.cmd run test:release
npm.cmd run audit:release
npm.cmd run release:check
```

[Trạng thái Epic 6](docs/reports/epic-06-local-release.md): chuẩn bị RC local,
chưa nghiệm thu toàn bộ, **NO-GO public**. Script release:check không deploy/tag;
exit code 0 không đồng nghĩa quyết định public GO.

## Thử nghiệm chế độ Nhanh — Epic 7

`npm.cmd run plan:fast` chỉ tính số cửa sổ; `npm.cmd run experiment:fast`
thử cùng model/context 8 giây với overlap 2 khi đủ RAM. Chưa mở lựa chọn này
trên giao diện và chưa có số đo tăng tốc được nghiệm thu.
Xem [Epic 7](docs/reports/epic-07-fast-mode.md).
