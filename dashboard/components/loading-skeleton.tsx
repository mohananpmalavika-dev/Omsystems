import React from "react";

export function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-800/50 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-800/50 rounded h-4 ${className}`}
      aria-hidden="true"
    />
  );
}

export function KPICardSkeleton() {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2">
      <SkeletonText className="w-32 h-3" />
      <SkeletonBox className="w-20 h-8" />
      <SkeletonText className="w-40 h-3" />
    </div>
  );
}

export function BranchTableRowSkeleton() {
  return (
    <tr className="border-b border-slate-800/60">
      <td className="py-3 px-4">
        <SkeletonText className="w-48 h-4 mb-1" />
        <SkeletonText className="w-24 h-3" />
      </td>
      <td className="py-3 px-4">
        <SkeletonText className="w-32 h-4" />
      </td>
      <td className="py-3 px-4">
        <SkeletonText className="w-36 h-4" />
      </td>
      <td className="py-3 px-4">
        <SkeletonBox className="w-24 h-2 mb-1" />
        <SkeletonText className="w-12 h-3" />
      </td>
      <td className="py-3 px-4">
        <SkeletonBox className="w-24 h-6 rounded-full" />
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end space-x-2">
          <SkeletonBox className="w-20 h-8 rounded" />
          <SkeletonBox className="w-24 h-8 rounded" />
        </div>
      </td>
    </tr>
  );
}

export function FleetLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>

      {/* Controls Bar Skeleton */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <SkeletonBox className="w-64 h-9 rounded-lg" />
            <div className="flex space-x-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBox key={i} className="w-20 h-7 rounded-md" />
              ))}
            </div>
          </div>
          <div className="flex space-x-2.5">
            <SkeletonBox className="w-40 h-9 rounded-lg" />
            <SkeletonBox className="w-32 h-9 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <SkeletonText className="w-48 h-5" />
          <SkeletonText className="w-24 h-4" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50">
                <th className="py-3 px-4">
                  <SkeletonText className="w-16 h-3" />
                </th>
                <th className="py-3 px-4">
                  <SkeletonText className="w-20 h-3" />
                </th>
                <th className="py-3 px-4">
                  <SkeletonText className="w-32 h-3" />
                </th>
                <th className="py-3 px-4">
                  <SkeletonText className="w-24 h-3" />
                </th>
                <th className="py-3 px-4">
                  <SkeletonText className="w-16 h-3" />
                </th>
                <th className="py-3 px-4 text-right">
                  <SkeletonText className="w-16 h-3 ml-auto" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <BranchTableRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Loading indicator text */}
      <div className="text-center py-4">
        <p className="text-sm text-slate-400 font-mono animate-pulse">
          Loading branch fleet data from control plane...
        </p>
      </div>
    </div>
  );
}
