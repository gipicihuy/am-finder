# WebView: biarkan API web bawaan tetap utuh
-keep class android.webkit.** { *; }
-dontwarn android.webkit.**

# App ini tanpa library eksternal, sisanya aman disusutkan
-dontwarn javax.annotation.**
