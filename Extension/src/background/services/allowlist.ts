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
import browser from 'webextension-polyfill';

import { log } from '../../common/log';
import {
    MessageType,
    SaveAllowlistDomainsMessage,
    AddAllowlistDomainPopupMessage,
    RemoveAllowlistDomainMessage,
} from '../../common/messages';
import { messageHandler } from '../message-handler';
import { Engine } from '../engine';
import { SettingOption } from '../schema';
import { AllowlistApi, TabsApi } from '../api';
import { ContextMenuAction, contextMenuEvents, settingsEvents } from '../events';

/**
 * Service for processing events with a allowlist
 */
export class AllowlistService {
    /**
     * Initialize handlers
     */
    public static async init() {
        messageHandler.addListener(MessageType.GetAllowlistDomains, AllowlistService.onGetAllowlistDomains);
        messageHandler.addListener(MessageType.SaveAllowlistDomains, AllowlistService.handleDomainsSave);
        messageHandler.addListener(MessageType.AddAllowlistDomainPopup, AllowlistService.onAddAllowlistDomain);
        messageHandler.addListener(MessageType.RemoveAllowlistDomain, AllowlistService.onRemoveAllowlistDomain);

        settingsEvents.addListener(
            SettingOption.AllowlistEnabled,
            AllowlistService.onEnableStateChange,
        );

        settingsEvents.addListener(
            SettingOption.DefaultAllowlistMode,
            AllowlistService.onAllowlistModeChange,
        );

        contextMenuEvents.addListener(
            ContextMenuAction.SiteFilteringOn,
            AllowlistService.enableSiteFilteringFromContextMenu,
        );

        contextMenuEvents.addListener(
            ContextMenuAction.SiteFilteringOff,
            AllowlistService.disableSiteFilteringFromContextMenu,
        );
    }

    /**
     * Gets domains depending on current allowlist mode
     */
    private static onGetAllowlistDomains() {
        const domains = AllowlistApi.isInverted()
            ? AllowlistApi.getInvertedAllowlistDomains()
            : AllowlistApi.getAllowlistDomains();

        const content = domains.join('\n');

        return { content, appVersion: browser.runtime.getManifest().version };
    }

    private static async onAddAllowlistDomain(message: AddAllowlistDomainPopupMessage) {
        const { tabId } = message.data;

        await AllowlistApi.addTabUrlToAllowlist(tabId);
    }

    private static async onRemoveAllowlistDomain(message: RemoveAllowlistDomainMessage) {
        const { tabId } = message.data;

        await AllowlistApi.removeTabUrlFromAllowlist(tabId);
    }

    /**
     * Stores domains depending on current allowlist mode
     */
    private static async handleDomainsSave(message: SaveAllowlistDomainsMessage) {
        const { value } = message.data;

        const domains = value.split(/[\r\n]+/);

        if (AllowlistApi.isInverted()) {
            AllowlistApi.setInvertedAllowlistDomains(domains);
        } else {
            AllowlistApi.setAllowlistDomains(domains);
        }

        await Engine.update();
    }

    private static async enableSiteFilteringFromContextMenu() {
        const activeTab = await TabsApi.getActive();

        if (activeTab?.id) {
            await AllowlistApi.removeTabUrlFromAllowlist(activeTab.id);
        } else {
            log.warn('Can`t open site report page for active tab');
        }
    }

    private static async disableSiteFilteringFromContextMenu() {
        const activeTab = await TabsApi.getActive();

        if (activeTab?.id) {
            await AllowlistApi.addTabUrlToAllowlist(activeTab.id);
        } else {
            log.warn('Can`t open site report page for active tab');
        }
    }

    /**
     * Triggers engine update on enabling
     */
    static async onEnableStateChange() {
        await Engine.update();
    }

    /**
     * Triggers engine update on mode switch
     */
    static async onAllowlistModeChange() {
        await Engine.update();
    }
}
