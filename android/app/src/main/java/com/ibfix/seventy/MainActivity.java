package com.ibfix.seventy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (npm plugins are registered automatically).
        registerPlugin(HealthConnectPlugin.class);
        registerPlugin(AppIconPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
