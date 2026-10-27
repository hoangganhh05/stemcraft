# AI-02 — BS-RoFormer CPU smoke test

Ngày: 26/10/2026. Kết quả kỹ thuật: PASS. Chưa chấm nghe.

## Đầu vào và môi trường

- Đoạn 30–55 giây từ MP3 người dùng chỉ định, WAV đầu vào dài 25 giây.
- Windows, Intel i5-6440HQ, RAM 7.9 GiB, PyTorch 2.14.1+cpu, 2 threads.
- audio-separator 0.47.1, FFmpeg 9.0.2.
- Checkpoint BS-RoFormer Viperx 1297 tải đủ từ release chính thức.
  Hash tự tính và thông tin nguồn ở `bs-roformer-smoke.json` và
  `../model-verification.md`.
- Giấy phép weights chưa xác minh; model chỉ dùng thử local, không public.

## Kết quả

Lần đầu overlap=2 được chủ động dừng sau 359.88 giây để đổi cấu hình CPU.
Số đo peak RAM lần đầu không hợp lệ vì chỉ đo launcher Windows; không dùng
để so sánh. Log và report đã giữ nguyên, có ghi lý do dừng trong CSV.

Lần hoàn tất: segment_size=64, override=true, batch_size=1, overlap=1,
FP32. Tổng thời gian 472.67 giây (7 phút 53 giây, gồm khởi tạo và kiểm tra
đầu ra). Log thư viện ghi phần separation khoảng 7 phút 23 giây.
Tốc độ tổng khoảng 18.9 lần thời lượng audio. Đây là số đo một mẫu và một
cấu hình, không dùng suy rộng tuyến tính cho bài dài hoặc model khác.

Peak RSS cộng cây tiến trình được lấy mẫu mỗi 0.5 giây: 1483.39 MiB.
Đây là bộ nhớ resident quan sát được, không phải tổng commit/working memory
chính xác của model. Không có VRAM CUDA.

Hai đầu ra nằm trong `results/bs-roformer-smoke-cpu-overlap1/stems/`:

| Stem | Thời lượng | Định dạng | Peak tuyệt đối |
|---|---:|---|---:|
| Vocals | 25 giây | PCM 16-bit, stereo, 44100 Hz | 0.844543 |
| Instrumental | 25 giây | PCM 16-bit, stereo, 44100 Hz | 0.900024 |

Đã đọc toàn bộ output: có dữ liệu, hữu hạn, đúng thời lượng/số kênh,
peak <1. FFprobe kiểm tra độc lập định dạng hai file đạt. WAV chưa được nghe
đánh giá; chưa kết luận bleed, artifacts, mất phụ âm hoặc chất lượng remix.

Log, metadata/hash từng WAV nằm cùng thư mục run. CSV ghi ở
`docs/benchmark/runs.csv`. Các file audio/weights/log được Git ignore.

## Tiến độ kế hoạch

- AI-01: một phần; nguồn tải và hash artifact đã ghi, giấy phép còn chưa rõ.
- AI-02: hoàn tất smoke test kỹ thuật, có hai WAV/timing/log.
- AI-03: chưa chạy Mel-Band RoFormer đối chứng.
- AI-04..AI-07: chưa hoàn tất; chưa đủ 20 mẫu, chưa blind listening/chọn model.
- Cổng benchmark trước backend/UI vẫn chưa đạt.

Bước tiếp: nghe hai stem, đối chiếu cùng đoạn gốc; sau đó chạy model thứ hai
với cùng audio và cấu hình tài nguyên được ghi rõ. Cấu hình overlap=1 phục vụ
smoke test, không mặc định là cấu hình tối ưu chất lượng.
