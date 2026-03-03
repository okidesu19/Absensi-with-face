/**
 * LRU (Least Recently Used) Cache Implementation
 * Used for caching frequently accessed face descriptors
 */

interface CacheNode<T> {
  key: string;
  value: T;
  prev: CacheNode<T> | null;
  next: CacheNode<T> | null;
}

export class LRUCache<T> {
  private capacity: number;
  private cache: Map<string, CacheNode<T>>;
  private head: CacheNode<T> | null;
  private tail: CacheNode<T> | null;
  private hits: number;
  private misses: number;

  constructor(capacity: number = 100) {
    this.capacity = capacity;
    this.cache = new Map();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get a value from the cache
   * Moves the item to the front (most recently used)
   */
  get(key: string): T | undefined {
    const node = this.cache.get(key);
    
    if (!node) {
      this.misses++;
      return undefined;
    }
    
    this.hits++;
    this.moveToFront(node);
    return node.value;
  }

  /**
   * Set a value in the cache
   * If at capacity, removes the least recently used item
   */
  set(key: string, value: T): void {
    const existingNode = this.cache.get(key);
    
    if (existingNode) {
      existingNode.value = value;
      this.moveToFront(existingNode);
      return;
    }
    
    const newNode: CacheNode<T> = {
      key,
      value,
      prev: null,
      next: null
    };
    
    if (this.cache.size >= this.capacity) {
      this.removeLRU();
    }
    
    this.cache.set(key, newNode);
    this.addToFront(newNode);
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) return false;
    
    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  /**
   * Get all keys in the cache (from most to least recently used)
   */
  keys(): string[] {
    const keys: string[] = [];
    let current = this.head;
    while (current) {
      keys.push(current.key);
      current = current.next;
    }
    return keys;
  }

  /**
   * Get all values in the cache (from most to least recently used)
   */
  values(): T[] {
    const values: T[] = [];
    let current = this.head;
    while (current) {
      values.push(current.value);
      current = current.next;
    }
    return values;
  }

  // Private methods
  private moveToFront(node: CacheNode<T>): void {
    if (node === this.head) return;
    
    this.removeNode(node);
    this.addToFront(node);
  }

  private addToFront(node: CacheNode<T>): void {
    node.prev = null;
    node.next = this.head;
    
    if (this.head) {
      this.head.prev = node;
    }
    
    this.head = node;
    
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: CacheNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private removeLRU(): void {
    if (!this.tail) return;
    
    const lruKey = this.tail.key;
    this.removeNode(this.tail);
    this.cache.delete(lruKey);
  }
}

// Singleton instance for face descriptor cache
let descriptorCache: LRUCache<number[]> | null = null;

export function getDescriptorCache(capacity: number = 100): LRUCache<number[]> {
  if (!descriptorCache) {
    descriptorCache = new LRUCache<number[]>(capacity);
  }
  return descriptorCache;
}

// Clear and reset the descriptor cache
export function resetDescriptorCache(): void {
  if (descriptorCache) {
    descriptorCache.clear();
  }
  descriptorCache = null;
}
