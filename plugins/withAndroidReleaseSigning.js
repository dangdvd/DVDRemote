// Signs Android release builds with the keystore given through environment variables
// (set by the release workflow from GitHub secrets). Without them, release builds keep the
// template's debug signing, which still produces an installable APK.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING = `
        release {
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('ANDROID_KEYSTORE_PATH')) return cfg;

    const debugBlock = /(signingConfigs \{\s*debug \{[^}]*\})/;
    const releaseUsesDebug = /(release \{[^}]*?)signingConfig signingConfigs\.debug/;
    if (!debugBlock.test(gradle) || !releaseUsesDebug.test(gradle)) {
      throw new Error('withAndroidReleaseSigning: unexpected android/app/build.gradle layout');
    }
    gradle = gradle.replace(debugBlock, `$1${RELEASE_SIGNING}`);
    gradle = gradle.replace(
      releaseUsesDebug,
      '$1signingConfig System.getenv("ANDROID_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug',
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
