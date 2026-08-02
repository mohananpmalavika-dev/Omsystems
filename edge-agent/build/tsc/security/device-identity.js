import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export class DeviceIdentityStore {
    identityPath;
    keyPath;
    constructor(identityPath, keyPath) {
        this.identityPath = identityPath;
        this.keyPath = keyPath;
    }
    async load() {
        let raw;
        try {
            raw = await readFile(this.identityPath, "utf8");
        }
        catch (error) {
            if (error.code === "ENOENT")
                return undefined;
            throw error;
        }
        const envelope = JSON.parse(raw);
        if (envelope.version !== 1)
            throw new Error("unsupported_device_identity_version");
        const key = await this.readKey();
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
        decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
            decipher.final(),
        ]);
        return validateIdentity(JSON.parse(plaintext.toString("utf8")));
    }
    async save(identity) {
        const validated = validateIdentity(identity);
        const key = await this.loadOrCreateKey();
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify(validated), "utf8"),
            cipher.final(),
        ]);
        const envelope = {
            version: 1,
            iv: iv.toString("base64url"),
            tag: cipher.getAuthTag().toString("base64url"),
            ciphertext: ciphertext.toString("base64url"),
        };
        await mkdir(dirname(this.identityPath), { recursive: true });
        const temporary = `${this.identityPath}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600 });
        await rename(temporary, this.identityPath);
    }
    static newDeviceUuid() { return randomUUID(); }
    static newCommandKeyPair() {
        const { publicKey, privateKey } = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        return { publicKey, privateKey };
    }
    async readKey() {
        const key = Buffer.from((await readFile(this.keyPath, "utf8")).trim(), "base64url");
        if (key.length !== 32)
            throw new Error("invalid_device_identity_key");
        return key;
    }
    async loadOrCreateKey() {
        try {
            return await this.readKey();
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        const key = randomBytes(32);
        await mkdir(dirname(this.keyPath), { recursive: true });
        await writeFile(this.keyPath, key.toString("base64url"), { encoding: "utf8", mode: 0o600, flag: "wx" })
            .catch(async (error) => {
            if (error.code !== "EEXIST")
                throw error;
        });
        return this.readKey();
    }
}
function validateIdentity(value) {
    if (!value || typeof value !== "object")
        throw new Error("invalid_device_identity");
    const candidate = value;
    for (const key of ["deviceUuid", "agentId", "branchId", "credential", "enrolledAt"]) {
        if (typeof candidate[key] !== "string" || !candidate[key])
            throw new Error("invalid_device_identity");
    }
    return candidate;
}
