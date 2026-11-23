package com.givy.amfinder;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.ClipData;
import android.content.BroadcastReceiver;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Icon;
import android.media.MediaPlayer;
import android.media.MediaScannerConnection;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class MainActivity extends Activity {

    private static final String TAG = "AMFinder";
    private static final String HOME = "https://amfinder.web.id/";
    private static final String HOST = "amfinder.web.id";
    private static final int ACCENT = 0xFF05FAA8;
    private static final int BG = 0xFF0F0F10;
    private static final long MAX_SPLASH_MS = 10000;

    private String getAppVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "2.0";
        }
    }

    private int getAppVersionCode() {
        try {
            if (Build.VERSION.SDK_INT >= 28) {
                return (int) getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
            } else {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            }
        } catch (Exception e) {
            return 10;
        }
    }

    public static class AMFinderNativeBridge {
        private final MainActivity activity;
        private final String version;
        private final int versionCode;

        public AMFinderNativeBridge(MainActivity activity, String version, int versionCode) {
            this.activity = activity;
            this.version = version;
            this.versionCode = versionCode;
        }

        @JavascriptInterface
        public String getVersion() {
            return version;
        }

        @JavascriptInterface
        public int getVersionCode() {
            return versionCode;
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public boolean hasNativeDownload() {
            return true;
        }

        @JavascriptInterface
        public String downloadMedia(String url, String filename, String mimeType, String kind) {
            if (activity != null) {
                return activity.downloadMediaFromWeb(url, filename, mimeType, kind);
            }
            return "";
        }

        @JavascriptInterface
        public boolean openDownload(long id) {
            return activity != null && activity.openFinishedDownload(id);
        }

        @JavascriptInterface
        public boolean shareDownload(long id) {
            return activity != null && activity.shareFinishedDownload(id);
        }

        @JavascriptInterface
        public boolean openDownloadFolder() {
            return activity != null && activity.openDownloadsFolder();
        }

        @JavascriptInterface
        public boolean openContent(String url, String platform, String contentId) {
            if (activity != null) {
                return activity.openContentFromWeb(url, platform, contentId);
            }
            return false;
        }
    }

    public static class DownloadRecord {
        public final long id;
        public final String kind;
        public final String filename;
        public final String mimeType;
        // Penjaga unduhan macet: waktu mulai dan waktu pertama kali berstatus PAUSED.
        public final long startedMs = System.currentTimeMillis();
        public long pausedSinceMs = 0;

        public DownloadRecord(long id, String kind, String filename, String mimeType) {
            this.id = id;
            this.kind = kind;
            this.filename = filename;
            this.mimeType = mimeType;
        }
    }

    private static class PendingDownload {
        final String url;
        final String filename;
        final String mimeType;
        final String kind;

        PendingDownload(String url, String filename, String mimeType, String kind) {
            this.url = url;
            this.filename = filename;
            this.mimeType = mimeType;
            this.kind = kind;
        }
    }

    private static final long VIDEO_END_MARGIN_MS = 350;

    private WebView web;
    private FrameLayout splash;
    private VideoView video;
    private FrameLayout progressTrack;
    private View progressFill;
    private View offlinePanel;

    private long splashStart;
    private boolean splashHidden;
    private boolean videoReady;
    private long videoDurationMs;
    private int lastVideoPos;
    private boolean videoReachedEnd;
    private boolean pageLoaded;
    private volatile String currentUrl;
    private volatile String appUserAgent;
    private Runnable completeProgressTask;
    private static final int REQ_STORAGE = 4201;
    private static final int REQ_NOTIF = 4202;
    private static final String DL_CHANNEL = "am_downloads";
    private final AtomicLong ownDownloadSeq = new AtomicLong(1000000L);
    private PendingDownload pendingDownload;
    private static class FinishedDownload {
        final Uri uri;
        final String mimeType;
        final String filename;

        FinishedDownload(Uri uri, String mimeType, String filename) {
            this.uri = uri;
            this.mimeType = mimeType;
            this.filename = filename;
        }
    }
    // Unduhan yang sudah selesai (id -> file), dipakai tombol aksi di dalam aplikasi.
    private final java.util.concurrent.ConcurrentHashMap<Long, FinishedDownload> finishedDownloads =
            new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<Long, DownloadRecord> activeDownloads = new ConcurrentHashMap<>();
    private final Handler pollerHandler = new Handler(Looper.getMainLooper());
    private boolean isPollerRunning = false;

    private final Runnable progressPollerRunnable = new Runnable() {
        @Override
        public void run() {
            if (activeDownloads.isEmpty()) {
                isPollerRunning = false;
                return;
            }
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm != null) {
                for (Map.Entry<Long, DownloadRecord> entry : activeDownloads.entrySet()) {
                    long id = entry.getKey();
                    DownloadRecord rec = entry.getValue();
                    try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
                        if (c != null && c.moveToFirst()) {
                            int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                            long soFar = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                            long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                            int percent = total > 0 ? (int) ((soFar * 100) / total) : 0;
                            long now = System.currentTimeMillis();
                            if (status == DownloadManager.STATUS_PAUSED) {
                                // DownloadManager mengulang tanpa henti saat server/jaringan error, dan
                                // tampilannya macet di awal. Bila terhenti > 10 detik, batalkan dan beri tahu.
                                if (rec.pausedSinceMs == 0) {
                                    rec.pausedSinceMs = now;
                                } else if (now - rec.pausedSinceMs > 10000) {
                                    int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                                    failDownload(dm, id, rec, "Unduhan terhenti: " + getDownloadErrorMessage(status, reason) + ". Coba lagi.");
                                    continue;
                                }
                            } else if (status == DownloadManager.STATUS_PENDING && now - rec.startedMs > 20000) {
                                failDownload(dm, id, rec, "Unduhan tidak bisa dimulai. Periksa koneksi lalu coba lagi.");
                                continue;
                            } else if (status == DownloadManager.STATUS_RUNNING) {
                                rec.pausedSinceMs = 0;
                            }
                            if (status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PENDING) {
                                runOnUiThread(() -> {
                                    if (web != null) {
                                        web.evaluateJavascript(
                                            String.format(Locale.US,
                                                "window.onAMFinderDownloadProgress && window.onAMFinderDownloadProgress(%d, '%s', %d, %d, %d);",
                                                id, rec.kind, soFar, total, percent),
                                            null);
                                    }
                                });
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }
            }
            pollerHandler.postDelayed(this, 500);
        }
    };

    private void failDownload(DownloadManager dm, long id, DownloadRecord rec, String message) {
        try {
            dm.remove(id);
        } catch (Exception ignored) {
        }
        activeDownloads.remove(id);
        runOnUiThread(() -> {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
            if (web != null) {
                web.evaluateJavascript(
                    String.format(Locale.US,
                        "window.onAMFinderDownloadEvent && window.onAMFinderDownloadEvent({ id: %d, kind: '%s', status: 'error', message: %s });",
                        id, rec.kind, JSONObject.quote(message)),
                    null);
            }
        });
    }

    private void startProgressPoller() {
        if (!isPollerRunning && !activeDownloads.isEmpty()) {
            isPollerRunning = true;
            pollerHandler.post(progressPollerRunnable);
        }
    }

    private final BroadcastReceiver downloadDone = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id < 0) return;
            DownloadRecord record = activeDownloads.remove(id);
            if (record == null) return;

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm == null) return;

            try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
                if (c == null || !c.moveToFirst()) return;
                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status != DownloadManager.STATUS_SUCCESSFUL) {
                    int reason = -1;
                    int reasonIdx = c.getColumnIndex(DownloadManager.COLUMN_REASON);
                    if (reasonIdx >= 0) {
                        reason = c.getInt(reasonIdx);
                    }
                    String reasonText = getDownloadErrorMessage(status, reason);
                    Log.e(TAG, "Download failed for ID: " + record.id + " (" + record.filename + "), status: " + status + ", reason: " + reason + " (" + reasonText + ")");
                    final String userMsg = "Gagal mengunduh " + (record.kind.equals("video") ? "video" : "audio") + ": " + reasonText;
                    runOnUiThread(() -> {
                        Toast.makeText(MainActivity.this, userMsg, Toast.LENGTH_LONG).show();
                        if (web != null) {
                            String quotedMsg = JSONObject.quote(userMsg);
                            web.evaluateJavascript(
                                String.format(Locale.US,
                                    "window.onAMFinderDownloadEvent && window.onAMFinderDownloadEvent({ id: %d, kind: '%s', status: 'error', message: %s });",
                                    record.id, record.kind, quotedMsg),
                                null);
                        }
                    });
                    return;
                }

                String local = c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI));
                String mime = record.mimeType;
                try {
                    String queriedMime = c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_MEDIA_TYPE));
                    if (queriedMime != null && !queriedMime.isEmpty()) mime = queriedMime;
                } catch (Exception ignored) {}

                String path = null;
                if (local != null && local.startsWith("file://")) {
                    path = Uri.parse(local).getPath();
                }
                if (path == null || !new File(path).exists()) {
                    File pubDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    File candidate = new File(pubDir, record.filename);
                    if (candidate.exists()) {
                        path = candidate.getAbsolutePath();
                    }
                }

                if (path != null) {
                    final String finalPath = path;
                    final String finalMime = mime;
                    MediaScannerConnection.scanFile(MainActivity.this,
                            new String[]{finalPath},
                            new String[]{finalMime},
                            null);
                    try {
                        sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(new File(finalPath))));
                    } catch (Exception ignored) {}
                }

                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Tersimpan di folder Download: " + record.filename, Toast.LENGTH_LONG).show();
                    if (web != null) {
                        String safeNameJson = JSONObject.quote(record.filename);
                        web.evaluateJavascript(
                            String.format(Locale.US,
                                "window.onAMFinderDownloadEvent && window.onAMFinderDownloadEvent({ id: %d, kind: '%s', status: 'success', filename: %s });",
                                record.id, record.kind, safeNameJson),
                            null);
                    }
                });
            } catch (Exception ignored) {
            }
        }
    };

    private final Runnable splashFinisher = new Runnable() {
        @Override
        public void run() {
            if (splashHidden) return;
            if (videoReady && videoDurationMs > 0 && video != null) {
                int pos = video.getCurrentPosition();
                if (pos + 200 < lastVideoPos) videoReachedEnd = true;
                if (pos >= videoDurationMs - VIDEO_END_MARGIN_MS) videoReachedEnd = true;
                lastVideoPos = pos;
            }
            boolean timedOut = SystemClock.uptimeMillis() - splashStart >= MAX_SPLASH_MS;
            if ((pageLoaded && videoReachedEnd) || timedOut) {
                hideSplash();
                return;
            }
            splash.postDelayed(this, 80);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        splashStart = SystemClock.uptimeMillis();

        web = new WebView(this);
        // Penanda biar halaman monitor bisa membedakan "lewat aplikasi" dengan
        // akurat. Tanpa ini, deteksi nebak dari "; wv)" yang juga dipakai
        // browser in-app milik aplikasi lain.
        String appVer = getAppVersion();
        appUserAgent = web.getSettings().getUserAgentString() + " AMFinderApp/" + appVer + " AMFinderVer/" + appVer + " AMFinderDL/1";
        web.getSettings().setUserAgentString(appUserAgent);
        splash = buildSplash();
        offlinePanel = buildOfflinePanel();
        progressTrack = buildProgress();

        FrameLayout root = new FrameLayout(this);
        root.addView(web, matchParent());
        root.addView(splash, matchParent());
        root.addView(offlinePanel, matchParent());
        root.addView(progressTrack, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP));
        setContentView(root);
        root.setBackgroundColor(BG);
        web.setBackgroundColor(BG);

        // Edge-to-edge (dipaksa targetSdk 35 di Android 15+): WebView & panel offline
        // wajib dapat inset biar konten nggak ketimpa status/navigation bar.
        // WebView NGGAK ngecilin area konten dari padding → pakai margin.
        // Splash sengaja TANPA inset biar video tetap full-screen sampai tepi.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom, left, right;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = bars.top;
                bottom = bars.bottom;
                left = bars.left;
                right = bars.right;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft();
                right = insets.getSystemWindowInsetRight();
            }
            FrameLayout.LayoutParams wl = (FrameLayout.LayoutParams) web.getLayoutParams();
            if (wl.leftMargin != left || wl.topMargin != top
                    || wl.rightMargin != right || wl.bottomMargin != bottom) {
                wl.leftMargin = left;
                wl.topMargin = top;
                wl.rightMargin = right;
                wl.bottomMargin = bottom;
                web.setLayoutParams(wl);
            }
            offlinePanel.setPadding(64 + left, 64 + top, 64 + right, 64 + bottom);
            FrameLayout.LayoutParams pl = (FrameLayout.LayoutParams) progressTrack.getLayoutParams();
            if (pl.topMargin != top) {
                pl.topMargin = top;
                progressTrack.setLayoutParams(pl);
            }
            return WindowInsets.CONSUMED;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Video hasil pencarian diputar otomatis oleh kode setelah data selesai dimuat (bukan saat disentuh).
        // Tanpa ini WebView menolak autoplay bersuara dan video jatuh ke mode muted.
        s.setMediaPlaybackRequiresUserGesture(false);

        web.addJavascriptInterface(
                new AMFinderNativeBridge(this, appVer, getAppVersionCode()), "AMFinderNative");

        // navigator.clipboard.readText() ditolak di WebView (gak ada UI permission
        // clipboard-read), jadi tombol paste di site butuh bridge native ini.
        // Cuma jalan kalo halaman aktif emang domain amfinder.web.id.
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String read() {
                try {
                    String url = currentUrl;
                    if (url == null) return "";
                    String host = Uri.parse(url).getHost();
                    host = host == null ? "" : host.toLowerCase();
                    if (!host.equals(HOST) && !host.endsWith("." + HOST)) return "";
                    ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    if (cm == null || !cm.hasPrimaryClip()) return "";
                    ClipData d = cm.getPrimaryClip();
                    if (d == null || d.getItemCount() == 0) return "";
                    CharSequence t = d.getItemAt(0).coerceToText(MainActivity.this);
                    return t == null ? "" : t.toString();
                } catch (Exception e) {
                    return "";
                }
            }
        }, "AndroidClipboard");

        // WebView nggak otomatis ngunduh file. Tanpa DownloadListener, respons
        // "Content-Disposition: attachment" (mis. /api/audio/<id>) cuma diabaikan.
        // Langsung arahkan ke download manager native tanpa membuka external intent.
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String kind = (url.contains("/api/audio/") || (mimeType != null && mimeType.startsWith("audio/"))) ? "audio" : "video";
            String guessed = URLUtil.guessFileName(url, contentDisposition, mimeType);
            downloadMediaFromWeb(url, guessed, mimeType, kind);
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (offlinePanel.getVisibility() == View.VISIBLE) return;
                if (progressTrack.getVisibility() != View.VISIBLE) showProgress();
                updateProgress(newProgress);
                if (newProgress >= 100) completeProgress();
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                currentUrl = url;
                showProgress();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrlOverride(req.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrlOverride(Uri.parse(url));
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    hideSplash();
                    cancelProgress();
                    showOffline();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!pageLoaded) pageLoaded = true;
                completeProgress();
            }
        });

        offlinePanel.setOnClickListener(v -> {
            if (isOnline()) {
                hideOffline();
                web.reload();
            } else {
                Toast.makeText(this, "Masih belum ada koneksi", Toast.LENGTH_SHORT).show();
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl(HOME);
        } else {
            web.restoreState(savedInstanceState);
        }
        splash.post(splashFinisher);

        IntentFilter doneFilter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(downloadDone, doneFilter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(downloadDone, doneFilter);
        }
    }

    public static String sanitizeFilename(String filename, String kind) {
        String ext = "video".equalsIgnoreCase(kind) ? ".mp4" : ".mp3";
        if (filename == null || filename.trim().isEmpty()) {
            return ("video".equalsIgnoreCase(kind) ? "video_" : "audio_") + System.currentTimeMillis() + ext;
        }

        String base = filename.trim();
        if (base.toLowerCase().endsWith(".mp4") || base.toLowerCase().endsWith(".mp3")) {
            base = base.substring(0, base.length() - 4).trim();
        }

        // 1. Replace filesystem reserved characters
        base = base.replaceAll("[\\\\/:*?\"<>|]", "_");
        // 2. Prevent directory traversal (DownloadManager crashes on .. in subPath)
        base = base.replaceAll("\\.{2,}", "_");
        // 3. Keep safe characters: alphanumeric, spaces, underscores, hyphens, parentheses
        // Strip emojis / 4-byte UTF-8 that cause DB/filesystem errors on some Android storage implementations
        base = base.replaceAll("[^a-zA-Z0-9\\s-_()]", " ");
        // 4. Collapse consecutive spaces and trim
        base = base.replaceAll("\\s+", " ").trim();
        // 5. Remove leading/trailing dots or underscores
        base = base.replaceAll("^[._\\s]+", "").replaceAll("[._\\s]+$", "");

        // 6. Truncate base name to 50 characters max to prevent filename length limits on external FAT32/exFAT storage
        if (base.length() > 50) {
            base = base.substring(0, 50).trim();
        }

        if (base.isEmpty()) {
            base = ("video".equalsIgnoreCase(kind) ? "video_" : "audio_") + System.currentTimeMillis();
        }

        return base + ext;
    }

    private String getDownloadErrorMessage(int status, int reason) {
        if (status == DownloadManager.STATUS_PAUSED) {
            switch (reason) {
                case DownloadManager.PAUSED_QUEUED_FOR_WIFI: return "Menunggu koneksi Wi-Fi";
                case DownloadManager.PAUSED_WAITING_FOR_NETWORK: return "Menunggu koneksi jaringan";
                case DownloadManager.PAUSED_WAITING_TO_RETRY: return "Menunggu untuk mencoba lagi";
                default: return "Unduhan dijeda (" + reason + ")";
            }
        }
        switch (reason) {
            case DownloadManager.ERROR_CANNOT_RESUME:
                return "Tidak dapat melanjutkan unduhan (Range error 1008)";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND:
                return "Penyimpanan eksternal tidak ditemukan (1007)";
            case DownloadManager.ERROR_FILE_ALREADY_EXISTS:
                return "File sudah ada (1009)";
            case DownloadManager.ERROR_FILE_ERROR:
                return "Gagal menulis file ke penyimpanan (1001)";
            case DownloadManager.ERROR_HTTP_DATA_ERROR:
                return "Kesalahan transfer data HTTP (1004)";
            case DownloadManager.ERROR_INSUFFICIENT_SPACE:
                return "Ruang penyimpanan tidak mencukupi (1006)";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS:
                return "Terlalu banyak pengalihan / redirect (1005)";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE:
                return "Server mengembalikan kode error HTTP (1002)";
            case DownloadManager.ERROR_UNKNOWN:
            default:
                return "Kesalahan tidak diketahui (" + reason + ")";
        }
    }

    public String downloadMediaFromWeb(String url, String filename, String mimeType, String kind) {
        if (url == null || url.trim().isEmpty()) {
            Log.e(TAG, "downloadMediaFromWeb rejected: url is empty");
            return "";
        }
        final String fullUrl;
        if (url.startsWith("/")) {
            fullUrl = HOME + (url.startsWith("/") ? url.substring(1) : url);
        } else {
            fullUrl = url;
        }

        try {
            Uri parsed = Uri.parse(fullUrl);
            String host = parsed.getHost() == null ? "" : parsed.getHost().toLowerCase();
            if (!host.equals(HOST) && !host.endsWith("." + HOST)) {
                Log.e(TAG, "downloadMediaFromWeb rejected: untrusted host " + host);
                return "";
            }
        } catch (Exception e) {
            Log.e(TAG, "downloadMediaFromWeb invalid url: " + fullUrl, e);
            return "";
        }

        final String safeKind = "video".equalsIgnoreCase(kind) ? "video" : "audio";
        final String safeMime = (mimeType != null && !mimeType.isEmpty())
                ? mimeType
                : (safeKind.equals("video") ? "video/mp4" : "audio/mpeg");

        final String finalName = sanitizeFilename(filename, safeKind);
        Log.d(TAG, "Sanitized filename for download: original='" + filename + "' -> sanitized='" + finalName + "'");

        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            pendingDownload = new PendingDownload(fullUrl, finalName, safeMime, safeKind);
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE));
            return "pending_permission";
        }

        return executeDownload(fullUrl, finalName, safeMime, safeKind);
    }

    // Unduhan memakai koneksi sendiri (bukan DownloadManager) agar progres nyata, galat server
    // terbaca jelas, dan notifikasi progres selalu tampil. DownloadManager sering macet di
    // status PENDING tanpa pesan sehingga tampilan terjebak di "mengirim ke Download Manager".
    private String executeDownload(String url, String filename, String mimeType, String kind) {
        final long id = ownDownloadSeq.incrementAndGet();
        runOnUiThread(() -> {
            Toast.makeText(MainActivity.this, "Mengunduh " + (kind.equals("video") ? "MP4" : "MP3") + "...", Toast.LENGTH_SHORT).show();
            if (Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
            }
        });
        new Thread(() -> runOwnDownload(id, url, filename, mimeType, kind), "am-download-" + id).start();
        return String.valueOf(id);
    }

    private void runOwnDownload(long id, String url, String filename, String mimeType, String kind) {
        HttpURLConnection conn = null;
        InputStream in = null;
        OutputStream out = null;
        Uri outUri = null;
        File outFile = null;
        Uri doneUri = null;
        boolean notifiedByScan = false;
        String error = null;
        long soFar = 0;
        long total = -1;
        final NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        final int notifId = (int) (id % 100000L) + 5000;
        try {
            ensureDownloadChannel(nm);
            notifyDownload(nm, notifId, filename, "Menghubungkan ke server...", 0, true, true, false);

            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(60000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("Accept-Encoding", "identity");
            if (appUserAgent != null) conn.setRequestProperty("User-Agent", appUserAgent);
            try {
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
            } catch (Exception ignored) {
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IOException(httpErrorMessage(conn, code));
            }
            total = conn.getContentLengthLong();

            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                outUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (outUri == null) throw new IOException("Gagal membuat file di folder Download");
                out = getContentResolver().openOutputStream(outUri);
                if (out == null) throw new IOException("Gagal membuka file tujuan");
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Folder Download tidak bisa dibuat");
                outFile = uniqueFile(dir, filename);
                out = new FileOutputStream(outFile);
            }

            in = conn.getInputStream();
            byte[] buf = new byte[64 * 1024];
            long lastReport = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                soFar += n;
                long now = SystemClock.elapsedRealtime();
                if (now - lastReport >= 400) {
                    lastReport = now;
                    reportOwnProgress(id, kind, filename, nm, notifId, soFar, total);
                }
            }
            out.flush();
            if (soFar <= 0) throw new IOException("Server mengirim file kosong");
            out.close();
            out = null;

            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContentResolver().update(outUri, done, null, null);
                doneUri = outUri;
                rememberFinished(id, doneUri, mimeType, filename);
            } else if (outFile != null) {
                // Android 9 ke bawah: dapatkan content:// Uri dari MediaStore lewat scan, lalu
                // notifikasi selesai dibuat dari callback agar bisa membuka/membagikan file.
                notifiedByScan = true;
                MediaScannerConnection.scanFile(this, new String[]{outFile.getAbsolutePath()}, new String[]{mimeType},
                        (scanPath, scanUri) -> {
                            rememberFinished(id, scanUri, mimeType, filename);
                            postDoneNotification(nm, notifId, filename, mimeType, scanUri);
                        });
            }
        } catch (Exception e) {
            error = e.getMessage() != null && !e.getMessage().isEmpty() ? e.getMessage() : e.getClass().getSimpleName();
            Log.e(TAG, "Own download failed: " + url, e);
            try {
                if (out != null) out.close();
            } catch (Exception ignored) {
            }
            out = null;
            try {
                if (outUri != null) getContentResolver().delete(outUri, null, null);
                if (outFile != null) outFile.delete();
            } catch (Exception ignored) {
            }
        } finally {
            try {
                if (in != null) in.close();
            } catch (Exception ignored) {
            }
            try {
                if (out != null) out.close();
            } catch (Exception ignored) {
            }
            if (conn != null) conn.disconnect();
        }

        final String fError = error;
        if (fError == null) {
            if (!notifiedByScan) postDoneNotification(nm, notifId, filename, mimeType, doneUri);
            runOnUiThread(() -> {
                Toast.makeText(MainActivity.this, "Tersimpan di folder Download: " + filename, Toast.LENGTH_LONG).show();
                if (web != null) {
                    web.evaluateJavascript(
                        String.format(Locale.US,
                            "window.onAMFinderDownloadEvent && window.onAMFinderDownloadEvent({ id: %d, kind: '%s', status: 'success', filename: %s });",
                            id, kind, JSONObject.quote(filename)),
                        null);
                }
            });
        } else {
            final String message = "Unduhan gagal: " + fError;
            postErrorNotification(nm, notifId, filename, message);
            runOnUiThread(() -> {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
                if (web != null) {
                    web.evaluateJavascript(
                        String.format(Locale.US,
                            "window.onAMFinderDownloadEvent && window.onAMFinderDownloadEvent({ id: %d, kind: '%s', status: 'error', message: %s });",
                            id, kind, JSONObject.quote(message)),
                        null);
                }
            });
        }
    }

    private void reportOwnProgress(long id, String kind, String filename, NotificationManager nm, int notifId, long soFar, long total) {
        final int percent = total > 0 ? (int) Math.min(100L, (soFar * 100L) / total) : 0;
        final String text = total > 0
                ? percent + "%"
                : String.format(Locale.US, "%.1f MB", soFar / 1048576.0);
        notifyDownload(nm, notifId, filename, text, percent, total <= 0, true, false);
        final long fSoFar = soFar;
        final long fTotal = total;
        runOnUiThread(() -> {
            if (web != null) {
                web.evaluateJavascript(
                    String.format(Locale.US,
                        "window.onAMFinderDownloadProgress && window.onAMFinderDownloadProgress(%d, '%s', %d, %d, %d);",
                        id, kind, fSoFar, fTotal, percent),
                    null);
            }
        });
    }

    private void ensureDownloadChannel(NotificationManager nm) {
        if (nm == null || Build.VERSION.SDK_INT < 26) return;
        if (nm.getNotificationChannel(DL_CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(DL_CHANNEL, "Unduhan", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Progres unduhan video dan audio");
            nm.createNotificationChannel(ch);
        }
    }

    private void notifyDownload(NotificationManager nm, int notifId, String title, String text,
                                int percent, boolean indeterminate, boolean ongoing, boolean done) {
        if (nm == null) return;
        try {
            Notification.Builder b = new Notification.Builder(this, DL_CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_amfinder)
                    .setLargeIcon(largeLogo())
                    .setColor(0xFF10B981)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setOngoing(ongoing)
                    .setOnlyAlertOnce(true)
                    .setAutoCancel(!ongoing);
            if (ongoing) b.setProgress(100, Math.max(0, percent), indeterminate);
            if (done) {
                Intent view = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                b.setContentIntent(PendingIntent.getActivity(this, notifId, view,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            }
            nm.notify(notifId, b.build());
        } catch (Exception ignored) {
        }
    }


    private void rememberFinished(long id, Uri uri, String mimeType, String filename) {
        if (uri != null) finishedDownloads.put(id, new FinishedDownload(uri, mimeType, filename));
    }

    private Intent buildViewIntent(Uri uri, String mimeType) {
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, mimeType);
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return view;
    }

    private Intent buildShareIntent(Uri uri, String mimeType, String filename) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, "Bagikan " + filename);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return chooser;
    }

    private Intent buildFolderIntent() {
        Intent folder = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
        folder.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return folder;
    }

    private boolean launchOnUi(Intent intent, String failMessage) {
        runOnUiThread(() -> {
            try {
                startActivity(intent);
            } catch (Exception e) {
                Toast.makeText(MainActivity.this, failMessage, Toast.LENGTH_SHORT).show();
            }
        });
        return true;
    }

    // Dipanggil dari tombol aksi di kartu unduhan (JS bridge).
    public boolean openFinishedDownload(long id) {
        FinishedDownload f = finishedDownloads.get(id);
        if (f == null) return false;
        return launchOnUi(buildViewIntent(f.uri, f.mimeType), "Tidak ada aplikasi untuk membuka file ini");
    }

    public boolean shareFinishedDownload(long id) {
        FinishedDownload f = finishedDownloads.get(id);
        if (f == null) return false;
        return launchOnUi(buildShareIntent(f.uri, f.mimeType, f.filename), "Tidak bisa membagikan file ini");
    }

    public boolean openDownloadsFolder() {
        return launchOnUi(buildFolderIntent(), "Tidak bisa membuka folder Download");
    }

    private android.graphics.Bitmap notifLargeIcon;

    // Logo berwarna AM Finder untuk sisi kiri notifikasi (ikon kecil status bar hanya bisa siluet).
    private android.graphics.Bitmap largeLogo() {
        if (notifLargeIcon == null) {
            try {
                // Ikon launcher bersifat adaptif (XML), jadi digambar ke bitmap, bukan di-decode langsung.
                android.graphics.drawable.Drawable d = getResources().getDrawable(R.mipmap.ic_launcher, getTheme());
                int size = 192;
                android.graphics.Bitmap bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888);
                android.graphics.Canvas canvas = new android.graphics.Canvas(bmp);
                d.setBounds(0, 0, size, size);
                d.draw(canvas);
                notifLargeIcon = bmp;
            } catch (Exception ignored) {
            }
        }
        return notifLargeIcon;
    }

    private PendingIntent actionIntent(int requestCode, Intent intent) {
        return PendingIntent.getActivity(this, requestCode, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // Notifikasi selesai: ketuk = buka file langsung di pemutar bawaan; tombol Buka, Bagikan, Folder.
    private void postDoneNotification(NotificationManager nm, int notifId, String filename, String mimeType, Uri uri) {
        if (nm == null) return;
        try {
            ensureDownloadChannel(nm);
            Notification.Builder b = new Notification.Builder(this, DL_CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_amfinder)
                    .setLargeIcon(largeLogo())
                    .setColor(0xFF10B981)
                    .setContentTitle(filename)
                    .setContentText(uri != null ? "Unduhan selesai. Ketuk untuk membuka." : "Unduhan selesai. Ketuk untuk membuka folder Download.")
                    .setOngoing(false)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(true);

            PendingIntent folderPi = actionIntent(notifId * 3 + 2, buildFolderIntent());

            if (uri != null) {
                PendingIntent openPi = actionIntent(notifId * 3, buildViewIntent(uri, mimeType));
                b.setContentIntent(openPi);
                b.addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, android.R.drawable.ic_menu_view), "Buka", openPi).build());

                b.addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, android.R.drawable.ic_menu_share), "Bagikan",
                        actionIntent(notifId * 3 + 1, buildShareIntent(uri, mimeType, filename))).build());
            } else {
                b.setContentIntent(folderPi);
            }
            b.addAction(new Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_menu_agenda), "Folder", folderPi).build());
            nm.notify(notifId, b.build());
        } catch (Exception ignored) {
        }
    }

    private void postErrorNotification(NotificationManager nm, int notifId, String filename, String message) {
        if (nm == null) return;
        try {
            ensureDownloadChannel(nm);
            nm.notify(notifId, new Notification.Builder(this, DL_CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_amfinder)
                    .setLargeIcon(largeLogo())
                    .setColor(0xFFEF4444)
                    .setContentTitle(filename)
                    .setContentText(message)
                    .setStyle(new Notification.BigTextStyle().bigText(message))
                    .setOngoing(false)
                    .setAutoCancel(true)
                    .build());
        } catch (Exception ignored) {
        }
    }

    private File uniqueFile(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            f = new File(dir, base + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }

    private String httpErrorMessage(HttpURLConnection conn, int code) {
        String detail = "";
        try {
            InputStream es = conn.getErrorStream();
            if (es != null) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] b = new byte[1024];
                int n;
                int read = 0;
                while (read < 4096 && (n = es.read(b)) != -1) {
                    bo.write(b, 0, n);
                    read += n;
                }
                es.close();
                String body = bo.toString("UTF-8");
                try {
                    detail = new JSONObject(body).optString("error", "");
                } catch (Exception ignored) {
                }
                if (detail.isEmpty() && body.length() < 160) detail = body.trim();
            }
        } catch (Exception ignored) {
        }
        return detail.isEmpty() ? "Server membalas HTTP " + code : detail + " (HTTP " + code + ")";
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code != REQ_STORAGE) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            if (pendingDownload != null) {
                executeDownload(pendingDownload.url, pendingDownload.filename, pendingDownload.mimeType, pendingDownload.kind);
            }
        } else {
            Toast.makeText(this, "Izin penyimpanan dibutuhkan untuk mengunduh", Toast.LENGTH_SHORT).show();
        }
        pendingDownload = null;
    }

    private FrameLayout buildSplash() {
        FrameLayout box = new FrameLayout(this);
        box.setBackgroundColor(BG);

        video = new VideoView(this);
        video.setVideoURI(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.loading));
        video.setOnPreparedListener(mp -> {
            videoReady = true;
            videoDurationMs = mp.getDuration();
            mp.setLooping(true);
            mp.setVolume(0f, 0f);
            mp.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING);
            if (!splashHidden) video.start();
        });
        video.setOnErrorListener((mp, what, extra) -> {
            videoReady = false;
            hideSplash();
            return true;
        });

        box.addView(video, matchParent());
        return box;
    }

    private FrameLayout buildProgress() {
        FrameLayout track = new FrameLayout(this);
        track.setBackgroundColor(0x2EFFFFFF);
        track.setVisibility(View.INVISIBLE);

        progressFill = new View(this);
        progressFill.setBackground(new ColorDrawable(ACCENT));
        track.addView(progressFill, new FrameLayout.LayoutParams(0,
                ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START));
        return track;
    }

    private void updateProgress(int percent) {
        int clamped = Math.max(0, Math.min(100, percent));
        int width = (int) (getResources().getDisplayMetrics().widthPixels * (clamped / 100f));
        ViewGroup.LayoutParams lp = progressFill.getLayoutParams();
        if (lp.width != width) {
            lp.width = width;
            progressFill.setLayoutParams(lp);
        }
    }

    private void showProgress() {
        clearCompleteTask();
        progressTrack.animate().cancel();
        progressTrack.setAlpha(1f);
        progressTrack.setVisibility(View.VISIBLE);
        updateProgress(0);
    }

    private void completeProgress() {
        if (progressTrack.getVisibility() != View.VISIBLE || completeProgressTask != null) return;
        updateProgress(100);
        completeProgressTask = () -> {
            completeProgressTask = null;
            progressTrack.animate().alpha(0f).setDuration(200).withEndAction(() -> {
                progressTrack.setVisibility(View.INVISIBLE);
                progressTrack.setAlpha(1f);
                updateProgress(0);
            }).start();
        };
        progressTrack.postDelayed(completeProgressTask, 250);
    }

    private void cancelProgress() {
        clearCompleteTask();
        progressTrack.animate().cancel();
        progressTrack.setVisibility(View.INVISIBLE);
        progressTrack.setAlpha(1f);
        updateProgress(0);
    }

    private void clearCompleteTask() {
        if (completeProgressTask != null) {
            progressTrack.removeCallbacks(completeProgressTask);
            completeProgressTask = null;
        }
    }

    private void hideSplash() {
        if (splashHidden) return;
        splashHidden = true;
        splash.removeCallbacks(splashFinisher);
        splash.animate().alpha(0f).setDuration(280).withEndAction(() -> {
            splash.setVisibility(View.GONE);
            if (video != null) video.stopPlayback();
        }).start();
    }

    public boolean openContentFromWeb(String url, String platform, String contentId) {
        runOnUiThread(() -> {
            boolean handled = false;
            if ("tiktok".equalsIgnoreCase(platform) || (url != null && url.contains("tiktok.com"))) {
                handled = openTikTok(contentId, url);
            } else if ("youtube".equalsIgnoreCase(platform) || (url != null && (url.contains("youtube.com") || url.contains("youtu.be")))) {
                handled = openYouTube(contentId, url);
            } else if (url != null && !url.trim().isEmpty()) {
                handled = openExternal(Uri.parse(url));
            }
            if (!handled && url != null && !url.trim().isEmpty()) {
                openExternalFallback(Uri.parse(url));
            }
        });
        return true;
    }

    private boolean openTikTok(String videoId, String webUrl) {
        String[] tiktokPackages = new String[] {
            "com.zhiliaoapp.musically",
            "com.ss.android.ugc.trill",
            "com.zhiliaoapp.musically.go"
        };
        PackageManager pm = getPackageManager();
        String installedPackage = null;
        for (String pkg : tiktokPackages) {
            try {
                pm.getPackageInfo(pkg, 0);
                installedPackage = pkg;
                break;
            } catch (Exception ignored) {
            }
        }

        if (installedPackage != null) {
            if (videoId != null && videoId.matches("^\\d{15,25}$")) {
                String deepScheme = installedPackage.contains("trill") ? "snssdk1180" : "snssdk1233";
                String deepUri = deepScheme + "://aweme/detail/" + videoId;
                try {
                    Intent deepIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepUri));
                    deepIntent.setPackage(installedPackage);
                    deepIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(deepIntent);
                    return true;
                } catch (Exception e) {
                    Log.w(TAG, "Failed deep link to TikTok: " + deepUri, e);
                }
            }

            String targetUrl = (webUrl != null && !webUrl.isEmpty())
                    ? webUrl
                    : (videoId != null ? ("https://www.tiktok.com/@/video/" + videoId) : null);
            if (targetUrl != null) {
                try {
                    Intent appIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl));
                    appIntent.setPackage(installedPackage);
                    appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(appIntent);
                    return true;
                } catch (Exception e) {
                    Log.w(TAG, "Failed package intent to TikTok: " + targetUrl, e);
                }
            }
        }

        String browserUrl = (webUrl != null && !webUrl.isEmpty())
                ? webUrl
                : (videoId != null ? ("https://www.tiktok.com/@/video/" + videoId) : null);
        if (browserUrl != null) {
            return openExternalFallback(Uri.parse(browserUrl));
        }
        return false;
    }

    private boolean openYouTube(String videoId, String webUrl) {
        String ytPackage = "com.google.android.youtube";
        PackageManager pm = getPackageManager();
        boolean isYtInstalled = false;
        try {
            pm.getPackageInfo(ytPackage, 0);
            isYtInstalled = true;
        } catch (Exception ignored) {}

        if (isYtInstalled) {
            if (videoId != null && !videoId.isEmpty()) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:" + videoId));
                    intent.setPackage(ytPackage);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    return true;
                } catch (Exception ignored) {}
            }
            if (webUrl != null && !webUrl.isEmpty()) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(webUrl));
                    intent.setPackage(ytPackage);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    return true;
                } catch (Exception ignored) {}
            }
        }

        String browserUrl = (webUrl != null && !webUrl.isEmpty())
                ? webUrl
                : (videoId != null ? ("https://www.youtube.com/watch?v=" + videoId) : null);
        if (browserUrl != null) {
            return openExternalFallback(Uri.parse(browserUrl));
        }
        return false;
    }

    private boolean openExternalFallback(Uri uri) {
        if (uri == null) return false;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "openExternalFallback failed for " + uri, e);
            runOnUiThread(() -> Toast.makeText(this, "Tidak ada aplikasi untuk membuka tautan", Toast.LENGTH_SHORT).show());
            return false;
        }
    }

    private boolean handleUrlOverride(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null) return false;
        if (scheme.equalsIgnoreCase("blob") || scheme.equalsIgnoreCase("data")
                || scheme.equalsIgnoreCase("javascript") || scheme.equalsIgnoreCase("about")) {
            return true;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        if (host.equals(HOST) || host.endsWith("." + HOST)) {
            return false;
        }

        // Tautan eksternal: buka keluar dan SELALU return true agar tidak pernah dimuat di WebView internal!
        openExternal(uri);
        return true;
    }

    private boolean openExternal(Uri uri) {
        if (uri == null) return false;
        try {
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            if (host.contains("tiktok.com")) {
                String path = uri.getPath();
                String videoId = null;
                if (path != null) {
                    java.util.regex.Matcher m = java.util.regex.Pattern.compile("/video/(\\d+)").matcher(path);
                    if (m.find()) {
                        videoId = m.group(1);
                    }
                }
                return openTikTok(videoId, uri.toString());
            } else if (host.contains("youtube.com") || host.contains("youtu.be")) {
                String videoId = uri.getQueryParameter("v");
                return openYouTube(videoId, uri.toString());
            }
            return openExternalFallback(uri);
        } catch (Exception e) {
            Log.e(TAG, "openExternal failed for " + uri, e);
            return false;
        }
    }

    private View buildOfflinePanel() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(64, 64, 64, 64);
        box.setBackgroundColor(BG);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextSize(20);
        title.setTextColor(0xFFFFFFFF);
        title.setGravity(Gravity.CENTER);

        TextView body = new TextView(this);
        body.setText(R.string.offline_body);
        body.setTextSize(14);
        body.setTextColor(0xFFB8B8BE);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, 24, 0, 0);

        box.addView(title);
        box.addView(body);
        box.setVisibility(View.GONE);
        return box;
    }

    private void showOffline() {
        offlinePanel.setVisibility(View.VISIBLE);
        web.setVisibility(View.INVISIBLE);
    }

    private void hideOffline() {
        offlinePanel.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                || caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private FrameLayout.LayoutParams matchParent() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        web.onPause();
        if (!splashHidden && videoReady) video.pause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (!splashHidden && videoReady) video.start();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        pollerHandler.removeCallbacks(progressPollerRunnable);
        try {
            unregisterReceiver(downloadDone);
        } catch (Exception ignored) {
        }
        if (video != null) {
            video.stopPlayback();
            video = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
