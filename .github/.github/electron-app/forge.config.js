module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Printara',
    executableName: 'printara',
    appCopyright: 'Copyright © 2026 Printara',
    // Bundle the browser-facing pages next to the asar so main.js can load them
    // with file:// paths in packaged builds.
    extraResource: [
      '../login.html',
      '../queue.html',
      '../index.html',
      '../download.html',
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
