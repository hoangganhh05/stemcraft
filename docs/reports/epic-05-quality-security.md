# Epic 5 — Testing, Security, Performance

Ngày: 27/10/2026. Nhánh: `test/epic-05-quality-security` từ `develop`.

Phạm vi: regression kỹ thuật local. Không chạy lại benchmark chất lượng,
không thay model/cấu hình 801/4, không khởi động lại tác vụ nhạc của người dùng.

## Ma trận nghiệm thu

| Task | Trạng thái | Bằng chứng |
|---|---|---|
| QA-01 validation/status | PASS | API suite: cấu hình, trạng thái, tiến độ sai, không báo 100% trước publish |
| QA-02 upload → worker → download | PASS fixture | MySQL test riêng + FFprobe thật + runner fixture + Range/download. AI thật được xác minh trước tại `epic-03-real-ai.json`, không chạy lại lần này |
| QA-03 đầu vào hỏng/quá lớn/codec | PASS | File giả MP3, WAV quá dung lượng/thời lượng, WAV A-law không hỗ trợ, multipart thiếu file; không để file rác |
| QA-04 timeout/OOM/restart/cancel | PASS | API terminal state/cleanup/recovery, subprocess timeout/RSS/thiếu RAM toàn máy/owner mất, kill process tree |
| QA-05 token/path/rate limit | PASS | Token của job A không đọc/hủy/tải job B; thiếu/sai token, stem traversal, route storage/.env; upload thứ 7 và API thứ 181 bị 429 |
| QA-06 WAV | PASS fixture | Dùng chính validator của worker: metadata, frames/rate/channels, container, file rỗng/hỏng, silence, clipping, NaN/Inf |
| QA-07 CPU/GPU | BLOCKED một phần | Có số đo CPU thực đã lưu; chưa có GPU CUDA để đối chứng, không suy diễn tốc độ GPU |

Kết quả chạy hiện tại và thời gian từng suite được lưu tự động trong
[epic-05-regression.json](epic-05-regression.json).

## Thay đổi

- Bổ sung API regression và supervisor regression, test WAV tổng hợp.
- Tách `validate_output` từ inference để kiểm tra trực tiếp cùng logic xuất file;
  thêm xác nhận container WAV và frames > 0. Không đổi tín hiệu âm thanh.
- Scheduler cho phép truyền lock path riêng. Server thật vẫn mặc định dùng
  `.cache/backend-server.lock`; test dùng lock trong thư mục fixture riêng cùng
  database riêng, không tranh lock hoặc recover job của server đang chạy.
  Test vẫn chứng minh hai scheduler dùng cùng lock bị chặn.
- `npm.cmd run test:qa` chạy tuần tự check → API → supervisor → WAV → UI → build,
  dừng khi suite lỗi và xuất JSON PASS/FAIL. Không tải model, không chạy inference.

## Hiệu năng và hạn chế thực tế

Máy: i5-6440HQ, 4 logical processors, RAM 7.9 GiB, PyTorch CPU.
Nguồn cấu hình: [environment.json](environment.json), profile hiện tại
`mel-viperx1143-context8s-cpu`, FP32, 2 threads, batch 1, overlap 4.

| Đo thực đã có | Thời gian | Peak RSS | Kết quả |
|---|---:|---:|---|
| AI integration 1 giây | Worker 113.188 giây; toàn luồng 129.585 giây | 1821.21 MiB | PASS kỹ thuật |
| Hoa sữa 25 giây, 10 cửa sổ | 1469.594 giây | 1830.98 MiB | Output đã được người dùng nghe chấp nhận |
| Upload toàn bài vừa gặp lỗi | 393.328 giây tới khi dừng | 1637.69 MiB | MEMORY_LIMIT: RAM khả dụng tối thiểu 243.12 MiB |

Hai hàng đầu dùng lại số đo trước Epic 5, không phải lượt benchmark mới:
[epic-03-real-ai.json](epic-03-real-ai.json),
[repair-hs-context8s-long25-mel-roformer.json](repair-hs-context8s-long25-mel-roformer.json).
Hàng cuối đọc trực tiếp diagnostics local của lần người dùng chạy;
log chứa đường dẫn máy/audio được giữ ngoài Git trong storage/diagnostics.
Ngưỡng bảo vệ RAM toàn máy 256 MiB đã hoạt động; peak RSS thấp hơn 3500 MiB
không loại trừ thiếu RAM toàn máy. Không tắt guard để cố chạy tiếp.

Chưa có benchmark toàn bài hoàn thành hoặc so sánh CPU/GPU cùng input.
Không có cơ sở công bố tốc độ tương đương dịch vụ web. QA-07 chưa DONE;
Epic 5 chưa được đánh dấu hoàn tất toàn bộ. Chạy bộ fixture PASS không chứng
minh năng lực xử lý toàn bài trên máy RAM thấp hoặc giấy phép weights đã rõ.

## Chạy lại

```powershell
npm.cmd run test:qa
```

Cần MySQL local và môi trường hiện có; Windows cần cho phép tạo subprocess.
Playwright sử dụng Edge có sẵn, port fixture 3101/5174 phải trống.
Không cần dừng frontend/backend dev ở 5173/3000.
Các suite độc lập: `test:backend`, `test:worker`, `test:audio-output`,
`test:frontend`; `check` và `build:frontend`.
