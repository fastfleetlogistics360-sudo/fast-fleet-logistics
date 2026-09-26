package com.fastfleetlogistics.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;

/**
 * Allows the web layer to verify that the installed Android binary includes the
 * resources generated from google-services.json, without touching Firebase.
 */
@CapacitorPlugin(name = "NativePushReadiness")
public class NativePushReadinessPlugin extends Plugin {
    @PluginMethod
    public void check(PluginCall call) {
        int appIdResource = getContext()
            .getResources()
            .getIdentifier("google_app_id", "string", getContext().getPackageName());

        boolean ready = false;
        if (appIdResource != 0) {
            String appId = getContext().getString(appIdResource);
            ready = appId != null && appId.startsWith("1:");
        }

        JSObject result = new JSObject();
        result.put("ready", ready);
        call.resolve(result);
    }
}
