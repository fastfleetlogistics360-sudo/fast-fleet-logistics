package com.fastfleetlogistics.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register before the bridge starts so the web layer can prove that this
        // binary was built with Firebase configuration before asking permission.
        registerPlugin(NativePushReadinessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
