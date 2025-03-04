export const HIVE_NODES = [
    'https://api.deathwing.me',
    'https://api.hive.blog',
    'https://api.openhive.network',
    'https://rpc.ecency.com',
    'https://api.hivekings.com'
];

let currentNodeIndex = 0;

export function getCurrentNode() {
    return HIVE_NODES[currentNodeIndex];
}

export async function switchToNextNode() {
    currentNodeIndex = (currentNodeIndex + 1) % HIVE_NODES.length;
    const node = getCurrentNode();
    hive.api.setOptions({ url: node });
    return node;
}

export async function testNodeConnection(node) {
    try {
        hive.api.setOptions({ url: node });
        await new Promise((resolve, reject) => {
            hive.api.getDynamicGlobalProperties(function(err, result) {
                if (err) reject(err);
                else resolve(result);
            });
        });
        return true;
    } catch (error) {
        console.warn(`Node ${node} failed:`, error);
        return false;
    }
}

export async function findWorkingNode() {
    for (let i = 0; i < HIVE_NODES.length; i++) {
        const node = getCurrentNode();
        console.log(`Trying node: ${node}`);
        
        if (await testNodeConnection(node)) {
            console.log(`Successfully connected to ${node}`);
            return true;
        }
        
        await switchToNextNode();
    }
    return false;
}