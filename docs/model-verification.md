# Xác minh model — đang thực hiện

Đối chiếu upstream ngày 26/10/2026:

- Mã nguồn wrapper: https://github.com/nomadkaraoke/python-audio-separator
- Metadata dependency: https://raw.githubusercontent.com/nomadkaraoke/python-audio-separator/main/pyproject.toml
- Release checkpoint UVR: https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models

Metadata upstream ghi audio-separator 0.47.1, Python >=3.10 (loại 3.14.1),
extra CPU dùng onnxruntime. Môi trường dự án chọn Python 3.11 để thử trước.
Resolver Windows đã giải được 60 packages. Chưa coi là tương thích inference
cho tới khi import và smoke test model đạt.

README upstream minh họa BS-RoFormer bằng
`model_bs_roformer_ep_317_sdr_12.9755.ckpt`. Đây là tên ứng viên để đối chiếu,
không phải bằng chứng checkpoint đã tải hoặc được cấp phép cụ thể.

Không gọi `load_model()` hoặc CLI inference lúc này: wrapper có thể tự tải
checkpoint nếu chưa có. Chưa xác minh được giấy phép riêng và SHA-256 của
hai checkpoint, nên `license_verified=false`, `available=false` giữ nguyên.
Model Mel-Band cụ thể vẫn cần chọn theo catalogue thực tế.

Catalogue UVR đã tải và đọc thành công trong phiên:
https://raw.githubusercontent.com/TRvlvr/application_data/main/filelists/download_checks.json

Catalogue ánh xạ BS-Roformer-Viperx-1297 tới checkpoint ở trên và
Mel-Roformer-Viperx-1143 tới `model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt`.
Hai URL release đã được điền làm ứng viên trong registry theo quy tắc tải
của mã nguồn audio-separator đã cài. Chưa kiểm tra tải weights, checksum
hoặc giấy phép riêng. Không đồng nhất giấy phép MIT của wrapper với weights.

## Smoke test BS-RoFormer 1297

Đã đọc GitHub release API: asset chính thức có kích thước 639331213 bytes,
`digest=null`. Không có SHA-256 nhà phát hành trong metadata này. API contents
của repository liệt kê README.rd và update_patches.txt, không có LICENSE ở root.
Chưa tìm được giấy phép riêng cho weights, vì vậy vẫn giữ
`license_verified=false` và không đưa model vào danh sách sản phẩm khả dụng.
File được tải cho thử nghiệm local theo yêu cầu người dùng; không public hay
phân phối lại. Hash tự tính sau tải chỉ nhận diện artifact, không chứng minh
giấy phép hoặc thay thế checksum do nhà phát hành cung cấp.

Runner `ai-worker/smoke_test.py` dùng CPU FP32, 2 threads, segment_size=64,
override=true, batch_size=1. Lần đầu overlap=2 được dừng để đổi cấu hình vì
tốc độ dự kiến vượt timeout; lưu report riêng `bs-roformer-smoke-overlap2.json`.
Lần tiếp theo dùng overlap=1. Đây là cấu hình smoke test ít bộ nhớ,
chưa phải cấu hình chất lượng cuối. Timeout mặc định 900 giây, RSS tối đa
3500 MiB; dừng khi RAM khả dụng dưới 256 MiB. Chỉ publish thư mục `stems`
sau khi xác minh đủ hai WAV, duration/channels, dữ liệu hữu hạn và không clip.

Đã tải đủ 639331213 bytes từ release chính thức. SHA-256 quan sát được:
`5b84f37e8d444c8cb30c79d77f613a41c05868ff9c9ac6c7049c00aefae115aa`.
Giám sát bộ nhớ đã sửa để tính cả cây tiến trình: venv Windows tạo launcher
và tiến trình Python thực. Số peak RSS của lần đầu chỉ đo launcher, không hợp
lệ để đánh giá bộ nhớ model; report lần đầu ghi rõ điều này.

## AI-03 — Mel-RoFormer Viperx 1143

Theo catalogue UVR, checkpoint đối chứng cụ thể là
`model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt`, không phải Kim MelBand.
Đã tải từ cùng release TRvlvr/model_repo, kích thước 1007816988 bytes.
Release API trả `digest=null`; hash tự tính:
`21b9d0958e35b8ebfbe2afe69bbd5444e5ffe2f5d80ae0d583b833d2f3c0d139`.
Config YAML từ application_data của TRvlvr; hash có trong report run.
Giấy phép weights vẫn chưa xác minh, model chỉ dùng thử local và
`available=false`. Các trang giấy phép của model Kim khác không áp dụng
tự động cho checkpoint Viperx này.

Chạy đối chứng bằng `python ai-worker/smoke_test.py --model mel`.
Giữ cùng input, segment_size=64, overlap=1, FP32 và 2 CPU threads.
So sánh này chỉ cho cấu hình smoke test; chưa đánh giá cấu hình mặc định
segment dài/overlap cao, và trạng thái cache hệ điều hành giữa hai lần khác nhau.

## Đối chiếu nguồn tác giả tiếp theo — 26/10/2026

Danh mục pretrained MSST xác nhận hai checkpoint đã thử là bản viperx,
liên kết tác giả `https://github.com/playdasegunda`:
https://raw.githubusercontent.com/ZFTurbo/Music-Source-Separation-Training/main/docs/pretrained_models.md

Issue MSST phân biệt quyền đối với code và model do người khác đào tạo;
maintainer không khẳng định có thể quyết định giấy phép mọi weights:
https://github.com/ZFTurbo/Music-Source-Separation-Training/issues/90

Chưa xác nhận được grant riêng cho hai checkpoint Viperx từ các nguồn
đã đọc. Không đổi registry sang license_verified hoặc suy ra MIT từ framework.
Đã có thêm đầu mối tác giả để tra cứu; chưa liên hệ thay người dùng.

## Rà soát bàn giao Epic 2 — 27/10/2026

Đã đọc lại [repository phát hành](https://github.com/TRvlvr/model_repo),
[trang tác giả được dẫn](https://github.com/playdasegunda) và
[issue MSST về quyền weights](https://github.com/ZFTurbo/Music-Source-Separation-Training/issues/90).
Trong các nguồn đọc được chưa xác nhận grant áp dụng riêng cho hai artifact
Viperx đã tải. Đây là kết quả tra cứu có giới hạn, không khẳng định không tồn
tại giấy phép ở nơi khác. Không dùng tuyên bố MIT của mirror làm bằng chứng
từ tác giả. Giữ nguyên `license_verified=false`, `available=false`.

Người dùng đã chấp nhận chất lượng local và yêu cầu bỏ benchmark thêm.
Chọn model local qua `config/ai-profile.json`, không sửa cờ readiness public.
