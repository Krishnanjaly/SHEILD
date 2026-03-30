const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

function upsertGradleProperty(contents, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) {
    return contents.replace(pattern, `${key}=${value}`);
  }
  return `${contents.trimEnd()}\n${key}=${value}\n`;
}

module.exports = function withAndroidBuildDefaults(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const gradlePropertiesPath = path.join(
        modConfig.modRequest.projectRoot,
        "android",
        "gradle.properties"
      );

      if (!fs.existsSync(gradlePropertiesPath)) {
        return modConfig;
      }

      let contents = fs.readFileSync(gradlePropertiesPath, "utf8");

      // Keep local Windows builds off the long CMake paths that break release builds.
      contents = upsertGradleProperty(
        contents,
        "reactNativeArchitectures",
        "arm64-v8a"
      );
      contents = upsertGradleProperty(contents, "android.useAndroidX", "true");
      contents = upsertGradleProperty(contents, "android.enableJetifier", "true");

      fs.writeFileSync(gradlePropertiesPath, contents);
      return modConfig;
    },
  ]);
};
