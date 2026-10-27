# EPIC-02 — Bàn giao AI

Ngày: 27/10/2026. Phạm vi điều chỉnh theo quyết định người dùng:
chấp nhận chất lượng hiện tại, dừng kiểm thử mở rộng.

| Task | Trạng thái | Bằng chứng / quyết định |
|---|---|---|
| AI-01 | PARTIAL | Có nguồn, checkpoint hash, YAML hash; giấy phép weights chưa xác minh |
| AI-02 | DONE với đoạn 25 giây | BS có 2 WAV, timing/log; thay độ dài 30 giây bằng mẫu 25 giây đã chạy |
| AI-03 | DONE với đoạn 25 giây | Mel đã chạy cùng input; kết quả sửa pipeline được người dùng nghe chấp nhận |
| AI-04 | WAIVED BY USER | Có 2 bài, chưa có bộ 20 mẫu; không tạo thêm theo yêu cầu dừng kiểm thử |
| AI-05 | WAIVED BY USER phần mở rộng | Đã có runs trên 2 bài; không giả nhận đã benchmark mọi mẫu |
| AI-06 | WAIVED BY USER phần bảng điểm | Có sở thích A/B và phản hồi tổng quát; chưa có điểm đầy đủ 5 tiêu chí |
| AI-07 | DONE theo phạm vi local | ADR-002 + ai-profile.json; Mel chính, chưa chọn fallback tự động |
| AI-08 | DEFERRED (P1) | Không bật de-reverb/denoise |

**Chốt bàn giao kỹ thuật cho phát triển local**, không tuyên bố Epic 2 đạt
mọi tiêu chí gốc hay sẵn sàng public. Giấy phép AI-01 còn mở.

## Cấu hình và đầu ra

- Hợp đồng cấu hình: `config/ai-profile.json`.
- Quyết định: `docs/ADR-002-local-ai-selection.md`.
- Đầu ra raw đã kiểm tra: `results/repair-hs-context8s-long25/stems/`.
- Bộ nghe cùng đoạn: `results/repair-listening-long25/01_original.wav`,
  `02_before_original.wav`, `03_after_context8s.wav` và `listen.m3u`.
- 25 giây: tổng 24 phút 30 giây, peak RSS ~1.79 GiB, CPU; không ngoại suy SLA.
- Toàn bài Hoa sữa: PAUSED_BY_USER ở 4/146 chunk, chưa có output hoàn chỉnh.

Không chạy inference trong lần bàn giao này. Kiểm tra cấu hình bằng
`node scripts/validate-ai-profile.mjs`; kiểm tra tooling qua `npm.cmd run check`.
Không đổi runner cũ hoặc khởi động lại công việc nền.

## Xác nhận bàn giao

`npm.cmd run check` đã PASS: ESLint, Prettier, 2 Node tests, registry validation
và đối chiếu AI profile với report COMPLETED (model/hash/YAML/inference params).
Đọc lại progress xác nhận toàn bài vẫn PAUSED_BY_USER, 4/146 chunk.
