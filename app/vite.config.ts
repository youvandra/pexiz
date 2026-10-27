import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import type { Plugin } from "vite"

/** Serves the devnet faucet and share cards from the dev server, same handlers as production. */
function faucetDev(): Plugin {
  return {
    name: "pexiz-faucet",
    configureServer(server) {
      server.middlewares.use("/og", async (req, res, next) => {
        try {
          const id = req.url?.match(/^\/([a-z0-9-]+)\.png$/)?.[1]
          if (!id) return next()
          const { ogCard } = await server.ssrLoadModule("/server/og.ts")
          const r: Response = await ogCard(id)
          res.statusCode = r.status
          res.setHeader("content-type", r.headers.get("content-type") ?? "image/png")
          res.end(Buffer.from(await r.arrayBuffer()))
        } catch (e) {
          next(e)
        }
      })
      server.middlewares.use("/api/faucet", async (req, res, next) => {
        try {
          const { faucet } = await server.ssrLoadModule("/server/faucet.ts")
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const r: Response = await faucet(new Request("http://dev/api/faucet", { method: req.method, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }), req.socket.remoteAddress ?? "?")
          res.statusCode = r.status
          res.setHeader("content-type", "application/json")
          res.end(await r.text())
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), faucetDev()],
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
