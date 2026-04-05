<h1 align="center">zk-dist-lock</h1>
<p align="center">
  <a href="https://www.npmjs.com/package/zk-dist-lock">
    <img src="https://img.shields.io/npm/v/zk-dist-lock.svg" alt="NPM Version">
  </a>
  <a href="https://www.npmjs.com/package/zk-dist-lock">
    <img src="https://img.shields.io/npm/dt/zk-dist-lock.svg" alt="Downloads">
  </a>
  <img src="https://img.shields.io/bundlephobia/minzip/zk-dist-lock" alt="Bundle Size">
  <img src="https://img.shields.io/github/license/tjn20/zk-dist-lock" alt="License">
</p>

## Introduction

A high-performance, Resource-Isolated distributed locking library for Node.js. Unlike simple TTL-based locks, this package utilizes ZooKeeper’s consensus protocol to provide a globally ordered synchronization primitive with built-in Fencing Tokens and Re-entrancy.

<img width="1680" height="794" alt="Image" src="https://github.com/user-attachments/assets/38283a92-a336-4f1d-a220-1b6eb11aa6d7" />

## Distributed Consensus

In distributed environments, one of the biggest challenges is ensuring consistency when multiple servers compete for a shared resource. They must agree on a single leader or lock holder, and this decision must not rely on local clocks, which can drift and lead to inconsistencies.

This package implements a Consensus-Based Lock, which provides:

- Total Ordering: Every lock request is assigned a unique, monotonically increasing sequence number by the ZooKeeper ensemble.

- Safety via Fencing: The lock returns a Fencing Token. This allows your database to reject "Zombie" processes.

- Reliability: Since the lock state is replicated across a ZooKeeper Quorum, the lock persists even if the ZooKeeper Leader fails.

## Key Features

- Each resource creates its own directory. Workers only watch the ticket directly in front of them in that specific folder, preventing the "Thundering Herd" performance spike.

- Handles multiple `acquire()` calls for the same resource within the same process via an internal reference counter.

- Locks are Ephemeral. If a worker process crashes or loses network connectivity, the lock is automatically released by the cluster after the session timeout.

## Installation

Install from NPM

```
npm i zk-dist-lock
```

## Usage

```js
import { ZkLockManager, LockOptions } from "zk-dist-lock";
import ZooKeeper from "zookeeper";

const zkClient: Zookeeper = new ZooKeeper();

const zkLock = new ZkLockManager();
zkLock.init(zkClient);

const lockOptions: LockOptions = {
  rootDir: "/test",
  acquireTimeout: 2000,
};

const lock = zkLock.createLock("resource", lockOptions);

try {
  const token = await lock.acquire();
  // Task
} finally {
  await lock.release();
}

```

## Functions Available

- The `init()` function requires a zookeeper client instance.
- The `createLock()` fucntion requires the resource name and accepts an optional lock options with the following properties:
  - **`rootDir`**: The root directory in ZooKeeper where locks are created. Default: `"/locks"`.
  - **`acquireTimeout`**: The maximum time (in milliseconds) to wait for acquiring the lock.
- The `acquire()` function attempts to acquire the lock and returns a fencing token.
- The `release()` function releases the acquired lock.
