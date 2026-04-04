import Zookeeper from "zookeeper";
import { LockMetadata, LockOptions } from "./types/lock.types.js";
import { DistributedLock } from "./DistributedLock.js";

class ZkLockManager {
  private client: Zookeeper | null = null;
  private processRegistry = new Map<string, LockMetadata>();

  public init(client: Zookeeper) {
    if (this.client) return;
    this.client = client;
    this.setupListeners();
  }

  public createLock(resource: string, options: LockOptions = {}) {
    if (!this.client) throw new Error("Zookeeper client not initialized.");

    return new DistributedLock(this.client, resource, options, {
      onAcquired: (res, metadata) => this.handleLockAcquired(res, metadata),
      onReleased: (res) => this.handleLockReleased(res),
    });
  }

  private handleLockAcquired(resource: string, metadata: LockMetadata) {
    this.processRegistry.set(resource, metadata);
  }

  private handleLockReleased(resource: string) {
    this.processRegistry.delete(resource);
  }

  private setupListeners() {
    if (!this.client) return;

    this.client.on("close", () => {
      this.processRegistry.clear();
    });
  }
}

export { ZkLockManager };
