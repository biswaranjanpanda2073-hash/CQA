/**
 * functions/server.js
 * Standalone Express server for CQA MES Cloud Functions.
 * 
 * Runs the exact same 9 Cloud Functions on any free Node.js hosting platform
 * (Render, Vercel, Railway, Fly.io, or on-premise local server) without requiring
 * Firebase Blaze plan or Google Cloud billing.
 */

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id || 'cqa-mes'
            });
            console.log(`[Server] Initialized Firebase Admin from FIREBASE_SERVICE_ACCOUNT (project: ${serviceAccount.project_id})`);
        } catch (e) {
            console.error('[Server] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
            admin.initializeApp({ projectId: 'cqa-mes' });
        }
    } else {
        admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'cqa-mes' });
        console.log('[Server] Initialized Firebase Admin using default credentials');
    }
}

// Load exported functions from index.js
const functionsModule = require('./index.js');
const ALLOWED_FUNCTIONS = [
    'loginAndGetToken',
    'processCalculatorStation',
    'processScrapAnalysis',
    'unholdCalculatorSerial',
    'adminUpsertUser',
    'adminDeleteUser',
    'adminResetPassword',
    'changeOwnPassword',
    'purgeDevices'
];

const functionsMap = {};
for (const fnName of ALLOWED_FUNCTIONS) {
    if (functionsModule[fnName] && typeof functionsModule[fnName].run === 'function') {
        functionsMap[fnName] = functionsModule[fnName];
    }
}

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'cqa-mes-backend',
        functions: Object.keys(functionsMap),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Helper: map HttpsError codes to HTTP status
function getHttpStatus(code) {
    switch (code) {
        case 'ok': return 200;
        case 'cancelled': return 499;
        case 'unknown': return 500;
        case 'invalid-argument': return 400;
        case 'deadline-exceeded': return 504;
        case 'not-found': return 404;
        case 'already-exists': return 409;
        case 'permission-denied': return 403;
        case 'resource-exhausted': return 429;
        case 'failed-precondition': return 400;
        case 'aborted': return 409;
        case 'out-of-range': return 400;
        case 'unimplemented': return 501;
        case 'internal': return 500;
        case 'unavailable': return 503;
        case 'data-loss': return 500;
        case 'unauthenticated': return 401;
        default: return 500;
    }
}

// Universal dispatch handler
async function handleFunctionCall(fnName, req, res) {
    const fn = functionsMap[fnName];
    if (!fn) {
        return res.status(404).json({
            error: {
                message: `Function '${fnName}' not found on server.`,
                status: 'NOT_FOUND'
            }
        });
    }

    // Verify Bearer token if present
    let authData = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.substring(7).trim();
        if (idToken) {
            try {
                const decoded = await admin.auth().verifyIdToken(idToken);
                authData = { uid: decoded.uid, token: decoded };
            } catch (authErr) {
                console.warn(`[Server] Auth token verification failed for ${fnName}:`, authErr.message);
                return res.status(401).json({
                    error: {
                        message: 'Authentication token is invalid or expired. Please re-authenticate.',
                        status: 'UNAUTHENTICATED'
                    }
                });
            }
        }
    }

    try {
        const dataPayload = req.body?.data !== undefined ? req.body.data : req.body;
        const result = await fn.run({ data: dataPayload, auth: authData });
        return res.json({ data: result });
    } catch (err) {
        console.error(`[Server] Execution error in ${fnName}:`, err.message);
        const code = err.code || 'internal';
        const statusCode = getHttpStatus(code);
        return res.status(statusCode).json({
            error: {
                message: err.message || 'Internal server error occurred.',
                status: code.toUpperCase()
            }
        });
    }
}

// Routes to match all common calling patterns:
// 1. POST /api/:fnName (e.g. /api/loginAndGetToken)
// 2. POST /:fnName     (e.g. /loginAndGetToken)
// 3. POST /:project/:region/:fnName (emulating Firebase Cloud Functions path)
app.post('/api/:fnName', (req, res) => handleFunctionCall(req.params.fnName, req, res));
app.post('/:project/:region/:fnName', (req, res) => handleFunctionCall(req.params.fnName, req, res));
app.post('/:fnName', (req, res) => handleFunctionCall(req.params.fnName, req, res));

const PORT = process.env.PORT || 5001;
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[Server] CQA MES Functions API running on port ${PORT}`);
        console.log(`[Server] Available endpoints (${Object.keys(functionsMap).length}):`);
        Object.keys(functionsMap).forEach(name => console.log(`  POST /api/${name}`));
    });
}

module.exports = app;
