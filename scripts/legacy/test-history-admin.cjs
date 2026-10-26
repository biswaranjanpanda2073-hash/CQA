const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function testHistory() {
    const q = db.collection('devices').where('project', 'in', ['Device', 'Refurbishment']).limit(50);
    const snap = await q.get();
    const passFailByKey = {};
    for (const docSnap of snap.docs) {
        const histSnap = await docSnap.ref.collection('history').get();
        const history = histSnap.docs.map(h => h.data());
        
        history.forEach(h => {
            const sKey = (h.station || '').trim().toUpperCase();
            if (!sKey) return;
            const r = (h.result || '').toUpperCase();
            if (!passFailByKey[sKey]) passFailByKey[sKey] = { pass: 0, fail: 0 };
            if (r === 'PASS' || r === 'COMPLETED') passFailByKey[sKey].pass++;
            else if (r === 'FAIL' || r === 'SCRAP' || r === 'REJECTED') passFailByKey[sKey].fail++;
        });
    }
    console.log("passFailByKey from history:", passFailByKey);
}
testHistory();
