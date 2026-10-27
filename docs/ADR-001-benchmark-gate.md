# ADR-001: Benchmark trước khi triển khai sản phẩm

Trạng thái: Đã chấp nhận theo kế hoạch dự án, 26/10/2026.

**Cập nhật 27/10/2026:** cổng benchmark 20 mẫu cho phát triển local đã được
người dùng miễn sau khi nghe và chấp nhận cấu hình 8 giây. Xem
[ADR-002](ADR-002-local-ai-selection.md). Nội dung bên dưới giữ làm lịch sử
kế hoạch ban đầu; không dùng để yêu cầu chạy lại benchmark. Giấy phép
weights và readiness public vẫn chưa được xác nhận.

MVP dùng một Python worker, một job tại một thời điểm và storage private.
Chưa chọn checkpoint chính. Chỉ bắt đầu API xử lý và UI sản phẩm sau
benchmark tối thiểu 20 mẫu hợp lệ, đo thời gian/RAM/VRAM, nghe mù và ghi
quyết định model. Mọi model trong registry hiện chưa khả dụng.

Không tải model lớn trong bước chuẩn bị. Nguồn, giấy phép checkpoint,
checksum và khả năng tương thích phải được xác minh trước khi dùng.
