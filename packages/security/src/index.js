"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCanonicalSecurityServices = createCanonicalSecurityServices;
var index_js_1 = require("../../identity/src/index.js");
var index_js_2 = require("../../authorization/src/index.js");
var index_js_3 = require("../../crypto/src/index.js");
var index_js_4 = require("../../observability/src/index.js");
function createCanonicalSecurityServices() {
    return {
        identity: (0, index_js_1.createIdentityService)(),
        authorization: (0, index_js_2.createAuthorizationService)(),
        crypto: (0, index_js_3.createCryptoService)(),
        observability: (0, index_js_4.createObservabilityService)()
    };
}
