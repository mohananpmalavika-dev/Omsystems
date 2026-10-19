BEGIN;

UPDATE edge_agents
SET status = 'online',
    last_seen_at = now()
WHERE id = '128f918d-3943-4049-af05-36857b66d41b';


UPDATE edge_agents
SET status = 'online',
    last_seen_at = now()
WHERE id = '748eeb31-76f8-43e9-9121-4c1d99166e87';


UPDATE edge_agents
SET status = 'online',
    last_seen_at = now()
WHERE id = '839d2a88-2b36-4e34-bd99-6cb247e196a5';


UPDATE edge_agents
SET status = 'online',
    last_seen_at = now()
WHERE id = '9f108498-4dd5-4a21-b810-eec9e538953c';


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('128f918d-3943-4049-af05-36857b66d41b', '525198ad-504d-48af-ac6c-dca057d38ed5', '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '["192.168.1.33/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', '525198ad-504d-48af-ac6c-dca057d38ed5', '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '["192.168.1.33/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('839d2a88-2b36-4e34-bd99-6cb247e196a5', '525198ad-504d-48af-ac6c-dca057d38ed5', '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '["192.168.1.33/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', '525198ad-504d-48af-ac6c-dca057d38ed5', '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '["192.168.1.33/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


UPDATE branches
SET status = 'ACTIVE',
    name = 'KOLLAM',
    updated_at = now()
WHERE id = '525198ad-504d-48af-ac6c-dca057d38ed5';

UPDATE resource_nodes
SET is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '525198ad-504d-48af-ac6c-dca057d38ed5';


DELETE FROM camera_credentials WHERE branch_id = '525198ad-504d-48af-ac6c-dca057d38ed5' AND ip_address = '192.168.1.33';
INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
VALUES ('525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', '192.168.1.33', 'admin', '4344@RAM', 'host-specific');


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch1', '128f918d-3943-4049-af05-36857b66d41b', '+DNYBpsMFVXzeeJYcnyG9ooiANkEsTmEoDlHDlCXaU54pE6WkW8L9JMw3LNJTHUDl8kmJDnh9JBh11bHzeoBK9u8W44OPLeZMECNbEYrHPE/+gv0qvBjXW3SFZ8RX2X18vuLmA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch1#sub', '128f918d-3943-4049-af05-36857b66d41b', 'NYu/xMkZq6oBqs99AoUXFcrng4pYUN57JspJqmZZ7Su5+gNihD22oJgw1cJf4bkPoSmaK103npLZCAznqtlXaPZ6am+Ov2YgAUqIyLnB44tzv71cdjZUaUgvzN/YiAVmkbgCDA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch1#main', '128f918d-3943-4049-af05-36857b66d41b', 'HSyO78y/3u7IA6iasz7RbkeZwvEF+SJq9ZCxEGuqJ9GjxKDU4f4CvzB8jzeeeTQOqqEWfXeFq5jvDqtUv4q6V/sC/Js6V3mOh6fwDB3eEjuSAeThxffEvlt1w7IaALmpf85BZg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/6f08fc93-5a37-4be5-ad62-9e5a14655f12', '128f918d-3943-4049-af05-36857b66d41b', 'zGoh5uAMYvLrNHGctizN5Uvnw4N2/OCur2WwPDg3686cNdUXXhFex6tO0qcFqvLOn8Tzvc+pHmMXrEG0HvHjx8lpm5V2d+z+y4y1XOA+RTxydRoWFnOOuuTS1fHNSEvS/10K7Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch1', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'KE0plM9VDfOIEofy+pMoW7lvhAQjmCGcDVjT+5eFqgrgFhpEpbjWkiQjjU1U1Y/eYaWmQIyOWjMmfX54uUhYvhr4nXSHqCNjogcWzxq+9PeZaD7g114rwbb1U2JB4zILWJE4UA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch1#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'hQNsXm8U32gObk7dWevlWmb/vOFMEavZYNpllCrF+BwpriDHPRJ8z6pkCGt2iFKVIKyPr2b2gvde3GJuVVH0RbdvE3yPVPAD5cdXlYoOVVjzHzLY8c2ejyiXzgKf50YXzFTdnw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch1#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '7Tn2e+/Ke1SE5oaB4gaAps2lODbQtCryRbXuRl30HRfzfCADsARMAJuAbRM5LBLGk1J/RnFYiR2mN3+mF+XPA9vr4mChzgBDqnVTsAO2y6fa0g+mdDAoFt26t9sedDYkiR3TEg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/6f08fc93-5a37-4be5-ad62-9e5a14655f12', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'e+MvoM9cubbaYM/tWNGNrMGJNvw6YhO0DPb0oBcF/3Ygpc1kL6tD6P9Y95pXvDpIlQYPDG383cJdXna/rhKLvvaO54yDCpLXmNx7zc0n2qR/BnBUl0mdjVJvcEM1qhZXuVQ6fA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', '5wnUOKIq2443R2gm+xXGJE5DZOz5+DAbQiRxrs24/hMZlY/0dXu/U0vt0FLQs2rVqtXnIoI1SZaqos3g46N1RH+G6snbWYuA7U4dvUYJxd2g/MsiY0PqXwCIyQLg5/m6RkVk0w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Y0fkc7gMFY73VMoD0zc+rYYa2XHq546zDL+YbwoZKfPgI0YHceJkWG1QjYD8qHW6yNUfecwLH1t8ZY7SulSr/D63+7NYqJlLIRFdnHJ+b3C0U7tIQqGAsf7/i5clU1Lb3n7f7Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'IFVe/FDpYxPoQumYfFtBEAIjidxwDbvCm6d6zDNfxkv+KjPFDGZ3zhyobLxOTP2g+vwWbao0FdwPOI6tu+3NSuk60WmtZueeCfILE44ANrvsO9LueAzRXUGmtSNYhdcPMNPoRw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/6f08fc93-5a37-4be5-ad62-9e5a14655f12', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'cT3yDWTrKCaeDTWjbia1gJiXbdcGb27lT2nMaNXM7EpEa4VRXT/s7YJy8zNQWrpaoIyXiw5Pot4xQRDcVfY0a6GWqfaa2k8z8qxj2XQAgOU87Gvw857qnjKqp4iUH45LUyWnbg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', 'uQETuHuza1odr9Vdq1ysmLNiAlWRikR0ksjhQ07wK+XkSDqO+qhJe+ZO66PQlPBb8vPzD2XCRkw0hzO+gp+vn0u4ADLWbgca8ADqGOtsMdhGpuHiTZ3rU628OwdOGgwJYR/+mw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Lp7RzdJuHgHp+cVedOVfcisLlPBu8ORJxRhx4eOzinXCwK2wqgz9cJqPZ8oLCz15k+M0tzEMOPmaaf53V+dvbb7i4LCkABQLtEjjz+8xG1dYhhk9a/PI6zf7Qtc1sLEziny/UA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'nloNvdb4lvbyRkO6TvstcWzlpIi43gtxjbg9IubRQh8ZCbfuNxdd0Xg+YypDR9QidYH4vYTrPsfe1x0rrOSL7ITVa0ni9WwTJYP/5YVpxvvhXrdTOklfpgMAtvpOAc8BLQS13Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/6f08fc93-5a37-4be5-ad62-9e5a14655f12', '9f108498-4dd5-4a21-b810-eec9e538953c', 'iLCcB8dVqooyGav8kJJXE/NNZcvTJPtD65g8lzpwUOzO6lXOaFKrCPGRWLQWRxRO9VgTPlMl2SvXVpMchSDLhWfLdcEVROAaZKN+yDG9YQhqsoQ8s62SvM5awVbWJuQ8adxVWQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch1', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '9ebXS2ILdULTIVIEQ5LSbv4Q0F5gNviRSnJTgx7O2vYP0u0f/NjckP6BbxwduEr2prlcGQxccHWAyLkeP8t3a9aKRV7yaB27lZFauGXAR0jJxjbPw8bgQu2xPBxgphVRe4aCOA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch1#sub', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'LjfI7s/bL5Dvr5EIt6CzCd5yP4ji0PZeOlHucMJ+RW1R9CLnJSDJR+19lm1pAisyliZZ9rN/K7hSElS++duPHGDLNnqVII3sT3SRLRt4RvK0Fx6K/F0kw1XrJTQeFJs6+TVxlg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch1#main', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'IUJkne0vOCB3PiYcK0Jv3yTtLvUSaTQZUcePJ6aTYfs3LOkRroPiA5j4FY3WS3hzhDK2SkpuKvdnOqxenlYN0QDH4/CU5Kp9uwqsLCO6kRLs/tqzbDuwNBcFY191LZsHHIM+1A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/6f08fc93-5a37-4be5-ad62-9e5a14655f12', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'UnkQmXxN/8F1XfdrYYR7Eq0A4fQfeGpv49nVNaZx07lqxkQT/TOqqUd6qwJtfjExvP055s6PbX6HZFqV/DtlzMKrs8tbtpy3L0pWoTNPHohQm/1ECKEd33ShI5GuPs+zqEmG6g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch2', '128f918d-3943-4049-af05-36857b66d41b', '4WQuwz9/Enal9GEKUpfO96V/+1tMiz3R0doE3WEGGUdpn1eXlqGMfxcxClvvDbcmYKRqW7oBRbVhT5LAQ/4gR+5FFGdHDVTqRH6InT2tUahwKlX48A0C5rOFyFrKaA+idFaP5w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch2#sub', '128f918d-3943-4049-af05-36857b66d41b', 'VXUcNaruZz6c5yMuz6Am0CsrT2fIy7p+lClWVyOk8CUZWsBrHOVE++jvg2RQJZJpHk5ckEUPHDr2xrm8mwocQhA9ftoezf0pcw/ldxkWNf+qlG9QrAEFUU5gMnoaC9klaOUWgA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch2#main', '128f918d-3943-4049-af05-36857b66d41b', 'W+evSLdILWKghUoc1fVZyn/mCWRs/wLzDBob59xpsgT5n8VQ7CHbon2pqfUsA2p3KEaL+neTWskbJwYC4cQ9I4vsqiqrPWCu5II7pLehQhqHibzliUB8fq8/4wF69l+F4kf4cQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/a3967751-e600-45d2-84d9-7c88f588a847', '128f918d-3943-4049-af05-36857b66d41b', 'ECMKhjBTq9aL9SDDAfGmB4KTJOMpLCc/Pz4qZ7sNzm7vP3EefguWKv7N84H0vMIaZyFKh6lRUvd+L7BchDDSJ+gN1qB2o1He6SQ5CrY1QJ7gd5mB52lw9JWRQs/Ejl7vcy5Kcg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch2', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'wDl2b/fxKpEvh+ddsCVkwfNbWNRyNtBuftCBQIB+TcbPfpgfZnSbd8mPgGarHal6H+FZKvCWY9MXTY4Dt+zjMZOKOYywLiHyb3XIAN0D96xCT8YBXNuaErQ6+jXWM98qRDrwbw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch2#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'wpp8dxn/gpBbxA5iSBfTMTpRBLBF/lt4ncz6ARmgbHpyxm09+RR37/J402/pW+WmBBHVdaZTNtTRqjyYrfgT+/0oBtNFECRvqAXEYW0NGEeeKDS6RNsrvzgrHDqKhZrBKwSLFg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch2#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'VhQplhyHpil+y514vkhxc6KOF49093n7/BEU+PxqQNqS1F2N+sYJDzyf0HfVMW0AHgRT0qrOpxYo+5WQ/DP4ysfg7eghIsVJTNySaO+m39bGiXfFL79l5dyGgu+bW6aemVcFlQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/a3967751-e600-45d2-84d9-7c88f588a847', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'hknlXIX+fiNi83qr/NeOXcx4lfGO5cutufe8fabbLGz4hVou4nrkMJIcC/xnO3cVWXNEEV1uNCIU5jq3lA9ZefXvCWH+kiPy1ji7zrM3sqlSPtvrPNfna4s0NEyo3oO/7lBIpA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ApEeKdJWtducqBcz6aXYx8HwKAAPpsr4J8PwnfJ0QAvQr5Ej51bTZwi05Hd37ps6nHsDahkPFiW9YOKfbr3nvUpaGDI6OS9uGwSDklTfGaRN4xgs8DkhqWBcCQllH+cQjY93cQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '02gWY7Q9fll219lMjCaJi5D6E90IabiAI7cksy28QmtVD6hmORGfrvivo22eFIDcprg/EN/CxCzhoatY/ifzJkeR5R5TEP5G7ggwPmUEO5wiuxpasiVFqldYjhVubSY2I1kTqQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'c4XTyS2Hsp5TR2c5Nsm6vgrSsA7A+IzWSW/kiQbwZVBL/VfmPKi0rmgVEg9S2kLgkWJYUMVgXOVGy59r7KcYz4762zupf9F+lSSrRLt2sGgoAi2LlVRMR0p772I3ItM1DltNcw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/a3967751-e600-45d2-84d9-7c88f588a847', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Xa6EtYMHDiJV8NELpcXhl6Pxq0qDDJggNrtT44R6E7zZZOl5HKSSGgeJ6H+DXcPh6IgpSz/Xvd03KIqPEUUdrY/t2yLtAB62fKayGTvJox7S5QQjVHKo9AYR42VOi/11bpKPpA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'GYkiEcQCCfYR6fvHJCx7wwkixiSTNOzE4uV7OGZv4F3p5LxVw670B/PoIaHWfbzGq3NiHHzLVHSvWM/4dhSmYrQS6WNsWO6cTXMKQ4xx/q7QhBa4jKZWnIW4zSs/WFYal5LkYQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'gHfwGv/qs5MVY1z3SpeJ+VNTP8B12Aj+NBTdsAsB5Kxf//Mh0XZHAvtBo++z/8bPtUDLHFkHGeoggDOuH+AdQ3U9KEJCS2YXVma3+3yGvZz9sj9joA3FNJmMKG3O10BJZ0IMkQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '/kxs6SKHqkr+Vjno3kThZnr4uL58eMRgVott5BHQPHEJIzYCxUnkhQ1p5BKIozq1HZdmMjayBVLrI0Z+qKjpBoCzClt58S2HXrFAhBuMVMzYFuBvuaAZ16cRoQ5nifZCGUHJTw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/a3967751-e600-45d2-84d9-7c88f588a847', '9f108498-4dd5-4a21-b810-eec9e538953c', 'uiGD6mHSKyaGD3Ut99vTaY9ErBQXGlGjjWjaGGnski1TXG5HDidDLmhGHLp2MuSl5zEafMxfVQM1Bi8vJehx/gdPlS4BMDs0VLTRgJD/42XnOTpT4atVUFG0jpM2wsA7UQe50A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch2', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'W2kdxttcP+d6SbWaduoyLv4cBQV7EodupY0fw1Ua14/emr/gN0t9hbAbq0SQtJCiYJs8arRqOue91pta/WxDX61s3rCzEfksedL03MWOwbN0X4cS42AhW0j2zbNihW1sjmderw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch2#sub', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '+PtAomBD+IZ70dYhsB51C4PLeoP/vsIgbF2ZkdpAS2dj70TAzkJpLQW9PPEgtDlq0H3XPL8DgtRtXI5jq7vCK9Wg9cGwH/i4UNmkevFpovi84iUOkV3S3FtshfjYYUTZSSF+fQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch2#main', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'FCo6JTDjiBfMYMGpuimxIT7gyt7GhyBGurgIe1buXe/7Q5q4+Ms7Yn3zC2Kl0b5ipM1g/idB7FQ5hC4adnhpM/KNVKAZ6lUsOWZ5TgcZ6b275nHV2GF2yX/0qdO5+ZJoCbAKww==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/a3967751-e600-45d2-84d9-7c88f588a847', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'rrjq8OsNi8pQrtCFIOiSD2E0uwEJ6AeANE9l5uZUf1yqxweFqEFc1KEPWWp2XZuNpkzmt0ZclsKwO+lN6UDitsUfSClP1T9tnb2c2DqQGK0bLAbstYCO6Joln0jMowccNUTDhg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch3', '128f918d-3943-4049-af05-36857b66d41b', 'zSqLL80Jl2+sNx5XkwCYGOcCix9sWEoO0kdpGL41b59Yi8EMuncR+qgUGf0nNroMox3EJiUuMeGUr6phgpc13KTwZ2XV1wbN6Z99rzEuD7Jx0xBjlw+QmiWHfpDqv1lK2smUnQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch3#sub', '128f918d-3943-4049-af05-36857b66d41b', 'ABBm3CP5nSUjJInDcnyO3V0c8jUWcO7TRPrirxbeAUZvkqRYUPVJLpKrRFhyC0Z8v8d6BqM/XWq60jlqNq/FK9kc3yUZkTBIz9gam9sevOQl2ZMKdsSoHSHl8ln8V/7FO16v8g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch3#main', '128f918d-3943-4049-af05-36857b66d41b', 'cMsufi43WIG8vO5HI9z8As4M2IkF3rg/EbwhrLSHXcqTJL0gLeGrx9VRlavZq2F1M6LVwmHNnqGbtS5ZyjdV1kgskdCgjVkZayI9zxZCUPsmrtLp5z8OHKceeNV0Mmoyqoo8Fw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/5a51e954-07ef-4764-b81f-a07073381749', '128f918d-3943-4049-af05-36857b66d41b', 'J3N0Jraso3vYqQbo46s+dv/TRsiSYA6LOflBmnNHtErQNehxQlgYfTQZMU4WsXn/As3+HtyI4eoxPBXFNJryaTXYTHxu31JmavfnWL6YAEZE6whJEcdnKeFBx+upC9smf9gu3Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch3', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'S8SiCHPnmXLNkRMMfcieut/v70XDzLgihGSB7zMw2ioo/jyOKxdl/8FMPdeVQ4EvCj3DAG4yBdN2Z4F7tD89y7y4fs4l1r++ps0qsskpyr5xT/P87rOOT5SpTVI7BBn8/pUvvw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch3#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'DV43EQQ1XjWjEBE2Y2HyXKUSPZQvSztD+ZwyFvK3we2keicPUnejya+WKEwZvr/1Y6SUr4Wg74Jowpx/lCC1FJfpijcobof4eQsedNaM+MaIBg2mGr4XSTz7lqryzmZDI9EPKA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch3#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '6P7AKCpEjW3nha+l8zhUWLqXuX3cdYrJ3UokcE0zIb2sCpo39eApWZkVfQeCTFK4qDe0U2IfxkA3WGrzBIbyCZEh0pmMh9rhLf2DESjSauntRvXWQxjK/KMEAVSXParPGaHxgQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/5a51e954-07ef-4764-b81f-a07073381749', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'AUrsDSKnYQzJ3agUGw0Xjtfmg72REgvBOEDQlp99JwkLzl9F0l0QlPgoTq7uglvO3cgsr2LIEeatnLlxfOsjrIBgRjVdJsujhfZW5WmqM/21XrQtVWTT4rOX4DMQr9U8t2Fvaw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', '4vpNSrtORWCuSK3IeSTmXjtGVV5Z20H1HO0aVvSpBNcmovwROGInx76Fn8+/rkEnJSv67zza9P5vF8aMsZ9fYGlfcjv4akNmheBgsXI5HZD2FEuQKU06nfkBqE4TKuBSPKt0Kg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'rNucP8Bsid0Gt1A+3jxtL087dXwBaqCVSpZ52JcxFwB6I1SqcmozH7vdLhTtXkgi/prjjkudMbYS9cE9u3JC1vV4r9npU7db7IiTvyD7gIVpZLr5vIboLz4eS4yhcYuF3TyM7g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '5eHSyR9zdUeSQh18R9XRwkXHBsyJoH1ln6RTlNr0sk8OqFJgPJ29dis12W1ptQ2BW083RGMaIByHOT1w8oDVMM8Y2Yeait5lJy1z9nq/T5kfw2Oo3oyoM3295tKf/dL3UQtAEw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/5a51e954-07ef-4764-b81f-a07073381749', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'g4LNshA9lwvdBuHiy+VepP1Dv0N1gh/qsqR4gTFpZLnAlPdLP88cO9eAKyS3J/KkLoGFUfIv2FYps8oUO5mjaqDUYu5VGBeQ91kxcdITzjFPIKfKot2qUy/+sBoiGFvlgayumA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'BSXcRa5cLpX68tKmkQCtOEljMXuUWWgh7xIQYC2spY9gUFS/FLKHtt7liCi0wVx/19iGy9gIyVeemFfOSwTnl1mLFrThSn64y8xjLNTYwegw2CXoYHthgYBmSD3V+hUFMeO1pw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '38nABcr71q0LeeuBd3JfNxp9BEcYOlUXMcfe+yypuGbgxjYMKH5DEf7YOXmdtjuJiDeS67VSiIB2KgUEKA4KdePtuwVRTFfZzP2oy71yXn8UeC67hCUYXKXCNLoJs7S2D+Cpow==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'bioxgE4xtMPhKRSSwJws6ahs75LWWXQ0XtVz3h4wMrGGXBlQI7s0jYijpwm1Ukm36afmuiidpUq4DykycxMRrdOdDg9lRdxrLt4mpZe38eI6dh0db68Ja4FhTqfEDZ18YzZ28w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/5a51e954-07ef-4764-b81f-a07073381749', '9f108498-4dd5-4a21-b810-eec9e538953c', 'm2gEAgJohTW5tzsxd8rsXvRAXGHFzE5Z5Bk4QRjmFGXFk6xwv/iR2ZvrBojzLxPOn2Rkca5FR4JQbonCXMyuVw1eerJ7gqrzONEmf9tqmWMERmb37bIhS3A9xC64zLEIJ5bQ3w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch3', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'lpVUrbRbDjT0dNjpS3/l4WYH35NZAylAf/FZEH4ZGJABLyqXTw+aEU0PrPTHBkUwMM6lVLq6jqWxVWCgfCACf2lAuULKcbQloLdGWb59ZV22KZrKhDbVXC6oZcpd/JyROz22bA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch3#sub', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '4wFcOAQoIOj+Rvx2GnEpH8cf/0GDzPaB2ymoOt+ARuzpzVgSYZtfujrpEndojanMlqU1vRRk5XF2uShgyBHFgYP9xArkZIrkXocMJHzShQEE2C4d5WD0uRjls8touQKXGMWw9A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch3#main', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '4qOYhD7cM6KJ6WQ+yfpkBvSYD7bXtQSWcg/cFq2osCC3FT3ez5+zCmAbBopKVfiKYb/EXAnvxabQ9Yti8UUMqrBUxr4x72ZVeJRTT81ho9VJJeQYax5q98IPWPTxAiVV6c5ZFQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/5a51e954-07ef-4764-b81f-a07073381749', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'rH27Ca/nmTi+TiiEV+Y5eGEnaYQ5taqQyl1LZtrw8RQH3zfKOVjpvIYWSe6SSs8nZ6dlwBqdF9zR7xoAysZsm5BccOOPzdiwANB3SPhT09fBVoCSRGc4KpJiJ1sXCOQ2HIaCHw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch4', '128f918d-3943-4049-af05-36857b66d41b', '01P4fDTUpgX0ghnQU8hEseL9ZNtaArCRocvznxDLYhReruNzAKfMrrbj/+tuBroF3FIbmsmWVJ1aO8s+QKpH8I1jZYwWZq311y4UP/CBuxBF1HHaGKzzlxnHpAvvhO/D09OgAg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch4#sub', '128f918d-3943-4049-af05-36857b66d41b', 'FJ6DaEPU9eTCFCksT1k86vj3l0XQsaJaIr1cXdQNxDB7Z4fwMQl7QQxLixkwCEl/eDBn1iHpgyMA5ATS8FI11zoZVMySYusKHuF4Jj03JkYsEwsiE/cl38Ah5t9lHIDfUGj92A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch4#main', '128f918d-3943-4049-af05-36857b66d41b', 'imhTkXS6MAWuxCqtCMGBBGsadssKUSt4e4EqZKffsGxKvJZjg979/pbEcKg06WfRxLhmbGWvJcl5/08XUQtCq7K/CxymoSP3M4tipX9R2vgjABQ8oCobsglvMIcNUHluF2Gxog==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/89e52322-33a1-40b4-ad4f-3da09a9af45e', '128f918d-3943-4049-af05-36857b66d41b', 'ob53QB4XJoRHVnOEw6XCeR8xtPWygtMnIvWHBLj8YOU80Psk8NuFjkqpgBXwdiatK+vHP5j9EBeW+Tbk5hX4oYFks6/95/1jrRTpE1u7pIUUqZyFXe6dzF0MdBlCFX49xACUnQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch4', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '/Z3x/UZcjSINvjtdYGMvh7CBw/hDquaTYAb0EY3ZXZ3cObrfYEEHs3ECjbu5yS80gfkoOA3Ldv3hMMpFihQpFTa+JX+opVw5Acouq7UrRXxgs+MHtZW2Cq+H1ndolfLGEyjKbA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch4#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'SohEOgsDf4VEPq5a93RqyOwWkGcpi/BIvUm54IJveExH3DTiZpuXwL15RPfLFIoWXVYP/wNCDmpY0qZZpwt1lvEmoe9DMgptlfJTJH566SufQnu9D5HMzE3bdiKTv1VbVkPKnA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch4#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'xr/7G2AJg1rQulV6kbjBuAlUvxZcpSUADk0jhoOazeS1l7OYBS8RAioNfFrB7PDXSuEhXs9iNzXjb5GGHsIx0h5A2HylaNEihCkNhdiJcQ4g6+Lxla8ptyO+GjkJEzPK+kv8kA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/89e52322-33a1-40b4-ad4f-3da09a9af45e', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'qJnNKdbZ7zzQLHJ8WOZxFvoxEdtz476hu6baPNV0/WEOjTeSmpfPbtUjlxLAohZK4kQzo07oCZ00RKLt+u7gA8HvPaxNd1q2kZBeyOC7w3j/4QZLTmwE+y8j5yQwKWIzE+U0Xw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'EJm9Afx1r2ib9TjaErfCnGjpYXYrwb/RM5WZzRzIS8BUCsHXPdr/Nt/EhvHQqPOwk/SiLBwTo62Cafo0yBqo3eRDsRHsVaikv+FOrElJV6MzXOgRWdU5BOlPdZYLyoUivvZutw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'YimdVCf6Iw/v/JeQZ7km36LK42W6dj8ZmEUjRlA1rcgH42bDMtOHJpaIrnjYipbwvwifpXh9FKzh7qSu0JznvGHelWU375hLENL/4GR5UawuY7INP1KuAKOPdJxRBK+qhd9lDw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'xXINNC0K91elY4uTEIqrcAZEKB34OTNx9QVEy/j7HgsrZnKoYrBk1xvVPIkDHDOGZ+X0nG8m+Re3db2FlXXQyxuDGT9jguD8xs3izL9T9LRNDchfDxXaQkqmKLlWPmXQyTHy4Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/89e52322-33a1-40b4-ad4f-3da09a9af45e', '748eeb31-76f8-43e9-9121-4c1d99166e87', '5b82BjX8SXGcOeP6ATdzbsgsPkHvRuttkana0gWLMPjoA9TRGH47fnxO8Ad6jHTro2cQxnpunyF7ZSC3/Crfx9OJ8D1uuvq7lOMPxaFPF2exZ0+VB3z7qhRrXQzSD0Gvpq+z2A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'hrYOYTWh78pSxt/q9eLybzwwoCMwTRXKU5VQ8gSILKqmfOL+3PAQzrJ0wcv+VVe4OXI+bwdXebdCkEJTC1yBARDtNtDqGY5rb6MdejnCYUjnsKh5FZAklxzjnFWVI+BgCZos3w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'zqaWL+fmkfbKjUVcixz4YNULpy4tzpV2oqz6qipYNY5vTaO/9yR/MuqBi327qinWaXC8KBSMJIpuqJF121+CNhs/wQ/HhQKIBOQ3pNHASBi1CEcjEpy/lO8mdU5PHxhqunKsMg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'EaD2ByB7hl5FDtpnYlUNZZMn7Brjs17HulwRcdNGynacH9Rtocq8nGf2VKBYfcVU90fAF0tlhaRSFNUTypeRZ1T2RY680GM4/ny4GNdLDdrh1pAaNiXw0FTaZMS8fTDKU8JlKg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/89e52322-33a1-40b4-ad4f-3da09a9af45e', '9f108498-4dd5-4a21-b810-eec9e538953c', '85d6ZJdp0jEiafD6j1sNYmH1zv5GzGmlIOmvfgo21BwC2oVIMkJzOAPrPDTb20vNoCD2WQYztiydu4GDQ5n+g5VD8nspGckR+Qbly2HY/k6CrD5ET5pclX5yivpS7vwLI8WQvA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch4', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'yibyN+WdHGeMTwaXWx4NZ86P0LSyEW1mDb8bh31KzX2SeTJoSVOY/8313yxDjB1a0+0L/z+FH2H782b9/j3nJxc6ItSznw5MV8JrZJmS/lIvTHGfXwpS5c1k1CbS8IV4yeDRrA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch4#sub', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'fqIAxl6oC54bHkW4SpGTth1JsrlhducZMPgutgNXXDErgHk4jjq4vC/+qYyWsiTRcx+PWefEK8hcwmziytmxdWY3+38h3D8op8TeDaMppBXWvbBYdWmPx3KlIWUXQ9q/Gw3sWw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch4#main', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'RaCtF6KaPyCAGwrnqr7k3UkTSwHfjQj1qqkQuCb+XE9vHGkc8vuxttsWnDvjuceUrhJ7L+KYPuWtodS7XSWJs2t1DSmmbyNcHW+YfNYrssPa8D89E4lM3xdJT4ny0BJ08wzNzA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/89e52322-33a1-40b4-ad4f-3da09a9af45e', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'Cr8PnYg/AfU9BbuhcCBs+P5DxA5LMEf3eBmKQWgB3HdeJKpx7q9pt8n1x6PdskGV2RKyPO1ZDPN5AsHzVli8e++NDT0oFTEjzrn7YYRbZXr4gMh4BrkJf8I4RWAfA2akF3PkEg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch5', '128f918d-3943-4049-af05-36857b66d41b', '2Bn/nUHQjCjNW1j+lj92tAQpeB0Nu0F5tEzaJW305n9nPXAQBle8ZA4L17wJtBsplHy9YvDAWr3xk/TSQD0A4OEoM7wJDlVxP5pKyQ3/q5Z5wgWN6Dw2U40r6urqNkAt1gllpw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch5#sub', '128f918d-3943-4049-af05-36857b66d41b', 'MfTWxV5jBhO+Bg8Qfm2sJealQHkOUNAUXFkc1hPGNhezO+HqUbb0wvB5mUynkWiKpOawr4kjNpANCEZdOrLsbxRllEFBwNioyHzD3IhnqXIUfSX6y1GswNQDUH1rzfPgT9RFLQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch5#main', '128f918d-3943-4049-af05-36857b66d41b', 'n3vVyxGOCbwDRG2a7AJi0iJRQIn3jBor1j/lIb1NTrq+0TVjhrWLKNFrhsq49m8LFwvoUQ0R6BXQy9LnfQRDTlHeddVuPxkx1jN7hKOO7sB+K8f/yELrPUoxNmZvYynTHGQbug==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/8834880c-e6b8-45fb-97c1-c2f23222bf32', '128f918d-3943-4049-af05-36857b66d41b', 'C3GGOzW3Dlts44/sdh+O7XSO+HimFx/Xa4h8Mmz+lojT67MGXnisLsjQ8FAqq58uhZ9AaD+fZdiJ1+/SGsS8T8Gj+HTQddUFixSHGYcv0yov7jkoV9vHBQKeqibnERjI5axteg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch5', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'baAuKf4vLGlVmB5vfePFMnvA3AFAY92Ll9P6vs+o3O7jYfG4+yF7PCB31PNv1WzDtD4p6TZNQ5fceJ5pSkRUJ8tvF+PJIzZvQ4nOVbff07farzvBtmbiai+riZS2G+tOOHNT/A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch5#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '0atJM/bbUdqwHC78KnPa6DMnoexJbuWuAja8lLP+ZUNT6wYcFVDiJNOTepfkLAiKXqNyAJlGkpJnU+2UELtY1kzfKcLXduZXlz8rPNIe/Lch1YwsJtdp6rYSNeJ590VUQ/avSQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch5#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'K5wN3+GUnq3kPcfJI8FIVcZofpQilowuoOnSF0P9RAbfWu8866fBozXZYvVNbSFiIs7askmuYZtaoQBoyU2ZcPvyubBjBIXlun5Y4Zrlbf90lctMZtOt4jUr8rXts1BQQenxjQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/8834880c-e6b8-45fb-97c1-c2f23222bf32', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'SNQ8EPJmaQ7XyYwS8Pp/AucDj9CjO94KzEopvsGSqwgRAaCKlx2niUayyR3bKrgEEJh3sddspu3MZa8RARzzS9eu51CrU+nBPJI32T19Bm8lPERzBT0TwPFvQPtyA2+a+iEo1Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', '4uL3gIXQ/Tfh9WEzGRY/5BvLcSOROJ5Yu8yxsxU5AQg4WG9Gsd/gLiW7+GCttKl/vTjLOxWM4WJo0h5/CbXvi0caPo6+hi/YbL3ZLuPKTl52+q6R/b+bzD9a5ZtJu7EGb9mPcw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'VT0uzqYADpVclAvY9az58z2aAUE27+oikhPggjWLEJaUURuQxJnKLvwaWiMEINTicfpq1duCorhRGssULF98aELyvsIYaGUsSfUsYhb3NfsUe65Fp+B5Tb2ONJjpEWXJUbSEUg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '/0GKTh+iHhOuEJNjwV/GtEBRD+2xtNt3xmW2eekVVCpw4PqK3qG6mCKlIPohS/4fa9olzKmDDmHKbE55YIUE+zHoRjDqzStpWJSixtWSgiBJjSm/519QEIPBYKu+YurkNVHdVg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/8834880c-e6b8-45fb-97c1-c2f23222bf32', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'pj6m9c9gmBXv9QcXOi4KyQASSzlCtkyWnGX29/iXU6E3Ze8Oyn9672O5eHAE4BP7LsKKjwHAdYcFoWFAIncp8JsDy7yzeqrohOsugfuKNPdnzS1cpP03f3+QysO1xfhk0FuIZg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'gYf04Yz29ebejymnENgTd94s5Cu3N8i5mDnt48C4U+ETy95jQhlToYCtMOBkUSSdPnacu0nlFmLpB6+bZEiJuOC/RiDokFgcZnT8F4l5HNgpNiK+T7QCYiArHSgO2wtgXpvJEg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'fOPgwrD/lPfJ6JHApoZjKMWWekJdU2bS3W3ok802aNMqCu5s8+shTF+0Y4Tsy8fZOOxAEuS9o0ZMAZSwo+4bQmxUtjhXbBThoSgOsQ9xB7ZuwB9znhJSZAVjdasGf0RHuq408A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '7xog2V0rm9xXZqL8IMT/rZ8ZtNnRAOsoYkjsdc3ig/4SK5vZV6Gn1U7gpCnp5NyGMFLYDvIRhIQjW3behYX/aqBkZtfFL6QV1w4we8q6GTR4A+JWzNY6iOENy9qVOSfWZbgHFA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/8834880c-e6b8-45fb-97c1-c2f23222bf32', '9f108498-4dd5-4a21-b810-eec9e538953c', 'iX/5mo9wGpJwkeJZh0czkdDJXnGuU9XSzTSd62dgoO1nKrWl2UHFHKpu/hfSM0ZkOMBiGZJZ3l42xMPFGbaD6lgf4efqZj7sPXvpIys5ObIQjQbFfvGWyo0xWiJDP7nd5XhTyQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch5', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'nK1DGlwAWmiYaxLa4JyWfk1AIjOdxVm9SDEiqeMpd3dEE+UyiwJjuR2/pz7yvOWykzw2LEy20iTC239byGNnVgp5Kw8jqD/SzKz+9Gm+Fobf8hi0SNaDPQP+QUYw7klQpM5vBg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch5#sub', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'GJHWGPHNsIqM9ISoU+vTE3vBIUaXBvFP2IGNg/TOg7LXfTmyv8ulsHYq2h96fqwlGPsFheEg8n0SfQZQRJWODc1bCC4woIqj23n3SnhCP9P2/tRt2pys2IVyPL9aCGQ9L2IzHw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch5#main', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'n9IzQwMSK/BmphyOY7tEuXlQVOvcb2JjckXQTBYW0PW0uJvhP5H/qpC0OnN9ZyU6el3b0O99raC9VNsehZJhSx04nWiw2GxFfKVR1RNtWQJDd3N4WUh8GYEJzS9ExE5yHZwJuw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/8834880c-e6b8-45fb-97c1-c2f23222bf32', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '113c3jMFqt0Hs96AN4k2guEdFCgoBMGJ43LVNbsBk5UzyFkokMWrPRCwDYnQqCrW09bZFGujBIx9snupha5l9Smq4rweQ2p0U1e/AXLmCLni+S+tRgKYj5Me1AKtmQFLNBID2Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch6', '128f918d-3943-4049-af05-36857b66d41b', 'ZZtyej01yuMiuYQcBWExn4TUZa5cPy0y9Xx3gwsbrLSp/tx3rw+HN5Z5pT8PAVuGO6vUjk/x3qafmu1cXKyRdTFHsIXPKNywZmobMnGv3eACKBW5BvpaGkf+wTjkKSJVR+FoHA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch6#sub', '128f918d-3943-4049-af05-36857b66d41b', 'APuYne49IvLoliQ1TF94CPcP9WNyZLD1uqZyP4DE1fsAfp7MG5oPVtXBCps+tl9TE2AE8VcK8aYo99qnHMJIVpZQSABHb/Ka2XYJGs/9a4h4gtv45ALsMmJ7KOKqps1C7gENkA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch6#main', '128f918d-3943-4049-af05-36857b66d41b', '8JhgV/o4bzOl5FaunpPG0WeiHoRL7dzNxqbM6GFVisDb5OIjUlZ0HCNEa+sfUukzb5zoDX6MAPoI6KL7r06vJ6x/FKqr8pQfmYGDGe2kzKrvFaSwlVWj0mzpc59K5l125xNqEg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/acffb4a5-d18d-4e33-99c4-429f452b4a52', '128f918d-3943-4049-af05-36857b66d41b', 'ztlha2xm8agJQcCx4wIdk/F1/JFuVa0d1fY6KTLXMHYfD11b+XLM2mNv4Ajjh8487bu+WhbnNzqAeVTDIhxhLg9ekRhXa69VkPRAv9vVxMfGv+xHpXbfNKNhg9Efxd+tef/vvw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch6', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'hAJ4V5ziN7IlNQZtu450JJHtFo15rfRW5dWNh5toiAPZNCWut7g9Ijh4oPLqMPCfbawep84oDZSIDbrBuVh42NlFJQgIod1AzGo4QQ0CckeptONKjFFUbqn0FFhvo47GMEcvVw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch6#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'uqtUZr5B0VlONoUuQnnEwm1XfzIKI9AD1ZST/9Y2P17AyvrczG7iI2aovTW2SLv4/uEVL24aCHwVkyNDVF8KtnyHzRdbJrarVmAjuo/d8i6SU1QYt/6s/vIZqo6FkSxiQam92g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch6#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'd9Rs4Qnil7E4m8M47yzhkF3315hJm5n4iys0JwySK9taRen+45/YscXRpYp0QPx02nuGyTMYsoQlwSJiZaFFFLk/Yqxie0uGUn+kyIk+yaPeOeA/EeCswR0HjGFU1ytMw40DvQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/acffb4a5-d18d-4e33-99c4-429f452b4a52', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'ZaSqg3/HPSI8xu1vKEdBpq0FtQ+YHjQX3Fx2K/Jc4c9RcsEme51eaj+Jo3+OGDHPXqetf0ZqIgfwCcsqnJIra6lyayAjIrI0k/SDdyq+lBNdvlCEfsNIDgrnNHYBbeLFAeFqdw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'xR6x0vimW0+ASKwS9GKoH1HU5h7f1AjGsaQMKpuXhRp0/zXc1qGKzYMGd1LOUtu0KxBlthW1kesR/diHMUjwhbgY9T7r+BfHgi+/+jlYJVP9tQzS7ZMSK2Os12yrxd97q2tR+A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'a5C/jb3IS07JtMwcGcpGYN6s7+ltSmRu3m4pWa2dlFXVaWKNmVIvObJLNZT5/GrRoadkjZrqHwrl9m7bT/0t7V0oruw/gfWnr8WqpHw4iuhvEPF7aymHVvRpzQTidIGgWa/7aA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Cl+ILHMPHsZYPHO2/IMm0yXljgr6nAJCM6/emZ0uICTdDKuEqGIu4K5BaOt46t8lXkNzM/AdvI5A8AkFKGCCgvTUfNRiCdLG2xVlG0ktK8JGqqooqulb9CxPQpPzTxf6QQmxPQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/acffb4a5-d18d-4e33-99c4-429f452b4a52', '748eeb31-76f8-43e9-9121-4c1d99166e87', '0MKBaffeyIN3Vt79LMYLoFnt+ht95tQe8PA5IvH4oVLlT4uPEBiqn2N+SLcfdxIiEw/uvfTEnqeSxMSh1B2Fh8ENu9SrqCX1DBhZhC0MFaoQT23b0e0LidgW3PgnRskoiw8Trw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', '6WXHR8wdKju9rgFmRBGFr8uwIXFj4JYEbIl7W6SFWNnUS0exRbuXVGly9KyOT8amhYzpn7EuAQVgG1y3a1KBtxmJrmt7Su66GBPczMboG6Wid0MuPSc4Pkca4/syQ2W8o3EL9A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'yYmHGKXviRvIqfkJ2WN0uUL19ZpO64DoHV0N83PsxAltZzSytelE2rQzVgC7rMruKILontSPSIMQfmonqMN8dck/tTAr81uKCUQFB69WOO6PTjVpbpzdXlY7Xi1RCKqTxVGi8g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'sIKIRpWkiINeIkWzotDSqZP86mV5JtPTq+8PQcwMyW0YbQ3P1zQhThpN+37b5ytLaoPJ0cn/ljUWbblda+yDjSdm2R4xXYRI4Q08u7XYTgT9J938fjOTJ8DFJyAIeXF22LmT3g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/acffb4a5-d18d-4e33-99c4-429f452b4a52', '9f108498-4dd5-4a21-b810-eec9e538953c', 'i4fVaQQD83czg6EiTC/vzSnYUiT3s8kYnocVtZK0YpFh1EJTGE2WiIo+K/fnRm56ZeppIYpTrQhEIUEY6c+dmeRO5P3xNiRUPVl6Udqx4zwosgQFGlTh0mu2PJ+Rhra8+XSO5g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch6', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '2lmN5CPotRVRBSGZ6m1UAgzkmsEf6xp0Yu2cMEBYA2oeGGYNtUS+YqUHh3HlaQfhkal5u0h0xWpj2MLGnREo3M4vv7f6vYpS4dzOCBuBUnEYOfehxmUo9EaxL4lyu93Bvdk1IA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch6#sub', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '+v+2SUZIZRJvzuBu8y0JA0csA5lm2xxNqcNeoOxmE0r47XQOPZJSAbd6IXRDfcn1rY+/NY1mS7KA+Tny9zO1Fo3vuqxFWeZEGZdM8vDviPOK9tztWmMzt6RRZkIg183n4iqKxA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch6#main', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'MR0fFbRR8mmLw5micU7gUeUywjlhHX7pmE2bLl2fscUcsK6tp1nTMfysNQ61BHv/ILElpTSOP+92u9EerMP1YT7ueabwr5R5fKZ8/HTd2QhbyFNj3oWy3d0soNzQrtuNz54YZg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/acffb4a5-d18d-4e33-99c4-429f452b4a52', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '/7NoF+8X2UUUWqQq/DhjIFlt4f8Pe34Yg5AlZkZsBMb+W+3ZgoD/FXh8Qwy0m4SyslHAQ6f0CGF1L9GoHUCKzkur3qH5Jv1PGu+Uh6G7UHQk6jOeYt9MVfl3lLKwNtkU/jzPpA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch7', '128f918d-3943-4049-af05-36857b66d41b', 'TieHTkh0FwB1BurbGNUVDObRiZWXV9QEkP7wp2YB44/PE1D8HcBvQgzzog9AjTTPU/62FQvHqlADcHPEYmd351uffpFnLGlQdDKtwv2tes/wJ7cVNzT/pPsDnuAvr1Rdd4zZ6Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch7#sub', '128f918d-3943-4049-af05-36857b66d41b', 'b3Jut/SczHXeN4IdfQp74VHaxQP7razTNipMNBS6QPfCNzNCVsj56gwEZf/binxu1wxwwkeFNLBmzBjnsjOU/Frp+R14sQM4pZ2XuwI0ynBz2L6Na4fBQ55q2kEmJ5LEF1fhrg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch7#main', '128f918d-3943-4049-af05-36857b66d41b', '2htn3z2i/7T5KYbp3ea5huOIuYlOs1ld7XpvDD1/3duZFj4NNRtl+MHwK2JD1d6bvyQ3awCBXbRtX1nGS6YKchZMc9No3xfNlcPh9gqJrvJo3TwbdO6I5e6Xt3YuMxjUuCYlqg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/74fd264f-48ed-4e30-bb96-0d69cdf15646', '128f918d-3943-4049-af05-36857b66d41b', 'BIfZx9PwcMkHjTKdw6dGmZcKjFdk+bYuIBopjMscZ+Isxi8IFmLFT4s/VtqY8ceDqMc0o4NGkbp3ymwnUlw3o5LLkPDvg4RrS77b46FT21xo9YFm7asCPqCQrZnWq4gM6I7v8w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch7', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '1ISeD0OTIwbSBZxeg0CEmsgCCVxx72uhx1fn1ICEeipfgHdJAyVI3BqhY6jkAQWfWy+fPGqclvK2NdMPIB99GpuE788Y8/M7/Z6gvM9S9w2NKdZgtccfvVjveVMxJrI6zRPeYQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch7#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', '+1KsuYK504BgnZITTPNqysSLopuprhU8Xj8zhmdAmNVoR95/SYwyoJozlj8q04X6l+JzsTdjo9jVlOabH3DFL4IJ7lskFvN0TPLinysFBNpPWv9Y/UzhmaGBmhWB2/7Sq+3RJg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch7#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'uKWOE6kRg4ScLL3gWzn/3Scuudvqae/Yrfx2nd5Tm8HAnALqBWtEW5pz5rUfQw9QVk9z/XKNV2i6UIYOgm8latXdi9EiX36AiIEBjzvzR2Es/hqB68Zdsh6tE0i9T/qZ5wojUA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/74fd264f-48ed-4e30-bb96-0d69cdf15646', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'd5aSIdI8xbU8xjKPwmXAlyxLkNFPZdQyb7tPtVBwhXdk58gyPby2G+D5UQjn7wsOhR6aKq7uqFkYb7P1fRHKLx23pO9tni494WsWxZwIrPs5pVPx+O8f/U4yEZKselcj6k9PmQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'DGgwqz8N/vW8NM1PvGTKLjghxhSY3DCsTTbeg/Lhd9FBDmcFt7QV8SaacEvsTpIlze3dKFx+vUlc0P+jkIJeKr3XoW7Dp0xW7iwaT6fOdJ0gLun029cCbnqao91EeigTXeDcTA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'TPUMDmHnttMnxiSEz/+KdHZsfZOnYvYMzKZm747UC4icklHkUiVLDSgEyHHZX/FnT2qy5nM2ii24Wuu8lZMdGDSV5UMlh9f0d8Xz6NcHye1mNB/LK+wX6M+gdFiZ6VhzZLE0wg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ZnFD20YMFIEh+Z6g1Z6A9TdDVP7xq73DD1Wuo3cxoS//u8JilRCNjIH+LMJOrFZ9lx6Q/a367uyD9wBK+0eWGO4szPV0bmockY3/Rr/zOj0M9aJtGDi28o3G2cQpJQEg+7ZUJg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/74fd264f-48ed-4e30-bb96-0d69cdf15646', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'IS0jAc22xmr7tjJYCcuc7hXR6xYcTLk86mx3eAvzVHJYN6DaC5SXcanSZmlKshdLC9APz0uRNIqlDxlFnQsC9S4dkGmlEIcte5S9y9ZbyxnKlboJ/kaFxTqTzDZkLUH61R5aVw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', '5BLy4fH3UiGpFkV6JQbctB0iQB4JZ9uO+1RirjgQIOX9uG9pG/cdIGK62ncc6AR9t4WaRHVKWsGg2EhiakzSUX0EgPbKH00M7dvAzIf347Tth1EJ2H0Vn7eeiBxju2QOfKKdWw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'MNxGJ1AyjIAjIWndR+u+QFFGtgKJXPJ/XHqomerDUN3NQax3Yrpd/udwmjVein30zMAX6WEjbkD+innAWV8aA88kQsVUUIMMF6e6GiYsprSamOgdKnIOoe+OdHWNEl8iLjV1Yg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'E/Z/Iy3H3Z5NeOwIBEOLVJVkK0j2rtKt+VLXLnDt3D7ng3jjVT2ps4i3LfsYWnMYZXmBgTaYzCa328O4VkyZYJijOioOmvDzOTHRHoZXmEFOFoRtzSzoEPv5ExwcmXcEXpVDyA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/74fd264f-48ed-4e30-bb96-0d69cdf15646', '9f108498-4dd5-4a21-b810-eec9e538953c', 'zQPm4FNvd8A/7x/F+wVnfxCNs0gi1WvnIX8AN2uNNj8L5iFElUr9QoutQBMud1dbigaZb0sqIaN+MTZsZzwUpivKjhYIJgwDm0gumIwYwJEMGEf1uQ9dQT3AQP1kZVYwKWkwJA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch7', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'HgZMfktS9YVvjbwPV/cIbuUZGDDd9xyo/NiZ/mFS6tqE3zXyUwXqxATJWpXfNfNoPobmYs0yWbkRXZvbf1iMDdKR+04e6hWQyT0k8aPaWsAD0JdmQCANS4oJv2aYU0GZdP+MDw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch7#sub', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '92y9XjSCipyCjbSasw6zJMp7c2koiKoXCXnkERs/eVcCGYB0Q85U++eOH18/i1ienBKCF0Ed1ryoLU9y/6BGT1ceLC8caMzPYDcEtEaqMdWR4hntIMKMrHDRqbiCyATTQ/wG0Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch7#main', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'O88eKpWHla7dVPx5Q/TQ8ngWDTRKb3p1pmiRIeobAGc1268SgsW8cEPHk/8r4ING63n96ZvhoDkoju3o4YytrpH4owYMTDScuJg/kU3i+4mXR5sTuy6RJnlAe8hfDFOasogdOQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/74fd264f-48ed-4e30-bb96-0d69cdf15646', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'CqdTNP+Sd63EmwJoeOJDSGvdYiV4+TeMch0xti57U9s3eAvnTzn7ZBBrJ15S8U+jSEda6kdKjiRu1d8GGHSxetJtjyy2/Q6Sflqh3klHhpgUhjCcroDII4jqRFsaY47bU7YouQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/DVR-ch7', '128f918d-3943-4049-af05-36857b66d41b', 'j4zqJqRlWCQx/VL4quL1Y4uhrI7tsvBv3RDiPdtxRlgBQn22Xk+tA0LUbQ1WzAx5XNUU6H5OEALCdZ7XigKNQO0IzBdlNDre8xpUTTJ22xS+ShiBCHCrUBvjmBbnJ3PMelun6A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/DVR-ch7', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'sc9G02/LBXMo9/yixv5J0gZBm3NRfi2RCzm1U/MUOiv9OWWu83GFqPB8GnxN84tWP4nY+8ifXhOl8wgayvakqdrURxFCd6Y46lltXbNyeFvktTz82+m0b+JGC19l0IvQpDx3QA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/DVR-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'YtA3e2IH2VS2ynwY/iu6KeqVviB+wTAVmGeDbSOgVzMIaHASrI/V75II5hWBYiUxmPqSrZRPCDiniFYaqaiCjvwfz3w6DO/CiS1JLivzEMdMwE4hQ0R0h1zwOcxGdW0RhUAALA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/DVR-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'If3xCW3rki3QB3lZe1gzkw7YFDXbCm5muYhWTChF/hpreyV74Qyer4cbWgBUB277WiZGSH1OtaveVlof0skul/fw+OZSV7zD4JtT3nAvesHro1erQwh8aPK4vRZgktCBm5TTxg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/DVR-ch7', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', '7Vb0P1h+NUwSnwrGzGpXklQEzaK079d51gKwUi3602Nc/zENyiUmcxmwh4Bx2WuXPBS1scnPFVtIg6o0q8Hqp6/KNrrXbP95BN7qV9UdzSgigu4ffmnAAXdxtSgLNBBNAq/OLw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch8', '128f918d-3943-4049-af05-36857b66d41b', '6SEzwjTc36Nxf/hTxHIighnqOQKyez6EfdyCpWtVDfboNCO01PQBsgNQ5CJuWcKsWxQhtA1ghJ1o3P/qEktizPyF+DoEz1KHR6FrAu/5Cyc8AUU62nl5a8M68ifExOukcUgKlQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch8#sub', '128f918d-3943-4049-af05-36857b66d41b', 'rUNgLNz6isi7eHTHoIlqkUuD+nYA2TiuL60gFb0mm+LHOc5Zg++mu+6t8FJisZdPZBpLa8MbMPcmXHnaGKcRukpGw8xpU2FuYK2cfxT7ZQjuIVB/Sqdp5bbOhQqUQ5JLRwP3iw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch8#main', '128f918d-3943-4049-af05-36857b66d41b', 'MyL/0ZxF/q9Kjq0y0jsUGt+oe6HF76TFLqcBBWqhFYqbXxMkLXNBoX7MOQk+/FF5vJQn8jM/GEZJ0hFWXjPksKKZvQjYBtI/PwdkHp4XvKcnAbomJQTUzOl24I2ghnIbQK+3JQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://128f918d-3943-4049-af05-36857b66d41b/052e0a42-2ad7-4961-b9c6-070b36094299', '128f918d-3943-4049-af05-36857b66d41b', '/Qok9IacAcBQN9nO8eet2xxVS5x9uSjtpwTnaY5C3CNpbGLpB3tm2HEGMqXcPKditWCNbvmbzUluEI2vQk4vZO/a1B+OYFJYzd6yHC2GFeijJjmFlMSGJwBC9tJx/7bZPyJD4Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch8', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'vfzeEkZamotQDtAztZP+rSC3LH605sYYexQ7qm4WA3D6xamPeiFLVY4E8Kes8QewAsY5e7nkMr03BmTZQ3O1mR3pB5SC30PzU46qtQoFtKLDOKmAVL1gJpNN5QdhK7QHEBgH0g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch8#sub', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'WnZUoikzfj5b8HDfJUWNIJ/bfAzLk/iUJkBir9q72wXVXJPY0DhTZk/YcINnp0RsHxN3eBQ1WKZxM+5CrteM4XZzdK0ChWMRQyG3r990LA8ZlTYE2GxZ2aeCysd/i4w99h+6yA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/kollam-ch8#main', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'UIB37s1Hptfiz4GalTLxoBUv4dV593kMXsYa4vCcRrbCyANCA0q9XHeynog+wy/fSSmnHbRUvr2tK6oJhYNVCWPmhvc6Mh6j+44rL5m7YTpGchj+Kb7NVbsRDcSJWiz2s5AZVg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://839d2a88-2b36-4e34-bd99-6cb247e196a5/052e0a42-2ad7-4961-b9c6-070b36094299', '839d2a88-2b36-4e34-bd99-6cb247e196a5', 'JR1H4yzFCfyqnfi/OoLY4DAQgfrexYohxgURiJbl08EXvpoeJF+srgMbD3x8gRF9i5cBbDAFjpfJ0bbUBU/EvoHuhF4Pzue/Y1dNivLWhzhXwMsmEnpnE2qA372Yp2FR15lz1w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'boLM9JdOY7exZPox/Ol0YgMMpiITclzGwt6PUp0+OkjCQzsfg+NXLwRn5U89h9RR31VEBm+O+2W/AlJns3CklhAKjnmQx67b4fpSqqDKWMbdXmo8N2tpskNgVzYF+riqCtYzkA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '9ESwZd0+tAHvt9oab0MO5/UAw8q9FgiAFaRV7KCabTpLk8BubqWhm2+OQceecC1GkRsoEvHT8yhQQ8qJpw3fONy+uWd+r8ujhtz8hs+uI+UsKZgDnnEJBRDsSAlhp5P8DdZCOw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ZWHCHXa0HS1BXLqEGfHO6KC1nJrfOjZCTkXGxpwt1keohPT6tcdmIw3awYG6lq4WYAw2iM6na2R4YfkKbGFCn58yyqQCm46nyLFfTJg4H1MicEON0uyUmHhlSCx8Os19cOh5bg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/052e0a42-2ad7-4961-b9c6-070b36094299', '748eeb31-76f8-43e9-9121-4c1d99166e87', '5MEG1uQTL7+WwbBdwtOwOQXyT4v9Cy6A7o1Uj5s3EbkXfc4IYBRYC1ZlMFhhXUE7AKn7toH6+c7e1jTz1XyIdjn7YneKpsZ/YM/fDM76/mDfMuW2rmp9wOVxD2VuS3nILXBnWA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'RgxvjCm5Dsy4glfbe4AM7uIUA1QW/ddzDPXrsFpLk43C+wJfqTynOZHsXKuePaUyxgZnFZkraBb1JawVF9nnbe8Lf+Dk0AcU59JWsctomdRjBz48VsvHXDwUuzd7lC5e5UJdQg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'I/WbTEiTJa+e465vUSfDKJkejwqZoVh6rCFjGK+qstcgN4Jq3Kya4ubjThNH0W0Mex9+qH2LBA+nM70bPkI6NaEYD/ALHmD/5Cz6IQ+qVALgvPOZxdQmiYKtnyL3aeAhPIODhQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/kollam-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'nC4rMsJVudG6kBMQFX1aEQM4FrYV5tTknJGu21AxeVnZF/ABXVjjo0OojPEpO7GXjrxx5GHbWx89bZEZfZ3vxXh0s4EkLnrY+ivrxH7jozkfEbwputU1nRoixCNoor8d6/CHDw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/052e0a42-2ad7-4961-b9c6-070b36094299', '9f108498-4dd5-4a21-b810-eec9e538953c', 'IWe07ljWsuLFEcH1jhsG2a4QEwLAuzBipmgGBkFvAhv7AwQeQg1jwZR9sbk8ajl2Mzf316G9VAAIa8TiU0NqMR96O71i+6bXvi8sOJ2qSwXivwrD5GySke++2cBhdQBLQ8qFBw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch8', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'kMuFa7hb2p9FEOimfAZyKXtxDOipnWud6PsNGzRJwi3AAnfeBYCmMAEPzm2xXTarEZDucatbuMUaGcqTHy6+QFVQ1TM5X2q+566phb8mNnDgEU+YY3uVQdg22ChjobMoBtv8Ew==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch8#sub', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'CAmZbqRqzQ1V2Hbz2NuQhoBa52bg2JEqBNget0jz3RDaXGixc2shPy5js3MoZV8zHzKCwUEQsxASgy/dFib8Avf2WdE/PgIVp6bdHKPHSnzX8VFhyJV9Z9aHBM5CsTkMeWKmkg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/kollam-ch8#main', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'ELXq0uNu+E7yhJ22TAHECUq6iRTNMU2HUR+BcpTaVKokQaK1Y7f9MBcrceBmtDSAHdyOpQuF7oO1bdpynYKTzgiB1Lxmc6Uo2yUEEkQBKZ9yuEghL7JPgrPBWTrZ50RReOoBPQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://2b4fe162-6c1a-413e-9596-1eac2e1bcf88/052e0a42-2ad7-4961-b9c6-070b36094299', '2b4fe162-6c1a-413e-9596-1eac2e1bcf88', 'hAAqsCzjmxEHr+KD5ucTNQnenhyxyGMNLdwYJfJvNSo/tWXo96LoNWMTkBxlD1/wvCiZk0VqOnHoINIaDHqfMBDjJkkQeWyphPI3WU6+ncdIpOSIv3umgWxpy8vvMePtQ1tUXQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 1',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = 'a7424e2e-d7e9-4a28-9977-9c1bcb4d0488';


UPDATE device_identities
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch1',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'c77af473-31e3-4193-834a-1110dc2d4a0c';


UPDATE cameras
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    recorder_channel = 1,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch1',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'b7a24b40-013d-40c9-bd46-823cbcf6e326';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'b7a24b40-013d-40c9-bd46-823cbcf6e326',
  now(), now(), 'rtsp', 'verified', 'kollam-online-b7a24b40-013d-40c9-bd46-823cbcf6e326',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'b7a24b40-013d-40c9-bd46-823cbcf6e326',
  now(), now(), 'rtsp', 'verified', 'kollam-online-b7a24b40-013d-40c9-bd46-823cbcf6e326-1791970242544',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 2',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '0c85e2ef-bf0b-4b42-943f-2ded62fda091';


UPDATE device_identities
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch2',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'dcbb3522-a0fa-418c-b77c-b91030a9cc93';


UPDATE cameras
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    recorder_channel = 2,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch2',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53',
  now(), now(), 'rtsp', 'verified', 'kollam-online-c7ef14ba-67eb-4d15-a173-9c56d51bbb53',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53',
  now(), now(), 'rtsp', 'verified', 'kollam-online-c7ef14ba-67eb-4d15-a173-9c56d51bbb53-1791970242545',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 3',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '7af59f91-5fd6-4fa0-9fcb-5f5b79f98872';


UPDATE device_identities
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch3',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '6933b508-1766-43c4-a395-014699fac166';


UPDATE cameras
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    recorder_channel = 3,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch3',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'da907692-01fd-4bf4-b305-f7259c05c887';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'da907692-01fd-4bf4-b305-f7259c05c887',
  now(), now(), 'rtsp', 'verified', 'kollam-online-da907692-01fd-4bf4-b305-f7259c05c887',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'da907692-01fd-4bf4-b305-f7259c05c887',
  now(), now(), 'rtsp', 'verified', 'kollam-online-da907692-01fd-4bf4-b305-f7259c05c887-1791970242545',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 4',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '3cf62a1f-1558-44cc-b9d7-93835f97f213';


UPDATE device_identities
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch4',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'd8e56908-1913-422d-9947-31a960096bc7';


UPDATE cameras
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    recorder_channel = 4,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch4',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '3da93c6e-6824-43dc-9bba-7332707d5856';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', '3da93c6e-6824-43dc-9bba-7332707d5856',
  now(), now(), 'rtsp', 'verified', 'kollam-online-3da93c6e-6824-43dc-9bba-7332707d5856',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', '3da93c6e-6824-43dc-9bba-7332707d5856',
  now(), now(), 'rtsp', 'verified', 'kollam-online-3da93c6e-6824-43dc-9bba-7332707d5856-1791970242545',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 5',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '87e5d259-96d9-4efa-87a5-6828fb8cc271';


UPDATE device_identities
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch5',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'c8da8d72-34bb-4abc-8f5c-029615dfed11';


UPDATE cameras
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    recorder_channel = 5,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch5',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2',
  now(), now(), 'rtsp', 'verified', 'kollam-online-cf27a4e8-23e4-4c4a-8e57-b49eef8302b2',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2',
  now(), now(), 'rtsp', 'verified', 'kollam-online-cf27a4e8-23e4-4c4a-8e57-b49eef8302b2-1791970242545',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 6',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '7a4787fc-ebd5-466c-a588-e20ef7b96a47';


UPDATE device_identities
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch6',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '7bf9d9c5-9140-4c96-9ea9-0fe2c460092a';


UPDATE cameras
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    recorder_channel = 6,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch6',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'c365a8e7-68a8-44bb-a63f-aae73dca7526';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'c365a8e7-68a8-44bb-a63f-aae73dca7526',
  now(), now(), 'rtsp', 'verified', 'kollam-online-c365a8e7-68a8-44bb-a63f-aae73dca7526',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'c365a8e7-68a8-44bb-a63f-aae73dca7526',
  now(), now(), 'rtsp', 'verified', 'kollam-online-c365a8e7-68a8-44bb-a63f-aae73dca7526-1791970242545',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 7',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = 'dd415479-6fe2-49ed-9673-056741637411';


UPDATE device_identities
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch7',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '82e3f62d-6317-4929-9b95-829ce27f4740';


UPDATE cameras
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    recorder_channel = 7,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch7',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '99455d3a-3411-43ad-b756-84a4ae17c026';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', '99455d3a-3411-43ad-b756-84a4ae17c026',
  now(), now(), 'rtsp', 'verified', 'kollam-online-99455d3a-3411-43ad-b756-84a4ae17c026',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', '99455d3a-3411-43ad-b756-84a4ae17c026',
  now(), now(), 'rtsp', 'verified', 'kollam-online-99455d3a-3411-43ad-b756-84a4ae17c026-1791970242545',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 8',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = 'eb0b3c48-4033-40d7-a1e1-2c4a7f1c5dc5';


UPDATE device_identities
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch8',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '3838fa28-6e1e-44d2-a15c-47911f765265';


UPDATE cameras
SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    recorder_channel = 8,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch8',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d',
  now(), now(), 'rtsp', 'verified', 'kollam-online-fb465a8f-5d79-4a3f-9cb8-b8cec471708d',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'camera', 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d',
  now(), now(), 'rtsp', 'verified', 'kollam-online-fb465a8f-5d79-4a3f-9cb8-b8cec471708d-1791970242545',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


-- Recorder health
UPDATE operational_health_latest
SET metrics = jsonb_build_object(
      'status', 'online',
      'recordingActive', true,
      'channelsOnline', 8,
      'totalChannels', 8,
      'storageHealthy', true,
      'responseTimeMs', 85
    ),
    quality = 'verified',
    reason_codes = '{}',
    observed_at = now(),
    received_at = now(),
    edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b'
WHERE branch_id = '525198ad-504d-48af-ac6c-dca057d38ed5' AND device_type = 'recorder';

-- Recorder channels 0 to 7
UPDATE operational_health_latest
SET metrics = jsonb_build_object(
      'status', 'recording',
      'recordingActive', true,
      'streamActive', true,
      'fps', 15.0
    ),
    quality = 'verified',
    reason_codes = '{}',
    observed_at = now(),
    received_at = now(),
    edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b'
WHERE branch_id = '525198ad-504d-48af-ac6c-dca057d38ed5' AND device_type = 'recorder-channel';

-- Network / Internet primary
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '128f918d-3943-4049-af05-36857b66d41b', 'network', '525198ad-504d-48af-ac6c-dca057d38ed5:internet:primary',
  now(), now(), 'agent', 'verified', 'kollam-net-health',
  '{"status":"healthy","latencyMs":18,"packetLossPercent":0,"jitterMs":2}'::jsonb,
  '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}';

COMMIT;
