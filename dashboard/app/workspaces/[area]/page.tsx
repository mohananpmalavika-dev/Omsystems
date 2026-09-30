"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, LockKeyhole, RotateCw } from "lucide-react";
import { getVisibleNavigation, type MenuAccessUser } from "@/components/app-layout";
import { authApi } from "@/lib/api-client";
import { sectionHubs } from "@/lib/section-hubs";

export default function SectionWorkspacePage() {
  const area = useParams<{ area: string }>()?.area;
  const hub = sectionHubs.find((entry) => entry.slug === area);
  const [user, setUser] = useState<MenuAccessUser | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(() => {
    setLoading(true);
    setError(null);
    authApi.getCurrentUser()
      .then((response) => setUser((response as { user?: MenuAccessUser })?.user ?? response ?? null))
      .catch((reason: unknown) => {
        setUser(null);
        setError(reason instanceof Error ? reason.message : "Unable to load your access.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const group = useMemo(() => user && hub
    ? getVisibleNavigation(user).find((entry) => entry.label === hub.group)
    : undefined, [hub, user]);
  const available = useMemo(() => new Map(group?.items.map((item) => [item.href, item]) ?? []), [group]);
  const mappedJourneys = hub?.journeys.map((journey) => ({
    ...journey,
    items: journey.routes.flatMap((href) => {
      const item = available.get(href);
      return item ? [item] : [];
    }),
  })).filter((journey) => journey.items.length > 0) ?? [];
  const journeys = mappedJourneys.length > 0 ? mappedJourneys : group?.items.length
    ? [{ title: "Explore your tools", description: "Open one of the workflows available to your role.", routes: [], items: group.items }]
    : [];
  const firstItem = journeys[0]?.items[0] ?? group?.items[0];
  const GroupIcon = group?.icon;

  if (!hub) return <main className="section-hub-state"><h1>Workspace unavailable</h1><Link href="/modules">Open workspace directory <ArrowRight size={16} /></Link></main>;

  if (loading) return <main className="section-hub-state" role="status"><RotateCw size={22} className="section-hub-loading" /><h1>Preparing your {hub.group.toLowerCase()} workspace</h1><p>Checking the tools available to your role.</p></main>;

  if (error || !group) return <main className="section-hub-state"><LockKeyhole size={26} /><h1>{error ? "Workspace could not load" : "No tools available in this area"}</h1><p>{error ?? "Your role does not currently include this workspace."}</p><div>{error && <button type="button" onClick={loadUser}>Try again <RotateCw size={15} /></button>}<Link href="/modules">Workspace directory <ArrowRight size={15} /></Link></div></main>;

  return <main className="section-hub">
    <div className="section-hub-topline"><span><i /> KRYPTON / WORKSPACES</span><span>{String(group.items.length).padStart(2, "0")} AVAILABLE TOOLS</span></div>
    <section className="section-hub-hero" aria-labelledby="section-hub-title">
      <div className="section-hub-intro">
        <div className="section-hub-marker">{GroupIcon && <GroupIcon size={21} />}<span>{hub.group}</span></div>
        <h1 id="section-hub-title">{hub.title}</h1>
        <p>{hub.lead}</p>
        {firstItem && <Link className="section-hub-primary" href={firstItem.href}>Start with {firstItem.label}<ArrowUpRight size={19} /></Link>}
      </div>
      <div className="section-hub-visual" aria-hidden="true">
        <span className="section-hub-visual-label">OPERATIONAL ROUTE / {String(journeys.length).padStart(2, "0")}</span>
        <div className="section-hub-orbit"><span>{String(journeys.length).padStart(2, "0")}</span><small>WAYS IN</small></div>
        <div className="section-hub-route-lines">{journeys.map((journey, index) => <div key={journey.title}><span>{String(index + 1).padStart(2, "0")}</span><strong>{journey.title}</strong><i /></div>)}</div>
      </div>
    </section>

    <section className="section-hub-journeys" aria-labelledby="section-journeys-title">
      <header><div><span className="section-hub-eyebrow">CHOOSE AN OUTCOME</span><h2 id="section-journeys-title">Move through the work.</h2></div><p>{hub.context}</p></header>
      <div className="section-hub-journey-grid">{journeys.map((journey, index) => <article className="section-hub-journey" key={journey.title}>
        <div className="section-hub-journey-heading"><span>{String(index + 1).padStart(2, "0")} / {String(journeys.length).padStart(2, "0")}</span><ArrowUpRight size={19} /></div>
        <h3>{journey.title}</h3><p>{journey.description}</p>
        <div className="section-hub-steps">{journey.items.map((item, step) => { const Icon = item.icon; return <Link href={item.href} key={item.href}><span>{String(step + 1).padStart(2, "0")}</span><Icon size={18} /><strong>{item.label}</strong><ArrowRight size={16} /></Link>; })}</div>
      </article>)}</div>
    </section>

    <section className="section-hub-directory" aria-labelledby="section-tools-title"><div><span className="section-hub-eyebrow">YOUR TOOLKIT</span><h2 id="section-tools-title">Every available tool</h2><p>Direct access to the workflows assigned to your role in this area.</p></div><div className="section-hub-tool-list">{group.items.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.href}><Icon size={17} /><span>{item.label}</span><ArrowUpRight size={15} /></Link>; })}</div></section>
  </main>;
}
