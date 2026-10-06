package com.givy.amfinder;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.drawable.ColorDrawable;
import android.media.MediaPlayer;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
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
    private static final long MIN_SPLASH_MS = 1000;

    private WebView web;
    private FrameLayout splash;
    private VideoView video;
    private FrameLayout progressTrack;
    private View progressFill;
    private View offlinePanel;

    private long splashStart;
    private boolean splashHidden;
    private boolean videoReady;
    private boolean firstPageLoaded;
    private Runnable completeProgressTask;

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
                    hideSplash(true);
                    cancelProgress();
                    showOffline();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!firstPageLoaded) {
                    firstPageLoaded = true;
                    hideSplash(false);
                }
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
    }

    private FrameLayout buildSplash() {
        FrameLayout box = new FrameLayout(this);
        box.setBackgroundColor(BG);

        video = new VideoView(this);
        video.setVideoURI(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.loading));
        video.setOnPreparedListener(mp -> {
            videoReady = true;
            mp.setLooping(true);
            mp.setVolume(0f, 0f);
            mp.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING);
            if (!splashHidden) video.start();
        });
        video.setOnErrorListener((mp, what, extra) -> {
            videoReady = false;
            hideSplash(true);
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

    private void hideSplash(boolean immediate) {
        if (splashHidden) return;
        splashHidden = true;
        long elapsed = SystemClock.uptimeMillis() - splashStart;
        long wait = immediate ? 0 : Math.max(0, MIN_SPLASH_MS - elapsed);
        splash.postDelayed(() -> {
            splash.animate().alpha(0f).setDuration(280).withEndAction(() -> {
                splash.setVisibility(View.GONE);
                if (video != null) video.stopPlayback();
            }).start();
        }, wait);
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
