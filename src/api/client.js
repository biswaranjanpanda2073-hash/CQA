/**
 * src/api/client.js
 * Centralized REST & WebSocket API client for CQA MES.
 * Connects to Kotlin Spring Boot backend (port 8080) with JWT authentication.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('cqa_jwt_token') || null;
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('cqa_jwt_token', token);
        } else {
            localStorage.removeItem('cqa_jwt_token');
        }
    }

    getToken() {
        return this.token;
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const config = {
            ...options,
            headers
        };

        const res = await fetch(url, config);

        if (!res.ok) {
            let errorMsg = `Request failed: ${res.status} ${res.statusText}`;
            try {
                const errJson = await res.json();
                errorMsg = errJson.message || errJson.error || errorMsg;
            } catch (e) {
                // Ignore parse errors
            }
            const err = new Error(errorMsg);
            err.status = res.status;
            throw err;
        }

        return res.json();
    }

    // --- Authentication ---
    async login(username, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    async getMe() {
        return this.request('/auth/me');
    }

    logout() {
        this.setToken(null);
    }

    // --- Bootstrap (Initial Snapshot for Fast Load) ---
    async getBootstrapData() {
        return this.request('/bootstrap');
    }

    // --- Station & MES ---
    async processStation(payload) {
        return this.request('/station/process', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async unholdSerial(serialNumber, reason) {
        return this.request(`/station/unhold?serialNumber=${encodeURIComponent(serialNumber)}&reason=${encodeURIComponent(reason)}`, {
            method: 'POST'
        });
    }

    async getDevice(serialNumber) {
        return this.request(`/station/devices/${encodeURIComponent(serialNumber)}`);
    }

    // --- BAAN Inventory ---
    async getParts() {
        return this.request('/baan/parts');
    }

    async getBatches() {
        return this.request('/baan/batches');
    }

    async getMovements() {
        return this.request('/baan/movements');
    }

    async commitOpeningStockChunk(chunkPayload) {
        return this.request('/baan/opening-stock/chunk', {
            method: 'POST',
            body: JSON.stringify(chunkPayload)
        });
    }

    async getDiscrepancies() {
        return this.request('/baan/discrepancies');
    }

    // --- Centralized BOM ---
    async getBomHeaders() {
        return this.request('/bom/headers');
    }

    async getBomRevisions(variantId) {
        const endpoint = variantId ? `/bom/revisions?variantId=${encodeURIComponent(variantId)}` : '/bom/revisions';
        return this.request(endpoint);
    }

    async getRevisionItems(revisionId) {
        return this.request(`/bom/revisions/${encodeURIComponent(revisionId)}/items`);
    }
}

export const api = new ApiClient();
export default api;
