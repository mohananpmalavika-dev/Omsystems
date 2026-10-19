
BEGIN;
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'w9Qywjk90lq4+tnd9denFdNozPUDyL9ZqGAKPM8/awAKfsMiqGq9vDqDNUN0UzdSGRdJjOOmQ4xgXLdoUXpXgi5tyM6l0BYWTDm9ErTUlwGIMq5XVbmfXc271JKWOiSnRySriA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '/3UNxUR/fJ+0kCP12HKDlPvv5Hb/t75fWuTQJi0hK0cPmUdLnMB3dguyjQJFllCEuGIrxyMaKRtRuMdBYK8iB9Rv3er/hOwnyhwoF+kWfqLgWSVrj8089UGyP4Mb29w/nfD/GQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'aJNdljbPG6SBoO5Vn5OfjBXCvmMAW2b7Vj3NxlLXyzXDgEqaBb3O8iHOi6kyCtrMyh0m5fGGT6VgNULhWUfs4V3TezGjwg7Byt2PJXZVD1aD7LkbWzQHhMy02v+aCe8S8O0sJQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
COMMIT;
