import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@fpa/engine', '@fpa/semantic', '@fpa/db', '@fpa/narrative', '@fpa/audit'],
  poweredByHeader: false,
};
export default config;
