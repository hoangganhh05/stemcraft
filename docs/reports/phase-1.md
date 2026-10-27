# Báo cáo chuẩn bị — 26/10/2026

## Đã làm

- Đọc kế hoạch, xác nhận workspace Windows có thể ghi.
- Tạo cấu trúc repository, ignore secrets/audio/weights và env mẫu.
- Tạo diagnostic Node/Python, registry chưa chọn model, biểu mẫu benchmark.
- Ghi ADR giữ cổng benchmark trước API/UI.
- `npm.cmd run check`: PASS (cú pháp Node diagnostic và invariant registry).

## Môi trường quan sát được

- Node v25.2.1; CPU Intel i5-6440HQ; 4 logical processors.
- RAM khoảng 7.9 GiB, còn trống khoảng 1.1 GiB lúc đo.
- PowerShell tìm thấy Node/npm/Git trong PATH.
- PowerShell không tìm thấy python/py/ffmpeg/ffprobe/nvidia-smi/mysql trong PATH.
  Điều này không chứng minh chúng chưa được cài ở vị trí khác.
- CIM bị Access denied; chưa xác minh GPU/VRAM.
- Node spawnSync trả EPERM cho các lệnh thăm dò, kể cả Git đã tìm thấy.
  Diagnostic chưa xác nhận dependencies; cần chạy lại ngoài sandbox.

## Chưa hoàn thành

Chưa chạy Python diagnostic hoặc kiểm tra cú pháp Python vì chưa có interpreter
khả dụng trong phiên. Chưa tạo venv, cài dependency, xác minh checkpoint/license,
tải model hoặc chạy audio. Chưa có benchmark hay quyết định chọn model.
RAM trống thấp là lý do cần đo smoke test trước khi chọn cấu hình inference.

Không đánh dấu toàn bộ FND-01/FND-03/FND-05 hoặc AI tasks DONE.
Chưa khởi tạo Git, cài tool hệ thống, chạy dịch vụ hay triển khai public.

## Cập nhật lần triển khai tiếp theo (cùng ngày)

Các mục dưới đây thay thế trạng thái tương ứng ở phần trước:

- Đã khởi tạo Git trên nhánh `chore/phase-1`, chưa commit/push.
- Cài Python 3.11.17 portable tại `.tools/python`, tạo `.venv` thành công.
- Cài audio-separator 0.47.1 cùng 59 dependency khác. Lưu phiên bản thực tế
  trong `ai-worker/requirements.lock.txt` (freeze Windows, chưa phải lock có hash).
- PyTorch import đạt: 2.14.1+cpu, CUDA false.
- `from audio_separator.separator import Separator`: PASS, phiên bản 0.47.1.
- Kiểm tra cú pháp toàn bộ script Python: PASS.
- Unit test inventory: PASS ngoài sandbox; bao gồm path traversal,
  SHA-256 sai, duration NaN và thiếu khai báo quyền sử dụng.
- Inventory rỗng: validator từ chối đúng, 0/20 mẫu.
- CIM ngoài sandbox ghi nhận Intel HD Graphics 530, AdapterRAM 1 GiB.
  Đây là GPU tích hợp, không phải CUDA VRAM. RAM tổng khoảng 7.9 GiB,
  RAM trống khoảng 927 MiB tại lần đo tiếp theo.
- `.tools`, `.cache`, `.venv`, `.env` và audio mẫu đều được Git ignore.

FFmpeg portable đang được tải trong lần cập nhật này; chỉ coi hoàn tất khi
có kết quả kiểm tra binary. Chưa tải checkpoint hoặc chạy inference.

## Kết quả hoàn tất cài môi trường

- FFmpeg/FFprobe 9.0.2 portable đã giải nén và chạy được.
- Gói từ `https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip`,
  SHA-256 `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`,
  khớp file `.sha256` của nhà cung cấp.
- Người dùng chỉ định MP3 trong E:\Download để thử. FFprobe đọc được audio
  MP3 stereo 44.1 kHz, thời lượng 323.474256 giây.
- Đã cắt đoạn 30–55 giây thành `samples/shen-hello-viet-nam-030-055.wav`,
  PCM 16-bit stereo 44.1 kHz, FFprobe xác nhận đúng 25 giây. Giữ nguyên gốc.
- SHA-256 mẫu ghi trong inventory; chưa nghe để phân loại genre/vocal.
  Đây là mẫu smoke test đầu tiên, chưa phải kết quả benchmark hợp lệ.
- Chưa có weights, output stem, số đo inference hay ADR chọn model.

## Cập nhật AI-02

Đã tải checkpoint và hoàn tất tách mẫu CPU thành hai WAV 25 giây.
Tổng 472.67 giây, peak RSS cây tiến trình 1483.39 MiB. Kiểm tra audio kỹ thuật
đạt; chưa nghe chấm chất lượng. Giấy phép weights vẫn chưa xác minh và chưa
chọn model sản phẩm. Báo cáo chi tiết: `ai-02-smoke-test.md`.

## Cập nhật AI-03

Mel-RoFormer Viperx 1143 đã xuất hai WAV trên cùng mẫu, tổng 457.83 giây,
peak RSS 2134.33 MiB. Đã tạo và kiểm tra bộ nghe A/B cân RMS, giữ WAV gốc.
Chưa chấm nghe/chưa chọn model. Chi tiết: `ai-03-comparison.md`.

## Mẫu thứ hai

Đã chạy cả hai model trên đoạn 25 giây của “Hoa sữa - JustaTee”, kiểm tra
bốn WAV và tạo bộ A/B riêng. Chi tiết: `smoke-002-hoa-sua.md`.
Mẫu 1 được người dùng ưu tiên vocal A (Mel); mẫu 2 chưa chấm. Chưa chốt model.

## Kiểm tra lại sau phản hồi giật/mất lời

Đã thực hiện thử nghiệm sửa pipeline và bàn giao WAV trước–sau. Xem
`audio-repair.md`; không dùng các PASS kỹ thuật cũ để coi chất lượng đã đạt.
Chờ người dùng đánh giá, chưa xây hệ thống.
