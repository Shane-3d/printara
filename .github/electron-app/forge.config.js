module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Printara',
    executableName: 'printara',
    appCopyright: 'Copyright © 2026 Printara',
<<<<<<< HEAD
    icon: './logo',  // Electron appends .ico/.icns/.png per platform
    extraResource: [
=======
    // Bundle the browser-facing pages next to the asar so main.js can load them
    // with file:// paths in packaged builds.
    extraResource: [
      '../login.html',
      '../queue.html',
      '../index.html',
      '../download.html',
>>>>>>> a5299237bde313d03f5fd06de95b7e1d33fe5e58
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
<<<<<<< HEAD
        setupIcon: './logo.ico',
=======
>>>>>>> a5299237bde313d03f5fd06de95b7e1d33fe5e58
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
