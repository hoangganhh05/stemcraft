# Epic 7 — Tốc độ tách và chế độ Nhanh

Ngày 27/10/2026, nhánh `feature/epic-07-fast-separation`, gốc develop `419e8a8`.
Trạng thái: công cụ nghiên cứu đã triển khai; đo thực BLOCKED, chưa có chế độ
Nhanh để chọn trong ứng dụng.

## Candidate

Giữ checkpoint Mel Viperx 1143, CPU FP32, 2 threads, batch 1, context 8 giây
(segment 801), WAV 44.1 kHz stereo; chỉ giảm overlap từ 4 xuống 2.
25 giây đầu vào giống baseline đã nghe, SHA-256 ghi trong report.
Số model calls theo lịch thư viện: Quality 10, Fast 6. Ba test kiểm tra cả biên
chunk và đối chiếu trực tiếp phương thức lịch của audio-separator đã cài,
không import/nạp model để tính lịch. Đây là kế hoạch khối lượng, không phải
số đo speedup. RAM peak có thể vẫn tương tự vì model/context không đổi.

Baseline lịch sử: `repair-hs-context8s-long25-mel-roformer.json`, 1469.594 giây,
1830.98 MiB peak RSS. Không lấy tỷ lệ thời gian giữa hai phiên tải máy khác nhau
làm tuyên bố tăng tốc được kiểm soát. Cần đo cặp Quality/Fast mới trên cùng máy,
cùng input, điều kiện tải tương đương để quyết định tốc độ trước PERF-05.

## Công cụ và an toàn

`ai-worker/fast_experiment.py` dùng cùng inference/validator của worker qua tham số
profile nội bộ; API hiện tại vẫn dùng file profile Quality cũ. Không có endpoint
cho client tùy ý truyền profile hoặc tự bật mode mới.

```powershell
npm.cmd run plan:fast
npm.cmd run test:fast
npm.cmd run experiment:fast
```

Lệnh run cần 2304 MiB RAM khả dụng; tiếp tục giữ runtime guard RAM toàn máy
256 MiB, RSS 3500 MiB, timeout 1800 giây và khóa inference toàn dự án, một lượt.
Hash checkpoint/YAML được worker kiểm tra trước load; không tự download.
Đầu ra giữ riêng trong `.cache/<uuid>/`, không ghi đè baseline/nhạc nguồn.

Nếu inference thành công, xác minh baseline cùng input/model/config và hash stem,
xuất A_quality/B_fast cho vocal và instrumental, cùng RMS bằng attenuation
mỗi stem một lần, chung giới hạn peak. Không normalize từng chunk, không denoise.
Raw WAV vẫn giữ. Report lưu thời gian/RSS/metadata; trạng thái AWAITING_LISTENING
không đồng nghĩa Fast được người dùng chấp nhận. Không có SDR/SI-SDR hoặc % chất
lượng vì không có clean reference.

## Kết quả hiện tại

- 3 test Fast PASS: bảo toàn Quality, lịch chunk đúng thư viện, thiếu RAM không spawn worker.
- Lượt run BLOCKED trước inference: RAM khả dụng 807 MiB <2304 MiB.
- Không tạo WAV A/B mới, chưa đo tốc độ thực, `app_enabled=false`.
- Report máy đọc: `epic-07-fast-experiment.json`.
- Quality vẫn là cấu hình duy nhất của app. Chưa tuyên bố hoàn tất Epic 7.

Tiếp theo khi đủ RAM: chạy candidate, nghe A/B; đo cặp Quality/Fast mới có
điều kiện tải tương đương, rồi mới quyết định tích hợp lựa chọn mode vào API/UI.
Giảm overlap không giải quyết toàn bộ bài toán thiếu RAM. Nếu không đủ capacity,
cần thử model nhẹ có căn cứ hoặc máy GPU; không hạ guard để cố chạy toàn bài.
