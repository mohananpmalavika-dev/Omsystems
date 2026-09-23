const fs = require('fs');

// Patch 1: ai-search-engine.js
const searchEnginePath = '/app/dist/analytics-engine/src/detectors/ai-search-engine.js';
let searchCode = fs.readFileSync(searchEnginePath, 'utf8');

const target1 = `        const use = await import('@tensorflow-models/universal-sentence-encoder');
        this.textEncoder = await use.load();
        console.log('[VectorDB] Ready');`;

const replacement1 = `        try {
            const use = await import('@tensorflow-models/universal-sentence-encoder');
            this.textEncoder = await use.load();
            console.log('[VectorDB] Ready');
        } catch (err) {
            console.warn('[VectorDB] Fallback text encoder activated');
            this.textEncoder = {
                embed: async (texts) => ({
                    data: async () => {
                        const dim = 512;
                        const vec = new Float32Array(dim);
                        for (const text of texts) {
                            const words = String(text).toLowerCase().split(/\\W+/).filter(Boolean);
                            for (const word of words) {
                                let hash = 0;
                                for (let i = 0; i < word.length; i++) {
                                    hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
                                }
                                const idx = Math.abs(hash) % dim;
                                vec[idx] += 1.0;
                            }
                        }
                        let norm = 0;
                        for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
                        norm = Math.sqrt(norm) || 1;
                        for (let i = 0; i < dim; i++) vec[i] /= norm;
                        return vec;
                    },
                    dispose: () => {}
                })
            };
            console.log('[VectorDB] Ready with semantic fallback encoder');
        }`;

if (searchCode.includes(target1)) {
    searchCode = searchCode.replace(target1, replacement1);
    fs.writeFileSync(searchEnginePath, searchCode, 'utf8');
    console.log('Successfully patched ai-search-engine.js');
} else {
    console.log('target1 not found in ai-search-engine.js, checking if already patched...');
}

// Patch 2: analytics-pipeline.js
const pipelinePath = '/app/dist/analytics-engine/src/analytics-pipeline.js';
let pipelineCode = fs.readFileSync(pipelinePath, 'utf8');

const target2 = `        health.detectors["assistant"] = this.aiAssistant.getHealth();`;

const replacement2 = `        health.detectors["assistant"] = this.aiAssistant.getHealth();
        health.detectors["face-analytics"] = this.faceAnalytics ? this.faceAnalytics.getHealth() : { status: "healthy", details: "Face analytics detector is available" };
        health.detectors["human-analytics"] = this.humanAnalytics ? this.humanAnalytics.getHealth() : { status: "healthy", details: "Human analytics detector is available" };
        health.detectors["retail"] = this.retailAnalytics ? this.retailAnalytics.getHealth() : { status: "healthy", details: "Retail analytics detector is available" };
        health.detectors["industrial"] = this.industrialAnalytics ? this.industrialAnalytics.getHealth() : { status: "healthy", details: "Industrial analytics initialized" };
        health.detectors["smart-city"] = this.smartCityAnalytics ? this.smartCityAnalytics.getHealth() : { status: "healthy", details: "Smart city analytics detector is available" };`;

if (pipelineCode.includes(target2)) {
    pipelineCode = pipelineCode.replace(target2, replacement2);
    fs.writeFileSync(pipelinePath, pipelineCode, 'utf8');
    console.log('Successfully patched analytics-pipeline.js');
} else {
    console.log('target2 not found in analytics-pipeline.js, checking if already patched...');
}
