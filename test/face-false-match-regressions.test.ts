import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { selectFaceIdentity, validFaceVector } from '../packages/contracts/src/face-match-policy.js';
import { createModelBackedFaceProfile, createEmployeeFaceTemplate, faceTemplatePreferences, identifyUserByFace, verifyEmployeeFace } from '../src/security/employee-face-verification.service.js';
import { registerAuthRoutes } from '../src/routes/auth.routes.js';
import { registerAnalyticsPhase2Routes } from '../src/routes/analytics-phase2.routes.js';
import { localIdentityState, calculateCosineSimilarity, activeFaceRegistryMatches } from '../src/analytics/identity-registry.js';
import { LocalFaceMatcherService } from '../src/ai/services/local-face-matcher.service.js';
import { MemoryStore } from '../src/store.js';
import { FaceDecisionPolicy } from '../analytics-engine/src/face/face-decision-policy.js';
import { FaceRecognitionIntegrationService, type FaceDetectionInput } from '../analytics-engine/src/face/face-recognition-integration.service.js';
import { FaceAnalyticsDetector } from '../analytics-engine/src/detectors/face-analytics.js';
import { FaceSearchService } from '../analytics-engine/src/face/face-search.service.js';

vi.mock('../src/security/face-embedding-provider.js', async (original) => ({
  ...await original<typeof import('../src/security/face-embedding-provider.js')>(),
  extractVerifiedFace: vi.fn(async (image: string) => {
    if (!image.startsWith('data:image/')) throw new Error('Invalid portrait');
    return {vector: [1,...Array(511).fill(0)], modelId:'test-arcface',quality:.99};
  }),
}));

const vector=(similarity=1)=>{const result=Array(512).fill(0);result[0]=similarity;result[1]=Math.sqrt(1-similarity*similarity);return result;};
const candidate=(personId:string,bestSimilarity=.94)=>({personId,bestSimilarity,displayName:personId,watchlistId:'wl',watchlistName:'Staff',meanTopKSimilarity:bestSimilarity,supportingEmbeddings:3,embeddingMatches:[]});
const faceImage=async()=>`data:image/png;base64,${(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="320" height="400" fill="#d8b08c"/><ellipse cx="160" cy="190" rx="105" ry="140" fill="#8b5a3c"/><circle cx="125" cy="170" r="14" fill="#111"/><circle cx="195" cy="170" r="14" fill="#111"/><path d="M115 250 Q160 285 205 250" stroke="#111" stroke-width="10" fill="none"/></svg>')).png().toBuffer()).toString('base64')}`;

describe('face identity decisions fail closed',()=>{
  it('rejects a close runner-up even below the requested threshold and deduplicates one person',()=>{
    expect(selectFaceIdentity([candidate('a',.86),candidate('b',.84)],row=>row.personId,row=>row.bestSimilarity,.85)).toBeNull();
    expect(selectFaceIdentity([candidate('a',.99),candidate('a',.98),candidate('b',.8)],row=>row.personId,row=>row.bestSimilarity)?.personId).toBe('a');
    expect(selectFaceIdentity([candidate('a',.7)],row=>row.personId,row=>row.bestSimilarity,.5)).toBeNull();
  });
  it('never compares unequal dimensions, zero, non-finite or malformed embeddings',()=>{
    expect(calculateCosineSimilarity(vector(),[1])).toBe(0);
    expect(validFaceVector(Array(512).fill(0))).toBe(false);
    expect(validFaceVector([NaN,...vector().slice(1)])).toBe(false);
    expect(validFaceVector(vector(.93))).toBe(true);
  });
  it('does not let duplicate image samples or a disabled margin bypass the recognition policy',()=>{
    const policy=new FaceDecisionPolicy({enableSecondBestMargin:false});
    expect(policy.evaluate([candidate('a',.94),candidate('a',.93),candidate('b',.92)]).status).toBe('POSSIBLE_MATCH');
    expect(policy.evaluate([candidate('a',.94),candidate('a',.93),candidate('b',.8)]).status).toBe('MATCH');
  });
  it('applies the same ambiguity protection to the legacy live detector',()=>{
    const detector=new FaceAnalyticsDetector();
    detector.addPerson({personId:'a',name:'A',category:'employee',embedding:vector(.94)});
    detector.addPerson({personId:'b',name:'B',category:'employee',embedding:vector(.92)});
    expect(detector.matchFace(vector())).toBeNull();
    detector.removePerson('b');expect(detector.matchFace(vector())?.personId).toBe('a');
  });
});

describe('face login ambiguity and tenant isolation',()=>{
  it('requires model-backed re-enrollment and rejects changed model provenance',async()=>{
    const image=await faceImage();
    const legacy=faceTemplatePreferences(await createEmployeeFaceTemplate(image));
    expect(await verifyEmployeeFace(image,legacy,{requireModelBacked:true})).toMatchObject({matched:false,reason:'reenrollment_required'});
    const profile=await createModelBackedFaceProfile([image]);
    expect(await verifyEmployeeFace(image,faceTemplatePreferences(profile),{requireModelBacked:true})).toMatchObject({matched:true});
    expect(await verifyEmployeeFace(image,faceTemplatePreferences({...profile,modelId:'other-model'}),{requireModelBacked:true})).toMatchObject({matched:false,reason:'reenrollment_required'});
    expect(await identifyUserByFace(image,[{id:'a',tenantId:'one',preferences:legacy}],{requireModelBacked:true})).toBeNull();
  });
  it('rejects identical enrolled profiles belonging to different accounts',async()=>{
    const image=await faceImage(), preferences=faceTemplatePreferences(await createEmployeeFaceTemplate(image));
    const first={id:'a',tenantId:'one',status:'active',preferences};
    expect(await identifyUserByFace(image,[first,{...first,id:'b'}])).toBeNull();
    expect((await identifyUserByFace(image,[first,{...first,status:'inactive',id:'b'}]))?.user.id).toBe('a');
    expect((await identifyUserByFace(image,[first,first]))?.user.id).toBe('a');
    expect((await verifyEmployeeFace(image,preferences,{threshold:NaN})).matched).toBe(false);
  });
  it('never retries a tenant-scoped search against other tenants',async()=>{
    const find=vi.fn(async()=>[]), session=vi.fn();
    const app=Fastify();await registerAuthRoutes(app,{findUsersWithFaceTemplates:find,createUserSession:session} as never);
    try {
      const result=await app.inject({method:'POST',url:'/v1/auth/face-login',payload:{tenantSlug:'requested-tenant',faceScan:await faceImage()}});
      expect(result.statusCode).toBe(404);expect(find.mock.calls).toEqual([['requested-tenant']]);expect(session).not.toHaveBeenCalled();
    } finally {await app.close();}
  });
  it('issues no session for an ambiguous face-only login',async()=>{
    const image=await faceImage(), preferences=faceTemplatePreferences(await createModelBackedFaceProfile([image]));
    const session=vi.fn(), app=Fastify();
    await registerAuthRoutes(app,{findUsersWithFaceTemplates:async()=>[{id:'a',tenantId:'one',status:'active',preferences},{id:'b',tenantId:'one',status:'active',preferences}],createUserSession:session} as never);
    try {const result=await app.inject({method:'POST',url:'/v1/auth/face-login',payload:{faceScan:image}});expect(result.statusCode).toBe(401);expect(session).not.toHaveBeenCalled();}
    finally {await app.close();}
  });
});

describe('CCTV registry and search APIs',()=>{
  it('fails enrollment without a partial success or bytea fallback when pgvector storage fails',async()=>{
    const store=new MemoryStore(), user=(await store.getUser('user-superadmin-mgdhanyamohan'))!;
    const query=vi.fn(async(_sql:string,_params?:unknown[])=>{throw new Error('vector storage unavailable');});
    Object.assign(store,{db:{query}});
    const app=Fastify();app.decorateRequest('currentUser');app.addHook('preHandler',async request=>{request.currentUser=user;});await registerAnalyticsPhase2Routes(app,store);
    try {
      const result=await app.inject({method:'POST',url:`/v1/analytics/face-watchlists/${randomUUID()}/persons`,payload:{fullName:'New identity',embedding:vector()}});
      expect(result.statusCode).toBe(503);expect(result.json().error).toBe('face_embedding_storage_failed');
      expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0]?.[0]).toContain('WITH enrolled AS');
    } finally {await app.close();}
  });
  it('never falls back to ungoverned identities when the registry has no match',async()=>{
    const matcher=new LocalFaceMatcherService();matcher.enrollFace({personId:'stale',name:'Stale identity',embeddingVector:vector(),watchlistType:'STAFF',enrolledAt:new Date()});
    expect((await matcher.matchFace({cameraId:'c',branchId:'b',embeddingVector:vector(),tenantId:'one',store:new MemoryStore()})).matched).toBe(false);
  });
  it('excludes known synthetic hash enrollments',async()=>{
    const store=new MemoryStore(), state=localIdentityState(store);
    state.faceWatchlists.push({id:'wl',tenantId:'one',enabled:true});
    state.facePersons.push({id:'synthetic',tenantId:'one',watchlistId:'wl',embedding:vector(),metadata:{model:'facenet-512'}});
    expect(await activeFaceRegistryMatches(store,'one',vector())).toEqual([]);
  });
  it('still checks a runner-up when the caller requests only one result',async()=>{
    const store=new MemoryStore(), state=localIdentityState(store), user=(await store.getUser('user-superadmin-mgdhanyamohan'))!;
    const watchlistId=randomUUID();state.faceWatchlists.push({id:watchlistId,tenantId:user.tenantId,enabled:true});
    state.facePersons.push({id:randomUUID(),tenantId:user.tenantId,watchlistId,fullName:'A',embedding:vector(.86)},{id:randomUUID(),tenantId:user.tenantId,watchlistId,fullName:'B',embedding:vector(.84)});
    const app=Fastify();app.decorateRequest('currentUser');app.addHook('preHandler',async request=>{request.currentUser=user;});await registerAnalyticsPhase2Routes(app,store);
    try {
      const result=await app.inject({method:'POST',url:'/v1/analytics/face-match',payload:{embedding:vector(),minSimilarity:.85,limit:1}});
      expect(result.statusCode).toBe(200);expect(result.json().data).toMatchObject({matched:false,bestMatch:null,needsReview:true});
      const enrollment=await app.inject({method:'POST',url:`/v1/analytics/face-watchlists/${watchlistId}/persons`,payload:{fullName:'Image only',images:['not-a-face-image']}});
      expect(enrollment.statusCode).toBe(422);expect(state.facePersons).toHaveLength(2);
      const invalid=await app.inject({method:'POST',url:'/v1/analytics/face-match',payload:{embedding:Array(512).fill(0)}});expect(invalid.statusCode).toBe(400);
    } finally {await app.close();}
  });
  it('limits model-backed SQL search by distinct people, not image samples',async()=>{
    const query=vi.fn(async(_sql:string,_params?:unknown[])=>({rows:[{embedding_id:'1',person_id:'a',display_name:'A',watchlist_id:'wl',watchlist_name:'Staff',similarity:.95},{embedding_id:'2',person_id:'a',display_name:'A',watchlist_id:'wl',watchlist_name:'Staff',similarity:.94},{embedding_id:'3',person_id:'b',display_name:'B',watchlist_id:'wl',watchlist_name:'Staff',similarity:.93}]}));
    const search=new FaceSearchService({query} as never);
    const result=await search.searchPersons({tenantId:'one',embedding:new Float32Array(vector()),limit:1});
    expect(result.map(row=>row.personId)).toEqual(['a','b']);
    expect(query.mock.calls[0]![0]).toContain('GROUP BY person_id');
    expect(query.mock.calls[0]![1]?.[2]).toBe(2);
  });
});

function temporalHarness() {
  let candidates=[candidate('a')];
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM face_watchlists')?[{match_threshold:.82,review_threshold:.65,minimum_margin:.05,minimum_quality:.55,temporal_confirmation_frames:3,temporal_window_seconds:2,alert_severity:'P3'}]:[{id:'event'}]}));
  const governance=vi.fn(()=>({accepted:true}));
  const service=new FaceRecognitionIntegrationService({query} as never,{} as never,{searchPersons:async()=>candidates} as never,{validateBiometricObservation:governance} as never);
  const frame=(ms:number,overrides:Partial<FaceDetectionInput>={})=>service.processFaceDetection({tenantId:'one',cameraId:'camera',branchId:'branch',faceId:'track',boundingBox:{x:.1,y:.1,width:.2,height:.2},confidence:.98,timestamp:new Date(Date.parse('2026-10-23T10:00:00Z')+ms),embedding:new Float32Array(vector()),quality:.9,liveness:.99,...overrides});
  return {service,frame,governance,setCandidates:(next:ReturnType<typeof candidate>[])=>{candidates=next;}};
}

describe('CCTV temporal identity confirmation',()=>{
  it('requires consecutive observations of the same person after an identity switch',async()=>{
    const h=temporalHarness();expect((await h.frame(0)).matched).toBe(false);expect((await h.frame(100)).matched).toBe(false);
    h.setCandidates([candidate('b')]);expect((await h.frame(200)).matched).toBe(false);expect((await h.frame(300)).matched).toBe(false);
    expect(await h.frame(400)).toMatchObject({matched:true,personId:'b',alertGenerated:true});expect(h.governance).toHaveBeenCalledOnce();
  });
  it('does not confirm ambiguous, low-quality, repeated or stale frames',async()=>{
    const h=temporalHarness();h.setCandidates([candidate('a',.94),candidate('b',.92)]);expect(await h.frame(0)).toMatchObject({matched:false,needsReview:true});
    h.setCandidates([candidate('a')]);await h.frame(100);await h.frame(100);expect(h.service.getActiveTemporalTracks()[0]!.observationCount).toBe(1);
    expect((await h.frame(200,{quality:.2})).matched).toBe(false);await h.frame(300);await h.frame(400);
    expect((await h.frame(5000)).matched).toBe(false);expect(h.governance).not.toHaveBeenCalled();
  });
  it('separates tenants and never exposes a confirmed identity after governance rejects liveness',async()=>{
    const h=temporalHarness();await h.frame(0);await h.frame(100);expect((await h.frame(200,{tenantId:'two'})).matched).toBe(false);
    h.governance.mockReturnValue({accepted:false} as never);expect((await h.frame(300)).matched).toBe(false);
    expect(h.service.getActiveTemporalTracks().find(track=>track.observationCount===0)?.confirmed).toBe(false);
  });
});
