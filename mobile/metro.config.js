const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
// pinyin-pro ships ESM-only internals (.mjs) that its own "module"/"exports"
// fields point to; Metro's default sourceExts doesn't include "mjs", so its
// resolver reports files that genuinely exist on disk as unresolvable.
const config = {
  resolver: {
    sourceExts: ['mjs', 'js', 'jsx', 'ts', 'tsx', 'json'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
