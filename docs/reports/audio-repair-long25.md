# Kiểm tra cấu hình 8 giây trên đoạn Hoa sữa 25 giây

Ngày: 27/10/2026. Trạng thái kỹ thuật: PASS. Chờ người dùng đánh giá nghe.
Chỉ thử nghiệm audio; chưa chạy toàn bài hoặc xây hệ thống.

## Thiết lập

Theo phản hồi người dùng, context8s liền mạch hơn context4s trên clip ngắn.
Lần này dùng lại toàn đoạn nguồn 45–70 giây của “Hoa sữa - JustaTee”:
`samples/hoa-sua-justatee-045-070.wav`, 25 s, stereo, 44100 Hz, PCM16,
1102500 frames. Hash khớp input của baseline cũ; không tạo thêm mẫu benchmark
độc lập hoặc sửa MP3 gốc.

Giữ Mel-RoFormer Viperx 1143, PyTorch CPU FP32/2 threads, segment=801,
override=true, overlap=4, batch=1, normalization threshold=0.9 trên toàn
mix/stem. Không gate/denoise/clean. Không đổi thư viện hoặc tải model mới.
Máy i5-6440HQ, RAM ~7.9 GiB, chưa sử dụng GPU.

Lệnh đã chạy:

```powershell
. .\scripts\activate-local.ps1
python ai-worker/repair_experiment.py --profile context8s --run-tag long25 --input samples/hoa-sua-justatee-045-070.wav
python ai-worker/repair_compare.py --long-sample --run-tag long25
```

Để tái chạy và giữ nguyên bộ hiện tại, thay cả hai tag bằng `long25-r2`
hoặc một tag mới. Runner từ chối ghi đè và chỉ nhận WAV stereo 44100 Hz
trong samples, dài 1–30 giây. Ba test mới về path, tag và từ chối WAV 31 s PASS.

## Kết quả thực thi

- Tổng thời gian đo 1469.594 s, khoảng **24 phút 30 giây**, bao gồm khởi tạo,
  inference và kiểm tra. Phần separation trong log ghi 23 phút 47 giây.
- Peak RSS nhánh tiến trình AI 1830.98 MiB (~1.79 GiB), lấy mẫu 0.5 s;
  không phải tổng commit memory. Không đo VRAM CUDA vì chạy CPU.
- 10 cửa sổ 8 giây, starts tính theo giây: 0, 2, 4, 6, 8, 10, 12, 14, 16, 17.
  Cửa sổ cuối dịch bám đuôi, không lặp nguyên cửa sổ trước.
- Từng cửa sổ vào/ra đủ 352800 frames; không NaN/Inf trước encode.
- Coverage min=1, max=5, **0 frames không được phủ**. Không có hụt mẫu.
- Đủ vocal và instrumental 25 s/stereo/44100 Hz/PCM16. Peak vocal 0.801758,
  instrumental 0.900024 (<1); không clipping. FFprobe xác minh độc lập.
- Chưa đủ cơ sở suy rộng thời gian xử lý toàn bài hoặc các máy khác.

Report/checkpoint/config/input hashes:
`repair-hs-context8s-long25-mel-roformer.json`. Trace và hash output:
`results/repair-hs-context8s-long25/chunk-audit.json` / `output-metadata.json`.

## Kiểm tra đường nối

Cùng phép đo đã mô tả trong `audio-repair.md`: median sample jump chia local
RMS, không phải SDR/SI-SDR, độ rõ lời hoặc phần trăm cải thiện.

| Lưới đánh giá | Tín hiệu | Tại lưới nối | Vị trí đối chứng |
|---|---|---:|---:|
| Cũ, mỗi 0.63 s | Vocal trước | 0.894613 | 0.120657 |
| Cũ, mỗi 0.63 s | Vocal sau | 0.160098 | 0.150740 |
| Mới, starts cửa sổ | Nhạc gốc | 0.156685 | 0.209703 |
| Mới, starts cửa sổ | Vocal trước | 0.158228 | 0.108989 |
| Mới, starts cửa sổ | Vocal sau | 0.118431 | 0.182849 |

Phép đo xác nhận pattern bước nhảy nổi bật ở lưới cũ không còn trên median
của bản mới. Median tại lưới mới không cao hơn vị trí đối chứng. Điều này
không chứng minh mọi điểm đều không giật hoặc model đã giữ đủ âm tiết.
Đối chứng tránh trùng một boundary khác ở đuôi. JSON đầy đủ tại
`repair-comparison-long25.json`.

## Bộ nghe bàn giao

`results/repair-listening-long25/`:

- `01_original.wav`: đoạn nhạc nguồn 25 giây.
- `02_before_original.wav`: vocal baseline 0.63 giây/no overlap, giữ bản raw gốc.
- `03_after_context8s.wav`: vocal context8s/overlap4, cùng đúng đoạn nhạc.
- `listen.m3u`, `manifest.json`, `ratings.csv` còn trống.

Hai vocal có RMS cùng khoảng 0.123605834. Bản trước gain=1; bản sau gain
0.9719453031, chỉ giảm tuyến tính để cân mức, không tăng volume, không nén
dynamics, không denoise. Kiểm tra sai số PCM24 trong 1 LSB và RMS khớp 1e-7
PASS. Export nghe PCM24 để giảm sai số khi nhân gain, không phục hồi độ phân
giải nguồn. FFprobe xác nhận cả ba WAV dài đúng 25 s và stereo/44.1 kHz.
RMS chỉ xấp xỉ mức nghe, không phải cân LUFS.

Mình không nghe trực tiếp trong phiên này. Chưa tự chấm độ rõ lời, lọt nhạc,
méo/rung hoặc nốt kéo dài; cũng chưa khẳng định clip chứa đủ mọi tình huống
âm nhạc. Người dùng nghe và chỉ timestamp còn vấn đề để thử tiếp.

Chưa nghiệm thu chất lượng, chưa chạy toàn bài hoặc phát triển frontend,
backend/API/DB. Giấy phép weights vẫn chưa xác minh cho sản phẩm công khai.

## Phản hồi người dùng — 27/10/2026

Sau khi nhận bộ trước–sau 25 giây, người dùng đánh giá “ổn r”. Ghi nhận
bản thử này đáp ứng đánh giá nghe tổng quát của người dùng; không suy ra
điểm riêng về rõ lời/bleed/méo hoặc mức đạt của toàn bài/các bài khác.
Lưu tại `docs/benchmark/quality-feedback.csv`.

Giữ Mel-RoFormer Viperx 1143, segment=801, overlap=4, FP32/2 CPU threads
làm cấu hình thử nghiệm hiện tại. Bước tiếp phù hợp là kiểm tra toàn bài;
chưa thực hiện và chưa có yêu cầu bắt đầu xây hệ thống.
