"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCryptoService = createCryptoService;
function createCryptoService() {
    return {
        hash: function (input) {
            return "hashed:".concat(input);
        },
        verify: function (input, hash) {
            return this.hash(input) === hash;
        }
    };
}
