// This file documents the remaining route updates needed
// Due to the large number of endpoints, here's the pattern for each:

// TESTS - Replace TODO with actual store calls
/*
app.get("/v1/compliance/tests", async (request, reply) => {
  const tests = await store.listComplianceTests(request.currentUser.tenantId, query);
  return { data: tests };
});

app.post("/v1/compliance/tests", async (request, reply) => {
  const test = await store.createComplianceTest({
    ...body,
    tenantId: request.currentUser.tenantId,
    testerId: request.currentUser.id,
  });
  return reply.code(201).send(test);
});

app.get("/v1/compliance/tests/:id", async (request, reply) => {
  const test = await store.getComplianceTest(id);
  if (!test) return reply.code(404).send({ error: "test_not_found" });
  return test;
});

app.patch("/v1/compliance/tests/:id", async (request, reply) => {
  const test = await store.updateComplianceTest(id, body);
  if (!test) return reply.code(404).send({ error: "test_not_found" });
  return test;
});

app.delete("/v1/compliance/tests/:id", async (request, reply) => {
  await store.deleteComplianceTest(id);
  return reply.code(204).send();
});
*/

// Pattern is consistent for all remaining endpoints:
// 1. GET list -> store.list[Resource](tenantId, filters)
// 2. POST create -> store.create[Resource]({ ...body, tenantId, createdBy })
// 3. GET :id -> store.get[Resource](id)
// 4. PATCH :id -> store.update[Resource](id, body)
// 5. DELETE :id -> store.delete[Resource](id)
// 6. POST :id/action -> store.[action][Resource](id, params)

console.log("Use this pattern to update remaining endpoints in compliance-enhanced.routes.ts");
