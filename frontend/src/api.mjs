const BASE = '/api/v1';
const KEY = 'stemcraft.current-job';
const ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class ApiError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY));
    return value && ID.test(value.id) && /^[0-9a-f]{64}$/.test(value.token)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function saveSession(value) {
  try {
    if (value)
      sessionStorage.setItem(
        KEY,
        JSON.stringify({ id: value.id, token: value.token }),
      );
    else sessionStorage.removeItem(KEY);
  } catch {
    /* The current tab still works if browser storage is unavailable. */
  }
}
export async function api(path, session, options = {}) {
  let response;
  try {
    response = await fetch(BASE + path, {
      ...options,
      cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(12000),
      headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    });
  } catch {
    throw new ApiError('NETWORK_ERROR');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(data.error ?? 'REQUEST_FAILED', response.status);
  return data;
}
export function upload(file, onProgress) {
  return new Promise((done, fail) => {
    const request = new XMLHttpRequest();
    request.open('POST', BASE + '/jobs');
    request.timeout = 120000;
    request.upload.onprogress = (event) =>
      onProgress(
        event.lengthComputable
          ? Math.round((event.loaded / event.total) * 100)
          : null,
      );
    request.onerror = () => fail(new ApiError('NETWORK_ERROR'));
    request.ontimeout = () => fail(new ApiError('UPLOAD_TIMEOUT'));
    request.onload = () => {
      let data;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        fail(new ApiError('REQUEST_FAILED'));
        return;
      }
      if (request.status !== 202)
        fail(new ApiError(data.error ?? 'REQUEST_FAILED', request.status));
      else done(data);
    };
    const body = new FormData();
    body.append('file', file);
    request.send(body);
  });
}
export const messages = {
  INVALID_AUDIO: 'Không đọc được âm thanh. Hãy chọn một tệp nhạc hợp lệ.',
  UNSUPPORTED_FORMAT:
    'Định dạng này chưa được hỗ trợ. Hãy dùng MP3, WAV hoặc FLAC.',
  UNSUPPORTED_AUDIO:
    'Hãy dùng tệp MP3, WAV hoặc FLAC có một hoặc hai kênh âm thanh.',
  LIMIT_FILE_SIZE: 'Tệp vượt quá dung lượng cho phép. Hãy chọn tệp nhỏ hơn.',
  DURATION_LIMIT: 'Thời lượng bài nhạc vượt giới hạn hoặc quá ngắn để xử lý.',
  QUEUE_FULL: 'Hàng đợi đang đầy. Bạn thử lại sau một chút nhé.',
  UPLOAD_BUSY: 'Đang nhận nhiều tệp cùng lúc. Hãy thử lại sau.',
  RATE_LIMITED: 'Bạn đang gửi yêu cầu quá nhanh. Hãy chờ một phút rồi thử lại.',
  UPLOAD_RATE_LIMITED:
    'Bạn đã tải lên nhiều lần. Hãy chờ một phút rồi thử lại.',
  DISK_SPACE_LOW: 'Máy không còn đủ dung lượng trống để xử lý bài nhạc.',
  MEMORY_LIMIT:
    'Máy không đủ bộ nhớ cho lần xử lý này. Đóng bớt ứng dụng rồi thử lại.',
  TIMEOUT:
    'Lần xử lý đã vượt thời gian cho phép. Hãy thử một đoạn nhạc ngắn hơn.',
  WORKER_INTERRUPTED: 'Lần xử lý bị gián đoạn. Bạn có thể gửi lại bài nhạc.',
  WORKER_FAILED:
    'Chưa tách được bài nhạc này. Hãy thử lại hoặc chọn một tệp khác.',
  JOB_EXPIRED: 'Tệp của tác vụ này đã hết hạn. Hãy tải bài nhạc lên lại.',
  JOB_NOT_FOUND:
    'Không tìm thấy tác vụ trong phiên này. Hãy tải bài nhạc lên lại.',
  NETWORK_ERROR:
    'Chưa kết nối được với máy xử lý. Kiểm tra backend rồi thử lại.',
  UPLOAD_TIMEOUT: 'Tải tệp lên mất quá lâu. Kiểm tra kết nối rồi thử lại.',
};
export const errorMessage = (error) =>
  messages[error?.code ?? error] ??
  'Có lỗi xảy ra. Bạn thử lại sau một chút nhé.';
