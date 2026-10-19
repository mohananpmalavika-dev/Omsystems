
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES 
  ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'XgfxaqrIcAqCbZRMVVnjuMMRoiXQ2rKycaB0QcY60lxYw4z8k/8T3M1JApVuS0RXfKGjqH+JKlbwP07MLByYEjdxwDFY1mSzue+Xf/eSende+RFb/BOAWy3EuLOv2uI/es0CDQ==', now()),
  ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'pw8uToZ7F5nDAlYQRlD2Hk/tymw2jvDP9K538pcQnVWMo3KCIfQI2RYYkJ1jsceRDnuviljeai056bJMpdfk+BmdLQbLYim9+F3bETq8KyRcn/dECS5AtZ190YKyIUhNNRTAaQ==', now()),
  ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', '4o0urekJkMD/6be+uPc5IGLQm+fmVbKpTlILy9VBmQW7YY73AzG7U3mTXPUU7TjNKhwkOE6sBEg6QYCZ7wyNFNMogMMOd7jpbo9Rp6nRiQ+3DP95AI91xPyO0ZIg89RKmorDPQ==', now())
ON CONFLICT (reference) DO UPDATE 
SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2',
    ip_address = '172.29.55.100',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 2
WHERE id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';
