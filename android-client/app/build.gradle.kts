plugins { id("com.android.application") }

android {
    namespace = "in.hcworks.leos.lan"
    compileSdk = 35

    defaultConfig {
        applicationId = "in.hcworks.leos.lan"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.5.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.android.material:material:1.13.0")
}
