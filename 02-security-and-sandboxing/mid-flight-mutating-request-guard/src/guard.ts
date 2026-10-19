export interface PreFlightRequest {
  requestId: string;
  url: string;
  method: string;
  postData?: string;
  headers: Record<string, string>;
  timestamp: number;
}

export type CdpSender = (method: string, params: Record<string, unknown>) => Promise<unknown>;

// Allow-list, not deny-list: fetch() accepts any token as a method, so WebDAV
// verbs (MKCOL, MOVE, LOCK, PROPPATCH) or PURGE would slip past a list of four.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class MidFlightRequestGuard {
  private dryRunEnabled: boolean = true;
  private pendingPreFlights: Map<string, PreFlightRequest> = new Map();
  private listeners: Array<(req: PreFlightRequest) => void> = [];

  constructor(private sendCdp: CdpSender) {}

  public async enable(): Promise<void> {
    await this.sendCdp("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request" }],
    });
  }

  public handleCdpEvent(method: string, params: any): void {
    if (method !== "Fetch.requestPaused") return;

    const req = params.request || {};
    const httpMethod = String(req.method || "GET").toUpperCase();
    const requestId = params.requestId;

    const isMutating = !SAFE_METHODS.has(httpMethod);

    if (this.dryRunEnabled && isMutating) {
      const preFlight: PreFlightRequest = {
        requestId,
        url: req.url,
        method: httpMethod,
        postData: req.postData,
        headers: req.headers || {},
        timestamp: Date.now(),
      };

      this.pendingPreFlights.set(requestId, preFlight);
      for (const listener of this.listeners) listener(preFlight);
    } else {
      this.sendCdp("Fetch.continueRequest", { requestId }).catch(() => {});
    }
  }

  /** Subscribe the approval UI to held requests; returns an unsubscribe function. */
  public onPreFlight(listener: (req: PreFlightRequest) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public async approve(requestId: string): Promise<void> {
    if (!this.pendingPreFlights.has(requestId)) return;
    this.pendingPreFlights.delete(requestId);
    await this.sendCdp("Fetch.continueRequest", { requestId });
  }

  public async reject(requestId: string): Promise<void> {
    if (!this.pendingPreFlights.has(requestId)) return;
    this.pendingPreFlights.delete(requestId);
    await this.sendCdp("Fetch.failRequest", { requestId, errorReason: "AccessDenied" });
  }
}
