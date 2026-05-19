module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Printara',
    executableName: 'printara',
    icon: './assets/icon',
    appCopyright: 'Copyright © 2026 Printara',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Printara',
        setupIcon: './assets/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: './assets/icon.png',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          icon: './assets/icon.png',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
