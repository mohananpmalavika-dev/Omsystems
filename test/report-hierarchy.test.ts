import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { resolveReportHierarchy, reportDayBounds, reportLocalDate } from '../packages/contracts/src/report-hierarchy.js';
import { MemoryStore } from '../src/store.js';
import { createMISUnifiedRoutes } from '../src/routes/reports/mis-unified.routes.js';

describe('reports follow the organization structure', () => {
  it('skips absent intermediate levels and does not classify nodes by their name', () => {
    const nodes = new Map([
      ['org', {id:'org',type:'company',name:'Organization'}],
      ['zone', {id:'zone',parentId:'org',type:'zone',name:'West'}],
      ['direct', {id:'direct',parentId:'zone',type:'branch',name:'Hajipur'}],
      ['region', {id:'region',parentId:'zone',type:'region',name:'Region named Zone'}],
      ['branch', {id:'branch',parentId:'region',type:'branch',name:'Rajkot'}],
    ]);
    expect(resolveReportHierarchy('direct',nodes)).toMatchObject({zone:'West',region:'',area:'',path:['Organization','West','Hajipur']});
    expect(resolveReportHierarchy('branch',nodes)).toMatchObject({zone:'West',region:'Region named Zone',area:''});
  });

  it('resolves ancestors through custom nodes and stops at cycles or another tenant', () => {
    const nodes = new Map([
      ['b', {id:'b',parentId:'group',type:'branch',name:'Branch',tenantId:'one'}],
      ['group', {id:'group',parentId:'area',type:'division',name:'Custom group',tenantId:'one'}],
      ['area', {id:'area',parentId:'region',type:'area',name:'Area',tenantId:'one'}],
      ['region', {id:'region',parentId:'b',type:'region',name:'Region',tenantId:'one'}],
    ]);
    expect(resolveReportHierarchy('b',nodes)).toMatchObject({area:'Area',region:'Region',zone:''});
    nodes.get('region')!.tenantId='other';
    expect(resolveReportHierarchy('b',nodes).region).toBe('');
  });

  it('uses inclusive IST days at midnight and rejects impossible or reversed dates', () => {
    expect(reportDayBounds('2026-10-06','2026-10-06')).toEqual({from:'2026-10-05T18:30:00.000Z',to:'2026-10-06T18:29:59.999Z'});
    expect(reportLocalDate('2026-10-05T20:00:00Z')).toBe('2026-10-06');
    expect(reportLocalDate('bad')).toBe('');
    expect(()=>reportDayBounds('2026-02-30','2026-03-01')).toThrow();
    expect(()=>reportDayBounds('2026-10-07','2026-10-06')).toThrow();
  });

  it('keeps distinct direct branches separate when their display names match', async () => {
    const store = new MemoryStore();
    const branch = store.nodes.get('A005')!;
    for (const node of store.nodes.values()) if (node.type === 'branch' && node.id !== branch.id) store.nodes.delete(node.id);
    branch.parentId = 'company-1';
    branch.path = ['company-1', branch.id];
    store.nodes.set('report-duplicate', { ...branch, id: 'report-duplicate', path: ['company-1', 'report-duplicate'] });
    const app = Fastify();
    app.addHook('preHandler', async request => { request.currentUser = (await store.getUser('user-superadmin-mgdhanyamohan'))!; });
    const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
    createMISUnifiedRoutes(app, pool, store);
    try {
      const response = await app.inject({ url: '/mis?groupBy=region' });
      expect(response.statusCode).toBe(200);
      expect(response.json().matrix).toHaveLength(2);
      expect(response.json().matrix.map((row: { dimension: string }) => row.dimension)).toEqual([branch.name, branch.name]);
      expect(response.json().matrix.every((row: { branchCount: number }) => row.branchCount === 1)).toBe(true);
    } finally { await app.close(); }
  });

  it('uses real hierarchy names in MIS choices and direct branches in missing-level groups', async () => {
    const store = new MemoryStore();
    const branch = store.nodes.get('A005')!;
    store.nodes.set('report-zone',{id:'report-zone',parentId:'company-1',tenantId:branch.tenantId,type:'zone',name:'Actual Zone',path:['company-1','report-zone']});
    branch.parentId='report-zone';
    branch.path=['company-1','report-zone','A005'];
    const app=Fastify();
    app.addHook('preHandler',async request=>{request.currentUser=(await store.getUser('user-branch-manager'))!;});
    const queries: Array<{sql:string;params:unknown[]}> = [];
    const pool={query:async(sql:string,params:unknown[])=>{queries.push({sql,params});return{rows:[]};}} as unknown as Pool;
    createMISUnifiedRoutes(app,pool,store);
    try {
      const response=await app.inject({method:'GET',url:'/mis?groupBy=region&timeRange=custom&startDate=2026-10-06&endDate=2026-10-06'});
      expect(response.statusCode).toBe(200);
      expect(response.json().filterOptions).toMatchObject({zones:['Actual Zone'],regions:[],areas:[],branches:[{id:'A005',name:branch.name}]});
      expect(response.json().matrix).toHaveLength(1);
      expect(response.json().matrix[0].dimension).toBe(branch.name);
      const incidentQuery=queries.find(query=>query.sql.includes('GROUP BY i.branch_id'))!;
      expect(incidentQuery.params.slice(2)).toEqual(['2026-10-05T18:30:00.000Z','2026-10-06T18:29:59.999Z']);
      expect((await app.inject({url:'/mis/hierarchy?zone=Actual%20Zone'})).json()).toMatchObject({zones:['Actual Zone'],regions:[],areas:[],branches:[{id:'A005',name:branch.name}]});
      expect((await app.inject({url:'/mis?timeRange=custom&startDate=2026-02-30&endDate=2026-03-01'})).statusCode).toBe(400);
    } finally {await app.close();}
  });
});
