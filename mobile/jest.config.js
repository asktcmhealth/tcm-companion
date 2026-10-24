module.exports = {
  preset: '@react-native/jest-preset',
  // __tests__/desktopEdits.test.ts also runs ../app/src/edits.ts, which lives
  // outside this package and so needs this package's node_modules to resolve
  // the transform's helper imports.
  modulePaths: ['<rootDir>/node_modules'],
};
