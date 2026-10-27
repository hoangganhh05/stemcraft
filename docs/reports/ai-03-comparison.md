# AI-03 — Mel-RoFormer và đối chiếu smoke test

Ngày 26/10/2026. Kết quả kỹ thuật: PASS. Chưa có điểm nghe mù.

## Cùng input và cấu hình runtime

Cùng WAV 25 giây từ đoạn 30–55 giây của file người dùng chỉ định.
Hash input trong hai report trùng nhau. Máy i5-6440HQ, RAM 7.9 GiB,
PyTorch 2.14.1+cpu, audio-separator 0.47.1; FP32, 2 CPU threads,
segment_size=64, override=true, batch_size=1, overlap=1, normalization=0.9.
Hash inference config giống nhau; YAML kiến trúc riêng từng model được lưu hash.

| Checkpoint | Tổng thời gian | Peak RSS cây tiến trình | Kết quả kỹ thuật |
|---|---:|---:|---|
| BS-RoFormer Viperx 1297 | 472.67 giây | 1483.39 MiB | PASS |
| Mel-RoFormer Viperx 1143 | 457.83 giây | 2134.33 MiB | PASS |

Tổng thời gian gồm import/nạp model, xử lý và kiểm tra audio. Log thư viện
ghi Mel separation khoảng 6 phút 50 giây. Hai lần chạy khác thời điểm và
trạng thái cache/tải máy; đây là số đo một mẫu, không kết luận model nhanh
hơn một cách ổn định. RSS được lấy mẫu mỗi 0.5 giây, không phải tổng commit
memory và không đo VRAM CUDA.

Mel xuất đủ vocal/instrumental: PCM 16-bit, 44.1 kHz, stereo, đúng 25 giây.
Đã đọc toàn bộ audio để kiểm tra hữu hạn, không rỗng, peak <1; FFprobe kiểm
tra độc lập PASS. Peak vocal 0.829132, instrumental 0.900024. Chưa nghe đánh
giá bleed/artifacts/mất âm tiết và chưa khẳng định model nào có chất lượng tốt hơn.

Kết quả: `results/mel-roformer-smoke-cpu-overlap1/stems/`.
Số đo và hash: `docs/reports/mel-roformer-smoke.json`.
CSV: `docs/benchmark/runs.csv`.

## Bộ nghe A/B

Trong `results/blind-ab-smoke/` có `vocals_A.wav`, `vocals_B.wav`,
`original.wav`, `listen.m3u` và bảng điểm `scores.csv` còn trống.

Ánh xạ A/B được random và giữ riêng tại `mapping-private.json` trong results,
không đưa vào tài liệu này hoặc Git. Chỉ mở mapping sau khi chấm.
Hai vocal được cân RMS bằng gain tuyến tính giảm mức, xuất PCM 24-bit;
không denoise, nén dynamics, resample hoặc thay đổi thời lượng.
Đây là cân RMS, không phải LUFS hay bảo đảm độ lớn cảm nhận bằng nhau.

`ai-worker/verify_blind_ab.py` PASS: sample rate/shape đúng, không clipping,
gain-only trong sai số lượng tử PCM 24-bit, RMS chênh <1e-7, hash các WAV
vocal gốc và đoạn original không đổi. Không đọc to/hiển thị mapping khi kiểm tra.

Chấm 1–5 cho: tự nhiên, ít bleed, ít artifacts, giữ âm tiết, khả năng remix.
Giữ nguyên âm lượng trình phát khi đổi A/B. Ghi timestamp nếu phát hiện lỗi.

## Trạng thái kế hoạch

- AI-02 và AI-03: hoàn tất smoke test kỹ thuật trên cùng một mẫu.
- AI-01: nguồn/hash đã ghi, giấy phép riêng weights vẫn chưa xác minh.
  Hai model giữ `license_verified=false`, `available=false`.
- AI-04: mới có một mẫu smoke test, genre/vocal còn chưa phân loại.
- AI-05: có hai run hoàn tất nhưng chưa benchmark bộ 20 mẫu.
- AI-06: đã chuẩn bị bộ nghe, chưa có điểm.
- AI-07/cổng chọn model: chưa đạt. Chưa triển khai backend/UI.

Bước tiếp theo: chấm A/B, chuẩn bị bộ audio đa dạng có quyền xử lý,
tiếp tục xác minh giấy phép và benchmark trước khi quyết định model sản phẩm.

## Phản hồi nghe đầu tiên — 26/10/2026

Người dùng chọn vocal A tốt hơn B trên `smoke-001`, trước khi được tiết lộ
ánh xạ. Sau lựa chọn đã đối chiếu mapping: A = Mel-RoFormer Viperx 1143,
B = BS-RoFormer Viperx 1297. Chưa có điểm theo năm tiêu chí hoặc lý do chi tiết;
không tự suy ra điểm. Đã lưu lượt ưu tiên trong `docs/benchmark/preferences.csv`
và ghi chú trong `listening.csv`.

Mel-RoFormer là ứng viên ưu tiên cho các phép thử tiếp theo dựa trên phản hồi
mẫu này; chưa phải model chính được phê duyệt. Chưa vượt cổng 20 mẫu hoặc
hoàn tất xác minh giấy phép. Lượt nghe lại mẫu này sau khi tiết lộ mapping
không được coi là lượt blind độc lập.
