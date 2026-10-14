BEGIN;

UPDATE edge_agents
SET status = 'online',
    last_seen_at = now()
WHERE id = '839d2a88-2b36-4e34-bd99-6cb247e196a5';


UPDATE edge_agents
SET status = 'online',
    last_seen_at = now()
WHERE id = '748eeb31-76f8-43e9-9121-4c1d99166e87';


UPDATE edge_agents
SET status = 'online',
    last_seen_at = now()
WHERE id = '9f108498-4dd5-4a21-b810-eec9e538953c';


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('839d2a88-2b36-4e34-bd99-6cb247e196a5', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '["172.28.18.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('839d2a88-2b36-4e34-bd99-6cb247e196a5', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '["172.29.91.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('839d2a88-2b36-4e34-bd99-6cb247e196a5', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '["172.29.55.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('839d2a88-2b36-4e34-bd99-6cb247e196a5', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '["172.28.36.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '["172.28.18.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '["172.29.91.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '["172.29.55.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '["172.28.36.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '["172.28.18.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '["172.29.91.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '["172.29.55.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '["172.28.36.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch1', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'RFo4J1XCAUgxwNLu83b8aKbKCvM1vObrzZRTrRBdHYfijnKSAx/9PoR886tyEO5eBVtGHFSVMwhvlSWxjyQHBaY0bas84qVnTYo4qrZlTipJj/MewQtaJ+qoU/Zqvi1TQmVOyQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch1#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'TUuyyRlhMGcW98b64ZnkMY2av2U9c6mqJzLuzUXnPQVmHuy4PwCmC0ZGDHuZ8RuSknnR7MqtqOaHpdH7Y7kOCeMl1+9bO3+LJWIVkWpjwKr1xFN94YtBAsA5cU4BFz8DOVOD1Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch1#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'yeTZ3wZJgsgeL6dBwgubYQO0FxsZ2f1U6qbqAqCd1dPA0MKXpS8yAmlt9YfeYnDukAzI644fx0sAx1T8BGKqJCQWWSkB+M8/yjHE+cxmnyTIQQCD2hZW+/9MHYf18OHuFfKbyQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'VuEb0KE9lKEH28uMZvkFTRrbaH4Vh6QmOyKDCc2WJwvWHn7RzRCbzjGVU3dkBpleF3uB/fZsiMdkOMeqDHIjrA1M0yiHiK4kZx7QRHqC0/VeO1oaQtHzHuB0c7veppWSxugr0A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Ij71ZcnwL9411jhtVJ1G/rfvJ6iZZLZRNre0HIpH6n/kitGaZxfOVkHnwZHTn6aRdcSVyoMCxzNBI1dAjOc39A456GiDQD31iZY5dxX7zN5/s6B3VIIu7ziRdL2ERN6YgdM8uQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'P0TDE+NotYmwNTKbLTzacwG1PyWje6Zxz8MXkIACsnloUosDjGZE+QhZODudwSIo724uoy8Wk/wrNsfQLem5XA2427GYFNhOJQ6HxyX49ACq5+521ggJqazDxQvKaW2Yb5RIuQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', 'n3Fgc8zX89/nYHMofO9JG3RM8olG5ZPQamup0T1fg+QcNEoQgZc1zWVkPUU9aEI30M6jvmPHWudT7OD1NHUpJWEqr/2BKj812WlB7OFwsVqRd6u0pol8PxnIZ3Xn0DdWJ/pDdg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'yQGCG0iqlwH5OKFHe3BdmZUu2Cwmkm0ETvb0CNTFapyRu3H63/8EvQFJTPz1e5PIxtnCy68BEa/7A1UR0KBOJGGt7MZpBospamIqSbzDd4D4St/wWveJAwsMYe64J9aWCZ0A0Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'hZ9uy8SOuI8UrJhzeXIf1zmCQbPyxogYBopDJ6+QLTKaS2lKf5iw3cLHJF1xwhp8P11VLbQ03mCeeV7uEe00AMBbPuPnbuRgdXvYhY4FBjSQ3SQLvpNwNs7Sm2PmiJBNs03uVg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch2', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'q4LTJmJfQut4Wd76wlX5GX16d9qYKN/ELT/ndxZdoXIZBqkg2EOBY6vRgaLHMjRDU6X456rhXqZmsXROqRTcVzB0XDtTaMDXSJzyyv8cw5LoRZhMktnJVurJxrtuULYZFtMfZQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch2#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'FuqhYkk3IQPbfWsQknSobY+jkeIaQKQwR2NfJQ2mV72ip5CoMHQNf67fHGHIe5uMSFzrk3kQIcacjIr3yJw+GfxfaGlsEmuGuCec7zBpW4JKUteiGtSGLIh7h87oyPf1ar6baw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch2#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '0QEI18wYx5qZ4nqsgI7Bc/Qs9vyPlYo7qGrcWZ22UKTxz8BS2bnBIaYxg8QvBHh9zeyJ5mVNiFiO0Uo0gVPXB4+ftYlScSZm1pousX99Hwd8bxal3QKWiRlE6m4p3WWVyKVs0w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'WLZ6w0t7T0TzYSLWVqbKFD/X1GgLuMzJ2s0+p9+KK1P+3i6MPSOdc2UXI8V7PaWF4A2hyW7bzhzJH7SPBDWEEw8jaOtNlT/va+BTOnecirufe0/DSZ4V6CEk7MzP77r2Kfndfw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '+XqHqriKZPskrl9w3ukTgK3FOB8F9S/jpQysX7Lm0uNGKbibDCjgEjlW+hbObQvFz79l2HwsUy0VExYcz4UuHYlK+beCEHFQ1AMmYZ+U9fMC53gBuRIYWDOHUCccrYAhMKpXzQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'kfrMrOlCxsaXXFkLZxAIcCdXA4qeWR4huNLagqsnlMgBPCtDa3k+lpbUE8HFQF1AdnM920xhX4ahas9Xc7KO0ZfhgJc5UTtjbhI2MFjVc7clwbj5DPshF6CH6ASzaJ0N34G4uA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'w8HKu38Hmj0K0/mzNU/hZ+RTzqUuT3cg/b00GusjCuIqm7GxFP48ELrriqApLUU7NsVAaszIFNMgCuYkpSbNsGNfZCaB0UDHDfIUBAoJQzwVyM3Ybm6BsqDj51qrLkgXFPgGUg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'GTNb39pscSy5E6KawQfRy3Q76z0F0sP3Sfn37vzazfdgTlf4/IuehRQYTm4eZiDQ0NCWAp1/Qf8IAwqH6Y/cNfsVy35ya2sLuOKdmEspeli1N3Tm7CNfuC2nXQiZ3gsyzX5eCw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'z3ZIWqSMo+RlQiFLNH+HV4K33UUD261a9QZdYzmVXOWXEOmaq0SwIkgb9J+gcCh5dvDmZ9+5dUPXzWZv3eGdOvf0guGtSq7o8a5NZKvWjqM2yWF6V5xry+YLLQVVs3inNpKhmg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch3', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'GYlDZ2AfIJW2WD7HTynkC2JC1ekLVX6iqiTDw7peMIgK3bZhMQ+/NOBag5SRlaCwFtEy2rqY3yY0Oyvq4WIX7NunRy0WUFwaqqwU3+YpCCfW9fpTeNeAgt+jXWmF2tU5lS2W9A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch3#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '74XjuqjmdtIoDuWrx1OidKsQTAlk4rATlPE+JPhdMRm2+bgtYM7375uuurvPkmSv4KhZ3fbtxmarG7w6QLs5ivVF10CVBr1ziy8Jt3HGp3zEotzSpGzZWyLlllvQCCpFGvrD/g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch3#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'fbyXIIWnTBircuZuOCdBTOdSSutnjZl6y4lxbKuFVjg9Ki7J+9WaLK6PGsZfVhj1Fz6VHzPHYSNJZw7Yg6oqm57yLq4liHl7rZn2we6zm7H93QO+flGML4T9oDviJty/hEAPjw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'kEUQK3uQgF84E9SfcUszmLq4UoifkAGww1BH7X899vZrz8RQt/ZxzdZwPCnhA11TrtTYl6vJklWmAk/rxgQhjpK6KOJycvkdYXXIaWAggdVzC99HYBdT5J5ZMcZwsCkt02rL2w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'j9ptH/B7WB23hzjKuaiPT/bjbfu3Q9gdA2hWvs+LCXIFedP/wwGBJ8BRVTOsWMN2Y385vE+AAhOH43e5OVV6vX3P7WgmFJ+vvHqlVcXU2ikINGq1Bhsr4u1tzH6GPSTrSmkAJA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Y/tkg1/GXhofYaZQw985u5/iCujIb+C+nU3mUNpnfXamzP7zlSAAIYVuxg1yrpCEDYaaPA01ySFDttTt6tiodgdO9480mxRo1A/8xwbJMKISLZ0lfwFhd9sqxpVbVQP/KFi+Pg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'GAA+GWkuMLeoQ7vC3oOBAlRmQK+uyMsA/Y7Kpup2kfEgKkOf066xBHJKUedym3B03OfHzFsKXqOEeMFgMaI5t3esc2E1JX68JuMTBhyYQ+VG/wIKcPDXDSKul/UyRJs8nphF+Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'SddejtrikR6c69W3WooDIawvPLt4AW0lNPZMt57rATfjr9Det3aluokLD8VKxgEap1+tpVPgOiMi7kQeX9PJKRJ0bJG1scqu9PvpYFdkIjRv8t45bQLXIVF3LVbIJ9KtqokyAQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'mGR465oxPY0Lzjql2r2oRAvtqiTlcU0vSaibk6L7e1yLTLH7YMrEuxtIOWYm7yAKJS8S4Urxm9SpAF0unBYZXuqK732WeTjJ4PTNzkCSsc1CCwdNWYpVy/CcHigbGLqSZFqQSA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch4', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'fUGwWlXhbFKtQEKjHVPZco0Zoa2LRlZdBGPYcTKTW/j/ACCzGCtlAwjxdpBt7Q+uJ2yck573j0ewhi8yKFn2V2uccW6knLofuulgZgWuqY7WpdzNN6dUEf4nj2YZ7S+rKP3zTA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch4#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'jRLx2knh2kx7ILqQaCT7kWX9EBkku0c3AQHMPx7ugAAnTfhi4yqFwYxS+zo90fNgzRwYILAl/tzDSvqNM1+e3nkXV5CSWPOcnr4wLU5Crj1m3cUWb3gT3wLCtzIXIsmceggqvg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch4#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'Kdg3TxTtPBtNrsF8EH/lK0DrQiu2rxg1jyAyryVZeQ0YptSt+M0JFEeA3p7pX/xWxYWtEraMKgH2KfQE5diTjoHXqyQkpb+IU8uUSATqEGJvkBaJO/DORpf205uhHpZmiIV9aw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'jfYz9AlPHpw3Cq/XfliJeYg7OUsoSa+zh8Dq4dL+Ivz9lxNI1QAnFOPjeXVmKRQ+ENvhrztk1eQI7aIqV16nP7sU7jxSoK9s/7FzbKnN6rf6W5CvTvdcB66kqZtEPmZjHdbQdQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '4JHNSwvbvEtkqkBO3OHuIhftvikZHTb7E0q4OTZBoXLTcGO+/uHkjMFnqpwF3PqIZH6D/vpvQrJu8eKeIcaNGgi6BV8WxVmWcYe1IEhD/I0al4pVh5da1eqqwh3NZ1/6sCeVLg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'lSMMOxtNCEm1T174MgjWaPDqLajdzEW0DtwhdF83B6iVoZjROJtvc6BYWsyL9eCxYu6m8iWr+nKc+WBnrgNjyuNqEvXCvi+8WxzZzYsBDqAzIMfPpw9scovxHdPTVpLeGNSY2A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'jKwGmZd5cf8DhGfC6MshlVlyPr8MPyDId3ezHrljCtSNeRa3AYHg8OAp+YJaSBOsTOmCaQfETG2GBNn4+dqzTThRKdCK0x+zbxirEjXHsiAUS/u2aCvWH0HcdodBCXrrpVtGYQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Zb6PreKZmmYYTR5G686jYoSvjnieF8Sj2oLiF6mDd+0+21z8+ocO9haZ4gqLmAmB1PLJ3p4oE71d5+qfhJnzbJkO3ABn4oabG6Riioi6l/GL1nGlVnWcuapE5DziZZ864KXMog==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'fwxAlTXDyjTzsQdwRMdTWT33X7MiYKoaQZGrOaU4VrsTA0lM7IfrmRhy/sC/xHYm9YcEQ3k8IXMbVmlHzaXslxyhlsivpgPlojcrT3spUy+H4IYXRndIb+FwgSfRL60DN8K3nA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch5', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'CT3b+JiQ1EPcwxqKXvVqky9jGneKbXVVbPG3XlKJofm3je7rHEwaWzw6GQllzmsEr7x0PNkWx7jLFlrVbXsN6CS4aCss9P+L91396DZlJuVw9Pt197xYrpTIV7qJD0NB8Wm8Ug==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch5#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'dpxG7aPbEV0t9pmQ+7HpcGJd0Fb4S3qt06moDBqLO89Y/+IYzoisffKhkQmnZi277fWtxzglGbyYXXUIE7LpV21DIf2WC0Dq8FqF/GzJMJV5OskP92hCRJE2xPzW1Yk93ezejQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch5#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '1rKQfUQushvN7+nLQbFSkkNJPUQDM0EWKMOHl0Nu8V3x7gKvfjKPH2ZeVUfnTMy4cozXL/ghUg0IrKFkFAZDojuSUVefCcQNg4Vya/VYad28YUeVdPWntmXuS01DL3l+avrfqQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'C+17Y/T3Qhyd4leQ/PXtno5bbvUVCwWHaAshF9nYeoJMCjsbstsNP5y3u4snrrShVe0LifcdzK+CXl/1NvTNrJ58mEvmlAGDt8RYfTgFxnYkqlH7gccWXs7Gz/sfCqAxRoAqWg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'BpcxY49zeZMPncpKrrLQ6+vQ8IrX5ds3c9OlB6VKSX7Cs0WkzhTnKMP50KK1IN1C5+UAMECiFOnAZZEd38AYwCX3iAyc1HEvMkcIcwfXj/+RO1vKha9HDVCECmHghySamXPF8w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'sfvCtH5lEiDSstBipfGWiB9KQl/ytZpLvy3x0fMrC94b9QLR1XzXMvtx+95GN9RmDS4xHcQ1bWwafIW76liTh9tmRIqysB22NcnZSsBagzacjlvzD00uOlExFOcbF0NKqff6/w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', '7xRv0z0fH4oIWRzms53KyZDAnhqnmg8o82OpOdduTGz8P+G9bZL7k0vO2FQiyqNQRamCzIQC/o9jELLAvkONEQxFI+7qhJR8XdEIZnUPJ6zN5YZDLS+5p3Uom+2w1Xl/Ibu/qg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'vkUlxoCsQ4sd4iJSowBbkF2MVxuRo8rM8vejeWMF5RcLoZ7zPVQlkTuUaIl44B3ewkpf0pmsIOe3/QOCQ1Ujlv+xQ4qjv5HLEKI44XNJn7bKOt47JTQ9skELf7yRCxoXg9Gb/Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '9lLwXSPsgeht0YVEiIDINN4LeEnC/bd0kjtOmP98BgPRxjWQlkN1JjK6hW6yeZHu1kAenaOfqaXNFB8kXuAs9kzMOHaLccAIhiZWySa22iQ2/xUYn+39wCtv08Ax6+Yfv2MGpA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch6', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'nQo6H7oaNHuiPxkClsETiX/oQkf7cLMznF0Jxi4IPHghkYBIFkXtNT08LZF07P9oOiY+nz+vjBMrKZrBGu43E8YI9CElSZTTzvIM3NJAHpNe8BAMNztG/qx2BNt0eAcuCBGKCQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch6#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'QvyBHdz2FnFehUkAKeKUo5QhsYBo0qal28IHHJrxWnQtzQmKzLO57NdaKAubetPuiqylpfnJpn8SzoSPXaLiwMH0D+JwfX9GrC3HUfUo3p04yyXjuMbfkgFAVnjxkzIBcbFGTQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch6#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '6I2pMZ3qwIIa9y57K1rO+T1cs/vHIhKeMPb8EO6ODMkyWtnmElUNPPKKZ/2N9a/00sKg8JWgDuLN/3cBVP5T9CTXmei4bNvY9KEex7vOe+h1Hwv5N3ZJbAM+4z1z8itktL1tfw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'JC7ZHM5/rCVfkP+GYcFd0ZBMO2Ui6lTNWoMEFdRHlWbbfe6E7MdUeRzRArL9n3eCfGIP1FGmnRlvHmzYcoWE5bcmWKYI5T4nQ5a4LbNOY9NDYauwmaO7SiYaepvVMWwn5uqJGQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'HPQ1kb8/672ANwsck5388JaJQp2DpSF95ArLdZ/128lQngqrrds5GLh7dd1n7/GpdeXufcLrYgMgP4jPReBWV9lVi7d7j9bezwEEnA7MSYeBCXjFWZnR5qqHAzC14g6MKTa1cQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'GY0xheYf87nOjzwNUo51Tn9LFIXYIss1oTzCNQF7CwwWsiBuPoiyIdaQFZ4onT3BxqHxErrfDMbX1whyTJ/PgS/DObW0bRQSnU7i8GRJXK+LMvTl9gBj9wENP/CE35vrsU2AAw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'KIQ8Mi+AjhEnYadiMSnuh0JADGeO2xijIIiF6MoovHsduqv8KHR8FQT/PPsq6k/m1JYiDrkfoMGzD9vhTgX6mfZUuA2Dp19hBKGEKT09LuRsdkvoeyIsCgEkJXC3X5ve68wXAQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'udGPyYGC/Cy2cGtJxmKTFX4ObfY9bJTQ7NGhXcSLak+9DZ/Vo8ftD6cLQwsP01W/tQzeLMgUNNTGt0+8fqKuyn5myLglm7G+gR+8o+KHZ9ocJlUIh2r97prntBhH4h48V+WA4Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Ugi8e4CkRMIfiIPjUN1Koym4xzefR36IL4K+4kiikVvTiioRSoxhVXH15sIvexg88QMA7tmtukAPuEyp5xwJc861Z9E5NB8+pzsorJrIiPPoBS8lrsSfBkVL+S/06p8iMUS1cw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch7', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'ceqs1c4qfDSkTMfu6njpEdjooO6FmozESNvnqULKcPoxOVhH5o5M+mRtAyw+KAv2nfFDz3anmpdgbFTLswpBegiA13+woz6vng16misScoAqM5mLaYKtZsHLAVan3wQBWSPULg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch7#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'SUrSXH5clYyFtUIdW8N+BWhbBIcC7wWUUfKMzR325rI9PARk4i/6DtXi+h1sRX31suh+xIU0mMhvqualszz7S1obB/nM8X+YmtyEcaj+jpZYElvXapd/k/n6kC0ijJ37I3BRAg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch7#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'OjXupSPPpZh4xhWMUT92OGoarOVamPH80KZS5/ax1ewlFWqFzFM5DX1B2qc79G/nKz6vexvclE9ccdztvm0lh4wfiCJx5uu61ANlvbawmUH7/TJ1AfJiJpfAz8q7Sn26KhteDQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', '/8h7Qq8g/vFcyFiCul8H3t3XEvf8980+sejPq15scQmdMtMYUeBIM3MXKdDkQL9tSrLIQ84vxGHbrD1vngCBXAUma8KiyQtGFBLHfDqMu7XI/8lJIKHd4QtHgfVt48vcJUBhLQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'brIzdpCZDN83n5onnSytR7gaBrEgi07bhKcDpc5ZUXn5hAMBzJJSeAQMQjjhxHHwBfC4dy8lw5//MRavPHBiadkzZacGl8E5Z9ZMcPS2KgkPIHw4jUEh8X0i9DJgh3SbgLK6pw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'wZ+rdHPHp7hWOJ4c9g+0vE45J5/j5Ndkg84AS00YOAkFbO4mFcTcgUBaZd6OIwwM2Xdu7U3FoV7gHfHNj9zwbZGMpERJzuUtSvIBRuLF+qk5+20J8Z3Lp9RY3mDVJKwq/FeXLg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'P/JXexRnDgq9WVqfKrK4f3pd1oEy49yK/aRk0oqArr7ypTPpnBjzVK6ktIqzxdghC7oyOc3k7gvjjfUkXjt2eh3v/zBtXxZu1FT97t4YQQhmJjwAHoMsHxIwdQC7YzOD80YADg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'SKRx/wfwhogAjCpwFT0eIwzVFQSrKRB0fGknQZIG3ztwZMPF7UxVDpXvHpJ1xUAD4xMMNrOAu+SVyohyJS4h0LF0vG1y4kh6xdTUyekSzoEVYu9K+AoQD+puiu4j0LjlGgG4Ew==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'GW9b1qgM298FhLxSB3CPqrEbDB6o7LcsQiK+psqSIZu82aJ8uCcotZH0QCRUGR6ZEZFYdJ2RxpAZe42YaoQp4ZYALdSDh6Bcuje07FlDMz90nUHcj/mv/CEBSzk+VhnMHA8j8Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch8', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'SrdOB0hyiBmb7sp5vVkdcTY/d4VSIifVC16hAKi2I8VsHmBXZLuTuSznS3D4ApXRmAoasCjCbI843gUr82xu3OBQ0APyKxu+VEWQWji67EuPZFABPNNr0S5PZTEo5Trsok8hhQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch8#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'hZhFtNwyxFqDEXAncaE86/LkZeoS20S3MxA/jCWQ/NE5hmPMcmVaEm+d8zzd+xVl/rgZZralz3LvlcRMglMtbPzSPBEV3KWYi9Z6x+6nwZDDqE+FnSE8gSWdcBJOz+d401Mpvw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/bettaih-ch8#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'jzP37LCPL9+Hb7k02mAUD9q4TT60ZAVlp3apLzDKVa6KaUK+4WbSLnVp2N+l06+WZf6iIonuiSMp/mv3QjiaOfwWuQrKFwRN/Wrseh1ba2b8LmNwhNqfGUA3e6mNjEyhassXaw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', '9TRo7mZUjGNO08aj/AJOXuK0Sg56VzVFlnrZ9CqXQi9TDm9bbioUgMCgEdRLuBW2ATtV6xNcDJNJ2eXr/UG/v4rhFemdlvNu+lsODvoTz/m4PGlQ7fPE9EJfdbFvyvTuGS8V3w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'te1XwJ6TBAlIgTWUU/RYYYOIiaT6fYjiffu0LKg+O335360jLi4xXUR4y40ByuK6ao478CtOL73Yl88vl+4ILehV3jQLjdYuaNgVwO1EFKKWXfaby3N3UTekxZUGBXTb6koOZg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'dF6VdPQF8VE6HBw8Ek/rhttJagOeeKgVYHom4Rw9WroWcoMGkSOOX6plo3NYYubDkIDAmQ2zvsV/aO7jnnA9jr7DPDFHmHLsyU17fSKFDFZ0LkcXj7WF9sAfyv3hhhGoHE1zaw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'NjjklFkALvW0kUaEN0WocFVa2QD9C+hg3+xQnqFOs6BHcJPB+w0mt86o2WahWAM/3BTIfy6e2C6KxKz6ldm6af9eBib6rQ1rTGP8eJEu95CyFBBokEgRBdV8mFM6/8/UibMYsw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'I1VzLedHIJiaAYk2EcKKlfxLWoUvburn5pXsUJPcyRGmmcFqce4mqUageEQaLSKStVpdbvw0rQeNr2wJsqgJNdukuVdpg2XXGPfzVx7U1mAgA/naRnN7ikcHwvHCgf9KnMquNA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'QOU05Mkpsrf4PWJQdXmdLopCxjer1IHmarFNRqn6ij7ty86I2ZHBVWQmzoKM7X2XAWia6x9gFocxPzgtjoJiozups+4MXhllqgv6lnsRGHnOtIxCTpFYDN/KpSHZNhpiosWq2A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch1', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '9IwFhquqSKgYdDUqqtVpKOzTwHE6/yEQ+WKkiQqJfl4lTmMheu90JsiUB2Tr0Pu9ltTmPY2GiE9B+VjlbvyzMc2wTPvQSt+ORhwSxCnse/9SCFpZpTkQKdPe/Ykk8u/1eFaOKw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch1#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'eqhRb/4YnHKfw3bGLEKsQUpQHCkfb/zwTpne/Fmu6+dpxX0FqzFCyK+VaGjpegpdf4MnULAXZIp4gLoOI1SPz84jRy3dPcx3ONmk/FjPcqkt6cCezkc55wFegtC38KU3u8Ig4w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch1#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'UDA+xAfbyJVh8tZF/zud+1hBep8SHH5uYNERnbjpAFJUU3jxsUS+qeSruFiv7OTjkUJtaYy7gIhu/O7xpS680cIWhZ+d5XhXYMyjmGo49LXZ4PyLPhPksC2A884GNXihlA31TA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'LBSY2kLgZZp3iXazDBlzch/x6EhveYx3YKb2Vew3rHQ0qgpGNch0HHVYwxAYVOZ+qogAMH93nf/d+K8Nkv+5mz87KSDhxkQ7eLdFj/LsKokXKA0lwIVMdxu3qRWKLBB6yyotEA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'fFlHUyYqBwWiRwEmdzWzQog5U2LmzDQLUlKyE3/mnhtwdyUNWnKvrWKt7Qf7KRVljGTrI2anwQuMvC6pLSo5EJWdP8qJrQYfAEIlXJ0a9Fup24XXTwAKRvpNZlH/fZY7HZWFiQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'GLxfEe8bc5HdePLAES9mdrgJonxbAfONgTiPMTHiQIcDEOvK/Bi2AIejVt+oWYrn04U2qTaJxUiYh0bJ+8ptLEXfRwesXI1Sfl3OOt5DWyyaKpCE/agLMac05LOryiKQZz7F8A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', 'UBKGTuT2miD8p2qloombS7QkUzPw9Yw3YnrGoQsp1oyDDSw8FU0W4p3FEm4TpGycEa2gNzJeugj2cGWTTNbciJm8BeIHKx1HQWoycbQitp0wmL11oAKgbptgZO5mCNYnFRyxbQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'w6KnZNOtIoszm9cqaZ+OLtV+HQ73GCFuF6ZdyLPHMOmfna3ekVkLDtR23s/qRkEGAkzLCx7RSD2miyzYQqbXiDfR/dCp1VgfenotsrC4fRtODUf/bCE3neXS9PnGf6sczmEIQA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'phyHL004Vu4QCI9SHpuHoY6yLYwdrnro9X/lioawGqBiAn1JCsFGNXrfvKB9PaUN1Et6kWxO6hRRt8uamIXdH1TWyyDytNnB4zEaXfQ/dGzysd89GHJLeNN+rzh1nixdwy3zUQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch2', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'NGrsa9x6UeKE6+R+aeSa9LMe3ze/ohhOCeAgy+/2rPnj9P1g+HXAeNUjJ+MJcfVwTJfWzLWPJpN5Jv81l7hRzKTm7gppt+mZvD1yJhUZcf0XmnpZbE2drQ0ilmS2cibdmB0DcQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch2#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '53yYx3XGqH0rFu9g262E36vHTBwEIXXxZLRSKVf0YSwFNy7diO2bgw7TNqjpzKc/8wq5/Bx/DHT2Ne2ixt9lrQlU3ZpeKcLm8mUoobFe8P7vcZnBpumGX+EvysQfHSPqhaPiig==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch2#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '/6akEUEUmGxUtlenu8R8HaO6NiZDTV7i4+IoHvZINo5EI8W1+yHhv6R3U2Zo+YMwXvgrrcygLHB1Kerq6THusKtYIVj7ChhlUtuM4L8ut450CVL9k7HiSCnSbgl37UgFGI8jhA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', '7GAqmfrG3PiCB/Y/PpubvW7FXBRunFfQ+scHSN/KEWInXWDLN2oQx70h4EnP99EQkXA9jRW4bnkH8TTm7b6rsSlKtXpUM2TAsvyw8rCnJWAGNPMxe/i9j1FJQrE4jgpEGxvilg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'rTj7PFmAI15Qmf5ua1D91VdEQOzQa8CE8NEU+5a0msg4xEzcMG+FLd1RooCcpGpee0ZmX+RbaMishfSlMNovuIwwiqelOkqZ5Jqv+qsE0vNBgdtg1yVf4CcJviRShCGLQYirbA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'k0ckyc5RTbDnu9di7kbeHs4cWMR7/KUG0oeAFZaUrclUoAFzTjQbguiqUHQj0swhZE6RuqRjqpLIMA2pNdlfQ7JEVCIaZVA2uYLAEBsa6Tv5667Qg63K0lG+mOvV+XsdV4j1dg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'XV0T1W2kQIdhVDFNflaHZKbZMiKzgjZt/MTCm1U/PH4fPXZe/Vx1pjQ1CdGuP9acurhr2Lj67Ki5nSUoouuaR7/VJ5wZmqEM8M3gn5ZcbAxkl1w1viGMStbbhGaXauS+t31dyw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'gVLQY/YM8synnNXUeF8O8jJiexuGMAUdgWSOXErUC7dVybcZrENEnHMUuOREyZVyG/FENp0MAf2naOSIFXtiTcRYiOyXe0k+/P+FVrQhZof9o7ASJzmy/dDxIaXLCE2e5R27bg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '0KjzmhzXi3eDx6GZrN5/L6hxKfBXxqs5RJKRCm3k6jxcGgZ4f6WbrBgh+/+LD/zddBP2hcxNkkm7Fh94vTN5ukUvnbUXjFTn7lS1+lAbEzWt8Qt7mgEbu/1VapNcFSgM34I1IA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch3', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '1BQEJdkKntfsmHJ88g6E+h1suPzwCmBnvWJO8sw1fvALLltL13wwLrchS9kOLaGn0AuxPmTmn1WYTuMjl5dKNeE4o8cBg7clP/0DkL5G/pe7ukdt5q/Z/Y92ky3fVwUF8YowwQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch3#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'UnMXdZluspigYF4dQTx01wIkENsIGCor3jrB79cneM0v58VkLIw8FZeR1v2P4zv4uoe5f45gXpIm2GjebRVEyXwZ+BUlv0azIH5hAfAgynGbE7C1wJemk36z5f6BoCz2RkGYVg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch3#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'E6NoP3TvgEVmD4GWNSHxHtLZBUhufsCme9+a8+x4bXTqfJbXKZrQIhA97k0t1G2TAPsGNR5Ja7tLh2xp+JG8PDx7vrfPspKod1bFz/CAJA/aeLjfC7sVk/dz4D6v6FKtqkB7xg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'k/L5OGS4cMe+d0/RlSW5W5fS6tQ5MhGYfCCrtjcvCSTIRdeFlbmRI2mYByuSZxjB24/8xfOSOcDo3WBkbglqMoQfiwjKYbmspJGaT4MdYkUOX6kR1KjAJUJ55FKgGBSj6huGJQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'xPLWsp7QTe8CCZBYbuMrfdDCB2VDTFup14BUXCAmQGY3UwMgmNhQ5tHeDyx0FYfJrgIim6ilvlA+pot0eW+rH3b9LaiSXw3HQLT/3ISeCUNMGWn00L1BKuPIIihXhCvrJ6UO+Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'HC9JJ1JHb77BwOX551O1bMdN53LzUPf3otVc8WBE+WBA7rWPhAipq3OFfux+ApzLFz8byep6a0rVruOC4jbjRDyGp8UuLKE0cFG9PI0BH35KCWSEWALgx13S8gayvjY8w/4ZZg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'TS0eSiRuvw+SO8umXYWtnk0ieAqlPJWWBMLeXiNUQv1x8eHyLyXKK57Gpe0B0f9iPsoFGJPsoOO8dfwJK07YhHm1afHwZjjgBj60h4zIP3nLiGn0hBfHvl2oONi8zN0E4lxumw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'W7Was9U4u19ZCAd0Jj9PZQC+HAOTkxE3xwd1OOunddlABx9Q3DIbCww4ch2vq/UwMXssMO/yeCPyoIgBYCWM/K/r0vSq0JV1oC/IBKSuY6ocx9DacyANWBpeK1diEmw5oQ8wow==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '/CT5FjrRNWATZ+ExSRyyNzsarceK9qqs1kA3hVQOulBpk13h61T6n7AO9sRzBM/DFPA8H4oDXqo7uSq87dC8j1RpjxNKV6Of1wvEKNekeeS2GXvyY7LGGj2ae4R4tkqCGEim2g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch4', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'HapfAaCpL9xQInA8GL8PRpzYBQl97ibTIJ4U4YX8DxPnnlZLiY7yH/bhXtJcq/Je9OM45HNX/pGeYpjr8U5LNsgnuX7tMOGoixM0X8dsiCz1kt/3RGcwLwcClXAH8kDX0atk8w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch4#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'dHqrQvPAY4OzkL3T5AHBDFAQ5y0CrruuCuhgTjG1oRN1tmMh2Q852TqDw/0xaNlgKnglwHXHz3e0rH4ro9HRRLRI/gzR9mRrdlRClz3Hx3YeySp7gQcCbeCiHo+NWQ3u9yxDeA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch4#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'Gkcjm4T4gFPKvuLKfXUW80Lik46QlI4F9y4zOCgrRKv0UVaKBGlYx5Vccdqqq1U/E0SOR5hEtrcxHpdxmBe3B90pjfMvUAYrVCAK8BkQQDYDlPaorac887YHemGOgcSJ3r5v2w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Ppks1orYaw9rF3OMn6r3FilturQ+RAMHqZ+Q8NkrsB4i+/uZYjw0BulcXXVwLnm4SgXEZLPI4g/VFGuST1O8lP1pZJ8cEjhT24kNiqOMs7JuJGSa2yvxIRZwdQ/BGYXMPkrDAQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'p3YtdU8Di1Z+m7ePxU6vS0hld+BNHYtB85Tlf9b29HY+30PV7GzGK0M6HmmU0EWRBLhKVYaAXGA34WHsqOl1sL3+O9rVHlYtetZ2bpjAZNGENTS9wU0BOhSWtM5Ve4I9iYUllA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'M24Sj2QDt/bDpjrg8hii6RE76za7YPzgVqy50kbLs/irp/IdKF6pmICoa3u3Osjt6JR1I5Ww7s9e6QfmeNw7NGYBu1PWpYYB61AyHb67XL303gYaKArJ4ItLlJAvzolvMuQk+w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'SRZue17sdI3ml7WrdDbm5jc2Bg/fofygsohY3gJHdMrk1pqBg+6W21qt8AG5Q80ZowlNgXU2K/EQo4EK4dPtgD9TPV2s+nu7gpqcLh8AyZEF22/Z31wO7E3d5cjSgUrJMuyIhg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'tokUBxmcI/P8o86k0B3i/mGS4FeZHALTmxqGwu3WMGzrxqihrsclWwsfhsEZSN8jnKu/05zrYcUcjKFcHtCWNyFY0PbvZfLrBUDXHAWEIMN0LvBxOpZb7RDIW3+w/kU2uoCElg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'XlsGt+z0u47T4U6lb+qYli6u4haRcKfT7daPajy25TTq0Ww+8aDy20amGRPXsAgn/cFksbpsLFInNhdTANw2Gci5k5qAFzU10/I3GzdxjkdGKIuPVLkODiByX2VlB2OcMWE4hg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch5', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '8hOpkBN2SbDr8AEfbuwi5PuLehdy4751Mtdd8cijo44vREog7oej6ZUeveb/Hf+2hwnCBuq+s79hBpxYoOMy/S8u5yUZBQ0bUfZP87HSh2QXQMWzwdRHZhiRUc96BtFEb7vyRg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch5#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'IMRIf8bm/gTzSQCt+8tq87I+xBJ+3nkKoXSxfUSTJnIWfxjxJw7O7hezPN5egf/jXxDR5F6HpU3OXqLMmLz3Ci3FDaDHtoqGvcrI3UohuCtAAwrk2WceSLlM6USYS/SVpoudsQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch5#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'Xl+T0pLrkeFG00rXvoPgS41ULAVKN9ySHISlKRM/uf7WVbTuRsoxBFOlrow7kqi02o/5BKf7YX8n2QWOw8+vFDBKOjnajb+a34vmPPuIzPOO3ssqP9l2s4/trISv3TNJoFmiTw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'GB5uuB+Rs9+3fLQrZxmqI5LmVSRbml1zFaL1mNQA5rHzlGOY5IBd7FQH3rp4NiWDjPP9pH6pN4El5YBTDLbp+kiWKSiVqPt+adjnDu8dr6dmuHFtieGu7HrS72QDwtfT0lXRCw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'MPUFeT1DtHjCd9/cEKAPTzf1KSBHHlh8vH4cy95L5f2Oomm//qO6rMbsCo0WybNOzb05A3ekyPepFl/Clj4KoQJsedgeQ49HKVS1xruNzEHE04uUDJb3WJlOxZCKLkirnZKTXA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'F9nqnQa5jpkfp4x2O8a3ttbKrjYGkvQOQ/j6wKsdN/Hi4Ut46N50lCQj2FNsjWMPj7z//2at2L8AUCcAftlkAwNNBUY2iDs2TDGM9hWJoEVWQrodOlzovmwmvYzwtztsocPJwg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'PfS7hhSDrXzqbVBkKsDxdSKxDoUaQsT9PjIEWxgH3oNpaWdEsnBeNtSg1bRdAGeowkPFbAiUJ6DQUynL+C5Qhtibh0h9BD2EmfliNjr0prJIcKeIDFs9RfuweFFtka6SEdogqQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'WeRTBvf2vsjLZvC10YKNZVT2vrfyQY5vMQnaZ8YNY2tNAenSrueFDBfe1PZ8Pvhu7xij3zWU1kZHK04ut7IpqsPDdMtgQC/k5jTtxgiSbXtVHVrs7NwpGjhPCJpL3EcjZPJTJQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'PF+PAwFVawOX84F5WYoQ+dCs00HUO4md2s2bAkwCfMmrI+xz4PLD4fsrQJeVaOoTrrcWumrX+VgABU2Y9vtIwYmuvsib8yKNmM5Iw96R42J1JPCnVCkj/L0hoaB48Ll2Pb+R8w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch6', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '47R4Acos1Ey1B5NG5IQIq8/bNruqsPJjg8wfNgfmayVNFdBO0tSirw8BDWN3Lm3I30v93AFatt83q4jITsjhg81uLWls7ioy1qAciL5pIqw9AjPqTHdF1nuV3zQix+ctv4AEZQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch6#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'axmqQWuiCKQQwTB73zMtUld09ml6SaPY8oRyQNbx7A7VgiTlghbtzDvjAnm0HXOo3/Cu8NyYp8YmACSEtD7NzUwv3iBNOdSmFvwULKEyEACuJvDsbW4zuuRDA1/9i15Z4Qe6qQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch6#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'DIlFq85mgc5LRigCmLCxVp2Q3oYaEhRI+VaGTig8CA3E370M/8+T3zpEvjeE/tDzAzabbSBGtIuBmWuiPUWIi+5/wmQvzq8GO9tc6jG2WGQIGtfOEDpizyVS3NjKuyMUYEVX4Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', '2kRaCwWv36/GIB/aDb19SViemQFKHXEmQ4iNKNfquGaSvJ1BipwkhXZR7ZjQdd90JXJWha44rJxx6RLsuP1VmoUdIX+bm9JovBYb0MmsGPE2451waT58VzH+up9w537kqCFduw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'y7mDv16wGMr2ZeebsESiLsnfm/Izr5j89JeQwLZAqFN28G2Cdfj9ssZXUWskHIfZa2bwyLy2beVltZRCgsCxVKN0zH7p/1DPd8CY0oftuGfY9MNZLA93fkjwQBCCfx8VG1KEyA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'pt1QmVv9EVUPkDxhuj/4+6Wn4cVCISaQsn5eA9ZXgACvqHxrTbS1hqp6uuGCvVBFpFbycfV5Vd3UWXqF9lQiSzGmgO5hPa5LYigzqDYi7DmsigcC+B7OYTvitiHuvNP8pQzoaA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'QRP+GZIG4O4KMRaH8SWssbMqKw3Y6PiBuYHwEkfKgwNTn55Vc+BEw4vv0ofNJzb+WvUX1e4tXaHPrgKT+J0nEKpjOXhTC35AOU1/qx6AXM7DS6bdUf32KbVgC2NMctVbWVmhpw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'b0zhdnsbeE9C5uZHbmUcXipKB4Yka5RX5DlK2UFnFdfzo14cM5PjQR2J6AmcCslZWFvtz97PaOjMF8cjCRoAlWl4qVsxdye2H7yJVPNDTNrqeCCX3MZBxchxKsWF0Zw8nskV1Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'f/nVZr0IfnotLiHgGMMdvXO6dP+j02SHEnfw0qQ1C1/4okr8bvZYnCjI56UynMZnN1Kf++cNH9VkUBZsHzz+LFFhUQIR/11jn7iU5CpHFqiIPMClFA6Rd6LgYZ77+X5Sfsf7rw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch7', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'AbbtnRFPI23TOTQ+CjGAxhbzBthdEaMLQpn72EIsT9/iGMPIQe1N9LsrGb0jMABIMLZeNulWgC9vEmmRssaEdriQVTVdZesTfUKck7mAoWXS2kaYmQ0Eae6im/ZnpTBLVBk3rw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch7#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '+YSFG8HZqJFJyhV1GUpLrTZkiaFTNw6AKbTd54RammCeShk/eMom3rEhtwWMG2hevfirOL6NM6NVwdviGdiAqaSimDQa+9nnNNghNsYd31yH+OzN7zK3ztvhBq+lU7vA+K4mDw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch7#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'A9Ynkja5WXOVS3kbsGyEIOxNEKWbSqRdHKHvEp37YVJQFUYCh5nS5J5KnlKdnmM2TFV0QMYsMEuz21NdkEqO7mIknm24CZUn68OLqPAxiA3HQoCr1oN6MoKM/aB9XtomB6Bj8w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'EMArGYCEN+pdWqPouAzWfh6Z5CqsmLWIIwJvZX5l7ldR4P8B12AZu89hCTY62c8J2PlxRrabbPmhg0WbPGo9YreGFFLELMVN1jWtM5EnPqsduTWynZ2mLWsDqA3ho15Dyvggrw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'hMpK33JpNmEzmz1C0mDAtxV4zq3LF4OYr6G1xlStKFddlVkqHp583lprKGoaQqFFDrHRZJQQ+wgvcaTjOv9Ef/C+yCWZ+T61W0GQ6ZEzI/OgrgiVIbzxS6DiRF8ppj3Ba4Lggg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'NjAd8qmj8r31AgWkitGzlex+TOozP4WPfQst5g+djluQJXaRhar1laicnizIoQRmCHkEyI678OAKLABYwqBJdJEmq367/E8eYP4etqLSLr7mBTHYXi1gB8uRU3m5Zsp8pRFHlQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'LvY0HgmdaDHWycygBkK+1yemYaqSeRKHspyE8+XU4PeS+tZ6xgeJKTj1mEBFBS9VhfpM6UghflIPhRXYEDrnFI/TsFhEdZhJ73JZZPenIVLUEQTXu6fTCiQJ6kWTurxSeAQRBg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'H2DD4XAMxluQE7BdWUwF/bsrx6vqshP/t3PF8uapJxeRwoIw44XKwBDe2S+8u3P2qvltobDCHF6tk7fHnsU0VGviwZaTETw0CFkPVrDuZCTwmvr4RVPP6XkE/e1vHbvEF0gBbw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Axaw5yqTCZFdlVWAY2EdPHzHa1zLi2gmO9LcEIq/KxroYn0+NSJBf7DetMuEP4swcauN1AslXE9jSy60PGoHG2vdsUm7JbU1cIm3SbutdT0m9vDF2w0uyiluhoWcb0CSY3ZhVQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch8', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'sO4Z5JPXD7W2rvhbsGrI5V942mI4lowSHZwMvOvFHh4wyV1YvHuDCbzNSRSicIqA6B3F3Nx9HeYUuDVZ7fDyH7fa5oCQOhi15owpHmEWhEUUJwOwMOR4Z48UQz9ICzzAWb7KZA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch8#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'TFc3poqbbDlQp/9L7GbLFJlfYB0XkmTpsCz+up6x4+E1t1FSJ88hmfv57bh7OKkUSNWkFEaM15XGXTNTqGqbzaqktRlFQDaTwUMu88Tmhzus3XDmGlhT/h+z62piAuCYzGuMkg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch8#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'm92B8hOML9qpMahKvy7iviK+uKei3P7VKO5LxJaDizANKBfShG0sCV26jqDMMceQ9qEiyBmBlRG4DMzL5lqPvT4p4pi/eefwsYtUyDYIH+znbro4YG5I3o97Az9vMnC/pqiAjQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'jcfcjjGXU1YcdCRC+m74ZnedmAmAABrOTSHVOYyvCJA0L1BYZmUSDdgi/7YXMO0cCEcdM3+eN1RiO5PJ8Arg5P3F2cUitD7Tv7yYip3C5kLRQoa+AMsws3ClW+iX2/Ny40l+Kg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'LNZSF2hzGEqmqZqTcwpQBNy3VMucoNw0gsxXhQjTZi+1M+ZDyqFHgXeiHu2FtaGu3OnRG0LPJeSRh/4nYEY5oqAY4WqYD6k01hk4YmxzC3B0ZNPNrj79nF5mfQdN0F7LU6Yvgw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Ob2dcvrVhTxVatR+6c4xKoGqlRGDPbQKrzaUIqXThv6bmS5UwCgFCgnnBqGlxED67XKG2MXcZM8/i9K1IM5cPuuYf7wXdPC3R9sk/tXRfy3hi10kB+g5F/SHyKWDI1XkaIwI7Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'wFZnzmyFpAJgULQn1R1QgZuMbiaArKmCnZbdSQvZwDawvdLYk38mhqjTraLdfpO18mYcH2QQfPHpIqqlCuI6I0Du81ul5ZJRDwZ2/n4gjUHledtET85O94wGHwD/yt/Rr1GnWg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'LLgcF6PgUXegvJDJ/ILxnbsuxyW6TGDyJzjtgzWDfGckD13a4kRAu8eq7NB2A3NgmVQd4W0X4G+unokrR3mk/UDAJ6ax/IHjqmffg+Luz4ow2DVgqYs6RQ9XRiBhRvtHEkOltg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'c0fS5IbcKSZMFqma3jOCOdAmJykxABapAbLeqNKQMZoCQbinLoEeztX20G/WuJkKEaxjic+KIRBNW1QsHT3hX50ePL33g/BisiQa+oevRYACbpU77UCO1WQ5tEsMuc2scFJmcw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch1', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '7M0cjNi6DM3DrlexJE83rbFLzlH33sxsRqbSUf6hPXxfNwYAOzRrFi++0VGzzlq3+FA5wfwSF9yWs/bK6ln9K8KxZq1Y7Jx4HedLnL2W/cdckevwH/+WVWxWydnojzRtrlPj4Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch1#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'mYOwPACzuM6Jg3YEtVVLhlmtoxaNWztPI+3kJjOHCvSkECu8WD+L1ujWYvfWTwqBljZ/m62kohak/pguXMojqdnZM8nM70Fh6VAikGkySu4nIt+3q4/kUePmlO4XOMeKSJSA6A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch1#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'Q7OpEtVr7vLSccOc8S5bxnt1WgYYhTnhsdeOI4IX5H9feRGEmmfIl26vck1rdlsFe4r4A92JWZPDn/+9B+qX0869657BWO1Yci9f9nLdYKs2fuycNkqPGnSJ4xkgEBk6syD9Yw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'tRA4QcxYMIlVQDXaaUsfKWFIiCNRefWxWOyQOJZE8g/b7CWQEZDbF3vlUGfQQaNRsM2pTJYZyA9gdHm2NNqEwJaBZjbbattJXm/uggQD7/NDkS05bk65yxgjXkGetixEEoiplA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'kaJwDq2k880XvYLHfxSC8yRrZYsr9vaA2iGX5jfvh2dICdtsSAm5qR+IKfMF9hcHQWVKO0dvwr50hdhgQsWhsXboa9aKT9o2PcP16eKOsIMQrBIOLy25lLY4yFJ8DIhBS39lIg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Im/o5XauU7JSXBY4xzJMpjH5pJ/Vb9pS1vwSa2ocM4pGvJvN6qiA02YKe38iS8AD73VbEgndTlOKshVyINC0fZ1P9VNur2qaEu4W2ktz3uH6vO/uP2exqQwlgeWCOWE5NBYdNg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', '3jCkSZC5TtYhNKxXjlPfZAt+B3QyZ0ghw8B6elMk2aklUxR5W00rfl4Bkkhb99nlANLdaFd9KNtZ2PCNmyDoESY4QcPvM7rvJB38J2IcOXvSt3SqubsznYSZ9VD0XVLJ0jjzpg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '64Co/aAyg7go+uVjEz7z9gy0PA49RfWHOuMGA7VXwtW8qLHYL5e3QNu+4W75RaFYdsIdraD9d0P595C2MpRHJolt51ds6unsXs7kuFXaBTehZ72EYJq/z6YQQ709HJlcbO4/9A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Fyf1dfSDNgEPPpuUIbrCNfzloTH6TTdyIbK0a7rCfuCO085nbgvCoyfTUNcR3Z24jzEVuW1jsNYpwh4eS3J3S8BxxpGpHpKgkutt/U8Vl8/I+5xlpBEoc9upQvskZxtKvJefmA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch2', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '7fbvxzo+VDZTmjxP/zfk0F+/miO93bH5YTPB84JcPxtTdbNKFV3KLVJeAo6Kn/plnoB0qY8KwuT2gNJU2GyJY3QCo2Wa5gApDUpZJtHVlZY8EqW8xOiFiDwLHKOQ00bMZQBAHA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch2#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'WBa+xxsjGLmxNKWmQYQtXw37Svr5XWqqVCW7n03o3FNSLoI6PTWV1V5LSZRiq1WnsK9m/n7x6JszZODVQ4oLM5/OvlbaFO7FOcmGVbiFAhRcCYp/6xkqKL5h0eYg58oCd4DWwQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch2#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '+x9kZulrRFFdvUMuyrbPASidpUaEP83bsNpq8XNOGodpDcbv2LoNHfuRehzAGiztA84N302QcXo3YcY+3QMZTGiN2b/psyZ3qMTFXtJP54RgYroS8fJ/1kXMHQ2eibug3xVc2w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'S9WH6BeZOlVmH7FqF+LPpUVn8BfnC32KYkzX8pmQBmjFyjUPvJ2GQwKDA2aADwdKKyph9qnvV6hhUVB4ZWd5ajcvoo7CljXPveAoROfTYZNaKC0uKPrxKcuzZrc0yLaGXxEgag==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'bluVjoWud4wH7B5ZiXhxT0bqEWFz1T3J+Vza7pE/2DvXf0u3psYirHQXzMTFvyG05XHcleCFCVXrCX0ansFMae4mL9Yw2rInh5ziUyA+MWbqI06woBL0r+vVJ8QNqBhJVXgIzA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'OB2UUAoAQPnHZsSnuYPGEPZudfjw8+qib1AcMMybKZITQqBtkFqzHuB6uXcalFzid+G1wNhLsZ/9erpGoiYhH00QP2fAfPONhmuxRvVk9tESXm6ORFnwncGrRFIC2OAyB+icLw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'AiOk/6WMieKEwtxDEiE9gU2uYdLJIq9Wx8kSn8VckWDiCltuo+u3h1gw6ClGD06wFgQclrArQDDPjh00Q5jMMdoP98b3YzTw//K9LFg7ZIC1c3ZPTpPyAJ0dZtnflGHsYbkoeA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '7UazU+NZI5f6E7JhqgOizaNrY0irPqw1aCUKCPAvlyeRh84ffx4uJPE1xsZKKCcECR6cvLG6wkSZ0Ripy4jirhsGqXUYYNnXT4Uz76x9OTqlmle7rfnM4eps4MGv1biF1GpD7w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'qxdjhrnOTT3fSXzRkG4V/vi2uQChaxTIGktYDTM2Upq10M1xtfWkIeGd1HF/Zl/q1OjvqI+OMahOnPijWlRei8hm/e+al0HCc49ICcnsxbKtpKU8zmdthClbbvrHqM8TLQr8Lw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch3', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'ZclqMsmZdFAFuHwW+hMPy+VAMfktc/dqQOk7mpheuqs/teQj7TKZafbCbHy64/rTosFuc6BTx0BQzRRGMhX3d9tmnvU7QnMaUcht9pdVXyUxjzv4vVblVUh9zjO6wELlHqfk5Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch3#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'W4pckVCqrsyo06pl+kdrJee0y2RAHfyroHulJndWvOC6i5e7aCQhAo+RzbDFwIxu9R80SoQN1gnkP+HwlcqxejheXbzf811MR0hgjWolJeM0BdS6T0tOOPCo8dv3piZ0xTt1PQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch3#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '9OiNpc9B3boh8IQUs0bssup89ORngjSLMYxKqMnoiLmdppLPpmYydw6/V6ovjlbCemUarmDOpKZrgWsJosGJmJB8uNLwnwgKpFgGRWatvGLwCVCSJ7U/cSQxuimUYJ8qG7O6sA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'aPBUfLvUA1cY6ST/oxWKgm4zEWTG5GdhRe0p4V4tQ3pCLpv4dMEWJWTPWagnbwoQYKFJF19Da9YKOC9dkpkZZMcBgFHLsQm9CPOGsiONg8KOLauZ4gP5TaV8MatkLm2y9GhwhA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'gNncF4pmrTmkcGX7/ap+ntyiheqJSla4Ib2XgV4mIbeW23+TZPQlmJ13vCO7UPiavC7hKAg0sCeuC2N9u1cYo+8D6tDCqpAWu1W4S/uG3uk5EMKEH8SbCphmGn8PfMWfIljZUg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'EgGT5p3GhFExCDnQe0lBIfW0BuMdkpl/hpc4unoS1Dqg77pCTi30oJwsXmchg5RyfwUKNsUoJd+3zQDvB0fIazuoXtugAtK3RytuGF9zjT9sk4Fj5K90BYov6+eJSm7ZJcaDig==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'aAcTvSwYSi9eaGOgYn1JNjqmA/PhEut9aChWyokCYDTHP0+sq9DkPfsizS0ZgsUGvhOZm5qfESuiwxrJtgc1w/fus50auQTMS96fphVwgz2xi0ZZQIRoHnEmMqmW8DqDqs3sXQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '/QaEQ+dVQO5ec/qU6VHdlqGoZldiqvhO+f4+m3atCRFWhqVH2DnIRE3Ow73qBk4zFd37P2EgovGc/VaVj/3P5hEUiacn0GPi4/L5/miXzdEincBf4hH2eQBpS/raSVYoJezpqA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'WsbohyuatEQHDRjrdoaLaXFzDsr0EXalv0cTxusuRcxsuVlCxNCRwHQrDNO4QwWe84QgRkE5FC9BU/DdgaJmjq7OuE9wKQxPiQsCY8F6Sryt1iKlYFE6M+5FOAaBHM8m5EB5SA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch4', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'XH8ofHFrfJ9T3HLNXXa9G5W61a39D6YFyfvS86nt0PHyvsqdxji3sn7jD9BuhNayrNOQ7X0atyWbJh/qkItIO4xzbJvPILpBMysd20SS4+YEUuLfFyfIsq02P5d8h5anSggZAg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch4#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'PcPz76bQUH0U+FNWk216pov0zFk/izKCvmkJ7W39AUx7lybD7M7TSwK7DysoJaRfVjmzFMr2jn4csSYtM7686K+lKq0MFqDoSa1VgT/d4CTvtOYz4QHJZGuJGOYis5CQqsEoMQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch4#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'NjjDGOAt/JGPKViKxElPbSdMbw+m/rAvBvTq1rKYszcmHON8rFxAklpXfhiP/tuZv4qJfgivGyb+Iuzp047FqCM+abPMlpfTG+VH7AU5v3lvTVdwTrPbqcGeBxZ7GniY9DyLPA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'zgiL8B1CM+E5cUdvIxoLTnIfQT/yGTWgfj0ILwmACO6hNuzkiNIOhnAUfEemhaR3g4rjES43kKCA0XekH//CzMdCkK2iFAqijQb5JmURtIOn2GpvBvTh3WXBBEBJ/P2p2a61+Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'MaDo8K6uIs6N1/hsBg8BiExq8TlZ87NieZcX0l5aO27kFMKY6VM5AeP3XTP5OlLp6m1Cu9KeWfhoBlMvA5UqPrn+0LfGEN2lI5YXdBRlULDQ/sgnOR5zSe2Yohfw1iiAmPKz+g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'uo1MhJLIj48mq6gxzuBWGKvRoOWI2HuU/oz6KsFTS8LGMW1mym9IruAzbK5w7efXKhiypwBHxg5/f5YC2iYkCjmSILKOduPIab780XNCXtH7Ob89JRJkVwY+TIrqs3grekytbw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'CZ2UbuxxMOjfEHLa/JvKhrIWVtaG1zOpbKh1bFkqn/cN7h5FMaE71yqh3SVX3uYmKixs1SmDWzrsRP05kZSyFMYfBpavlOv4NqFet7oPsi8Mmx/h3S9cmSEfn/SZKe6l40CPfw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'LcLGaSH+1rnnkIQsDbDzggv6E1QAI1Y3Y+68XO+Xsd41SSTvybk0lymuw4uZyfAYSd6WdJJAVt0qgD25ZtDMDvX5QdyDs7erfdwc3TIlIdq8nE5Gxl6heHBM1ZqrRjOecXFknQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '554z16Xy83kPhc+i9T7LSBc1RbmYwSYcAHqCkpLwnjWJtEwGS6ZuzS/KYo+FGcsha5etTSrLHb2JDUQxcF+ZVU/v8uZpozk9SeM/QGRhtbnq4Iq4j6acERRxuVGCVvMil2FjBA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch5', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'Ck12M52iYw69yfgLQi0bUpnxekSJrdozw8NRugsO7sFeUuqYcMIPj9leaAFVM63Ra2z1ZeD+wM5btA2KtOcQS1iantCKVvuGaqLV/JquqxW3R8NKVcl5CFJ+md2nhJ9JdWSQmw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch5#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'aB0YSxBrznKD7+ICQuXYau0eoQbjGpFBb10Aowd/cCi6WE4spO108lFZoxXXiDH6Bu/vzyHzzy8mLcxn5duCgNr4mFk+m2myTktPO2CWfT9StoGTb0apW0zKAe3xiDurM9I9EA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch5#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'tyK9mUBUTP2zebIGMGuL/ArCCx0RXsTzYMRNpdsHKOsUwcmGFJdostCnNtyLBHvLgqTU/MV5Zya1LWT4yCiVr2JsaT95H9J7T+jsEfiVW6I9+Ws7uCSIlMx8giQ4Nyyh/9tHaA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', '76LTL9rWotc7tIKyPGtZ2xxWJW2UHQ4dAM3NxXp+r9zodDeZdzkMjknqB6kukUruiMU/lJMwxdqxmaIEJ1gdUk7nJ5uscQR5T2o7fRmrJwG2N4CJb4QZqF2nA4DXOxUDOulJ4Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '0pj+lMI1o3KW+Zr10LDvccE5AcDzJ49MvZEcIbdudJCS1q95wcmrO/pt3F/Xto5LS+TNYQLtX7si3Msgz9FEHPEg4xjBr5aYfzbd/XvAcNHw2mwEiKYinL8LGsTYlEAocgtNmw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'yEniN10hNQvBwjl3JgrZmlbSjJHGeDvXdbW9D8BUQwz21mNQ5IhycH5TPu1y/k7UBgm0sJIAOpzm+DNd7j+Foz6QXX0QFll78fQ9Fhyd887cM/65YRiB2vQoDZW6MkHMuTZ7fw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'GCxMpaNCa8hx7UJ8JetlWpaoo5vUmn5qguNK1h7MSfVXkt7BslHCCPIclNV4XdhSinUwXjiuXTKQkxPNil/Z2f+thD0xF+Qrx4Jo34umgPaMI+96MPnd//bZLgg0qaLsnviPPg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'w/yYudmB7Zdrsfa2d/43Z3IvOJfpunvH6B+qKvSQ8+d/uynZANq9DJ0LKSwas4nuUMUEa35yBe94/DgAen/50Hg8ytibnbuT1QkYpM3GuF66MZ4UtHesFgf2xtYKssPXfRZscg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '8vL2KQaIezP3k6ghQH0tDIhgpGk0vJMzPsOzRB43dv+bPE+Vu2iwpeGiuIySajr74Xp/I23gw1vREjXLv9LXZWsXS8gndgO8ODzkV6MeeetD3U+U6SuQRk/Tz2YlmmUnEomlGA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch6', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'wcy6u1RRmCQfoUN/1rvPSZA7ASFebQtuKFJjF7nDSv2RrSeo86f9eMNRTmvOHUnQldjylt/rxgvQLTA4glsjTTcNKOYGLiqhkuTXsAzLFcM1N1SPmIx1RUgtCXt+ASawsmfm+w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch6#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '5a1JvVFtE0uq9L/PabQ+RCsbLwV7o8CAFjto/5Y+uLI7uT+Z6Gapbp0feOS2xXqa2hBMU+8UwoN96QjVMAcWM2z6KCU9capldKX4yqcoECeVlRrmJ3xmAzy8aeLyAq+karL9SA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch6#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '6o3/SU6mRkttv4mXiyLFAgYb1rApBrfvBL5q0y9MKEaDeUbF3bU3/If87HHoBN8nCKaLQVuEv0jMqHKQLnZ2+v1PP3lxRQFLqxi1CkNIcYVBgdSHhfAF+at/gO7MpqP6yYK55Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'KEBFiuyvL0jbX5d45gFX72rDzqx1UksfVdpLBVrR2pzPQqY9Rtw/CaSpeTvq1plYNYi2L8dOduOcBa/80276/vrPJrP8hJV0YKRFWN5yzqi84+raexZoo8x5tQmaKH/O0HWYhg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ur83Mgo6O/mJhh0Gv/r/6jdGz9aPg031u6EU/1X/Mzow1/iXrifXBCpQ/EGY3d2Xpnagl9bkQZnVxrR5FUekKpgg+kXTBkQXvD5nZIegZC/wljVUEAy0DkWC/eecSf8htUaMkQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'wmatq5Z8hh+3P3WtIoQuKYUj/JmRhxlnDsC7z+Vzum3zq1px9JKi5QN8XLrSrDSA+4afMuqNpkgS2giFl3Q1NoqzcuA2RtpiPrHt0pg6BsCqATl+UMluLg7RhIzxL/AvyNE4PA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'V0Lw20i8MrdtOF6CvcUJ+EUfUMAFu/p+NP6/oaqbOiwOfV2j0c/0fuXMa3sxhVA/IaghHkOWz259BgYzAoptIFvbxnPzzzxm4GF6RIVML5vqMuDz0x7/B73lM4vfDv45/f2meA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'HAvePALI6t/ajfmvQj1Six/M8vxZXb6osQhwZo1mZmm+VN8IxyuTRbfpEyJGQrBAgdEuM4Y4/O/omOvJF9a2zSfBwuS/SRRmjpv7sqIBkGDIKhDzdd3a74sfqAUaovK8mMfN3g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'WPQ56772MFKwDgD+XbDqmb3A1veX4QtPeWNnfu1GB/Ao7o7DmsfZJYTkMmQIz361b0I7ull+jw+O6eRDNktU86sGK0qX5Xx9X6Jr38m8uqCKGg7sntNj1EyFbOW8sWZd7V5r1A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch7', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '6/jB101IDkVYZpc9pZKBU1Uaa8oRJdkRF68GsFZ1nbd5z7OPQG/XD0Uoc3dlPL69S3/PrRoZ+WrNXiYMbOthqMUlUUgPwbKw+eVFEBeWkj47UuDBH4C/+dktl5B8gmejVCT4qw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch7#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'm35i92f5h6yxBoaTN0RAMqE9bd7mtrdO0u/2CwtGl3qN5+aRLhirVqngby9x2NE55IOphn0bkVwB7MXPSkF5oVjZuoi7yjr+0cufrzFC/OG6DMU70WdkSI0OEVAJPCbkJuVGCQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch7#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'eFlYn7DuXFprySlE6ot8MQDo/r0+LUqB4+xWFVpJ/aSMNu5CONDMXJpBKPiqNAqVSqq8bnfjKIzRVj7zppS7pSn2bZpMiln7qOyj4LhHAHxwm8/4HUmn9FBIacYlaIgZikHKvw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'VhpFuBrSdIda8OtPpGBuAk9JOdQqap0+6+MOGbZTQsimLXLqxpvxlc2PLwJtfq8Vk3WkW0v7beoMSGfJab32aKgthJ7HFeJpoZ1UXUOUKIikQvrPQtdF/BNkGzm1wYUnOkLLyg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'JQbbuO0nPD6ec4WgD7p0ELK6PCQcTkZUTiZBxgLlbvM9d2M381a8ELVt7rCj3MNlPDoWWzunsdaxZZHGIoDBpzrnt0gNB2BnIxfF14AfYv7w6RR+2Bc+6BbZY8uhEVDQ8trDaw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '65P++bn/rkqGWGgoeNS+Ic4WhXfkJcKZOkDDd2PHxnAIAqt0Dpgc4pBgDVTrlvhLsGfSNRvw8BrFoeZQyHLGfZRmNFuc7T3HctoecUk4/EPj+zpYNDyu1zuyfFsQiv49i04RhA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Ob2YmYfvgsbRSKAzWNkJrgvy4aU8R/tORqmUGb06prUgEk3otBYP33ioEwj5tk1h5hNvWlVSMyS5MuF65ycmpAx2WnHZ6WZF4XLiEgOLchEu4EoalUGsIw/04Eka0LpL1WDwXA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'cPaSpqKuejRxsgbiC7pBsAwJ6wVro4011Y294n9Au4zvgcVZ/p4lmaVrdj2UHyxprh8np1l2jXiTUib2xnNfP4/KWkm0E4cGbG1Tf+zHO7otVtjlbXJh6xg2xXVAZwDIsT+7kA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '7Ol3hk+DruDvQdm9/5MNqNOVdAMSJxlBAF/DQlzqDbOopzNaIg5XXRKqjg71d1jKKNEjDLMQx14m7EThWnXIhIdpWCQcL2ml7Zi8yaCj02SI+DbPRxe9qCLbuygVockwf+iZEQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch8', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'KUK4VRR1gYBWIWNrdRSCWXgMWI+zAESUQ1uDE9w5FXFwGWssFYiso3JOBn+jL1uddigh7/dianQBrnLfxEa9fyEd/CrpiD8Abgd+zCvTaKEDbLFW3MVfgweL9oOwnGH8yr7RJQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch8#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'SvwpPJgrrSExkS2MJFY3YD+0iUGDgHwT57vIC8od81ArkjUg+hZWSVJ2FFv5Bm0t3ejbhzynkSUtk4O2B4snX1+rC5m2BrS958RumqMlXGmMxUy4Adh+aDoDOdHxzXrgHD+UPw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch8#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'EwGEgrzqaJsmHP0+/rchNiFVFzL7JiND1saG3PnxkAoh16pZr8CULm+tRMi3SMREuZdVZmIFBRUj+YMZfRWiK9Ll7aQQAScIaOReXluLCU6UrGN2p4OKLOhThilQuSs5+C/Ziw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', '0Ntfqeu8DUZRRGsDu/IoOwwm94Gnn7DniGCmxVGGTXhukGj3qD5i15w5d5hxE3oyTag916u76SxuqfXB6GODGgh4koGQ5yDvY2TUloGsb7GaqGWoFr1RB4EFsgubXNkNth/2yg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'i24JBKdiKCTYLk72EvKfu0TWtZwXMW92+H+FBavuFsFnOz/T7kNFtuo6Fu7l5hHXv0zd311TOjXRCmIcNYSALbPf3cKSWjiTSbFlyS6LgAf8aj/MGdbDvbRtg5QWA0ngK961vg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '14AYrC/UKZTg1nxRYx8xVQWvIxOs4QQJLZcmPhXrFoUxLAJtbnC8N/RXjDWNzJdpvpowday2ZYt9dUkZhsKBloJP3AWILGYoGkjUrUC/WawC/uVZIlcwSy4B218TAqqdt6yorw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'oFecCyTqd6x/vlqFac9BP5dwpXYKz5qn7cL9EJZh7Z0cjHv6rXap6GNtKii5LqC4wV6FlF6nTWmS9tPIVXsagadfJSyTU89oU5KWAT9DYg0AzPUuwFtQxz6uzR0BJhh1pHlgqQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Di5tbePPiaU/YwD9M0qbd4vyKky85/TpBpWX7xFpwh0ApbUvNOzFmPGwu03T5UCHoDXONcAt5qTEiGMEX91rG/BbRLJ8tIbz8N5lkIXMIxIo1K3sIvS4jq6GebSa1UEtvwj5yA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'o4A2kaYSKEI1BlzXSUyYjysYZqLZGqKCQnnz8hmNJ/QETbZD1lP17cTDGnDXOjMa4PJzypdctc02e9Pk1Lj+OU/isUtyrvtdgUJgQF/8bpRiqVeKXEjgh2NLoe7px4jlVyA1dw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch1', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'T5O+UkmUNan36l/A07w4ZaOoEXi+wg98z827ZzGZWZem7NreBDgXAotzPUJb/T69fuPQLEzjWaI9YKVXq8klwkAFHrX0Idzln5vxNDezUovxprQhyF14bgYNCqgF7D9Pq95h9Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch1#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'fMmGqABxycJ4SaOe5o53IWb7CyOo80T5/OoUOxUVYqYH49jWwDqJ/VMcCHZ1uosfdGcczFnNEqKb+0ZUy+ZNYKCnCb/GhV7uBozLZWBEks3CgXi9xIR2r+NvxRJib80xunrlwQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch1#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'JbyiZ2I9eL8arekmoyp4Nu5Jzt91OF4vHMUjeKoSYy8ZUnEjomRdHav/PzEiZ5Ek3+w5jh+UFCCg8Q9tkLFpbwwPrO1mS4mTlG9D7jnBpalf+sRjT7sbaLcmJOz5uLmy1DYMmg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', '5xn11J6giBLrcf3CbWeTnWwTSoo69d1yP7P9sZFMmTqU0UkFFCDZliBczqLoiKDqLGCJyjKVfJYrUolqQm+9RpAkZXcVeANgIpvCuYISUgwn9U+IL03jQGPzO+a27jSS/qGSEA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'pvfAwbpoLd9rRy034yG5R4oCApx7eoKV+JYFFbz81pRZwxzzWLypTzkQ5Rmtv5kivUmDEUvKLLzJTWAjVGS+dfsOiNZWoflF0PuPeZ2AYZFypuxbLSpawF5s0Q0vwP7P7FeMsg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'bn4yPEevrLi/c2lT0J1DiyHQMaJ4jD49HRi6E8gKLPZ6TYDiIZsbUn6ckzDWjOc+IFuQr/acnCXVDhPan0MEd6hAshncTmVeTGi1GRkgI2dZe6cuoNP0wbxQRn1/RL83QqEM5w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', 'ZbsHCVnafgIuu5BHYbSgdimpYvgxEuT4NWfoPYApy3YrdG4m/wrC5ZuypfcV9NgYCv1mqYsgsFsNk/GFRIDP+cSLgCf/3F3xzZIj98GHzcG3zM67djgi31Olm99Eud3JbNrSsA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Ysu3RY2hzb5KfKJ4Jg9R0aoXps5V3tI28Mm2VKJq5zaCIuSA7KY7rNos3V+wAyDVFJ7ODQ+ar4QX38Ud5lRLZzKP9FDrJvi5mJyP2O3L/s83jLD2aYiGbN5iOBG9lZSkqD6S3A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '35MF768S7NYj7VMFrzf3XviussnLD/9SSfN8RrXrdvFzo55Me0ww9cIcMoXqmcHwBf4HLXHtUb36aW20GIC0AGONgwOEnlqZ8TxHC9r87KpGyfqZanvAdgSOfBsL8QPUbHp9lQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch2', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'm1czn0hBBm7EqhOCoW15x5cXR6YzRmKSLgs9yVT0jzRvNDB77ovr7oJQTsgyEPi+J2AW6EdbvC0NFT2uQQSvBDb7P8VrHkT3Lrl1wbJosjj0k4a8tCNfNtGXC87OY6elbSq3BA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch2#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'btE5gsiWo3ws5QjrBCcYsiRuSjfmz8JC+p1t1lwe3qvHQngg2qIeYKWU+JQ/M6gtNFmx6DSo6oPNO9JtZSg5moPRD0FpvYQyyHN328TbRA3TQOKVzJRa0dfc7xz/hRBUNyS6bA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch2#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'fteRgACzp4lkvzKcpfy9B9fznmF96qN2ShZbltrjLYcY27Ef6UvBjLbqQa6IRW/V1Szd5CdByG8hq/d+thOxA8xeO49jWsLBESKeppoQ34pcSnAKvUd1KKr6JJ2Wuao9ywnG/w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'tjK9An9IrRoNt+NY5afE/qrKJ2fYeGBTNgRNm8gUjgbSsPFitntjkdUar0rf8xU7uq2W/170G/6MBiRkH9oA+QON886sRURiks6RyEjlBMLkMnJQZuaq9WYbdbdUK0/rLY2YFA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '2nZ/0+d+1MCrqMqEWqiX9J1oO3aRHuOCNVh9pqWK+3b17USeRP39tWQJ19aVcDtTQRhxTI+sNra95+MCzvImUsAaQ/6jqypQGrhvNCvzyOyNi6CvM7PPnjCTlA8xpLjVw9jnrg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ACf9rW8i29sIXJpaTb3FKN85u3yoYBpWBPLURMggE/Qa5Erv8Ibcp+8vCsVkV2n63KnHVgSvJRA254a0zK09Y7TS7R8WgQwluJHSFtM+jVxSdBNpIxdkpVh1Qv+8fiJKEdi1ug==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', '21L3BG/PblwrFv8inEzKGqTolQgI/+bg+FpkqvlU+04d/7sKM2SC8aJ+dvACn11JNTKsMar+Uh5wLJGFsm+Z1r33Rbql3Aejlpp5N2KscS1op6a5W4kLhLE1o6XMoLrydWjzgQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'pJ8husUXBOGpFyNlBYZH7osgyO7+ZFLhGZ04S3kVZ1COBjJSNbSIrmfhYy0MAT344nRvNBtv2qXrvSQTUzJvcSdDox08VxnJ8b9Zn82UpPhi7WAjT6ScwrhtWC66iNXKfKrb/g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'TzfAB0Wgvyif0pOBwWwOrjjegR/gbZQ94WZOgz9IHy/Y40LWa2n5H36pT5QAjLiJh+AcjurIJV3LkfnMQSdHvcaXHRfEjy/oMPKIfuPdirYD3HGOq9/IV728aGaJZLSXKPLeMQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch3', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'Cyh/5jXOlwN1TVpA88E9CpcDHqp358MeexkM4ivi7BI3ZruWQ24K385qMT/Q3uxwyR4OiHsMnFBg3J03/Q21jUjrJ3ja2pOh4JAh5Wbqyf5yWhnAalwsmRwoeg//dPPA2bk+GA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch3#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'BC9lifxNQ7Tvs5CEOnf2TMxDPoqJt/cVs+brsF0mLI34Eqr4KVrvekruq8kf81DViHmKMX35VqyUbs+Qjw93XH5g+5/uhumZlXvfapFjjiLmitcsC8JR+RH3LzIuiMg+upPpUQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch3#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'LH+qbGkJtV7ERzbXhRiZrXIt6wDfc4P9UEqYO9d3CdKcfksJlHu6zL1kZphl3Ul9R3u7blCqdp1Mt4AxWV1aI8YdccYKByuNf9oisx54XJ8w6mq3rB0u80c3lbH6JO0OYlF1tw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'D+yCgtsvclkLTVsK0znypnAdz9L+qHeEWlSL1JAmMG/IsjWzMB+TK5a9URC4s7f/EtNjf5P+frI6s+RCpx0MSDlwn9HZ0Pfck9gdc3XzOIvWtTaG3d8F4eFD33ldQZaXeDdqNg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '+Cz1yOBzhU9NSpzs97WQV5l/opByyvZyNRWQB+bFv5J59Xl6AqAr9RQpIwdSIIpiea+56PbfNo9vBM66idkIYrsqnuftF2lG8xsWBlfyD5IiLk8N5c4d6kxZnZ9NlLQwkk8/8g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'z7Hh/WAIKtXTUjWihhy/w7Ls4O91nFYDDe5w6NMjE/C338ka0uDpGF2Qi/oD+eIHoaRDSzoOjX64Mc1Xtn5TyXFMp1FxXGBDeb8esRiU93HtQG0Iclj5rXHnZNsyHC2x9vJNCg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'hJS2SI/Rb4oq7P5JOwtnL8iV2ntMCPRBDHZgNmIT91cGDaQZkD6+K0RFG7D7NfZT6z4aORKYu1OFczjqtbiDjkTs3APuQXnZVkf67RLnpWi77WJfqCc3TihSa+9I7HBw+TrOIA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '4LNGLyO1q0G1JPchUtz/s636OPY0LaMjM4+lrj3bfDNakUHrIBhBLUOr0Xj8W1dxz3tByMcorkr5FWGLN4hnzR5HFOtKPg3xZI+gekmpNgs0grvZTY3uG63SC1IN5FEbFKIW1g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'rehj8AczpPoXsC4rLFvMSscajq8OVbyXo/ejkV0Ov7Wre5q6Qt8iBKv3QD6pSbIUuuwoIg23eJZOFH+bObxPXVXjdT576jGWyV4zQ8DAZWczRqua5eQicJSKKZP1lUvrr7AKVw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch4', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'HnuZPbj3P85D5W9gnhGPCaJnKk1qj4+fptJjb9eiF+6rJ4v9DzneSJJXxgx7K/UEEWHCR1izqRqBx2CwDoFD6F3TRCj/OXzxpzz/MkEc2rdeAKP6aIxuW329kZcO89xHvgXnhw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch4#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'gDal1rK8R8JG9HTMXfomwHucx0GkqbpKzcTHxPswVGuFbPk8IRKlSDoGTSgSPzluQgS0/vafH7coE9xF7wvE7f8vHkkib7xdRG7HvAOsmerAbYaD1PqxeoKl+KlGddm2KFdArA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch4#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '8M0224v9uxh66RJ6JVzTyrCFMTd4D3msO+vlLy1gV5Ef9eShkGS4dc9HnfDtr3MIG58/y/GkmD891vS+FQ11FvRakXi0fOyeWbKdqDL3sKqrq7TcBxYDp1In5C6Mfq4F9zD6og==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'SJyOW++Nk0jNNzjFCllJGttTJAeF0wC81PxZhH7+Uflsq1KZ52GnUgVMNvlsZJVsQ0PT/63Kpisgxgpl7Maaf8Slr1L3WnNhh+zVTvjcPUbJNHmFVZQJZqn7RsPlu0JyKlDeGw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'oFnc5VCf+tafUhvkvUhgMZMOIDA1Vk8yFt5UiZptd+hZHAGcdycADCMZ2eDeTgp/FMWIP8OzVFlwd0bCPOy8PokJaY2+E4JI4aLZ2nlWdyuOVd6m9TEZpSYknSeTrSk1yuiZ5A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'L5LKfof/CvEegJfTYFMtgAmfMO03DRQQp7AXUOEJWsfL41CK5N3BxT5rqYgREcKEbf2pZpJd7vET2u57lwl3KfyNGM0CrYi3saHhtW+heZXySic+R+pmh8yraQv7n+EdC7HYjg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 't+mxkK/NTUk17iAUXQzZ9lBP5BXzgeahB4LNLKS98R+g5wUnd4KVR4j60mwfehtmjyxnIK3I2yarum95unspk2yZeDmxi1qaCft4q8v7u14Y7C1Vwz+9WXZhm11hJ3GAW6vxAg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'SHZT3DYzUOx5K8FXf508vW67kdo7hm+sSOz8afZsXxA92oNxkSBvofzh3IvSKK0Dkhe6OUBIuWd+ae7huL20Q81aJnZpH/GDz1QCwuld5AseQ8zs7nYwzVo8U3vtRJTduMcOVQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'd3GjnyuZrcUeqetTvGMUyMp3utoOgfuCNl3Ltupo5hg40+wB8u4l/Eqmj8EstfAGb1rpNOML3IdZ9tt0vnDFCNbQcv2cK9gqGLdN79CdbDrkjkwtZBZbZn+eAoV3Wuc6e2cfxw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch5', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'jrkfnAXmDBPBNo3TVefnUxYWy5S+8i8c48VcQRveMl18soyhE2JHretEKZAwPi4CJpvZwJWpP5rCGqlUhSFV9M1AsCQHZqEw+/LA746Vp/flEOHqoKePmipJXxA346Vs9uTnfg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch5#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'hsM0yfw0WqjJrhQ3rpql8qZu+4b8Qph9ar0DssU9HvotrnxPYk27c9qaJOoXsKquLXqiddlnWE/BBz9xqdbKUrkz72OtZEX8RtMrg6DLFZnj0gpbV/McYOAk5ptaWVJ+UeYvLQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch5#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'aECgizH8ZrOMsHtX6enzlkpVw56XwPpmr/dMTzY3n2KI7GthKqV+ES/yLtvyE4MXiRepgadup3xOWV8fGWn/1LX596Z+AJidVK9BwpKS6CBHHKhVXBrZChNIirLk89PGCAQ99Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ufz2srNq+Qrisq1HhkQ/ZK6YD+aUE4Cq/zZw3kmZBqA+mlKHG8pQnv28MUpcYyutx2bGXArz9b4lCrzt40nPcjJapwEp/7zb0cbcRUi3Wy1l2MU35S2KezKoumS1pFdpaY4Z7Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'OXk/S04nQUlxaoOw0ZDSh/q5E5gxpsEu2F1MkYmY3fyJCDDvO8/ixKprKZJFk8olTXU+Ky6zxIB6KCizJUbuq//7blXxuoIhRiFLEvEbX5BZi/mkaL0Mp+rubs2wbYz2XL3hGg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'LVFhHX22s664/2TyrwE7IikXRgyI9t6CwUVNnuUMEbshKQ3rZIFGuBFP3BoFc3dWpsolqz2PZRi9o2nyE1Mz0fhepVE2yT3WBaIQOtlCdc9SBDbxc8bxJrPajO/Tb7ilNIbh/g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'IfecTnscBs7shzuU16OAFUrlQHqTuZdu4LL6JXr7dEJfVK509Ov4DDECVmUI+JauReD/l37EPviSS23iY2goiWST4lozIrpVrD+FArmeHGCro7etKoIaGVePH0EXkEeX3dxsqQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'ui+MenTPHVSqrQcUi+GR3wLoAG4oeA+Vfse+bQ0n+TbpNRCZtVSIL+kK+/RhDfsPUTBbt41pYPS+InOE9P+8wi7/ddSUZI24t2lt2ytBdE7/jFKJCyHEnKHpJaf86z/MZG7nBw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'rHfGfKn5FmfiIPiPt7j7b9bVrn3p4PuaeKtsXyZ0Lzlju8XBiq4vEcrafXVJQ2M0wI6KmAMQH24to3ihpDeqwK6tLBkXct9wUTBeM5n6NrNTy7P7ZOyqAbP5vLGZlHR9kq+xPg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch6', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'oZoT/5mskxPjDqD6/fSWLYt1/Au3c8TkX9O/PobxEGa9CGjz4JrIQMlQS0vxxAhNVtauB4+SKpjfOAHlRD9lyyla+rbyS0WdJ69tpXV3aNPJuTxOT65Q01eIvJXwvChneSE9NA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch6#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 't4shYM1ZQM4KfUMR0GzDd4rTIDJgjEwOoFSAVo6X/+f6FPAUE6ZZZYquJhMJ07vENI9ja0n47vMwoXpzJtVzsFHvhmri+HI5zwmnySvdDfbhTU2r4XxhHn5tbWuHCx7Nxcnt/A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch6#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '7RYUb8Wa/DnGmtDcvXs5cIx5JtXcbwr5iOLUW25iqR3Z50bXG+9xlnMuQ549tAGEloBF0H8hoUk847Fw7oHEW3sXSfK7cIMJ7Iqb2m5eUQLVX3Upj4SU6KAY11uFy+F+3vUtMA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'E88m6hY1CS6K6o0hwBjfE6OXTMg9bSyK+NSG4zIDEy7uAgenH3I0qTdZNg4bPEGQwbodIKoL7PkXHOKz60mbl3JPjTNsDtolUI7lwGb5O7c1UiOXPxiCFhmrhZ77RO9KmQuc7w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'wygzCZ9Xn+epbMV9RnT5buAlRg+vLP68ryK1pu2x+eVBIqk6fJW1RxaZvzdPsjRCLJdX0t60WXmL+I159CH5B+iSUyqELdCXOgDBV7BzxtweiDrG7dPM+htXDms0BGdtMjXsmw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'hu3zijjymzEnuFwtJU8/tR5kvpVjg809UaOVQC1i6wp6QvpAnpSqo09SElzQzChMXcrhCK+0CFAtChplyuLNfaKv8NAvi6PYooZUHpyOVjOHgQesL8W5FCNMBnkU/D1Y5mAQLg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'MWm7iIp9CuZYUxDbQpLNYoXTrv9d591PjcJ0YN2ueSrChp3rezcWcpQmulrdd4t7xMwBeinFNNk6UWWMi+pBWX0X58iwC0/gDpKA+luXKefqo2N5RyN9u9pKogw2z4D+zCvH5A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'xuL7ofpZE9oACsnuhW5Bmx8zUqaZfMuQW6VWHIKrNEfpklvAnn/LctwsR6RUXeT2plhmyYVlm7pJJyr37Hb8Ou8tbvAuUddLPXK3pP2/woDymlumWe4myXSWbrtK4qi29LaZnQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'P2HM5lf4MeHYEhsZE+rsdCVCQNQn2z2nVsQtGxU2leTz+CZPjLEiRW9NcuxxQq1V0xWtVOaSaektM7sjV+Ws2rnRSMr8d68hvnW9YmpO6OL4WTTXCSe8UZDKw3J35utsMBZnnA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch7', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'V3iA4lw6z+BFkE9OSeKy/xptD7U1Bcg3aTrVirU0C2FwO4z4uGYAmL0vytrm8M9NL/EageU7ID//6+d36wZrv0APFTUE7Fx50GIaK5ngNfkyviY01zMpriWB3up2dFlN94upoQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch7#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'b7FxyqD/rHP6WB+uWmPdYzxNAFKGVhCZqk/v/6IRgImgvh/5LBiwq8oGGj/gev9CDPlVsaf2Ot1KfjnBsobbvvROpxra9zWfRDCo7Vh1qoGGaPZSkSSedr3JdFyyFBDASKzTyA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch7#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'rLR3wx4eSTG2N3JAIt5c15OgDNjGh6egeDsShQeP3bEq2OpjpbPeP9nQlPtqUvZvC4tqbOXAOTz1Fg4cMSDGz2ssQqCU0SLjN1XKFoa9RcVw3BbmAEeFdt6YiolY5cZHcd+96w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'vcOlbFXQ3WKkZSpAMWQcBFyXeU/I4f3tC3F0Aoi/kgrOGpjpqlNMB5tndHWSGxvd2oqClG28k56DLyEuqwoOCAK6hHKiJ8omNI2dy/e3oJWvRR9GkSdafwRJqdcX9gRWNc4xHw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'yY/mVi1a5AbenAQwooYktBa7yDclImTPEti8iNVCB/6IgFKd7Ry0ZCANmB0da3EcYzuafthLoSZ8wkuX00UzQnHIqp1reWMAdeJVzBcwgD5NbzAqJxSa3QCozdAFPzdCeH4S3g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'OFowM01LeQ43a+jCRN4JbJ3XxnZhM1ZYPmrGL6Kt9zWvqkLyfj4LI0UvM22dWFPWVVZQ5N/hzJjqKFTIf7ToE5jy/LXmTqSLvxeifAQPk6d+ZIlf96iE0hnn1HOAcgGSWAfbLw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'LdkZpX6S+OUK5fiKszPigVXHMf4tA6wdfTxN88smOh/2GTIe1WMJcwxF0HYsWLEyZZSfXuZGqmvGRjRSc213nON2+1/MqtCPw+24X6FRje7BLFX9+3ZMPY5pYVmXTG/fCLATcw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'EBxgMZEeByJtS4L3ZQjIud7dEziv1PVdjcQSoLJ2VN2qiMttPiYkxDU0xlTHhZkfe2kiVw+zopxU0Dl48XLOt9F7uqpFFeF4m2vEucdBRXv7keVT5725YBmQzjW5S2dt65n9Yg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'suhgXG58Oeta1UNk2UsyNCKvtHvgnLP7QN7dV3b+PS1RocGD5FE+OLnKKcfNew7K0RPQAYfrvBUKHsOhQi3muJrYq1+NNSyWMUF+WpdRJ48R0Ap9kEW9Y9s0CrHNvbpWIn4R5g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch8', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'jI3gogP1O8dLLfAbcFLz9a1aoM2CMgCSo1DRQO8ZDH+dsH2pocugsgXspOAgQglbsoWtCL4Gyk7ZfKf+SC+u0t20chpNocuXiWvzthD97XGnUhmD1USafTXVHqn3UsyVcwDpUQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch8#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'fDNtTrrJ4rzBOS84WCSk1AlgByZGEOGF7efUIl1u33c9HZv0DUwFtRkVlm6wMQhYOGWfABpodvqmm1Mm6frzko2fF0WjZs3dcJeR/7/26/3Ywz7TgA2V9427RfjU0dwztZkjfg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/rajkot-ch8#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'REp0WFRZ1ldGcag+3a6L/MqKhdWSrZb7aBUTkiWC9YGmMKjWyJKiCFo3AV9vkHOtAeYrI8Efk8TdK3C9eT3mKcd6/sH6ZTTG4JYgPbXZvPomukCvULjw6KPAEiiA4AsYUCggSQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'SESEGFtgwrSvR+fuBrSH1g3R1trnLbVdo2TeQneNHA5P5rIJTHmtL58Mw9yZwj+W20HJgC0GdI8PME4MLRsJ1ZEdjG6b31GvYFxlJJ0H62w0C1joZXUDk0uW6cUVnBRxW05FdA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Q43xEQD44q1v1C+skNUTWeAyt+pka6EBN1GduzZOmMB6EVSR/YnVZcPLzqjn4BssL0oDBDoLnIEW1oMMPH5iTCnElQNMB3eeV5MCgT0vOcMx28jqS5hSpZU80qgY7A5o1eS83w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'JhgucHNL7CPq/AjgrVo49pKsp9MALDXyRHyN0xOcbDnT1VgnTDFCQ8hBcUq50sRI3N0Y0vNtXiqNfMuQGskV1n3CIF++CG+kgnZcXbvKRmNNtAEf4E2Si4yYMK+TAHbanry1rA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', '/uillTxY+WWUezLUPRGihMOGb/47/GLoExvjy9rl1nrzicjFNOkwIUSZEWjJAxixyCJW1S+Bfm/GVdQQbZ0XbUYxlVbidZwoS3iVQq+Hbbt2keZrZtwA37xAaxSOuhEmGG2BqA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'EzI+UHRomfILK3sgwEaYTndVWEj95eK6OPgiSp8liHuiKzw4OLNAGEgXrW+dwyxxeYM3rNv/i+ik01k/U3Yi+rLZLQprM0tdeHe7QYQ7H0Borxu+FwumLbIm2VQab9qlXckDLQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'mCCkE8nmqVdj5/YTtFHCfPB0SeefvBS+HicCvjMdlNaDARR752rIJVkmicUKjyQFPD4qn/3XMqsdiH3Q9oFw0h2yoRHDEyiMh5442iuuVY7R/ip6OS3It6VPcKmbKHG50wvuFg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1',
    connection_transport = 'edge-gateway',
    recorder_channel = 1,
    channel = 1,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 1 OR channel = 1);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 1;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch2',
    connection_transport = 'edge-gateway',
    recorder_channel = 2,
    channel = 2,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 2 OR channel = 2);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 2;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch3',
    connection_transport = 'edge-gateway',
    recorder_channel = 3,
    channel = 3,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 3 OR channel = 3);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 3;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch4',
    connection_transport = 'edge-gateway',
    recorder_channel = 4,
    channel = 4,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 4 OR channel = 4);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 4;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch5',
    connection_transport = 'edge-gateway',
    recorder_channel = 5,
    channel = 5,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 5 OR channel = 5);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 5;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch6',
    connection_transport = 'edge-gateway',
    recorder_channel = 6,
    channel = 6,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 6 OR channel = 6);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 6;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch7',
    connection_transport = 'edge-gateway',
    recorder_channel = 7,
    channel = 7,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 7 OR channel = 7);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 7;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch8',
    connection_transport = 'edge-gateway',
    recorder_channel = 8,
    channel = 8,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 8 OR channel = 8);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 8;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch1',
    connection_transport = 'edge-gateway',
    recorder_channel = 1,
    channel = 1,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 1 OR channel = 1);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 1;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch2',
    connection_transport = 'edge-gateway',
    recorder_channel = 2,
    channel = 2,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 2 OR channel = 2);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 2;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch3',
    connection_transport = 'edge-gateway',
    recorder_channel = 3,
    channel = 3,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 3 OR channel = 3);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 3;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch4',
    connection_transport = 'edge-gateway',
    recorder_channel = 4,
    channel = 4,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 4 OR channel = 4);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 4;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch5',
    connection_transport = 'edge-gateway',
    recorder_channel = 5,
    channel = 5,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 5 OR channel = 5);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 5;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch6',
    connection_transport = 'edge-gateway',
    recorder_channel = 6,
    channel = 6,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 6 OR channel = 6);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 6;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch7',
    connection_transport = 'edge-gateway',
    recorder_channel = 7,
    channel = 7,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 7 OR channel = 7);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 7;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch8',
    connection_transport = 'edge-gateway',
    recorder_channel = 8,
    channel = 8,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 8 OR channel = 8);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 8;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch1',
    connection_transport = 'edge-gateway',
    recorder_channel = 1,
    channel = 1,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 1 OR channel = 1);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 1;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch2',
    connection_transport = 'edge-gateway',
    recorder_channel = 2,
    channel = 2,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 2 OR channel = 2);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 2;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch3',
    connection_transport = 'edge-gateway',
    recorder_channel = 3,
    channel = 3,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 3 OR channel = 3);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 3;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch4',
    connection_transport = 'edge-gateway',
    recorder_channel = 4,
    channel = 4,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 4 OR channel = 4);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 4;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch5',
    connection_transport = 'edge-gateway',
    recorder_channel = 5,
    channel = 5,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 5 OR channel = 5);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 5;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch6',
    connection_transport = 'edge-gateway',
    recorder_channel = 6,
    channel = 6,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 6 OR channel = 6);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 6;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch7',
    connection_transport = 'edge-gateway',
    recorder_channel = 7,
    channel = 7,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 7 OR channel = 7);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 7;


UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch8',
    connection_transport = 'edge-gateway',
    recorder_channel = 8,
    channel = 8,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 8 OR channel = 8);

UPDATE device_identities
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    credential_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/peravaruni-ch8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 8;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch1',
    connection_transport = 'edge-gateway',
    recorder_channel = 1,
    channel = 1,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 1 OR channel = 1);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 1;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch2',
    connection_transport = 'edge-gateway',
    recorder_channel = 2,
    channel = 2,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 2 OR channel = 2);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 2;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch3',
    connection_transport = 'edge-gateway',
    recorder_channel = 3,
    channel = 3,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 3 OR channel = 3);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 3;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch4',
    connection_transport = 'edge-gateway',
    recorder_channel = 4,
    channel = 4,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 4 OR channel = 4);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 4;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch5',
    connection_transport = 'edge-gateway',
    recorder_channel = 5,
    channel = 5,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 5 OR channel = 5);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 5;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch6',
    connection_transport = 'edge-gateway',
    recorder_channel = 6,
    channel = 6,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 6 OR channel = 6);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 6;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch7',
    connection_transport = 'edge-gateway',
    recorder_channel = 7,
    channel = 7,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 7 OR channel = 7);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 7;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch8',
    connection_transport = 'edge-gateway',
    recorder_channel = 8,
    channel = 8,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 8 OR channel = 8);

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/rajkot-ch8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 8;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch9', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'nx/K2Wx9igA06MuJNMvAJzMhXpQfQ7ZH2PKNzkd5yHH7FzpjZVKvcROulPv1o21vw8j1neXZ4XAjNoq+KRnHnHlRHCwfGk6UFnj2y/bEVNgGP9BwytYD+eMy9+zdtrD3MEwvSA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras
SET edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online'::camera_status,
    connection_secret_ref = 'edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/hajipur-ch9',
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 9 OR channel = 9);


WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
UPDATE resource_nodes
SET is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id IN (SELECT id FROM wizzmoni_tree);


WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001'::uuid,
  c.branch_node_id,
  c.edge_agent_id,
  'camera',
  c.id::text,
  now(),
  now(),
  'rtsp',
  'verified',
  'wizzmoni-online-' || c.id::text || '-' || floor(extract(epoch from now()))::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
  '{}'::text[]
FROM cameras c
WHERE c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

-- 7. Also upsert healthy internet / network telemetry for each of the 4 branches so branches show healthy
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'network', 'd7b23dee-9814-48c9-8805-48b61b33e3a9:internet:primary', now(), now(), 'agent', 'verified', 'bettaih-net-health', '{"status":"healthy","latencyMs":25,"packetLossPercent":0,"jitterMs":2}'::jsonb, '{}'),
  ('00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'network', '921d336d-baa9-4b25-9f9f-f6542bba94cc:internet:primary', now(), now(), 'agent', 'verified', 'hajipur-net-health', '{"status":"healthy","latencyMs":20,"packetLossPercent":0,"jitterMs":2}'::jsonb, '{}'),
  ('00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'network', 'd8467a57-dae8-4012-ba5e-c3254075aa61:internet:primary', now(), now(), 'agent', 'verified', 'peravaruni-net-health', '{"status":"healthy","latencyMs":22,"packetLossPercent":0,"jitterMs":2}'::jsonb, '{}'),
  ('00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'network', '6ddee070-9050-4f55-aaa1-1190654bbc6b:internet:primary', now(), now(), 'agent', 'verified', 'rajkot-net-health', '{"status":"healthy","latencyMs":24,"packetLossPercent":0,"jitterMs":2}'::jsonb, '{}')
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET observed_at = now(),
    received_at = now(),
    metrics = EXCLUDED.metrics,
    reason_codes = '{}';

COMMIT;
