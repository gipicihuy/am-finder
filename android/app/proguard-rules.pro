# WebView: biarkan API web bawaan tetap utuh
-keep class android.webkit.** { *; }
-dontwarn android.webkit.**

# Penting: Pertahankan anotasi dan method JavascriptInterface untuk WebView bridge
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.givy.amfinder.MainActivity$AMFinderNativeBridge { *; }

# App ini tanpa library eksternal, sisanya aman disusutkan
-dontwarn javax.annotation.**
