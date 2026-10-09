package com.fastfleetlogistics.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register before the bridge starts so the web layer can prove that this
        // binary was built with Firebase configuration before asking permission.
        registerPlugin(NativePushReadinessPlugin.class);
        super.onCreate(savedInstanceState);
        openPaymentReturn(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openPaymentReturn(intent);
    }

    private void openPaymentReturn(Intent intent) {
        Uri deepLink = intent == null ? null : intent.getData();
        if (deepLink == null || !"fastfleets360".equals(deepLink.getScheme()) || !"payment-return".equals(deepLink.getHost())) return;

        String callbackUrl = deepLink.getQueryParameter("url");
        Uri callback = callbackUrl == null ? null : Uri.parse(callbackUrl);
        if (callback == null || !"https".equals(callback.getScheme()) ||
            !("fastfleet.com.ng".equals(callback.getHost()) || "www.fastfleet.com.ng".equals(callback.getHost())) ||
            !"/delivery/callback".equals(callback.getPath()) && !"/payment/callback".equals(callback.getPath())) return;

        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(callbackUrl));
    }
}
