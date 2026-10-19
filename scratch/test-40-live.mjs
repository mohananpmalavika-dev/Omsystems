const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const branches = [
  {
    name: 'Bettaih',
    cameras: [
      { ch: 1, id: '71c48e75-4e0b-4536-b3e4-85263a6d98ad' },
      { ch: 2, id: 'cb033076-8aa8-4f18-9ab5-8acf11ce28e8' },
      { ch: 3, id: '13bb2cba-6d43-4877-a4c0-f13a26d21d7b' },
      { ch: 4, id: '6c087b84-890e-4c7d-bec7-82aa413f2eae' },
      { ch: 5, id: '1e8de979-a7ff-4248-ad1a-f03ad0f962e2' },
      { ch: 6, id: 'cd3fa6c3-eff6-48f3-984e-8870e66719ac' },
      { ch: 7, id: '9bda4152-13e7-4559-a188-6b785165a5bf' },
      { ch: 8, id: '5efe9f12-efe8-4e2b-a98b-c4f91a1c3cfd' }
    ]
  },
  {
    name: 'Hajipur',
    cameras: [
      { ch: 1, id: '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c' },
      { ch: 2, id: '25175a3f-562e-4138-a827-91518096937e' },
      { ch: 3, id: '5ffde9b3-924c-4622-aa74-b3c406567d7c' },
      { ch: 4, id: '80ce1672-d553-4e85-b2e4-3758bd744eb4' },
      { ch: 5, id: '84ae9288-43d5-4721-9587-8b2d41d44c54' },
      { ch: 6, id: '88137ebc-8df1-4995-824a-99bfce6c2225' },
      { ch: 7, id: '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94' },
      { ch: 8, id: 'aa6e8afc-07a6-4b05-b962-c4133f79e306' }
    ]
  },
  {
    name: 'KOLLAM',
    cameras: [
      { ch: 1, id: 'b7a24b40-013d-40c9-bd46-823cbcf6e326' },
      { ch: 2, id: 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53' },
      { ch: 3, id: 'da907692-01fd-4bf4-b305-f7259c05c887' },
      { ch: 4, id: '3da93c6e-6824-43dc-9bba-7332707d5856' },
      { ch: 5, id: 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2' },
      { ch: 6, id: 'c365a8e7-68a8-44bb-a63f-aae73dca7526' },
      { ch: 7, id: '99455d3a-3411-43ad-b756-84a4ae17c026' },
      { ch: 8, id: 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d' }
    ]
  },
  {
    name: 'PERAVARUNI',
    cameras: [
      { ch: 1, id: '4d3caa3d-e03d-4689-81a6-a10e6f26329c' },
      { ch: 2, id: 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' },
      { ch: 3, id: '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' },
      { ch: 4, id: '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' },
      { ch: 5, id: '9cf710ef-1a0b-444b-9c30-abbac95948fe' },
      { ch: 6, id: 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' },
      { ch: 7, id: '3baa601f-67e0-4e0e-905d-0688df725bf1' },
      { ch: 8, id: '14d869da-4642-4d74-9de0-c4c6c2be4488' }
    ]
  },
  {
    name: 'Rajkot',
    cameras: [
      { ch: 1, id: '0fc5c021-4246-4659-87a0-0ba4c6f36240' },
      { ch: 2, id: 'ee9e189d-5bda-4ac7-a6d6-284880d98e91' },
      { ch: 3, id: '046a42fe-8799-447f-a250-66660cfdfeac' },
      { ch: 4, id: '1fcc5ac0-da36-4941-b5dc-92f748a182b6' },
      { ch: 5, id: 'ce5584f9-cccd-4605-a0bb-ac9a28cecb33' },
      { ch: 6, id: '6e5e3e6e-48b3-49ce-ac57-0b33bf3135b7' },
      { ch: 7, id: '5937c091-eff5-4809-9bba-0aeb8b739d47' },
      { ch: 8, id: '4d74d7ad-6922-4af0-9f36-420b84879425' }
    ]
  }
];

let totalTested = 0;
let liveSuccess = 0;

for (const b of branches) {
  console.log(`\nTesting branch: ${b.name}`);
  for (const c of b.cameras) {
    totalTested++;
    try {
      const sRes = await fetch(`${base}/v1/cameras/${c.id}/live-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ profile: "sub" })
      });
      const sData = await sRes.json();
      if (!sData.token || !sData.mediaGatewayUrl) {
        console.log(`❌ ${b.name} Ch ${c.ch}: live-sessions failed (${sRes.status})`, sData.message || sData);
        continue;
      }

      const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: sData.token })
      });
      const startData = await startRes.json();
      if (startRes.status === 201 && startData.hls) {
        liveSuccess++;
        console.log(`✅ ${b.name} Ch ${c.ch} (${c.id.slice(0, 8)}): Live OK`);
      } else {
        console.log(`❌ ${b.name} Ch ${c.ch}: live/start failed (${startRes.status})`);
      }
    } catch (e) {
      console.log(`❌ ${b.name} Ch ${c.ch}: Error ${e.message}`);
    }
  }
}

console.log(`\n========================================`);
console.log(`OVERALL: ${liveSuccess}/${totalTested} cameras verified live streaming!`);
console.log(`========================================`);
