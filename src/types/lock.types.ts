interface LockOptions {
  rootDir?: string;
  acquireTimeout?: number;
}

interface LockMetadata {
  path: string;
  token: number;
  count: number;
}

interface LockCallbacks {
  onAcquired: (resource: string, metadata: LockMetadata) => void;
  onReleased: (resource: string) => void;
}

export type { LockOptions, LockMetadata, LockCallbacks };
