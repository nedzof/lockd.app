/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowJs: true,
          noEmit: true,
          strict: true,
          module: 'esnext',
          target: 'es2020',
          lib: ['es2020'],
          moduleResolution: 'node'
        }
      }
    ]
  }
};
