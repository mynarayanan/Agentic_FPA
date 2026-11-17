import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@fpa/engine', '@fpa/semantic', '@fpa/db', '@fpa/narrative'],
  poweredByHeader: false,
};
export default config;
