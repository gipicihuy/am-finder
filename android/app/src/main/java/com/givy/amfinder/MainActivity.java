package com.givy.amfinder;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final String HOME = "https://amfinder.web.id/";
    private static final String HOST = "amfinder.web.id";

    private WebView web;
    private View offlinePanel;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        offlinePanel = buildOfflinePanel();

        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(offlinePanel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
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

        web.setWebViewClient(new WebViewClient() {
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
                if (req.isForMainFrame()) showOffline();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                hideOffline();
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
        box.setBackgroundColor(0xFF0F0F10);

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

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
