/**
 * Crawl Queue & Traversal Scheduler
 *
 * Implements a prioritized BFS queue for action exploration
 * with limits on depth, pages, action counts, and runtime.
 */

import type { QAActionType } from "../types/qa.types.js";

export type QueueItemPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface CrawlQueueItem {
  id: string;
  sourcePageUrl: string;
  targetUrl?: string;
  depth: number;
  priority: QueueItemPriority;
  actionType: QAActionType;
  selector: string;
  label: string;
  role?: string;
  category: "nav" | "sidebar" | "tab" | "link" | "button" | "dropdown" | "dialog" | "form";
  metadata?: Record<string, any>;
}

export interface CrawlLimits {
  maxPages: number;
  maxDepth: number;
  maxActions: number;
  maxRuntimeMs: number;
}

export class CrawlQueue {
  private queue: CrawlQueueItem[] = [];
  private visitedUrls = new Set<string>();
  private visitedSignatures = new Set<string>();
  private executedActionCount = 0;
  private startTime = Date.now();
  private limits: CrawlLimits;

  constructor(limits?: Partial<CrawlLimits>) {
    this.limits = {
      maxPages: limits?.maxPages ?? 250,
      maxDepth: limits?.maxDepth ?? 10,
      maxActions: limits?.maxActions ?? 1_000,
      maxRuntimeMs: limits?.maxRuntimeMs ?? 15 * 60 * 1_000, // 15 mins default
    };
  }

  /**
   * Determine priority level for an interactive action
   */
  static getPriority(category: CrawlQueueItem["category"]): QueueItemPriority {
    switch (category) {
      case "nav":
        return 1;
      case "sidebar":
        return 2;
      case "tab":
        return 3;
      case "link":
        return 4;
      case "button":
        return 5;
      case "dropdown":
        return 6;
      case "dialog":
        return 7;
      case "form":
        return 8;
      default:
        return 5;
    }
  }

  /**
   * Add action to the prioritized queue
   */
  enqueue(item: Omit<CrawlQueueItem, "priority"> & { priority?: QueueItemPriority }): boolean {
    // Check limits
    if (this.isExhausted()) return false;
    if (item.depth > this.limits.maxDepth) return false;

    // Check action uniqueness signature
    const signature = `${item.sourcePageUrl}::${item.actionType}::${item.selector}::${item.targetUrl || ""}`;
    if (this.visitedSignatures.has(signature)) {
      return false;
    }

    this.visitedSignatures.add(signature);

    const priority = item.priority ?? CrawlQueue.getPriority(item.category);
    const fullItem: CrawlQueueItem = { ...item, priority };

    // Insert in sorted order by priority (lowest number = highest priority)
    const index = this.queue.findIndex((existing) => existing.priority > priority);
    if (index === -1) {
      this.queue.push(fullItem);
    } else {
      this.queue.splice(index, 0, fullItem);
    }

    return true;
  }

  /**
   * Pop highest priority action
   */
  dequeue(): CrawlQueueItem | undefined {
    return this.queue.shift();
  }

  /**
   * Mark page URL as visited
   */
  markPageVisited(url: string): void {
    this.visitedUrls.add(url);
  }

  /**
   * Check if page was already visited
   */
  isPageVisited(url: string): boolean {
    return this.visitedUrls.has(url);
  }

  /**
   * Increment executed action counter
   */
  recordActionExecution(): void {
    this.executedActionCount++;
  }

  /**
   * Number of visited unique pages
   */
  get visitedPageCount(): number {
    return this.visitedUrls.size;
  }

  /**
   * Current queue length
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if crawl limits have been reached
   */
  isExhausted(): boolean {
    if (this.visitedUrls.size >= this.limits.maxPages) return true;
    if (this.executedActionCount >= this.limits.maxActions) return true;
    if (Date.now() - this.startTime >= this.limits.maxRuntimeMs) return true;
    return false;
  }

  /**
   * Check exhaustion reason if any
   */
  getExhaustionReason(): string | null {
    if (this.visitedUrls.size >= this.limits.maxPages) {
      return `Reached maximum page limit (${this.limits.maxPages})`;
    }
    if (this.executedActionCount >= this.limits.maxActions) {
      return `Reached maximum actions limit (${this.limits.maxActions})`;
    }
    if (Date.now() - this.startTime >= this.limits.maxRuntimeMs) {
      return `Reached maximum runtime limit (${Math.round(this.limits.maxRuntimeMs / 60000)}m)`;
    }
    return null;
  }
}
