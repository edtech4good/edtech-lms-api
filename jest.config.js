/** @type {import('jest').Config} */
module.exports = {
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  testEnvironment: 'node',
  // tsconfig's baseUrl+paths make `src/...` an absolute import from anywhere
  // in the tree (see tsconfig.json paths: { "src/*": ["src/*"] }); ts-jest
  // type-checks that fine but Jest's own resolver doesn't know about it.
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // src/test.ts is a model-seed script (not a test), and build/ + dist/ hold
  // compiled output that would otherwise be discovered as duplicate specs
  // (build/test.js included). Excluded explicitly rather than relying on
  // roots alone, since roots only limits *where* Jest looks, not what it
  // matches within that tree.
  testPathIgnorePatterns: ['/node_modules/', '/build/', '/dist/', '<rootDir>/src/test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/test.ts'],
};
