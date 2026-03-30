package com.anonymous.SHEILDApp

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GuardianModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "GuardianModule"

    @ReactMethod
    fun start() {
        val intent = Intent(reactApplicationContext, GuardianService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }

    @ReactMethod
    fun stop() {
        val intent = Intent(reactApplicationContext, GuardianService::class.java)
        reactApplicationContext.stopService(intent)
    }
}
