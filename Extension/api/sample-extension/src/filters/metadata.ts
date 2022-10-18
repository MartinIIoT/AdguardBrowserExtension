import { Network } from '../network';
import { Storage } from '../storage';

import { log } from '../../../../src/common/log';
import { Metadata, CommonFilterMetadata } from '../../../../src/background/storages/metadata';

export class MetadataApi {
    private metadata: Metadata;

    private network: Network;

    private storage: Storage;

    constructor(
        network: Network,
        storage: Storage,
    ) {
        this.storage = storage;
        this.network = network;
    }

    public async init(): Promise<void> {
        const storageData = await this.storage.get('metadata');

        if (typeof storageData !== 'string') {
            await this.loadMetadata();
            return;
        }

        try {
            this.metadata = JSON.parse(storageData);
        } catch (e) {
            log.warn('Can`t parse data from metadata storage, load it from backend');
            await this.loadMetadata();
        }
    }

    public async loadMetadata(): Promise<void> {
        const metadata = await this.network.downloadFiltersMetadata();
        await this.storage.set('metadata', JSON.stringify(metadata));
        this.metadata = metadata;
    }

    public getFilterMetadata(filterId: number): CommonFilterMetadata | undefined {
        return this.metadata.filters.find(el => el.filterId === filterId);
    }
}
