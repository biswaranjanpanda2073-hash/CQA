import { initializeApp } from 'firebase/app';
import { getFirestore, getDocs, collection, query, where } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: 'AIzaSyD53509zOsLXne2Hb9mEWjBEpvYyRl-VNw',
    authDomain: 'cqa-mes.firebaseapp.com',
    projectId: 'cqa-mes',
    storageBucket: 'cqa-mes.appspot.com',
    messagingSenderId: '500138644479',
    appId: '1:500138644479:web:1624bbe2d7459b27a6cdca'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const devicesCol = collection(db, 'devices');

const systemNames = {
  "projects": {
    "Inward QC": "Inward QC",
    "Peripherals": "Peripherals",
    "Device": "Refurbishment"
  },
  "stations": {}
};

function getDisplayName(type, id) {
    if (!id) return id;
    return systemNames[type]?.[id] || id;
}

function resolveActiveProject(unit) {
    if (!unit) return 'Device';
    const stName = (unit.stationName || '').toUpperCase().trim();
    if (['INSPECTION', 'DEBUG', 'REWORK', 'FINAL QC', 'PACKING', 'SCRAP REVIEW'].some(s => stName === s)) return 'Device';
    if (stName === 'IQC' || stName === 'INWARD QC') return 'Inward QC';
    if (stName === 'QC' || stName === 'PERIPHERALS QC') return 'Peripherals';
    if (stName === 'REJECTION REVIEW') return 'Peripherals';
    if (stName === 'REJECTION') return 'Inward QC';
    
    if (unit.project) return unit.project;
    const h = unit.history;
    if (!h || h.length === 0) return 'Device';
    for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].project) return h[i].project;
    }
    return 'Device';
}

async function fetchStationMetrics(project) {
    try {
        const projectDisp = getDisplayName('projects', project);
        
        // Ensure unique array to prevent any browser SDK errors with duplicate 'in' values
        const queryProjects = Array.from(new Set([project, projectDisp].filter(Boolean)));
        console.log(`[${project}] Querying devices with project in:`, queryProjects);
        
        const q = query(devicesCol, where('project', 'in', queryProjects));
        const snap = await getDocs(q); 
        console.log(`[${project}] Found ${snap.docs.length} total docs matching project filter.`);
        
        const wipUnits = snap.docs.map(d => d.data())
            .filter(u => {
                const validStatuses = ['Processing', 'In Progress', 'WIP', 'In-Progress', 'Processing...'];
                if (!validStatuses.includes(u.status)) return false;
                
                const activeP = resolveActiveProject(u);
                const isRefurb = project === 'Device' || project === 'Refurbishment' || projectDisp === 'Refurbishment';
                if (isRefurb && (activeP === 'Device' || activeP === 'Refurbishment')) return true;
                return activeP === project || activeP === projectDisp;
            });
            
        console.log(`[${project}] After filter, ${wipUnits.length} are actual WIP for this project.`);
            
        const wipCountPerStation = wipUnits.reduce((acc, u) => { 
            if (u.stationName) {
                const sKey = u.stationName.toUpperCase().trim();
                acc[sKey] = (acc[sKey] || 0) + 1; 
            }
            return acc; 
        }, {});
        
        console.log(`[${project}] Final Breakdown:`, wipCountPerStation);
        return { wipBreakdown: wipCountPerStation };
    } catch (error) {
        console.error(`[${project}] Error:`, error);
        return { wipBreakdown: {} };
    }
}

async function run() {
    await fetchStationMetrics('Device');
    await fetchStationMetrics('Peripherals');
    await fetchStationMetrics('Inward QC');
    process.exit(0);
}
run();
