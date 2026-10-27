import { useEffect, useRef, useState } from 'react';
import { api, upload, readSession, saveSession, errorMessage } from './api.mjs';
import { connectMedia, answerMediaAuth, mediaUrl } from './media.mjs';
import Icon from './Icons.jsx';

const terminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNAVAILABLE'];
const fallbackLimits = {
  maxUploadBytes: 50 * 1024 ** 2,
  maxDurationSeconds: 600,
  ttlHours: 24,
};
const size = (bytes) =>
  `${(bytes / 1024 ** 2).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
const duration = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const lengthLimit = (seconds) =>
  seconds % 60 === 0 ? `${seconds / 60} phút` : `${seconds} giây`;

function Player({ title, subtitle, icon, tone, src, onDownload, onMetadata }) {
  const [failedSrc, setFailedSrc] = useState(null);
  return (
    <article className={`player-card ${tone}`}>
      <div className="player-heading">
        <span className="track-icon">
          <Icon name={icon} size={21} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {onDownload && (
          <button
            className="download-button"
            onClick={onDownload}
            aria-label={`Tải ${title.toLowerCase()} WAV`}
          >
            <Icon name="download" size={17} />
            <span>Tải WAV</span>
          </button>
        )}
      </div>
      <audio
        aria-label={`Nghe ${title.toLowerCase()}`}
        data-testid={`player-${tone}`}
        controls
        preload="metadata"
        src={src}
        onLoadedMetadata={onMetadata}
        onPlay={(event) => {
          document.querySelectorAll('audio').forEach((audio) => {
            if (audio !== event.currentTarget) audio.pause();
          });
        }}
        onError={() => setFailedSrc(src)}
      />
      {failedSrc === src && (
        <p className="inline-error">
          Chưa mở được âm thanh.{' '}
          <button
            className="text-button"
            onClick={(event) => {
              setFailedSrc(null);
              event.currentTarget
                .closest('article')
                .querySelector('audio')
                .load();
            }}
          >
            Thử nghe lại
          </button>
        </p>
      )}
    </article>
  );
}

export default function App() {
  const [session, setSession] = useState(readSession);
  const [job, setJob] = useState(null);
  const [source, setSource] = useState(null);
  const [connection, setConnection] = useState('checking');
  const [limits, setLimits] = useState(fallbackLimits);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [media, setMedia] = useState({ id: null, failed: false });
  const [retry, setRetry] = useState(0);
  const [healthRetry, setHealthRetry] = useState(0);
  const input = useRef(null),
    guide = useRef(null),
    title = useRef(null);
  const busy = uploading || Boolean(session && !terminal.includes(job?.status));
  const completed = job?.status === 'COMPLETED';
  const mediaReady = session && media.id === session.id && !media.failed;
  const tooLong = source?.duration > limits.maxDurationSeconds;

  useEffect(() => {
    let disposed = false,
      timer;
    const check = async () => {
      try {
        const health = await api('/health');
        if (disposed) return;
        setConnection(health.status === 'ok' ? 'online' : 'offline');
        if (health.limits) setLimits(health.limits);
      } catch {
        if (!disposed) setConnection('offline');
      }
      if (!disposed) timer = setTimeout(check, 20000);
    };
    void check();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [healthRetry]);

  useEffect(() => {
    if (!session) return;
    let disposed = false,
      timer,
      failures = 0;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const current = await api(`/jobs/${session.id}`, session, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (disposed) return;
        setJob(current);
        setPollError('');
        failures = 0;
        if (terminal.includes(current.status)) return;
      } catch (err) {
        if (disposed) return;
        if (err.status === 404) {
          setJob({ id: session.id, status: 'UNAVAILABLE' });
          setPollError(errorMessage(err));
          return;
        }
        setPollError(
          'Mất kết nối tạm thời. Tác vụ vẫn được giữ; mình sẽ tự kiểm tra lại.',
        );
        failures++;
      }
      if (!disposed)
        timer = setTimeout(poll, Math.min(15000, 2000 * 2 ** failures));
    };
    void poll();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [session, retry]);

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    const cleanup = answerMediaAuth(session);
    connectMedia(session)
      .then(() => {
        if (!disposed) setMedia({ id: session.id, failed: false });
      })
      .catch(() => {
        if (!disposed) setMedia({ id: session.id, failed: true });
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [session]);

  useEffect(() => {
    const url = source?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [source?.url]);

  useEffect(() => {
    if (completed) title.current?.focus();
  }, [completed]);

  function choose(file) {
    if (!file || busy) return;
    setError('');
    if (!/\.(mp3|wav|flac)$/i.test(file.name)) {
      setError('Hãy chọn tệp MP3, WAV hoặc FLAC.');
      return;
    }
    if (!file.size || file.size > limits.maxUploadBytes) {
      setError(
        `Hãy chọn tệp có dung lượng từ 1 byte đến ${size(limits.maxUploadBytes)}.`,
      );
      return;
    }
    setSession(null);
    saveSession(null);
    setJob(null);
    setPollError('');
    setSource({ file, url: URL.createObjectURL(file), duration: null });
  }
  async function start() {
    if (!source || tooLong || busy || connection !== 'online') return;
    setError('');
    setUploading(true);
    setUploadPercent(0);
    try {
      const result = await upload(source.file, setUploadPercent);
      const auth = { id: result.id, token: result.token };
      saveSession(auth);
      setSession(auth);
      setJob(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }
  async function cancel() {
    if (!session || cancelling) return;
    setCancelling(true);
    setError('');
    try {
      const result = await api(`/jobs/${session.id}`, session, {
        method: 'DELETE',
      });
      setJob((value) => ({ ...value, ...result }));
      setRetry((value) => value + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCancelling(false);
    }
  }
  function reset() {
    setSession(null);
    saveSession(null);
    setJob(null);
    setSource(null);
    setError('');
    setPollError('');
    requestAnimationFrame(() =>
      document.getElementById('choose-audio')?.focus(),
    );
  }
  async function download(stem) {
    setError('');
    try {
      const current = await api(`/jobs/${session.id}`, session);
      if (
        current.status !== 'COMPLETED' ||
        new Date(current.expiresAt) <= new Date()
      ) {
        setJob({ ...current, status: 'EXPIRED' });
        return;
      }
      await connectMedia(session);
      const anchor = document.createElement('a');
      anchor.href = mediaUrl(session.id, stem, true);
      // Native download attributes can bypass service workers in Chromium.
      // Let the authenticated response's Content-Disposition trigger the save.
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      setError(
        err.code
          ? errorMessage(err)
          : 'Chưa tải được tệp. Hãy tải lại trang rồi thử lại.',
      );
    }
  }
  function showGuide() {
    guide.current.open = true;
  }
  const expiry = job?.expiresAt
    ? new Date(job.expiresAt).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : '';
  const filename =
    source?.file.name ?? job?.originalFilename ?? 'Bản nhạc của bạn';
  const failed = ['FAILED', 'CANCELLED', 'EXPIRED', 'UNAVAILABLE'].includes(
    job?.status,
  );
  const progress = Math.max(0, Math.min(99, Number(job?.progress) || 0));
  const stageTitle = !job
    ? 'Đang tìm lại tác vụ…'
    : job.status === 'QUEUED'
      ? 'Bản nhạc đang chờ đến lượt.'
      : job.totalChunks && job.completedChunks === job.totalChunks
        ? 'Đang hoàn thiện hai bản âm thanh.'
        : 'Đang tìm từng lớp âm thanh.';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Đến vùng làm việc
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#workspace"
          aria-label="Stemcraft, về vùng làm việc"
        >
          <span className="brand-mark">
            <Icon name="wave" size={26} />
          </span>
          <span>
            stemcraft<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-body">
          <p className="nav-caption">KHÔNG GIAN SÁNG TẠO</p>
          <nav aria-label="Điều hướng chính">
            <a
              className="nav-item active"
              href="#workspace"
              aria-current="page"
            >
              <Icon name="studio" />
              <span>Tách vocal</span>
              <span className="nav-dot" />
            </a>
            <a className="nav-item" href="#huong-dan" onClick={showGuide}>
              <Icon name="help" />
              <span>Hướng dẫn</span>
              <Icon name="chevron" size={15} />
            </a>
          </nav>
        </div>
        <div className="sidebar-note">
          <span className="note-icon">
            <Icon name="headphones" size={22} />
          </span>
          <h2>
            Một bài nhạc.
            <br />
            Nhiều khả năng mới.
          </h2>
          <p>
            Lấy giọng hát cho bản remix, hoặc nhạc nền cho lần cover tiếp theo.
          </p>
          <span className="local-label">
            <span />
            Không gian local
          </span>
        </div>
        <div className="sidebar-bottom">
          <span className="tiny-wave">
            <Icon name="wave" size={16} />
          </span>
          Để âm nhạc tiếp tục.
        </div>
      </aside>

      <main id="workspace" className="workspace" tabIndex="-1">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <Icon name="chevron" size={13} />
            <strong>Tách vocal</strong>
          </div>
          <span className={`connection ${connection}`} role="status">
            <i />
            {connection === 'online'
              ? 'Máy xử lý đã kết nối'
              : connection === 'checking'
                ? 'Đang kết nối…'
                : 'Máy xử lý chưa kết nối'}
          </span>
        </header>
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span />
              KHÔNG GIAN CHO BẢN PHỐI TIẾP THEO
            </div>
            <h1>
              Tách nhạc.
              <br />
              <span>Giữ trọn cảm hứng.</span>
            </h1>
            <p>
              Tách giọng hát và nhạc nền thành hai tệp riêng.
              <br className="desktop-break" /> Nghe, tải về và bắt đầu điều gì
              đó mới.
            </p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="visual-disc">
              <div className="disc-inner">
                <Icon name="wave" size={35} />
              </div>
            </div>
            <div className="visual-chip chip-vocal">
              <Icon name="mic" size={16} />
              Vocal
            </div>
            <div className="visual-chip chip-music">
              <Icon name="music" size={16} />
              Nhạc nền
            </div>
            <span className="visual-star">✦</span>
          </div>
        </section>
        <ol className="steps" aria-label="Các bước tách nhạc">
          {['Chọn bản nhạc', 'Tách âm thanh', 'Nghe & tải về'].map(
            (label, index) => {
              const current = completed ? 2 : session || uploading ? 1 : 0;
              return (
                <li
                  key={label}
                  className={
                    index === current
                      ? 'current'
                      : index < current
                        ? 'done'
                        : ''
                  }
                  aria-current={index === current ? 'step' : undefined}
                >
                  <span className="step-number">
                    {index < current ? (
                      <Icon name="check" size={13} />
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                  {label}
                  {index < 2 && <span className="step-line" />}
                </li>
              );
            },
          )}
        </ol>

        {connection === 'offline' && (
          <div className="notice warning" role="status">
            <Icon name="alert" />
            <div>
              <strong>Chưa kết nối được với máy xử lý.</strong>
              <p>
                Hãy kiểm tra backend đang chạy. Bản nhạc đã chọn vẫn được giữ
                trong tab này.
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => setHealthRetry((value) => value + 1)}
            >
              Kết nối lại
            </button>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            <Icon name="alert" />
            <p>{error}</p>
            <button
              className="icon-button"
              aria-label="Đóng thông báo lỗi"
              onClick={() => setError('')}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        )}
        {pollError && (
          <div className="notice warning" role="status">
            <Icon name="refresh" />
            <p>{pollError}</p>
            {job?.status !== 'UNAVAILABLE' && (
              <button
                className="text-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Kiểm tra lại
              </button>
            )}
          </div>
        )}

        {completed ? (
          <section className="results" aria-label="Kết quả tách âm thanh">
            <div className="result-heading">
              <div>
                <span className="success-label">
                  <Icon name="check" size={14} />
                  ĐÃ HOÀN THÀNH
                </span>
                <h2 ref={title} tabIndex="-1">
                  Bản tách đã sẵn sàng.
                </h2>
                <p className="result-filename" title={filename}>
                  {filename}
                </p>
              </div>
              <button className="secondary-button" onClick={reset}>
                <Icon name="upload" size={16} />
                Bản nhạc mới
              </button>
            </div>
            {mediaReady ? (
              <div className="players">
                <Player
                  title="Bản gốc"
                  subtitle="Bản nhạc bạn đã tải lên"
                  icon="music"
                  tone="original"
                  src={source?.url ?? mediaUrl(session.id, 'original')}
                />
                <Player
                  title="Vocal"
                  subtitle="Giọng hát · WAV"
                  icon="mic"
                  tone="vocals"
                  src={mediaUrl(session.id, 'vocals')}
                  onDownload={() => download('vocals')}
                />
                <Player
                  title="Nhạc nền"
                  subtitle="Instrumental · WAV"
                  icon="headphones"
                  tone="instrumental"
                  src={mediaUrl(session.id, 'instrumental')}
                  onDownload={() => download('instrumental')}
                />
              </div>
            ) : (
              <div className="media-loading" role="status">
                {media.failed
                  ? 'Chưa mở được trình phát. Hãy dùng Chrome hoặc Edge và tải lại trang.'
                  : 'Đang mở bản nghe…'}
              </div>
            )}
            <div className="result-footnote">
              <Icon name="clock" size={16} />
              <p>
                Tệp có thể tải đến <strong>{expiry}</strong>. Tải các bản cần
                giữ trước khi bắt đầu bài mới.
              </p>
            </div>
          </section>
        ) : (
          <div className="studio-grid">
            <section className="studio-card" aria-label="Tách bản nhạc">
              <div className="card-label">
                <span>01 / BẢN NHẠC CỦA BẠN</span>
                <span className="small-tag">AUDIO IN</span>
              </div>
              {busy && session ? (
                <div className="processing-panel">
                  <span className="processing-icon">
                    <Icon name="wave" size={34} />
                  </span>
                  <span className="processing-label">
                    {job?.status === 'QUEUED' ? 'TRONG HÀNG ĐỢI' : 'ĐANG XỬ LÝ'}
                  </span>
                  <h2>{stageTitle}</h2>
                  <p className="processing-filename" title={filename}>
                    {filename}
                  </p>
                  <div className="progress-info">
                    <span>
                      {job?.totalChunks
                        ? `${job.completedChunks} / ${job.totalChunks} đoạn đã xử lý`
                        : 'Đang chuẩn bị âm thanh'}
                    </span>
                    <strong>{job?.totalChunks ? `${progress}%` : '—'}</strong>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label="Tiến độ tách âm thanh"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={job?.totalChunks ? progress : undefined}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <p className="processing-note">
                    Bài nhạc có thể mất nhiều thời gian trên máy CPU. Tiến độ
                    chỉ thay đổi khi một đoạn thực sự hoàn thành.
                  </p>
                  <button
                    className="secondary-button"
                    disabled={cancelling}
                    onClick={cancel}
                  >
                    <Icon name="close" size={15} />
                    {cancelling ? 'Đang hủy…' : 'Hủy tác vụ'}
                  </button>
                </div>
              ) : failed ? (
                <div className="terminal-panel">
                  <span className="terminal-icon">
                    <Icon
                      name={job.status === 'CANCELLED' ? 'close' : 'alert'}
                      size={28}
                    />
                  </span>
                  <h2>
                    {job.status === 'CANCELLED'
                      ? 'Tác vụ đã được hủy.'
                      : job.status === 'EXPIRED'
                        ? 'Tệp đã hết hạn.'
                        : 'Chưa thể hoàn tất bản tách.'}
                  </h2>
                  <p>
                    {job.status === 'CANCELLED'
                      ? 'Bạn có thể bắt đầu lại với một bản nhạc khác.'
                      : job.status === 'EXPIRED'
                        ? errorMessage('JOB_EXPIRED')
                        : job.status === 'UNAVAILABLE'
                          ? errorMessage('JOB_NOT_FOUND')
                          : errorMessage(job.errorCode)}
                  </p>
                  <button className="primary-button" onClick={reset}>
                    Chọn lại bản nhạc
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={input}
                    className="sr-only"
                    id="audio-file"
                    tabIndex={-1}
                    type="file"
                    accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac"
                    aria-label="Chọn tệp nhạc"
                    disabled={busy}
                    onChange={(event) => {
                      choose(event.target.files[0]);
                      event.target.value = '';
                    }}
                  />
                  {!source ? (
                    <button
                      className={`dropzone ${dragging ? 'dragging' : ''}`}
                      id="choose-audio"
                      disabled={busy}
                      onClick={() => input.current.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        if (event.dataTransfer.files.length !== 1)
                          setError('Mỗi lần hãy chọn một bản nhạc.');
                        else choose(event.dataTransfer.files[0]);
                      }}
                    >
                      <span className="upload-icon">
                        <Icon name="upload" size={29} />
                      </span>
                      <strong>Kéo bản nhạc vào đây</strong>
                      <span>
                        hoặc{' '}
                        <span className="choose-link">
                          chọn tệp từ máy tính
                        </span>
                      </span>
                      <span className="file-formats">
                        MP3, WAV, FLAC <i /> Tối đa{' '}
                        {size(limits.maxUploadBytes)}
                      </span>
                    </button>
                  ) : (
                    <div className="selected-file">
                      <div className="selected-heading">
                        <span className="selected-file-icon">
                          <Icon name="file" size={25} />
                        </span>
                        <div>
                          <strong title={filename}>{filename}</strong>
                          <p>
                            {size(source.file.size)}
                            {source.duration != null &&
                              ` · ${duration(source.duration)}`}
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          disabled={busy}
                          aria-label="Bỏ chọn tệp"
                          onClick={() => setSource(null)}
                        >
                          <Icon name="close" size={18} />
                        </button>
                      </div>
                      <audio
                        key={source.url}
                        aria-label="Nghe bản nhạc đã chọn"
                        controls
                        preload="metadata"
                        src={source.url}
                        onLoadedMetadata={(event) => {
                          const value = event.currentTarget.duration;
                          if (Number.isFinite(value))
                            setSource((current) =>
                              current?.url === source.url
                                ? { ...current, duration: value }
                                : current,
                            );
                        }}
                      />
                      <button
                        className="text-button replace-file"
                        disabled={busy}
                        onClick={() => input.current.click()}
                      >
                        Chọn tệp khác
                      </button>
                    </div>
                  )}
                  {tooLong && (
                    <p className="inline-error" role="alert">
                      Bản nhạc dài hơn giới hạn{' '}
                      {lengthLimit(limits.maxDurationSeconds)}. Hãy chọn đoạn
                      ngắn hơn.
                    </p>
                  )}
                  <div className="upload-action">
                    <button
                      className="primary-button"
                      disabled={
                        !source ||
                        tooLong ||
                        busy ||
                        connection !== 'online' ||
                        source.file.size > limits.maxUploadBytes
                      }
                      onClick={start}
                    >
                      {uploading
                        ? `Đang tải lên${uploadPercent != null ? ` · ${uploadPercent}%` : '…'}`
                        : 'Tách vocal'}
                      <Icon name={uploading ? 'refresh' : 'arrow'} size={19} />
                    </button>
                    <p>Chỉ tải lên âm thanh bạn có quyền xử lý.</p>
                  </div>
                </>
              )}
            </section>
            <aside className="output-card">
              <div className="card-label">
                <span>02 / BẠN SẼ NHẬN ĐƯỢC</span>
                <Icon name="spark" size={17} />
              </div>
              <h2>
                Hai bản tách. <br />
                Sẵn cho ý tưởng mới.
              </h2>
              <div className="output-item">
                <span className="track-icon">
                  <Icon name="mic" size={21} />
                </span>
                <div>
                  <h3>Vocal</h3>
                  <p>Giọng hát để phối lại</p>
                </div>
                <span className="format-tag">WAV</span>
              </div>
              <div className="output-item instrumental">
                <span className="track-icon">
                  <Icon name="headphones" size={21} />
                </span>
                <div>
                  <h3>Nhạc nền</h3>
                  <p>Không gian cho giọng của bạn</p>
                </div>
                <span className="format-tag">WAV</span>
              </div>
              <div className="output-note">
                <Icon name="shield" size={17} />
                <p>
                  Tệp được xử lý trên máy của bạn và tự xóa sau{' '}
                  {limits.ttlHours} giờ.
                </p>
              </div>
              <div className="limit-note">
                <Icon name="clock" size={15} />
                <span>
                  Tối đa {lengthLimit(limits.maxDurationSeconds)} / bản nhạc
                </span>
              </div>
            </aside>
          </div>
        )}

        <details className="guide" id="huong-dan" ref={guide}>
          <summary>
            <span>
              <Icon name="help" size={18} />
              Một chút hướng dẫn trước khi bắt đầu
            </span>
            <Icon name="chevron" size={16} />
          </summary>
          <div className="guide-content">
            <div>
              <span>01</span>
              <h3>Chọn bản nhạc</h3>
              <p>
                Dùng MP3, WAV hoặc FLAC. Tệp nguồn tốt giúp giữ được nhiều chi
                tiết hơn.
              </p>
            </div>
            <div>
              <span>02</span>
              <h3>Để máy xử lý</h3>
              <p>
                Giữ tab này để theo dõi. Bạn có thể tải lại trang và tiếp tục
                xem tác vụ trong cùng phiên trình duyệt.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>Nghe rồi tải về</h3>
              <p>
                Nghe lần lượt bản gốc, vocal và nhạc nền. Tải WAV trước khi tệp
                hết hạn; mức tách phụ thuộc từng bản mix.
              </p>
            </div>
          </div>
        </details>
        <footer className="workspace-footer">
          <span>
            stemcraft<span className="brand-dot">.</span>{' '}
            <span className="footer-divider">/</span> Tạo khoảng trống cho sáng
            tạo.
          </span>
          <span>Âm thanh của bạn. Không gian của bạn.</span>
        </footer>
      </main>
    </div>
  );
}
