package com.ibfix.seventy

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView

/**
 * Health Connect privacy-policy / permissions-rationale screen: the app's Hebrew privacy page
 * (data is read only to show it in the app and never leaves the phone).
 */
class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0B0D10"))
        web.loadUrl("file:///android_asset/public/privacy.html")
        setContentView(web)
    }
}
