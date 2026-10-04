import base64,json,subprocess

script='''
sudo docker inspect sentinel-gcp-dashboard --format '{{json .Config.Labels}}'
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -P pager=off -c "SELECT state->'policy'->>'maxConcurrentStreams' AS live_limit FROM branch_protection_state WHERE branch_id='00000000-0000-4000-8000-000000000104'; SELECT rn.name,c.channel,jsonb_array_length(c.profiles) AS verified_profiles,c.status FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id WHERE c.edge_agent_id='aaeda07f-01ce-4361-afd3-a54e4ca114f3' ORDER BY rn.name;"
'''
encoded=base64.b64encode(script.encode()).decode()
remote='printf %s '+encoded+' | base64 -d | bash'
result=subprocess.run(['gcloud.cmd','compute','ssh','kryptovision-server','--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--command='+remote],capture_output=True,text=True)
print(result.stdout)
if result.returncode:print(result.stderr);raise SystemExit(result.returncode)
