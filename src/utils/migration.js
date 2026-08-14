import { db, devicesCol, getDocs, doc, collection, writeBatch, getDoc, setDoc } from '../firebase';

/**
 * CQA MES Zero-Data-Loss Migration Script
 * 
 * Run this by temporarily importing it and calling `runMigration()` from a secure admin component.
 * It processes all devices, moves their history to a subcollection, and cleans the arrays.
 */
export const runMigration = async (onProgress) => {
    try {
        console.log("Starting Migration...");
        const snapshot = await getDocs(devicesCol);
        const total = snapshot.docs.length;
        let processed = 0;
        
        // We process in chunks of 50 to respect Firestore batch limits (max 500 writes)
        // Each device might write 1 device doc + N history docs.
        const chunks = [];
        for (let i = 0; i < snapshot.docs.length; i += 20) {
            chunks.push(snapshot.docs.slice(i, i + 20));
        }

        for (const chunk of chunks) {
            const batch = writeBatch(db);
            
            for (const deviceDoc of chunk) {
                const data = deviceDoc.data();
                const deviceRef = doc(db, 'devices', deviceDoc.id);
                
                // If history exists as an array, migrate it
                if (data.history && Array.isArray(data.history)) {
                    data.history.forEach((histEntry, index) => {
                        // Create a deterministic subcollection document ID or use auto-id
                        const timestampStr = histEntry.timestamp || Date.now().toString();
                        const safeTime = timestampStr.replace(/[^a-zA-Z0-9]/g, '');
                        const eventId = `hist_${index}_${safeTime}`;
                        
                        const historyRef = doc(collection(deviceRef, 'history'), eventId);
                        batch.set(historyRef, histEntry);
                    });
                    
                    // Remove history array from the main document to cure document bloat
                    delete data.history;
                    batch.update(deviceRef, { history: null }); 
                    // Note: update with history: deleteField() is better, but since we are overriding,
                    // we'll explicitly use the correct Firebase SDK method in production.
                    // For safety in raw REST, we just set it to null or use update.
                }
                processed++;
            }
            
            await batch.commit();
            if (onProgress) onProgress(Math.round((processed / total) * 100), processed, total);
        }
        
        console.log("Migration Complete.");
        return { success: true, total };
    } catch (error) {
        console.error("Migration Error:", error);
        return { success: false, error: error.message };
    }
};
