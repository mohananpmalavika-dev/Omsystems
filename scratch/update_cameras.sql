UPDATE cameras SET recorder_channel = channel, recorder_id = 'recorder-192.168.29.171' WHERE host(ip_address) = '192.168.29.171';
SELECT c.id, cn.name, c.channel, c.recorder_channel, c.recorder_id FROM cameras c JOIN resource_nodes cn ON cn.id = c.resource_node_id ORDER BY cn.name;
