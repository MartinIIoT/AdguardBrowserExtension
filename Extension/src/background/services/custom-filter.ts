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
import browser, { WebNavigation } from 'webextension-polyfill';
import { RequestType } from '@adguard/tsurlfilter';
import { tabsApi } from '@adguard/tswebextension';
import {
    MessageType,
    LoadCustomFilterInfoMessage,
    SubscribeToCustomFilterMessage,
    RemoveAntiBannerFilterMessage,
} from '../../common/messages';
import { BACKGROUND_TAB_ID } from '../../common/constants';
import { CustomFilterApi } from '../api';
import { messageHandler } from '../message-handler';
import { Engine } from '../engine';

/**
 * Service for processing events with custom filters
 */
export class CustomFilterService {
    /**
     * Init handlers
     */
    static async init() {
        messageHandler.addListener(MessageType.LoadCustomFilterInfo, CustomFilterService.onCustomFilterInfoLoad);
        messageHandler.addListener(
            MessageType.SubscribeToCustomFilter,
            CustomFilterService.onCustomFilterSubscription,
        );
        messageHandler.addListener(MessageType.RemoveAntibannerFilter, CustomFilterService.onCustomFilterRemove);

        browser.webNavigation.onCommitted.addListener(CustomFilterService.injectSubscriptionScript);
    }

    /**
     * Get custom filter info for modal window
     */
    static async onCustomFilterInfoLoad(message: LoadCustomFilterInfoMessage) {
        const { url, title } = message.data;

        return CustomFilterApi.getFilterInfo(url, title);
    }

    /**
     * Add new custom filter
     */
    static async onCustomFilterSubscription(message: SubscribeToCustomFilterMessage) {
        const { filter } = message.data;

        const { customUrl, name, trusted } = filter;

        const filterMetadata = await CustomFilterApi.createFilter({
            customUrl,
            title: name,
            trusted,
            enabled: true,
        });

        await Engine.update();

        return filterMetadata;
    }

    /**
     * Remove custom filter
     */
    static async onCustomFilterRemove(message: RemoveAntiBannerFilterMessage) {
        const { filterId } = message.data;

        await CustomFilterApi.removeFilter(filterId);
    }

    /**
     * Inject custom filter subscription content script to tab
     */
    static injectSubscriptionScript(details: WebNavigation.OnCommittedDetailsType) {
        const { tabId, frameId } = details;

        if (tabId === BACKGROUND_TAB_ID) {
            return;
        }

        const frame = tabsApi.getTabFrame(tabId, frameId);

        if (!frame?.requestContext) {
            return;
        }

        const { requestContext } = frame;

        const { requestType } = requestContext;

        if (requestType !== RequestType.Document && requestType !== RequestType.Subdocument) {
            return;
        }

        try {
            browser.tabs.executeScript(tabId, {
                file: '/content-script/subscribe.js',
                runAt: 'document_start',
                frameId,
            });
        } catch (e) {
            // do nothing
        }
    }
}
