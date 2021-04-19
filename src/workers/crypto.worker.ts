import { Cipher } from '../models/domain/cipher';
import { CipherView } from '../models/view/cipherView';

import { ContainerService } from '../services/container.service';
import { CryptoService } from '../services/crypto.service';
import { MemoryStorageService } from '../services/memoryStorage.service';
import { NodeCryptoFunctionService } from '../services/nodeCryptoFunction.service';
import { WorkerLogService } from '../services/workerLogService';

const workerApi: Worker = self as any;

workerApi.addEventListener('message', async event => {
    if (event.data.type !== 'decryptAllRequest') {
        return;
    }
    const decryptAllWorker = new CryptoWorker(event.data, workerApi);
    await decryptAllWorker.decryptAll();
});

class CryptoWorker {
    data: any;
    workerApi: Worker;
    encryptedCiphers: Cipher[];

    containerService: ContainerService;
    cryptoFunctionService: NodeCryptoFunctionService;
    cryptoService: CryptoService;
    logService: WorkerLogService;
    platformUtilsService: null;
    secureStorageService: MemoryStorageService;
    storageService: MemoryStorageService;

    constructor(data: any, worker: Worker) {
        this.data = data;
        this.workerApi = worker;
        this.startServices();
        this.listen();

        this.encryptedCiphers = JSON.parse(this.data.ciphers).map((c: any) => new Cipher(c));

        const storage = JSON.parse(data.storage);
        if (storage != null) {
            for (const prop in storage) {
                if (!storage.hasOwnProperty(prop)) {
                    continue;
                }
                this.storageService.save(prop, storage[prop]);
            }
        }

        const secureStorage = JSON.parse(data.secureStorage);
        if (secureStorage != null) {
            for (const prop in secureStorage) {
                if (!secureStorage.hasOwnProperty(prop)) {
                    continue;
                }
                this.secureStorageService.save(prop, secureStorage[prop]);
            }
        }
    }

    startServices() {
        this.cryptoFunctionService = new NodeCryptoFunctionService();
        this.logService = new WorkerLogService(false);
        this.platformUtilsService = null as any;
        this.secureStorageService = new MemoryStorageService();
        this.storageService = new MemoryStorageService();

        this.cryptoService = new CryptoService(this.storageService, this.secureStorageService, this.cryptoFunctionService,
            this.platformUtilsService, this.logService);

        this.containerService = new ContainerService(this.cryptoService);
        this.containerService.attachToGlobal(global);
    }

    async decryptAll() {
        const promises: any[] = [];
        const decryptedCiphers: CipherView[] = [];

        this.encryptedCiphers.forEach(cipher => {
            promises.push(cipher.decrypt().then(c => decryptedCiphers.push(c)));
        });
        await Promise.all(promises);

        const response = decryptedCiphers.map(c => JSON.stringify(c));

        this.postMessage({ type: 'decryptAllResponse', ciphers: response });
    }

    postMessage(message: any) {
        workerApi.postMessage(message);
    }

    async clearCache() {
        await Promise.all([
            this.cryptoService.clearKey(),
            this.cryptoService.clearOrgKeys(false),
            this.cryptoService.clearKeyPair(false),
            this.cryptoService.clearEncKey(false),
        ]);
    }

    listen() {
        workerApi.addEventListener('message', async event => {
            switch (event.data?.type) {
                case 'clearCacheRequest':
                    await this.clearCache();
                    this.postMessage({ type: 'clearCacheResponse' });
                    break;
                default:
                    break;
            }
        });
    }
}