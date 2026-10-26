import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  define: { "process.env": {} },
  server: {
    port: 5260,
    host: "127.0.0.1",
    // The public mainnet RPC refuses browser origins; relay it server-side in dev.
    proxy: {
      "/rpc/mainnet": {
        target: process.env.PEXIZ_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com",
        changeOrigin: true,
        rewrite: () => "",
        configure: (proxy) => proxy.on("proxyReq", (req) => { req.removeHeader("origin"); req.removeHeader("referer") }),
      },
    },
  },
})
