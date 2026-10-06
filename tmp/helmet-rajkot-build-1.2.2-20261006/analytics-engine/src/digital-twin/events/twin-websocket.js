/**
 * Digital Twin WebSocket Manager
 *
 * Manages WebSocket connections for real-time digital twin updates.
 */
import { WebSocketServer, WebSocket } from 'ws';
/**
 * WebSocket manager for broadcasting digital twin updates
 */
export class TwinWebSocketManager {
    eventHandler;
    wss = null;
    clients = new Map();
    subscriptions = new Map(); // assetId -> Set<clientId>
    constructor(eventHandler) {
        this.eventHandler = eventHandler;
        this.setupEventListeners();
    }
    /**
     * Initialize WebSocket server
     */
    initialize(httpServer, path = '/ws/digital-twin') {
        this.wss = new WebSocketServer({
            server: httpServer,
            path
        });
        this.wss.on('connection', (socket, request) => {
            this.handleConnection(socket, request);
        });
        console.log(`[TwinWebSocket] WebSocket server initialized on ${path}`);
    }
    /**
     * Handle new WebSocket connection
     */
    handleConnection(socket, request) {
        const clientId = this.generateClientId();
        const client = {
            id: clientId,
            socket,
            subscriptions: new Set(),
            userId: this.extractUserId(request),
            tenantId: this.extractTenantId(request)
        };
        this.clients.set(clientId, client);
        console.log(`[TwinWebSocket] Client ${clientId} connected (total: ${this.clients.size})`);
        // Send welcome message
        this.sendToClient(client, {
            type: 'twin.updated',
            timestamp: new Date().toISOString(),
            data: {
                message: 'Connected to Digital Twin updates',
                clientId
            }
        });
        // Handle messages from client
        socket.on('message', (message) => {
            this.handleClientMessage(client, message);
        });
        // Handle disconnect
        socket.on('close', () => {
            this.handleDisconnect(client);
        });
        // Handle errors
        socket.on('error', (error) => {
            console.error(`[TwinWebSocket] Client ${clientId} error:`, error);
        });
    }
    /**
     * Handle message from client
     */
    handleClientMessage(client, message) {
        try {
            const data = JSON.parse(message.toString());
            switch (data.type) {
                case 'subscribe':
                    this.handleSubscribe(client, data.assetIds || []);
                    break;
                case 'unsubscribe':
                    this.handleUnsubscribe(client, data.assetIds || []);
                    break;
                case 'ping':
                    this.sendToClient(client, {
                        type: 'twin.updated',
                        timestamp: new Date().toISOString(),
                        data: { pong: true }
                    });
                    break;
                default:
                    console.warn(`[TwinWebSocket] Unknown message type: ${data.type}`);
            }
        }
        catch (error) {
            console.error('[TwinWebSocket] Error handling client message:', error);
        }
    }
    /**
     * Handle subscribe request
     */
    handleSubscribe(client, assetIds) {
        for (const assetId of assetIds) {
            client.subscriptions.add(assetId);
            if (!this.subscriptions.has(assetId)) {
                this.subscriptions.set(assetId, new Set());
            }
            this.subscriptions.get(assetId).add(client.id);
        }
        this.sendToClient(client, {
            type: 'twin.updated',
            timestamp: new Date().toISOString(),
            data: {
                subscribed: assetIds,
                totalSubscriptions: client.subscriptions.size
            }
        });
        console.log(`[TwinWebSocket] Client ${client.id} subscribed to ${assetIds.length} assets`);
    }
    /**
     * Handle unsubscribe request
     */
    handleUnsubscribe(client, assetIds) {
        for (const assetId of assetIds) {
            client.subscriptions.delete(assetId);
            const subscribers = this.subscriptions.get(assetId);
            if (subscribers) {
                subscribers.delete(client.id);
                if (subscribers.size === 0) {
                    this.subscriptions.delete(assetId);
                }
            }
        }
        this.sendToClient(client, {
            type: 'twin.updated',
            timestamp: new Date().toISOString(),
            data: {
                unsubscribed: assetIds,
                totalSubscriptions: client.subscriptions.size
            }
        });
    }
    /**
     * Handle client disconnect
     */
    handleDisconnect(client) {
        // Remove from subscriptions
        for (const assetId of client.subscriptions) {
            const subscribers = this.subscriptions.get(assetId);
            if (subscribers) {
                subscribers.delete(client.id);
                if (subscribers.size === 0) {
                    this.subscriptions.delete(assetId);
                }
            }
        }
        this.clients.delete(client.id);
        console.log(`[TwinWebSocket] Client ${client.id} disconnected (remaining: ${this.clients.size})`);
    }
    /**
     * Setup event listeners for twin updates
     */
    setupEventListeners() {
        this.eventHandler.on('twin.updated', (payload) => {
            this.broadcastUpdate({
                type: 'twin.updated',
                timestamp: new Date().toISOString(),
                data: payload
            });
        });
        this.eventHandler.on('twin.topology_changed', (data) => {
            this.broadcastToAll({
                type: 'twin.topology_changed',
                timestamp: new Date().toISOString(),
                data
            });
        });
        this.eventHandler.on('twin.blast_radius_calculated', (data) => {
            this.broadcastUpdate({
                type: 'twin.blast_radius',
                timestamp: new Date().toISOString(),
                data
            });
        });
    }
    /**
     * Broadcast update to subscribed clients
     */
    broadcastUpdate(message) {
        const assetId = message.data.assetId;
        if (!assetId) {
            return;
        }
        const subscribers = this.subscriptions.get(assetId);
        if (!subscribers || subscribers.size === 0) {
            return;
        }
        let sent = 0;
        for (const clientId of subscribers) {
            const client = this.clients.get(clientId);
            if (client && this.sendToClient(client, message)) {
                sent++;
            }
        }
        console.log(`[TwinWebSocket] Broadcast update for ${assetId} to ${sent} clients`);
    }
    /**
     * Broadcast to all connected clients
     */
    broadcastToAll(message) {
        let sent = 0;
        for (const client of this.clients.values()) {
            if (this.sendToClient(client, message)) {
                sent++;
            }
        }
        console.log(`[TwinWebSocket] Broadcast to all: ${sent}/${this.clients.size} clients`);
    }
    /**
     * Send message to specific client
     */
    sendToClient(client, message) {
        try {
            if (client.socket.readyState === WebSocket.OPEN) {
                client.socket.send(JSON.stringify(message));
                return true;
            }
            return false;
        }
        catch (error) {
            console.error(`[TwinWebSocket] Error sending to client ${client.id}:`, error);
            return false;
        }
    }
    /**
     * Broadcast topology update
     */
    broadcastTopologyUpdate(rootId, change) {
        this.broadcastToAll({
            type: 'twin.topology_changed',
            timestamp: new Date().toISOString(),
            data: {
                rootId,
                change
            }
        });
    }
    /**
     * Broadcast blast radius calculation
     */
    broadcastBlastRadius(assetId, blastRadius) {
        this.broadcastUpdate({
            type: 'twin.blast_radius',
            timestamp: new Date().toISOString(),
            data: {
                assetId,
                blastRadius
            }
        });
    }
    /**
     * Get statistics
     */
    getStats() {
        let totalSubscriptions = 0;
        for (const client of this.clients.values()) {
            totalSubscriptions += client.subscriptions.size;
        }
        return {
            connectedClients: this.clients.size,
            totalSubscriptions,
            uniqueAssets: this.subscriptions.size
        };
    }
    /**
     * Close all connections
     */
    close() {
        for (const client of this.clients.values()) {
            client.socket.close();
        }
        if (this.wss) {
            this.wss.close();
        }
        this.clients.clear();
        this.subscriptions.clear();
        console.log('[TwinWebSocket] WebSocket server closed');
    }
    /**
     * Generate unique client ID
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Extract user ID from request (implement based on your auth)
     */
    extractUserId(request) {
        // TODO: Extract from JWT token or session
        return request.headers['x-user-id'];
    }
    /**
     * Extract tenant ID from request (implement based on your auth)
     */
    extractTenantId(request) {
        // TODO: Extract from JWT token or session
        return request.headers['x-tenant-id'];
    }
}
