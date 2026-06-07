module.exports = {
  packagerConfig: {
    asar: true,
    ignore: [
      /^\/src/,
      /^\/e2e/,
      /^\/coverage/,
      /^\/test-results/,
      /^\/\.git/,
      /^\/\.github/,
      /^\/out/,
      /^\/dist_electron/,
      /^\/scratch/,
      /(.eslintrc.json)|(.gitignore)|(electron.vite.config.ts)|(forge.config.cjs)|(tsconfig.*\.json)|(playwright.config.ts)|(pnpm-lock.yaml)|(pnpm-workspace.yaml)/,
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
  ],
};
