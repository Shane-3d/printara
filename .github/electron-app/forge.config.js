module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Printara',
    executableName: 'printara',
    appCopyright: 'Copyright © 2026 Printara',
    icon: './logo',  // Electron appends .ico/.icns/.png per platform
    extraResource: [
      '../logo.png',
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Printara',
        setupExe: 'PrintaraSetup.exe',
        setupIcon: './logo.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
