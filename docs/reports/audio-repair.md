# Kiểm tra và sửa thử nghiệm vocal — 26/10/2026

Chỉ thử nghiệm audio. Chưa xây ứng dụng hoặc chạy toàn bài. Các lần PASS
trước chỉ xác nhận file hợp lệ, không xác nhận chất lượng nghe. Cấu hình
0.63 giây trước đó đã giảm ngữ cảnh quá mức và không có overlap thực sự;
không dùng các lần đó để nghiệm thu chất lượng hoặc chốt model.

## 1. Pipeline đã kiểm tra

- audio-separator 0.47.1, PyTorch 2.14.1+cpu, FFmpeg/FFprobe 9.0.2.
- Mel-RoFormer Viperx 1143: `model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt`.
  SHA-256 `21b9d0958e35b8ebfbe2afe69bbd5444e5ffe2f5d80ae0d583b833d2f3c0d139`.
  Không đổi weights, không cài đè thư viện hoặc sửa site-packages.
- Bản cũ còn có BS-RoFormer Viperx 1297; kiểm tra waveform cũ của cả hai
  đều thấy bất thường tại lưới nối 0.63 giây. Thử sửa tập trung cùng Mel để
  tránh thay pipeline và model đồng thời.
- Máy thực: Intel i5-6440HQ 4 cores/4 logical processors, RAM 8465235968
  bytes (~7.9 GiB), Intel HD Graphics 530. AdapterRAM Windows báo 1 GiB,
  không coi đó là CUDA VRAM riêng. Inference CPU FP32, 2 threads; không CUDA.
  Snapshot: `repair-hardware.json`.
- Nguồn: MP3 “Hoa sữa - JustaTee”, stereo 48 kHz, 297.36 giây, giữ nguyên.
  FFmpeg thực sự decode/resample đoạn 45–70 giây thành PCM16 stereo 44.1 kHz,
  1102500 frames. Giải mã/resample lần nữa từ MP3 cho dữ liệu giống từng mẫu
  với WAV đã dùng: không phải chỉ đổi metadata sample rate.
- Đoạn đại diện sửa: frames 194481..555659 của WAV đó, tương ứng nguồn
  **49.41–57.60 giây**, dài **8.19 giây / 361179 frames**. Cắt theo chỉ số mẫu,
  không encode lossy thêm. Input SHA-256 chung cho ba lần:
  `c56222cde339341e7d27b3604921b63cf4b93bffe00666788d47c58126c431a0`.
- Thư viện đọc float32, channels-first khi inference; ghi frames-first stereo.
  STFT hop=441, FFT/window=2048, sample rate=44100. Kiểm tra output shape,
  NaN/Inf ngay trên kết quả từng chunk và trước encode, không chỉ trên PCM cuối.
- Chuẩn hóa peak 0.9 có điều kiện trên toàn mix/stem, không normalize riêng
  từng chunk. Không noise gate, denoise, de-reverb, clean nhiều lượt hoặc limiter.
  WAV gốc xuất PCM16; file nghe cân gain xuất PCM24 để hạn chế sai số lượng tử
  khi nhân gain, không phải phục hồi chi tiết đã mất từ MP3/PCM16.

## 2. Bằng chứng và nguyên nhân

Mã đã cài tính `chunk_samples = stft_hop * (segment_size - 1)` và
`step = chunk_samples // overlap`. Vì vậy segment=64 là **0.63 giây**,
overlap=1 là **không overlap**, không phải 1% overlap.
YAML checkpoint đặt dim_t=801 (~8 giây), num_overlap=4.

Trong phần lớn run cũ, mỗi sample chỉ nhận một dự đoán. Hamming window bị
chia lại cho cùng trọng số counter nên không tạo crossfade giữa hai dự đoán
độc lập ở đường nối. Các dự đoán ở hai mép chunk có thể khác nhau, tạo bước
nhảy đã tồn tại trong PCM trước player.

Nguồn tham chiếu mã thư viện:
https://github.com/nomadkaraoke/python-audio-separator/blob/main/audio_separator/separator/architectures/mdxc_separator.py
Đối chiếu chính file site-packages được dùng, không chỉ đọc phiên bản main.

Trên toàn đoạn 25 giây ban đầu, median bước nhảy/local RMS tại lưới nối so
với giữa chunk: nhạc gốc 0.194 / 0.184; BS vocal 1.111 / 0.111; Mel vocal
0.895 / 0.121. Đây là thống kê discontinuity, không phải chỉ số tách nguồn.

Tái hiện Mel bằng đoạn 8.19 giây và cấu hình cũ cho vocal **trùng từng mẫu**
với phần cắt tương ứng của file vocal cũ (gain=1, residual RMS=0). Vì vậy lỗi
không chỉ là cảm nhận từ trình phát. Trace: 13 chunks, mỗi chunk vào/ra đủ
27783 frames, không thiếu mẫu. Kiểm tra identity dùng trực tiếp scheduler
và overlap_add đã cài đạt ở cả ba cấu hình và nhiều độ dài/tail: không xác
nhận lỗi số học ghép đoạn, thiếu mẫu hoặc lặp tail.

**Đã xác nhận:** cấu hình ngữ cảnh rất ngắn + không crossfade tạo đường nối
bất thường trong file thử. Giữ model/input và đổi cấu hình chia/ghép đã loại
bỏ bất thường nổi bật tại lưới đó. Không quy lỗi này cho model đơn thuần.

**Chưa xác nhận:** toàn bộ mất âm tiết đều do đường nối, model mới nào tốt
hơn, hoặc từng tham số đóng góp bao nhiêu. Thử sửa thay đồng thời context
và overlap nên không tách riêng tác dụng hai biến. Không thấy bằng chứng
resample sai, clipping, NaN/Inf, hụt/lặp mẫu, normalize riêng chunk hoặc
hậu xử lý mạnh. Player có thể có lỗi phụ trên máy người dùng, nhưng không
giải thích được các bước nhảy đã đo trong PCM. Chưa kiểm tra trực tiếp player.

## 3. Kết quả chạy cùng 8.19 giây

| Phương án | Segment/overlap | Cửa sổ | Tổng thời gian | Peak RSS cây tiến trình |
|---|---|---:|---:|---:|
| Tái hiện cũ | 64 / 1 | 13 | 169.36 s | 2138.10 MiB |
| Context 4 giây | 401 / 2 | 4 | 255.39 s | 2010.26 MiB |
| Context 8 giây | 801 / 4 | 2 | 277.92 s | 2062.75 MiB |

Tổng gồm khởi tạo/model/inference/kiểm tra. RSS lấy mẫu 0.5 giây, không phải
total commit memory; tải máy/cache khác nhau. Không extrapolate thời gian
toàn bài hoặc kết luận RAM model giảm từ một run. Mức trần: 3500 MiB RSS,
30 phút; dừng nếu RAM khả dụng dưới 256 MiB. Không run nào chạm ngưỡng.

Overlap 2/4 tương ứng nominal 50%/75% trên file dài. Trên clip ngắn 8.19 s,
scheduler dịch cửa sổ cuối bám đuôi: profile 8 s có starts [0, 8379], overlap
thực tế lớn hơn nominal; không chứng minh toàn bài đã không có artifacts.
Ba run đều có 0 frames không được phủ, không NaN/Inf trước ghi, đủ hai stem,
đúng sample rate/channels/duration và peak <1.

Trên **cùng lưới nối cũ**, chỉ số median jump/local RMS:

| Vocal | Tại lưới nối | Vị trí đối chứng giữa chunk cũ |
|---|---:|---:|
| Trước, bản gốc/tái hiện | 0.645932 | 0.137081 |
| Sau, 4 giây | 0.137421 | 0.173852 |
| Sau, 8 giây | 0.137015 | 0.163965 |

Giá trị là median của `max_abs(y[n]-y[n-1]) / RMS(y[n-10ms:n+10ms])`.
Đối chứng lệch nửa chu kỳ chunk cũ, bỏ vùng sát đầu/cuối. Đo bằng script
`audit_seams.py` / `repair_compare.py`. Đây **không phải SDR/SI-SDR, không phải
điểm rõ lời hoặc phần trăm cải thiện chất lượng**. Không có vocal sạch tham chiếu.
Chi tiết: `repair-comparison.json`, `repair-initial-seams.json`, từng report
`repair-hs-*-mel-roformer.json` và `chunk-audit.json` trong thư mục run.

## 4. Bàn giao nghe trước–sau

Trong `results/repair-listening/`:

- `01_original.wav`: nhạc gốc cùng đoạn.
- `02_before_original.wav`: bản cũ đã lưu, cắt đúng đoạn.
- `03_before_reproduced.wav`: chạy lại cấu hình cũ, giống bản trước.
- `04_after_context4s.wav`: cùng model, context dài và overlap 50% nominal.
- `05_after_context8s.wav`: cùng model, context theo YAML và overlap 75% nominal.
- `listen.m3u`, `manifest.json` (gain/source), `ratings.csv` trống.

Các vocal cân RMS bằng **giảm gain tuyến tính**, không tăng âm lượng, không
đổi dynamics hoặc thời gian, không denoise. RMS các file nghe khớp trong
1e-7, sai số so với raw × gain trong 1 LSB PCM24. RMS là xấp xỉ mức nghe,
không phải LUFS. FFprobe xác nhận tất cả cùng 8.19 s/44.1 kHz/stereo.
Các WAV baseline/full 25 giây và nguồn MP3 vẫn được giữ nguyên.

Mình **không nghe trực tiếp được trong phiên này**. Độ rõ lời, bleed, méo,
rung/ngắt và chất lượng nốt kéo dài của bản mới cần người dùng đánh giá;
không tự điền điểm. Có thể nghe 02 → 04 → 05 ở âm lượng player giữ nguyên,
đối chiếu 01 ở đoạn nhỏ giọng/nhạc dày. Clip ngắn chưa đại diện mọi bài.

## 5. Cấu hình khuyến nghị thử và chạy lại

Ưu tiên nghe **801/4** trước: giữ ngữ cảnh theo YAML, đã chạy trong giới hạn
máy và không còn bất thường nổi bật tại lưới nối cũ. **401/2** là phương án
nhẹ hơn về thời gian trên lần thử này, chỉ số đường nối tương tự. Chưa gọi
phương án nào là tốt nhất về rõ lời khi chưa có đánh giá nghe của người dùng.
Không tải thêm checkpoint vì đã có lỗi cấu hình cần xử lý trước đổi model.

```powershell
. .\scripts\activate-local.ps1
python ai-worker/repair_experiment.py --profile legacy --run-tag verify-01
python ai-worker/repair_experiment.py --profile context4s --run-tag verify-01
python ai-worker/repair_experiment.py --profile context8s --run-tag verify-01
python ai-worker/repair_compare.py --run-tag verify-01
```

Chạy tuần tự. Tag tạo thư mục/report mới, không ghi đè; dùng tag khác nếu đã
có `verify-01`. Input trích sẵn ở `samples/repair-hoa-sua-8s.wav`.
Runner mặc định context8s. `smoke_test.py` chỉ còn CLI tái hiện cũ có opt-in
`--allow-legacy`, đồng thời cung cấp supervisor chung. Không dùng default cũ
để đánh giá chất lượng nữa.

Kiểm tra đã đạt: test identity OLA/tail; 5 ràng buộc CLI (4 test cũ và test
opt-in mới); compile Python; tái hiện baseline; trace actual chunk; so sánh
RMS/gain; kiểm tra waveform/metadata. Không có test nào thay được nghe.

**Chờ người dùng nghe và quyết định. Chưa chạy toàn bài, chưa xây frontend,
backend, API, DB hoặc triển khai.** Giấy phép weights vẫn chưa xác minh;
không chuyển từ thử nghiệm local sang sản phẩm công khai.

## Phản hồi nghe — 27/10/2026

Người dùng nhận xét bản sửa ổn hơn, sau đó ưu tiên bản context8s vì
“8 giây nó liền mạch hơn”. Đây là đánh giá có nhãn trước–sau, không phải
blind test. Ghi nhận tại `docs/benchmark/config-preferences.csv`.
Không suy ra điểm rõ lời, bleed, méo hoặc điểm số từng tiêu chí.

Ưu tiên tiếp tục thử Mel-RoFormer Viperx 1143, segment=801, overlap=4,
FP32/2 CPU threads trên đoạn dài hơn. Đây là lựa chọn thử nghiệm tạm thời,
chưa nghiệm thu chất lượng toàn bài hoặc cho phép bắt đầu xây hệ thống.
