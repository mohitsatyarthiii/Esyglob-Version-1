const androidConfig = require('@react-native-community/cli-config-android');

module.exports = {
  platforms: {
    android: {
      dependencyConfig: androidConfig.dependencyConfig,
      projectConfig: androidConfig.projectConfig,
    },
  },
  project: {
    android: {
      sourceDir: './android',
    },
  },
};
