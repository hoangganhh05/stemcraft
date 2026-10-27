# Kiểm tra toàn bài Hoa sữa — khởi chạy 27/10/2026

**Đang xử lý, chưa có kết quả hoàn chỉnh được nghiệm thu.** Trạng thái live
ở `results/full-hs-8s/progress.json` và `docs/reports/full-hs-8s-mel-roformer.json`.
Tài liệu này mô tả lần khởi chạy, không phải đồng hồ tiến độ trực tiếp.

## Đầu vào và cấu hình

- Người dùng yêu cầu kiểm tra toàn bài sau khi đánh giá bản 25 giây đã ổn.
- Nguồn giữ nguyên: `E:\Download\Hoa sữa - JustaTee.mp3`.
  SHA-256 `e091e6798addfa06ca68a89213a7e2e00fd3728ec9853a632ac11281c067d869`.
- FFmpeg decode/resample một lần thành `samples/hoa-sua-full.wav`:
  PCM16/stereo/44100 Hz, **297.36 giây / 13113576 frames**.
  SHA-256 `d6bafecf17b26977259fdb2663549577452be61ae5aa72d97df82359b9830f4c`.
- Cùng Mel-RoFormer Viperx 1143, FP32, 2 CPU threads, segment 801,
  overlap 4, batch 1, normalization threshold 0.9 trên toàn mix/stem.
- 146 cửa sổ, dùng nguyên phần demix/overlap-add của thư viện đã thử;
  không normalize từng đoạn, không gate/denoise hoặc đổi checkpoint.
- Một worker nền, ưu tiên CPU BelowNormal. Giới hạn 3500 MiB RSS nhánh AI,
  dừng nếu RAM khả dụng dưới 256 MiB; timeout 12 giờ mỗi lần chạy.
  Từ chối khởi chạy nếu dung lượng ổ đĩa khả dụng dưới 2 GiB.

## Tiếp tục khi gián đoạn

Đầu ra dự đoán từng cửa sổ được lưu float32 NPY lossless; không encode WAV
rồi dùng WAV làm input cho cửa sổ tiếp theo. Cache có hash input thực sự
sau normalization, hash output, shape, thời gian inference. Fingerprint
khóa input/YAML/weights/code thư viện/version/config và script runner.
Khi chạy lại, thư viện ghép lại cùng các tensor dự đoán, chỉ tính cửa sổ chưa
xong. Không trộn cache khi fingerprint thay đổi. Khóa OS ngăn hai worker trùng.

Ba unit test cache PASS: roundtrip bit-exact (cả stereo 2D thực tế và dạng
có stem axis), từ chối input khác/corruption, từ chối NaN. Kiểm tra lock
trên worker đang chạy PASS. Checkpoint thực đầu tiên đã đọc lại và xác minh
đúng float32 shape (2,352800).

Đã sửa giả định ban đầu của bộ đọc cache về số chiều. Chỉ đổi validator,
không đổi phần inference; AST so sánh xác nhận mọi phần khác nguyên vẹn.
Lưu code ban đầu và lịch sử cập nhật fingerprint trong `attempts/`. Tensor
dự đoán đã tính không bị sửa hoặc tính lại.

## Theo dõi và tiếp tục

Xem trạng thái, không khởi chạy thêm model:

```powershell
.\.venv\Scripts\python.exe ai-worker/full_track.py --status
```

Nếu tiến trình đã dừng và muốn tiếp tục:

```powershell
. .\scripts\activate-local.ps1
python ai-worker/full_track.py
```

Nếu còn worker, lệnh thứ hai báo `already active`, không chạy trùng.
Tiến trình nền tự tiếp tục tính mà không cần giữ một lệnh chờ trong chat.
Không hứa thông báo chat tự động khi xong.

## Khi hoàn tất

Script tự kiểm tra toàn bộ hai WAV bằng cách đọc từng block: frame count,
rate/channels, dữ liệu hữu hạn, không clipping/không silent toàn file;
kiểm tra không có frames bị bỏ trống và NaN/Inf trước encode.
Chỉ đổi `partial/` sang `stems/` sau khi toàn bộ kiểm tra đạt.

- `results/full-hs-8s/stems/`: vocal và instrumental toàn bài.
- `results/full-hs-8s/listen.m3u`: playlist nhạc gốc/vocal/instrumental.
- `results/full-hs-8s/review/`: vocal trích đầu/giữa/cuối, giữ gain của toàn bài.
- `output-metadata.json`, `chunk-audit.json`: hash, metadata và coverage.
- `docs/reports/full-track-hoa-sua.md`: chỉ tự tạo khi kiểm tra kỹ thuật đạt.

Chưa nghe trực tiếp, chưa tự chấm rõ lời/bleed/méo, không công bố SDR/SI-SDR.
Người dùng vẫn cần đánh giá bản đầy đủ. Không xây frontend/backend/API/DB.
