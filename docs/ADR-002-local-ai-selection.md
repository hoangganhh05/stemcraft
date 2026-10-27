# ADR-002 — Chọn AI cho phát triển local

Ngày: 27/10/2026 (Asia/Saigon). Trạng thái: chấp nhận theo quyết định người dùng.
Thay thế cổng benchmark mở rộng của ADR-001 cho việc phát triển local.

## Quyết định

Chọn **Mel-RoFormer Viperx 1143**, checkpoint
`model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt`, làm phương án chính.
Cấu hình bàn giao tại [ai-profile.json](../config/ai-profile.json):
segment 801 (~8 giây), overlap 4, batch 1, override segment bật, pitch 0,
CPU FP32, 2 threads, một worker. Stereo 44.1 kHz, WAV, normalization 0.9;
không gate, denoise, dereverb hay normalize riêng từng chunk.

Người dùng chọn Mel ở bộ A/B đầu, nhận xét cấu hình 8 giây liền mạch hơn
4 giây, sau đó nhận xét bản Hoa sữa 25 giây “ổn r”. Người dùng đã yêu cầu
không kiểm thử thêm và chuyển sang phát triển hệ thống. Không yêu cầu lại
20 mẫu, không chạy tiếp toàn bài, không chạy thêm model.

Chưa chọn fallback tự động: BS-RoFormer chỉ đã thử ở cấu hình cũ có lỗi
nối; không có bằng chứng BS với cấu hình mới đạt chất lượng tương đương.
Khi model chính lỗi, hệ thống tương lai phải báo lỗi, không âm thầm đổi model.

## Bằng chứng và giới hạn

- [Repair 25 giây](reports/audio-repair-long25.md): 1469.594 giây tổng thời
  gian, peak RSS 1830.98 MiB trên i5-6440HQ/RAM 7.9 GiB; không phải SLA.
- [Phản hồi nghe](benchmark/quality-feedback.csv),
  [sở thích cấu hình](benchmark/config-preferences.csv).
- Cấu hình cũ 0.63 giây/no overlap tạo bước nhảy ở mối nối. Kết quả sửa
  không hụt mẫu, không NaN/Inf, đủ 2 WAV, không clipping ở mẫu đã thử.
- Chỉ nghiệm thu mẫu đã nghe; không suy ra chất lượng mọi bài hoặc thời
  gian toàn bài. Không có stem sạch nên không công bố SDR/SI-SDR.
- 20 mẫu và bảng điểm đầy đủ được **miễn theo yêu cầu người dùng**, không
  ghi DONE giả. De-reverb P1 được hoãn để giữ cấu hình đã nghe.

## Registry và giấy phép

`config/models.json.selected_model_id` vẫn null: trường này dành cho model
khả dụng sản phẩm theo validator hiện tại. Lựa chọn local được thể hiện
riêng trong `ai-profile.json`; không đổi `available` hoặc `license_verified`.
File cấu hình là hợp đồng bàn giao, chưa tự tích hợp vào backend chưa xây.
Runner benchmark cũ được giữ nguyên để không ảnh hưởng fingerprint/checkpoint.

Chưa xác minh giấy phép riêng của weights. Không suy ra quyền từ MIT của
wrapper hoặc nhãn của mirror; xem [ghi chú nguồn](model-verification.md).
Phát triển local tiếp tục theo yêu cầu đã có; public/redistribution còn mở.

## Chuyển giai đoạn

Phần chất lượng Epic 2 được chốt theo phạm vi điều chỉnh; AI-01 còn mở
ở giấy phép. Có thể bắt đầu Epic 3 local theo luồng nhận file → một worker
→ kết quả; không quảng cáo model đã được cấp phép public hay chất lượng
toàn bài đã nghiệm thu. Trước khi nhận bài dài, cần công bố giới hạn và
timeout dựa trên khả năng CPU; không tự giảm segment/overlap để tăng tốc.
