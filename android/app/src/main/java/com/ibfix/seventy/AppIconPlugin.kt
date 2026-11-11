package com.ibfix.seventy

import android.content.ComponentName
import android.content.pm.PackageManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * "אייקון משתנה כל יום": the launcher icon is one of 7 activity-aliases (Icon_flame … Icon_champagne),
 * exactly one enabled. JS decides when (only when the app goes to the background, once a day).
 * JS: getActive() → { name } · setActive({ name }) → { name }
 */
@CapacitorPlugin(name = "AppIcon")
class AppIconPlugin : Plugin() {

    private val names = listOf("flame", "ruby", "cobalt", "lime", "magenta", "silver", "champagne")

    private fun component(name: String) = ComponentName(context.packageName, "${context.packageName}.Icon_$name")

    private fun isEnabled(name: String): Boolean {
        return when (context.packageManager.getComponentEnabledSetting(component(name))) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED -> false
            else -> name == "flame" // manifest default
        }
    }

    @PluginMethod
    fun getActive(call: PluginCall) {
        call.resolve(JSObject().put("name", names.firstOrNull { isEnabled(it) } ?: "flame"))
    }

    @PluginMethod
    fun setActive(call: PluginCall) {
        val name = call.getString("name") ?: "flame"
        if (name !in names) {
            call.reject("unknown icon")
            return
        }
        val pm = context.packageManager
        // Enable the new alias first so a launcher entry always exists, then disable the others.
        pm.setComponentEnabledSetting(component(name), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        for (other in names) {
            if (other != name) {
                pm.setComponentEnabledSetting(component(other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
            }
        }
        call.resolve(JSObject().put("name", name))
    }
}
