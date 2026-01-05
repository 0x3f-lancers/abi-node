import Fastify from "fastify";
import chalk from "chalk";
import { handleRpcRequest } from "./rpc/handler.js";

interface ServerOptions {
  port: number;
  abiDir: string;
}

export async function startServer(options: ServerOptions) {
  const { port, abiDir } = options;

  const server = Fastify();

  server.post("/", async (request, reply) => {
    const body = request.body as {
      jsonrpc: string;
      method: string;
      params?: unknown[];
      id: number | string;
    };

    const result = await handleRpcRequest(body.method, body.params ?? []);

    return reply.send({
      jsonrpc: "2.0",
      id: body.id,
      ...result,
    });
  });

  await server.listen({ port, host: "0.0.0.0" });

  console.log(chalk.green(`\nabi-node running on http://localhost:${port}`));
  console.log(chalk.dim(`ABI directory: ${abiDir}\n`));
}
