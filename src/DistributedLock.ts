import ZooKeeper from "zookeeper";
import { LockCallbacks, LockOptions } from "./types/lock.types.js";

class DistributedLock {
  private lockPath: string | null = null;
  private _fencingToken: number | null = null;
  private readonly resourceDir: string;
  private lockCount: number = 0;
  private lockAborted: boolean = false;

  constructor(
    private client: ZooKeeper,
    private resource: string,
    private options: LockOptions,
    private callbacks: LockCallbacks,
  ) {
    const root = options.rootDir || "/locks";
    this.resourceDir = `${root}/${this.resource}`;
  }

  public get fencingToken() {
    return this._fencingToken;
  }

  public async acquire() {
    if (this.lockPath) {
      this.lockCount++;
      return this._fencingToken;
    }

    if (this.client.state !== ZooKeeper.constants.ZOO_CONNECTED_STATE)
      throw new Error(`ZooKeeper not connected. State: ${this.client.state}`);

    this.lockAborted = false;
    await this.ensureResourceDir(this.resourceDir);

    const pathPrefix = `${this.resourceDir}/ticket-`;
    this.lockPath = await this.createTicket(pathPrefix);

    this._fencingToken = parseInt(this.lockPath.split("-").pop() || "0", 10);

    try {
      await this.checkQueue();
      this.lockCount = 1;

      this.callbacks.onAcquired(this.resource, {
        path: this.lockPath,
        token: this._fencingToken,
        count: this.lockCount,
      });

      return this._fencingToken;
    } catch (err) {
      await this.cleanupNode();
      await this.cleanupResourceDirIfEmpty();
      throw err;
    }
  }

  private async checkQueue(): Promise<void> {
    if (!this.lockPath) throw new Error("Lock Path doesn't exist");

    if (this.lockAborted) return;

    const children = await this.getChildren(this.resourceDir);

    const sorted = children.sort(
      (a, b) =>
        parseInt(a.split("-").pop() ?? "0") -
        parseInt(b.split("-").pop() ?? "0"),
    );

    const nodeName = this.lockPath.split("/").pop();
    if (!nodeName) throw new Error("Node doesn't exist in Lock path");

    const nodeIndex = sorted.indexOf(nodeName);
    if (nodeIndex === -1)
      throw new Error("Node doesn't exist in children list");

    if (nodeIndex === 0) return;

    const predecessor = `${this.resourceDir}/${sorted[nodeIndex - 1]}`;

    return new Promise((res, rej) => {
      let timeoutId: NodeJS.Timeout | null = null;
      if (this.options.acquireTimeout) {
        timeoutId = setTimeout(() => {
          this.lockAborted = true;
          rej(new Error(`Lock timeout: ${this.resource}`));
        }, this.options.acquireTimeout);
      }

      this.client.aw_exists(
        predecessor,
        () => {
          if (this.lockAborted) return;

          if (timeoutId) clearTimeout(timeoutId);
          this.checkQueue().then(res).catch(rej);
        },
        (rc, err) => {
          if (this.lockAborted) return;

          if (rc !== 0 && rc !== ZooKeeper.constants.ZNONODE) {
            if (timeoutId) clearTimeout(timeoutId);
            return rej(
              new Error(err?.toString() || `ZooKeeper error (rc=${rc})`),
            );
          }

          if (rc === ZooKeeper.constants.ZNONODE) {
            if (timeoutId) clearTimeout(timeoutId);
            this.checkQueue().then(res).catch(rej);
          }
        },
      );
    });
  }

  public async release() {
    if (!this.lockPath) return;

    this.lockCount--;
    if (this.lockCount > 0) return;

    await this.cleanupNode();
    await this.cleanupResourceDirIfEmpty();
    this.callbacks.onReleased(this.resource);
  }

  private async cleanupNode() {
    if (!this.lockPath) return;

    await this.deleteNode(this.lockPath);
    this.lockPath = null;
    this._fencingToken = null;
    this.lockCount = 0;
  }

  private async cleanupResourceDirIfEmpty(): Promise<void> {
    if (!this.resourceDir) return;
    try {
      const children = await this.getChildren(this.resourceDir);
      if (children.length === 0) await this.deleteNode(this.resourceDir);
    } catch (_) {}
  }

  private ensureResourceDir(path: string): Promise<void> {
    if (!this.client) throw new Error("ZooKeeper client not initialized");
    return new Promise((resolve, reject) => {
      this.client.mkdirp(path, (err) => {
        if (err) return reject(err);

        resolve();
      });
    });
  }

  private createTicket(path: string): Promise<string> {
    const flags =
      ZooKeeper.constants.ZOO_EPHEMERAL | ZooKeeper.constants.ZOO_SEQUENCE;
    return new Promise((res, rej) => {
      this.client.a_create(path, "", flags, (rc, err, resultPath) => {
        if (rc !== 0)
          return rej(new Error(`Failed to create lock ticket: ${err}`));
        res(resultPath);
      });
    });
  }

  private getChildren(path: string): Promise<string[]> {
    return new Promise((res, rej) => {
      this.client.a_get_children(path, false, (rc, err, children) => {
        if (rc !== 0)
          return rej(new Error(`Failed to fetch resource children: ${err}`));

        res(children);
      });
    });
  }

  private deleteNode(path: string): Promise<void> {
    return new Promise((res) => {
      this.client.a_delete_(path, -1, () => {
        res();
      });
    });
  }
}

export { DistributedLock };
