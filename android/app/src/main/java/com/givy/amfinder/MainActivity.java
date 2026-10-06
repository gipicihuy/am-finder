package com.givy.amfinder;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.drawable.ColorDrawable;
import android.media.MediaPlayer;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
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

public class MainActivity extends Activity {

    private static final String HOME = "https://amfinder.web.id/";
    private static final String HOST = "amfinder.web.id";
    private static final int ACCENT = 0xFF05FAA8;
    private static final int BG = 0xFF0F0F10;
    private static final long MAX_SPLASH_MS = 10000;
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
    private Runnable completeProgressTask;

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
                return openExternal(req.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternal(Uri.parse(url));
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

    private boolean openExternal(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        if (host.equals(HOST) || host.endsWith("." + HOST)) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            Toast.makeText(this, "Gak ada aplikasi buat buka link ini", Toast.LENGTH_SHORT).show();
        }
        return true;
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
