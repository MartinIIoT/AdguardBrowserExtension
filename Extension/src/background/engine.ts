/**
 * @file
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adguard Browser Extension. If not, see <http://www.gnu.org/licenses/>.
 */
import { TsWebExtension, ConfigurationMV2, MESSAGE_HANDLER_NAME } from '@adguard/tswebextension';
import { log } from '../common/log';
import { listeners } from './notifier';

import { FiltersStorage } from './storages';

import {
    FiltersApi,
    AllowlistApi,
    UserRulesApi,
    SettingsApi,
    DocumentBlockApi,
} from './api';

export type { Message as EngineMessage } from '@adguard/tswebextension';

export class Engine {
    static api = new TsWebExtension('web-accessible-resources');

    static messageHandlerName = MESSAGE_HANDLER_NAME;

    static handleMessage = Engine.api.getMessageHandler();

    static async start(): Promise<void> {
        const configuration = await Engine.getConfiguration();

        log.info('Start tswebextension...');
        await Engine.api.start(configuration);

        const rulesCount = Engine.api.getRulesCount();
        log.info(`tswebextension is started. Rules count: ${rulesCount}`);
        listeners.notifyListeners(listeners.RequestFilterUpdated, {
            rulesCount,
        });
    }

    static async update(): Promise<void> {
        const configuration = await Engine.getConfiguration();

        log.info('Update tswebextension configuration...');
        await Engine.api.configure(configuration);

        const rulesCount = Engine.api.getRulesCount();
        log.info(`tswebextension configuration is updated. Rules count: ${rulesCount}`);
        listeners.notifyListeners(listeners.RequestFilterUpdated, {
            rulesCount,
        });
    }

    /**
     * Creates tswebextension configuration based on current app state
     */
    private static async getConfiguration(): Promise<ConfigurationMV2> {
        const enabledFilters = FiltersApi.getEnabledFilters();

        const filters: ConfigurationMV2['filters'] = [];

        const tasks = enabledFilters.map(async (filterId) => {
            const rules = await FiltersStorage.get(filterId);

            const trusted = FiltersApi.isFilterTrusted(filterId);

            const rulesTexts = rules.join('\n');

            filters.push({
                filterId,
                content: rulesTexts,
                trusted,
            });
        });

        await Promise.all(tasks);

        const settings = SettingsApi.getTsWebExtConfiguration();

        let allowlist: string[] = [];

        if (AllowlistApi.isEnabled()) {
            if (settings.allowlistInverted) {
                allowlist = AllowlistApi.getInvertedAllowlistDomains();
            } else {
                allowlist = AllowlistApi.getAllowlistDomains();
            }
        }

        let userrules: string[] = [];

        if (UserRulesApi.isEnabled()) {
            userrules = await UserRulesApi.getUserRules();

            /**
             * remove empty strings
             */
            userrules = userrules.filter(rule => !!rule);

            /**
             * remove duplicates
             */
            userrules = Array.from(new Set(userrules));

            /**
             * Convert user rules
             */
            userrules = UserRulesApi.convertRules(userrules);
        }

        const trustedDomains = await DocumentBlockApi.getTrustedDomains();

        return {
            verbose: false,
            filters,
            userrules,
            allowlist,
            settings,
            trustedDomains,
        };
    }
}
