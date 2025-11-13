import { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure Turbopack root is the local-ui folder when Next infers workspace root incorrectly
  turbopack: {
    root: path.resolve(__dirname)
  },
  // Export to static docs folder when running `bun run build`
  output: 'export'
}

export default nextConfig
