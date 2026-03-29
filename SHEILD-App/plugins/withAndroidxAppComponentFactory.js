const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const ANDROIDX_APP_COMPONENT_FACTORY = "androidx.core.app.CoreComponentFactory";
const FOREGROUND_SERVICE_GRADLE_RELATIVE_PATH = path.join(
  "node_modules",
  "@supersami",
  "rn-foreground-service",
  "android",
  "build.gradle"
);
const VOICE_GRADLE_RELATIVE_PATH = path.join(
  "node_modules",
  "@react-native-voice",
  "voice",
  "android",
  "build.gradle"
);
const LEGACY_REACT_NATIVE_DEP = "implementation 'com.facebook.react:react-native:+'";
const MODERN_REACT_ANDROID_DEP = "implementation 'com.facebook.react:react-android'";
const LEGACY_SUPPORT_APPCOMPAT_DEP =
  'implementation "com.android.support:appcompat-v7:${supportVersion}"';
const ANDROIDX_APPCOMPAT_DEP =
  'implementation "androidx.appcompat:appcompat:1.7.0"';

module.exports = function withAndroidxAppComponentFactory(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];

    if (!application) {
      return config;
    }

    application.$ = application.$ || {};
    application.$["android:appComponentFactory"] = ANDROIDX_APP_COMPONENT_FACTORY;

    const existingToolsReplace = application.$["tools:replace"];
    const replaceValues = new Set(
      String(existingToolsReplace || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    );
    replaceValues.add("android:appComponentFactory");
    application.$["tools:replace"] = Array.from(replaceValues).join(",");

    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const filesToPatch = [
        FOREGROUND_SERVICE_GRADLE_RELATIVE_PATH,
        VOICE_GRADLE_RELATIVE_PATH,
      ];

      for (const relativePath of filesToPatch) {
        const gradleFilePath = path.join(
          config.modRequest.projectRoot,
          relativePath
        );

        if (!fs.existsSync(gradleFilePath)) {
          continue;
        }

        const currentContents = fs.readFileSync(gradleFilePath, "utf8");
        let nextContents = currentContents.replace(
          LEGACY_REACT_NATIVE_DEP,
          MODERN_REACT_ANDROID_DEP
        );
        nextContents = nextContents.replace(
          LEGACY_SUPPORT_APPCOMPAT_DEP,
          ANDROIDX_APPCOMPAT_DEP
        );

        if (nextContents !== currentContents) {
          fs.writeFileSync(gradleFilePath, nextContents);
        }
      }

      return config;
    },
  ]);

  return config;
};
