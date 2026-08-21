import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dzri.app',
  appName: 'dzri',
  webDir: 'www',
  server: {
    url: 'https://dzri.am',
    cleartext: false,
  },
};

export default config;
