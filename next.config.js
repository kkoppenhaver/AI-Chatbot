/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    experimental: {
        appDir: true,
    },
    webpack: (config) => {
        config.externals.push({
	      'utf-8-validate': 'commonjs utf-8-validate',
	      'bufferutil': 'commonjs bufferutil',
	    })

        config.externals = [...config.externals, "hnswlib-node"]

        return config
    },
}

export default nextConfig
