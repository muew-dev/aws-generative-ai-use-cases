export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  snapshotSerializers: ['<rootDir>/test/snapshot-plugin.ts'],
  // テスト実行設定 - 決定的な実行のため
  maxWorkers: 1, // 並行実行を無効にしてToken順序を安定化
  testTimeout: 30000,
  // CDKトークンの決定性を保証する追加設定
  forceExit: true, // テスト完了後に強制終了
  clearMocks: true, // モック状態をリセット
  resetMocks: true, // モック実装をリセット
  restoreMocks: true, // 元のモックを復元
  // カバレッジ設定
  collectCoverage: true,
  collectCoverageFrom: [
    'lib/**/*.ts',
    '!lib/**/*.d.ts',
    '!lib/**/index.ts',
    '!**/*.test.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 45,
      lines: 70,
      statements: 70,
    },
  },
};
