# Mẫu 2 — Hoa sữa / JustaTee

Ngày: 26/10/2026. Kỹ thuật: PASS. Chưa có đánh giá nghe mẫu này.

Người dùng chỉ định `E:\Download\Hoa sữa - JustaTee.mp3`. File MP3 dài
297.36 giây, stereo 48 kHz. Giữ nguyên gốc, trích đoạn 45–70 giây thành
PCM 16-bit stereo 44.1 kHz, đúng 25 giây. Resample cùng một lần trước khi
đưa WAV chung cho hai model. Hash input ghi trong inventory và hai report.
Chưa tự phân loại genre, vocal hoặc đặc điểm âm nhạc khi chưa nghe xác nhận.

## Hai lần chạy tuần tự

Cùng CPU i5-6440HQ, FP32, 2 threads, segment=64, override=true, batch=1,
overlap=1, normalization=0.9 và giới hạn RSS 3500 MiB. Không hậu xử lý clean.

| Model | Tổng thời gian | Peak RSS cây tiến trình | Timeout tối đa |
|---|---:|---:|---:|
| Mel-RoFormer Viperx 1143 | 525.03 giây | 2028.95 MiB | 900 giây |
| BS-RoFormer Viperx 1297 | 767.16 giây | 1569.52 MiB | 1200 giây |

RSS lấy mẫu 0.5 giây, không phải tổng commit memory. Tổng thời gian gồm
import/nạp model, inference và kiểm tra output. BS timeout tăng vì CPU dao
động; không đổi cấu hình inference. Tại một lần đo trong run BS, CPU hệ thống
100%, RAM khả dụng 595 MiB. Người dùng chọn giữ nguyên và tiếp tục chờ.
Không kết luận khác biệt tốc độ là đặc tính cố định của model vì tải máy và
cache giữa các lần khác nhau.

Đủ bốn WAV gốc: PCM 16-bit, stereo, 44100 Hz, đúng 25 giây. Đã kiểm tra
không rỗng, dữ liệu hữu hạn, peak <1; FFprobe độc lập xác nhận metadata.

| Stem | Peak |
|---|---:|
| Mel vocals | 0.792114 |
| Mel instrumental | 0.900024 |
| BS vocals | 0.789825 |
| BS instrumental | 0.900024 |

Report/hash: `smoke-002-mel-roformer.json`, `smoke-002-bs-roformer.json`.
Kết quả: `results/smoke-002-mel-cpu-overlap1/` và
`results/smoke-002-bs-cpu-overlap1/`. CSV run đã cập nhật, không ghi đè mẫu 1.

## Bộ nghe

`results/blind-ab-smoke-002/` chứa vocal A/B, original, playlist, bảng điểm
trống. Ánh xạ random riêng cho mẫu này, không suy từ A/B ở mẫu 1. Mapping
giữ trong results, không hiển thị trong báo cáo này. Chỉ mở sau khi chấm.

Hai vocal cân RMS bằng gain giảm mức, xuất PCM 24-bit; không denoise, nén
dynamics hoặc resample thêm. Đây không phải cân LUFS. Script kiểm tra PASS:
gain-only trong sai số PCM 24-bit, RMS chênh <1e-7, đúng shape/sample rate,
không clipping, hash WAV gốc và đoạn original không đổi.

## Công cụ và tiến độ

Runner nhận `--sample-id` và `--input` để lưu riêng kết quả/report mỗi mẫu;
recorder tự thu thập report mẫu mới; công cụ tạo/kiểm tra A/B nhận sample ID.
Bốn unit test CLI bảo vệ ID/path/thiếu input/timeout âm PASS. Kiểm tra cú pháp
Python, regression bộ A/B mẫu 1 và kiểm tra bộ A/B mẫu 2 PASS.

Đã thử hai đoạn thuộc hai bài, mỗi đoạn trên hai model. Chưa đủ bộ 20 mẫu,
chưa có điểm năm tiêu chí. Mẫu 1 có preference cho Mel; mẫu 2 chưa chấm.
Giấy phép weights chưa xác minh, chưa chọn model sản phẩm hoặc vượt cổng API/UI.
