/**
 * Security-Driven Camera Priority Engine
 * 
 * Scores and ranks cameras based on operator focus, AI alerts, branch criticality,
 * and visibility state to determine decoder allocation precedence.
 */

import type { CameraSchedulingContext } from "./types";

export enum PriorityTier {
  P0_FULLSCREEN_OPERATOR = 10000,
  P1_CRITICAL_AI_ALERT = 9000,
  P2_SELECTED_INVESTIGATION = 7000,
  P3_PINNED_SURVEILLANCE = 6000,
  P4_HIGH_SECURITY_ALERT = 5000,
  P5_RECORDING_FAILURE = 4000,
  P6_VISIBLE_GRID_TILE = 3000,
  P7_HEALTH_WARNING = 1000,
  P8_RECENTLY_ACCESSED = 500,
  P9_OFFSCREEN_SEQUENCING = 100,
}

export function calculateCameraPriority(ctx: CameraSchedulingContext): number {
  if (ctx.isOffline) {
    return 0; // Offline cameras should not consume live decoder slots
  }

  let score = 0;

  if (ctx.isFullscreen) {
    score += PriorityTier.P0_FULLSCREEN_OPERATOR;
  }

  if (ctx.hasCriticalAlert) {
    score += PriorityTier.P1_CRITICAL_AI_ALERT;
  }

  if (ctx.isSelected) {
    score += PriorityTier.P2_SELECTED_INVESTIGATION;
  }

  if (ctx.isPinned) {
    score += PriorityTier.P3_PINNED_SURVEILLANCE;
  }

  if (ctx.hasHighAlert) {
    score += PriorityTier.P4_HIGH_SECURITY_ALERT;
  }

  if (ctx.recordingFailure) {
    score += PriorityTier.P5_RECORDING_FAILURE;
  }

  if (ctx.isVisible) {
    score += PriorityTier.P6_VISIBLE_GRID_TILE;
    // Lower position numbers in viewport get slight tie-breaking precedence
    score += Math.max(0, 100 - ctx.positionInViewport);
  } else {
    score += PriorityTier.P9_OFFSCREEN_SEQUENCING;
  }

  if (ctx.healthWarning) {
    score += PriorityTier.P7_HEALTH_WARNING;
  }

  if (ctx.operatorRecentlyViewed) {
    score += PriorityTier.P8_RECENTLY_ACCESSED;
  }

  return score;
}
