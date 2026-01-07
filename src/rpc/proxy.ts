interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Error from upstream RPC
 */
export class ProxyError extends Error {
  constructor(
    message: string,
    public code: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ProxyError";
  }
}

/**
 * Client for forwarding RPC requests to upstream node
 */
export class ProxyClient {
  private requestId = 0;

  constructor(private rpcUrl: string) {}

  /**
   * Forward an RPC call to upstream
   */
  async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id: ++this.requestId,
    };

    let response: Response;
    try {
      response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    } catch (err) {
      throw new ProxyError(
        `Failed to connect to upstream RPC: ${err instanceof Error ? err.message : "Unknown error"}`,
        -32603
      );
    }

    if (!response.ok) {
      throw new ProxyError(
        `Upstream RPC error: ${response.status} ${response.statusText}`,
        -32603
      );
    }

    let json: JsonRpcResponse;
    try {
      json = (await response.json()) as JsonRpcResponse;
    } catch {
      throw new ProxyError("Invalid JSON response from upstream RPC", -32603);
    }

    if (json.error) {
      throw new ProxyError(json.error.message, json.error.code, json.error.data);
    }

    return json.result as T;
  }

  /**
   * Get the upstream RPC URL (for logging)
   */
  get url(): string {
    return this.rpcUrl;
  }
}
