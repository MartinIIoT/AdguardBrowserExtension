/**
 * Extension version (x.x.x)
 * @param version
 * @constructor
 */
export class Version {
    public data = {};

    constructor(version: string) {
        const parts = String(version || '').split('.');

        for (let i = 3; i >= 0; i -= 1) {
            this.data[i] = Version.parseVersionPart(parts[i]);
        }
    }

    public compare(version: Version) {
        for (let i = 0; i < 4; i += 1) {
            if (this.data[i] > version.data[i]) {
                return 1;
            } if (this.data[i] < version.data[i]) {
                return -1;
            }
        }
        return 0;
    }

    private static parseVersionPart(part: string) {
        if (Number.isNaN(part)) {
            return 0;
        }

        return Math.max(Number(part) - 0, 0);
    }
}