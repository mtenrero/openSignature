/** @type {import('jest').Config} */
const tsJestTransform = ['ts-jest', {
  tsconfig: {
    jsx: 'react-jsx',
    esModuleInterop: true,
    allowJs: true,
    module: 'commonjs',
    target: 'es2020',
    moduleResolution: 'node',
    skipLibCheck: true,
    isolatedModules: true,
    baseUrl: '.',
    paths: { '@/*': ['./*'] },
  },
}]

const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/$1',
  '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  // nanoid v5 ships pure ESM that ts-jest cannot transform; use a CJS stand-in for tests
  '^nanoid$': '<rootDir>/__tests__/helpers/nanoidMock.ts',
}

module.exports = {
  projects: [
    {
      displayName: 'unit-node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/__tests__/unit/**/*.test.ts',
        '<rootDir>/lib/**/*.test.ts',
      ],
      moduleNameMapper,
      transform: { '^.+\\.tsx?$': tsJestTransform },
    },
    {
      displayName: 'unit-jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/__tests__/unit/**/*.test.tsx'],
      moduleNameMapper,
      transform: { '^.+\\.tsx?$': tsJestTransform },
      setupFilesAfterEnv: ['<rootDir>/__tests__/helpers/jestSetupJsdom.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
      moduleNameMapper,
      transform: { '^.+\\.tsx?$': tsJestTransform },
      globalSetup: '<rootDir>/__tests__/helpers/jestGlobalSetup.ts',
      globalTeardown: '<rootDir>/__tests__/helpers/jestGlobalTeardown.ts',
      setupFiles: ['<rootDir>/__tests__/helpers/testEnv.ts'],
      setupFilesAfterEnv: ['<rootDir>/__tests__/helpers/jestSetupIntegration.ts'],
      testTimeout: 30000,
    },
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
}
