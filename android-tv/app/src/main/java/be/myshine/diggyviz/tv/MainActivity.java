package be.myshine.diggyviz.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * DiggyViz voor Android TV: opent de live webapp schermvullend in een WebView.
 * De visuals zelf staan online (GitHub Pages), dus updates komen vanzelf mee.
 *
 * Afstandsbediening:
 *  links/rechts  -> vorige/volgende visual (afgehandeld door de webapp)
 *  OK            -> knoppen tonen/verbergen of een knop kiezen
 *  MENU          -> instellingen openen (Spotify, Last.fm, koppelcode)
 *  TERUG         -> open venster sluiten, anders de app verlaten
 */
public class MainActivity extends Activity {

    static final String HOME = "https://myshine-be.github.io/diggyviz/";
    WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // login en instellingen (localStorage rv.*)
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme();
                // Spotify-login en de site zelf blijven in de app; vreemde schema's (bv. retroviz://) negeren.
                return !("https".equals(scheme) || "http".equals(scheme));
            }
        });

        setContentView(web);
        hideSystemUi();

        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME);
        web.requestFocus();
    }

    void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            web.evaluateJavascript("document.getElementById('settingsBtn')&&document.getElementById('settingsBtn').click()", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {
        // Eerst een open venster (instellingen) sluiten, dan pas terug of afsluiten.
        web.evaluateJavascript(
                "(function(){var s=document.getElementById('settings');"
                        + "if(s&&!s.hidden){var c=document.getElementById('closeSettings');if(c)c.click();return 'closed';}"
                        + "return 'none';})()",
                result -> {
                    if (result != null && result.contains("closed")) return;
                    if (web.canGoBack()) web.goBack();
                    else finish();
                });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); hideSystemUi(); }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

    @Override
    protected void onDestroy() { web.destroy(); super.onDestroy(); }

    @Override
    protected void onNewIntent(Intent intent) { super.onNewIntent(intent); }
}
