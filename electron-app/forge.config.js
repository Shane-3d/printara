module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Printara',
    executableName: 'printara',
    appCopyright: 'Copyright © 2026 Printara',
    // Bundle queue.html next to the asar so main.js can load it
    extraResource: ['../queue.html'],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Printara',
        setupExe: 'PrintaraSetup.exe',
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
